using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TransactionService.Api.Contracts;
using TransactionService.Api.Identity;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;
using TransactionService.Infrastructure.Caching;
using TransactionService.Infrastructure.Persistence;

namespace TransactionService.Api.Services;

public class OfferService : IOfferService
{
    private static readonly TimeSpan OfferCacheTtl = TimeSpan.FromSeconds(30);
    private const int MaxPageSize = 100;

    private readonly TransactionDbContext _db;
    private readonly IRedisCache _cache;
    private readonly IMarketplaceAccountResolver _accounts;
    private readonly IWalletService _wallets;

    public OfferService(
        TransactionDbContext db,
        IRedisCache cache,
        IMarketplaceAccountResolver accounts,
        IWalletService wallets)
    {
        _db = db;
        _cache = cache;
        _accounts = accounts;
        _wallets = wallets;
    }

    public async Task<OfferResponse> CreateAsync(
        Guid listingId, Guid sellerId, decimal offeredAmount, string currency,
        string? message, DateTimeOffset? expiresAt, Guid actorUserId, CancellationToken ct)
    {
        if (offeredAmount <= 0)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "Offered amount must be positive.");
        }

        ValidateCurrency(currency);

        // buyer_id is derived from the caller, never accepted from the request body. Taking it
        // from the body let any authenticated user create an offer "from" any other account.
        var caller = await RequireAccountsAsync(actorUserId, ct);
        var buyerId = caller.VendorId ?? caller.CorporateId!.Value;

        if (buyerId == sellerId)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "You cannot make an offer to yourself.");
        }

        if (expiresAt is not null && expiresAt <= DateTimeOffset.UtcNow)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "expiresAt must be in the future.");
        }

        var offer = new Offer
        {
            OfferId = Guid.NewGuid(),
            ListingId = listingId,
            BuyerId = buyerId,
            SellerId = sellerId,
            OfferedAmount = offeredAmount,
            Currency = currency.ToUpperInvariant(),
            Message = message,
            Status = OfferStatus.Pending.ToDbValue(),
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = expiresAt
        };

        _db.Offers.Add(offer);
        await _db.SaveChangesAsync(ct);

        return ToResponse(offer);
    }

    public async Task<OfferResponse> GetAsync(Guid offerId, Guid actorUserId, CancellationToken ct)
    {
        var offer = await FindAsync(offerId, ct);
        await RequirePartyAsync(offer, actorUserId, ct);

        // Cache only after the authorization check, and key on the offer alone — the cached value
        // is the same for both parties, and a cache hit must never be a way to skip the check.
        var cacheKey = OfferCacheKey(offerId);
        var cached = await _cache.GetStringAsync(cacheKey);
        if (cached is not null)
        {
            var cachedOffer = JsonSerializer.Deserialize<OfferResponse>(cached);
            if (cachedOffer is not null)
            {
                return cachedOffer;
            }
        }

        var response = ToResponse(offer);
        await _cache.SetStringAsync(cacheKey, JsonSerializer.Serialize(response), OfferCacheTtl);

        return response;
    }

    /// <summary>
    /// Replaces the old ListForBuyer(buyerId)/ListForSeller(sellerId) pair, whose account id came
    /// from the URL and so let anyone enumerate anyone else's offers. Scope is now the caller's
    /// own accounts; <paramref name="role"/> only narrows which side of the offer to match.
    /// </summary>
    public async Task<IReadOnlyList<OfferResponse>> ListMineAsync(
        Guid actorUserId, string role, int page, int pageSize, CancellationToken ct)
    {
        var caller = await RequireAccountsAsync(actorUserId, ct);
        var mine = caller.All().ToList();

        (page, pageSize) = Paging.Clamp(page, pageSize, MaxPageSize);

        var query = role.ToUpperInvariant() switch
        {
            "BUYER" => _db.Offers.Where(o => mine.Contains(o.BuyerId)),
            "SELLER" => _db.Offers.Where(o => mine.Contains(o.SellerId)),
            "ANY" or "" => _db.Offers.Where(o => mine.Contains(o.BuyerId) || mine.Contains(o.SellerId)),
            _ => throw new TransactionDomainException(HttpStatusCode.BadRequest, "role must be BUYER, SELLER or ANY."),
        };

        var offers = await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return offers.Select(ToResponse).ToList();
    }

    public async Task<DealResponse> AcceptAsync(Guid offerId, Guid actorUserId, CancellationToken ct)
    {
        var offer = await FindAsync(offerId, ct);

        // Only the seller may accept: accepting creates a binding deal, so letting any caller do
        // it meant a stranger could commit two other parties to a transaction.
        await RequireSideAsync(offer, offer.SellerId, actorUserId, "Only the seller may accept this offer.", ct);

        RequirePending(offer);

        if (offer.ExpiresAt is not null && offer.ExpiresAt < DateTimeOffset.UtcNow)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "This offer has expired.");
        }

        var now = DateTimeOffset.UtcNow;
        offer.Status = OfferStatus.Accepted.ToDbValue();
        offer.RespondedAt = now;

        // Acceptance settles the deal immediately: the money moves buyer -> seller now, so the
        // deal is born COMPLETED rather than sitting in AGREED awaiting a separate payment step.
        var deal = new Deal
        {
            DealId = Guid.NewGuid(),
            OfferId = offer.OfferId,
            ListingId = offer.ListingId,
            BuyerId = offer.BuyerId,
            SellerId = offer.SellerId,
            AgreedAmount = offer.OfferedAmount,
            Currency = offer.Currency,
            Status = DealStatus.Completed.ToDbValue(),
            CreatedAt = now,
            CompletedAt = now
        };
        _db.Deals.Add(deal);

        _db.DealStatusHistories.Add(new DealStatusHistory
        {
            HistoryId = Guid.NewGuid(),
            DealId = deal.DealId,
            PreviousStatus = null,
            NewStatus = DealStatus.Completed.ToDbValue(),
            ChangedBy = actorUserId,
            ChangedAt = now,
            Reason = "Offer accepted"
        });

        // One transaction for the offer/deal rows and both wallet movements: if the buyer can no
        // longer cover the amount, SettleDealDirectAsync throws and nothing commits — the offer
        // stays PENDING and the seller sees why.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await _db.SaveChangesAsync(ct);
        await _wallets.SettleDealDirectAsync(deal.DealId, ct);
        await tx.CommitAsync(ct);

        await _cache.DeleteAsync(OfferCacheKey(offerId));

        return new DealResponse(
            deal.DealId, deal.OfferId, deal.ListingId, deal.BuyerId, deal.SellerId,
            deal.AgreedAmount, deal.Currency, deal.Status, deal.CreatedAt, deal.CompletedAt, deal.CancelledAt);
    }

    public async Task<OfferResponse> RejectAsync(Guid offerId, Guid actorUserId, CancellationToken ct)
    {
        var offer = await FindAsync(offerId, ct);
        await RequireSideAsync(offer, offer.SellerId, actorUserId, "Only the seller may reject this offer.", ct);
        RequirePending(offer);

        offer.Status = OfferStatus.Rejected.ToDbValue();
        offer.RespondedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _cache.DeleteAsync(OfferCacheKey(offerId));

        return ToResponse(offer);
    }

    public async Task<OfferResponse> WithdrawAsync(Guid offerId, Guid actorUserId, CancellationToken ct)
    {
        var offer = await FindAsync(offerId, ct);
        // Withdrawal is the buyer's side of the same coin as the seller's reject.
        await RequireSideAsync(offer, offer.BuyerId, actorUserId, "Only the buyer may withdraw this offer.", ct);
        RequirePending(offer);

        offer.Status = OfferStatus.Withdrawn.ToDbValue();
        offer.RespondedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _cache.DeleteAsync(OfferCacheKey(offerId));

        return ToResponse(offer);
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

    private async Task RequirePartyAsync(Offer offer, Guid actorUserId, CancellationToken ct)
    {
        var caller = await RequireAccountsAsync(actorUserId, ct);
        if (!caller.Controls(offer.BuyerId) && !caller.Controls(offer.SellerId))
        {
            throw new TransactionDomainException(HttpStatusCode.Forbidden, "You are not a party to this offer.");
        }
    }

    private async Task RequireSideAsync(Offer offer, Guid requiredAccountId, Guid actorUserId, string message, CancellationToken ct)
    {
        var caller = await RequireAccountsAsync(actorUserId, ct);
        if (!caller.Controls(requiredAccountId))
        {
            throw new TransactionDomainException(HttpStatusCode.Forbidden, message);
        }
    }

    private async Task<Offer> FindAsync(Guid offerId, CancellationToken ct)
    {
        return await _db.Offers.FirstOrDefaultAsync(o => o.OfferId == offerId, ct)
            ?? throw new TransactionDomainException(HttpStatusCode.NotFound, "Offer not found.");
    }

    private static void RequirePending(Offer offer)
    {
        if (offer.Status != OfferStatus.Pending.ToDbValue())
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "This offer is no longer pending.");
        }
    }

    internal static void ValidateCurrency(string currency)
    {
        if (string.IsNullOrWhiteSpace(currency) || currency.Trim().Length != 3
            || !currency.Trim().All(char.IsLetter))
        {
            throw new TransactionDomainException(
                HttpStatusCode.BadRequest, "currency must be a 3-letter ISO 4217 code.");
        }
    }

    private static string OfferCacheKey(Guid offerId) => $"cache:transaction:offer:{offerId}";

    private static OfferResponse ToResponse(Offer offer) => new(
        offer.OfferId, offer.ListingId, offer.BuyerId, offer.SellerId,
        offer.OfferedAmount, offer.Currency, offer.Message, offer.Status,
        offer.CreatedAt, offer.ExpiresAt, offer.RespondedAt);
}
