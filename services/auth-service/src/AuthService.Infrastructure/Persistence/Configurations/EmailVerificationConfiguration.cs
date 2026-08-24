using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class EmailVerificationConfiguration : IEntityTypeConfiguration<EmailVerification>
{
    public void Configure(EntityTypeBuilder<EmailVerification> builder)
    {
        builder.ToTable("email_verification", "auth_db");

        builder.HasKey(e => e.VerificationId);
        builder.Property(e => e.VerificationId).HasColumnName("verification_id");
        builder.Property(e => e.UserId).HasColumnName("user_id");
        builder.Property(e => e.CodeHash).HasColumnName("code_hash").HasMaxLength(255).IsRequired();
        builder.Property(e => e.ExpiresAt).HasColumnName("expires_at");
        builder.Property(e => e.UsedAt).HasColumnName("used_at");
        builder.Property(e => e.CreatedAt).HasColumnName("created_at");

        builder.HasIndex(e => e.CodeHash).IsUnique();
        builder.Ignore(e => e.IsRedeemable);
    }
}
