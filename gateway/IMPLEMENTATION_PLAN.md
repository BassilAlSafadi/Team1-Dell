# API Gateway — Implementation Plan

Decisions locked in (see §7 for the reasoning that led here):
- **(a)** Gateway-first, expand-as-you-go: ship the skeleton with a REST-reverse-proxy fallback,
  cut routes over to real gRPC one at a time as each backend's proto surface grows to cover them.
- **(b)** messaging-service's realtime traffic passes through to it directly (`/socket.io/*`),
  bypassing gRPC; only its REST-style routes go through gRPC.
- **(c)** Gateway validates JWTs at the edge and forwards identity via gRPC metadata; backends
  keep validating independently too (defense in depth — no service-to-service auth exists yet).
- **(d)** Rate limiting is Redis-backed from the start, not in-memory-then-migrate — see
  [../REDIS_INTEGRATION_PLAN.md](../REDIS_INTEGRATION_PLAN.md). Redis is being stood up now
  anyway (cache layer + email verification), so there's no reason to build a throwaway
  in-memory limiter first; the `ratelimit.Limiter` interface in §4.3/§3 still exists so the
  implementation is swappable, but Redis is the first (and only planned) implementation.
- **(e)** The gateway becomes the sole public path — each backend's REST port (8080) stays bound
  to the Docker network only, not published to the host, once the gateway is up.

## 1. What this service is

The single public entry point for the marketplace. External clients (frontend, mobile, third
parties) talk HTTP/REST to the gateway; the gateway talks **gRPC** to the 5 backend services
(auth, transaction, messaging, notification, ai) — reusing the internal gRPC servers and ports
already wired up in the [gRPC mesh work](../services) (auth=6001, transaction=6002,
messaging=6003, notification=6004, ai=6005). It owns the cross-cutting concerns every backend
would otherwise have to duplicate:

- **Routing** — one path-based router dispatching to the right backend.
- **Rate limiting** — protect backends from abusive/runaway clients.
- **Request/response translation** — HTTP+JSON in, protobuf out, and back.
- **AuthN at the edge** — validate the JWT once, forward identity downstream.
- **Error normalization** — consistent HTTP status codes regardless of which backend/language
  produced the error.
- **Observability** — one place to log/measure every request that enters the system.

Per your last commit message ("Backend done. Gateway, Redis Cache and wiring left"), this is
explicitly the next planned piece, and Redis is being introduced alongside it rather than after
— see [../REDIS_INTEGRATION_PLAN.md](../REDIS_INTEGRATION_PLAN.md) for the shared cache layer
and email-verification redesign, and §4.3 below for how the gateway's rate limiter uses it.

## 2. Where it sits

```
                    ┌─────────────┐
  clients ────────▶ │   Gateway   │
 (REST/HTTP,        │  (Go, gRPC  │
  WebSocket)         │   client)   │
                    └──────┬──────┘
                           │ gRPC
        ┌──────────┬───────┼───────┬──────────┐
        ▼          ▼       ▼       ▼          ▼
   auth-service transaction messaging notification ai-service
    :6001        :6002      :6003     :6004      :6005
```

Each backend's REST API (port 8080) stays as-is on the wire — this plan doesn't change any
backend's REST handlers. Per decision (e), its port just stops being published to the host once
the gateway takes over as the sole public path; it's still reachable from other containers on
the Docker network (which is all the gateway itself needs).

## 3. Directory / module layout

Mirrors the existing Go service (`notification-service`) so the codebase stays consistent:

```
gateway/
  cmd/server/main.go
  internal/
    config/          # env loading — same Section__Key-free, flat SCREAMING_SNAKE style as
                      # messaging-service/notification-service
    router/           # chi router, route table (see §5)
    middleware/        # auth, rate-limit, request-id, logging, CORS, recover
    grpcclients/       # one typed client wrapper per backend (Auth, Transaction, Messaging,
                      # Notification, Ai), built on the generated stubs
    grpcgen/           # buf-generated Go stubs for all 5 proto packages — same buf.gen.yaml
                      # pattern already established in notification-service
    ratelimit/         # pluggable Limiter interface, backed by Redis (go-redis/redis/v9)
    transform/         # HTTP<->protobuf marshalling helpers per route
  buf.gen.yaml
  Dockerfile
  .env.example
  go.mod
```

## 4. Core responsibilities in detail

### 4.1 Routing
Path-prefix dispatch to the matching backend, e.g.:

| Path prefix | Backend | Notes |
|---|---|---|
| `/api/auth/*` | auth-service | register/login/google/refresh/logout/me |
| `/api/vendors/*/reviews`, `/profile` | auth-service | reviews |
| `/api/wallets/*`, `/api/payment-methods/*` | transaction-service | |
| `/api/offers/*`, `/api/deals/*` | transaction-service | |
| `/api/conversations/*` | messaging-service | REST; see §4.5 for realtime |
| `/api/notifications/*` | notification-service | |
| `/api/ai/*` | ai-service | classify / recommendations / vendor search |

This table only works end-to-end once each backend's gRPC surface actually covers these
operations — today it doesn't. Per decision (a), routes fall back to REST-reverse-proxy until
each one's real gRPC RPC exists, cutting over incrementally rather than blocking on a full
proto build-out across all 5 backends first.

### 4.2 AuthN at the edge
Gateway validates the JWT (same shared `Jwt__SigningKey`/`JWT_SIGNING_KEY` HS256 secret every
service already trusts) once, then forwards the resolved identity (`user_id`, `roles`) to
backends via gRPC metadata (e.g. `x-user-id`, `x-user-roles`) instead of re-sending the raw
token. Backends keep validating independently for now (defense in depth) — there's still no
service-to-service auth (mTLS/service tokens) anywhere in this repo, so the gateway isn't yet a
hard trust boundary, just a convenience layer. Flagged as a known gap, not hidden, consistent
with how this limitation is already documented elsewhere in the codebase.

