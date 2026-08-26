using System.ComponentModel.DataAnnotations;

namespace TransactionService.Api.Contracts;

// BuyerId is deliberately absent: it is derived from the authenticated caller's marketplace
// accounts. Accepting it from the body allowed forging an offer on another account's behalf.
public record CreateOfferRequest(
    [property: Required] Guid ListingId,
    [property: Required] Guid SellerId,
    [property: Range(0.01, 99_999_999.99)] decimal OfferedAmount,
    [property: Required, StringLength(3, MinimumLength = 3)] string Currency,
    [property: StringLength(2000)] string? Message,
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
