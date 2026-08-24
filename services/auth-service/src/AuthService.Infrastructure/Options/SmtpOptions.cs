namespace AuthService.Infrastructure.Options;

public class SmtpOptions
{
    public const string SectionName = "Smtp";

    public string Host { get; set; } = null!;
    public int Port { get; set; } = 587;
    public string Username { get; set; } = null!;
    public string Password { get; set; } = null!;
    public bool UseSsl { get; set; } = true;
    public string FromAddress { get; set; } = null!;
    public string FromName { get; set; } = null!;
}
