# syntax=docker/dockerfile:1

# NOTE: build context must be the REPO ROOT (not services/transaction-service), e.g.
#   docker build -f services/transaction-service/Dockerfile .
# because Grpc.Tools needs the shared /proto contracts at build time, and the relative
# "../../../../proto" path baked into TransactionService.Api.csproj assumes this exact
# directory depth (services/transaction-service/src/TransactionService.Api -> repo root),
# mirrored below.

# ---- Build ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /repo

# Shared gRPC contracts — Grpc.Tools generates C# stubs from these at build time.
COPY proto/ proto/

# Restore first, using only the project files, so dependency restore is cached
# independently of source-code changes.
COPY services/transaction-service/TransactionService.sln services/transaction-service/
COPY services/transaction-service/src/TransactionService.Api/TransactionService.Api.csproj services/transaction-service/src/TransactionService.Api/
COPY services/transaction-service/src/TransactionService.Domain/TransactionService.Domain.csproj services/transaction-service/src/TransactionService.Domain/
COPY services/transaction-service/src/TransactionService.Infrastructure/TransactionService.Infrastructure.csproj services/transaction-service/src/TransactionService.Infrastructure/
RUN dotnet restore services/transaction-service/src/TransactionService.Api/TransactionService.Api.csproj

COPY services/transaction-service/src/ services/transaction-service/src/
RUN dotnet publish services/transaction-service/src/TransactionService.Api/TransactionService.Api.csproj \
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
EXPOSE 6002

ENTRYPOINT ["dotnet", "TransactionService.Api.dll"]
