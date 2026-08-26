package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	authv1 "gateway/internal/grpcgen/auth/v1"
	"gateway/internal/middleware"
	"gateway/internal/transform"
)

// Me handles GET /api/auth/me over gRPC (GetUser) — the caller's own id comes from the
// already-validated JWT (middleware.RequireAuth), so this is a clean 1:1 mapping, unlike most
// other auth-service routes which stay REST-proxied (register/login/etc. have no gRPC RPC yet).
func Me(client authv1.AuthServiceClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := middleware.UserID(r)
		if userID == "" {
			transform.WriteError(w, http.StatusUnauthorized, "Missing bearer token.")
			return
		}

		ctx, cancel := context.WithTimeout(transform.WithIdentity(r.Context(), r), 5*time.Second)
		defer cancel()

		resp, err := client.GetUser(ctx, &authv1.GetUserRequest{UserId: userID})
		if err != nil {
			transform.WriteGRPCError(w, err)
			return
		}

		transform.WriteJSON(w, http.StatusOK, map[string]any{
			"userId":        resp.GetUserId(),
			"email":         resp.GetEmail(),
			"emailVerified": resp.GetEmailVerified(),
			"status":        resp.GetStatus(),
		})
	}
}

// VendorProfile handles GET /api/vendors/{vendorId}/profile over gRPC (GetVendorProfile) —
// the vendor id in the path maps directly onto the RPC's request field.
func VendorProfile(client authv1.AuthServiceClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vendorID := chi.URLParam(r, "vendorId")

		ctx, cancel := context.WithTimeout(transform.WithIdentity(r.Context(), r), 5*time.Second)
		defer cancel()

		resp, err := client.GetVendorProfile(ctx, &authv1.GetVendorProfileRequest{VendorId: vendorID})
		if err != nil {
			transform.WriteGRPCError(w, err)
			return
		}

		transform.WriteJSON(w, http.StatusOK, map[string]any{
			"vendorId":      resp.GetVendorId(),
			"email":         resp.GetEmail(),
			"status":        resp.GetStatus(),
			"averageRating": resp.GetAverageRating(),
			"reviewCount":   resp.GetReviewCount(),
		})
	}
}
