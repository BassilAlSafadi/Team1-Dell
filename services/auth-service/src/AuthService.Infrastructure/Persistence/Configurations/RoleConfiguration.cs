using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.ToTable("role", "auth_db");

        builder.HasKey(r => r.RoleId);
        builder.Property(r => r.RoleId).HasColumnName("role_id");
        builder.Property(r => r.Name).HasColumnName("name").HasMaxLength(30).IsRequired();
        builder.Property(r => r.Description).HasColumnName("description").HasMaxLength(255);

        builder.HasIndex(r => r.Name).IsUnique();
    }
}
