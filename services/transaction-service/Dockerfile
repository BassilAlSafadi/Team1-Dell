# syntax=docker/dockerfile:1

# ---- Build ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Restore first, using only the project files, so dependency restore is cached
# independently of source-code changes.
COPY TransactionService.sln ./
COPY src/TransactionService.Api/TransactionService.Api.csproj src/TransactionService.Api/
COPY src/TransactionService.Domain/TransactionService.Domain.csproj src/TransactionService.Domain/
COPY src/TransactionService.Infrastructure/TransactionService.Infrastructure.csproj src/TransactionService.Infrastructure/
RUN dotnet restore src/TransactionService.Api/TransactionService.Api.csproj

COPY src/ src/
RUN dotnet publish src/TransactionService.Api/TransactionService.Api.csproj \
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

ENTRYPOINT ["dotnet", "TransactionService.Api.dll"]
