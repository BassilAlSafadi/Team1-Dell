using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TransactionService.Domain.Entities;

namespace TransactionService.Infrastructure.Persistence.Configurations;

public class PaymentMethodConfiguration : IEntityTypeConfiguration<PaymentMethod>
{
    public void Configure(EntityTypeBuilder<PaymentMethod> builder)
    {
        builder.ToTable("payment_method", "transaction_db");

        builder.HasKey(pm => pm.PaymentMethodId);
        builder.Property(pm => pm.PaymentMethodId).HasColumnName("payment_method_id");
        builder.Property(pm => pm.WalletId).HasColumnName("wallet_id");
        builder.Property(pm => pm.Type).HasColumnName("type").HasMaxLength(16).IsRequired();
        builder.Property(pm => pm.Provider).HasColumnName("provider").HasMaxLength(50);
        builder.Property(pm => pm.ExternalToken).HasColumnName("external_token").HasMaxLength(255);
        builder.Property(pm => pm.Last4).HasColumnName("last4").HasMaxLength(4);
        builder.Property(pm => pm.IsDefault).HasColumnName("is_default");
        builder.Property(pm => pm.Status).HasColumnName("status").HasMaxLength(16).IsRequired();
        builder.Property(pm => pm.CreatedAt).HasColumnName("created_at");

        builder.HasIndex(pm => pm.WalletId).HasDatabaseName("idx_payment_method_wallet");

        builder.HasMany(pm => pm.WalletTransactions)
            .WithOne(wt => wt.PaymentMethod)
            .HasForeignKey(wt => wt.PaymentMethodId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
