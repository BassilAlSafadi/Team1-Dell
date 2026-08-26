using MarketplaceService.Api.Contracts;

namespace MarketplaceService.Api.Services;

public interface IListingService
{
    Task<ListingResponse> CreateAsync(Guid ownerId, CreateListingRequest request, CancellationToken ct);
    Task<IReadOnlyList<ListingResponse>> ListMineAsync(Guid ownerId, int page, int pageSize, CancellationToken ct);
    Task<IReadOnlyList<ListingResponse>> SearchAsync(string? status, short? categoryId, int page, int pageSize, CancellationToken ct);
    Task<ListingResponse> GetAsync(Guid listingId, CancellationToken ct);
    Task<ListingResponse> UpdateStatusAsync(Guid listingId, Guid ownerId, string status, CancellationToken ct);
}
