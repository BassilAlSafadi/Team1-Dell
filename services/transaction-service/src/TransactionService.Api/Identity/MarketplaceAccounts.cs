namespace TransactionService.Api.Identity;

/// <summary>
/// The marketplace account ids a single auth-service user controls.
///
/// OFFER.buyer_id / seller_id and DEAL.buyer_id / seller_id hold VENDOR.vendor_id or
/// CORPORATE.corporate_id values (services/transaction-service/EERD.md §"external references"),
/// which are a different id space from the JWT `sub`. Every ownership check in this service
/// therefore has to resolve the caller into this set first and then test membership — comparing
/// a deal's buyer_id directly against the JWT subject would never match.
/// </summary>
public sealed record MarketplaceAccounts(Guid UserId, Guid? VendorId, Guid? CorporateId)
{
    /// <summary>True when <paramref name="accountId"/> is one of the ids this user controls.</summary>
    public bool Controls(Guid accountId) =>
        (VendorId is { } v && v == accountId) || (CorporateId is { } c && c == accountId);

    public bool ControlsAny => VendorId is not null || CorporateId is not null;

    public IEnumerable<Guid> All()
    {
        if (VendorId is { } v) yield return v;
        if (CorporateId is { } c) yield return c;
    }
}
