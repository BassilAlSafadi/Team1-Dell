using Grpc.Core;
using Microsoft.Extensions.Logging;
using Notification.V1;

namespace TransactionService.Api.Grpc;

// notification-service being unreachable must never fail a deal transition — every call here
// is best-effort: log and swallow on any gRPC failure.
public class GrpcNotificationPublisher : INotificationPublisher
{
    private readonly NotificationService.NotificationServiceClient _client;
    private readonly ILogger<GrpcNotificationPublisher> _logger;

    public GrpcNotificationPublisher(NotificationService.NotificationServiceClient client, ILogger<GrpcNotificationPublisher> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task PublishAsync(
        string userId,
        string type,
        string title,
        string body,
        string? actorId,
        string entityType,
        string entityId,
        CancellationToken ct)
    {
        var request = new CreateNotificationRequest
        {
            UserId = userId,
            Type = type,
            Title = title,
            Body = body,
            Entity = new EntityRef { Type = entityType, Id = entityId }
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
            _logger.LogWarning(ex, "Failed to publish notification (type={Type}, userId={UserId}) — notification-service unreachable or rejected the call.", type, userId);
        }
    }
}
