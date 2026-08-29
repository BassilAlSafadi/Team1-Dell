// Package router builds the gateway's route table (plan §4.1). Each backend gets a
// REST-reverse-proxy mount as the fallback, with specific routes overridden to call the real
// gRPC RPC where one already exists — chi's radix-tree routing naturally prefers a literal
// route match over a wildcard mount, so registering both for the same prefix is enough for the
// literal one to win.
package router

import (
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"gateway/internal/config"
	"gateway/internal/grpcclients"
	"gateway/internal/handlers"
	"gateway/internal/health"
	appmw "gateway/internal/middleware"
	"gateway/internal/proxy"
	"gateway/internal/ratelimit"
)

func New(cfg *config.Config, clients *grpcclients.Clients, limiter ratelimit.Limiter) (http.Handler, error) {
	checker := health.NewChecker(map[string]string{
		"auth-service":         cfg.AuthGRPCAddr,
		"transaction-service":  cfg.TransactionGRPCAddr,
		"messaging-service":    cfg.MessagingGRPCAddr,
		"notification-service": cfg.NotificationGRPCAddr,
		"ai-service":           cfg.AiGRPCAddr,
	}, 5*time.Second)

	authProxy, err := proxy.New(cfg.AuthRESTAddr, "auth-service", checker)
	if err != nil {
		return nil, err
	}
	transactionProxy, err := proxy.New(cfg.TransactionRESTAddr, "transaction-service", checker)
	if err != nil {
		return nil, err
	}
	messagingProxy, err := proxy.New(cfg.MessagingRESTAddr, "messaging-service", checker)
	if err != nil {
		return nil, err
	}
	notificationProxy, err := proxy.New(cfg.NotificationRESTAddr, "notification-service", checker)
	if err != nil {
		return nil, err
	}
	marketplaceProxy, err := proxy.New(cfg.MarketplaceRESTAddr, "marketplace-service", checker)
	if err != nil {
		return nil, err
	}

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	// chimiddleware.RealIP is deliberately NOT used: it rewrites RemoteAddr from the
	// client-supplied X-Forwarded-For/X-Real-IP headers for every request, which would hand the
	// rate limiter a spoofable key again. appmw.RateLimit consults X-Forwarded-For itself, but
	// only when the peer is a configured trusted proxy.
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		// No wildcard fallback: CORS_ORIGINS is a required config value, so an unconfigured
		// deploy fails at startup rather than quietly allowing every origin.
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))
	r.Use(appmw.RateLimit(limiter, cfg.TrustedProxies))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// messaging-service's realtime traffic bypasses gRPC entirely (decision (b)) — Socket.io
	// does its own handshake auth, so this isn't gated behind RequireAuth at the HTTP layer.
	r.Handle("/socket.io/*", messagingProxy)

	auth := appmw.OptionalAuth(cfg)
	requireAuth := appmw.RequireAuth(cfg)

	// --- uploads (shared blob store on local disk) ---
	// Serving is unauthenticated: the filename carries 128 bits of randomness and <img>/
	// <video> tags can't attach a bearer header. Uploading requires a valid token.
	if err := os.MkdirAll(cfg.UploadDir, 0o755); err != nil {
		return nil, err
	}
	r.With(requireAuth).Post("/api/uploads", handlers.Upload(cfg))
	r.Get("/api/uploads/{name}", handlers.ServeUpload(cfg))

	// --- auth-service ---
	r.Group(func(r chi.Router) {
		r.Use(auth)
		// Public: register/login/google/refresh/logout, email-verification, password-reset,
		// and the public vendor profile/reviews reads.
		r.Get("/api/vendors/{vendorId}/profile", handlers.VendorProfile(clients.Auth))

		r.With(requireAuth).Get("/api/auth/me", handlers.Me(clients.Auth))
		r.With(requireAuth).Delete("/api/auth/me", authProxy.ServeHTTP)
		r.With(requireAuth).Put("/api/vendors/{vendorId}/reviews", authProxy.ServeHTTP)
		r.With(requireAuth).Delete("/api/vendors/{vendorId}/reviews", authProxy.ServeHTTP)

		r.Handle("/api/auth/*", authProxy)
		r.Handle("/api/vendors/*", authProxy) // reviews GET (list) falls through here
	})

	// --- transaction-service ---
	r.Group(func(r chi.Router) {
		r.Use(requireAuth) // every transaction-service route requires auth today
		// /api/deals/mine and /api/offers/mine replace the old party/{id}, buyer/{id} and
		// seller/{id} routes, which took an account id from the URL and so let any authenticated
		// user enumerate anyone else's deals and offers. They are plain REST-proxied.
		//
		// /api/deals/mine must be registered as its own literal route, not left to the
		// "/api/deals/*" wildcard mount below: chi's radix tree prefers a named param
		// ({dealId}) over a wildcard (*) at the same segment, so without this, GET
		// /api/deals/mine matched {dealId}="mine" and hit the gRPC single-deal lookup with
		// "mine" where a GUID was expected. A literal segment outranks both, restoring the
		// "literal beats wildcard" precedence described in the package doc above.
		r.Handle("/api/deals/mine", transactionProxy)
		r.Get("/api/deals/{dealId}", handlers.Deal(clients.Transaction))
		// Bare-path routes registered alongside their wildcards — chi's "/*" pattern only
		// matches a path with a trailing segment, so a bodyless GET/POST straight to the
		// resource root (e.g. "GET /api/wallets") needs its own entry (see marketplace-service
		// below, where this was first worked around).
		for _, prefix := range []string{"/api/wallets", "/api/payment-methods", "/api/offers", "/api/deals"} {
			r.Handle(prefix, transactionProxy)
			r.Handle(prefix+"/*", transactionProxy)
		}
	})

	// --- messaging-service ---
	r.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Get("/api/conversations/{conversationId}", handlers.Conversation(clients.Messaging))
		for _, prefix := range []string{"/api/conversations", "/api/messages"} {
			r.Handle(prefix, messagingProxy)
			r.Handle(prefix+"/*", messagingProxy)
		}
	})

	// --- notification-service (no gRPC read RPC exposed to end users yet — CreateNotification
	// is the internal mesh's write path other backend services call, not a user-facing route) ---
	r.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Handle("/api/notifications", notificationProxy)
		r.Handle("/api/notifications/*", notificationProxy)
	})

	// --- ai-service (no REST API at all — every route is gRPC) ---
	r.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Post("/api/ai/classify", handlers.ClassifyWaste(clients.Ai))
		r.Get("/api/ai/recommendation", handlers.Recommendation(clients.Ai))
		r.Post("/api/ai/chat", handlers.Chat(clients.Ai))
		r.Post("/api/ai/chat/stream", handlers.ChatStream(clients.Ai))
	})

	// --- marketplace-service (REST-only, no gRPC server — same proxy-only shape as
	// notification-service above; not registered with the health checker since there's no gRPC
	// health endpoint to check, so it's treated as always-healthy per health.Checker's design) ---
	r.Group(func(r chi.Router) {
		r.Use(requireAuth)
		// Bare-path routes registered alongside their wildcards — chi's "/*" pattern only
		// matches a path with a trailing segment, so a bodyless GET/POST straight to the
		// resource root (e.g. "GET /api/categories", "POST /api/listings") needs its own entry.
		for _, prefix := range []string{"/api/vendor-profiles", "/api/corporate-profiles", "/api/categories", "/api/listings"} {
			r.Handle(prefix, marketplaceProxy)
			r.Handle(prefix+"/*", marketplaceProxy)
		}
	})

	return r, nil
}
