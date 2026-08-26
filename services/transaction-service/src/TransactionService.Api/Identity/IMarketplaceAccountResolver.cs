namespace TransactionService.Api.Identity;

public interface IMarketplaceAccountResolver
{
    /// <summary>
    /// Resolves the marketplace accounts owned by an auth-service user, or throws
    /// TransactionDomainException(503) if marketplace-service cannot be reached.
    ///
    /// Deliberately fails CLOSED: if we can't establish which accounts the caller controls, we
    /// must refuse the request rather than fall back to "allow", because the answer is the only
    /// thing standing between a caller and someone else's deal.
    /// </summary>
    Task<MarketplaceAccounts> ResolveAsync(Guid userId, CancellationToken ct);

    /// <summary>
    /// The reverse direction: which auth-service user owns this marketplace account id?
    /// Needed to settle money, because wallets are keyed by user id while deals name accounts.
    /// </summary>
    Task<Guid> ResolveOwnerAsync(Guid accountId, CancellationToken ct);
}
