package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Env           string
	Port          string
	MongoURI      string
	MongoDBName   string
	JWTIssuer     string
	JWTAudience   string
	JWTSigningKey string
	CORSOrigins   []string

	// InternalServiceToken is the mesh's shared secret. Required: it gates the gRPC
	// surface and the notification write path, both of which are backend-only.
	InternalServiceToken string

	// gRPC — own listen port, plus the 4 peer addresses this service dials as a
	// client (own entry omitted; notification-service is the server for its own proto).
	GRPCPort            string
	AuthGRPCAddr        string
	TransactionGRPCAddr string
	MessagingGRPCAddr   string
	AiGRPCAddr          string

	// GRPCUseTLS switches outbound peer dials from plaintext to TLS. Local dev / same-host
	// docker-compose peers are plaintext; once a peer is only reachable through its own
	// Cloudflare Tunnel hostname, this must be true or the dial can't reach it (the tunnel
	// terminates TLS at Cloudflare's edge and proxies to the peer's own plaintext HTTP/2
	// origin, so it's this client's outbound leg that needs to switch).
	GRPCUseTLS bool

	// RedisURL is optional — the unread-count cache-aside layer degrades to a
	// straight Mongo read when this is unset or still a placeholder, so it's
	// deliberately not in the `required` list below.
	RedisURL string
}

// Load reads .env (if present — Docker/CI supply real env vars instead) and
// validates that required variables aren't missing or left as placeholders.
func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		Env:           getEnv("ENV", "development"),
		Port:          getEnv("PORT", "8080"),
		MongoURI:      os.Getenv("MONGODB_URI"),
		MongoDBName:   getEnv("MONGO_DB_NAME", "notification_db"),
		JWTIssuer:     getEnv("JWT_ISSUER", "auth-service"),
		JWTAudience:   getEnv("JWT_AUDIENCE", "circular-economy-marketplace"),
		JWTSigningKey: os.Getenv("JWT_SIGNING_KEY"),
		CORSOrigins:   splitAndTrim(os.Getenv("CORS_ORIGINS")),

		GRPCPort:            getEnv("GRPC_PORT", "6004"),
		AuthGRPCAddr:        os.Getenv("AUTH_GRPC_ADDR"),
		TransactionGRPCAddr: os.Getenv("TRANSACTION_GRPC_ADDR"),
		MessagingGRPCAddr:   os.Getenv("MESSAGING_GRPC_ADDR"),
		AiGRPCAddr:          os.Getenv("AI_GRPC_ADDR"),
		GRPCUseTLS:          getEnv("GRPC_USE_TLS", "false") == "true",

		RedisURL: os.Getenv("REDIS_URL"),

		InternalServiceToken: os.Getenv("INTERNAL_SERVICE_TOKEN"),
	}

	required := map[string]string{
		"MONGODB_URI":     cfg.MongoURI,
		"JWT_SIGNING_KEY": cfg.JWTSigningKey,
	}
	var missing []string
	for name, val := range required {
		if val == "" || strings.HasPrefix(val, "CHANGE_ME") {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf(
			"missing/placeholder environment variables: %s (copy .env.example to .env and fill in real values)",
			strings.Join(missing, ", "),
		)
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitAndTrim(csv string) []string {
	if csv == "" {
		return nil
	}
	parts := strings.Split(csv, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
