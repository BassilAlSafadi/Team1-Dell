package config

import (
	"fmt"
	"net"
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
	MarketplaceRESTAddr  string

	RedisURL string

	// Shared secret presented to backend gRPC servers so they can tell a mesh peer from an
	// arbitrary caller. Required: without it every backend gRPC call is rejected.
	InternalServiceToken string

	RateLimitRPS   int
	RateLimitBurst int

	// UploadDir is where POST /api/uploads writes files and GET /api/uploads/{name} serves
	// them from — a bind-mounted directory on the host so uploads outlive container rebuilds.
	UploadDir string

	// TrustedProxies are the CIDR ranges whose X-Forwarded-For header the rate limiter may
	// believe. Empty (the default) means trust nothing and key on the peer address, which is
	// the correct setting when the gateway is itself the edge.
	TrustedProxies []*net.IPNet
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
		MarketplaceRESTAddr:  os.Getenv("MARKETPLACE_REST_ADDR"),

		RedisURL: os.Getenv("REDIS_URL"),

		InternalServiceToken: os.Getenv("INTERNAL_SERVICE_TOKEN"),

		RateLimitRPS:   getEnvInt("RATE_LIMIT_RPS", 20),
		RateLimitBurst: getEnvInt("RATE_LIMIT_BURST", 40),

		UploadDir: getEnv("UPLOAD_DIR", "/data/uploads"),
	}

	trustedProxies, err := parseCIDRs(os.Getenv("TRUSTED_PROXIES"))
	if err != nil {
		return nil, fmt.Errorf("TRUSTED_PROXIES: %w", err)
	}
	cfg.TrustedProxies = trustedProxies

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
		"MARKETPLACE_REST_ADDR":  cfg.MarketplaceRESTAddr,
		"REDIS_URL":              cfg.RedisURL,
		"INTERNAL_SERVICE_TOKEN": cfg.InternalServiceToken,
		// Required so a deploy that forgets it fails loudly instead of silently serving
		// Access-Control-Allow-Origin: * to every origin on the internet.
		"CORS_ORIGINS": strings.Join(cfg.CORSOrigins, ","),
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

// parseCIDRs accepts a comma-separated list of CIDR blocks or bare IPs.
func parseCIDRs(csv string) ([]*net.IPNet, error) {
	var out []*net.IPNet
	for _, entry := range splitAndTrim(csv) {
		if _, network, err := net.ParseCIDR(entry); err == nil {
			out = append(out, network)
			continue
		}

		ip := net.ParseIP(entry)
		if ip == nil {
			return nil, fmt.Errorf("%q is not a valid CIDR block or IP address", entry)
		}

		bits := 32
		if ip.To4() == nil {
			bits = 128
		}
		out = append(out, &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
	}
	return out, nil
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
