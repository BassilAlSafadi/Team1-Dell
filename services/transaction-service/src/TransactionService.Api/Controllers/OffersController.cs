using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TransactionService.Api.Contracts;
using TransactionService.Api.Identity;
using TransactionService.Api.Services;

namespace TransactionService.Api.Controllers;

// buyer_id/seller_id identify Marketplace Service VENDOR/CORPORATE accounts, a different id space
// from the Auth Service user in the JWT. This controller no longer accepts either from the client:
// the buyer is derived from the caller's own marketplace accounts, and every mutation checks that
// the caller controls the side of the offer it is acting on (see OfferService).
[ApiController]
[Authorize]
[Route("api/offers")]
public class OffersController : ControllerBase
{
    private readonly IOfferService _offerService;

    public OffersController(IOfferService offerService)
    {
        _offerService = offerService;
    }

    [HttpPost]
    public async Task<ActionResult<OfferResponse>> Create(CreateOfferRequest request, CancellationToken ct)
    {
        var offer = await _offerService.CreateAsync(
            request.ListingId, request.SellerId, request.OfferedAmount, request.Currency,
            request.Message, request.ExpiresAt, this.CurrentUserId(), ct);
        return Ok(offer);
    }

    [HttpGet("{offerId:guid}")]
    public async Task<ActionResult<OfferResponse>> Get(Guid offerId, CancellationToken ct)
    {
        var offer = await _offerService.GetAsync(offerId, this.CurrentUserId(), ct);
        return Ok(offer);
    }

    /// <summary>The caller's own offers. Replaces GET buyer/{buyerId} and GET seller/{sellerId},
    /// which took the account id from the URL and so allowed enumerating anyone's offers.</summary>
    [HttpGet("mine")]
    public async Task<ActionResult<IReadOnlyList<OfferResponse>>> ListMine(
        [FromQuery] string role = "ANY", [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var offers = await _offerService.ListMineAsync(this.CurrentUserId(), role, page, pageSize, ct);
        return Ok(offers);
    }

    [HttpPost("{offerId:guid}/accept")]
    public async Task<ActionResult<DealResponse>> Accept(Guid offerId, CancellationToken ct)
    {
        var deal = await _offerService.AcceptAsync(offerId, this.CurrentUserId(), ct);
        return Ok(deal);
    }

    [HttpPost("{offerId:guid}/reject")]
    public async Task<ActionResult<OfferResponse>> Reject(Guid offerId, CancellationToken ct)
    {
        var offer = await _offerService.RejectAsync(offerId, this.CurrentUserId(), ct);
        return Ok(offer);
    }

    [HttpPost("{offerId:guid}/withdraw")]
    public async Task<ActionResult<OfferResponse>> Withdraw(Guid offerId, CancellationToken ct)
    {
        var offer = await _offerService.WithdrawAsync(offerId, this.CurrentUserId(), ct);
        return Ok(offer);
    }
}
