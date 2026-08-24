namespace AuthService.Api.Contracts;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);
public record GoogleLoginRequest(string IdToken);
public record RefreshRequest(string RefreshToken);
public record LogoutRequest(string RefreshToken);

public record SendVerificationCodeRequest(string Email);
public record ConfirmVerificationCodeRequest(string Email, string Code);

public record RequestPasswordResetRequest(string Email);
public record ConfirmPasswordResetRequest(string Email, string Token, string NewPassword);
