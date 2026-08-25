using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TransactionService.Domain.Entities;

namespace TransactionService.Infrastructure.Persistence.Configurations;

public class DealStatusHistoryConfiguration : IEntityTypeConfiguration<DealStatusHistory>
{
    public void Configure(EntityTypeBuilder<DealStatusHistory> builder)
    {
        builder.ToTable("deal_status_history", "transaction_db");

        builder.HasKey(h => h.HistoryId);
        builder.Property(h => h.HistoryId).HasColumnName("history_id");
        builder.Property(h => h.DealId).HasColumnName("deal_id");
        builder.Property(h => h.PreviousStatus).HasColumnName("previous_status").HasMaxLength(16);
        builder.Property(h => h.NewStatus).HasColumnName("new_status").HasMaxLength(16).IsRequired();
        builder.Property(h => h.ChangedBy).HasColumnName("changed_by");
        builder.Property(h => h.ChangedAt).HasColumnName("changed_at");
        builder.Property(h => h.Reason).HasColumnName("reason").HasMaxLength(255);

        builder.HasIndex(h => h.DealId).HasDatabaseName("idx_deal_status_history_deal");
    }
}
