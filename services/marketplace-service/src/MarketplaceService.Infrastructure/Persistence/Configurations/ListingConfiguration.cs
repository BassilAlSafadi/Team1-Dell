using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MarketplaceService.Domain.Entities;

namespace MarketplaceService.Infrastructure.Persistence.Configurations;

public class ListingConfiguration : IEntityTypeConfiguration<Listing>
{
    public void Configure(EntityTypeBuilder<Listing> builder)
    {
        builder.ToTable("listing", "marketplace_db");

        builder.HasKey(l => l.ListingId);
        builder.Property(l => l.ListingId).HasColumnName("listing_id");
        builder.Property(l => l.OwnerId).HasColumnName("owner_id");
        builder.Property(l => l.Title).HasColumnName("title").HasMaxLength(200).IsRequired();
        builder.Property(l => l.Description).HasColumnName("description");
        builder.Property(l => l.CategoryId).HasColumnName("category_id");
        builder.Property(l => l.Condition).HasColumnName("condition").HasMaxLength(16).IsRequired();
        builder.Property(l => l.Quantity).HasColumnName("quantity").HasColumnType("numeric(12,3)");
        builder.Property(l => l.Unit).HasColumnName("unit").HasMaxLength(10).IsRequired();
        builder.Property(l => l.ExpectedAmount).HasColumnName("expected_amount").HasColumnType("numeric(14,2)");
        builder.Property(l => l.Currency).HasColumnName("currency").HasColumnType("char(3)").HasMaxLength(3);
        builder.Property(l => l.LocationId).HasColumnName("location_id");
        builder.Property(l => l.Status).HasColumnName("status").HasMaxLength(16).IsRequired();
        builder.Property(l => l.CreatedAt).HasColumnName("created_at");
        builder.Property(l => l.UpdatedAt).HasColumnName("updated_at");

        builder.HasIndex(l => l.OwnerId).HasDatabaseName("idx_listing_owner");
        builder.HasIndex(l => l.Status).HasDatabaseName("idx_listing_status");
        builder.HasIndex(l => l.CategoryId).HasDatabaseName("idx_listing_category");

        builder.HasOne(l => l.Category)
            .WithMany()
            .HasForeignKey(l => l.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(l => l.Location)
            .WithMany()
            .HasForeignKey(l => l.LocationId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
