namespace MarketplaceService.Api.Contracts;

public record CreateListingRequest(
    string Title,
    string? Description,
    short CategoryId,
    string Condition,
    decimal Quantity,
    string Unit,
    decimal? ExpectedAmount,
    string? Currency,
    Guid? LocationId);

public record UpdateListingStatusRequest(string Status);

public record ListingResponse(
    Guid ListingId,
    Guid OwnerId,
    string Title,
    string? Description,
    short CategoryId,
    string CategoryName,
    string Condition,
    decimal Quantity,
    string Unit,
    decimal? ExpectedAmount,
    string? Currency,
    Guid? LocationId,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    Guid? OwnerCorporateId);
