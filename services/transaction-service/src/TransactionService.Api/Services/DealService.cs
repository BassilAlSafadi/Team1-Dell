using System.Net;
using Microsoft.EntityFrameworkCore;
using TransactionService.Api.Contracts;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;
using TransactionService.Infrastructure.Persistence;

namespace TransactionService.Api.Services;

public class DealService : IDealService
{
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

    public DealService(TransactionDbContext db)
    {
        _db = db;
    }

    public async Task<DealResponse> GetAsync(Guid dealId, CancellationToken ct)
    {
        var deal = await FindAsync(dealId, ct);
        return ToResponse(deal);
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
