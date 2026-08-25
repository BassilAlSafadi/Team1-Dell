namespace TransactionService.Infrastructure.Options;

// Validation-only: this service checks tokens issued by auth-service, it never issues its own.
// Issuer/Audience/SigningKey must match auth-service's Jwt__* values exactly.
public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = null!;
    public string Audience { get; set; } = null!;
    public string SigningKey { get; set; } = null!;
}
