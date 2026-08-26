namespace MarketplaceService.Domain.Entities;

public class Category
{
    public short CategoryId { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public short? ParentCategoryId { get; set; }

    public Category? ParentCategory { get; set; }
}
