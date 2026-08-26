using Grpc.Core;
using Microsoft.Extensions.Logging;

namespace AuthService.Api.Grpc;

public class GrpcNotificationPublisher : INotificationPublisher
{
    private readonly global::Notification.V1.NotificationService.NotificationServiceClient _client;
    private readonly ILogger<GrpcNotificationPublisher> _logger;

    public GrpcNotificationPublisher(
        global::Notification.V1.NotificationService.NotificationServiceClient client,
        ILogger<GrpcNotificationPublisher> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task PublishAsync(string userId, string type, string title, string body, string? actorId, string entityType, string entityId, CancellationToken ct)
    {
        var request = new global::Notification.V1.CreateNotificationRequest
        {
            UserId = userId,
            Type = type,
            Title = title,
            Body = body,
            Entity = new global::Notification.V1.EntityRef { Type = entityType, Id = entityId }
        };
        if (actorId is not null)
        {
            request.ActorId = actorId;
        }

        try
        {
            await _client.CreateNotificationAsync(request, cancellationToken: ct);
        }
        catch (RpcException ex)
        {
            _logger.LogWarning(ex, "Failed to publish {Type} notification for user {UserId} to notification-service.", type, userId);
        }
    }
}
