namespace TransactionService.Domain.Entities;

public class PaymentMethod
{
    public Guid PaymentMethodId { get; set; }
    public Guid WalletId { get; set; }
    public string Type { get; set; } = null!;
    public string? Provider { get; set; }
    public string? ExternalToken { get; set; }
    public string? Last4 { get; set; }
    public bool IsDefault { get; set; }
    public string Status { get; set; } = "ACTIVE";
    public DateTimeOffset CreatedAt { get; set; }

    public Wallet Wallet { get; set; } = null!;
    public List<WalletTransaction> WalletTransactions { get; set; } = new();
}
