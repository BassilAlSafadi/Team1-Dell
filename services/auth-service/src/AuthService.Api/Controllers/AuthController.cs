using System.Security.Claims;
using AuthService.Api.Contracts;
using AuthService.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthenticationService _authenticationService;

    public AuthController(IAuthenticationService authenticationService)
    {
        _authenticationService = authenticationService;
    }

    [HttpPost("register")]
    public async Task<ActionResult<UserResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var user = await _authenticationService.RegisterAsync(request.Email, request.Password, request.AccountType, ct);
        return Ok(user);
    }

    [HttpPost("login")]
    public async Task<ActionResult<TokenResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var tokens = await _authenticationService.LoginAsync(request.Email, request.Password, ClientIp(), ct);
        return Ok(tokens);
    }

    [HttpPost("google")]
    public async Task<ActionResult<TokenResponse>> GoogleLogin(GoogleLoginRequest request, CancellationToken ct)
    {
        var tokens = await _authenticationService.LoginWithGoogleAsync(request.IdToken, ct);
        return Ok(tokens);
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<TokenResponse>> Refresh(RefreshRequest request, CancellationToken ct)
    {
        var tokens = await _authenticationService.RefreshAsync(request.RefreshToken, ct);
        return Ok(tokens);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(LogoutRequest request, CancellationToken ct)
    {
        await _authenticationService.LogoutAsync(request.RefreshToken, ct);
        return NoContent();
    }

    [Authorize]
    [HttpDelete("me")]
    public async Task<IActionResult> DeleteMe(DeleteAccountRequest request, CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")!);

        await _authenticationService.DeleteAccountAsync(userId, request.Confirmation, ct);
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserResponse>> Me(CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")!);

        var user = await _authenticationService.GetUserAsync(userId, ct);
        return Ok(user);
    }

    /// <summary>
    /// The caller's IP as seen by this service. Only ever used as a throttling key, never for
    /// authorization — it comes from the connection, not from a client-supplied header, because
    /// X-Forwarded-For is trivially spoofable.
    /// </summary>
    private string? ClientIp() => HttpContext.Connection.RemoteIpAddress?.ToString();
}

