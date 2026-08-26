namespace TransactionService.Api.Grpc;

// Wraps the gRPC client for notification-service's CreateNotification RPC — the real,
// currently-consumed domain call this service makes (see DealService.TransitionAsync).
public interface INotificationPublisher
{
    Task PublishAsync(
        string userId,
        string type,
        string title,
        string body,
        string? actorId,
        string entityType,
        string entityId,
        CancellationToken ct);
}
