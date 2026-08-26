using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MarketplaceService.Domain.Entities;

namespace MarketplaceService.Infrastructure.Persistence.Configurations;

public class CorporateConfiguration : IEntityTypeConfiguration<Corporate>
{
    public void Configure(EntityTypeBuilder<Corporate> builder)
    {
        builder.ToTable("corporate", "marketplace_db");

        builder.HasKey(c => c.CorporateId);
        builder.Property(c => c.CorporateId).HasColumnName("corporate_id");
        builder.Property(c => c.UserId).HasColumnName("user_id");
        builder.Property(c => c.CompanyName).HasColumnName("company_name").HasMaxLength(150).IsRequired();
        builder.Property(c => c.Description).HasColumnName("description");
        builder.Property(c => c.BusinessRegistrationNumber).HasColumnName("business_registration_number").HasMaxLength(50);
        builder.Property(c => c.Industry).HasColumnName("industry").HasMaxLength(100);
        builder.Property(c => c.Website).HasColumnName("website").HasMaxLength(255);
        builder.Property(c => c.LocationText).HasColumnName("location_text").HasMaxLength(255);
        builder.Property(c => c.VerificationStatus).HasColumnName("verification_status").HasMaxLength(16).IsRequired();
        builder.Property(c => c.VerifiedAt).HasColumnName("verified_at");
        builder.Property(c => c.CreatedAt).HasColumnName("created_at");
        builder.Property(c => c.UpdatedAt).HasColumnName("updated_at");

        builder.HasIndex(c => c.UserId).IsUnique().HasDatabaseName("corporate_user_id_key");
        builder.HasIndex(c => c.BusinessRegistrationNumber).IsUnique().HasDatabaseName("corporate_business_registration_number_key");
    }
}
