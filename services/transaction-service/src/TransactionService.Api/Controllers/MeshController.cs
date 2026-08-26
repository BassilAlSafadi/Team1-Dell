using Grpc.Core;
using Grpc.Health.V1;
using Grpc.Net.Client;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using TransactionService.Infrastructure.Options;

namespace TransactionService.Api.Controllers;

// Fans out the standard grpc.health.v1.Health/Check RPC to all 4 mesh peers — the literal,
// verifiable proof that this service can reach every other service via gRPC (full-mesh
// requirement), independent of whether a peer's business RPCs are actually called yet.
[ApiController]
[Route("internal/mesh")]
public class MeshController : ControllerBase
{
    private readonly GrpcPeersOptions _peers;

    public MeshController(IOptions<GrpcOptions> grpcOptions)
    {
        _peers = grpcOptions.Value.Peers;
    }

    public record PeerStatus(string Peer, string Status, long? LatencyMs, string? Error);

    [HttpGet("status")]
    public async Task<ActionResult<IReadOnlyList<PeerStatus>>> Status(CancellationToken ct)
    {
        var peers = new (string Name, string? Address)[]
        {
            ("auth", _peers.Auth),
            ("messaging", _peers.Messaging),
            ("notification", _peers.Notification),
            ("ai", _peers.Ai)
        };

        var results = await Task.WhenAll(peers.Select(p => CheckAsync(p.Name, p.Address, ct)));
        return Ok(results);
    }

    private static async Task<PeerStatus> CheckAsync(string name, string? address, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(address))
        {
            return new PeerStatus(name, "UNCONFIGURED", null, "No peer address configured.");
        }

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            using var channel = GrpcChannel.ForAddress(address);
            var client = new Health.HealthClient(channel);
            var response = await client.CheckAsync(
                new HealthCheckRequest(),
                deadline: DateTime.UtcNow.AddSeconds(3),
                cancellationToken: ct);
            stopwatch.Stop();
            return new PeerStatus(name, response.Status.ToString(), stopwatch.ElapsedMilliseconds, null);
        }
        catch (RpcException ex)
        {
            stopwatch.Stop();
            return new PeerStatus(name, "UNREACHABLE", stopwatch.ElapsedMilliseconds, ex.Status.Detail);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            return new PeerStatus(name, "UNREACHABLE", stopwatch.ElapsedMilliseconds, ex.Message);
        }
    }
}
