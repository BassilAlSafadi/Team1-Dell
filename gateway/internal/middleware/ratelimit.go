package middleware

import (
	"net/http"

	"gateway/internal/ratelimit"
)

// RateLimit keys on the authenticated user id when present (set by RequireAuth/OptionalAuth
// earlier in the chain), falling back to client IP for unauthenticated requests (register,
// login, etc.) — those routes are exactly the ones most worth protecting from abuse.
func RateLimit(limiter ratelimit.Limiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := UserID(r)
			if key == "" {
				key = clientIP(r)
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

func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return fwd
	}
	return r.RemoteAddr
}
