# syntax=docker/dockerfile:1
#
# Hugging Face Space image: bundles the ENTIRE backend mesh (gateway + all 6 services)
# into ONE container, since a Docker Space runs a single container. Each service keeps the
# exact bare-metal port assignment already established in ../run-services.sh /
# gateway/.env.example (gateway=9080, auth=9081, transaction=9082, marketplace=9083,
# messaging=9084, notification=9085, ai-service gRPC=6005/mesh-http=7005 — those two were
# already distinct), so the topology below just mirrors what run-services.sh does with real
# OS processes, using supervisord instead of shell job control to keep them alive in one
# container. Build context MUST be the repo root (same requirement each per-service
# Dockerfile already has for /proto):
#   docker build -f Dockerfile .

# ---- gateway (Go) ----
FROM golang:1.25-alpine AS gateway-build
WORKDIR /src
COPY gateway/go.mod gateway/go.sum ./
RUN go mod download
COPY gateway/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/gateway ./cmd/server

# ---- notification-service (Go) ----
FROM golang:1.25-alpine AS notification-build
WORKDIR /src
COPY services/notification-service/go.mod services/notification-service/go.sum ./
RUN go mod download
COPY services/notification-service/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/notification-service ./cmd/server

# ---- auth-service (.NET) ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS auth-build
WORKDIR /repo
COPY proto/ proto/
COPY services/auth-service/AuthService.sln services/auth-service/
COPY services/auth-service/src/AuthService.Api/AuthService.Api.csproj services/auth-service/src/AuthService.Api/
COPY services/auth-service/src/AuthService.Domain/AuthService.Domain.csproj services/auth-service/src/AuthService.Domain/
COPY services/auth-service/src/AuthService.Infrastructure/AuthService.Infrastructure.csproj services/auth-service/src/AuthService.Infrastructure/
RUN dotnet restore services/auth-service/src/AuthService.Api/AuthService.Api.csproj
COPY services/auth-service/src/ services/auth-service/src/
RUN dotnet publish services/auth-service/src/AuthService.Api/AuthService.Api.csproj -c Release -o /app/auth --no-restore

# ---- transaction-service (.NET) ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS transaction-build
WORKDIR /repo
COPY proto/ proto/
COPY services/transaction-service/TransactionService.sln services/transaction-service/
COPY services/transaction-service/src/TransactionService.Api/TransactionService.Api.csproj services/transaction-service/src/TransactionService.Api/
COPY services/transaction-service/src/TransactionService.Domain/TransactionService.Domain.csproj services/transaction-service/src/TransactionService.Domain/
COPY services/transaction-service/src/TransactionService.Infrastructure/TransactionService.Infrastructure.csproj services/transaction-service/src/TransactionService.Infrastructure/
RUN dotnet restore services/transaction-service/src/TransactionService.Api/TransactionService.Api.csproj
COPY services/transaction-service/src/ services/transaction-service/src/
RUN dotnet publish services/transaction-service/src/TransactionService.Api/TransactionService.Api.csproj -c Release -o /app/transaction --no-restore

# ---- marketplace-service (.NET) ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS marketplace-build
WORKDIR /src
COPY services/marketplace-service/MarketplaceService.sln .
COPY services/marketplace-service/src/MarketplaceService.Api/MarketplaceService.Api.csproj src/MarketplaceService.Api/
COPY services/marketplace-service/src/MarketplaceService.Domain/MarketplaceService.Domain.csproj src/MarketplaceService.Domain/
COPY services/marketplace-service/src/MarketplaceService.Infrastructure/MarketplaceService.Infrastructure.csproj src/MarketplaceService.Infrastructure/
RUN dotnet restore src/MarketplaceService.Api/MarketplaceService.Api.csproj
COPY services/marketplace-service/src/ src/
RUN dotnet publish src/MarketplaceService.Api/MarketplaceService.Api.csproj -c Release -o /app/marketplace --no-restore

# ---- messaging-service (Node) ----
FROM node:20-alpine AS messaging-deps
WORKDIR /app
COPY services/messaging-service/package.json services/messaging-service/package-lock.json* ./
RUN npm install --omit=dev

# ---- runtime: Debian base carrying .NET, Node, Python + supervisord all at once ----
FROM debian:bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive

# .NET 9 ASP.NET Core runtime (Microsoft apt feed), Node 20 (NodeSource feed), Python 3
# (Debian's own), and supervisor to keep all seven processes alive in one container.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg build-essential libicu72 \
    && curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && bash /tmp/dotnet-install.sh --channel 9.0 --runtime aspnetcore --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet \
    && rm /tmp/dotnet-install.sh \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv supervisor \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin app

# --- gateway ---
COPY --from=gateway-build /out/gateway /app/gateway/gateway

# --- notification-service ---
COPY --from=notification-build /out/notification-service /app/notification-service/notification-service

# --- auth-service ---
COPY --from=auth-build /app/auth /app/auth-service

# --- transaction-service ---
COPY --from=transaction-build /app/transaction /app/transaction-service

# --- marketplace-service ---
COPY --from=marketplace-build /app/marketplace /app/marketplace-service

# --- messaging-service ---
COPY --from=messaging-deps /app/node_modules /app/messaging-service/node_modules
COPY services/messaging-service/package.json /app/messaging-service/
COPY services/messaging-service/src /app/messaging-service/src
COPY proto /app/messaging-service/proto

# --- ai-service (Python venv, isolated from the system Python) ---
RUN python3 -m venv /app/ai-service/.venv
COPY services/ai-service/requirements.txt /app/ai-service/requirements.txt
RUN /app/ai-service/.venv/bin/pip install --no-cache-dir -r /app/ai-service/requirements.txt
COPY services/ai-service/chatbot/ /app/ai-service/chatbot/
COPY services/ai-service/db/ /app/ai-service/db/
COPY services/ai-service/grpcgen/ /app/ai-service/grpcgen/
COPY services/ai-service/waste_classifier.py services/ai-service/waste_recommendations.py services/ai-service/vendor_search.py services/ai-service/vendors.json /app/ai-service/
COPY services/ai-service/identity.py services/ai-service/grpc_server.py services/ai-service/grpc_clients.py services/ai-service/mesh_status.py /app/ai-service/

RUN mkdir -p /app/ai-service/data && chown -R app:app /app

COPY supervisord.conf /etc/supervisor/conf.d/services.conf

# Structural/topology env — mirrors run-services.sh's port assignments exactly. All real
# secrets (connection strings, JWT signing key, Redis URL, Internal__ServiceToken, Gemini/
# Google/SMTP/Mongo credentials, per each service's .env.example) must be set as Space
# Secrets/Variables in the Hugging Face Space settings, not baked in here.
ENV ASPNETCORE_ENVIRONMENT=Production

USER app
WORKDIR /app

# HF Spaces expects one published port — the gateway is the mesh's sole public entry point,
# same as in docker-compose.yml. Set app_port to match in the Space README frontmatter.
EXPOSE 9080

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/services.conf"]
