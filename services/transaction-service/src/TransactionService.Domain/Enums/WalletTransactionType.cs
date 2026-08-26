namespace TransactionService.Domain.Enums;

public enum WalletTransactionType
{
    TopUp,
    Payment,
    Refund,
    Withdrawal,

    /// <summary>Escrow released to the seller when a deal completes.</summary>
    Payout
}

public static class WalletTransactionTypeExtensions
{
    public static string ToDbValue(this WalletTransactionType type) => type switch
    {
        WalletTransactionType.TopUp => "TOP_UP",
        WalletTransactionType.Payment => "PAYMENT",
        WalletTransactionType.Refund => "REFUND",
        WalletTransactionType.Withdrawal => "WITHDRAWAL",
        WalletTransactionType.Payout => "PAYOUT",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, null)
    };

    public static WalletTransactionType FromDbValue(string value) => value switch
    {
        "TOP_UP" => WalletTransactionType.TopUp,
        "PAYMENT" => WalletTransactionType.Payment,
        "REFUND" => WalletTransactionType.Refund,
        "WITHDRAWAL" => WalletTransactionType.Withdrawal,
        "PAYOUT" => WalletTransactionType.Payout,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, null)
    };
}
