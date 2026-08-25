namespace AuthService.Api.Contracts;

public record ReviewResponse(
    Guid ReviewId,
    Guid VendorId,
    Guid ReviewerId,
    short Rating,
    string? Comment,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record VendorProfileResponse(
    Guid VendorId,
    string Email,
    string Status,
    double AverageRating,
    int ReviewCount);

public record VendorReviewsResponse(
    Guid VendorId,
    double AverageRating,
    int ReviewCount,
    int Page,
    int PageSize,
    IReadOnlyList<ReviewResponse> Reviews);
