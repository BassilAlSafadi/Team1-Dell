package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"notification-service/internal/config"
	"notification-service/internal/handlers"
	"notification-service/internal/middleware"
)

func New(cfg *config.Config, db *mongo.Database, redisClient *redis.Client) http.Handler {
	r := chi.NewRouter()

	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		// No wildcard fallback — an unconfigured CORS_ORIGINS must not silently allow every
		// origin. An empty list means no cross-origin browser access, which is the safe default.
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/health", handlers.Health)
	r.Get("/internal/mesh/status", handlers.MeshStatus(cfg))

	notificationHandler := handlers.NewNotificationHandler(db, redisClient)

	r.Route("/api/notifications", func(r chi.Router) {
		// Writing a notification names an arbitrary recipient, so it is a backend-only
		// operation gated on the mesh token — never on an end user's bearer token. Reads and
		// read-state changes stay user-scoped.
		r.With(middleware.RequireInternal(cfg)).Post("/", notificationHandler.Create)

		// User-scoped routes. Wrapped in a group so RequireAuth applies only here — chi
		// forbids r.Use() after a route (the internal POST above) is registered on a mux.
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth(cfg))

			r.Get("/", notificationHandler.List)
			r.Get("/unread-count", notificationHandler.UnreadCount)
			r.Post("/read-all", notificationHandler.MarkAllRead)
			r.Patch("/{id}/read", notificationHandler.MarkRead)
		})
	})

	return r
}
