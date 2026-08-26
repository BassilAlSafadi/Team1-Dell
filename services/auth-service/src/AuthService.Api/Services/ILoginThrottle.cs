namespace AuthService.Api.Services;

/// <summary>
/// Failed-login tracking. Nothing in this service used to count failed attempts: there was no
/// lockout, no backoff and no signal, so the only brute-force barrier was the gateway's rate
/// limit — which keyed on a spoofable header.
/// </summary>
public interface ILoginThrottle
{
    /// <summary>Throws AuthDomainException(429) when this identifier is currently locked out.</summary>
    Task EnsureNotLockedAsync(string email, string? clientIp, CancellationToken ct);

    Task RecordFailureAsync(string email, string? clientIp, CancellationToken ct);

    Task ResetAsync(string email, string? clientIp, CancellationToken ct);
}
