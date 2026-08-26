package middleware

import (
	"net"
	"net/http"
	"strings"

	"gateway/internal/ratelimit"
)

// RateLimit keys on the authenticated user id when present (set by RequireAuth/OptionalAuth
// earlier in the chain), falling back to client IP for unauthenticated requests (register,
// login, etc.) — those routes are exactly the ones most worth protecting from abuse.
//
// trustedProxies is the set of CIDR ranges whose X-Forwarded-For header may be believed. It is
// empty by default: previously the header was read unconditionally, so a client could simply
// vary it per request to get a fresh token bucket every time and remove the limit entirely on
// exactly the routes it was protecting.
func RateLimit(limiter ratelimit.Limiter, trustedProxies []*net.IPNet) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := UserID(r)
			if key == "" {
				key = clientIP(r, trustedProxies)
			}

			allowed, err := limiter.Allow(r.Context(), key)
			if err != nil {
				// Redis being unreachable must never take the whole gateway down —
				// fail open, same "don't let a dependency outage cascade" principle
				// applied to the notification-publish calls elsewhere in the mesh.
				next.ServeHTTP(w, r)
				return
			}
			if !allowed {
				writeError(w, http.StatusTooManyRequests, "Rate limit exceeded.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// clientIP returns the address to rate-limit on. X-Forwarded-For is only consulted when the
// immediate peer is a trusted proxy, and then only its right-most entry — the last hop the
// trusted proxy itself observed, which is the first value a client cannot forge by prepending.
func clientIP(r *http.Request, trustedProxies []*net.IPNet) string {
	peer := remoteIP(r)

	if len(trustedProxies) == 0 || !isTrusted(peer, trustedProxies) {
		return peer
	}

	fwd := r.Header.Get("X-Forwarded-For")
	if fwd == "" {
		return peer
	}

	parts := strings.Split(fwd, ",")
	for i := len(parts) - 1; i >= 0; i-- {
		candidate := strings.TrimSpace(parts[i])
		if ip := net.ParseIP(candidate); ip != nil && !isTrusted(candidate, trustedProxies) {
			return candidate
		}
	}

	return peer
}

func remoteIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func isTrusted(ipStr string, trustedProxies []*net.IPNet) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	for _, cidr := range trustedProxies {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}
