using System.Net;
using AuthService.Api.Services;
using Grpc.Core;

namespace AuthService.Api.Grpc;

// Generated proto types are always fully qualified (global::Auth.V1.X) rather than
// `using`-imported, because the generated service class name ("AuthService") collides with
// this project's own root namespace ("AuthService.Api", "AuthService.Domain", ...).
public class AuthGrpcService : global::Auth.V1.AuthService.AuthServiceBase
{
    private readonly IAuthenticationService _authenticationService;
    private readonly IReviewService _reviewService;

    public AuthGrpcService(IAuthenticationService authenticationService, IReviewService reviewService)
    {
        _authenticationService = authenticationService;
        _reviewService = reviewService;
    }

    public override async Task<global::Auth.V1.UserResponse> GetUser(global::Auth.V1.GetUserRequest request, ServerCallContext context)
    {
        if (!Guid.TryParse(request.UserId, out var userId))
        {
            throw new RpcException(new Status(StatusCode.InvalidArgument, "user_id must be a valid GUID."));
        }

        try
        {
            var user = await _authenticationService.GetUserAsync(userId, context.CancellationToken);

            var response = new global::Auth.V1.UserResponse
            {
                UserId = user.UserId.ToString(),
                Email = user.Email,
                EmailVerified = user.EmailVerified,
                Status = user.Status
            };
            response.Roles.Add(user.Roles);
            return response;
        }
        catch (AuthDomainException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            throw new RpcException(new Status(StatusCode.NotFound, "User not found."));
        }
    }

    public override async Task<global::Auth.V1.VendorProfileResponse> GetVendorProfile(global::Auth.V1.GetVendorProfileRequest request, ServerCallContext context)
    {
        if (!Guid.TryParse(request.VendorId, out var vendorId))
        {
            throw new RpcException(new Status(StatusCode.InvalidArgument, "vendor_id must be a valid GUID."));
        }

        try
        {
            var profile = await _reviewService.GetVendorProfileAsync(vendorId, context.CancellationToken);

            return new global::Auth.V1.VendorProfileResponse
            {
                VendorId = profile.VendorId.ToString(),
                Email = profile.Email,
                Status = profile.Status,
                AverageRating = profile.AverageRating,
                ReviewCount = profile.ReviewCount
            };
        }
        catch (AuthDomainException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            throw new RpcException(new Status(StatusCode.NotFound, "Vendor not found."));
        }
    }
}
