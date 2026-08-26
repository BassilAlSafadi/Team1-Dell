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
    private readonly JwtOptions _jwtOptions;

    public AuthenticationService(
        AuthDbContext db,
        IPasswordHasher passwordHasher,
        ITokenHasher tokenHasher,
        IJwtTokenService jwtTokenService,
        IGoogleIdTokenValidator googleValidator,
        IEmailVerificationService emailVerificationService,
        IRedisCache cache,
        IOptions<JwtOptions> jwtOptions)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _tokenHasher = tokenHasher;
        _jwtTokenService = jwtTokenService;
        _googleValidator = googleValidator;
        _emailVerificationService = emailVerificationService;
        _cache = cache;
        _jwtOptions = jwtOptions.Value;
    }

    public async Task<UserResponse> RegisterAsync(string email, string password, string? accountType, CancellationToken ct)
    {
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

        await _db.SaveChangesAsync(ct);

        await _emailVerificationService.SendCodeAsync(normalizedEmail, ct);

        return new UserResponse(user.UserId, user.Email, user.EmailVerified, user.Status, new[] { roleName });
    }

    public async Task<TokenResponse> LoginAsync(string email, string password, CancellationToken ct)
    {
        var normalizedEmail = Normalize(email);

        var identity = await _db.AuthIdentities
            .Include(i => i.User)
            .FirstOrDefaultAsync(i => i.Provider == "LOCAL" && i.ProviderUserId == normalizedEmail, ct);

        if (identity is null || identity.PasswordHash is null || !_passwordHasher.Verify(password, identity.PasswordHash))
        {
            throw new AuthDomainException(HttpStatusCode.Unauthorized, "Invalid email or password.");
        }

        var user = identity.User;

        if (!user.EmailVerified)
        {
            throw new AuthDomainException(HttpStatusCode.Forbidden, "Please verify your email before logging in.");
        }

        if (user.Status is "SUSPENDED" or "DEACTIVATED")
        {
            throw new AuthDomainException(HttpStatusCode.Forbidden, "This account is not active.");
        }

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
            user.Status = "ACTIVE";
            user.UpdatedAt = now;

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
        }

        return await IssueTokensAsync(user, ct);
    }

    public async Task<TokenResponse> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        var hash = _tokenHasher.Hash(refreshToken);

        var session = await _db.Sessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == hash, ct);

        if (session is null || !session.IsActive)
        {
            throw new AuthDomainException(HttpStatusCode.Unauthorized, "Invalid or expired refresh token.");
        }

        session.RevokedAt = DateTimeOffset.UtcNow;

        return await IssueTokensAsync(session.User, ct);
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

    public async Task<UserResponse> GetUserAsync(Guid userId, CancellationToken ct)
    {
        // Pure TTL-expiry cache-aside (see REDIS_INTEGRATION_PLAN.md §2) — never caches the
        // password hash or any Users column beyond what UserResponse already exposes.
        var cacheKey = $"cache:auth:user:{userId}";
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
        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Name == roleName, ct);
        if (role is null)
        {
            return;
        }

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

    private static string Normalize(string email) => email.Trim().ToLowerInvariant();
}
