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
