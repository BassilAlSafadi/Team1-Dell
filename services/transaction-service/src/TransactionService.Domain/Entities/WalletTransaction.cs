namespace TransactionService.Domain.Entities;

public class WalletTransaction
{
    public Guid WalletTransactionId { get; set; }
    public Guid WalletId { get; set; }
    public Guid? PaymentMethodId { get; set; }
    public Guid? DealId { get; set; }
    public string Type { get; set; } = null!;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = null!;
    public decimal BalanceAfter { get; set; }
    public string? ExternalReference { get; set; }
    public string Status { get; set; } = "PENDING";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }

    public Wallet Wallet { get; set; } = null!;
    public PaymentMethod? PaymentMethod { get; set; }
    public Deal? Deal { get; set; }
}
