namespace TransactionService.Domain.Entities;

public class DealStatusHistory
{
    public Guid HistoryId { get; set; }
    public Guid DealId { get; set; }
    public string? PreviousStatus { get; set; }
    public string NewStatus { get; set; } = null!;
    public Guid? ChangedBy { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public string? Reason { get; set; }

    public Deal Deal { get; set; } = null!;
}
