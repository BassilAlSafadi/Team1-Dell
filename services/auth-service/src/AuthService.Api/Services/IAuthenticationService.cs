using AuthService.Api.Contracts;

namespace AuthService.Api.Services;

public interface IAuthenticationService
{
    Task<UserResponse> RegisterAsync(string email, string password, string? accountType, CancellationToken ct);
    Task<TokenResponse> LoginAsync(string email, string password, string? clientIp, CancellationToken ct);
    Task<TokenResponse> LoginWithGoogleAsync(string idToken, CancellationToken ct);
    Task<TokenResponse> RefreshAsync(string refreshToken, CancellationToken ct);
    Task LogoutAsync(string refreshToken, CancellationToken ct);
    Task DeleteAccountAsync(Guid userId, string confirmation, CancellationToken ct);
    Task<UserResponse> GetUserAsync(Guid userId, CancellationToken ct);
}
