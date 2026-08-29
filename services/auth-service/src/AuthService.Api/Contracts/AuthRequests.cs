using System.ComponentModel.DataAnnotations;
using AuthService.Api.Services;

namespace AuthService.Api.Contracts;

// These records previously carried no validation attributes at all, so [ApiController]'s
// automatic model validation had nothing to enforce: a null email reached string.Trim() and
// surfaced as an unauthenticated 500, and a one-character password was accepted and hashed.
//
// PasswordPolicy.MinimumLength is the single source of truth for password length, applied
// identically on registration and on password reset.

public record RegisterRequest(
    [Required, EmailAddress, StringLength(254)] string Email,
    [Required, StringLength(PasswordPolicy.MaximumLength, MinimumLength = PasswordPolicy.MinimumLength)] string Password,
    [RegularExpression("^(VENDOR|CORPORATE)$", ErrorMessage = "accountType must be VENDOR or CORPORATE.")] string? AccountType = null);

public record LoginRequest(
    [Required, EmailAddress, StringLength(254)] string Email,
    [Required, StringLength(PasswordPolicy.MaximumLength)] string Password);

public record GoogleLoginRequest(
    [Required, StringLength(4096)] string IdToken);

public record RefreshRequest(
    [Required, StringLength(512)] string RefreshToken);

public record LogoutRequest(
    [Required, StringLength(512)] string RefreshToken);

// Confirmation is the account's own email, retyped by the user (the frontend blocks paste so
// it has to be typed by hand). Checked server-side too — a mismatch is a 400, never a delete.
public record DeleteAccountRequest(
    [Required, StringLength(254)] string Confirmation);

public record SendVerificationCodeRequest(
    [Required, EmailAddress, StringLength(254)] string Email);

public record ConfirmVerificationCodeRequest(
    [Required, EmailAddress, StringLength(254)] string Email,
    [Required, StringLength(16)] string Code);

public record RequestPasswordResetRequest(
    [Required, EmailAddress, StringLength(254)] string Email);

public record ConfirmPasswordResetRequest(
    [Required, EmailAddress, StringLength(254)] string Email,
    [Required, StringLength(512)] string Token,
    [Required, StringLength(PasswordPolicy.MaximumLength, MinimumLength = PasswordPolicy.MinimumLength)] string NewPassword);
