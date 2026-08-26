package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"

	"gateway/internal/config"
)

type contextKey string

const (
	userIDKey    contextKey = "userID"
	userRolesKey contextKey = "userRoles"
)

// authClaims mirrors auth-service's access-token shape closely enough to pull out the
// subject (user id) and an optional roles claim — the same HS256 shared secret every
// service in the mesh already trusts.
type authClaims struct {
	jwt.RegisteredClaims
	Roles []string `json:"roles"`
}

// RequireAuth validates the bearer token at the edge (decision (c): defense in depth —
// backends keep validating independently too, since there's no service-to-service auth yet
// to make the gateway a hard trust boundary). On success, the resolved identity is stored in
// the request context for downstream handlers (REST-proxy header injection, gRPC metadata).
func RequireAuth(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, roles, ok := parseAndValidate(cfg, r)
			if !ok {
				writeError(w, http.StatusUnauthorized, "Missing, invalid or expired bearer token.")
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, userRolesKey, roles)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// OptionalAuth resolves identity if a valid token is present, but never rejects the request —
// for routes that work both authenticated and anonymous (none currently, but keeps the same
// context-population path available without duplicating the parse logic).
func OptionalAuth(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if userID, roles, ok := parseAndValidate(cfg, r); ok {
				ctx := context.WithValue(r.Context(), userIDKey, userID)
				ctx = context.WithValue(ctx, userRolesKey, roles)
				r = r.WithContext(ctx)
			}
			next.ServeHTTP(w, r)
		})
	}
}

func parseAndValidate(cfg *config.Config, r *http.Request) (userID string, roles []string, ok bool) {
	header := r.Header.Get("Authorization")
	scheme, token, found := strings.Cut(header, " ")
	if !found || scheme != "Bearer" || token == "" {
		return "", nil, false
	}

	claims := authClaims{}
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
		return "", nil, false
	}

	return claims.Subject, claims.Roles, true
}

// UserID reads the authenticated caller's id set by RequireAuth/OptionalAuth.
func UserID(r *http.Request) string {
	id, _ := r.Context().Value(userIDKey).(string)
	return id
}

// UserRoles reads the authenticated caller's roles set by RequireAuth/OptionalAuth.
func UserRoles(r *http.Request) []string {
	roles, _ := r.Context().Value(userRolesKey).([]string)
	return roles
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + message + `"}`))
}
