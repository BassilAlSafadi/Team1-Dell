using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MarketplaceService.Domain.Entities;

namespace MarketplaceService.Infrastructure.Persistence.Configurations;

public class VendorConfiguration : IEntityTypeConfiguration<Vendor>
{
    public void Configure(EntityTypeBuilder<Vendor> builder)
    {
        builder.ToTable("vendor", "marketplace_db");

        builder.HasKey(v => v.VendorId);
        builder.Property(v => v.VendorId).HasColumnName("vendor_id");
        builder.Property(v => v.UserId).HasColumnName("user_id");
        builder.Property(v => v.VendorName).HasColumnName("vendor_name").HasMaxLength(150).IsRequired();
        builder.Property(v => v.Description).HasColumnName("description");
        builder.Property(v => v.BusinessRegistrationNumber).HasColumnName("business_registration_number").HasMaxLength(50);
        builder.Property(v => v.CategoryPreference).HasColumnName("category_preference").HasMaxLength(100);
        builder.Property(v => v.FulfillmentMethod).HasColumnName("fulfillment_method").HasMaxLength(50);
        builder.Property(v => v.OperatingHours).HasColumnName("operating_hours").HasMaxLength(100);
        builder.Property(v => v.LocationText).HasColumnName("location_text").HasMaxLength(255);
        builder.Property(v => v.MinimumAmount).HasColumnName("minimum_amount").HasColumnType("numeric(14,2)");
        builder.Property(v => v.VerificationStatus).HasColumnName("verification_status").HasMaxLength(16).IsRequired();
        builder.Property(v => v.VerifiedAt).HasColumnName("verified_at");
        builder.Property(v => v.CreatedAt).HasColumnName("created_at");
        builder.Property(v => v.UpdatedAt).HasColumnName("updated_at");

        builder.HasIndex(v => v.UserId).IsUnique().HasDatabaseName("vendor_user_id_key");
        builder.HasIndex(v => v.BusinessRegistrationNumber).IsUnique().HasDatabaseName("vendor_business_registration_number_key");
    }
}
