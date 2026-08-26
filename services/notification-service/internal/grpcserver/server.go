// Package grpcserver wires notification-service's gRPC surface: the real
// NotificationService.CreateNotification RPC (the write path other services'
// domain events call, per the comment on the REST handler this mirrors) plus
// the standard grpc.health.v1.Health service every mesh participant registers.
package grpcserver

import (
	"context"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/protobuf/types/known/timestamppb"

	notificationv1 "notification-service/internal/grpcgen/notification/v1"
	"notification-service/internal/models"
	"notification-service/internal/service"
)

type notificationServer struct {
	notificationv1.UnimplementedNotificationServiceServer
	collection *mongo.Collection
	redis      *redis.Client // nil disables caching, see internal/cache
}

func (s *notificationServer) CreateNotification(ctx context.Context, req *notificationv1.CreateNotificationRequest) (*notificationv1.CreateNotificationResponse, error) {
	var entity models.EntityRef
	if e := req.GetEntity(); e != nil {
		entity = models.EntityRef{Type: e.GetType(), ID: e.GetId()}
	}

	var actorID *string
	if req.ActorId != nil {
		actorID = req.ActorId
	}

	notification, err := service.CreateNotification(ctx, s.collection, s.redis, service.CreateNotificationInput{
		UserID:  req.GetUserId(),
		Type:    req.GetType(),
		Title:   req.GetTitle(),
		Body:    req.GetBody(),
		ActorID: actorID,
		Entity:  entity,
	})
	if err != nil {
		return nil, err
	}

	resp := &notificationv1.CreateNotificationResponse{
		NotificationId: notification.ID.Hex(),
		UserId:         notification.UserID,
		Type:           string(notification.Type),
		Title:          notification.Title,
		Body:           notification.Body,
		ActorId:        notification.ActorID,
		Entity: &notificationv1.EntityRef{
			Type: notification.Entity.Type,
			Id:   notification.Entity.ID,
		},
		IsRead:    notification.IsRead,
		CreatedAt: timestamppb.New(notification.CreatedAt),
	}
	return resp, nil
}

// New builds the notification-service gRPC server: its own NotificationService
// implementation plus the standard health service, marked SERVING immediately
// since there's no external dependency (beyond Mongo, already connected by the
// time this is called) that would make it report otherwise.
func New(db *mongo.Database, redisClient *redis.Client) *grpc.Server {
	srv := grpc.NewServer()

	notificationv1.RegisterNotificationServiceServer(srv, &notificationServer{
		collection: db.Collection("notifications"),
		redis:      redisClient,
	})

	healthSrv := health.NewServer()
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(srv, healthSrv)

	return srv
}
