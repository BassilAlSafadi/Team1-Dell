using System.Net;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Email;
using AuthService.Infrastructure.Options;
using AuthService.Infrastructure.Persistence;
using AuthService.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AuthService.Api.Services;

public class EmailVerificationService : IEmailVerificationService
{
    private readonly AuthDbContext _db;
    private readonly ITokenHasher _tokenHasher;
    private readonly IEmailSender _emailSender;
    private readonly EmailVerificationOptions _options;

    public EmailVerificationService(
        AuthDbContext db,
        ITokenHasher tokenHasher,
        IEmailSender emailSender,
        IOptions<EmailVerificationOptions> options)
    {
        _db = db;
        _tokenHasher = tokenHasher;
        _emailSender = emailSender;
        _options = options.Value;
    }

    public async Task SendCodeAsync(string email, CancellationToken ct)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail, ct);
        if (user is null)
        {
            // Don't reveal whether the account exists.
            return;
        }

        var now = DateTimeOffset.UtcNow;

        // Invalidate any codes still outstanding so only the newest one works.
        var outstanding = await _db.EmailVerifications
            .Where(v => v.UserId == user.UserId && v.UsedAt == null)
            .ToListAsync(ct);
        foreach (var v in outstanding)
        {
            v.UsedAt = now;
        }

        var (rawCode, codeHash) = _tokenHasher.GenerateNumericCode(_options.CodeLength);
        _db.EmailVerifications.Add(new EmailVerification
        {
            VerificationId = Guid.NewGuid(),
            UserId = user.UserId,
            CodeHash = codeHash,
            ExpiresAt = now.AddMinutes(_options.CodeExpiryMinutes),
            CreatedAt = now
        });

        await _db.SaveChangesAsync(ct);

        await _emailSender.SendAsync(
            normalizedEmail,
            "Verify your email",
            $"<p>Your verification code is <strong>{rawCode}</strong>. It expires in {_options.CodeExpiryMinutes} minutes.</p>",
            ct);
    }

    public async Task ConfirmCodeAsync(string email, string code, CancellationToken ct)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail, ct)
            ?? throw new AuthDomainException(HttpStatusCode.BadRequest, "Invalid or expired code.");

        var codeHash = _tokenHasher.Hash(code);
        var verification = await _db.EmailVerifications
            .Where(v => v.UserId == user.UserId && v.CodeHash == codeHash)
            .FirstOrDefaultAsync(ct);

        if (verification is null || !verification.IsRedeemable)
        {
            throw new AuthDomainException(HttpStatusCode.BadRequest, "Invalid or expired code.");
        }

        var now = DateTimeOffset.UtcNow;
        verification.UsedAt = now;
        user.EmailVerified = true;
        if (user.Status == "PENDING")
        {
            user.Status = "ACTIVE";
        }
        user.UpdatedAt = now;

        await _db.SaveChangesAsync(ct);
    }
}
