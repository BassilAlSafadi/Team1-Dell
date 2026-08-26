namespace MarketplaceService.Domain.Entities;

public class Location
{
    public Guid LocationId { get; set; }
    public string Country { get; set; } = null!;
    public string City { get; set; } = null!;
    public string? Address { get; set; }
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
}
