using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MarketplaceService.Api.Contracts;
using MarketplaceService.Api.Services;

namespace MarketplaceService.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/listings")]
public class ListingsController : ControllerBase
{
    private readonly IListingService _listingService;

    public ListingsController(IListingService listingService)
    {
        _listingService = listingService;
    }

    [HttpPost]
    public async Task<ActionResult<ListingResponse>> Create(CreateListingRequest request, CancellationToken ct)
    {
        var listing = await _listingService.CreateAsync(CurrentUserId(), request, ct);
        return Ok(listing);
    }

    [HttpGet("mine")]
    public async Task<ActionResult<IReadOnlyList<ListingResponse>>> ListMine(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var listings = await _listingService.ListMineAsync(CurrentUserId(), page, pageSize, ct);
        return Ok(listings);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ListingResponse>>> Search(
        [FromQuery] string? status, [FromQuery] short? categoryId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var listings = await _listingService.SearchAsync(status, categoryId, page, pageSize, ct);
        return Ok(listings);
    }

    [HttpGet("{listingId:guid}")]
    public async Task<ActionResult<ListingResponse>> Get(Guid listingId, CancellationToken ct)
    {
        var listing = await _listingService.GetAsync(listingId, ct);
        return Ok(listing);
    }

    [HttpPatch("{listingId:guid}")]
    public async Task<ActionResult<ListingResponse>> UpdateStatus(Guid listingId, UpdateListingStatusRequest request, CancellationToken ct)
    {
        var listing = await _listingService.UpdateStatusAsync(listingId, CurrentUserId(), request.Status, ct);
        return Ok(listing);
    }

    private Guid CurrentUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);
}
