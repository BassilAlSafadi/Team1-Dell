using Grpc.Core;
using Grpc.Core.Interceptors;
using Microsoft.Extensions.Options;
using AuthService.Infrastructure.Options;

namespace AuthService.Api.Grpc;

/// <summary>
/// Attaches the mesh's shared internal token to every outgoing gRPC call, so peers that now
/// require it (all of them) accept calls from this service.
/// </summary>
public class InternalTokenClientInterceptor : Interceptor
{
    private readonly InternalOptions _options;

    public InternalTokenClientInterceptor(IOptions<InternalOptions> options)
    {
        _options = options.Value;
    }

    public override AsyncUnaryCall<TResponse> AsyncUnaryCall<TRequest, TResponse>(
        TRequest request,
        ClientInterceptorContext<TRequest, TResponse> context,
        AsyncUnaryCallContinuation<TRequest, TResponse> continuation)
    {
        var headers = context.Options.Headers ?? new Metadata();
        if (!string.IsNullOrWhiteSpace(_options.ServiceToken))
        {
            headers.Add(InternalAuthInterceptor.TokenHeader, _options.ServiceToken);
        }

        var options = context.Options.WithHeaders(headers);
        return continuation(request, new ClientInterceptorContext<TRequest, TResponse>(
            context.Method, context.Host, options));
    }
}
