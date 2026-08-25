namespace TransactionService.Domain.Enums;

public enum WalletTransactionStatus
{
    Pending,
    Completed,
    Failed,
    Reversed
}

public static class WalletTransactionStatusExtensions
{
    public static string ToDbValue(this WalletTransactionStatus status) => status switch
    {
        WalletTransactionStatus.Pending => "PENDING",
        WalletTransactionStatus.Completed => "COMPLETED",
        WalletTransactionStatus.Failed => "FAILED",
        WalletTransactionStatus.Reversed => "REVERSED",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null)
    };

    public static WalletTransactionStatus FromDbValue(string value) => value switch
    {
        "PENDING" => WalletTransactionStatus.Pending,
        "COMPLETED" => WalletTransactionStatus.Completed,
        "FAILED" => WalletTransactionStatus.Failed,
        "REVERSED" => WalletTransactionStatus.Reversed,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, null)
    };
}
