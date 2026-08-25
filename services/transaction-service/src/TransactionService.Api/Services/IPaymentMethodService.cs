using TransactionService.Api.Contracts;

namespace TransactionService.Api.Services;

public interface IPaymentMethodService
{
    Task<PaymentMethodResponse> AddAsync(Guid userId, string type, string? provider, string? externalToken, string? last4, bool isDefault, CancellationToken ct);
    Task<IReadOnlyList<PaymentMethodResponse>> ListAsync(Guid userId, CancellationToken ct);
    Task<PaymentMethodResponse> SetDefaultAsync(Guid userId, Guid paymentMethodId, CancellationToken ct);
    Task RemoveAsync(Guid userId, Guid paymentMethodId, CancellationToken ct);
}
