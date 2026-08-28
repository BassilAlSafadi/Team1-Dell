using TransactionService.Api.Contracts;

namespace TransactionService.Api.Services;

public interface IWalletService
{
    Task<WalletResponse> CreateWalletAsync(Guid userId, string currency, CancellationToken ct);
    Task<WalletResponse> GetWalletAsync(Guid userId, CancellationToken ct);
    Task<IReadOnlyList<WalletTransactionResponse>> GetTransactionsAsync(Guid userId, int page, int pageSize, CancellationToken ct);
    Task<WalletTransactionResponse> TopUpAsync(Guid userId, decimal amount, string currency, Guid? paymentMethodId, CancellationToken ct);
    Task<WalletTransactionResponse> WithdrawAsync(Guid userId, decimal amount, CancellationToken ct);

    /// <summary>Moves the agreed amount from the buyer's wallet into escrow for this deal.</summary>
    Task<WalletTransactionResponse> PayForDealAsync(Guid userId, Guid dealId, CancellationToken ct);

    /// <summary>
    /// Settles a deal by moving the agreed amount straight from the buyer to the seller, in one
    /// transaction. Called when an offer is accepted. Idempotent; throws 400 if the buyer can no
    /// longer cover it.
    /// </summary>
    Task SettleDealDirectAsync(Guid dealId, CancellationToken ct);

    /// <summary>Credits held escrow to the seller. No-op if the deal was never paid.</summary>
    Task ReleaseEscrowAsync(Guid dealId, CancellationToken ct);

    /// <summary>Returns held escrow to the buyer. No-op if the deal was never paid.</summary>
    Task RefundEscrowAsync(Guid dealId, CancellationToken ct);
}
