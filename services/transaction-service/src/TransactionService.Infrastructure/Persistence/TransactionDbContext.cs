using Microsoft.EntityFrameworkCore;
using TransactionService.Domain.Entities;

namespace TransactionService.Infrastructure.Persistence;

public class TransactionDbContext : DbContext
{
    public TransactionDbContext(DbContextOptions<TransactionDbContext> options) : base(options)
    {
    }

    public DbSet<Wallet> Wallets => Set<Wallet>();
    public DbSet<PaymentMethod> PaymentMethods => Set<PaymentMethod>();
    public DbSet<WalletTransaction> WalletTransactions => Set<WalletTransaction>();
    public DbSet<Offer> Offers => Set<Offer>();
    public DbSet<Deal> Deals => Set<Deal>();
    public DbSet<DealStatusHistory> DealStatusHistories => Set<DealStatusHistory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TransactionDbContext).Assembly);
    }
}
