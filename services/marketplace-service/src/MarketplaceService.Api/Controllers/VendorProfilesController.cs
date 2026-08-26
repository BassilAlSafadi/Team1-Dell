using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MarketplaceService.Api.Contracts;
using MarketplaceService.Api.Services;

namespace MarketplaceService.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/vendor-profiles")]
public class VendorProfilesController : ControllerBase
{
    private readonly IVendorProfileService _vendorProfileService;

    public VendorProfilesController(IVendorProfileService vendorProfileService)
    {
        _vendorProfileService = vendorProfileService;
    }

    [HttpPost]
    public async Task<ActionResult<VendorProfileResponse>> Create(CreateVendorProfileRequest request, CancellationToken ct)
    {
        var vendor = await _vendorProfileService.CreateAsync(CurrentUserId(), request, ct);
        return Ok(vendor);
    }

    [HttpGet("mine")]
    public async Task<ActionResult<VendorProfileResponse>> GetMine(CancellationToken ct)
    {
        var vendor = await _vendorProfileService.GetMineAsync(CurrentUserId(), ct);
        return Ok(vendor);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<VendorProfileResponse>>> Search(
        [FromQuery] string? category, [FromQuery] string? city, [FromQuery] string? q, CancellationToken ct)
    {
        var vendors = await _vendorProfileService.SearchAsync(category, city, q, ct);
        return Ok(vendors);
    }

    [HttpGet("{vendorId:guid}")]
    public async Task<ActionResult<VendorProfileResponse>> Get(Guid vendorId, CancellationToken ct)
    {
        var vendor = await _vendorProfileService.GetAsync(vendorId, ct);
        return Ok(vendor);
    }

    private Guid CurrentUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);
}
