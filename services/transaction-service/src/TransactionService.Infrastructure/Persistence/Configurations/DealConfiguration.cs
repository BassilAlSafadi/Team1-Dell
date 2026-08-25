using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TransactionService.Domain.Entities;

namespace TransactionService.Infrastructure.Persistence.Configurations;

public class DealConfiguration : IEntityTypeConfiguration<Deal>
{
    public void Configure(EntityTypeBuilder<Deal> builder)
    {
        builder.ToTable("deal", "transaction_db");

        builder.HasKey(d => d.DealId);
        builder.Property(d => d.DealId).HasColumnName("deal_id");
        builder.Property(d => d.OfferId).HasColumnName("offer_id");
        builder.Property(d => d.ListingId).HasColumnName("listing_id");
        builder.Property(d => d.BuyerId).HasColumnName("buyer_id");
        builder.Property(d => d.SellerId).HasColumnName("seller_id");
        builder.Property(d => d.AgreedAmount).HasColumnName("agreed_amount").HasColumnType("numeric(14,2)");
        builder.Property(d => d.Currency).HasColumnName("currency").HasColumnType("char(3)").HasMaxLength(3).IsRequired();
        builder.Property(d => d.Status).HasColumnName("status").HasMaxLength(16).IsRequired();
        builder.Property(d => d.CreatedAt).HasColumnName("created_at");
        builder.Property(d => d.CompletedAt).HasColumnName("completed_at");
        builder.Property(d => d.CancelledAt).HasColumnName("cancelled_at");

        builder.HasIndex(d => d.OfferId).IsUnique().HasDatabaseName("uq_deal_offer_id");
        builder.HasIndex(d => d.Status).HasDatabaseName("idx_deal_status");

        builder.HasMany(d => d.StatusHistory)
            .WithOne(h => h.Deal)
            .HasForeignKey(h => h.DealId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(d => d.Payment)
            .WithOne(wt => wt.Deal)
            .HasForeignKey<WalletTransaction>(wt => wt.DealId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
