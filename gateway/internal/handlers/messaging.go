package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	messagingv1 "gateway/internal/grpcgen/messaging/v1"
	"gateway/internal/transform"
)

// Conversation handles GET /api/conversations/{conversationId} over gRPC (GetConversation) —
// the path param maps directly onto the RPC's request field. Everything else under
// /api/conversations and /api/messages stays REST-proxied, and /socket.io/* bypasses gRPC
// entirely (decision (b) — see internal/proxy).
func Conversation(client messagingv1.MessagingServiceClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conversationID := chi.URLParam(r, "conversationId")

		ctx, cancel := context.WithTimeout(transform.WithIdentity(r.Context(), r), 5*time.Second)
		defer cancel()

		resp, err := client.GetConversation(ctx, &messagingv1.GetConversationRequest{ConversationId: conversationID})
		if err != nil {
			transform.WriteGRPCError(w, err)
			return
		}

		participants := make([]map[string]any, 0, len(resp.GetParticipants()))
		for _, p := range resp.GetParticipants() {
			participants = append(participants, map[string]any{
				"userId": p.GetUserId(),
				"role":   p.GetRole(),
			})
		}

		body := map[string]any{
			"conversationId": resp.GetConversationId(),
			"listingId":      resp.GetListingId(),
			"participants":   participants,
		}
		if lm := resp.GetLastMessage(); lm != nil {
			body["lastMessage"] = map[string]any{
				"messageId":      lm.GetMessageId(),
				"senderId":       lm.GetSenderId(),
				"contentPreview": lm.GetContentPreview(),
			}
		}

		transform.WriteJSON(w, http.StatusOK, body)
	}
}
