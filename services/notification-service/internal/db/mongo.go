package db

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"notification-service/internal/config"
)

// Connect dials Atlas and returns the notification_db handle, with the
// indexes the EERD's indexing-strategy page specifies for the notifications
// collection already ensured.
func Connect(ctx context.Context, cfg *config.Config) (*mongo.Client, *mongo.Database, error) {
	connectCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		return nil, nil, err
	}

	if err := client.Ping(connectCtx, nil); err != nil {
		return nil, nil, err
	}

	database := client.Database(cfg.MongoDBName)
	if err := ensureIndexes(connectCtx, database); err != nil {
		return nil, nil, err
	}

	return client, database, nil
}

func ensureIndexes(ctx context.Context, database *mongo.Database) error {
	notifications := database.Collection("notifications")

	_, err := notifications.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			// The notification feed for one user, newest first. Field order
			// matters: equality field (user_id) before the sort field.
			Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: -1}},
		},
		{
			// The unread badge count. A partial index keeps it small, since
			// most notifications end up read.
			Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "is_read", Value: 1}},
			Options: options.Index().SetPartialFilterExpression(
				bson.D{{Key: "is_read", Value: false}},
			),
		},
	})
	return err
}
