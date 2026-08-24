namespace AuthService.Domain.Entities;

public class Role
{
    public short RoleId { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }

    public List<UserRole> UserRoles { get; set; } = new();
    public List<RolePermission> RolePermissions { get; set; } = new();
}
