using TransactionService.Api.Contracts;

namespace TransactionService.Api.Services;

/// <summary>
/// Every method takes the acting user's auth-service id. The buyer/seller ids on an offer are
/// marketplace account ids, so each method resolves the actor to the accounts they control and
/// checks membership — see MarketplaceAccounts for why a direct id comparison cannot work.
/// </summary>
public interface IOfferService
{
    Task<OfferResponse> CreateAsync(Guid listingId, Guid sellerId, decimal offeredAmount, string currency, string? message, DateTimeOffset? expiresAt, Guid actorUserId, CancellationToken ct);
    Task<OfferResponse> GetAsync(Guid offerId, Guid actorUserId, CancellationToken ct);
    Task<IReadOnlyList<OfferResponse>> ListMineAsync(Guid actorUserId, string role, int page, int pageSize, CancellationToken ct);
    Task<DealResponse> AcceptAsync(Guid offerId, Guid actorUserId, CancellationToken ct);
    Task<OfferResponse> RejectAsync(Guid offerId, Guid actorUserId, CancellationToken ct);
    Task<OfferResponse> WithdrawAsync(Guid offerId, Guid actorUserId, CancellationToken ct);
}
