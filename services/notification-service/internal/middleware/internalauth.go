package middleware

import (
	"crypto/subtle"
	"net/http"

	"notification-service/internal/config"
)

// RequireInternal restricts a route to callers holding the mesh's shared internal token.
//
// The notification write path used to be reachable with any end-user bearer token while taking
// the recipient's id from the request body, so any logged-in user could push a system-looking
// notification ("Your deal was cancelled, click here") into any other user's feed. Writes are a
// backend concern — domain events in other services — so they belong behind this, not behind a
// user token.
func RequireInternal(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Fail closed: an unconfigured token must deny, not allow.
			if cfg.InternalServiceToken == "" {
				writeError(w, http.StatusServiceUnavailable, "Internal service token is not configured.")
				return
			}

			presented := r.Header.Get("X-Internal-Token")
			if subtle.ConstantTimeCompare([]byte(presented), []byte(cfg.InternalServiceToken)) != 1 {
				writeError(w, http.StatusUnauthorized, "This endpoint is restricted to internal mesh callers.")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
