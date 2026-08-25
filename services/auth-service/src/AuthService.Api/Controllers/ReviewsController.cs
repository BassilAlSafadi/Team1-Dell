using System.Security.Claims;
using AuthService.Api.Contracts;
using AuthService.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.Api.Controllers;

[ApiController]
[Route("api/vendors/{vendorId:guid}")]
public class ReviewsController : ControllerBase
{
    private readonly IReviewService _reviewService;

    public ReviewsController(IReviewService reviewService)
    {
        _reviewService = reviewService;
    }

    [HttpGet("profile")]
    public async Task<ActionResult<VendorProfileResponse>> GetProfile(Guid vendorId, CancellationToken ct)
    {
        var profile = await _reviewService.GetVendorProfileAsync(vendorId, ct);
        return Ok(profile);
    }

    [HttpGet("reviews")]
    public async Task<ActionResult<VendorReviewsResponse>> GetReviews(Guid vendorId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var reviews = await _reviewService.GetVendorReviewsAsync(vendorId, page, pageSize, ct);
        return Ok(reviews);
    }

    [Authorize]
    [HttpPut("reviews")]
    public async Task<ActionResult<ReviewResponse>> UpsertReview(Guid vendorId, UpsertReviewRequest request, CancellationToken ct)
    {
        var reviewerId = GetCurrentUserId();
        var review = await _reviewService.UpsertReviewAsync(vendorId, reviewerId, request.Rating, request.Comment, ct);
        return Ok(review);
    }

    [Authorize]
    [HttpDelete("reviews")]
    public async Task<IActionResult> DeleteReview(Guid vendorId, CancellationToken ct)
    {
        var reviewerId = GetCurrentUserId();
        await _reviewService.DeleteReviewAsync(vendorId, reviewerId, ct);
        return NoContent();
    }

    private Guid GetCurrentUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);
}
