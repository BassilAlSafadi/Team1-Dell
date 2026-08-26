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
		AllowedOrigins:   corsOrigins(cfg.CORSOrigins),
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/health", handlers.Health)
	r.Get("/internal/mesh/status", handlers.MeshStatus(cfg))

	notificationHandler := handlers.NewNotificationHandler(db, redisClient)

	r.Route("/api/notifications", func(r chi.Router) {
		r.Use(middleware.RequireAuth(cfg))

		r.Post("/", notificationHandler.Create)
		r.Get("/", notificationHandler.List)
		r.Get("/unread-count", notificationHandler.UnreadCount)
		r.Post("/read-all", notificationHandler.MarkAllRead)
		r.Patch("/{id}/read", notificationHandler.MarkRead)
	})

	return r
}

func corsOrigins(origins []string) []string {
	if len(origins) == 0 {
		return []string{"*"}
	}
	return origins
}
