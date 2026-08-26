// Package proxy builds the REST reverse-proxy fallback used for every route whose backend
// gRPC RPC doesn't exist yet (decision (a)). httputil.ReverseProxy already handles WebSocket
// upgrade transparently (it hijacks the connection when it sees Connection: Upgrade), so the
// same proxy also carries messaging-service's /socket.io/* traffic (decision (b) — realtime
// bypasses gRPC entirely).
package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"

	"gateway/internal/health"
	"gateway/internal/middleware"
)

// New builds a reverse proxy to a single backend, forwarding the resolved caller identity
// (set by middleware.RequireAuth/OptionalAuth) as headers — the same convenience-layer
// forwarding the gRPC-routed paths do via metadata (plan §4.2). backendName is the health
// checker's key for this backend; a backend reporting unhealthy short-circuits to 503 instead
// of proxying a request that would just time out.
func New(rawAddr, backendName string, checker *health.Checker) (http.Handler, error) {
	target, err := url.Parse("http://" + rawAddr)
	if err != nil {
		return nil, err
	}

	rp := httputil.NewSingleHostReverseProxy(target)
	originalDirector := rp.Director
	rp.Director = func(r *http.Request) {
		originalDirector(r)
		if userID := middleware.UserID(r); userID != "" {
			r.Header.Set("X-User-Id", userID)
		}
		if roles := middleware.UserRoles(r); len(roles) > 0 {
			r.Header.Set("X-User-Roles", joinRoles(roles))
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !checker.Healthy(backendName) {
			http.Error(w, `{"error":"Service temporarily unavailable."}`, http.StatusServiceUnavailable)
			return
		}
		rp.ServeHTTP(w, r)
	}), nil
}

func joinRoles(roles []string) string {
	out := ""
	for i, r := range roles {
		if i > 0 {
			out += ","
		}
		out += r
	}
	return out
}
