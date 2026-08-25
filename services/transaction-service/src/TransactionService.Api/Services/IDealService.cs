using TransactionService.Api.Contracts;

namespace TransactionService.Api.Services;

public interface IDealService
{
    Task<DealResponse> GetAsync(Guid dealId, CancellationToken ct);
    Task<IReadOnlyList<DealResponse>> ListForPartyAsync(Guid partyId, CancellationToken ct);
    Task<IReadOnlyList<DealStatusHistoryResponse>> GetHistoryAsync(Guid dealId, CancellationToken ct);
    Task<DealResponse> TransitionAsync(Guid dealId, string newStatus, Guid? changedBy, string? reason, CancellationToken ct);
}
