namespace TransactionService.Domain.Entities;

public class Deal
{
    public Guid DealId { get; set; }
    public Guid OfferId { get; set; }
    public Guid ListingId { get; set; }
    public Guid BuyerId { get; set; }
    public Guid SellerId { get; set; }
    public decimal AgreedAmount { get; set; }
    public string Currency { get; set; } = null!;
    public string Status { get; set; } = "AGREED";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }

    public Offer Offer { get; set; } = null!;
    public List<DealStatusHistory> StatusHistory { get; set; } = new();
    public WalletTransaction? Payment { get; set; }
}