### 4.3 Rate limiting
A `ratelimit.Limiter` interface (`Allow(ctx, key string) (bool, error)`), backed by Redis from
the start (a Lua-scripted token bucket keyed by client IP or authenticated user id, `INCR` +
`EXPIRE` under the `ratelimit:` key prefix — see
[../REDIS_INTEGRATION_PLAN.md](../REDIS_INTEGRATION_PLAN.md) for the shared Redis topology this
plugs into). The interface still exists so the implementation is swappable, but there's no
in-memory placeholder to build first — Redis is already being stood up for the cache layer and
email verification, so the gateway just becomes another consumer of that same instance.

### 4.4 Request/response transformation
Each route has a small handler that: decodes the incoming JSON body into the matching protobuf
request message (`protojson` where the shapes line up 1:1, hand-mapped where REST's existing
JSON shape needs to keep backward compatibility with the frontend), calls the gRPC client,
maps the protobuf response back to the existing REST JSON shape (so the frontend's contract
doesn't change even though the transport underneath did), and maps gRPC status codes to HTTP
status codes consistently (`NotFound`→404, `InvalidArgument`→400, `PermissionDenied`→403,
`Unauthenticated`→401, `Unavailable`→503, default→500).

### 4.5 Realtime (messaging-service's Socket.io)
gRPC doesn't map cleanly onto Socket.io's protocol. Recommended: the gateway reverse-proxies
`/socket.io/*` traffic straight through to messaging-service (bypassing gRPC entirely for this
one path), while `/api/conversations/*` REST-style calls go through gRPC like everything else.
Alternative considered and not recommended: replacing Socket.io with gRPC server-streaming end
to end — bigger rewrite of already-working messaging-service code for no clear benefit here.

### 4.6 Circuit breaking / timeouts
Per-backend timeout on every gRPC call (context deadline), plus a simple circuit breaker keyed
off the same `grpc.health.v1.Health` check already registered on every backend from the mesh
work — if a backend's last health check failed, short-circuit to a fast 503 instead of waiting
out a call timeout.

### 4.7 Observability
Structured logging (request id, route, backend, latency, status) on every request from day one.
Prometheus metrics and OpenTelemetry tracing are called out as a later phase (§6, Phase 4), not
blocking the initial build.

## 5. Config / env vars

Following the existing flat `SCREAMING_SNAKE_CASE` convention (matches messaging-service/notification-service, not the C# services' `Section__Key` style, since this is a Go service):

```
PORT=8080                          # public HTTP port
AUTH_GRPC_ADDR=auth-service:6001
TRANSACTION_GRPC_ADDR=transaction-service:6002
MESSAGING_GRPC_ADDR=messaging-service:6003
NOTIFICATION_GRPC_ADDR=notification-service:6004
AI_GRPC_ADDR=ai-service:6005
JWT_ISSUER=auth-service
JWT_AUDIENCE=circular-economy-marketplace
JWT_SIGNING_KEY=...                # same shared secret every service already trusts
CORS_ORIGINS=...
REDIS_URL=CHANGE_ME                 # same shared instance every service uses — see ../REDIS_INTEGRATION_PLAN.md
RATE_LIMIT_RPS=...
RATE_LIMIT_BURST=...
```

## 6. Phased build order

1. **Skeleton** — Go module, chi router, `/healthz`, config loading, Dockerfile,
   `docker-compose.yml` entry (gateway as a 6th service; per decision (e), backend REST ports
   stop being published to the host once this lands).
2. **Auth passthrough** — JWT validation at the edge; wire `/api/auth/*` to auth-service's gRPC
   (this requires adding Register/Login/Refresh/Logout RPCs to `auth.proto` — only
   `GetUser`/`GetVendorProfile` exist today from the mesh work).
3. **Expand remaining backend proto surfaces** to full REST parity, service by service, same
   pattern as the mesh build-out (one proto + server implementation per service).
4. **Cross-cutting hardening** — Redis-backed rate limiting, circuit breaking off health checks,
   request-id propagation, CORS centralization.
5. **Observability** — metrics, tracing, load test.

## 7. Why these decisions

- **(a) Gateway-first, expand-as-you-go** over gRPC-complete-first: today each backend only
  exposes a handful of gRPC RPCs (health, a couple of read-only mirrors, `CreateNotification`,
  `ClassifyWaste`/`GetRecommendation`) — nowhere near full REST parity. Building the gateway
  skeleton now with a REST-reverse-proxy fallback, and cutting routes over to real gRPC as each
  backend's proto surface grows, ships something usable immediately instead of gating the whole
  gateway on 5 backends reaching full parity first.
- **(b) Socket.io passthrough** over gRPC streaming: gRPC doesn't map cleanly onto Socket.io's
  protocol, and messaging-service's realtime path already works — rewriting it for no clear
  benefit isn't worth it.
- **(c) Defense-in-depth JWT validation**: there's no service-to-service auth (mTLS/service
  tokens) anywhere in this repo yet, so treating the gateway's forwarded identity as fully
  trusted would be a real gap, not a convenience. Backends keep validating until that changes.
- **(d) Redis-backed rate limiting from day one**: Redis is being stood up now anyway for the
  cache layer and email verification (see
  [../REDIS_INTEGRATION_PLAN.md](../REDIS_INTEGRATION_PLAN.md)) — building a throwaway in-memory
  limiter first and migrating later would just be extra work for no benefit.
- **(e) Gateway as sole public path**: consistent with "single public entry point" being the
  whole point of this service; backend REST ports stay reachable inside the Docker network for
  local debugging, just not published to the host.
