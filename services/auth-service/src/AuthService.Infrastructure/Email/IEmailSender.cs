namespace AuthService.Infrastructure.Email;

public interface IEmailSender
{
    Task SendAsync(string toAddress, string subject, string bodyHtml, CancellationToken cancellationToken = default);
}
