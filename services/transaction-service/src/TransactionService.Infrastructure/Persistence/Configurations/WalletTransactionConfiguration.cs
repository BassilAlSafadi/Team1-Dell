using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TransactionService.Domain.Entities;

namespace TransactionService.Infrastructure.Persistence.Configurations;

public class WalletTransactionConfiguration : IEntityTypeConfiguration<WalletTransaction>
{
    public void Configure(EntityTypeBuilder<WalletTransaction> builder)
    {
        builder.ToTable("wallet_transaction", "transaction_db");

        builder.HasKey(wt => wt.WalletTransactionId);
        builder.Property(wt => wt.WalletTransactionId).HasColumnName("wallet_transaction_id");
        builder.Property(wt => wt.WalletId).HasColumnName("wallet_id");
        builder.Property(wt => wt.PaymentMethodId).HasColumnName("payment_method_id");
        builder.Property(wt => wt.DealId).HasColumnName("deal_id");
        builder.Property(wt => wt.Type).HasColumnName("type").HasMaxLength(16).IsRequired();
        builder.Property(wt => wt.Amount).HasColumnName("amount").HasColumnType("numeric(14,2)");
        builder.Property(wt => wt.Currency).HasColumnName("currency").HasColumnType("char(3)").HasMaxLength(3).IsRequired();
        builder.Property(wt => wt.BalanceAfter).HasColumnName("balance_after").HasColumnType("numeric(14,2)");
        builder.Property(wt => wt.ExternalReference).HasColumnName("external_reference").HasMaxLength(255);
        builder.Property(wt => wt.Status).HasColumnName("status").HasMaxLength(16).IsRequired();
        builder.Property(wt => wt.CreatedAt).HasColumnName("created_at");
        builder.Property(wt => wt.CompletedAt).HasColumnName("completed_at");

        builder.HasIndex(wt => wt.WalletId).HasDatabaseName("idx_wallet_transaction_wallet");
        builder.HasIndex(wt => wt.PaymentMethodId).HasDatabaseName("idx_wallet_transaction_payment_method");
        builder.HasIndex(wt => wt.Status).HasDatabaseName("idx_wallet_transaction_status");
        builder.HasIndex(wt => wt.DealId).IsUnique().HasDatabaseName("uq_wallet_transaction_deal_id");
    }
}
