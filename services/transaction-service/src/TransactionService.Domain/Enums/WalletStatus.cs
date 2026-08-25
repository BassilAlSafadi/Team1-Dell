namespace TransactionService.Domain.Enums;

public enum WalletStatus
{
    Active,
    Frozen,
    Closed
}

public static class WalletStatusExtensions
{
    public static string ToDbValue(this WalletStatus status) => status switch
    {
        WalletStatus.Active => "ACTIVE",
        WalletStatus.Frozen => "FROZEN",
        WalletStatus.Closed => "CLOSED",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null)
    };

    public static WalletStatus FromDbValue(string value) => value switch
    {
        "ACTIVE" => WalletStatus.Active,
        "FROZEN" => WalletStatus.Frozen,
        "CLOSED" => WalletStatus.Closed,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, null)
    };
}
