// Package transform holds the small, shared HTTP<->gRPC helpers every gRPC-routed handler
// uses: writing a JSON response, mapping a gRPC error to a consistent HTTP status, and
// attaching the caller's resolved identity to outgoing gRPC metadata (plan §4.2/§4.4).
package transform

import (
	"context"
	"encoding/json"
	"net/http"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"gateway/internal/middleware"
)

// WithIdentity forwards the resolved caller identity to a backend over gRPC metadata instead
// of the raw JWT — the gateway already validated it, so it just tells the backend who's
// calling. Backends still validate their own copy of the JWT independently (defense in depth,
// decision (c)); this metadata is a convenience, not a substitute trust boundary.
func WithIdentity(ctx context.Context, r *http.Request) context.Context {
	md := metadata.MD{}
	if userID := middleware.UserID(r); userID != "" {
		md.Set("x-user-id", userID)
	}
	if roles := middleware.UserRoles(r); len(roles) > 0 {
		md.Set("x-user-roles", roles...)
	}
	if len(md) == 0 {
		return ctx
	}
	return metadata.NewOutgoingContext(ctx, md)
}

// WriteJSON writes a JSON body with the given status code.
func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// WriteError writes a plain {"error": "..."} JSON body.
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}

// WriteGRPCError maps a gRPC error to a consistent HTTP status/body — used by every
// gRPC-routed handler so error shape doesn't depend on which backend/language produced it.
func WriteGRPCError(w http.ResponseWriter, err error) {
	st, ok := status.FromError(err)
	if !ok {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	code := http.StatusInternalServerError
	switch st.Code() {
	case codes.NotFound:
		code = http.StatusNotFound
	case codes.InvalidArgument:
		code = http.StatusBadRequest
	case codes.PermissionDenied:
		code = http.StatusForbidden
	case codes.Unauthenticated:
		code = http.StatusUnauthorized
	case codes.Unavailable:
		code = http.StatusServiceUnavailable
	case codes.DeadlineExceeded:
		code = http.StatusGatewayTimeout
	case codes.AlreadyExists:
		code = http.StatusConflict
	}
	WriteError(w, code, st.Message())
}
