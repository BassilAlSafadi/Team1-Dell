namespace TransactionService.Api.Contracts;

public record CreateWalletRequest(string Currency);
public record TopUpRequest(decimal Amount, string Currency, Guid? PaymentMethodId);
public record WithdrawRequest(decimal Amount);
public record PayForDealRequest(Guid DealId);

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
