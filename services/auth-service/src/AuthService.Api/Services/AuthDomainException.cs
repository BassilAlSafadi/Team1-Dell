using System.Net;

namespace AuthService.Api.Services;

public class AuthDomainException : Exception
{
    public HttpStatusCode StatusCode { get; }

    public AuthDomainException(HttpStatusCode statusCode, string message) : base(message)
    {
        StatusCode = statusCode;
    }
}
