using TransactionService.Api.Contracts;

namespace TransactionService.Api.Services;

public interface IWalletService
{
    Task<WalletResponse> CreateWalletAsync(Guid userId, string currency, CancellationToken ct);
    Task<WalletResponse> GetWalletAsync(Guid userId, CancellationToken ct);
    Task<IReadOnlyList<WalletTransactionResponse>> GetTransactionsAsync(Guid userId, CancellationToken ct);
    Task<WalletTransactionResponse> TopUpAsync(Guid userId, decimal amount, string currency, Guid? paymentMethodId, CancellationToken ct);
    Task<WalletTransactionResponse> WithdrawAsync(Guid userId, decimal amount, CancellationToken ct);
    Task<WalletTransactionResponse> PayForDealAsync(Guid userId, Guid dealId, CancellationToken ct);
}
