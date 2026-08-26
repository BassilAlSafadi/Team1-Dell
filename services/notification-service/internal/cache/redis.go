// Package cache holds the shared Redis client used by the unread-count cache-aside
// layer (see REDIS_INTEGRATION_PLAN.md at the repo root). Every consumer must treat a
// nil client as "cache disabled, go straight to Mongo" — a Redis outage or an unset
// REDIS_URL must never break a request.
package cache

import (
	"log"
	"strings"

	"github.com/redis/go-redis/v9"

	"notification-service/internal/config"
)

// Client builds the shared Redis client from cfg.RedisURL, or returns nil if it's
// unset or still a placeholder. Not memoized here — cmd/server/main.go calls this once
// at startup and threads the single result through, same as the Mongo client/database.
func Client(cfg *config.Config) *redis.Client {
	if cfg.RedisURL == "" || strings.HasPrefix(cfg.RedisURL, "CHANGE_ME") {
		return nil
	}

	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Printf("[redis] invalid REDIS_URL, cache disabled: %v", err)
		return nil
	}

	return redis.NewClient(opts)
}
