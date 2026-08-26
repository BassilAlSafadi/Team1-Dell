using System.Net;
using Microsoft.EntityFrameworkCore;
using MarketplaceService.Api.Contracts;
using MarketplaceService.Domain.Entities;
using MarketplaceService.Infrastructure.Persistence;

namespace MarketplaceService.Api.Services;

public class ListingService : IListingService
{
    // Mirrors the CHECK constraints on marketplace_db.listing in
    // db/migrations/0001_create_marketplace_tables.sql — validated here so a bad value
    // surfaces as a clean 400 instead of leaking a raw Postgres constraint-violation as a 500.
    private static readonly HashSet<string> AllowedConditions = new(StringComparer.Ordinal)
    {
        "NEW", "USED", "REFURBISHED", "SCRAP", "MIXED"
    };

    private static readonly HashSet<string> AllowedUnits = new(StringComparer.Ordinal)
    {
        "KG", "TONNE", "UNIT", "PALLET", "M3", "LITRE"
    };

    private static readonly HashSet<string> AllowedStatuses = new(StringComparer.Ordinal)
    {
        "ACTIVE", "RESERVED", "SOLD", "COMPLETED", "CANCELLED", "EXPIRED"
    };

    private const int MaxPageSize = 100;

    private readonly MarketplaceDbContext _db;

    public ListingService(MarketplaceDbContext db)
    {
        _db = db;
    }

    public async Task<ListingResponse> CreateAsync(Guid ownerId, CreateListingRequest request, CancellationToken ct)
    {
        if (!AllowedConditions.Contains(request.Condition))
        {
            throw new MarketplaceDomainException(HttpStatusCode.BadRequest, $"Invalid condition '{request.Condition}'.");
        }

        if (!AllowedUnits.Contains(request.Unit))
        {
            throw new MarketplaceDomainException(HttpStatusCode.BadRequest, $"Invalid unit '{request.Unit}'.");
        }

        if (request.Quantity <= 0)
        {
            throw new MarketplaceDomainException(HttpStatusCode.BadRequest, "Quantity must be positive.");
        }

        var categoryExists = await _db.Categories.AnyAsync(c => c.CategoryId == request.CategoryId, ct);
        if (!categoryExists)
        {
            throw new MarketplaceDomainException(HttpStatusCode.NotFound, "Category not found.");
        }

        var now = DateTimeOffset.UtcNow;
        var listing = new Listing
        {
            ListingId = Guid.NewGuid(),
            OwnerId = ownerId,
            Title = request.Title,
            Description = request.Description,
            CategoryId = request.CategoryId,
            Condition = request.Condition,
            Quantity = request.Quantity,
            Unit = request.Unit,
            ExpectedAmount = request.ExpectedAmount,
            Currency = request.Currency,
            LocationId = request.LocationId,
            Status = "ACTIVE",
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Listings.Add(listing);
        await _db.SaveChangesAsync(ct);

        return await ToResponseAsync(listing, ct);
    }

    public async Task<IReadOnlyList<ListingResponse>> ListMineAsync(Guid ownerId, int page, int pageSize, CancellationToken ct)
    {
        (page, pageSize) = ClampPaging(page, pageSize);

        var listings = await _db.Listings
            .Where(l => l.OwnerId == ownerId)
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return await ToResponsesAsync(listings, ct);
    }

    public async Task<IReadOnlyList<ListingResponse>> SearchAsync(
        string? status, short? categoryId, int page, int pageSize, CancellationToken ct)
    {
        (page, pageSize) = ClampPaging(page, pageSize);

        var effectiveStatus = string.IsNullOrWhiteSpace(status) ? "ACTIVE" : status;

        if (!AllowedStatuses.Contains(effectiveStatus))
        {
            throw new MarketplaceDomainException(HttpStatusCode.BadRequest, $"Invalid status '{effectiveStatus}'.");
        }

        var query = _db.Listings.Where(l => l.Status == effectiveStatus);

        if (categoryId is not null)
        {
            query = query.Where(l => l.CategoryId == categoryId);
        }

        var listings = await query
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return await ToResponsesAsync(listings, ct);
    }

    public async Task<ListingResponse> GetAsync(Guid listingId, CancellationToken ct)
    {
        var listing = await FindAsync(listingId, ct);
        return await ToResponseAsync(listing, ct);
    }

    public async Task<ListingResponse> UpdateStatusAsync(Guid listingId, Guid ownerId, string status, CancellationToken ct)
    {
        if (!AllowedStatuses.Contains(status))
        {
            throw new MarketplaceDomainException(HttpStatusCode.BadRequest, $"Invalid status '{status}'.");
        }

        var listing = await FindAsync(listingId, ct);

        if (listing.OwnerId != ownerId)
        {
            throw new MarketplaceDomainException(HttpStatusCode.Forbidden, "Only the listing owner may update its status.");
        }

        listing.Status = status;
        listing.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(ct);

        return await ToResponseAsync(listing, ct);
    }

    // Unbounded ToListAsync() let a single request pull every listing of a status into memory.
    private static (int Page, int PageSize) ClampPaging(int page, int pageSize)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 20 : Math.Min(pageSize, MaxPageSize);
        return (page, pageSize);
    }

    private async Task<Listing> FindAsync(Guid listingId, CancellationToken ct)
    {
        return await _db.Listings.FirstOrDefaultAsync(l => l.ListingId == listingId, ct)
            ?? throw new MarketplaceDomainException(HttpStatusCode.NotFound, "Listing not found.");
    }

    private async Task<ListingResponse> ToResponseAsync(Listing listing, CancellationToken ct)
    {
        var responses = await ToResponsesAsync(new List<Listing> { listing }, ct);
        return responses[0];
    }

    // Batches the category-name join and owner->corporate-id resolution across a whole list
    // instead of one round-trip per listing.
    private async Task<IReadOnlyList<ListingResponse>> ToResponsesAsync(IReadOnlyList<Listing> listings, CancellationToken ct)
    {
        if (listings.Count == 0)
        {
            return Array.Empty<ListingResponse>();
        }

        var categoryIds = listings.Select(l => l.CategoryId).Distinct().ToList();
        var categoryNames = await _db.Categories
            .Where(c => categoryIds.Contains(c.CategoryId))
            .ToDictionaryAsync(c => c.CategoryId, c => c.Name, ct);

        var ownerIds = listings.Select(l => l.OwnerId).Distinct().ToList();
        var ownerCorporateIds = await _db.Corporates
            .Where(c => ownerIds.Contains(c.UserId))
            .ToDictionaryAsync(c => c.UserId, c => (Guid?)c.CorporateId, ct);

        return listings.Select(listing => new ListingResponse(
            listing.ListingId,
            listing.OwnerId,
            listing.Title,
            listing.Description,
            listing.CategoryId,
            categoryNames.GetValueOrDefault(listing.CategoryId, string.Empty),
            listing.Condition,
            listing.Quantity,
            listing.Unit,
            listing.ExpectedAmount,
            listing.Currency,
            listing.LocationId,
            listing.Status,
            listing.CreatedAt,
            listing.UpdatedAt,
            ownerCorporateIds.GetValueOrDefault(listing.OwnerId))).ToList();
    }
}
