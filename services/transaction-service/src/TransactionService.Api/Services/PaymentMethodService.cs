using System.Net;
using Microsoft.EntityFrameworkCore;
using TransactionService.Api.Contracts;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;
using TransactionService.Infrastructure.Persistence;

namespace TransactionService.Api.Services;

public class PaymentMethodService : IPaymentMethodService
{
    private readonly TransactionDbContext _db;

    public PaymentMethodService(TransactionDbContext db)
    {
        _db = db;
    }

    public async Task<PaymentMethodResponse> AddAsync(Guid userId, string type, string? provider, string? externalToken, string? last4, bool isDefault, CancellationToken ct)
    {
        var wallet = await FindWalletAsync(userId, ct);

        if (isDefault)
        {
            await ClearDefaultAsync(wallet.WalletId, ct);
        }

        var paymentMethod = new PaymentMethod
        {
            PaymentMethodId = Guid.NewGuid(),
            WalletId = wallet.WalletId,
            Type = type,
            Provider = provider,
            ExternalToken = externalToken,
            Last4 = last4,
            IsDefault = isDefault,
            Status = PaymentMethodStatus.Active.ToDbValue(),
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.PaymentMethods.Add(paymentMethod);
        await _db.SaveChangesAsync(ct);

        return ToResponse(paymentMethod);
    }

    public async Task<IReadOnlyList<PaymentMethodResponse>> ListAsync(Guid userId, CancellationToken ct)
    {
        var wallet = await FindWalletAsync(userId, ct);

        var paymentMethods = await _db.PaymentMethods
            .Where(pm => pm.WalletId == wallet.WalletId)
            .OrderByDescending(pm => pm.CreatedAt)
            .ToListAsync(ct);

        return paymentMethods.Select(ToResponse).ToList();
    }

    public async Task<PaymentMethodResponse> SetDefaultAsync(Guid userId, Guid paymentMethodId, CancellationToken ct)
    {
        var wallet = await FindWalletAsync(userId, ct);
        var paymentMethod = await FindOwnedAsync(wallet.WalletId, paymentMethodId, ct);

        if (paymentMethod.Status != PaymentMethodStatus.Active.ToDbValue())
        {
            throw new TransactionDomainException(HttpStatusCode.BadRequest, "This payment method is not active.");
        }

        await ClearDefaultAsync(wallet.WalletId, ct);
        paymentMethod.IsDefault = true;

        await _db.SaveChangesAsync(ct);

        return ToResponse(paymentMethod);
    }

    public async Task RemoveAsync(Guid userId, Guid paymentMethodId, CancellationToken ct)
    {
        var wallet = await FindWalletAsync(userId, ct);
        var paymentMethod = await FindOwnedAsync(wallet.WalletId, paymentMethodId, ct);

        paymentMethod.Status = PaymentMethodStatus.Removed.ToDbValue();
        paymentMethod.IsDefault = false;

        await _db.SaveChangesAsync(ct);
    }

    private async Task ClearDefaultAsync(Guid walletId, CancellationToken ct)
    {
        var currentDefaults = await _db.PaymentMethods
            .Where(pm => pm.WalletId == walletId && pm.IsDefault)
            .ToListAsync(ct);

        foreach (var paymentMethod in currentDefaults)
        {
            paymentMethod.IsDefault = false;
        }
    }

    private async Task<Wallet> FindWalletAsync(Guid userId, CancellationToken ct)
    {
        return await _db.Wallets.FirstOrDefaultAsync(w => w.UserId == userId, ct)
            ?? throw new TransactionDomainException(HttpStatusCode.NotFound, "No wallet found for this user.");
    }

    private async Task<PaymentMethod> FindOwnedAsync(Guid walletId, Guid paymentMethodId, CancellationToken ct)
    {
        return await _db.PaymentMethods.FirstOrDefaultAsync(pm => pm.PaymentMethodId == paymentMethodId && pm.WalletId == walletId, ct)
            ?? throw new TransactionDomainException(HttpStatusCode.NotFound, "Payment method not found.");
    }

    private static PaymentMethodResponse ToResponse(PaymentMethod paymentMethod) => new(
        paymentMethod.PaymentMethodId,
        paymentMethod.WalletId,
        paymentMethod.Type,
        paymentMethod.Provider,
        paymentMethod.Last4,
        paymentMethod.IsDefault,
        paymentMethod.Status,
        paymentMethod.CreatedAt);
}
