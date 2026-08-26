// Package health keeps a small, periodically-refreshed view of each backend's
// grpc.health.v1.Health status so request handling never pays a synchronous health-check
// round trip — a stale-by-a-few-seconds view is enough to short-circuit to a fast 503 instead
// of waiting out a call timeout against a backend that's already down (plan §4.6).
package health

import (
	"context"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

type Checker struct {
	mu       sync.RWMutex
	statuses map[string]bool // backend name -> healthy
	addrs    map[string]string
}

// NewChecker starts a background refresh loop and returns immediately — all backends are
// assumed healthy until the first check completes, so a slow-starting mesh never causes the
// gateway itself to reject traffic at boot.
func NewChecker(addrs map[string]string, interval time.Duration) *Checker {
	c := &Checker{
		statuses: make(map[string]bool, len(addrs)),
		addrs:    addrs,
	}
	for name := range addrs {
		c.statuses[name] = true
	}

	go c.loop(interval)
	return c
}

func (c *Checker) loop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	c.refreshAll()
	for range ticker.C {
		c.refreshAll()
	}
}

func (c *Checker) refreshAll() {
	for name, addr := range c.addrs {
		healthy := checkOne(addr)
		c.mu.Lock()
		c.statuses[name] = healthy
		c.mu.Unlock()
	}
}

func checkOne(addr string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return false
	}
	defer conn.Close()

	resp, err := healthpb.NewHealthClient(conn).Check(ctx, &healthpb.HealthCheckRequest{})
	return err == nil && resp.GetStatus() == healthpb.HealthCheckResponse_SERVING
}

// Healthy reports the last-known status for a backend name. An unknown name (shouldn't
// happen — every routed backend is registered at startup) is treated as healthy rather than
// blocking traffic on a bookkeeping gap.
func (c *Checker) Healthy(name string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	healthy, known := c.statuses[name]
	return !known || healthy
}
