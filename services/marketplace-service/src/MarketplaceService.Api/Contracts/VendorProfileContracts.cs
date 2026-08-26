namespace MarketplaceService.Api.Contracts;

public record CreateVendorProfileRequest(
    string VendorName,
    string? Description,
    string? BusinessRegistrationNumber,
    string? CategoryPreference,
    string? FulfillmentMethod,
    string? OperatingHours,
    string? LocationText,
    decimal? MinimumAmount);

public record VendorProfileResponse(
    Guid VendorId,
    Guid UserId,
    string VendorName,
    string? Description,
    string? BusinessRegistrationNumber,
    string? CategoryPreference,
    string? FulfillmentMethod,
    string? OperatingHours,
    string? LocationText,
    decimal? MinimumAmount,
    string VerificationStatus,
    DateTimeOffset? VerifiedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
