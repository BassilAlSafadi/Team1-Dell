namespace AuthService.Infrastructure.Options;

public class GrpcOptions
{
    public const string SectionName = "Grpc";

    public int Port { get; set; } = 6001;
    public GrpcPeersOptions Peers { get; set; } = new();
}

public class GrpcPeersOptions
{
    public string? Transaction { get; set; }
    public string? Messaging { get; set; }
    public string? Notification { get; set; }
    public string? Ai { get; set; }
}
