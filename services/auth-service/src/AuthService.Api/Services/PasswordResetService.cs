using System.Net;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Email;
using AuthService.Infrastructure.Persistence;
using AuthService.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Api.Services;

public class PasswordResetService : IPasswordResetService
{
    private static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(1);

    private readonly AuthDbContext _db;
    private readonly ITokenHasher _tokenHasher;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IEmailSender _emailSender;

    public PasswordResetService(
        AuthDbContext db,
        ITokenHasher tokenHasher,
        IPasswordHasher passwordHasher,
        IEmailSender emailSender)
    {
        _db = db;
        _tokenHasher = tokenHasher;
        _passwordHasher = passwordHasher;
        _emailSender = emailSender;
    }

    public async Task RequestResetAsync(string email, CancellationToken ct)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail, ct);
        if (user is null)
        {
            // Don't reveal whether the account exists.
            return;
        }

        var hasLocalIdentity = await _db.AuthIdentities
            .AnyAsync(i => i.UserId == user.UserId && i.Provider == "LOCAL", ct);
        if (!hasLocalIdentity)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var (rawToken, tokenHash) = _tokenHasher.GenerateToken();

        _db.PasswordResets.Add(new PasswordReset
        {
            ResetId = Guid.NewGuid(),
            UserId = user.UserId,
            TokenHash = tokenHash,
            ExpiresAt = now.Add(TokenLifetime),
            CreatedAt = now
        });

        await _db.SaveChangesAsync(ct);

        await _emailSender.SendAsync(
            normalizedEmail,
            "Reset your password",
            $"<p>Your password reset code is <strong>{rawToken}</strong>. It expires in one hour.</p>",
            ct);
    }

    public async Task ConfirmResetAsync(string email, string token, string newPassword, CancellationToken ct)
    {
        PasswordPolicy.Validate(newPassword);

        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail, ct)
            ?? throw new AuthDomainException(HttpStatusCode.BadRequest, "Invalid or expired token.");

        var tokenHash = _tokenHasher.Hash(token);
        var reset = await _db.PasswordResets
            .Where(r => r.UserId == user.UserId && r.TokenHash == tokenHash)
            .FirstOrDefaultAsync(ct);

        if (reset is null || !reset.IsRedeemable)
        {
            throw new AuthDomainException(HttpStatusCode.BadRequest, "Invalid or expired token.");
        }

        var identity = await _db.AuthIdentities
            .FirstOrDefaultAsync(i => i.UserId == user.UserId && i.Provider == "LOCAL", ct)
            ?? throw new AuthDomainException(HttpStatusCode.BadRequest, "This account has no password to reset.");

        var now = DateTimeOffset.UtcNow;
        reset.UsedAt = now;
        identity.PasswordHash = _passwordHasher.Hash(newPassword);
        user.UpdatedAt = now;

        // Resetting the password invalidates every existing session.
        var sessions = await _db.Sessions
            .Where(s => s.UserId == user.UserId && s.RevokedAt == null)
            .ToListAsync(ct);
        foreach (var session in sessions)
        {
            session.RevokedAt = now;
        }

        await _db.SaveChangesAsync(ct);
    }
}
