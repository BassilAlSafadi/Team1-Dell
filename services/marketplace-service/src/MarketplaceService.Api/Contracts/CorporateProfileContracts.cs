namespace MarketplaceService.Api.Contracts;

public record CreateCorporateProfileRequest(
    string CompanyName,
    string? Description,
    string? BusinessRegistrationNumber,
    string? Industry,
    string? Website,
    string? LocationText);

public record CorporateProfileResponse(
    Guid CorporateId,
    Guid UserId,
    string CompanyName,
    string? Description,
    string? BusinessRegistrationNumber,
    string? Industry,
    string? Website,
    string? LocationText,
    string VerificationStatus,
    DateTimeOffset? VerifiedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
