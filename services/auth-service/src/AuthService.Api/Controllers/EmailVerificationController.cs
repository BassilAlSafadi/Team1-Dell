using AuthService.Api.Contracts;
using AuthService.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.Api.Controllers;

[ApiController]
[Route("api/auth/email-verification")]
public class EmailVerificationController : ControllerBase
{
    private readonly IEmailVerificationService _emailVerificationService;

    public EmailVerificationController(IEmailVerificationService emailVerificationService)
    {
        _emailVerificationService = emailVerificationService;
    }

    [HttpPost("send")]
    public async Task<ActionResult<MessageResponse>> Send(SendVerificationCodeRequest request, CancellationToken ct)
    {
        await _emailVerificationService.SendCodeAsync(request.Email, ct);
        return Ok(new MessageResponse("If an account exists for this email, a verification code has been sent."));
    }

    [HttpPost("confirm")]
    public async Task<ActionResult<MessageResponse>> Confirm(ConfirmVerificationCodeRequest request, CancellationToken ct)
    {
        await _emailVerificationService.ConfirmCodeAsync(request.Email, request.Code, ct);
        return Ok(new MessageResponse("Email verified."));
    }
}
