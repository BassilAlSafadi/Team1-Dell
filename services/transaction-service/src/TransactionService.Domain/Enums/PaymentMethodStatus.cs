namespace TransactionService.Domain.Enums;

public enum PaymentMethodStatus
{
    Active,
    Expired,
    Removed
}

public static class PaymentMethodStatusExtensions
{
    public static string ToDbValue(this PaymentMethodStatus status) => status switch
    {
        PaymentMethodStatus.Active => "ACTIVE",
        PaymentMethodStatus.Expired => "EXPIRED",
        PaymentMethodStatus.Removed => "REMOVED",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null)
    };

    public static PaymentMethodStatus FromDbValue(string value) => value switch
    {
        "ACTIVE" => PaymentMethodStatus.Active,
        "EXPIRED" => PaymentMethodStatus.Expired,
        "REMOVED" => PaymentMethodStatus.Removed,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, null)
    };
}
