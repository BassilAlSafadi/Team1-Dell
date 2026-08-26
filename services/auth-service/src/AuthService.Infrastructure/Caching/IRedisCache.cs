namespace AuthService.Infrastructure.Caching;

/// <summary>
/// Thin cache-aside + ephemeral-value wrapper over StackExchange.Redis. Every method
/// swallows Redis connectivity failures (logs, returns a cache-miss shape) so an outage
/// never breaks a request path that would otherwise just fall through to Postgres —
/// see REDIS_INTEGRATION_PLAN.md at the repo root.
/// </summary>
public interface IRedisCache
{
    Task<string?> GetStringAsync(string key);
    Task SetStringAsync(string key, string value, TimeSpan ttl);
    Task DeleteAsync(string key);
}
