using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TransactionService.Domain.Entities;

namespace TransactionService.Infrastructure.Persistence.Configurations;

public class OfferConfiguration : IEntityTypeConfiguration<Offer>
{
    public void Configure(EntityTypeBuilder<Offer> builder)
    {
        builder.ToTable("offer", "transaction_db");

        builder.HasKey(o => o.OfferId);
        builder.Property(o => o.OfferId).HasColumnName("offer_id");
        builder.Property(o => o.ListingId).HasColumnName("listing_id");
        builder.Property(o => o.BuyerId).HasColumnName("buyer_id");
        builder.Property(o => o.SellerId).HasColumnName("seller_id");
        builder.Property(o => o.OfferedAmount).HasColumnName("offered_amount").HasColumnType("numeric(14,2)");
        builder.Property(o => o.Currency).HasColumnName("currency").HasColumnType("char(3)").HasMaxLength(3).IsRequired();
        builder.Property(o => o.Message).HasColumnName("message");
        builder.Property(o => o.Status).HasColumnName("status").HasMaxLength(16).IsRequired();
        builder.Property(o => o.CreatedAt).HasColumnName("created_at");
        builder.Property(o => o.ExpiresAt).HasColumnName("expires_at");
        builder.Property(o => o.RespondedAt).HasColumnName("responded_at");

        builder.HasIndex(o => o.BuyerId).HasDatabaseName("idx_offer_buyer");
        builder.HasIndex(o => o.SellerId).HasDatabaseName("idx_offer_seller");
        builder.HasIndex(o => o.ListingId).HasDatabaseName("idx_offer_listing");
        builder.HasIndex(o => o.Status).HasDatabaseName("idx_offer_status");

        builder.HasOne(o => o.Deal)
            .WithOne(d => d.Offer)
            .HasForeignKey<Deal>(d => d.OfferId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
