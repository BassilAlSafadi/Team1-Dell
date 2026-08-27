# Cloudflare Tunnel deployment

Each of the six services gets its own Cloudflare Tunnel and its own route (hostname), so every
service is independently deployable and reachable through Cloudflare's edge instead of an open
inbound port. **No business logic, payload, or gRPC contract changes** — every service keeps
running exactly as it does today (same ports, same `.proto` contracts, same handlers). Only two
things change:

1. Each service's origin (gRPC + REST ports) is fronted by a `cloudflared` process instead of
   being reachable directly.
2. Outbound peer-to-peer gRPC calls, which today assume `localhost`/a shared docker-compose
   network, get pointed at the peer's new Cloudflare Tunnel hostname instead — which means they
   now cross the public internet via Cloudflare's edge and must use TLS rather than plaintext.

## Why gRPC didn't need to change

Cloudflare Tunnel can proxy raw gRPC (HTTP/2) directly: an ingress rule with
`service: h2c://localhost:<port>` tells `cloudflared` to speak cleartext HTTP/2 to the local
origin — exactly what every service's gRPC server already does — while Cloudflare terminates
TLS at the edge for the public hostname. So the *server* side of every gRPC service is
unchanged. Only the *client* side (dialing a peer) needed a plaintext-vs-TLS switch:

| Service | Client library | Change made |
|---|---|---|
| auth-service (C#) | `Grpc.Net.Client` / `AddGrpcClient` | **None.** Picks plaintext vs TLS from the peer URI's scheme automatically — just point `Grpc__Peers__*` at `https://...` in production. |
| transaction-service (C#) | same | **None**, same reason. Also applies to `Internal__MarketplaceRestAddr` (plain `HttpClient`). |
| marketplace-service (C#) | — | No gRPC peers; REST-only, same scheme-driven `HttpClient` behavior. |
| messaging-service (Node) | `@grpc/grpc-js` | Added `GRPC_USE_TLS` env flag; `src/grpc/clients.js` now picks `grpc.credentials.createSsl()` vs `createInsecure()` based on it (grpc-js takes credentials separately from the target address, unlike a scheme-driven URI). |
| notification-service (Go) | `google.golang.org/grpc` | Added `GRPC_USE_TLS` env flag (`internal/config/config.go`); `internal/handlers/mesh.go` now picks `credentials.NewTLS(&tls.Config{})` vs `insecure.NewCredentials()` based on it. |
| ai-service (Python) | `grpc`/`grpc.aio` | Added `GRPC_USE_TLS` env flag; `grpc_clients.py` now picks `grpc.secure_channel`/`grpc.aio.secure_channel` (with `grpc.ssl_channel_credentials()`) vs the insecure equivalents. `mesh_status.py` now routes through the same helper instead of dialing insecure directly. |

Local dev and same-host docker-compose setups are unaffected — `GRPC_USE_TLS` defaults to
`false` and peer addresses default to `localhost`, same as before.

## One-time setup (per service)

Requires a Cloudflare account with a zone (domain) added, and `cloudflared` installed wherever
each service runs.

```sh
cloudflared tunnel login                     # once per machine/account
cloudflared tunnel create auth-service       # repeat per service, produces a credentials JSON
cloudflared tunnel route dns auth-service auth.<your-domain>
cloudflared tunnel route dns auth-service auth-internal.<your-domain>
```

Repeat `create`/`route dns` for `transaction-service`, `marketplace-service`,
`messaging-service`, `notification-service`, `ai-service` (marketplace-service only needs one
hostname — it has no gRPC route; ai-service's second hostname is `ai-mesh` rather than a public
REST route).

Copy the generated credentials JSON (`~/.cloudflared/<TUNNEL_ID>.json`) to where each
`config.yml` in this directory expects it (`/etc/cloudflared/<service>.json`), fill in the
`tunnel:` id and `<your-domain>` placeholders, then run:

```sh
cloudflared tunnel --config infra/cloudflare-tunnel/auth-service.config.yml run
```

## After the tunnels are up: switching each service to production peer addresses

Set these in each service's real `.env` (not `.env.example`) once its peers' tunnels are live:

- **auth-service / transaction-service** (`.env`): change `Grpc__Peers__*` from
  `http://localhost:<port>` to `https://<peer>-internal.<your-domain>`.
- **transaction-service** (`.env`): `Internal__MarketplaceRestAddr=https://marketplace.<your-domain>`.
- **messaging-service / notification-service / ai-service** (`.env`): change `*_GRPC_ADDR` from
  `localhost:<port>` to `<peer>-internal.<your-domain>:443`, and set `GRPC_USE_TLS=true`.

The shared `Internal__ServiceToken`/`INTERNAL_SERVICE_TOKEN` mesh secret still gates every
gRPC/internal call exactly as before — Cloudflare Tunnel adds network-level exposure, it isn't
a substitute for that check.
