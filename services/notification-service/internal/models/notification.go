package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// NotificationType mirrors the open enumeration from the EERD's notification
// data model page. New types can be added by producers without a migration.
type NotificationType string

const (
	TypeNewMessage    NotificationType = "NEW_MESSAGE"
	TypeNewComment    NotificationType = "NEW_COMMENT"
	TypeCommentReply  NotificationType = "COMMENT_REPLY"
	TypeNewOffer      NotificationType = "NEW_OFFER"
	TypeOfferAccepted NotificationType = "OFFER_ACCEPTED"
	TypeDealCompleted NotificationType = "DEAL_COMPLETED"
	TypeNewReview     NotificationType = "NEW_REVIEW"
)

// EntityRef is the polymorphic target the notification is about — e.g.
// {type: "deal", id: "<deal_id>"} — resolved through the owning service's API
// at read time, never joined here.
type EntityRef struct {
	Type string `bson:"type" json:"type"`
	ID   string `bson:"id" json:"id"`
}

// Notification is the notifications collection document.
type Notification struct {
	ID        bson.ObjectID    `bson:"_id,omitempty" json:"id"`
	UserID    string           `bson:"user_id" json:"userId"` // EXT -> Auth Service, recipient
	Type      NotificationType `bson:"type" json:"type"`
	Title     string           `bson:"title" json:"title"`
	Body      string           `bson:"body" json:"body"`
	ActorID   *string          `bson:"actor_id" json:"actorId,omitempty"` // EXT -> Auth Service, null if system
	Entity    EntityRef        `bson:"entity" json:"entity"`
	IsRead    bool             `bson:"is_read" json:"isRead"`
	CreatedAt time.Time        `bson:"created_at" json:"createdAt"`
	ReadAt    *time.Time       `bson:"read_at" json:"readAt,omitempty"`
}
