namespace AuthService.Domain.Entities;

public class Review
{
    public Guid ReviewId { get; set; }
    public Guid VendorId { get; set; }
    public Guid ReviewerId { get; set; }
    public short Rating { get; set; }
    public string? Comment { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public User Vendor { get; set; } = null!;
    public User Reviewer { get; set; } = null!;
}
