using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class ReviewConfiguration : IEntityTypeConfiguration<Review>
{
    public void Configure(EntityTypeBuilder<Review> builder)
    {
        builder.ToTable("review", "auth_db");

        builder.HasKey(r => r.ReviewId);
        builder.Property(r => r.ReviewId).HasColumnName("review_id");
        builder.Property(r => r.VendorId).HasColumnName("vendor_id");
        builder.Property(r => r.ReviewerId).HasColumnName("reviewer_id");
        builder.Property(r => r.Rating).HasColumnName("rating").IsRequired();
        builder.Property(r => r.Comment).HasColumnName("comment");
        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");

        builder.HasIndex(r => r.VendorId);
        builder.HasIndex(r => new { r.VendorId, r.ReviewerId }).IsUnique();

        builder.HasOne(r => r.Vendor)
            .WithMany(u => u.ReviewsReceived)
            .HasForeignKey(r => r.VendorId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(r => r.Reviewer)
            .WithMany(u => u.ReviewsWritten)
            .HasForeignKey(r => r.ReviewerId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
