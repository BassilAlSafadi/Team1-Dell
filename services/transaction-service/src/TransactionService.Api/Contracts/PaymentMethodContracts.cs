namespace TransactionService.Api.Contracts;

public record AddPaymentMethodRequest(
    string Type,
    string? Provider,
    string? ExternalToken,
    string? Last4,
    bool IsDefault);

public record PaymentMethodResponse(
    Guid PaymentMethodId,
    Guid WalletId,
    string Type,
    string? Provider,
    string? Last4,
    bool IsDefault,
    string Status,
    DateTimeOffset CreatedAt);
