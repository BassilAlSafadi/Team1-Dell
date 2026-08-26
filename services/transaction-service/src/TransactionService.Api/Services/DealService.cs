using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TransactionService.Api.Contracts;
using TransactionService.Api.Grpc;
using TransactionService.Api.Identity;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;
using TransactionService.Infrastructure.Caching;
using TransactionService.Infrastructure.Persistence;

namespace TransactionService.Api.Services;

public class DealService : IDealService
{
    private static readonly TimeSpan DealCacheTtl = TimeSpan.FromSeconds(30);

    // Typical flow: AGREED -> HANDOVER_PENDING -> COMPLETED, with CANCELLED/DISPUTED as
    // off-ramps. COMPLETED and CANCELLED are terminal.
    private const int MaxPageSize = 100;

    // Which party may drive which transition. Both parties can cancel or raise a dispute, but
    // COMPLETED is the buyer confirming they received the goods — a seller who could self-award
    // COMPLETED would be able to close a deal the buyer never accepted delivery on, and (once
    // escrow releases on completion) pay themselves out unilaterally.
    private static readonly Dictionary<DealStatus, DealParty> TransitionAuthority = new()
    {
        [DealStatus.HandoverPending] = DealParty.Either,
        [DealStatus.Completed] = DealParty.Buyer,
        [DealStatus.Cancelled] = DealParty.Either,
        [DealStatus.Disputed] = DealParty.Either,
    };

    private static readonly Dictionary<DealStatus, DealStatus[]> AllowedTransitions = new()
    {
        [DealStatus.Agreed] = [DealStatus.HandoverPending, DealStatus.Cancelled, DealStatus.Disputed],
        [DealStatus.HandoverPending] = [DealStatus.Completed, DealStatus.Cancelled, DealStatus.Disputed],
        [DealStatus.Disputed] = [DealStatus.Completed, DealStatus.Cancelled],
        [DealStatus.Completed] = [],
        [DealStatus.Cancelled] = []
    };

    private readonly TransactionDbContext _db;
    private readonly INotificationPublisher _notifications;
    private readonly IRedisCache _cache;
    private readonly IMarketplaceAccountResolver _accounts;
    private readonly IWalletService _wallets;

    public DealService(
        TransactionDbContext db,
        INotificationPublisher notifications,
        IRedisCache cache,
        IMarketplaceAccountResolver accounts,
        IWalletService wallets)
    {
        _db = db;
        _notifications = notifications;
        _cache = cache;
        _accounts = accounts;
        _wallets = wallets;
    }

    public async Task<DealResponse> GetAsync(Guid dealId, Guid actorUserId, CancellationToken ct)
    {
        // Authorize against the database row before consulting the cache: a cache hit must never
        // become a way to read a deal you aren't party to.
        var deal = await FindAsync(dealId, ct);
        await RequirePartyAsync(deal, actorUserId, ct);

        // Cache-aside with write-invalidation from TransitionAsync (a stale deal status gates
        // payment, so it can't be left to TTL expiry alone).
        var cacheKey = DealCacheKey(dealId);
        var cached = await _cache.GetStringAsync(cacheKey);
        if (cached is not null)
        {
            var cachedDeal = JsonSerializer.Deserialize<DealResponse>(cached);
            if (cachedDeal is not null)
            {
                return cachedDeal;
            }
        }

        var response = ToResponse(deal);

        await _cache.SetStringAsync(cacheKey, JsonSerializer.Serialize(response), DealCacheTtl);

        return response;
    }

    /// <summary>
    /// Replaces ListForPartyAsync(partyId), which took the account id straight from the URL and
    /// so returned any user's entire trading history to any caller. Scoped to the caller's own
    /// marketplace accounts and paged.
    /// </summary>
    public async Task<IReadOnlyList<DealResponse>> ListMineAsync(Guid actorUserId, int page, int pageSize, CancellationToken ct)
    {
        var caller = await RequireAccountsAsync(actorUserId, ct);
        var mine = caller.All().ToList();

        (page, pageSize) = Paging.Clamp(page, pageSize, MaxPageSize);

        var deals = await _db.Deals
            .Where(d => mine.Contains(d.BuyerId) || mine.Contains(d.SellerId))
            .OrderByDescending(d => d.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return deals.Select(ToResponse).ToList();
    }

    public async Task<IReadOnlyList<DealStatusHistoryResponse>> GetHistoryAsync(Guid dealId, Guid actorUserId, CancellationToken ct)
    {
        var deal = await FindAsync(dealId, ct);
        await RequirePartyAsync(deal, actorUserId, ct);

        var history = await _db.DealStatusHistories
            .Where(h => h.DealId == dealId)
            .OrderBy(h => h.ChangedAt)
            .ToListAsync(ct);

        return history.Select(ToResponse).ToList();
    }

    public async Task<DealResponse> TransitionAsync(Guid dealId, string newStatus, Guid actorUserId, string? reason, CancellationToken ct)
    {
        var deal = await FindAsync(dealId, ct);

        // The actor used to be recorded in the audit row and never checked, so any authenticated
        // user could cancel or complete any deal in the system.
        var caller = await RequirePartyAsync(deal, actorUserId, ct);
        Guid? changedBy = actorUserId;

        DealStatus current;
        DealStatus target;
        try
        {
            current = DealStatusExtensions.FromDbValue(deal.Status);
            target = DealStatusExtensions.FromDbValue(newStatus);
        }
        catch (ArgumentOutOfRangeException)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, $"'{newStatus}' is not a valid deal status.");
        }

