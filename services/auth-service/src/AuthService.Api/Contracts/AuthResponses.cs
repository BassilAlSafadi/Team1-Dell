namespace AuthService.Api.Contracts;

public record TokenResponse(string AccessToken, string RefreshToken, DateTimeOffset AccessTokenExpiresAt);
public record UserResponse(Guid UserId, string Email, bool EmailVerified, string Status, IReadOnlyList<string> Roles);
public record MessageResponse(string Message);
