namespace TransactionService.Domain.Enums;

public enum OfferStatus
{
    Pending,
    Accepted,
    Rejected,
    Withdrawn,
    Expired
}

public static class OfferStatusExtensions
{
    public static string ToDbValue(this OfferStatus status) => status switch
    {
        OfferStatus.Pending => "PENDING",
        OfferStatus.Accepted => "ACCEPTED",
        OfferStatus.Rejected => "REJECTED",
        OfferStatus.Withdrawn => "WITHDRAWN",
        OfferStatus.Expired => "EXPIRED",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null)
    };

    public static OfferStatus FromDbValue(string value) => value switch
    {
        "PENDING" => OfferStatus.Pending,
        "ACCEPTED" => OfferStatus.Accepted,
        "REJECTED" => OfferStatus.Rejected,
        "WITHDRAWN" => OfferStatus.Withdrawn,
        "EXPIRED" => OfferStatus.Expired,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, null)
    };
}
