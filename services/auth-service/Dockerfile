# syntax=docker/dockerfile:1

# NOTE: build context must be the REPO ROOT (not services/auth-service), e.g.
#   docker build -f services/auth-service/Dockerfile .
# because Grpc.Tools needs the shared /proto contracts at build time, and the relative
# "../../../../proto" path baked into AuthService.Api.csproj assumes this exact directory
# depth (services/auth-service/src/AuthService.Api -> repo root), mirrored below.

# ---- Build ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /repo

# Shared gRPC contracts — Grpc.Tools generates C# stubs from these at build time.
COPY proto/ proto/

# Restore first, using only the project files, so dependency restore is cached
# independently of source-code changes.
COPY services/auth-service/AuthService.sln services/auth-service/
COPY services/auth-service/src/AuthService.Api/AuthService.Api.csproj services/auth-service/src/AuthService.Api/
COPY services/auth-service/src/AuthService.Domain/AuthService.Domain.csproj services/auth-service/src/AuthService.Domain/
COPY services/auth-service/src/AuthService.Infrastructure/AuthService.Infrastructure.csproj services/auth-service/src/AuthService.Infrastructure/
RUN dotnet restore services/auth-service/src/AuthService.Api/AuthService.Api.csproj

COPY services/auth-service/src/ services/auth-service/src/
RUN dotnet publish services/auth-service/src/AuthService.Api/AuthService.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# ---- Runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8080 \
    DOTNET_EnableDiagnostics=0

COPY --from=build /app/publish .

# The base image already ships a non-root "app" user (uid 1654).
USER app
EXPOSE 8080
EXPOSE 6001

ENTRYPOINT ["dotnet", "AuthService.Api.dll"]
