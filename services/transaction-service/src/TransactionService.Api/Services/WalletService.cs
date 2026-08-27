using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TransactionService.Api.Contracts;
using TransactionService.Api.Identity;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;
using TransactionService.Infrastructure.Caching;
using TransactionService.Infrastructure.Persistence;

namespace TransactionService.Api.Services;

public class WalletService : IWalletService
{
    private static readonly TimeSpan WalletCacheTtl = TimeSpan.FromSeconds(20);
    private const int MaxPageSize = 100;

    // Balance mutations are retried on a lost optimistic-concurrency race. Contention on a single
    // wallet is low (it is one user's own wallet), so a small bound is plenty; exceeding it means
    // something pathological is happening and the caller should be told rather than kept waiting.
    private const int MaxConcurrencyRetries = 3;

    private readonly TransactionDbContext _db;
    private readonly IRedisCache _cache;
    private readonly IMarketplaceAccountResolver _accounts;

    public WalletService(TransactionDbContext db, IRedisCache cache, IMarketplaceAccountResolver accounts)
    {
        _db = db;
        _cache = cache;
        _accounts = accounts;
    }

    public async Task<WalletResponse> CreateWalletAsync(Guid userId, string currency, CancellationToken ct)
    {
        OfferService.ValidateCurrency(currency);

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
            Currency = currency.ToUpperInvariant(),
            Status = WalletStatus.Active.ToDbValue(),
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Wallets.Add(wallet);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // uq_wallet_user_id lost a race with a concurrent create; report it as the conflict
            // it is rather than letting the constraint violation surface as a 500.
            _db.ChangeTracker.Clear();
            if (await WalletExistsAsync(userId, ct))
            {
                throw new TransactionDomainException(HttpStatusCode.Conflict, "A wallet already exists for this user.");
            }

            throw;
        }

