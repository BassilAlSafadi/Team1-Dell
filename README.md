---
title: Circular Economy Marketplace Backend
emoji: ♻️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 9080
---

# Circular Economy Marketplace — backend

This Space runs the entire backend mesh (gateway + auth-service + transaction-service +
marketplace-service + messaging-service + notification-service + ai-service) as one Docker
image, using `supervisord` to keep all seven processes alive in a single container. The
gateway is the only publicly reachable process (port 9080 → this Space's public URL), exactly
as in `docker-compose.yml` — every other service is reachable only over `localhost` inside the
container.

See [`Dockerfile`](Dockerfile) and [`supervisord.conf`](supervisord.conf) for how the services
are built and wired together, and `run-services.sh` / `gateway/.env.example` for the bare-metal
port convention this reuses (gateway=9080, auth=9081, transaction=9082, marketplace=9083,
messaging=9084, notification=9085; gRPC ports 6001-6005 and ai-service's 6005/7005 are
unchanged).

## Required Space secrets

Topology (ports, peer addresses) is baked into the image. Everything else — real credentials —
must be set under this Space's **Settings → Variables and secrets**. Pull the exact keys from
each service's `.env.example` in this repo:

- `services/auth-service/.env.example` — `ConnectionStrings__AuthDb`, `Jwt__Issuer`,
  `Jwt__Audience`, `Jwt__SigningKey`, `Google__ClientId`, `Smtp__*`, `Redis__ConnectionString`,
  `Internal__ServiceToken`
- `services/transaction-service/.env.example` — `ConnectionStrings__TransactionDb`,
  `Jwt__*` (must match auth-service), `Redis__ConnectionString`, `Internal__ServiceToken`
- `services/marketplace-service/.env.example` — `ConnectionStrings__MarketplaceDb`,
  `Jwt__*`, `Internal__ServiceToken`
- `services/messaging-service/.env.example` — `MONGODB_*`, `JWT_*`, `REDIS_URL`,
  `INTERNAL_SERVICE_TOKEN`, `CORS_ORIGINS`
- `services/notification-service/.env.example` — `MONGODB_*`, `JWT_*`, `REDIS_URL`,
  `INTERNAL_SERVICE_TOKEN`, `CORS_ORIGINS`
- `services/ai-service/.env.example` — `GEMINI_API_KEY`, `MONGODB_*`, `REDIS_URL`,
  `INTERNAL_SERVICE_TOKEN`
- `gateway/.env.example` — `JWT_*`, `CORS_ORIGINS` (set to your Vercel frontend origin),
  `REDIS_URL`, `RATE_LIMIT_*`, `INTERNAL_SERVICE_TOKEN`, `TRUSTED_PROXIES`

`Jwt__SigningKey` / `JWT_SIGNING_KEY` and `Internal__ServiceToken` / `INTERNAL_SERVICE_TOKEN`
must be **identical across every service** — a mismatch surfaces as `Unauthenticated` gRPC
errors or rejected JWTs, not a crash.

Point the frontend's API base URL (on Vercel) at this Space's public URL,
`https://<your-username>-<space-name>.hf.space`.
