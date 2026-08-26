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
