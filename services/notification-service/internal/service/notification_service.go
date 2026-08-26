// Package service holds the write/read paths shared between the REST handlers
// and the gRPC server, so the two transports never duplicate the Mongo
// document-building logic.
package service

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"notification-service/internal/models"
)

// UnreadCountCacheKey is exported so the REST handler's cache-aside read and this
// package's write-invalidation always agree on the exact key.
func UnreadCountCacheKey(userID string) string {
	return "cache:notification:unread-count:" + userID
}

// CreateNotificationInput is the transport-agnostic shape both the REST
// createNotificationRequest body and the gRPC CreateNotificationRequest map onto.
type CreateNotificationInput struct {
	UserID  string
	Type    string
	Title   string
	Body    string
	ActorID *string
	Entity  models.EntityRef
}

// CreateNotification writes a new notification for a recipient. This is the
// same write path notifications.go's REST Create handler and the gRPC
// NotificationService.CreateNotification RPC both call — kept in one place so
// the two transports can't drift.
// CreateNotification writes a new notification and best-effort invalidates the
// recipient's cached unread count (redisClient may be nil — see internal/cache).
// One of the two entities in the mesh that gets write-invalidation rather than pure
// TTL expiry, since a stale unread badge right after a notification lands is a real
// UX bug (see REDIS_INTEGRATION_PLAN.md §2).
func CreateNotification(ctx context.Context, collection *mongo.Collection, redisClient *redis.Client, in CreateNotificationInput) (*models.Notification, error) {
	notification := models.Notification{
		ID:        bson.NewObjectID(),
		UserID:    in.UserID,
		Type:      models.NotificationType(in.Type),
		Title:     in.Title,
		Body:      in.Body,
		ActorID:   in.ActorID,
		Entity:    in.Entity,
		IsRead:    false,
		CreatedAt: time.Now().UTC(),
	}

	if _, err := collection.InsertOne(ctx, notification); err != nil {
		return nil, err
	}

	invalidateUnreadCount(ctx, redisClient, in.UserID)

	return &notification, nil
}

// invalidateUnreadCount is best-effort: a Redis outage must never fail the write that
// already succeeded against Mongo.
func invalidateUnreadCount(ctx context.Context, redisClient *redis.Client, userID string) {
	if redisClient == nil {
		return
	}
	if err := redisClient.Del(ctx, UnreadCountCacheKey(userID)).Err(); err != nil {
		log.Printf("[cache] failed to invalidate unread-count cache: %v", err)
	}
}
