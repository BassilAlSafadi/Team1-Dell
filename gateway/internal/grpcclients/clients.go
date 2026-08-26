// Package grpcclients dials the 5 backend gRPC servers once at startup and exposes typed
// clients for the routes that already have a real gRPC RPC (see gateway/IMPLEMENTATION_PLAN.md
// §4.1). No TLS/mTLS yet — matches the rest of the mesh (no service-to-service auth exists).
package grpcclients

import (
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	aiv1 "gateway/internal/grpcgen/ai/v1"
	authv1 "gateway/internal/grpcgen/auth/v1"
	messagingv1 "gateway/internal/grpcgen/messaging/v1"
	transactionv1 "gateway/internal/grpcgen/transaction/v1"

	"gateway/internal/config"
)

type Clients struct {
	Auth        authv1.AuthServiceClient
	Transaction transactionv1.TransactionServiceClient
	Messaging   messagingv1.MessagingServiceClient
	Ai          aiv1.AiServiceClient

	conns []*grpc.ClientConn
}

// Dial opens one connection per backend. grpc.NewClient is lazy (it doesn't block on
// connecting), so this never fails just because a peer is temporarily down — the same
// tolerant-of-a-down-peer behavior the rest of the mesh's health/status checks rely on.
func Dial(cfg *config.Config) (*Clients, error) {
	authConn, err := dial(cfg.AuthGRPCAddr)
	if err != nil {
		return nil, fmt.Errorf("auth-service: %w", err)
	}
	transactionConn, err := dial(cfg.TransactionGRPCAddr)
	if err != nil {
		return nil, fmt.Errorf("transaction-service: %w", err)
	}
	messagingConn, err := dial(cfg.MessagingGRPCAddr)
	if err != nil {
		return nil, fmt.Errorf("messaging-service: %w", err)
	}
	aiConn, err := dial(cfg.AiGRPCAddr)
	if err != nil {
		return nil, fmt.Errorf("ai-service: %w", err)
	}

	return &Clients{
		Auth:        authv1.NewAuthServiceClient(authConn),
		Transaction: transactionv1.NewTransactionServiceClient(transactionConn),
		Messaging:   messagingv1.NewMessagingServiceClient(messagingConn),
		Ai:          aiv1.NewAiServiceClient(aiConn),
		conns:       []*grpc.ClientConn{authConn, transactionConn, messagingConn, aiConn},
	}, nil
}

func (c *Clients) Close() {
	for _, conn := range c.conns {
		_ = conn.Close()
	}
}

func dial(addr string) (*grpc.ClientConn, error) {
	return grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
}
