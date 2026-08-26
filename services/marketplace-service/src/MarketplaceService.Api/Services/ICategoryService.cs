using MarketplaceService.Api.Contracts;

namespace MarketplaceService.Api.Services;

public interface ICategoryService
{
    Task<IReadOnlyList<CategoryResponse>> GetAllAsync(CancellationToken ct);
}
