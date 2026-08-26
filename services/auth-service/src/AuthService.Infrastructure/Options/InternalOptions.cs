namespace AuthService.Infrastructure.Options;

/// <summary>
/// Shared secret presented to (and required from) other services in the mesh. Gates this
/// service's gRPC surface, which previously accepted unauthenticated calls that could read any
/// user's profile by id.
/// </summary>
public class InternalOptions
{
    public const string SectionName = "Internal";

    public string? ServiceToken { get; set; }
}