        return ToResponse(wallet);
    }

    public async Task<WalletResponse> GetWalletAsync(Guid userId, CancellationToken ct)
    {
        // Cache-aside + write-invalidation (not pure TTL) — a stale balance right after a
        // top-up/withdrawal/payment is a real user-facing bug.
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

    public async Task<IReadOnlyList<WalletTransactionResponse>> GetTransactionsAsync(
        Guid userId, int page, int pageSize, CancellationToken ct)
    {
        var wallet = await FindWalletAsync(userId, ct);

        (page, pageSize) = Paging.Clamp(page, pageSize, MaxPageSize);

        var transactions = await _db.WalletTransactions
            .Where(wt => wt.WalletId == wallet.WalletId)
            .OrderByDescending(wt => wt.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return transactions.Select(ToResponse).ToList();
    }

    public async Task<WalletTransactionResponse> TopUpAsync(
        Guid userId, decimal amount, string currency, Guid? paymentMethodId, CancellationToken ct)
    {
        if (amount <= 0)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "Top-up amount must be positive.");
        }

        OfferService.ValidateCurrency(currency);

        // Adding funds is the first thing a new user does, and they have no wallet row yet —
        // 404-ing them into a separate "create wallet" call they can't discover made the feature
        // unreachable. The wallet is an implementation detail of having an account, so open one
        // on demand, denominated in the currency being added.
        await EnsureWalletExistsAsync(userId, currency, ct);

        return await MutateBalanceAsync(userId, async wallet =>
        {
            // The currency on the ledger row used to be whatever the request body said, so a
            // top-up could record a different currency from the wallet it credited.
            RequireSameCurrency(currency, wallet.Currency);

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

            return NewTransaction(wallet, WalletTransactionType.TopUp, amount, wallet.Currency, now,
                paymentMethodId: paymentMethod?.PaymentMethodId);
        }, ct);
    }

    public async Task<WalletTransactionResponse> WithdrawAsync(Guid userId, decimal amount, CancellationToken ct)
    {
        if (amount <= 0)
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "Withdrawal amount must be positive.");
        }

        return await MutateBalanceAsync(userId, wallet =>
        {
            if (wallet.Balance < amount)
            {
                throw new TransactionDomainException(HttpStatusCode.BadRequest, "Insufficient wallet balance.");
            }

            var now = DateTimeOffset.UtcNow;
            wallet.Balance -= amount;
            wallet.UpdatedAt = now;

            return Task.FromResult(
                NewTransaction(wallet, WalletTransactionType.Withdrawal, -amount, wallet.Currency, now));
        }, ct);
    }

    /// <summary>
    /// Moves the agreed amount out of the buyer's wallet and into escrow.
    ///
    /// The funds are held rather than credited to the seller immediately: the deal still has to
    /// complete, and DealStatus.Disputed only means something if the money has not already moved.
    /// ReleaseEscrowAsync / RefundEscrowAsync settle it. Previously this method debited the buyer
    /// and credited nobody, so every completed sale destroyed money.
    /// </summary>
    public async Task<WalletTransactionResponse> PayForDealAsync(Guid userId, Guid dealId, CancellationToken ct)
    {
        var deal = await _db.Deals.FirstOrDefaultAsync(d => d.DealId == dealId, ct)
            ?? throw new TransactionDomainException(HttpStatusCode.NotFound, "Deal not found.");

        // Only the buyer pays. This was unchecked, so any user could pay off a deal they had
        // nothing to do with, forcing it into a paid state its real buyer never authorised.
        var caller = await _accounts.ResolveAsync(userId, ct);
        if (!caller.Controls(deal.BuyerId))
        {
            throw new TransactionDomainException(HttpStatusCode.Forbidden, "Only the buyer may pay for this deal.");
        }

        if (deal.Status != DealStatus.Agreed.ToDbValue())
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "This deal is not awaiting payment.");
        }

        return await MutateBalanceAsync(userId, async wallet =>
        {
            RequireSameCurrency(deal.Currency, wallet.Currency);

            var alreadyPaid = await _db.WalletTransactions.AnyAsync(
                wt => wt.DealId == dealId && wt.Type == WalletTransactionType.Payment.ToDbValue(), ct);
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

            return NewTransaction(wallet, WalletTransactionType.Payment, -deal.AgreedAmount, deal.Currency, now,
                dealId: deal.DealId);
        }, ct);
    }

    public async Task ReleaseEscrowAsync(Guid dealId, CancellationToken ct) =>
        await SettleEscrowAsync(dealId, WalletTransactionType.Payout, ct);

    public async Task RefundEscrowAsync(Guid dealId, CancellationToken ct) =>
        await SettleEscrowAsync(dealId, WalletTransactionType.Refund, ct);

    /// <summary>
    /// Credits held escrow to its destination: the seller on completion (PAYOUT), or back to the
    /// buyer on cancellation (REFUND). A no-op when the deal was never paid.
    /// </summary>
    private async Task SettleEscrowAsync(Guid dealId, WalletTransactionType settlement, CancellationToken ct)
    {
        var deal = await _db.Deals.FirstOrDefaultAsync(d => d.DealId == dealId, ct);
        if (deal is null)
        {
            return;
        }

        var paid = await _db.WalletTransactions.AnyAsync(
            wt => wt.DealId == dealId && wt.Type == WalletTransactionType.Payment.ToDbValue(), ct);
        if (!paid)
        {
            // Nothing was ever escrowed for this deal, so there is nothing to settle.
            return;
        }

        var alreadySettled = await _db.WalletTransactions.AnyAsync(
            wt => wt.DealId == dealId
                  && (wt.Type == WalletTransactionType.Payout.ToDbValue()
                      || wt.Type == WalletTransactionType.Refund.ToDbValue()), ct);
        if (alreadySettled)
        {
            return;
        }

        // Wallets are keyed by auth-service user id, but a deal names marketplace account ids, so
        // the destination account has to be resolved back to its owning user first.
        var destinationAccountId = settlement == WalletTransactionType.Payout ? deal.SellerId : deal.BuyerId;
        var ownerUserId = await _accounts.ResolveOwnerAsync(destinationAccountId, ct);

        // A seller who has never topped up has no wallet row, and settlement must not fail
        // because of that — the deal has already moved and the money has already left the buyer.
        await EnsureWalletExistsAsync(ownerUserId, deal.Currency, ct);

        await MutateBalanceAsync(ownerUserId, wallet =>
        {
            RequireSameCurrency(deal.Currency, wallet.Currency);

            var now = DateTimeOffset.UtcNow;
            wallet.Balance += deal.AgreedAmount;
            wallet.UpdatedAt = now;

            return Task.FromResult(
                NewTransaction(wallet, settlement, deal.AgreedAmount, deal.Currency, now, dealId: deal.DealId));
        }, ct);
    }

    /// <summary>
    /// Runs a balance mutation inside a database transaction, retrying when optimistic
    /// concurrency detects a lost update.
    ///
    /// Every caller goes through here so no mutation path can accidentally reintroduce the
    /// unguarded read-check-write that allowed overdrafts. The wallet row and its ledger row are
    /// committed together, which is what the wallet table's own comment always claimed happened.
    /// </summary>
    private async Task<WalletTransactionResponse> MutateBalanceAsync(
        Guid userId, Func<Wallet, Task<WalletTransaction>> mutate, CancellationToken ct)
    {
        // When a caller (a deal transition settling escrow) already has a transaction open, join
        // it instead of opening a competing one, so the status change and the money movement
        // commit or roll back as a unit. Retrying is not possible in that case — rolling back
        // would discard the caller's work too — so the concurrency failure propagates and the
        // whole operation is retried by the client.
        var ambient = _db.Database.CurrentTransaction;

        for (var attempt = 0; ; attempt++)
        {
            var dbTransaction = ambient is null ? await _db.Database.BeginTransactionAsync(ct) : null;

            try
            {
                var wallet = await FindWalletAsync(userId, ct);
                RequireActive(wallet);

                var transaction = await mutate(wallet);
                _db.WalletTransactions.Add(transaction);

                await _db.SaveChangesAsync(ct);

                if (dbTransaction is not null)
                {
                    await dbTransaction.CommitAsync(ct);
                }

                await _cache.DeleteAsync(WalletCacheKey(userId));
                return ToResponse(transaction);
            }
            catch (DbUpdateConcurrencyException) when (dbTransaction is not null && attempt < MaxConcurrencyRetries)
            {
                await dbTransaction.RollbackAsync(ct);

                // Drop the stale tracked state so the next attempt re-reads the committed row and
                // re-runs the balance check against it.
                _db.ChangeTracker.Clear();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (dbTransaction is not null)
                {
                    await dbTransaction.RollbackAsync(ct);
                }

                throw new TransactionDomainException(
                    HttpStatusCode.Conflict,
                    "This wallet is being modified by another request. Please retry.");
            }
            finally
            {
                if (dbTransaction is not null)
                {
                    await dbTransaction.DisposeAsync();
                }
            }
        }
    }

    private static WalletTransaction NewTransaction(
        Wallet wallet, WalletTransactionType type, decimal amount, string currency,
        DateTimeOffset now, Guid? dealId = null, Guid? paymentMethodId = null) => new()
        {
            WalletTransactionId = Guid.NewGuid(),
            WalletId = wallet.WalletId,
            PaymentMethodId = paymentMethodId,
            DealId = dealId,
            Type = type.ToDbValue(),
            Amount = amount,
            Currency = currency,
            BalanceAfter = wallet.Balance,
            Status = WalletTransactionStatus.Completed.ToDbValue(),
            CreatedAt = now,
            CompletedAt = now
        };

    private async Task EnsureWalletExistsAsync(Guid userId, string currency, CancellationToken ct)
    {
        if (await WalletExistsAsync(userId, ct))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        _db.Wallets.Add(new Wallet
        {
            WalletId = Guid.NewGuid(),
            UserId = userId,
            Balance = 0,
            Currency = currency.ToUpperInvariant(),
            Status = WalletStatus.Active.ToDbValue(),
            CreatedAt = now,
            UpdatedAt = now
        });

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // uq_wallet_user_id lost a race with a concurrent create (two top-ups submitted at
            // once). The postcondition — a wallet exists — still holds, so carry on; only
            // re-throw if the failure was something other than that race.
            _db.ChangeTracker.Clear();
            if (!await WalletExistsAsync(userId, ct))
            {
                throw;
            }
        }
    }

    private async Task<bool> WalletExistsAsync(Guid userId, CancellationToken ct) =>
        await _db.Wallets.AnyAsync(w => w.UserId == userId, ct);

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

    private static void RequireSameCurrency(string operationCurrency, string walletCurrency)
    {
        if (!string.Equals(operationCurrency, walletCurrency, StringComparison.OrdinalIgnoreCase))
        {
            throw new TransactionDomainException(
                HttpStatusCode.BadRequest,
                $"Currency mismatch: this wallet is denominated in {walletCurrency}, not {operationCurrency}. "
                + "No conversion is performed.");
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
