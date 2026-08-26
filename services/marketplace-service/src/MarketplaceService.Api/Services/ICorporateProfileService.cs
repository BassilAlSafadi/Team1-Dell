using MarketplaceService.Api.Contracts;

namespace MarketplaceService.Api.Services;

public interface ICorporateProfileService
{
    Task<CorporateProfileResponse> CreateAsync(Guid userId, CreateCorporateProfileRequest request, CancellationToken ct);
    Task<CorporateProfileResponse> GetMineAsync(Guid userId, CancellationToken ct);
    Task<CorporateProfileResponse> GetAsync(Guid corporateId, CancellationToken ct);
}
