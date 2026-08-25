using System.Net;
using AuthService.Api.Contracts;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Api.Services;

public class ReviewService : IReviewService
{
    private const string VendorRoleName = "VENDOR";
    private const int MaxPageSize = 50;

    private readonly AuthDbContext _db;

    public ReviewService(AuthDbContext db)
    {
        _db = db;
    }

    public async Task<ReviewResponse> UpsertReviewAsync(Guid vendorId, Guid reviewerId, short rating, string? comment, CancellationToken ct)
    {
        if (rating is < 1 or > 5)
        {
            throw new AuthDomainException(HttpStatusCode.BadRequest, "Rating must be between 1 and 5.");
        }

        if (reviewerId == vendorId)
        {
            throw new AuthDomainException(HttpStatusCode.BadRequest, "You cannot review yourself.");
        }

        await EnsureVendorExistsAsync(vendorId, ct);

        var reviewerExists = await _db.Users.AnyAsync(u => u.UserId == reviewerId, ct);
        if (!reviewerExists)
        {
            throw new AuthDomainException(HttpStatusCode.NotFound, "Reviewer not found.");
        }

        var now = DateTimeOffset.UtcNow;
        var review = await _db.Reviews.FirstOrDefaultAsync(r => r.VendorId == vendorId && r.ReviewerId == reviewerId, ct);

        if (review is null)
        {
            review = new Review
            {
                ReviewId = Guid.NewGuid(),
                VendorId = vendorId,
                ReviewerId = reviewerId,
                CreatedAt = now
            };
            _db.Reviews.Add(review);
        }

        review.Rating = rating;
        review.Comment = comment;
        review.UpdatedAt = now;

        await _db.SaveChangesAsync(ct);

        return ToResponse(review);
    }

    public async Task DeleteReviewAsync(Guid vendorId, Guid reviewerId, CancellationToken ct)
    {
        var review = await _db.Reviews.FirstOrDefaultAsync(r => r.VendorId == vendorId && r.ReviewerId == reviewerId, ct)
            ?? throw new AuthDomainException(HttpStatusCode.NotFound, "Review not found.");

        _db.Reviews.Remove(review);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<VendorProfileResponse> GetVendorProfileAsync(Guid vendorId, CancellationToken ct)
    {
        var vendor = await EnsureVendorExistsAsync(vendorId, ct);
        var (averageRating, reviewCount) = await GetRatingStatsAsync(vendorId, ct);

        return new VendorProfileResponse(vendor.UserId, vendor.Email, vendor.Status, averageRating, reviewCount);
    }

    public async Task<VendorReviewsResponse> GetVendorReviewsAsync(Guid vendorId, int page, int pageSize, CancellationToken ct)
    {
        await EnsureVendorExistsAsync(vendorId, ct);

        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 20 : Math.Min(pageSize, MaxPageSize);

        var (averageRating, reviewCount) = await GetRatingStatsAsync(vendorId, ct);

        var reviews = await _db.Reviews
            .Where(r => r.VendorId == vendorId)
            .OrderByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new VendorReviewsResponse(vendorId, averageRating, reviewCount, page, pageSize, reviews.Select(ToResponse).ToList());
    }

    private async Task<User> EnsureVendorExistsAsync(Guid vendorId, CancellationToken ct)
    {
        var vendor = await _db.Users.FirstOrDefaultAsync(u => u.UserId == vendorId, ct)
            ?? throw new AuthDomainException(HttpStatusCode.NotFound, "Vendor not found.");

        var isVendor = await _db.UserRoles
            .AnyAsync(ur => ur.UserId == vendorId && ur.Role.Name == VendorRoleName, ct);
        if (!isVendor)
        {
            throw new AuthDomainException(HttpStatusCode.NotFound, "Vendor not found.");
        }

        return vendor;
    }

    private async Task<(double AverageRating, int ReviewCount)> GetRatingStatsAsync(Guid vendorId, CancellationToken ct)
    {
        var stats = await _db.Reviews
            .Where(r => r.VendorId == vendorId)
            .GroupBy(r => 1)
            .Select(g => new { Count = g.Count(), Average = g.Average(r => (double)r.Rating) })
            .FirstOrDefaultAsync(ct);

        return stats is null ? (0d, 0) : (Math.Round(stats.Average, 2), stats.Count);
    }

    private static ReviewResponse ToResponse(Review review) =>
        new(review.ReviewId, review.VendorId, review.ReviewerId, review.Rating, review.Comment, review.CreatedAt, review.UpdatedAt);
}
