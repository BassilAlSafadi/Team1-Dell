# syntax=docker/dockerfile:1

# NOTE: build context is this service's own directory (services/marketplace-service), e.g.
#   docker build -f services/marketplace-service/Dockerfile services/marketplace-service
# This service is REST-only with no shared /proto dependency, so unlike transaction-service's
# Dockerfile it does not need the repo root as its build context.

# ---- Build ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Restore first, using only the project files, so dependency restore is cached
# independently of source-code changes.
COPY MarketplaceService.sln .
COPY src/MarketplaceService.Api/MarketplaceService.Api.csproj src/MarketplaceService.Api/
COPY src/MarketplaceService.Domain/MarketplaceService.Domain.csproj src/MarketplaceService.Domain/
COPY src/MarketplaceService.Infrastructure/MarketplaceService.Infrastructure.csproj src/MarketplaceService.Infrastructure/
RUN dotnet restore src/MarketplaceService.Api/MarketplaceService.Api.csproj

COPY src/ src/
RUN dotnet publish src/MarketplaceService.Api/MarketplaceService.Api.csproj \
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

ENTRYPOINT ["dotnet", "MarketplaceService.Api.dll"]
