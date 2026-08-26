using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TransactionService.Api.Contracts;
using TransactionService.Api.Grpc;
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

    public DealService(TransactionDbContext db, INotificationPublisher notifications, IRedisCache cache)
    {
        _db = db;
        _notifications = notifications;
        _cache = cache;
    }

    public async Task<DealResponse> GetAsync(Guid dealId, CancellationToken ct)
    {
        // Pure TTL-expiry cache-aside, no write-invalidation — lower-stakes staleness than
        // wallet balance (see REDIS_INTEGRATION_PLAN.md §2).
        var cacheKey = $"cache:transaction:deal:{dealId}";
        var cached = await _cache.GetStringAsync(cacheKey);
        if (cached is not null)
        {
            var cachedDeal = JsonSerializer.Deserialize<DealResponse>(cached);
            if (cachedDeal is not null)
            {
                return cachedDeal;
            }
        }

        var deal = await FindAsync(dealId, ct);
        var response = ToResponse(deal);

        await _cache.SetStringAsync(cacheKey, JsonSerializer.Serialize(response), DealCacheTtl);

        return response;
    }

    public async Task<IReadOnlyList<DealResponse>> ListForPartyAsync(Guid partyId, CancellationToken ct)
    {
        var deals = await _db.Deals
            .Where(d => d.BuyerId == partyId || d.SellerId == partyId)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(ct);

        return deals.Select(ToResponse).ToList();
    }

    public async Task<IReadOnlyList<DealStatusHistoryResponse>> GetHistoryAsync(Guid dealId, CancellationToken ct)
    {
        await FindAsync(dealId, ct);

        var history = await _db.DealStatusHistories
            .Where(h => h.DealId == dealId)
            .OrderBy(h => h.ChangedAt)
            .ToListAsync(ct);

        return history.Select(ToResponse).ToList();
    }

    public async Task<DealResponse> TransitionAsync(Guid dealId, string newStatus, Guid? changedBy, string? reason, CancellationToken ct)
    {
        var deal = await FindAsync(dealId, ct);

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

        if (!AllowedTransitions[current].Contains(target))
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, $"Cannot move a deal from {deal.Status} to {newStatus}.");
        }

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

        await _db.SaveChangesAsync(ct);

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
