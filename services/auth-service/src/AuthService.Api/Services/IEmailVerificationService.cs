namespace AuthService.Api.Services;

public interface IEmailVerificationService
{
    Task SendCodeAsync(string email, CancellationToken ct);
    Task ConfirmCodeAsync(string email, string code, CancellationToken ct);
}
