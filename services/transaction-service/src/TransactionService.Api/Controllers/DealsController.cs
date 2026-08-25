using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TransactionService.Api.Contracts;
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

    [HttpGet("{dealId:guid}")]
    public async Task<ActionResult<DealResponse>> Get(Guid dealId, CancellationToken ct)
    {
        var deal = await _dealService.GetAsync(dealId, ct);
        return Ok(deal);
    }

    [HttpGet("{dealId:guid}/history")]
    public async Task<ActionResult<IReadOnlyList<DealStatusHistoryResponse>>> GetHistory(Guid dealId, CancellationToken ct)
    {
        var history = await _dealService.GetHistoryAsync(dealId, ct);
        return Ok(history);
    }

    [HttpGet("party/{partyId:guid}")]
    public async Task<ActionResult<IReadOnlyList<DealResponse>>> ListForParty(Guid partyId, CancellationToken ct)
    {
        var deals = await _dealService.ListForPartyAsync(partyId, ct);
        return Ok(deals);
    }

    [HttpPost("{dealId:guid}/transition")]
    public async Task<ActionResult<DealResponse>> Transition(Guid dealId, TransitionDealRequest request, CancellationToken ct)
    {
        var deal = await _dealService.TransitionAsync(dealId, request.NewStatus, CurrentUserId(), request.Reason, ct);
        return Ok(deal);
    }

    private Guid CurrentUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);
}
