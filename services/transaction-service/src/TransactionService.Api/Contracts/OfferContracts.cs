namespace TransactionService.Api.Contracts;

public record CreateOfferRequest(
    Guid ListingId,
    Guid BuyerId,
    Guid SellerId,
    decimal OfferedAmount,
    string Currency,
    string? Message,
    DateTimeOffset? ExpiresAt);

public record OfferResponse(
    Guid OfferId,
    Guid ListingId,
    Guid BuyerId,
    Guid SellerId,
    decimal OfferedAmount,
    string Currency,
    string? Message,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ExpiresAt,
    DateTimeOffset? RespondedAt);
