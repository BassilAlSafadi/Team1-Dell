using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using TransactionService.Api.Grpc;
using TransactionService.Api.Identity;
using TransactionService.Api.Middleware;
using TransactionService.Api.Services;
using TransactionService.Infrastructure.Caching;
using TransactionService.Infrastructure.Options;
using TransactionService.Infrastructure.Persistence;

DotNetEnv.Env.TraversePath().Load();

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables();

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<GrpcOptions>(builder.Configuration.GetSection(GrpcOptions.SectionName));
builder.Services.Configure<RedisOptions>(builder.Configuration.GetSection(RedisOptions.SectionName));
builder.Services.Configure<InternalOptions>(builder.Configuration.GetSection(InternalOptions.SectionName));

builder.Services.AddDbContext<TransactionDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("TransactionDb")));

builder.Services.AddScoped<IWalletService, WalletService>();
builder.Services.AddScoped<IPaymentMethodService, PaymentMethodService>();
builder.Services.AddScoped<IOfferService, OfferService>();
builder.Services.AddScoped<IDealService, DealService>();
builder.Services.AddSingleton<IRedisCache, RedisCache>();

// Resolves auth-service user ids to the marketplace account ids they own, which every
// authorization check in this service depends on. Short timeout: it sits on the request path,
// and a slow answer must fail fast rather than hold the caller open.
builder.Services.AddHttpClient<IMarketplaceAccountResolver, MarketplaceAccountResolver>(client =>
    client.Timeout = TimeSpan.FromSeconds(5));

// gRPC: server for this service's own contract, clients for all 4 peers (full-mesh
// requirement — see plans/pure-hugging-puzzle.md), served on a second Kestrel endpoint
// alongside the existing REST port since gRPC needs HTTP/2.
builder.Services.AddGrpc(options => options.Interceptors.Add<InternalAuthInterceptor>());
builder.Services.AddSingleton<InternalAuthInterceptor>();
builder.Services.AddSingleton<InternalTokenClientInterceptor>();
builder.Services.AddGrpcHealthChecks()
    .AddCheck("transaction-service", () => HealthCheckResult.Healthy());
builder.Services.AddGrpcClient<Auth.V1.AuthService.AuthServiceClient>(o =>
    o.Address = new Uri(builder.Configuration["Grpc:Peers:Auth"] ?? "http://localhost:6001"))
    .AddInterceptor<InternalTokenClientInterceptor>();
builder.Services.AddGrpcClient<Messaging.V1.MessagingService.MessagingServiceClient>(o =>
    o.Address = new Uri(builder.Configuration["Grpc:Peers:Messaging"] ?? "http://localhost:6003"))
    .AddInterceptor<InternalTokenClientInterceptor>();
builder.Services.AddGrpcClient<Notification.V1.NotificationService.NotificationServiceClient>(o =>
    o.Address = new Uri(builder.Configuration["Grpc:Peers:Notification"] ?? "http://localhost:6004"))
    .AddInterceptor<InternalTokenClientInterceptor>();
builder.Services.AddGrpcClient<Ai.V1.AiService.AiServiceClient>(o =>
    o.Address = new Uri(builder.Configuration["Grpc:Peers:Ai"] ?? "http://localhost:6005"))
    .AddInterceptor<InternalTokenClientInterceptor>();
builder.Services.AddScoped<INotificationPublisher, GrpcNotificationPublisher>();

builder.WebHost.ConfigureKestrel(options =>
{
    // Once ConfigureKestrel adds an explicit Listen*/ListenAnyIP endpoint, Kestrel stops
    // honoring ASPNETCORE_URLS/--urls entirely for THIS process (a documented Kestrel
    // behavior) — so the REST HTTP/1.1 endpoint has to be re-added explicitly here too, or
    // only the gRPC port ends up listening at all.
    var grpcPort = builder.Configuration.GetValue("Grpc:Port", 6002);
    options.ListenAnyIP(grpcPort, listenOptions => listenOptions.Protocols = HttpProtocols.Http2);
    options.ListenAnyIP(GetHttpPort(), listenOptions => listenOptions.Protocols = HttpProtocols.Http1AndHttp2);
});

static int GetHttpPort()
{
    var urls = Environment.GetEnvironmentVariable("ASPNETCORE_URLS");
    var firstUrl = urls?.Split(';', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
    if (firstUrl is not null
        && Uri.TryCreate(firstUrl.Replace("+", "localhost", StringComparison.Ordinal), UriKind.Absolute, out var parsed))
    {
        return parsed.Port;
    }
    return 8080;
}

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

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGrpcService<TransactionGrpcService>();
app.MapGrpcHealthChecksService();

app.Run();
