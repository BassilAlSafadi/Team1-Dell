using System.Diagnostics;
using AuthService.Infrastructure.Options;
using Grpc.Health.V1;
using Grpc.Net.Client;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace AuthService.Api.Controllers;

// Proof that this service can reach every other service over gRPC: fans out the standard
// grpc.health.v1.Health/Check RPC to all 4 peers and reports their status. A peer being
// unreachable never fails this endpoint — each peer's result is independent.
[ApiController]
[Route("internal/mesh")]
public class MeshController : ControllerBase
{
    private readonly GrpcPeersOptions _peers;

    public MeshController(IOptions<GrpcOptions> grpcOptions)
    {
        _peers = grpcOptions.Value.Peers;
    }

    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        var peers = new (string Name, string? Address)[]
        {
            ("transaction", _peers.Transaction),
            ("messaging", _peers.Messaging),
            ("notification", _peers.Notification),
            ("ai", _peers.Ai),
        };

        var results = await Task.WhenAll(peers.Select(p => CheckPeerAsync(p.Name, p.Address, ct)));
        return Ok(results);
    }

    private static async Task<object> CheckPeerAsync(string name, string? address, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(address))
        {
            return new { peer = name, status = "UNCONFIGURED", latencyMs = (long?)null };
        }

        var stopwatch = Stopwatch.StartNew();
        try
        {
            using var channel = GrpcChannel.ForAddress(address);
            var client = new Health.HealthClient(channel);
            var response = await client.CheckAsync(new HealthCheckRequest(), deadline: DateTime.UtcNow.AddSeconds(3), cancellationToken: ct);
            stopwatch.Stop();
            return new { peer = name, status = response.Status.ToString(), latencyMs = stopwatch.ElapsedMilliseconds };
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            return new { peer = name, status = "UNREACHABLE", latencyMs = stopwatch.ElapsedMilliseconds, error = ex.Message };
        }
    }
}
