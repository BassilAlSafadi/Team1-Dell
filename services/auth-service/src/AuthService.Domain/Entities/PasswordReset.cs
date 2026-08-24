namespace AuthService.Domain.Entities;

public class PasswordReset
{
    public Guid ResetId { get; set; }
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = null!;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public User User { get; set; } = null!;

    public bool IsRedeemable => UsedAt is null && ExpiresAt > DateTimeOffset.UtcNow;
}
