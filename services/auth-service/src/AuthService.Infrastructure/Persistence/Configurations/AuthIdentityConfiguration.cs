using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class AuthIdentityConfiguration : IEntityTypeConfiguration<AuthIdentity>
{
    public void Configure(EntityTypeBuilder<AuthIdentity> builder)
    {
        builder.ToTable("auth_identity", "auth_db");

        builder.HasKey(i => i.IdentityId);
        builder.Property(i => i.IdentityId).HasColumnName("identity_id");
        builder.Property(i => i.UserId).HasColumnName("user_id");
        builder.Property(i => i.Provider).HasColumnName("provider").HasMaxLength(20).IsRequired();
        builder.Property(i => i.ProviderUserId).HasColumnName("provider_user_id").HasMaxLength(255).IsRequired();
        builder.Property(i => i.PasswordHash).HasColumnName("password_hash").HasMaxLength(255);
        builder.Property(i => i.CreatedAt).HasColumnName("created_at");

        builder.HasIndex(i => new { i.Provider, i.ProviderUserId }).IsUnique();
    }
}
