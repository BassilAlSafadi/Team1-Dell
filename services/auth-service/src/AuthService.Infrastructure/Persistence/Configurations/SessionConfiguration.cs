using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class SessionConfiguration : IEntityTypeConfiguration<Session>
{
    public void Configure(EntityTypeBuilder<Session> builder)
    {
        builder.ToTable("session", "auth_db");

        builder.HasKey(s => s.SessionId);
        builder.Property(s => s.SessionId).HasColumnName("session_id");
        builder.Property(s => s.UserId).HasColumnName("user_id");
        builder.Property(s => s.RefreshTokenHash).HasColumnName("refresh_token_hash").HasMaxLength(255).IsRequired();
        builder.Property(s => s.ExpiresAt).HasColumnName("expires_at");
        builder.Property(s => s.CreatedAt).HasColumnName("created_at");
        builder.Property(s => s.RevokedAt).HasColumnName("revoked_at");

        builder.HasIndex(s => s.RefreshTokenHash).IsUnique();
        builder.Ignore(s => s.IsActive);
    }
}
