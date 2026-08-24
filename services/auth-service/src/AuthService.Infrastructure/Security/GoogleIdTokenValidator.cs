using AuthService.Infrastructure.Options;
using Google.Apis.Auth;
using Microsoft.Extensions.Options;

namespace AuthService.Infrastructure.Security;

public record GoogleUserInfo(string Subject, string Email, bool EmailVerified);

public interface IGoogleIdTokenValidator
{
    Task<GoogleUserInfo?> ValidateAsync(string idToken);
}

/// <summary>
/// Verifies the token's signature against Google's published keys and checks the
/// audience claim against our Client ID. No client secret involved: this is pure
/// verification of a token Google already signed, not a server-to-server exchange.
/// </summary>
public class GoogleIdTokenValidator : IGoogleIdTokenValidator
{
    private readonly GoogleOptions _options;

    public GoogleIdTokenValidator(IOptions<GoogleOptions> options)
    {
        _options = options.Value;
    }

    public async Task<GoogleUserInfo?> ValidateAsync(string idToken)
    {
        try
        {
            var settings = new GoogleJsonWebSignature.ValidationSettings
            {
                Audience = new[] { _options.ClientId }
            };

            var payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);
            return new GoogleUserInfo(payload.Subject, payload.Email, payload.EmailVerified);
        }
        catch (InvalidJwtException)
        {
            return null;
        }
    }
}
