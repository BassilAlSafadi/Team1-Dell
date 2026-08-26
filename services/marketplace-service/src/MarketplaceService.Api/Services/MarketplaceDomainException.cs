using System.Net;

namespace MarketplaceService.Api.Services;

public class MarketplaceDomainException : Exception
{
    public HttpStatusCode StatusCode { get; }

    public MarketplaceDomainException(HttpStatusCode statusCode, string message) : base(message)
    {
        StatusCode = statusCode;
    }
}
