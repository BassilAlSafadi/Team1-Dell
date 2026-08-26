namespace MarketplaceService.Infrastructure.Options;

/// <summary>
/// Shared secret presented by other services in the mesh on internal-only endpoints.
///
/// This is deliberately a coarse "is the caller inside the mesh?" check, not a per-service
/// identity: it replaces the previous state where internal endpoints were either absent or
/// protected by nothing but the network topology. mTLS or per-service credentials would be the
/// real answer; this is the smallest thing that closes the hole without inventing a PKI.
/// </summary>
public class InternalOptions
{
    public const string SectionName = "Internal";

    public string? ServiceToken { get; set; }
}
