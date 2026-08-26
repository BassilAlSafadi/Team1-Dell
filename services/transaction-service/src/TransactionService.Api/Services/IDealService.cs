using TransactionService.Api.Contracts;

namespace TransactionService.Api.Services;

/// <summary>
/// Every method takes the acting user's auth-service id and enforces that they are a party to
/// the deal. Authorization lives here rather than in the controller so the REST and gRPC entry
/// points are protected by the same code — the gRPC path previously bypassed checks the REST
/// controller was assumed to be doing.
/// </summary>
public interface IDealService
{
    Task<DealResponse> GetAsync(Guid dealId, Guid actorUserId, CancellationToken ct);
    Task<IReadOnlyList<DealResponse>> ListMineAsync(Guid actorUserId, int page, int pageSize, CancellationToken ct);
    Task<IReadOnlyList<DealStatusHistoryResponse>> GetHistoryAsync(Guid dealId, Guid actorUserId, CancellationToken ct);
    Task<DealResponse> TransitionAsync(Guid dealId, string newStatus, Guid actorUserId, string? reason, CancellationToken ct);
}
