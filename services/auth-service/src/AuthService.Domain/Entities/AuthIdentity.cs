namespace AuthService.Domain.Entities;

public class AuthIdentity
{
    public Guid IdentityId { get; set; }
    public Guid UserId { get; set; }
    public string Provider { get; set; } = null!;
    public string ProviderUserId { get; set; } = null!;
    public string? PasswordHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public User User { get; set; } = null!;
}
