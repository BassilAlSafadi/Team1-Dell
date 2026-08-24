namespace AuthService.Domain.Enums;

public enum UserStatus
{
    Pending,
    Active,
    Suspended,
    Deactivated
}

public static class UserStatusExtensions
{
    public static string ToDbValue(this UserStatus status) => status switch
    {
        UserStatus.Pending => "PENDING",
        UserStatus.Active => "ACTIVE",
        UserStatus.Suspended => "SUSPENDED",
        UserStatus.Deactivated => "DEACTIVATED",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null)
    };

    public static UserStatus FromDbValue(string value) => value switch
    {
        "PENDING" => UserStatus.Pending,
        "ACTIVE" => UserStatus.Active,
        "SUSPENDED" => UserStatus.Suspended,
        "DEACTIVATED" => UserStatus.Deactivated,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, null)
    };
}
