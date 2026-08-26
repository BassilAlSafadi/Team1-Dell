using System.Net;
using Microsoft.EntityFrameworkCore;
using MarketplaceService.Api.Contracts;
using MarketplaceService.Domain.Entities;
using MarketplaceService.Infrastructure.Persistence;

namespace MarketplaceService.Api.Services;

public class VendorProfileService : IVendorProfileService
{
    private readonly MarketplaceDbContext _db;

    public VendorProfileService(MarketplaceDbContext db)
    {
        _db = db;
    }

    public async Task<VendorProfileResponse> CreateAsync(Guid userId, CreateVendorProfileRequest request, CancellationToken ct)
    {
        var exists = await _db.Vendors.AnyAsync(v => v.UserId == userId, ct);
        if (exists)
        {
            throw new MarketplaceDomainException(HttpStatusCode.Conflict, "A vendor profile already exists for this account.");
        }

        var now = DateTimeOffset.UtcNow;
        var vendor = new Vendor
        {
            VendorId = Guid.NewGuid(),
            UserId = userId,
            VendorName = request.VendorName,
            Description = request.Description,
            BusinessRegistrationNumber = request.BusinessRegistrationNumber,
            CategoryPreference = request.CategoryPreference,
            FulfillmentMethod = request.FulfillmentMethod,
            OperatingHours = request.OperatingHours,
            LocationText = request.LocationText,
            MinimumAmount = request.MinimumAmount,
            VerificationStatus = "UNVERIFIED",
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Vendors.Add(vendor);
        await _db.SaveChangesAsync(ct);

        return ToResponse(vendor);
    }

    public async Task<VendorProfileResponse> GetMineAsync(Guid userId, CancellationToken ct)
    {
        var vendor = await _db.Vendors.FirstOrDefaultAsync(v => v.UserId == userId, ct)
            ?? throw new MarketplaceDomainException(HttpStatusCode.NotFound, "No vendor profile found for this account.");

        return ToResponse(vendor);
    }

    public async Task<IReadOnlyList<VendorProfileResponse>> SearchAsync(string? category, string? city, string? q, CancellationToken ct)
    {
        var query = _db.Vendors.AsQueryable();

        if (!string.IsNullOrWhiteSpace(category))
        {
            query = query.Where(v => v.CategoryPreference == category);
        }

        if (!string.IsNullOrWhiteSpace(city))
        {
            query = query.Where(v => v.LocationText != null && EF.Functions.ILike(v.LocationText, $"%{city}%"));
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            query = query.Where(v => EF.Functions.ILike(v.VendorName, $"%{q}%"));
        }

        var vendors = await query.ToListAsync(ct);

        return vendors.Select(ToResponse).ToList();
    }

    public async Task<VendorProfileResponse> GetAsync(Guid vendorId, CancellationToken ct)
    {
        var vendor = await _db.Vendors.FirstOrDefaultAsync(v => v.VendorId == vendorId, ct)
            ?? throw new MarketplaceDomainException(HttpStatusCode.NotFound, "Vendor not found.");

        return ToResponse(vendor);
    }

    private static VendorProfileResponse ToResponse(Vendor vendor) => new(
        vendor.VendorId,
        vendor.UserId,
        vendor.VendorName,
        vendor.Description,
        vendor.BusinessRegistrationNumber,
        vendor.CategoryPreference,
        vendor.FulfillmentMethod,
        vendor.OperatingHours,
        vendor.LocationText,
        vendor.MinimumAmount,
        vendor.VerificationStatus,
        vendor.VerifiedAt,
        vendor.CreatedAt,
        vendor.UpdatedAt);
}
