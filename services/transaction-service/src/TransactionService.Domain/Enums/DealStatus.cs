namespace TransactionService.Domain.Enums;

public enum DealStatus
{
    Agreed,
    HandoverPending,
    Completed,
    Cancelled,
    Disputed
}

public static class DealStatusExtensions
{
    public static string ToDbValue(this DealStatus status) => status switch
    {
        DealStatus.Agreed => "AGREED",
        DealStatus.HandoverPending => "HANDOVER_PENDING",
        DealStatus.Completed => "COMPLETED",
        DealStatus.Cancelled => "CANCELLED",
        DealStatus.Disputed => "DISPUTED",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null)
    };

    public static DealStatus FromDbValue(string value) => value switch
    {
        "AGREED" => DealStatus.Agreed,
        "HANDOVER_PENDING" => DealStatus.HandoverPending,
        "COMPLETED" => DealStatus.Completed,
        "CANCELLED" => DealStatus.Cancelled,
        "DISPUTED" => DealStatus.Disputed,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, null)
    };
}
