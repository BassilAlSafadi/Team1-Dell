namespace MarketplaceService.Domain.Entities;

public class Vendor
{
    public Guid VendorId { get; set; }
    public Guid UserId { get; set; }
    public string VendorName { get; set; } = null!;
    public string? Description { get; set; }
    public string? BusinessRegistrationNumber { get; set; }
    public string? CategoryPreference { get; set; }
    public string? FulfillmentMethod { get; set; }
    public string? OperatingHours { get; set; }
    public string? LocationText { get; set; }
    public decimal? MinimumAmount { get; set; }
    public string VerificationStatus { get; set; } = "UNVERIFIED";
    public DateTimeOffset? VerifiedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
