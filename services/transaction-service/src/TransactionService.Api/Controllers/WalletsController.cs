using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TransactionService.Api.Contracts;
using TransactionService.Api.Services;

namespace TransactionService.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/wallets")]
public class WalletsController : ControllerBase
{
    private readonly IWalletService _walletService;

    public WalletsController(IWalletService walletService)
    {
        _walletService = walletService;
    }

    [HttpPost]
    public async Task<ActionResult<WalletResponse>> Create(CreateWalletRequest request, CancellationToken ct)
    {
        var wallet = await _walletService.CreateWalletAsync(CurrentUserId(), request.Currency, ct);
        return Ok(wallet);
    }

    [HttpGet("me")]
    public async Task<ActionResult<WalletResponse>> GetMine(CancellationToken ct)
    {
        var wallet = await _walletService.GetWalletAsync(CurrentUserId(), ct);
        return Ok(wallet);
    }

    [HttpGet("me/transactions")]
    public async Task<ActionResult<IReadOnlyList<WalletTransactionResponse>>> GetTransactions(CancellationToken ct)
    {
        var transactions = await _walletService.GetTransactionsAsync(CurrentUserId(), ct);
        return Ok(transactions);
    }

    [HttpPost("me/top-up")]
    public async Task<ActionResult<WalletTransactionResponse>> TopUp(TopUpRequest request, CancellationToken ct)
    {
        var transaction = await _walletService.TopUpAsync(CurrentUserId(), request.Amount, request.Currency, request.PaymentMethodId, ct);
        return Ok(transaction);
    }

    [HttpPost("me/withdraw")]
    public async Task<ActionResult<WalletTransactionResponse>> Withdraw(WithdrawRequest request, CancellationToken ct)
    {
        var transaction = await _walletService.WithdrawAsync(CurrentUserId(), request.Amount, ct);
        return Ok(transaction);
    }

    [HttpPost("me/pay")]
    public async Task<ActionResult<WalletTransactionResponse>> Pay(PayForDealRequest request, CancellationToken ct)
    {
        var transaction = await _walletService.PayForDealAsync(CurrentUserId(), request.DealId, ct);
        return Ok(transaction);
    }

    private Guid CurrentUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);
}
