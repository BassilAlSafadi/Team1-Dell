using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MarketplaceService.Domain.Entities;

namespace MarketplaceService.Infrastructure.Persistence.Configurations;

public class LocationConfiguration : IEntityTypeConfiguration<Location>
{
    public void Configure(EntityTypeBuilder<Location> builder)
    {
        builder.ToTable("location", "marketplace_db");

        builder.HasKey(l => l.LocationId);
        builder.Property(l => l.LocationId).HasColumnName("location_id");
        builder.Property(l => l.Country).HasColumnName("country").HasColumnType("char(2)").HasMaxLength(2).IsRequired();
        builder.Property(l => l.City).HasColumnName("city").HasMaxLength(100).IsRequired();
        builder.Property(l => l.Address).HasColumnName("address").HasMaxLength(255);
        builder.Property(l => l.Latitude).HasColumnName("latitude").HasColumnType("numeric(9,6)");
        builder.Property(l => l.Longitude).HasColumnName("longitude").HasColumnType("numeric(9,6)");
    }
}
