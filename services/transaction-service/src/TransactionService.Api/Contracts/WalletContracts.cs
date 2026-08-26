using System.ComponentModel.DataAnnotations;

namespace TransactionService.Api.Contracts;

// numeric(14,2) in Postgres caps the magnitude; Range keeps an out-of-range amount a clean 400
// instead of a constraint violation surfacing as a 500.
public record CreateWalletRequest(
    [property: Required, StringLength(3, MinimumLength = 3)] string Currency);

public record TopUpRequest(
    [property: Range(0.01, 99_999_999.99)] decimal Amount,
    [property: Required, StringLength(3, MinimumLength = 3)] string Currency,
    Guid? PaymentMethodId);

public record WithdrawRequest(
    [property: Range(0.01, 99_999_999.99)] decimal Amount);

public record PayForDealRequest(
    [property: Required] Guid DealId);

public record WalletResponse(
    Guid WalletId,
    Guid UserId,
    decimal Balance,
    string Currency,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record WalletTransactionResponse(
    Guid WalletTransactionId,
    Guid WalletId,
    Guid? PaymentMethodId,
    Guid? DealId,
    string Type,
    decimal Amount,
    string Currency,
    decimal BalanceAfter,
    string? ExternalReference,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt);
