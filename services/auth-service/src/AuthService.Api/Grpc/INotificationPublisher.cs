namespace AuthService.Api.Grpc;

// Best-effort publisher to notification-service over gRPC. Failures are swallowed (logged, not
// thrown) — a notification-service outage must never fail the caller's own write (e.g. a review
// upsert), same tolerance the REST world would need if this were an HTTP call instead.
public interface INotificationPublisher
{
    Task PublishAsync(string userId, string type, string title, string body, string? actorId, string entityType, string entityId, CancellationToken ct);
}
