using System.Security.Cryptography;
using System.Text;
using MarketplaceService.Infrastructure.Options;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;

namespace MarketplaceService.Api.Security;

/// <summary>
/// Restricts an endpoint to callers that present the mesh's shared internal token in the
/// X-Internal-Token header. A user's bearer JWT is NOT sufficient — these endpoints answer
/// questions about arbitrary users, so they must never be reachable with an end-user token.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class InternalOnlyAttribute : Attribute, IAsyncAuthorizationFilter
{
    public const string HeaderName = "X-Internal-Token";

    public Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var configured = context.HttpContext.RequestServices
            .GetRequiredService<IOptions<InternalOptions>>().Value.ServiceToken;

        // Fail closed: an unconfigured token means nobody gets in, rather than everybody.
        if (string.IsNullOrWhiteSpace(configured))
        {
            context.Result = new StatusCodeResult(StatusCodes.Status503ServiceUnavailable);
            return Task.CompletedTask;
        }

        var presented = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (!FixedTimeEquals(presented, configured))
        {
            context.Result = new StatusCodeResult(StatusCodes.Status401Unauthorized);
        }

        return Task.CompletedTask;
    }

    // Constant-time so the comparison can't be turned into a byte-at-a-time oracle.
    internal static bool FixedTimeEquals(string? a, string? b)
    {
        if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
    }
}
