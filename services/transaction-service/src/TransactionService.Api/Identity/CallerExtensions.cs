using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using TransactionService.Api.Services;

namespace TransactionService.Api.Identity;

public static class CallerExtensions
{
    /// <summary>
    /// The authenticated caller's auth-service user id.
    ///
    /// Replaces the previous `Guid.Parse(User.FindFirstValue(...)!)` copied across controllers,
    /// which threw NullReference/Format and surfaced as a 500 when the token carried a missing or
    /// malformed subject. A bad subject is an authentication problem, so it must be a 401.
    /// </summary>
    public static Guid CurrentUserId(this ControllerBase controller)
    {
        var raw = controller.User.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? controller.User.FindFirstValue("sub");

        if (!Guid.TryParse(raw, out var userId))
        {
            throw new TransactionDomainException(
                HttpStatusCode.Unauthorized, "Token subject is missing or not a valid user id.");
        }

        return userId;
    }
}
