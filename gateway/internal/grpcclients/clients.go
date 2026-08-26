// Package grpcclients dials the 5 backend gRPC servers once at startup and exposes typed
// clients for the routes that already have a real gRPC RPC (see gateway/IMPLEMENTATION_PLAN.md
// §4.1).
//
// Every outgoing call carries the mesh's shared internal token. Backend gRPC servers now reject
// calls without it, which is what stops those ports from being an unauthenticated way around the
// gateway — the gateway is the only component that validates end-user JWTs, so a backend that
// accepted anonymous gRPC was accepting anonymous everything. Still no TLS/mTLS; the token is a
// bearer secret and assumes the mesh network itself is not hostile.
package grpcclients

import (
	"context"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

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
	dial := dialer(cfg.InternalServiceToken)

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

func dialer(internalToken string) func(string) (*grpc.ClientConn, error) {
	return func(addr string) (*grpc.ClientConn, error) {
		return grpc.NewClient(addr,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
			grpc.WithUnaryInterceptor(internalTokenInterceptor(internalToken)),
			// WithUnaryInterceptor only covers unary-unary calls — ChatStream (unary
			// request, streaming response) goes through this separate chain instead. Without
			// it, the mesh token was never attached to any streaming RPC, and ai-service's
			// InternalAuthInterceptor rejected every one as an unauthenticated caller.
			grpc.WithStreamInterceptor(internalTokenStreamInterceptor(internalToken)),
		)
	}
}

// internalTokenInterceptor attaches the mesh credential to every outgoing unary call.
func internalTokenInterceptor(token string) grpc.UnaryClientInterceptor {
	return func(
		ctx context.Context,
		method string,
		req, reply any,
		cc *grpc.ClientConn,
		invoker grpc.UnaryInvoker,
		opts ...grpc.CallOption,
	) error {
		ctx = metadata.AppendToOutgoingContext(ctx, "x-internal-token", token)
		return invoker(ctx, method, req, reply, cc, opts...)
	}
}

// internalTokenStreamInterceptor is internalTokenInterceptor's counterpart for
// streaming calls (e.g. ChatStream).
func internalTokenStreamInterceptor(token string) grpc.StreamClientInterceptor {
	return func(
		ctx context.Context,
		desc *grpc.StreamDesc,
		cc *grpc.ClientConn,
		method string,
		streamer grpc.Streamer,
		opts ...grpc.CallOption,
	) (grpc.ClientStream, error) {
		ctx = metadata.AppendToOutgoingContext(ctx, "x-internal-token", token)
		return streamer(ctx, desc, cc, method, opts...)
	}
}
