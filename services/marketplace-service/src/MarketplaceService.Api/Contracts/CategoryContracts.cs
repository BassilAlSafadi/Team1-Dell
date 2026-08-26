namespace MarketplaceService.Api.Contracts;

public record CategoryResponse(
    short CategoryId,
    string Name,
    string? Description,
    short? ParentCategoryId);
