# Redis Integration Plan — Cache Layer + Gateway Rate Limiting + Email Verification

Companion to [gateway/IMPLEMENTATION_PLAN.md](gateway/IMPLEMENTATION_PLAN.md). One shared Redis
instance, three independent uses, kept separate by key prefix so they can be reasoned
about (and monitored/evicted) independently without running three Redis deployments.

## 1. Topology

**Externally hosted**, matching how Postgres (Supabase) and MongoDB (Atlas) already work in
this repo — not a local `redis:` container in `docker-compose.yml`. One managed Redis instance
(e.g. Upstash, Redis Cloud), one connection string, pasted into every service's `.env` the same
way `MONGODB_URI`/`ConnectionStrings__AuthDb` already are. This is also why credentials matter
here at all — a local no-auth container wouldn't need any.

All three uses (cache-aside, gateway rate limiting, auth verification codes) share the **same**
instance and the same connection string, kept apart by **key prefix**, not logical-DB `SELECT` —
several managed/serverless Redis tiers (e.g. Upstash's free tier) don't support multiple logical
DBs, so prefixing is the portable choice:

| Key prefix | Purpose | Owner |
|---|---|---|
| `cache:{service}:...` | Cache-aside for DB reads (§2) | all 5 backend services |
| `ratelimit:{key}` | Gateway rate-limit counters | gateway |
| `authverify:{userId}` | Email verification codes (§3) | auth-service |

Env var convention added to every service (matching each language's existing style):
```
REDIS_URL=CHANGE_ME                       # Go/Node/Python — full connection string,
                                            # e.g. rediss://default:<password>@<host>:<port>
Redis__ConnectionString=CHANGE_ME          # C# (Section__Key) — StackExchange.Redis config
                                            # string, e.g. <host>:<port>,password=...,ssl=True
```
Every service (and the gateway) points at the **same** value — one Redis instance, provisioned
once, its connection string copy-pasted into each service's `.env`.

Client libraries: **Go** `github.com/redis/go-redis/v9`, **Node** `ioredis`, **Python**
`redis` (`redis.asyncio` for ai-service's async server), **C#** `StackExchange.Redis`.

## 2. Cache-aside layer for DB reads

Read-through, TTL-expiry cache in front of each service's own database — exactly as described:
on a read, check Redis first; on a miss, read the DB and populate Redis with a TTL; the TTL
alone is what evicts stale entries (no background sweep needed, Redis expires keys natively).

**Key scheme**: `{service}:{entity}:{id}` (or `{service}:{entity}:{id}:{sub-key}` for parameterized
reads like paginated lists), e.g. `auth:vendor-profile:3f9e...`, `transaction:wallet:8a12...`,
`ai:vendor-search:plastics:Nasr City`.

**Where the logic lives**: inside each service's existing data-access layer (the repository/
service method that currently queries the DB directly), not in the gateway — this is a per-service
concern since each service owns its own database, unlike the gateway's rate limiter which is a
gateway-only concept. Pattern (same shape in every language): check cache → on hit, return; on
miss, query DB, write to cache with TTL, return.

**Candidate reads and proposed TTLs** (starting points, not final — tune once real traffic
patterns are visible):

| Service | Cached read | Proposed TTL | Notes |
|---|---|---|---|
| auth-service | `GetVendorProfileAsync` (rating/review aggregate) | 5 min | read-heavy, changes slowly |
| auth-service | user-by-id lookup (`GetUser` gRPC/`Me`) | 1 min | never cache password hash/credentials |
| transaction-service | wallet balance | 15–30 s, **+ invalidate on write** | financial data — pure TTL risks a stale balance right after a top-up/withdrawal; write-invalidate on every `WalletsController` mutation removes that risk cheaply |
| transaction-service | deal/offer lookups | 30 s | |
| messaging-service | conversation + participants | 30–60 s | |
| notification-service | unread count | 10 s, **+ invalidate on write** | polled frequently for a UI badge; invalidate on `Create`/`MarkRead`/`MarkAllRead` so the badge never lags a user's own action |
| ai-service | vendor search results | 10 min | `vendors.json`-backed, effectively static |

Everything except the two flagged rows uses **TTL-only expiry**, matching what you described —
no invalidation logic to maintain, just an expiry. The two flagged rows get a cheap
invalidate-on-write (`DEL` the key after the mutating call) because serving a stale wallet
balance or unread badge for the TTL window is a worse user-facing bug than the added complexity
of one extra `DEL` call at the existing write site.

## 3. Email verification via Redis (auth-service)

Today (`EmailVerificationService.cs`): a Postgres table (`auth_db.email_verification`) stores a
hashed code with an `expires_at` timestamp; sending a new code loops over outstanding rows to
mark them used; confirming a code queries by hash and checks `IsRedeemable` (not used, not
expired) in application code.

Redis replaces all of that expiry/invalidation bookkeeping with native TTL:

- **Send**: `SET authverify:{userId} {codeHash} EX {CodeExpiryMinutes * 60}` — overwriting
  the key *is* "invalidate any outstanding code," no loop needed.
- **Confirm**: `GET authverify:{userId}`, compare hash; on match, `DEL` the key (enforces
  single-use, replacing the `UsedAt` field) and flip `EmailVerified`/`Status` in Postgres exactly
  as today (that part of the flow doesn't change — Postgres stays the source of truth for user
  state, only the *code* moves to Redis).
- **Expiry**: handled entirely by Redis's TTL — no `IsRedeemable`/manual timestamp check left in
  application code.

This only applies to the password-based signup path — Google sign-in already verifies the
email address, so it never touches this flow (unchanged).

`services/auth-service/db/migrations/0001_create_email_verification.sql`'s table becomes unused
by new code once this ships. Recommending **not** dropping it in the same change — leave the
table in place (harmless, just unused) rather than bundling a destructive migration into a
feature change; drop it later in its own reviewed migration if you want the schema fully clean.

**Worth flagging**: `password_reset` (referenced by an explicit comment in the `0001` migration
— "Mirrors auth_db.password_reset: single-use, hashed-at-rest code with an expiry") looks like
the exact same pattern. Not in scope unless you want it — same Redis treatment would apply
identically if so.

## 4. docker-compose.yml

No new service block — Redis is external. Each service's `env_file` already carries its own
`.env`, which now also carries `REDIS_URL`/`Redis__ConnectionString`; nothing in
`docker-compose.yml` itself needs to change for Redis specifically.

## 5. Phased build order

1. Provision one managed Redis instance; add its connection string to every service's `.env`;
   add the Redis client dependency + connection setup to each service (a thin shared "get
   client" helper per service, matching the existing lru_cache/singleton patterns already used
   for Mongo in ai-service/notification-service).
2. auth-service: migrate email verification to Redis (§3) — smallest, most self-contained piece,
   good first proof that the Redis wiring works end to end.
3. Cache-aside layer, service by service, starting with the two flagged read-heavy/low-risk
   entities (vendor profile, vendor search) before the two write-invalidated ones (wallet
   balance, unread count).
4. Gateway rate limiter (tracked in `gateway/IMPLEMENTATION_PLAN.md`, not duplicated here) —
   built once the gateway skeleton exists, using the `ratelimit:` prefix on this same instance.

## 6. Notes for your review

- TTL values above are starting proposals, not commitments — easy to tune per-entity later since
  they're just a constant at each cache-aside call site.
- Only wallet balance and unread count get write-invalidation; everything else is TTL-only, per
  your original description. Say if you'd rather have more (or fewer) entities invalidate on write.
- `password_reset` (§3) is flagged, not assumed in scope — confirm if you want it folded in too.
- Not dropping the old `email_verification` table in this pass (§3) — confirm if you'd rather
  clean it up now instead.
