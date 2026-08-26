package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"notification-service/internal/middleware"
	"notification-service/internal/models"
	"notification-service/internal/service"
)

type NotificationHandler struct {
	collection *mongo.Collection
	redis      *redis.Client // nil disables caching, see internal/cache
}

func NewNotificationHandler(db *mongo.Database, redisClient *redis.Client) *NotificationHandler {
	return &NotificationHandler{collection: db.Collection("notifications"), redis: redisClient}
}

type createNotificationRequest struct {
	UserID  string           `json:"userId"`
	Type    string           `json:"type"`
	Title   string           `json:"title"`
	Body    string           `json:"body"`
	ActorID *string          `json:"actorId"`
	Entity  models.EntityRef `json:"entity"`
}

// Create writes a new notification for a recipient.
//
// This is the write path domain events would call in production (per the
// EERD's "event sources" table — MessageSent, CommentCreated, OfferAccepted,
// etc.). No event bus or service-to-service auth exists in this repo yet, so
// for now it's just bearer-JWT protected like every other route. Before this
// is exposed beyond trusted backend callers, it needs a real internal-auth
// boundary (service credentials, mTLS, or gateway-enforced network policy) —
// a normal user token should never be able to write a notification for an
// arbitrary recipient.
func (h *NotificationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createNotificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON body.")
		return
	}
	if req.UserID == "" || req.Type == "" || req.Title == "" {
		writeError(w, http.StatusBadRequest, "userId, type and title are required.")
		return
	}

	notification, err := service.CreateNotification(r.Context(), h.collection, h.redis, service.CreateNotificationInput{
		UserID:  req.UserID,
		Type:    req.Type,
		Title:   req.Title,
		Body:    req.Body,
		ActorID: req.ActorID,
		Entity:  req.Entity,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create notification.")
		return
	}

	writeJSON(w, http.StatusCreated, notification)
}

// List returns the caller's notification feed, newest first, optionally
// filtered to unread only. Per the EERD's security rules, user_id is the
// partition key — the query is always scoped to the authenticated caller,
// never to a caller-supplied user id.
func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserID(r)

	limit := int64(20)
	if v := r.URL.Query().Get("limit"); v != "" {
		if parsed, err := strconv.ParseInt(v, 10, 64); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	filter := bson.D{{Key: "user_id", Value: userID}}
	if r.URL.Query().Get("unread") == "true" {
		filter = append(filter, bson.E{Key: "is_read", Value: false})
	}
	if before := r.URL.Query().Get("before"); before != "" {
		if t, err := time.Parse(time.RFC3339, before); err == nil {
			filter = append(filter, bson.E{Key: "created_at", Value: bson.D{{Key: "$lt", Value: t}}})
		}
	}

	cursor, err := h.collection.Find(
		r.Context(),
		filter,
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(limit),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to list notifications.")
		return
	}
	defer cursor.Close(r.Context())

	notifications := make([]models.Notification, 0)
	if err := cursor.All(r.Context(), &notifications); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to decode notifications.")
		return
	}

	writeJSON(w, http.StatusOK, notifications)
}

// UnreadCount powers the unread badge. Cache-aside with a short TTL, plus
// write-invalidation from Create/MarkRead/MarkAllRead (see REDIS_INTEGRATION_PLAN.md §2) —
// a badge that lags the user's own action for even a few seconds is a worse bug than the
// TTL-only staleness everything else in the mesh accepts.
func (h *NotificationHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserID(r)
	ctx := r.Context()
	cacheKey := service.UnreadCountCacheKey(userID)

	if h.redis != nil {
		cached, err := h.redis.Get(ctx, cacheKey).Result()
		if err == nil {
			if count, perr := strconv.ParseInt(cached, 10, 64); perr == nil {
				writeJSON(w, http.StatusOK, map[string]int64{"unreadCount": count})
				return
			}
		} else if err != redis.Nil {
			log.Printf("[cache] unread-count read failed, falling back to Mongo: %v", err)
		}
	}

	count, err := h.collection.CountDocuments(ctx, bson.D{
		{Key: "user_id", Value: userID},
		{Key: "is_read", Value: false},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to count unread notifications.")
		return
	}

	if h.redis != nil {
		if err := h.redis.Set(ctx, cacheKey, count, 10*time.Second).Err(); err != nil {
			log.Printf("[cache] unread-count write failed: %v", err)
		}
	}

	writeJSON(w, http.StatusOK, map[string]int64{"unreadCount": count})
}

// MarkRead flips a single notification to read. Only the recipient may do
// this — the filter includes user_id, not just the notification id.
func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserID(r)
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid notification id.")
		return
	}

	now := time.Now().UTC()
	result := h.collection.FindOneAndUpdate(
		r.Context(),
		bson.D{{Key: "_id", Value: id}, {Key: "user_id", Value: userID}},
		bson.D{{Key: "$set", Value: bson.D{{Key: "is_read", Value: true}, {Key: "read_at", Value: now}}}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)

	var updated models.Notification
	if err := result.Decode(&updated); err != nil {
		if err == mongo.ErrNoDocuments {
			writeError(w, http.StatusNotFound, "Notification not found.")
			return
		}
		writeError(w, http.StatusInternalServerError, "Failed to mark notification as read.")
		return
	}

	h.invalidateUnreadCount(r.Context(), userID)
	writeJSON(w, http.StatusOK, updated)
}

// MarkAllRead flips every unread notification for the caller to read.
func (h *NotificationHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserID(r)
	now := time.Now().UTC()

	result, err := h.collection.UpdateMany(
		r.Context(),
		bson.D{{Key: "user_id", Value: userID}, {Key: "is_read", Value: false}},
		bson.D{{Key: "$set", Value: bson.D{{Key: "is_read", Value: true}, {Key: "read_at", Value: now}}}},
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to mark notifications as read.")
		return
	}

	h.invalidateUnreadCount(r.Context(), userID)
	writeJSON(w, http.StatusOK, map[string]int64{"updated": result.ModifiedCount})
}

// invalidateUnreadCount is best-effort: a Redis outage must never fail a request that
// already succeeded against Mongo.
func (h *NotificationHandler) invalidateUnreadCount(ctx context.Context, userID string) {
	if h.redis == nil {
		return
	}
	if err := h.redis.Del(ctx, service.UnreadCountCacheKey(userID)).Err(); err != nil {
		log.Printf("[cache] failed to invalidate unread-count cache: %v", err)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
