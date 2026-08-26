package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gateway/internal/config"
	"gateway/internal/grpcclients"
	"gateway/internal/ratelimit"
	"gateway/internal/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	clients, err := grpcclients.Dial(cfg)
	if err != nil {
		log.Fatalf("failed to set up backend gRPC clients: %v", err)
	}
	defer clients.Close()

	limiter, err := ratelimit.NewRedisLimiter(cfg.RedisURL, cfg.RateLimitRPS, cfg.RateLimitBurst)
	if err != nil {
		log.Fatalf("failed to set up Redis rate limiter: %v", err)
	}
	defer limiter.Close()

	handler, err := router.New(cfg, clients, limiter)
	if err != nil {
		log.Fatalf("failed to build router: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("gateway listening on port %s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("error during server shutdown: %v", err)
	}
}
