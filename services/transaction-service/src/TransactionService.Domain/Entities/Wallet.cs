namespace TransactionService.Domain.Entities;

public class Wallet
{
    public Guid WalletId { get; set; }
    public Guid UserId { get; set; }
    public decimal Balance { get; set; }
    public string Currency { get; set; } = null!;
    public string Status { get; set; } = "ACTIVE";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public List<PaymentMethod> PaymentMethods { get; set; } = new();
    public List<WalletTransaction> WalletTransactions { get; set; } = new();
}
