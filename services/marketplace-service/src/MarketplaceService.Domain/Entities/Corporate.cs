namespace MarketplaceService.Domain.Entities;

public class Corporate
{
    public Guid CorporateId { get; set; }
    public Guid UserId { get; set; }
    public string CompanyName { get; set; } = null!;
    public string? Description { get; set; }
    public string? BusinessRegistrationNumber { get; set; }
    public string? Industry { get; set; }
    public string? Website { get; set; }
    public string? LocationText { get; set; }
    public string VerificationStatus { get; set; } = "UNVERIFIED";
    public DateTimeOffset? VerifiedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
