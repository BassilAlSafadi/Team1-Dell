using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;
using TransactionService.Api.Services;
using TransactionService.Infrastructure.Caching;
using TransactionService.Infrastructure.Options;

namespace TransactionService.Api.Identity;

/// <summary>
/// Resolves auth-service user id -> marketplace account ids by calling marketplace-service's
/// internal lookup, memoised in Redis.
///
/// The cache matters: this runs on every authorization check in the service, so without it each
/// deal read would add a cross-service round trip. The TTL is short because the blast radius of
/// a stale entry is "a user who just created a vendor profile can't act as that vendor yet",
/// which self-heals, whereas a long TTL would also delay revoking access.
/// </summary>
public class MarketplaceAccountResolver : IMarketplaceAccountResolver
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(2);

    private readonly HttpClient _http;
    private readonly IRedisCache _cache;
    private readonly InternalOptions _options;

    public MarketplaceAccountResolver(HttpClient http, IRedisCache cache, IOptions<InternalOptions> options)
    {
        _http = http;
        _cache = cache;
        _options = options.Value;
    }

    public async Task<MarketplaceAccounts> ResolveAsync(Guid userId, CancellationToken ct)
    {
        var cacheKey = $"cache:transaction:mp-accounts:{userId}";

        var cached = await _cache.GetStringAsync(cacheKey);
        if (cached is not null)
        {
            var hit = JsonSerializer.Deserialize<CachedAccounts>(cached);
            if (hit is not null)
            {
                return new MarketplaceAccounts(userId, hit.VendorId, hit.CorporateId);
            }
        }

        if (string.IsNullOrWhiteSpace(_options.ServiceToken) || string.IsNullOrWhiteSpace(_options.MarketplaceRestAddr))
        {
            throw new TransactionDomainException(
                HttpStatusCode.ServiceUnavailable,
                "Account resolution is not configured; cannot authorize this request.");
        }

        var payload = await GetAsync<MarketplaceAccountsPayload>($"internal/accounts/{userId}", ct);

        var accounts = new MarketplaceAccounts(userId, payload?.VendorId, payload?.CorporateId);

        await _cache.SetStringAsync(
            cacheKey,
            JsonSerializer.Serialize(new CachedAccounts(accounts.VendorId, accounts.CorporateId)),
            CacheTtl);

        return accounts;
    }

    private async Task<T?> GetAsync<T>(string path, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_options.ServiceToken) || string.IsNullOrWhiteSpace(_options.MarketplaceRestAddr))
        {
            throw new TransactionDomainException(
                HttpStatusCode.ServiceUnavailable,
                "Account resolution is not configured; cannot authorize this request.");
        }

        try
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Get, $"{_options.MarketplaceRestAddr!.TrimEnd('/')}/{path}");
            request.Headers.TryAddWithoutValidation("X-Internal-Token", _options.ServiceToken);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var response = await _http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                throw new TransactionDomainException(
                    HttpStatusCode.ServiceUnavailable,
                    "Could not verify account ownership; please retry.");
            }

            return await response.Content.ReadFromJsonAsync<T>(cancellationToken: ct);
        }
        catch (TransactionDomainException)
        {
            throw;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            // Fail closed — see IMarketplaceAccountResolver.
            throw new TransactionDomainException(
                HttpStatusCode.ServiceUnavailable,
                "Could not verify account ownership; please retry.");
        }
    }

    public async Task<Guid> ResolveOwnerAsync(Guid accountId, CancellationToken ct)
    {
        var cacheKey = $"cache:transaction:mp-owner:{accountId}";

        var cached = await _cache.GetStringAsync(cacheKey);
        if (cached is not null && Guid.TryParse(cached, out var hit))
        {
            return hit;
        }

        var payload = await GetAsync<AccountOwnerPayload>($"internal/accounts/owner/{accountId}", ct)
            ?? throw new TransactionDomainException(
                HttpStatusCode.ServiceUnavailable, "Could not resolve the account owner; please retry.");

        await _cache.SetStringAsync(cacheKey, payload.UserId.ToString(), CacheTtl);

        return payload.UserId;
    }

    private sealed record MarketplaceAccountsPayload(Guid UserId, Guid? VendorId, Guid? CorporateId);
    private sealed record AccountOwnerPayload(Guid AccountId, Guid UserId, string Kind);
    private sealed record CachedAccounts(Guid? VendorId, Guid? CorporateId);
}
