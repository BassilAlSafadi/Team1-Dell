using TransactionService.Api.Contracts;

namespace TransactionService.Api.Services;

public interface IOfferService
{
    Task<OfferResponse> CreateAsync(Guid listingId, Guid buyerId, Guid sellerId, decimal offeredAmount, string currency, string? message, DateTimeOffset? expiresAt, CancellationToken ct);
    Task<OfferResponse> GetAsync(Guid offerId, CancellationToken ct);
    Task<IReadOnlyList<OfferResponse>> ListForBuyerAsync(Guid buyerId, CancellationToken ct);
    Task<IReadOnlyList<OfferResponse>> ListForSellerAsync(Guid sellerId, CancellationToken ct);
    Task<DealResponse> AcceptAsync(Guid offerId, CancellationToken ct);
    Task<OfferResponse> RejectAsync(Guid offerId, CancellationToken ct);
    Task<OfferResponse> WithdrawAsync(Guid offerId, CancellationToken ct);
}
