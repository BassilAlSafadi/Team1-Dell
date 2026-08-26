using System.Text;
using AuthService.Api.Grpc;
using AuthService.Api.Middleware;
using AuthService.Api.Services;
using AuthService.Infrastructure.Caching;
using AuthService.Infrastructure.Email;
using AuthService.Infrastructure.Options;
using AuthService.Infrastructure.Persistence;
using AuthService.Infrastructure.Security;
using Grpc.Net.ClientFactory;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

DotNetEnv.Env.TraversePath().Load();

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables();

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<GoogleOptions>(builder.Configuration.GetSection(GoogleOptions.SectionName));
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection(SmtpOptions.SectionName));
builder.Services.Configure<EmailVerificationOptions>(builder.Configuration.GetSection(EmailVerificationOptions.SectionName));
builder.Services.Configure<GrpcOptions>(builder.Configuration.GetSection(GrpcOptions.SectionName));
builder.Services.Configure<RedisOptions>(builder.Configuration.GetSection(RedisOptions.SectionName));

builder.Services.AddDbContext<AuthDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("AuthDb")));

builder.Services.AddScoped<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<ITokenHasher, TokenHasher>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IGoogleIdTokenValidator, GoogleIdTokenValidator>();
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<IAuthenticationService, AuthenticationService>();
builder.Services.AddScoped<IEmailVerificationService, EmailVerificationService>();
builder.Services.AddScoped<IPasswordResetService, PasswordResetService>();
builder.Services.AddScoped<IReviewService, ReviewService>();
builder.Services.AddScoped<INotificationPublisher, GrpcNotificationPublisher>();
builder.Services.AddSingleton<IRedisCache, RedisCache>();

builder.Services.AddGrpc();
builder.Services.AddGrpcHealthChecks()
    .AddCheck("auth-service", () => Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy());

builder.Services.AddGrpcClient<global::Transaction.V1.TransactionService.TransactionServiceClient>((sp, o) =>
    o.Address = new Uri(sp.GetRequiredService<IOptions<GrpcOptions>>().Value.Peers.Transaction ?? "http://localhost:6002"));
builder.Services.AddGrpcClient<global::Messaging.V1.MessagingService.MessagingServiceClient>((sp, o) =>
    o.Address = new Uri(sp.GetRequiredService<IOptions<GrpcOptions>>().Value.Peers.Messaging ?? "http://localhost:6003"));
builder.Services.AddGrpcClient<global::Notification.V1.NotificationService.NotificationServiceClient>((sp, o) =>
    o.Address = new Uri(sp.GetRequiredService<IOptions<GrpcOptions>>().Value.Peers.Notification ?? "http://localhost:6004"));
builder.Services.AddGrpcClient<global::Ai.V1.AiService.AiServiceClient>((sp, o) =>
    o.Address = new Uri(sp.GetRequiredService<IOptions<GrpcOptions>>().Value.Peers.Ai ?? "http://localhost:6005"));

var grpcPort = builder.Configuration.GetValue<int?>("Grpc:Port") ?? 6001;
builder.WebHost.ConfigureKestrel(options =>
{
    // Additive gRPC endpoint alongside the existing ASPNETCORE_URLS-driven HTTP/1.1 REST
    // endpoint — REST is untouched, gRPC needs its own HTTP/2 port.
    options.ListenAnyIP(grpcPort, listenOptions => listenOptions.Protocols = HttpProtocols.Http2);
});

var jwtSection = builder.Configuration.GetSection(JwtOptions.SectionName);
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSection["Issuer"],
            ValidAudience = jwtSection["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSection["SigningKey"]!))
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<ExceptionHandlingMiddleware>();

// No HTTPS endpoint is configured (this repo has no TLS setup yet, same as the plain HTTP/1.1
// REST endpoint), so this stays a harmless no-op — adding the cleartext HTTP/2 gRPC endpoint
// above doesn't change that.
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGrpcService<AuthGrpcService>();
app.MapGrpcHealthChecksService();

app.Run();
