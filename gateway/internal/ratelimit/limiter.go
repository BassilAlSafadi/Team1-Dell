// Package ratelimit implements the gateway's rate limiter. Backed by Redis from the start (see
// REDIS_INTEGRATION_PLAN.md decision (d)) — keys live under the "ratelimit:" prefix, sharing the
// same Redis instance every other service's cache-aside layer and auth-service's email
// verification use, kept apart by that prefix rather than a logical DB (portability with
// managed/serverless Redis tiers that don't support multiple DBs).
package ratelimit

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// Limiter is intentionally an interface even though Redis is the only implementation — it's
// the seam a test double or a future alternative backend would plug into, not a placeholder
// for "build the real one later" (decision (d) explicitly rejects that sequencing).
type Limiter interface {
	Allow(ctx context.Context, key string) (bool, error)
}

// tokenBucketScript implements a token bucket entirely inside Redis so the check-and-decrement
// is atomic across concurrent requests. KEYS[1] is the bucket key; ARGV: capacity, refill rate
// (tokens/sec), now (unix seconds), requested cost (always 1 here).
const tokenBucketScript = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local bucket = redis.call("HMGET", key, "tokens", "updated_at")
local tokens = tonumber(bucket[1])
local updated_at = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  updated_at = now
end

local elapsed = math.max(0, now - updated_at)
tokens = math.min(capacity, tokens + elapsed * refill_rate)

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

redis.call("HSET", key, "tokens", tokens, "updated_at", now)
redis.call("EXPIRE", key, 60)

return allowed
`

type RedisLimiter struct {
	client *redis.Client
	rps    int
	burst  int
	script *redis.Script
}

func NewRedisLimiter(redisURL string, rps, burst int) (*RedisLimiter, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}

	return &RedisLimiter{
		client: redis.NewClient(opts),
		rps:    rps,
		burst:  burst,
		script: redis.NewScript(tokenBucketScript),
	}, nil
}

func (l *RedisLimiter) Allow(ctx context.Context, key string) (bool, error) {
	result, err := l.script.Run(ctx, l.client, []string{"ratelimit:" + key},
		l.burst, l.rps, time.Now().Unix(), 1,
	).Int()
	if err != nil {
		return false, err
	}
	return result == 1, nil
}

func (l *RedisLimiter) Close() error {
	return l.client.Close()
}
