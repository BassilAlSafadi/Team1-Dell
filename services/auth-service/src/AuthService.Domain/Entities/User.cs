namespace AuthService.Domain.Entities;

public class User
{
    public Guid UserId { get; set; }
    public string Email { get; set; } = null!;
    public bool EmailVerified { get; set; }
    public string? PhoneNumber { get; set; }
    public bool PhoneVerified { get; set; }
    public string Status { get; set; } = "PENDING";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }

    public List<AuthIdentity> AuthIdentities { get; set; } = new();
    public List<Session> Sessions { get; set; } = new();
    public List<UserRole> UserRoles { get; set; } = new();
}
