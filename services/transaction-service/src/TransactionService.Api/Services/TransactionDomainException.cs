using System.Net;

namespace TransactionService.Api.Services;

public class TransactionDomainException : Exception
{
    public HttpStatusCode StatusCode { get; }

    public TransactionDomainException(HttpStatusCode statusCode, string message) : base(message)
    {
        StatusCode = statusCode;
    }
}
