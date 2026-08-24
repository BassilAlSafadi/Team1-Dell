using AuthService.Api.Contracts;
using AuthService.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.Api.Controllers;

[ApiController]
[Route("api/auth/password-reset")]
public class PasswordResetController : ControllerBase
{
    private readonly IPasswordResetService _passwordResetService;

    public PasswordResetController(IPasswordResetService passwordResetService)
    {
        _passwordResetService = passwordResetService;
    }

    [HttpPost("request")]
    public async Task<ActionResult<MessageResponse>> RequestReset(RequestPasswordResetRequest request, CancellationToken ct)
    {
        await _passwordResetService.RequestResetAsync(request.Email, ct);
        return Ok(new MessageResponse("If an account exists for this email, a reset code has been sent."));
    }

    [HttpPost("confirm")]
    public async Task<ActionResult<MessageResponse>> Confirm(ConfirmPasswordResetRequest request, CancellationToken ct)
    {
        await _passwordResetService.ConfirmResetAsync(request.Email, request.Token, request.NewPassword, ct);
        return Ok(new MessageResponse("Password has been reset."));
    }
}
