using System.Security.Cryptography;
using System.Text;
using Grpc.Core;
using Grpc.Core.Interceptors;
using Microsoft.Extensions.Options;
using TransactionService.Infrastructure.Options;

namespace TransactionService.Api.Grpc;

/// <summary>
/// Requires every inbound gRPC call to carry the mesh's shared internal token.
///
/// This service's gRPC port used to accept calls from anyone who could reach it, with no
/// authentication of any kind, while all end-user authentication lived in the gateway. Combined
/// with the port being published to the host, that let anyone read any wallet or deal. The port
/// is no longer published, and this interceptor makes the boundary explicit rather than leaving
/// it to Docker's port mapping alone.
///
/// grpc.health.v1.Health is exempt: the gateway's health checker probes it without credentials,
/// and it exposes nothing but SERVING/NOT_SERVING.
/// </summary>
public class InternalAuthInterceptor : Interceptor
{
    public const string TokenHeader = "x-internal-token";
    public const string UserIdHeader = "x-user-id";

    private const string HealthServicePrefix = "/grpc.health.v1.Health/";

    private readonly InternalOptions _options;

    public InternalAuthInterceptor(IOptions<InternalOptions> options)
    {
        _options = options.Value;
    }

    public override Task<TResponse> UnaryServerHandler<TRequest, TResponse>(
        TRequest request,
        ServerCallContext context,
        UnaryServerMethod<TRequest, TResponse> continuation)
    {
        if (!context.Method.StartsWith(HealthServicePrefix, StringComparison.Ordinal))
        {
            Authorize(context);
        }

        return continuation(request, context);
    }

    private void Authorize(ServerCallContext context)
    {
        // Fail closed: no configured token means the mesh boundary is unenforceable, so refuse
        // rather than silently accepting everything.
        if (string.IsNullOrWhiteSpace(_options.ServiceToken))
        {
            throw new RpcException(new Status(
                StatusCode.FailedPrecondition, "Internal service token is not configured."));
        }

        var presented = context.RequestHeaders.GetValue(TokenHeader);
        if (!FixedTimeEquals(presented, _options.ServiceToken))
        {
            throw new RpcException(new Status(
                StatusCode.Unauthenticated, "This endpoint is restricted to internal mesh callers."));
        }
    }

    private static bool FixedTimeEquals(string? a, string? b)
    {
        if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
    }
}
