package grpcserver

import (
	"context"
	"crypto/subtle"
	"strings"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const healthServicePrefix = "/grpc.health.v1.Health/"

// InternalAuthInterceptor requires every inbound gRPC call to carry the mesh's shared internal
// token. This port previously accepted calls from anyone who could reach it, with no
// authentication at all, while all end-user authentication lived in the gateway.
//
// grpc.health.v1.Health is exempt: the gateway's health checker probes it without credentials
// and it exposes nothing but SERVING/NOT_SERVING.
func InternalAuthInterceptor(token string) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		if strings.HasPrefix(info.FullMethod, healthServicePrefix) {
			return handler(ctx, req)
		}

		if token == "" {
			return nil, status.Error(codes.FailedPrecondition, "Internal service token is not configured.")
		}

		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			return nil, status.Error(codes.Unauthenticated, "Missing internal service token.")
		}

		var presented string
		if values := md.Get("x-internal-token"); len(values) > 0 {
			presented = values[0]
		}

		if subtle.ConstantTimeCompare([]byte(presented), []byte(token)) != 1 {
			return nil, status.Error(codes.Unauthenticated, "This endpoint is restricted to internal mesh callers.")
		}

		return handler(ctx, req)
	}
}
