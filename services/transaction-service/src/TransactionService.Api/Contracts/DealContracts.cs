using System.ComponentModel.DataAnnotations;

namespace TransactionService.Api.Contracts;

public record TransitionDealRequest(
    [Required, StringLength(32)] string NewStatus,
    [StringLength(500)] string? Reason);

public record DealResponse(
    Guid DealId,
    Guid OfferId,
    Guid ListingId,
    Guid BuyerId,
    Guid SellerId,
    decimal AgreedAmount,
    string Currency,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt,
    DateTimeOffset? CancelledAt);

public record DealStatusHistoryResponse(
    Guid HistoryId,
    Guid DealId,
    string? PreviousStatus,
    string NewStatus,
    Guid? ChangedBy,
    DateTimeOffset ChangedAt,
    string? Reason);
