namespace AuthService.Infrastructure.Options;

public class EmailVerificationOptions
{
    public const string SectionName = "EmailVerification";

    public int CodeLength { get; set; } = 6;
    public int CodeExpiryMinutes { get; set; } = 15;
}
