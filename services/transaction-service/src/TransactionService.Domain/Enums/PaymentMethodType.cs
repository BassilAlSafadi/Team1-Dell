namespace TransactionService.Domain.Enums;

public enum PaymentMethodType
{
    Card,
    BankTransfer,
    Cash
}

public static class PaymentMethodTypeExtensions
{
    public static string ToDbValue(this PaymentMethodType type) => type switch
    {
        PaymentMethodType.Card => "CARD",
        PaymentMethodType.BankTransfer => "BANK_TRANSFER",
        PaymentMethodType.Cash => "CASH",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, null)
    };

    public static PaymentMethodType FromDbValue(string value) => value switch
    {
        "CARD" => PaymentMethodType.Card,
        "BANK_TRANSFER" => PaymentMethodType.BankTransfer,
        "CASH" => PaymentMethodType.Cash,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, null)
    };
}
