using Microsoft.EntityFrameworkCore;
using MarketplaceService.Api.Contracts;
using MarketplaceService.Infrastructure.Persistence;

namespace MarketplaceService.Api.Services;

public class CategoryService : ICategoryService
{
    private readonly MarketplaceDbContext _db;

    public CategoryService(MarketplaceDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<CategoryResponse>> GetAllAsync(CancellationToken ct)
    {
        var categories = await _db.Categories.ToListAsync(ct);

        return categories
            .Select(c => new CategoryResponse(c.CategoryId, c.Name, c.Description, c.ParentCategoryId))
            .ToList();
    }
}
