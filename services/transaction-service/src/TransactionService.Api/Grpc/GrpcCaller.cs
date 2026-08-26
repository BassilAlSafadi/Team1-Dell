using Grpc.Core;

namespace TransactionService.Api.Grpc;

internal static class GrpcCaller
{
    /// <summary>
    /// The end user on whose behalf an internal caller (today: the gateway) is making this call,
    /// taken from x-user-id metadata.
    ///
    /// Trusting this metadata is only sound because InternalAuthInterceptor has already
    /// established that the caller holds the mesh's internal token — i.e. it is the gateway,
    /// which validated the user's JWT itself. It must never be trusted on a publicly reachable
    /// port.
    /// </summary>
    public static Guid RequireUserId(ServerCallContext context)
    {
        var raw = context.RequestHeaders.GetValue(InternalAuthInterceptor.UserIdHeader);

        if (!Guid.TryParse(raw, out var userId))
        {
            throw new RpcException(new Status(
                StatusCode.Unauthenticated,
                "Calls must carry the acting user's id in x-user-id metadata."));
        }

        return userId;
    }
}
