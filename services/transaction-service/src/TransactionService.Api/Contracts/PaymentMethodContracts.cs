using System.ComponentModel.DataAnnotations;

namespace TransactionService.Api.Contracts;

public record AddPaymentMethodRequest(
    [property: Required, StringLength(16)] string Type,
    [property: StringLength(50)] string? Provider,
    [property: StringLength(255)] string? ExternalToken,
    [property: StringLength(4, MinimumLength = 4), RegularExpression("^[0-9]{4}$")] string? Last4,
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
