namespace TransactionService.Domain.Entities;

public class Offer
{
    public Guid OfferId { get; set; }
    public Guid ListingId { get; set; }
    public Guid BuyerId { get; set; }
    public Guid SellerId { get; set; }
    public decimal OfferedAmount { get; set; }
    public string Currency { get; set; } = null!;
    public string? Message { get; set; }
    public string Status { get; set; } = "PENDING";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset? RespondedAt { get; set; }

    public Deal? Deal { get; set; }
}
