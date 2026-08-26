using AuthService.Infrastructure.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace AuthService.Infrastructure.Caching;

public class RedisCache : IRedisCache
{
    private readonly string _connectionString;
    private readonly ILogger<RedisCache> _logger;
    private readonly SemaphoreSlim _connectLock = new(1, 1);
    private IConnectionMultiplexer? _multiplexer;

    public RedisCache(IOptions<RedisOptions> options, ILogger<RedisCache> logger)
    {
        _connectionString = options.Value.ConnectionString;
        _logger = logger;
    }

    public async Task<string?> GetStringAsync(string key)
    {
        var db = await TryGetDatabaseAsync();
        if (db is null)
        {
            return null;
        }

        try
        {
            return await db.StringGetAsync(key);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis GET failed for {Key}; treating as a cache miss.", key);
            return null;
        }
    }

    public async Task SetStringAsync(string key, string value, TimeSpan ttl)
    {
        var db = await TryGetDatabaseAsync();
        if (db is null)
        {
            return;
        }

        try
        {
            await db.StringSetAsync(key, value, ttl);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis SET failed for {Key}; continuing without caching it.", key);
        }
    }

    public async Task DeleteAsync(string key)
    {
        var db = await TryGetDatabaseAsync();
        if (db is null)
        {
            return;
        }

        try
        {
            await db.KeyDeleteAsync(key);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis DEL failed for {Key}.", key);
        }
    }

    // Connects lazily (never at app startup, so a placeholder/unreachable connection string
    // never crashes the host) and retries on every call until a connection succeeds once;
    // StackExchange.Redis handles reconnection internally after that.
    private async Task<IDatabase?> TryGetDatabaseAsync()
    {
        if (_multiplexer is { IsConnected: true })
        {
            return _multiplexer.GetDatabase();
        }

        await _connectLock.WaitAsync();
        try
        {
            if (_multiplexer is { IsConnected: true })
            {
                return _multiplexer.GetDatabase();
            }

            _multiplexer = await ConnectionMultiplexer.ConnectAsync(_connectionString);
            return _multiplexer.GetDatabase();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis is unavailable; skipping cache for this call.");
            return null;
        }
        finally
        {
            _connectLock.Release();
        }
    }
}
