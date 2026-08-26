using System.Net;
using Microsoft.EntityFrameworkCore;
using MarketplaceService.Api.Contracts;
using MarketplaceService.Domain.Entities;
using MarketplaceService.Infrastructure.Persistence;

namespace MarketplaceService.Api.Services;

public class CorporateProfileService : ICorporateProfileService
{
    private readonly MarketplaceDbContext _db;

    public CorporateProfileService(MarketplaceDbContext db)
    {
        _db = db;
    }

    public async Task<CorporateProfileResponse> CreateAsync(Guid userId, CreateCorporateProfileRequest request, CancellationToken ct)
    {
        var exists = await _db.Corporates.AnyAsync(c => c.UserId == userId, ct);
        if (exists)
        {
            throw new MarketplaceDomainException(HttpStatusCode.Conflict, "A corporate profile already exists for this account.");
        }

        var now = DateTimeOffset.UtcNow;
        var corporate = new Corporate
        {
            CorporateId = Guid.NewGuid(),
            UserId = userId,
            CompanyName = request.CompanyName,
            Description = request.Description,
            BusinessRegistrationNumber = request.BusinessRegistrationNumber,
            Industry = request.Industry,
            Website = request.Website,
            LocationText = request.LocationText,
            VerificationStatus = "UNVERIFIED",
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Corporates.Add(corporate);
        await _db.SaveChangesAsync(ct);

        return ToResponse(corporate);
    }

    public async Task<CorporateProfileResponse> GetMineAsync(Guid userId, CancellationToken ct)
    {
        var corporate = await _db.Corporates.FirstOrDefaultAsync(c => c.UserId == userId, ct)
            ?? throw new MarketplaceDomainException(HttpStatusCode.NotFound, "No corporate profile found for this account.");

        return ToResponse(corporate);
    }

    public async Task<CorporateProfileResponse> GetAsync(Guid corporateId, CancellationToken ct)
    {
        var corporate = await _db.Corporates.FirstOrDefaultAsync(c => c.CorporateId == corporateId, ct)
            ?? throw new MarketplaceDomainException(HttpStatusCode.NotFound, "Corporate not found.");

        return ToResponse(corporate);
    }

    // Mirrors VendorProfileService.SearchAsync (industry stands in for vendor's category —
    // there's no natural "category" dimension on a corporate profile). Also doubles as the
    // plain list a caller with only a business owner's user_id (e.g. messaging conversation
    // participants) uses to resolve a display name, the same way the vendor list already
    // does for FindVendorsPage/messaging.
    public async Task<IReadOnlyList<CorporateProfileResponse>> SearchAsync(string? industry, string? city, string? q, CancellationToken ct)
    {
        var query = _db.Corporates.AsQueryable();

        if (!string.IsNullOrWhiteSpace(industry))
        {
            query = query.Where(c => c.Industry == industry);
        }

        if (!string.IsNullOrWhiteSpace(city))
        {
            query = query.Where(c => c.LocationText != null && EF.Functions.ILike(c.LocationText, $"%{city}%"));
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            query = query.Where(c => EF.Functions.ILike(c.CompanyName, $"%{q}%"));
        }

        var corporates = await query.ToListAsync(ct);
        return corporates.Select(ToResponse).ToList();
    }

    private static CorporateProfileResponse ToResponse(Corporate corporate) => new(
        corporate.CorporateId,
        corporate.UserId,
        corporate.CompanyName,
        corporate.Description,
        corporate.BusinessRegistrationNumber,
        corporate.Industry,
        corporate.Website,
        corporate.LocationText,
        corporate.VerificationStatus,
        corporate.VerifiedAt,
        corporate.CreatedAt,
        corporate.UpdatedAt);
}
