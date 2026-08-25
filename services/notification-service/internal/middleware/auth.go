package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"

	"notification-service/internal/config"
)

type contextKey string

const userIDKey contextKey = "userID"

// RequireAuth verifies a bearer token issued by auth-service (shared HS256
// signing key) and stores the subject claim as the caller's user id.
// Per the EERD's security rules, every notification read/write is scoped to
// this id — a notification id alone is never sufficient.
func RequireAuth(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			scheme, token, found := strings.Cut(header, " ")
			if !found || scheme != "Bearer" || token == "" {
				writeError(w, http.StatusUnauthorized, "Missing bearer token.")
				return
			}

			claims := jwt.RegisteredClaims{}
			parsed, err := jwt.ParseWithClaims(token, &claims, func(t *jwt.Token) (any, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrTokenSignatureInvalid
				}
				return []byte(cfg.JWTSigningKey), nil
			},
				jwt.WithIssuer(cfg.JWTIssuer),
				jwt.WithAudience(cfg.JWTAudience),
			)
			if err != nil || !parsed.Valid || claims.Subject == "" {
				writeError(w, http.StatusUnauthorized, "Invalid or expired token.")
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, claims.Subject)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserID reads the authenticated caller's id set by RequireAuth.
func UserID(r *http.Request) string {
	id, _ := r.Context().Value(userIDKey).(string)
	return id
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + message + `"}`))
}
