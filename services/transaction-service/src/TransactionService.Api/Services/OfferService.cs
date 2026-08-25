using System.Net;
using Microsoft.EntityFrameworkCore;
using TransactionService.Api.Contracts;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;
using TransactionService.Infrastructure.Persistence;

namespace TransactionService.Api.Services;

public class OfferService : IOfferService
{
    private readonly TransactionDbContext _db;

    public OfferService(TransactionDbContext db)
    {
        _db = db;
    }

    public async Task<OfferResponse> CreateAsync(Guid listingId, Guid buyerId, Guid sellerId, decimal offeredAmount, string currency, string? message, DateTimeOffset? expiresAt, CancellationToken ct)
    {
        if (offeredAmount <= 0)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "Offered amount must be positive.");
        }

        var offer = new Offer
        {
            OfferId = Guid.NewGuid(),
            ListingId = listingId,
            BuyerId = buyerId,
            SellerId = sellerId,
            OfferedAmount = offeredAmount,
            Currency = currency,
            Message = message,
            Status = OfferStatus.Pending.ToDbValue(),
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = expiresAt
        };

        _db.Offers.Add(offer);
        await _db.SaveChangesAsync(ct);

        return ToResponse(offer);
    }

    public async Task<OfferResponse> GetAsync(Guid offerId, CancellationToken ct)
    {
        var offer = await FindAsync(offerId, ct);
        return ToResponse(offer);
    }

    public async Task<IReadOnlyList<OfferResponse>> ListForBuyerAsync(Guid buyerId, CancellationToken ct)
    {
        var offers = await _db.Offers
            .Where(o => o.BuyerId == buyerId)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(ct);

        return offers.Select(ToResponse).ToList();
    }

    public async Task<IReadOnlyList<OfferResponse>> ListForSellerAsync(Guid sellerId, CancellationToken ct)
    {
        var offers = await _db.Offers
            .Where(o => o.SellerId == sellerId)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(ct);

        return offers.Select(ToResponse).ToList();
    }

    public async Task<DealResponse> AcceptAsync(Guid offerId, CancellationToken ct)
    {
        var offer = await FindAsync(offerId, ct);
        RequirePending(offer);

        if (offer.ExpiresAt is not null && offer.ExpiresAt < DateTimeOffset.UtcNow)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "This offer has expired.");
        }

        var now = DateTimeOffset.UtcNow;
        offer.Status = OfferStatus.Accepted.ToDbValue();
        offer.RespondedAt = now;

        var deal = new Deal
        {
            DealId = Guid.NewGuid(),
            OfferId = offer.OfferId,
            ListingId = offer.ListingId,
            BuyerId = offer.BuyerId,
            SellerId = offer.SellerId,
            AgreedAmount = offer.OfferedAmount,
            Currency = offer.Currency,
            Status = DealStatus.Agreed.ToDbValue(),
            CreatedAt = now
        };
        _db.Deals.Add(deal);

        _db.DealStatusHistories.Add(new DealStatusHistory
        {
            HistoryId = Guid.NewGuid(),
            DealId = deal.DealId,
            PreviousStatus = null,
            NewStatus = DealStatus.Agreed.ToDbValue(),
            ChangedBy = null,
            ChangedAt = now,
            Reason = "Offer accepted"
        });

        await _db.SaveChangesAsync(ct);

        return new DealResponse(
            deal.DealId, deal.OfferId, deal.ListingId, deal.BuyerId, deal.SellerId,
            deal.AgreedAmount, deal.Currency, deal.Status, deal.CreatedAt, deal.CompletedAt, deal.CancelledAt);
    }

    public async Task<OfferResponse> RejectAsync(Guid offerId, CancellationToken ct)
    {
        var offer = await FindAsync(offerId, ct);
        RequirePending(offer);

        offer.Status = OfferStatus.Rejected.ToDbValue();
        offer.RespondedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(ct);

        return ToResponse(offer);
    }

    public async Task<OfferResponse> WithdrawAsync(Guid offerId, CancellationToken ct)
    {
        var offer = await FindAsync(offerId, ct);
        RequirePending(offer);

        offer.Status = OfferStatus.Withdrawn.ToDbValue();
        offer.RespondedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(ct);

        return ToResponse(offer);
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

    private static OfferResponse ToResponse(Offer offer) => new(
        offer.OfferId, offer.ListingId, offer.BuyerId, offer.SellerId,
        offer.OfferedAmount, offer.Currency, offer.Message, offer.Status,
        offer.CreatedAt, offer.ExpiresAt, offer.RespondedAt);
}
