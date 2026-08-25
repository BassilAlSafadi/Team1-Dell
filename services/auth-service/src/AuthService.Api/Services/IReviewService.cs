using AuthService.Api.Contracts;

namespace AuthService.Api.Services;

public interface IReviewService
{
    Task<ReviewResponse> UpsertReviewAsync(Guid vendorId, Guid reviewerId, short rating, string? comment, CancellationToken ct);
    Task DeleteReviewAsync(Guid vendorId, Guid reviewerId, CancellationToken ct);
    Task<VendorProfileResponse> GetVendorProfileAsync(Guid vendorId, CancellationToken ct);
    Task<VendorReviewsResponse> GetVendorReviewsAsync(Guid vendorId, int page, int pageSize, CancellationToken ct);
}
