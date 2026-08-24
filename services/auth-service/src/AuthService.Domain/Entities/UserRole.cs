namespace AuthService.Domain.Entities;

public class UserRole
{
    public Guid UserId { get; set; }
    public short RoleId { get; set; }
    public DateTimeOffset AssignedAt { get; set; }

    public User User { get; set; } = null!;
    public Role Role { get; set; } = null!;
}
