using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TransactionService.Api.Contracts;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;
using TransactionService.Infrastructure.Caching;
using TransactionService.Infrastructure.Persistence;

namespace TransactionService.Api.Services;

public class WalletService : IWalletService
{
    private static readonly TimeSpan WalletCacheTtl = TimeSpan.FromSeconds(20);

    private readonly TransactionDbContext _db;
    private readonly IRedisCache _cache;

    public WalletService(TransactionDbContext db, IRedisCache cache)
    {
        _db = db;
        _cache = cache;
    }

    public async Task<WalletResponse> CreateWalletAsync(Guid userId, string currency, CancellationToken ct)
    {
        var exists = await _db.Wallets.AnyAsync(w => w.UserId == userId, ct);
        if (exists)
        {
            throw new TransactionDomainException(HttpStatusCode.Conflict, "A wallet already exists for this user.");
        }

        var now = DateTimeOffset.UtcNow;
        var wallet = new Wallet
        {
            WalletId = Guid.NewGuid(),
            UserId = userId,
            Balance = 0,
            Currency = currency,
            Status = WalletStatus.Active.ToDbValue(),
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Wallets.Add(wallet);
        await _db.SaveChangesAsync(ct);

        return ToResponse(wallet);
    }

    public async Task<WalletResponse> GetWalletAsync(Guid userId, CancellationToken ct)
    {
        // Cache-aside + write-invalidation (not pure TTL) — a stale balance right after a
        // top-up/withdrawal/payment is a real user-facing bug, unlike the read-only lookups
        // elsewhere in this service. See REDIS_INTEGRATION_PLAN.md §2.
        var cacheKey = WalletCacheKey(userId);
        var cached = await _cache.GetStringAsync(cacheKey);
        if (cached is not null)
        {
            var cachedWallet = JsonSerializer.Deserialize<WalletResponse>(cached);
            if (cachedWallet is not null)
            {
                return cachedWallet;
            }
        }

        var wallet = await FindWalletAsync(userId, ct);
        var response = ToResponse(wallet);

        await _cache.SetStringAsync(cacheKey, JsonSerializer.Serialize(response), WalletCacheTtl);

        return response;
    }

    public async Task<IReadOnlyList<WalletTransactionResponse>> GetTransactionsAsync(Guid userId, CancellationToken ct)
    {
        var wallet = await FindWalletAsync(userId, ct);

        var transactions = await _db.WalletTransactions
            .Where(wt => wt.WalletId == wallet.WalletId)
            .OrderByDescending(wt => wt.CreatedAt)
            .ToListAsync(ct);

        return transactions.Select(ToResponse).ToList();
    }

    public async Task<WalletTransactionResponse> TopUpAsync(Guid userId, decimal amount, string currency, Guid? paymentMethodId, CancellationToken ct)
    {
        if (amount <= 0)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "Top-up amount must be positive.");
        }

        var wallet = await FindWalletAsync(userId, ct);
        RequireActive(wallet);

        PaymentMethod? paymentMethod = null;
        if (paymentMethodId is not null)
        {
            paymentMethod = await _db.PaymentMethods
                .FirstOrDefaultAsync(pm => pm.PaymentMethodId == paymentMethodId && pm.WalletId == wallet.WalletId, ct)
                ?? throw new TransactionDomainException(HttpStatusCode.NotFound, "Payment method not found.");

            if (paymentMethod.Status != PaymentMethodStatus.Active.ToDbValue())
            {
                throw new TransactionDomainException(HttpStatusCode.BadRequest, "This payment method is not active.");
            }
        }

        var now = DateTimeOffset.UtcNow;
        wallet.Balance += amount;
        wallet.UpdatedAt = now;

        var transaction = new WalletTransaction
        {
            WalletTransactionId = Guid.NewGuid(),
            WalletId = wallet.WalletId,
            PaymentMethodId = paymentMethod?.PaymentMethodId,
            Type = WalletTransactionType.TopUp.ToDbValue(),
            Amount = amount,
            Currency = currency,
            BalanceAfter = wallet.Balance,
            Status = WalletTransactionStatus.Completed.ToDbValue(),
            CreatedAt = now,
            CompletedAt = now
        };

        _db.WalletTransactions.Add(transaction);
        await _db.SaveChangesAsync(ct);
        await _cache.DeleteAsync(WalletCacheKey(userId));

