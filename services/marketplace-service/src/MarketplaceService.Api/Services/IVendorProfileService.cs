using MarketplaceService.Api.Contracts;

namespace MarketplaceService.Api.Services;

public interface IVendorProfileService
{
    Task<VendorProfileResponse> CreateAsync(Guid userId, CreateVendorProfileRequest request, CancellationToken ct);
    Task<VendorProfileResponse> GetMineAsync(Guid userId, CancellationToken ct);
    Task<IReadOnlyList<VendorProfileResponse>> SearchAsync(string? category, string? city, string? q, CancellationToken ct);
    Task<VendorProfileResponse> GetAsync(Guid vendorId, CancellationToken ct);
}
