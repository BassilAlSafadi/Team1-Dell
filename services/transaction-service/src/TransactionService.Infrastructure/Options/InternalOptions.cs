namespace TransactionService.Infrastructure.Options;

/// <summary>
/// Shared secret presented to (and required from) other services in the mesh on internal-only
/// endpoints and gRPC methods. See MarketplaceService's InternalOptions for the rationale.
/// </summary>
public class InternalOptions
{
    public const string SectionName = "Internal";

    public string? ServiceToken { get; set; }

    /// <summary>Base address of marketplace-service's REST API, e.g. http://marketplace-service:8080.</summary>
    public string? MarketplaceRestAddr { get; set; }
}
