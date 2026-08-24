namespace AuthService.Domain.Entities;

public class RolePermission
{
    public short RoleId { get; set; }
    public short PermissionId { get; set; }

    public Role Role { get; set; } = null!;
    public Permission Permission { get; set; } = null!;
}
