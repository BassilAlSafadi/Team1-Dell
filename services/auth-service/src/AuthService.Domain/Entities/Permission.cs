namespace AuthService.Domain.Entities;

public class Permission
{
    public short PermissionId { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }

    public List<RolePermission> RolePermissions { get; set; } = new();
}
