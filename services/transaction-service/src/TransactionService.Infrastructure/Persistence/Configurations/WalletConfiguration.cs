using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TransactionService.Domain.Entities;

namespace TransactionService.Infrastructure.Persistence.Configurations;

public class WalletConfiguration : IEntityTypeConfiguration<Wallet>
{
    public void Configure(EntityTypeBuilder<Wallet> builder)
    {
        builder.ToTable("wallet", "transaction_db");

        builder.HasKey(w => w.WalletId);
        builder.Property(w => w.WalletId).HasColumnName("wallet_id");
        builder.Property(w => w.UserId).HasColumnName("user_id");
        builder.Property(w => w.Balance).HasColumnName("balance").HasColumnType("numeric(14,2)");
        builder.Property(w => w.Currency).HasColumnName("currency").HasColumnType("char(3)").HasMaxLength(3).IsRequired();
        builder.Property(w => w.Status).HasColumnName("status").HasMaxLength(16).IsRequired();
        builder.Property(w => w.CreatedAt).HasColumnName("created_at");
        builder.Property(w => w.UpdatedAt).HasColumnName("updated_at");

        builder.HasIndex(w => w.UserId).IsUnique().HasDatabaseName("uq_wallet_user_id");

        builder.HasMany(w => w.PaymentMethods)
            .WithOne(pm => pm.Wallet)
            .HasForeignKey(pm => pm.WalletId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(w => w.WalletTransactions)
            .WithOne(wt => wt.Wallet)
            .HasForeignKey(wt => wt.WalletId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
