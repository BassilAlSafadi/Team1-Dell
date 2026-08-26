using System.Net;

namespace AuthService.Api.Services;

/// <summary>
/// The one place password rules are defined, so registration and password reset cannot drift
/// apart. Before this, neither path enforced any rule whatsoever.
///
/// Length is the requirement that actually matters; character-class rules mostly push people
/// toward predictable substitutions without adding real entropy, so this checks length plus a
/// small denylist of the passwords that get tried first in any credential-stuffing run.
/// </summary>
public static class PasswordPolicy
{
    public const int MinimumLength = 12;
    public const int MaximumLength = 256;

    private static readonly HashSet<string> Denylist = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "password1", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
        "123456789012", "1234567890123", "qwertyuiop", "qwerty123456", "letmein12345",
        "administrator", "iloveyou1234", "welcome12345", "changeme1234", "abc123456789",
        "monkey123456", "football1234", "baseball1234", "trustno1234", "dragon123456",
    };

    /// <summary>Throws AuthDomainException(400) when the password is unacceptable.</summary>
    public static void Validate(string? password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < MinimumLength)
        {
            throw new AuthDomainException(
                HttpStatusCode.BadRequest,
                $"Password must be at least {MinimumLength} characters.");
        }

        if (password.Length > MaximumLength)
        {
            throw new AuthDomainException(
                HttpStatusCode.BadRequest,
                $"Password must be at most {MaximumLength} characters.");
        }

        if (Denylist.Contains(password.Trim()))
        {
            throw new AuthDomainException(
                HttpStatusCode.BadRequest,
                "That password is too common. Please choose a different one.");
        }
    }
}
