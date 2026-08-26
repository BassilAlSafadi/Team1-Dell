using MarketplaceService.Api.Security;
using MarketplaceService.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace MarketplaceService.Api.Controllers;

/// <summary>
/// Internal-mesh lookup that resolves an auth-service user id to the marketplace account ids
/// that user owns.
///
/// This exists because OFFER/DEAL in transaction-service key on VENDOR.vendor_id and
/// CORPORATE.corporate_id (see services/transaction-service/EERD.md), which are a different id
/// space from the `sub` claim in the JWT. Without this mapping, transaction-service literally
/// cannot tell whether the caller is a party to a deal — which is why every ownership check
/// there used to be missing.
/// </summary>
[ApiController]
[InternalOnly]
[Route("internal/accounts")]
public class InternalAccountsController : ControllerBase
{
    private readonly IVendorProfileService _vendorProfileService;
    private readonly ICorporateProfileService _corporateProfileService;

    public InternalAccountsController(
        IVendorProfileService vendorProfileService,
        ICorporateProfileService corporateProfileService)
    {
        _vendorProfileService = vendorProfileService;
        _corporateProfileService = corporateProfileService;
    }

    [HttpGet("{userId:guid}")]
    public async Task<ActionResult<MarketplaceAccountsResponse>> Get(Guid userId, CancellationToken ct)
    {
        // A user may own a vendor profile, a corporate profile, both, or neither. "Neither" is a
        // valid answer (200 with two nulls), not a 404 — the caller is asking "what does this
        // user control?", and "nothing" is a legitimate response it must handle.
        Guid? vendorId = null;
        Guid? corporateId = null;

        try
        {
            vendorId = (await _vendorProfileService.GetMineAsync(userId, ct)).VendorId;
        }
        catch (MarketplaceDomainException)
        {
            // No vendor profile for this user.
        }

        try
        {
            corporateId = (await _corporateProfileService.GetMineAsync(userId, ct)).CorporateId;
        }
        catch (MarketplaceDomainException)
        {
            // No corporate profile for this user.
        }

        return Ok(new MarketplaceAccountsResponse(userId, vendorId, corporateId));
    }

    /// <summary>
    /// The reverse direction: which auth-service user owns this marketplace account id?
    ///
    /// transaction-service needs this to settle money. A deal's seller_id is a marketplace
    /// account id, but wallets are keyed by auth-service user id, so releasing escrow to the
    /// seller is impossible without this mapping.
    /// </summary>
    [HttpGet("owner/{accountId:guid}")]
    public async Task<ActionResult<AccountOwnerResponse>> GetOwner(Guid accountId, CancellationToken ct)
    {
        try
        {
            var vendor = await _vendorProfileService.GetAsync(accountId, ct);
            return Ok(new AccountOwnerResponse(accountId, vendor.UserId, "VENDOR"));
        }
        catch (MarketplaceDomainException)
        {
            // Not a vendor account; try corporate.
        }

        try
        {
            var corporate = await _corporateProfileService.GetAsync(accountId, ct);
            return Ok(new AccountOwnerResponse(accountId, corporate.UserId, "CORPORATE"));
        }
        catch (MarketplaceDomainException)
        {
            return NotFound(new { error = "No marketplace account with that id." });
        }
    }
}

public record MarketplaceAccountsResponse(Guid UserId, Guid? VendorId, Guid? CorporateId);
public record AccountOwnerResponse(Guid AccountId, Guid UserId, string Kind);
