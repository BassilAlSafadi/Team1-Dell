using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MarketplaceService.Api.Contracts;
using MarketplaceService.Api.Services;

namespace MarketplaceService.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/corporate-profiles")]
public class CorporateProfilesController : ControllerBase
{
    private readonly ICorporateProfileService _corporateProfileService;

    public CorporateProfilesController(ICorporateProfileService corporateProfileService)
    {
        _corporateProfileService = corporateProfileService;
    }

    [HttpPost]
    public async Task<ActionResult<CorporateProfileResponse>> Create(CreateCorporateProfileRequest request, CancellationToken ct)
    {
        var corporate = await _corporateProfileService.CreateAsync(CurrentUserId(), request, ct);
        return Ok(corporate);
    }

    [HttpGet("mine")]
    public async Task<ActionResult<CorporateProfileResponse>> GetMine(CancellationToken ct)
    {
        var corporate = await _corporateProfileService.GetMineAsync(CurrentUserId(), ct);
        return Ok(corporate);
    }

    [HttpGet("{corporateId:guid}")]
    public async Task<ActionResult<CorporateProfileResponse>> Get(Guid corporateId, CancellationToken ct)
    {
        var corporate = await _corporateProfileService.GetAsync(corporateId, ct);
        return Ok(corporate);
    }

    private Guid CurrentUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);
}
