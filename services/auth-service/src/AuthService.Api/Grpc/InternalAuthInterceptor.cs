using System.Security.Cryptography;
using System.Text;
using AuthService.Infrastructure.Options;
using Grpc.Core;
using Grpc.Core.Interceptors;
using Microsoft.Extensions.Options;

namespace AuthService.Api.Grpc;

/// <summary>
/// Requires every inbound gRPC call to carry the mesh's shared internal token.
///
/// AuthGrpcService.GetUser takes a user id and returns that user's email, status and roles with
/// no authorization of any kind. That was safe only as long as nothing could reach the port —
/// which docker-compose was publishing to the host. grpc.health.v1.Health stays exempt so the
/// gateway's health checker can still probe it.
/// </summary>
public class InternalAuthInterceptor : Interceptor
{
    public const string TokenHeader = "x-internal-token";

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
