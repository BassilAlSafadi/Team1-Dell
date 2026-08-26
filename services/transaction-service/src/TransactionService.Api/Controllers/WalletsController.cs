using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TransactionService.Api.Contracts;
using TransactionService.Api.Identity;
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
        var wallet = await _walletService.CreateWalletAsync(this.CurrentUserId(), request.Currency, ct);
        return Ok(wallet);
    }

    [HttpGet("me")]
    public async Task<ActionResult<WalletResponse>> GetMine(CancellationToken ct)
    {
        var wallet = await _walletService.GetWalletAsync(this.CurrentUserId(), ct);
        return Ok(wallet);
    }

    [HttpGet("me/transactions")]
    public async Task<ActionResult<IReadOnlyList<WalletTransactionResponse>>> GetTransactions(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var transactions = await _walletService.GetTransactionsAsync(this.CurrentUserId(), page, pageSize, ct);
        return Ok(transactions);
    }

    [HttpPost("me/top-up")]
    public async Task<ActionResult<WalletTransactionResponse>> TopUp(TopUpRequest request, CancellationToken ct)
    {
        var transaction = await _walletService.TopUpAsync(this.CurrentUserId(), request.Amount, request.Currency, request.PaymentMethodId, ct);
        return Ok(transaction);
    }

    [HttpPost("me/withdraw")]
    public async Task<ActionResult<WalletTransactionResponse>> Withdraw(WithdrawRequest request, CancellationToken ct)
    {
        var transaction = await _walletService.WithdrawAsync(this.CurrentUserId(), request.Amount, ct);
        return Ok(transaction);
    }

    [HttpPost("me/pay")]
    public async Task<ActionResult<WalletTransactionResponse>> Pay(PayForDealRequest request, CancellationToken ct)
    {
        var transaction = await _walletService.PayForDealAsync(this.CurrentUserId(), request.DealId, ct);
        return Ok(transaction);
    }

}
