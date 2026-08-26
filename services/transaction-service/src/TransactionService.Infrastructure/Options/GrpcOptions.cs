namespace TransactionService.Infrastructure.Options;

// This service's own gRPC listen port, plus the addresses of its 4 mesh peers. Peer clients
// are wired unconditionally (full-mesh requirement) even though only Notification currently
// has a live caller (see DealService.TransitionAsync) — Auth/Messaging/Ai are reachable via
// their thin read-only RPCs but nothing calls them from this service yet.
public class GrpcOptions
{
    public const string SectionName = "Grpc";

    public int Port { get; set; } = 6002;
    public GrpcPeersOptions Peers { get; set; } = new();
}

public class GrpcPeersOptions
{
    public string? Auth { get; set; }
    public string? Messaging { get; set; }
    public string? Notification { get; set; }
    public string? Ai { get; set; }
}
