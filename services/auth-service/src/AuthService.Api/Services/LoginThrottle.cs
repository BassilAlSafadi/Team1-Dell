using System.Globalization;
using System.Net;
using AuthService.Infrastructure.Caching;

namespace AuthService.Api.Services;

/// <summary>
/// Redis-backed failed-login counters with a lockout window, keyed independently on the account
/// and on the client IP so that neither a single targeted account nor a single source can be
/// hammered.
///
/// The lockout response is deliberately identical whether or not the account exists, so this
/// cannot be turned into the account-enumeration oracle it is meant to help close.
/// </summary>
public class LoginThrottle : ILoginThrottle
{
    // Per-account: tight, because a legitimate user rarely gets it wrong 5 times in 15 minutes.
    private const int MaxAccountFailures = 5;
    private static readonly TimeSpan AccountWindow = TimeSpan.FromMinutes(15);

    // Per-IP: looser, because a shared office NAT can legitimately produce several users' typos.
    private const int MaxIpFailures = 30;
    private static readonly TimeSpan IpWindow = TimeSpan.FromMinutes(15);

    private readonly IRedisCache _cache;

    public LoginThrottle(IRedisCache cache)
    {
        _cache = cache;
    }

    public async Task EnsureNotLockedAsync(string email, string? clientIp, CancellationToken ct)
    {
        if (await CountAsync(AccountKey(email)) >= MaxAccountFailures)
        {
            throw new AuthDomainException(
                HttpStatusCode.TooManyRequests,
                "Too many failed sign-in attempts. Please wait a few minutes and try again.");
        }

        if (clientIp is not null && await CountAsync(IpKey(clientIp)) >= MaxIpFailures)
        {
            throw new AuthDomainException(
                HttpStatusCode.TooManyRequests,
                "Too many failed sign-in attempts. Please wait a few minutes and try again.");
        }
    }

    public async Task RecordFailureAsync(string email, string? clientIp, CancellationToken ct)
    {
        await IncrementAsync(AccountKey(email), AccountWindow);
        if (clientIp is not null)
        {
            await IncrementAsync(IpKey(clientIp), IpWindow);
        }
    }

    public async Task ResetAsync(string email, string? clientIp, CancellationToken ct)
    {
        await _cache.DeleteAsync(AccountKey(email));
        if (clientIp is not null)
        {
            await _cache.DeleteAsync(IpKey(clientIp));
        }
    }

    private async Task<int> CountAsync(string key)
    {
        var raw = await _cache.GetStringAsync(key);
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : 0;
    }

    // Read-modify-write rather than INCR because IRedisCache only exposes string get/set. A lost
    // increment under concurrency undercounts slightly, which is acceptable here: this is a
    // brute-force speed bump, not an accounting ledger, and the window still expires.
    private async Task IncrementAsync(string key, TimeSpan window)
    {
        var next = await CountAsync(key) + 1;
        await _cache.SetStringAsync(key, next.ToString(CultureInfo.InvariantCulture), window);
    }

    private static string AccountKey(string email) => $"throttle:login:account:{email.Trim().ToLowerInvariant()}";
    private static string IpKey(string clientIp) => $"throttle:login:ip:{clientIp}";
}
