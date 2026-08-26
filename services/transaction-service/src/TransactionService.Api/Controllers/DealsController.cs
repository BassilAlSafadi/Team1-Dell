using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TransactionService.Api.Contracts;
using TransactionService.Api.Identity;
using TransactionService.Api.Services;

namespace TransactionService.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/deals")]
public class DealsController : ControllerBase
{
    private readonly IDealService _dealService;

    public DealsController(IDealService dealService)
    {
        _dealService = dealService;
    }

    /// <summary>The caller's own deals. Replaces GET party/{partyId}, which let any authenticated
    /// user read any other user's entire deal history by putting their id in the URL.</summary>
    [HttpGet("mine")]
    public async Task<ActionResult<IReadOnlyList<DealResponse>>> ListMine(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var deals = await _dealService.ListMineAsync(this.CurrentUserId(), page, pageSize, ct);
        return Ok(deals);
    }

    [HttpGet("{dealId:guid}")]
    public async Task<ActionResult<DealResponse>> Get(Guid dealId, CancellationToken ct)
    {
        var deal = await _dealService.GetAsync(dealId, this.CurrentUserId(), ct);
        return Ok(deal);
    }

    [HttpGet("{dealId:guid}/history")]
    public async Task<ActionResult<IReadOnlyList<DealStatusHistoryResponse>>> GetHistory(Guid dealId, CancellationToken ct)
    {
        var history = await _dealService.GetHistoryAsync(dealId, this.CurrentUserId(), ct);
        return Ok(history);
    }

    [HttpPost("{dealId:guid}/transition")]
    public async Task<ActionResult<DealResponse>> Transition(Guid dealId, TransitionDealRequest request, CancellationToken ct)
    {
        var deal = await _dealService.TransitionAsync(dealId, request.NewStatus, this.CurrentUserId(), request.Reason, ct);
        return Ok(deal);
    }
}
