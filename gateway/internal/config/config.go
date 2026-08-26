package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port string

	JWTIssuer     string
	JWTAudience   string
	JWTSigningKey string
	CORSOrigins   []string

	// gRPC — backend addresses for the routes that already have a real gRPC RPC.
	AuthGRPCAddr         string
	TransactionGRPCAddr  string
	MessagingGRPCAddr    string
	NotificationGRPCAddr string
	AiGRPCAddr           string

	// REST reverse-proxy fallback — for every route whose backend gRPC RPC doesn't exist yet
	// (decision (a): gateway-first, expand-as-you-go). ai-service has no REST API, so no entry.
	AuthRESTAddr         string
	TransactionRESTAddr  string
	MessagingRESTAddr    string
	NotificationRESTAddr string

	RedisURL string

	RateLimitRPS   int
	RateLimitBurst int
}

// Load reads .env (if present — Docker/CI supply real env vars instead) and
// validates that required variables aren't missing or left as placeholders.
func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		Port: getEnv("PORT", "8080"),

		JWTIssuer:     getEnv("JWT_ISSUER", "auth-service"),
		JWTAudience:   getEnv("JWT_AUDIENCE", "circular-economy-marketplace"),
		JWTSigningKey: os.Getenv("JWT_SIGNING_KEY"),
		CORSOrigins:   splitAndTrim(os.Getenv("CORS_ORIGINS")),

		AuthGRPCAddr:         os.Getenv("AUTH_GRPC_ADDR"),
		TransactionGRPCAddr:  os.Getenv("TRANSACTION_GRPC_ADDR"),
		MessagingGRPCAddr:    os.Getenv("MESSAGING_GRPC_ADDR"),
		NotificationGRPCAddr: os.Getenv("NOTIFICATION_GRPC_ADDR"),
		AiGRPCAddr:           os.Getenv("AI_GRPC_ADDR"),

		AuthRESTAddr:         os.Getenv("AUTH_REST_ADDR"),
		TransactionRESTAddr:  os.Getenv("TRANSACTION_REST_ADDR"),
		MessagingRESTAddr:    os.Getenv("MESSAGING_REST_ADDR"),
		NotificationRESTAddr: os.Getenv("NOTIFICATION_REST_ADDR"),

		RedisURL: os.Getenv("REDIS_URL"),

		RateLimitRPS:   getEnvInt("RATE_LIMIT_RPS", 20),
		RateLimitBurst: getEnvInt("RATE_LIMIT_BURST", 40),
	}

	required := map[string]string{
		"JWT_SIGNING_KEY":        cfg.JWTSigningKey,
		"AUTH_GRPC_ADDR":         cfg.AuthGRPCAddr,
		"TRANSACTION_GRPC_ADDR":  cfg.TransactionGRPCAddr,
		"MESSAGING_GRPC_ADDR":    cfg.MessagingGRPCAddr,
		"NOTIFICATION_GRPC_ADDR": cfg.NotificationGRPCAddr,
		"AI_GRPC_ADDR":           cfg.AiGRPCAddr,
		"AUTH_REST_ADDR":         cfg.AuthRESTAddr,
		"TRANSACTION_REST_ADDR":  cfg.TransactionRESTAddr,
		"MESSAGING_REST_ADDR":    cfg.MessagingRESTAddr,
		"NOTIFICATION_REST_ADDR": cfg.NotificationRESTAddr,
		"REDIS_URL":              cfg.RedisURL,
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

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
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
