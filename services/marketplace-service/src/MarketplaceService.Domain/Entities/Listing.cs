namespace MarketplaceService.Domain.Entities;

public class Listing
{
    public Guid ListingId { get; set; }

    // EXT external reference - logical: owner_id = Auth Service USER.user_id (vendor or
    // corporate account). Not modeled as a corporate_id — see marketplace-service db migration
    // 0001's column comment on marketplace_db.listing.owner_id.
    public Guid OwnerId { get; set; }

    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public short CategoryId { get; set; }
    public string Condition { get; set; } = null!;
    public decimal Quantity { get; set; }
    public string Unit { get; set; } = null!;
    public decimal? ExpectedAmount { get; set; }
    public string? Currency { get; set; }
    public Guid? LocationId { get; set; }
    public string Status { get; set; } = "ACTIVE";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Category Category { get; set; } = null!;
    public Location? Location { get; set; }
}
