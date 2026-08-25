using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TransactionService.Api.Contracts;
using TransactionService.Api.Services;

namespace TransactionService.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/payment-methods")]
public class PaymentMethodsController : ControllerBase
{
    private readonly IPaymentMethodService _paymentMethodService;

    public PaymentMethodsController(IPaymentMethodService paymentMethodService)
    {
        _paymentMethodService = paymentMethodService;
    }

    [HttpPost]
    public async Task<ActionResult<PaymentMethodResponse>> Add(AddPaymentMethodRequest request, CancellationToken ct)
    {
        var paymentMethod = await _paymentMethodService.AddAsync(
            CurrentUserId(), request.Type, request.Provider, request.ExternalToken, request.Last4, request.IsDefault, ct);
        return Ok(paymentMethod);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PaymentMethodResponse>>> List(CancellationToken ct)
    {
        var paymentMethods = await _paymentMethodService.ListAsync(CurrentUserId(), ct);
        return Ok(paymentMethods);
    }

    [HttpPost("{paymentMethodId:guid}/default")]
    public async Task<ActionResult<PaymentMethodResponse>> SetDefault(Guid paymentMethodId, CancellationToken ct)
    {
        var paymentMethod = await _paymentMethodService.SetDefaultAsync(CurrentUserId(), paymentMethodId, ct);
        return Ok(paymentMethod);
    }

    [HttpDelete("{paymentMethodId:guid}")]
    public async Task<IActionResult> Remove(Guid paymentMethodId, CancellationToken ct)
    {
        await _paymentMethodService.RemoveAsync(CurrentUserId(), paymentMethodId, ct);
        return NoContent();
    }

    private Guid CurrentUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);
}
