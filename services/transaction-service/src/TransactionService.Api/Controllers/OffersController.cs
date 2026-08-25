using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TransactionService.Api.Contracts;
using TransactionService.Api.Services;

namespace TransactionService.Api.Controllers;

// buyer_id/seller_id identify Marketplace Service VENDOR/CORPORATE accounts, a different id
// space from the Auth Service user in the JWT — marketplace-service (not yet built) is
// responsible for checking that the caller controls the buyer/seller account it names here.
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
            request.ListingId, request.BuyerId, request.SellerId, request.OfferedAmount, request.Currency, request.Message, request.ExpiresAt, ct);
        return Ok(offer);
    }

    [HttpGet("{offerId:guid}")]
    public async Task<ActionResult<OfferResponse>> Get(Guid offerId, CancellationToken ct)
    {
        var offer = await _offerService.GetAsync(offerId, ct);
        return Ok(offer);
    }

    [HttpGet("buyer/{buyerId:guid}")]
    public async Task<ActionResult<IReadOnlyList<OfferResponse>>> ListForBuyer(Guid buyerId, CancellationToken ct)
    {
        var offers = await _offerService.ListForBuyerAsync(buyerId, ct);
        return Ok(offers);
    }

    [HttpGet("seller/{sellerId:guid}")]
    public async Task<ActionResult<IReadOnlyList<OfferResponse>>> ListForSeller(Guid sellerId, CancellationToken ct)
    {
        var offers = await _offerService.ListForSellerAsync(sellerId, ct);
        return Ok(offers);
    }

    [HttpPost("{offerId:guid}/accept")]
    public async Task<ActionResult<DealResponse>> Accept(Guid offerId, CancellationToken ct)
    {
        var deal = await _offerService.AcceptAsync(offerId, ct);
        return Ok(deal);
    }

    [HttpPost("{offerId:guid}/reject")]
    public async Task<ActionResult<OfferResponse>> Reject(Guid offerId, CancellationToken ct)
    {
        var offer = await _offerService.RejectAsync(offerId, ct);
        return Ok(offer);
    }

    [HttpPost("{offerId:guid}/withdraw")]
    public async Task<ActionResult<OfferResponse>> Withdraw(Guid offerId, CancellationToken ct)
    {
        var offer = await _offerService.WithdrawAsync(offerId, ct);
        return Ok(offer);
    }
}
