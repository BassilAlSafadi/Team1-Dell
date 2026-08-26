using System.Net;
using AuthService.Infrastructure.Caching;
using AuthService.Infrastructure.Email;
using AuthService.Infrastructure.Options;
using AuthService.Infrastructure.Persistence;
using AuthService.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AuthService.Api.Services;

// Verification codes live in Redis, not Postgres (see REDIS_INTEGRATION_PLAN.md §3) — a
// code's entire lifecycle (single outstanding code, single-use, time-limited) maps directly
// onto a Redis key's SET/GET/DEL/TTL, replacing the old "loop over outstanding rows" +
// manual expiry-timestamp check that a relational table needed. The
// AuthService.Domain.Entities.EmailVerification table/entity is intentionally left in place,
// just unused by this class now — dropping it is a separate, explicitly-deferred migration.
public class EmailVerificationService : IEmailVerificationService
{
    private readonly AuthDbContext _db;
    private readonly ITokenHasher _tokenHasher;
    private readonly IEmailSender _emailSender;
    private readonly IRedisCache _cache;
    private readonly EmailVerificationOptions _options;

    public EmailVerificationService(
        AuthDbContext db,
        ITokenHasher tokenHasher,
        IEmailSender emailSender,
        IRedisCache cache,
        IOptions<EmailVerificationOptions> options)
    {
        _db = db;
        _tokenHasher = tokenHasher;
        _emailSender = emailSender;
        _cache = cache;
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

        var (rawCode, codeHash) = _tokenHasher.GenerateNumericCode(_options.CodeLength);

        // Overwriting the key IS "invalidate any code still outstanding" — no loop over old
        // rows needed, unlike the Postgres-backed version this replaced.
        await _cache.SetStringAsync(
            VerificationKey(user.UserId),
            codeHash,
            TimeSpan.FromMinutes(_options.CodeExpiryMinutes));

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

        var key = VerificationKey(user.UserId);
        var storedHash = await _cache.GetStringAsync(key);
        var codeHash = _tokenHasher.Hash(code);

        if (storedHash is null || storedHash != codeHash)
        {
            throw new AuthDomainException(HttpStatusCode.BadRequest, "Invalid or expired code.");
        }

        // Single-use: delete on redemption instead of the old row's UsedAt flag. Redis's TTL
        // (set in SendCodeAsync) is what used to be ExpiresAt/IsRedeemable's manual check.
        await _cache.DeleteAsync(key);

        var now = DateTimeOffset.UtcNow;
        user.EmailVerified = true;
        if (user.Status == "PENDING")
        {
            user.Status = "ACTIVE";
        }
        user.UpdatedAt = now;

        await _db.SaveChangesAsync(ct);
    }

    private static string VerificationKey(Guid userId) => $"authverify:{userId}";
}
