using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class PermissionConfiguration : IEntityTypeConfiguration<Permission>
{
    public void Configure(EntityTypeBuilder<Permission> builder)
    {
        builder.ToTable("permission", "auth_db");

        builder.HasKey(p => p.PermissionId);
        builder.Property(p => p.PermissionId).HasColumnName("permission_id");
        builder.Property(p => p.Name).HasColumnName("name").HasMaxLength(50).IsRequired();
        builder.Property(p => p.Description).HasColumnName("description").HasMaxLength(255);

        builder.HasIndex(p => p.Name).IsUnique();
    }
}
