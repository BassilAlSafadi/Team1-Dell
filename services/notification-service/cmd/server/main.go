package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"notification-service/internal/cache"
	"notification-service/internal/config"
	"notification-service/internal/db"
	"notification-service/internal/grpcserver"
	"notification-service/internal/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	client, database, err := db.Connect(ctx, cfg)
	if err != nil {
		log.Fatalf("failed to connect to MongoDB: %v", err)
	}
	defer func() {
		if err := client.Disconnect(context.Background()); err != nil {
			log.Printf("error disconnecting MongoDB client: %v", err)
		}
	}()
	log.Printf("connected to MongoDB database %q", cfg.MongoDBName)

	redisClient := cache.Client(cfg)
	if redisClient == nil {
		log.Println("REDIS_URL unset/placeholder — unread-count caching disabled, serving straight from Mongo")
	}

	handler := router.New(cfg, database, redisClient)
	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("notification-service listening on port %s (%s)", cfg.Port, cfg.Env)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	grpcServer := grpcserver.New(database, redisClient, cfg.InternalServiceToken)
	grpcListener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("failed to listen on gRPC port %s: %v", cfg.GRPCPort, err)
	}
	go func() {
		log.Printf("notification-service gRPC listening on port %s", cfg.GRPCPort)
		if err := grpcServer.Serve(grpcListener); err != nil {
			log.Fatalf("grpc server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("error during server shutdown: %v", err)
	}
	grpcServer.GracefulStop()
}
