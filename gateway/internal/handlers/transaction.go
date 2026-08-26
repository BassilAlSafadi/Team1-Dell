package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	transactionv1 "gateway/internal/grpcgen/transaction/v1"
	"gateway/internal/transform"
)

// Deal handles GET /api/deals/{dealId} over gRPC (GetDeal) — the path param maps directly onto
// the RPC's request field. Wallets stay REST-proxied: GetWallet takes a wallet_id, but the
// existing REST route (GET /api/wallets/me) only ever knows the caller's user id, not their
// wallet id, so there's no clean id-shape mapping here yet without another round trip.
func Deal(client transactionv1.TransactionServiceClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dealID := chi.URLParam(r, "dealId")

		ctx, cancel := context.WithTimeout(transform.WithIdentity(r.Context(), r), 5*time.Second)
		defer cancel()

		resp, err := client.GetDeal(ctx, &transactionv1.GetDealRequest{DealId: dealID})
		if err != nil {
			transform.WriteGRPCError(w, err)
			return
		}

		transform.WriteJSON(w, http.StatusOK, map[string]any{
			"dealId":       resp.GetDealId(),
			"offerId":      resp.GetOfferId(),
			"listingId":    resp.GetListingId(),
			"buyerId":      resp.GetBuyerId(),
			"sellerId":     resp.GetSellerId(),
			"agreedAmount": resp.GetAgreedAmount(),
			"currency":     resp.GetCurrency(),
			"status":       resp.GetStatus(),
		})
	}
}
