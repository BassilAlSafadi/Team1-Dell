using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class PasswordResetConfiguration : IEntityTypeConfiguration<PasswordReset>
{
    public void Configure(EntityTypeBuilder<PasswordReset> builder)
    {
        builder.ToTable("password_reset", "auth_db");

        builder.HasKey(p => p.ResetId);
        builder.Property(p => p.ResetId).HasColumnName("reset_id");
        builder.Property(p => p.UserId).HasColumnName("user_id");
        builder.Property(p => p.TokenHash).HasColumnName("token_hash").HasMaxLength(255).IsRequired();
        builder.Property(p => p.ExpiresAt).HasColumnName("expires_at");
        builder.Property(p => p.UsedAt).HasColumnName("used_at");
        builder.Property(p => p.CreatedAt).HasColumnName("created_at");

        builder.HasIndex(p => p.TokenHash).IsUnique();
        builder.Ignore(p => p.IsRedeemable);
    }
}
