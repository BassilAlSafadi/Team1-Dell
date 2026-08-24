namespace AuthService.Api.Services;

public interface IPasswordResetService
{
    Task RequestResetAsync(string email, CancellationToken ct);
    Task ConfirmResetAsync(string email, string token, string newPassword, CancellationToken ct);
}
