using System.Net;
using System.Text.Json;
using AuthService.Api.Contracts;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Caching;
using AuthService.Infrastructure.Options;
using AuthService.Infrastructure.Persistence;
using AuthService.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AuthService.Api.Services;

public class AuthenticationService : IAuthenticationService
{
    private const string DefaultRoleName = "USER";
    private static readonly HashSet<string> SelfAssignableRoles = new(StringComparer.OrdinalIgnoreCase) { "VENDOR", "CORPORATE" };
    private static readonly TimeSpan UserCacheTtl = TimeSpan.FromMinutes(1);

    private readonly AuthDbContext _db;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ITokenHasher _tokenHasher;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IGoogleIdTokenValidator _googleValidator;
    private readonly IEmailVerificationService _emailVerificationService;
    private readonly IRedisCache _cache;
    private readonly ILoginThrottle _loginThrottle;
    private readonly JwtOptions _jwtOptions;

    public AuthenticationService(
        AuthDbContext db,
        IPasswordHasher passwordHasher,
        ITokenHasher tokenHasher,
        IJwtTokenService jwtTokenService,
        IGoogleIdTokenValidator googleValidator,
        IEmailVerificationService emailVerificationService,
        IRedisCache cache,
        ILoginThrottle loginThrottle,
        IOptions<JwtOptions> jwtOptions)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _tokenHasher = tokenHasher;
        _jwtTokenService = jwtTokenService;
        _googleValidator = googleValidator;
        _emailVerificationService = emailVerificationService;
        _cache = cache;
        _loginThrottle = loginThrottle;
        _jwtOptions = jwtOptions.Value;
    }

    public async Task<UserResponse> RegisterAsync(string email, string password, string? accountType, CancellationToken ct)
    {
        PasswordPolicy.Validate(password);

        var normalizedEmail = Normalize(email);

        string roleName = DefaultRoleName;
        if (!string.IsNullOrWhiteSpace(accountType))
        {
            if (!SelfAssignableRoles.Contains(accountType))
            {
                throw new AuthDomainException(HttpStatusCode.BadRequest, "accountType must be VENDOR or CORPORATE.");
            }
            roleName = accountType.ToUpperInvariant();
        }

        var exists = await _db.Users.AnyAsync(u => u.Email == normalizedEmail, ct);
        if (exists)
        {
            throw new AuthDomainException(HttpStatusCode.Conflict, "An account with this email already exists.");
        }

        var now = DateTimeOffset.UtcNow;
        var user = new User
        {
            UserId = Guid.NewGuid(),
            Email = normalizedEmail,
            EmailVerified = false,
            PhoneVerified = false,
            Status = "PENDING",
            CreatedAt = now,
            UpdatedAt = now
        };

        var identity = new AuthIdentity
        {
            IdentityId = Guid.NewGuid(),
            UserId = user.UserId,
            Provider = "LOCAL",
            ProviderUserId = normalizedEmail,
            PasswordHash = _passwordHasher.Hash(password),
            CreatedAt = now
        };

        _db.Users.Add(user);
        _db.AuthIdentities.Add(identity);
        await AssignRoleAsync(user.UserId, roleName, ct);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // The AnyAsync check above and this insert are not atomic, so two concurrent
            // registrations for the same address both pass it and the second violates the unique
            // index. That is the same "already exists" condition, not a server fault.
            _db.ChangeTracker.Clear();
            if (await _db.Users.AnyAsync(u => u.Email == normalizedEmail, ct))
            {
                throw new AuthDomainException(HttpStatusCode.Conflict, "An account with this email already exists.");
            }

            throw;
        }

        await _emailVerificationService.SendCodeAsync(normalizedEmail, ct);

        return new UserResponse(user.UserId, user.Email, user.EmailVerified, user.Status, new[] { roleName });
    }

    public async Task<TokenResponse> LoginAsync(string email, string password, string? clientIp, CancellationToken ct)
    {
        var normalizedEmail = Normalize(email);

        await _loginThrottle.EnsureNotLockedAsync(normalizedEmail, clientIp, ct);

        var identity = await _db.AuthIdentities
            .Include(i => i.User)
            .FirstOrDefaultAsync(i => i.Provider == "LOCAL" && i.ProviderUserId == normalizedEmail, ct);

        // Always run one Argon2id verification, even when no account matched. `||` short-circuits,
        // so the previous form skipped hashing entirely for unknown emails and returned in a few
        // milliseconds while a real account took ~100ms — a reliable oracle for enumerating which
        // addresses are registered.
        var passwordMatched = identity?.PasswordHash is { } storedHash
            ? _passwordHasher.Verify(password, storedHash)
            : _passwordHasher.VerifyDummy(password);

        if (identity is null || !passwordMatched)
        {
            await _loginThrottle.RecordFailureAsync(normalizedEmail, clientIp, ct);
            throw new AuthDomainException(HttpStatusCode.Unauthorized, "Invalid email or password.");
        }

        var user = identity.User;

        if (!user.EmailVerified)
        {
            throw new AuthDomainException(HttpStatusCode.Forbidden, "Please verify your email before logging in.");
        }

        EnsureLoginAllowed(user);

        await _loginThrottle.ResetAsync(normalizedEmail, clientIp, ct);

        return await IssueTokensAsync(user, ct);
    }

    public async Task<TokenResponse> LoginWithGoogleAsync(string idToken, CancellationToken ct)
    {
        var googleUser = await _googleValidator.ValidateAsync(idToken);
        if (googleUser is null || !googleUser.EmailVerified)
        {
            throw new AuthDomainException(HttpStatusCode.Unauthorized, "Invalid Google token.");
        }

        var normalizedEmail = Normalize(googleUser.Email);

        var identity = await _db.AuthIdentities
            .Include(i => i.User)
            .FirstOrDefaultAsync(i => i.Provider == "GOOGLE" && i.ProviderUserId == googleUser.Subject, ct);

        User user;
        if (identity is not null)
        {
            user = identity.User;
        }
        else
        {
            // Link to an existing account with the same email, or create a new one.
            user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail, ct) ?? new User();

            var now = DateTimeOffset.UtcNow;
            var isNewUser = user.UserId == Guid.Empty;
            if (isNewUser)
            {
                user.UserId = Guid.NewGuid();
                user.Email = normalizedEmail;
                user.CreatedAt = now;
                _db.Users.Add(user);
            }

            user.EmailVerified = true;
            user.UpdatedAt = now;

            // Only a brand-new account gets ACTIVE here. Setting it unconditionally meant that
            // linking Google to an existing SUSPENDED/DEACTIVATED account silently reactivated
            // it — a banned user could lift their own ban by signing in with Google.
            if (isNewUser)
            {
                user.Status = "ACTIVE";
            }

            _db.AuthIdentities.Add(new AuthIdentity
            {
                IdentityId = Guid.NewGuid(),
                UserId = user.UserId,
                Provider = "GOOGLE",
                ProviderUserId = googleUser.Subject,
                PasswordHash = null,
                CreatedAt = now
            });

            if (isNewUser)
            {
                await AssignDefaultRoleAsync(user.UserId, ct);
            }

            await _db.SaveChangesAsync(ct);
            await InvalidateUserCacheAsync(user.UserId);
        }

        // Applies to both branches above: an existing Google identity used to go straight to
        // token issuance with no status check at all, so a suspended user just clicked
        // "Sign in with Google" to get back in.
        EnsureLoginAllowed(user);

        return await IssueTokensAsync(user, ct);
    }

    /// <summary>
    /// The account-state gate every login path must pass, regardless of provider.
    /// </summary>
    private static void EnsureLoginAllowed(User user)
    {
        if (user.Status is "SUSPENDED" or "DEACTIVATED")
        {
            throw new AuthDomainException(HttpStatusCode.Forbidden, "This account is not active.");
        }
    }

    public async Task<TokenResponse> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        var hash = _tokenHasher.Hash(refreshToken);

        var session = await _db.Sessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == hash, ct);

        if (session is null)
        {
            throw new AuthDomainException(HttpStatusCode.Unauthorized, "Invalid or expired refresh token.");
        }

        // Reuse detection. Refresh tokens rotate on every use, so a token that is already
        // revoked has been presented twice — either by an attacker replaying a stolen token, or
        // by the legitimate user after an attacker rotated it. Either way one of the two holders
        // is hostile and we cannot tell which, so every session for this user is revoked and
        // both are forced to re-authenticate. Previously this just returned 401 and left the
        // attacker's freshly rotated token working.
        if (session.RevokedAt is not null)
        {
            await RevokeAllSessionsAsync(session.UserId, ct);

            throw new AuthDomainException(
                HttpStatusCode.Unauthorized,
                "This session has been ended for security reasons. Please sign in again.");
        }

        if (!session.IsActive)
        {
            throw new AuthDomainException(HttpStatusCode.Unauthorized, "Invalid or expired refresh token.");
        }

        EnsureLoginAllowed(session.User);

        session.RevokedAt = DateTimeOffset.UtcNow;

        return await IssueTokensAsync(session.User, ct);
    }

    private async Task RevokeAllSessionsAsync(Guid userId, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var sessions = await _db.Sessions
            .Where(s => s.UserId == userId && s.RevokedAt == null)
            .ToListAsync(ct);

        foreach (var active in sessions)
        {
            active.RevokedAt = now;
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task LogoutAsync(string refreshToken, CancellationToken ct)
    {
        var hash = _tokenHasher.Hash(refreshToken);

        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.RefreshTokenHash == hash, ct);
        if (session is not null && session.RevokedAt is null)
        {
            session.RevokedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(ct);
        }
    }

    public async Task DeleteAccountAsync(Guid userId, string confirmation, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new AuthDomainException(HttpStatusCode.NotFound, "User not found.");

        // The user retyped this by hand (paste is blocked in the UI). Re-check it here so the
        // endpoint can't be driven to delete an account without that deliberate confirmation.
        if (!string.Equals(confirmation?.Trim(), user.Email, StringComparison.OrdinalIgnoreCase))
        {
            throw new AuthDomainException(
                HttpStatusCode.BadRequest,
                "Confirmation text does not match your account email.");
        }

        // No ON DELETE CASCADE is defined on the child tables, and email_verification /
        // password_reset aren't even mapped as relationships — so every dependent row is
        // removed explicitly, all-or-nothing inside one transaction.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        await _db.Reviews.Where(r => r.VendorId == userId || r.ReviewerId == userId).ExecuteDeleteAsync(ct);
        await _db.EmailVerifications.Where(e => e.UserId == userId).ExecuteDeleteAsync(ct);
        await _db.PasswordResets.Where(p => p.UserId == userId).ExecuteDeleteAsync(ct);
        await _db.Sessions.Where(s => s.UserId == userId).ExecuteDeleteAsync(ct);
        await _db.UserRoles.Where(ur => ur.UserId == userId).ExecuteDeleteAsync(ct);
        await _db.AuthIdentities.Where(i => i.UserId == userId).ExecuteDeleteAsync(ct);
        await _db.Users.Where(u => u.UserId == userId).ExecuteDeleteAsync(ct);

        await tx.CommitAsync(ct);

        await InvalidateUserCacheAsync(userId);
    }

    public async Task<UserResponse> GetUserAsync(Guid userId, CancellationToken ct)
    {
        // Pure TTL-expiry cache-aside (see REDIS_INTEGRATION_PLAN.md §2) — never caches the
        // password hash or any Users column beyond what UserResponse already exposes.
        var cacheKey = UserCacheKey(userId);
        var cached = await _cache.GetStringAsync(cacheKey);
        if (cached is not null)
        {
            var cachedUser = JsonSerializer.Deserialize<UserResponse>(cached);
            if (cachedUser is not null)
            {
                return cachedUser;
            }
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new AuthDomainException(HttpStatusCode.NotFound, "User not found.");

        var roles = await GetRoleNamesAsync(userId, ct);
        var response = new UserResponse(user.UserId, user.Email, user.EmailVerified, user.Status, roles);

        await _cache.SetStringAsync(cacheKey, JsonSerializer.Serialize(response), UserCacheTtl);

        return response;
    }

    private async Task<TokenResponse> IssueTokensAsync(User user, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        user.LastLoginAt = now;
        user.UpdatedAt = now;

        var roles = await GetRoleNamesAsync(user.UserId, ct);
        var accessToken = _jwtTokenService.IssueAccessToken(user.UserId, user.Email, roles);
        var accessTokenExpiresAt = now.AddMinutes(_jwtOptions.AccessTokenMinutes);

        var (rawRefreshToken, refreshTokenHash) = _tokenHasher.GenerateToken();
        _db.Sessions.Add(new Session
        {
            SessionId = Guid.NewGuid(),
            UserId = user.UserId,
            RefreshTokenHash = refreshTokenHash,
            ExpiresAt = now.AddDays(_jwtOptions.RefreshTokenDays),
            CreatedAt = now
        });

        await _db.SaveChangesAsync(ct);

        return new TokenResponse(accessToken, rawRefreshToken, accessTokenExpiresAt);
    }

    private async Task AssignDefaultRoleAsync(Guid userId, CancellationToken ct) =>
        await AssignRoleAsync(userId, DefaultRoleName, ct);

    private async Task AssignRoleAsync(Guid userId, string roleName, CancellationToken ct)
    {
        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Name == roleName, ct)
            ?? throw new AuthDomainException(
                HttpStatusCode.InternalServerError,
                $"Role '{roleName}' is not provisioned; cannot complete registration.");

        _db.UserRoles.Add(new UserRole
        {
            UserId = userId,
            RoleId = role.RoleId,
            AssignedAt = DateTimeOffset.UtcNow
        });
    }

    private async Task<IReadOnlyList<string>> GetRoleNamesAsync(Guid userId, CancellationToken ct)
    {
        return await _db.UserRoles
            .Where(ur => ur.UserId == userId)
            .Select(ur => ur.Role.Name)
            .ToListAsync(ct);
    }

    /// <summary>
    /// Drops the cached UserResponse for a user. Must be called after anything that changes the
    /// fields it holds (status, email verification, roles) — otherwise a suspension or role
    /// change stays invisible to /api/auth/me and the gRPC GetUser for up to UserCacheTtl.
    /// </summary>
    public async Task InvalidateUserCacheAsync(Guid userId) =>
        await _cache.DeleteAsync(UserCacheKey(userId));

    private static string UserCacheKey(Guid userId) => $"cache:auth:user:{userId}";

    private static string Normalize(string email) => email.Trim().ToLowerInvariant();
}