        if (!AllowedTransitions.TryGetValue(current, out var allowed) || !allowed.Contains(target))
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, $"Cannot move a deal from {deal.Status} to {newStatus}.");
        }

        RequireTransitionAuthority(deal, target, caller);

        var now = DateTimeOffset.UtcNow;
        var previousStatus = deal.Status;
        deal.Status = target.ToDbValue();

        if (target == DealStatus.Completed)
        {
            deal.CompletedAt = now;
        }
        else if (target == DealStatus.Cancelled)
        {
            deal.CancelledAt = now;
        }

        _db.DealStatusHistories.Add(new DealStatusHistory
        {
            HistoryId = Guid.NewGuid(),
            DealId = deal.DealId,
            PreviousStatus = previousStatus,
            NewStatus = deal.Status,
            ChangedBy = changedBy,
            ChangedAt = now,
            Reason = reason
        });

        // The status change and its escrow settlement must be one atomic unit. Committing the
        // status first and settling afterwards would leave a deal marked COMPLETED with the
        // buyer's money still held if the payout failed.
        await using (var dbTransaction = await _db.Database.BeginTransactionAsync(ct))
        {
            await _db.SaveChangesAsync(ct);

            // Completing a deal releases the held funds to the seller; cancelling returns them to
            // the buyer. Both are no-ops when the deal was never paid, so an unpaid deal still
            // cancels cleanly. WalletService joins this transaction rather than opening its own.
            if (target == DealStatus.Completed)
            {
                await _wallets.ReleaseEscrowAsync(deal.DealId, ct);
            }
            else if (target == DealStatus.Cancelled)
            {
                await _wallets.RefundEscrowAsync(deal.DealId, ct);
            }

            await dbTransaction.CommitAsync(ct);
        }

        // Write-invalidation: GetAsync caches this deal under the same key, so a transition that
        // didn't evict it would keep serving the pre-transition status for up to DealCacheTtl.
        // A deal's status gates payment, so a stale read here is not the low-stakes staleness the
        // read-only lookups elsewhere tolerate.
        await _cache.DeleteAsync(DealCacheKey(dealId));

        // Real gRPC domain call (full-mesh plan, plans/pure-hugging-puzzle.md): notify both
        // parties of the status change via notification-service. buyer_id/seller_id are
        // Marketplace-service account ids, not auth-service user ids (see the existing comment
        // on OffersController) — this call fires correctly today, but until marketplace-service
        // exists to reconcile those ids with real auth-service accounts, the resulting
        // notification isn't reconcilable to a logged-in user. Never let a notification failure
        // fail the transition itself — GrpcNotificationPublisher already swallows gRPC errors.
        var notificationType = target == DealStatus.Completed ? "DEAL_COMPLETED" : "DEAL_STATUS_CHANGED";
        var title = "Deal status changed";
        var body = $"Deal moved to {deal.Status}.";
        await _notifications.PublishAsync(deal.BuyerId.ToString(), notificationType, title, body, changedBy?.ToString(), "deal", deal.DealId.ToString(), ct);
        await _notifications.PublishAsync(deal.SellerId.ToString(), notificationType, title, body, changedBy?.ToString(), "deal", deal.DealId.ToString(), ct);

        return ToResponse(deal);
    }

    private async Task<MarketplaceAccounts> RequireAccountsAsync(Guid actorUserId, CancellationToken ct)
    {
        var caller = await _accounts.ResolveAsync(actorUserId, ct);
        if (!caller.ControlsAny)
        {
            throw new TransactionDomainException(
                HttpStatusCode.Forbidden,
                "This account has no vendor or corporate profile, so it cannot trade.");
        }

        return caller;
    }

    private async Task<MarketplaceAccounts> RequirePartyAsync(Deal deal, Guid actorUserId, CancellationToken ct)
    {
        var caller = await RequireAccountsAsync(actorUserId, ct);
        if (!caller.Controls(deal.BuyerId) && !caller.Controls(deal.SellerId))
        {
            throw new TransactionDomainException(HttpStatusCode.Forbidden, "You are not a party to this deal.");
        }

        return caller;
    }

    private static void RequireTransitionAuthority(Deal deal, DealStatus target, MarketplaceAccounts caller)
    {
        if (!TransitionAuthority.TryGetValue(target, out var required) || required == DealParty.Either)
        {
            return;
        }

        var requiredAccountId = required == DealParty.Buyer ? deal.BuyerId : deal.SellerId;
        if (!caller.Controls(requiredAccountId))
        {
            var who = required == DealParty.Buyer ? "buyer" : "seller";
            throw new TransactionDomainException(
                HttpStatusCode.Forbidden, $"Only the {who} may move this deal to {target.ToDbValue()}.");
        }
    }

    private static string DealCacheKey(Guid dealId) => $"cache:transaction:deal:{dealId}";

    private async Task<Deal> FindAsync(Guid dealId, CancellationToken ct)
    {
        return await _db.Deals.FirstOrDefaultAsync(d => d.DealId == dealId, ct)
            ?? throw new TransactionDomainException(HttpStatusCode.NotFound, "Deal not found.");
    }

    private static DealResponse ToResponse(Deal deal) => new(
        deal.DealId, deal.OfferId, deal.ListingId, deal.BuyerId, deal.SellerId,
        deal.AgreedAmount, deal.Currency, deal.Status, deal.CreatedAt, deal.CompletedAt, deal.CancelledAt);

    private static DealStatusHistoryResponse ToResponse(DealStatusHistory history) => new(
        history.HistoryId, history.DealId, history.PreviousStatus, history.NewStatus,
        history.ChangedBy, history.ChangedAt, history.Reason);
}