        return ToResponse(transaction);
    }

    public async Task<WalletTransactionResponse> WithdrawAsync(Guid userId, decimal amount, CancellationToken ct)
    {
        if (amount <= 0)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "Withdrawal amount must be positive.");
        }

        var wallet = await FindWalletAsync(userId, ct);
        RequireActive(wallet);

        if (wallet.Balance < amount)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "Insufficient wallet balance.");
        }

        var now = DateTimeOffset.UtcNow;
        wallet.Balance -= amount;
        wallet.UpdatedAt = now;

        var transaction = new WalletTransaction
        {
            WalletTransactionId = Guid.NewGuid(),
            WalletId = wallet.WalletId,
            Type = WalletTransactionType.Withdrawal.ToDbValue(),
            Amount = -amount,
            Currency = wallet.Currency,
            BalanceAfter = wallet.Balance,
            Status = WalletTransactionStatus.Completed.ToDbValue(),
            CreatedAt = now,
            CompletedAt = now
        };

        _db.WalletTransactions.Add(transaction);
        await _db.SaveChangesAsync(ct);
        await _cache.DeleteAsync(WalletCacheKey(userId));

        return ToResponse(transaction);
    }

    public async Task<WalletTransactionResponse> PayForDealAsync(Guid userId, Guid dealId, CancellationToken ct)
    {
        var wallet = await FindWalletAsync(userId, ct);
        RequireActive(wallet);

        var deal = await _db.Deals.FirstOrDefaultAsync(d => d.DealId == dealId, ct)
            ?? throw new TransactionDomainException(HttpStatusCode.NotFound, "Deal not found.");

        if (deal.Status != DealStatus.Agreed.ToDbValue())
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "This deal is not awaiting payment.");
        }

        var alreadyPaid = await _db.WalletTransactions.AnyAsync(wt => wt.DealId == dealId, ct);
        if (alreadyPaid)
        {
            throw new TransactionDomainException(HttpStatusCode.Conflict, "This deal has already been paid.");
        }

        if (wallet.Balance < deal.AgreedAmount)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "Insufficient wallet balance.");
        }

        var now = DateTimeOffset.UtcNow;
        wallet.Balance -= deal.AgreedAmount;
        wallet.UpdatedAt = now;

        var transaction = new WalletTransaction
        {
            WalletTransactionId = Guid.NewGuid(),
            WalletId = wallet.WalletId,
            DealId = deal.DealId,
            Type = WalletTransactionType.Payment.ToDbValue(),
            Amount = -deal.AgreedAmount,
            Currency = deal.Currency,
            BalanceAfter = wallet.Balance,
            Status = WalletTransactionStatus.Completed.ToDbValue(),
            CreatedAt = now,
            CompletedAt = now
        };

        _db.WalletTransactions.Add(transaction);
        await _db.SaveChangesAsync(ct);
        await _cache.DeleteAsync(WalletCacheKey(userId));

        return ToResponse(transaction);
    }

    private async Task<Wallet> FindWalletAsync(Guid userId, CancellationToken ct)
    {
        return await _db.Wallets.FirstOrDefaultAsync(w => w.UserId == userId, ct)
            ?? throw new TransactionDomainException(HttpStatusCode.NotFound, "No wallet found for this user.");
    }

    private static string WalletCacheKey(Guid userId) => $"cache:transaction:wallet:{userId}";

    private static void RequireActive(Wallet wallet)
    {
        if (wallet.Status != WalletStatus.Active.ToDbValue())
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "This wallet is not active.");
        }
    }

    private static WalletResponse ToResponse(Wallet wallet) => new(
        wallet.WalletId, wallet.UserId, wallet.Balance, wallet.Currency, wallet.Status, wallet.CreatedAt, wallet.UpdatedAt);

    private static WalletTransactionResponse ToResponse(WalletTransaction transaction) => new(
        transaction.WalletTransactionId,
        transaction.WalletId,
        transaction.PaymentMethodId,
        transaction.DealId,
        transaction.Type,
        transaction.Amount,
        transaction.Currency,
        transaction.BalanceAfter,
        transaction.ExternalReference,
        transaction.Status,
        transaction.CreatedAt,
        transaction.CompletedAt);
}
