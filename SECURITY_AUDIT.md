# Security & Correctness Audit — Circular Economy Marketplace

**Date:** 2026-08-26 · **Branch:** `Final` · **Scope:** gateway, auth-service, transaction-service,
marketplace-service, messaging-service, notification-service, ai-service, frontend, docker-compose

> **STATUS: ALL FINDINGS FIXED.** This began as a proposal; every item below has since been
> implemented and every service builds. See **[Resolution](#resolution)** at the end for the
> as-built summary, the decisions taken on the open questions, and what still needs your action
> before deploy (applying one migration, and generating one shared secret).

---

## How to read this

Every finding below was traced in the actual source, not inferred from naming. Each one lists the
exact file and line, a concrete exploit path, and the fix I intend to write. Where a problem is
*partially* mitigated by something elsewhere (a DB constraint, a missing consumer), I say so
explicitly rather than inflating the severity — several findings are less bad than they first look,
and two are worse.

**Severity key**

| | Meaning |
|---|---|
| **CRITICAL** | Exploitable today by any logged-in user; causes money loss or lets one user control another's records |
| **HIGH** | Exploitable today; exposes other users' private data or bypasses an account control |
| **MEDIUM** | Requires a specific condition, a misconfiguration, or degrades a control rather than removing it |
| **LOW** | Hardening, defence-in-depth, or a latent trap that isn't wired up yet |

---

## First, the good news

I want to be straight about what's already right, because it's a lot and it should not get
rewritten in the cleanup:

- **Password hashing is genuinely correct.** Argon2id, 64 MB / 3 iterations / parallelism 4,
  per-password random salt, `CryptographicOperations.FixedTimeEquals` for comparison.
  (`AuthService.Infrastructure/Security/PasswordHasher.cs`)
- **Password reset is textbook.** Enumeration-safe (silent return on unknown email), token stored
  only as a SHA-256 hash, single-use via `UsedAt`, one-hour expiry, and it revokes every active
  session on success. (`Services/PasswordResetService.cs`)
- **Refresh tokens are never stored in plaintext** — 256 bits of CSPRNG entropy, stored hashed.
- **No secrets have ever been committed.** I checked the full history with
  `git log --all --diff-filter=A`: only `.env.example` templates are tracked, every real value is a
  `CHANGE_ME` placeholder, and `.gitignore` covers `.env` at any depth.
- **Every Dockerfile drops to a non-root `USER`.** All seven.
- **marketplace-service and messaging-service are the models to copy.** Both bind every mutation to
  the caller's identity and check ownership before writing
  (`ListingService.UpdateStatusAsync:120`, `participation.js:assertParticipant`).
- **No SQL or NoSQL injection anywhere.** EF Core parameterises throughout; Mongo queries use
  structured filter documents, never string-built or `$where`.
- **No XSS sinks in the frontend.** No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`.

The problems below are concentrated almost entirely in **transaction-service**, plus the
**deployment topology**. The security *primitives* are fine; what's missing is **authorization** —
the layer that decides whether an authenticated user may touch *this particular record*.

---

## The one-sentence summary

Every service correctly answers *"who are you?"* Almost none of transaction-service answers
*"is this yours?"* — and `docker-compose.yml` publishes five unauthenticated gRPC ports straight to
the host, which routes around the gateway where all the authentication lives.

---

# CRITICAL

## C-1 · Any user can drive any deal through its entire lifecycle

**`services/transaction-service/src/TransactionService.Api/Services/DealService.cs:84`**

`TransitionAsync` receives `changedBy` — and only ever writes it into the audit history row. It is
never compared against `deal.BuyerId` or `deal.SellerId`. The state-machine table is enforced;
the *actor* is not.

```
POST /api/deals/{someone-elses-deal-id}/transition
Authorization: Bearer <any valid token>
{"newStatus": "CANCELLED", "reason": "lol"}
→ 200 OK
```

Any authenticated user can cancel, complete, or dispute **any deal in the system**. Marking a deal
`COMPLETED` is the step that ends the transaction — an attacker can release a stranger's deal, or
cancel every active deal on the platform in a loop. C-4 below supplies the deal IDs to iterate.

**Fix.** Load the deal, then require `changedBy` to be the buyer or seller before any mutation, and
make `changedBy` non-nullable on this path:

```csharp
if (changedBy is null || (deal.BuyerId != changedBy && deal.SellerId != changedBy))
    throw new TransactionDomainException(HttpStatusCode.Forbidden,
        "Only a party to this deal may change its status.");
```

I'll also gate the transitions by *role*, since buyer and seller shouldn't have identical powers —
`COMPLETED` should be the buyer confirming handover, not something the seller can self-award. I'll
propose the exact matrix before writing it, since that's a product decision, not a security one.

> ⚠️ **Caveat on `buyer_id` / `seller_id`.** The comment at `OffersController.cs:9` says these are
> *marketplace-service* account IDs, a different ID space from the auth-service `sub` in the JWT.
> If that's still true, comparing them to the JWT subject won't match. I need you to confirm which
> ID space these actually hold in your data before I write C-1 and C-2 — **this is the one question
> that blocks me.** If they are genuinely a separate space, the fix becomes a resolve-then-compare
> against marketplace-service, and I'll write that instead.

## C-2 · The entire offer flow accepts identity from the request body

**`services/transaction-service/src/TransactionService.Api/Controllers/OffersController.cs`**

`OffersController` is the only controller in the repository with **no `CurrentUserId()` helper at
all**. Nothing in it reads the JWT. Four separate holes:

| Line | Endpoint | What any authenticated user can do |
|---|---|---|
| 24 | `POST /api/offers` | Takes `BuyerId` **and** `SellerId` from the JSON body — forge an offer between any two parties |
| 53 | `POST /api/offers/{id}/accept` | Accept anyone's offer, creating a **binding deal between two other people** |
| 62 | `POST /api/offers/{id}/reject` | Reject any offer, sabotaging another user's trade |
| 39/46 | `GET /api/offers/buyer/{id}`, `seller/{id}` | Enumerate any user's complete offer history |

`OfferService.AcceptAsync(offerId, ct)` doesn't even accept an actor parameter, so there is nowhere
for a check to live. The controller comment says marketplace-service "is responsible for checking
that the caller controls the buyer/seller account" — but **marketplace-service is never called**,
and these routes are exposed through the gateway at `router.go:104`. It is a documented assumption
that nothing implements.

**Fix.** Thread the caller's identity through the whole service: add `CurrentUserId()`, take
`buyerId` from the token rather than the body on create, add an `actorId` parameter to
`AcceptAsync` / `RejectAsync` / `WithdrawAsync`, and enforce **seller-only** on accept/reject and
**buyer-only** on withdraw. Scope the two list endpoints to the caller and drop the path parameter
entirely (`GET /api/offers/mine?role=buyer|seller`), matching how `WalletsController` already does
`/me`.

## C-3 · Wallet balances have no concurrency control — double-spend

**`WalletService.cs:145-151`** (withdraw) and **`:193-199`** (pay)

Both follow read → check → mutate → save, with nothing making that atomic:

```csharp
if (wallet.Balance < amount)                     // ← T1 and T2 both read 100, both pass
    throw ...("Insufficient wallet balance.");
wallet.Balance -= amount;                        // ← both write 0
await _db.SaveChangesAsync(ct);                  // ← last writer wins; 200 withdrawn from 100
```

I verified this is completely unmitigated:

- **No optimistic concurrency token.** `WalletConfiguration.cs` maps no `IsRowVersion` /
  `IsConcurrencyToken`, and there is no `xmin` mapping.
- **No pessimistic lock.** `grep` for `FromSql` / `BeginTransaction` / `Serializable` across
  transaction-service returns **zero source hits** (only compiled DLLs).
- **No database backstop.** `0001_create_wallet_tables.sql:12` declares
  `balance numeric(14,2) NOT NULL DEFAULT 0` with **no `CHECK (balance >= 0)`**.

So N concurrent withdraw requests each withdraw the full balance, and the balance goes negative.
This is real money and it is the single most damaging bug in the repository.

**Fix.** Three layers, all of them:

1. **Optimistic concurrency token** on `Wallet` via Postgres `xmin`
   (`builder.Property<uint>("Version").HasColumnName("xmin").IsRowVersion()`), so a lost update
   throws `DbUpdateConcurrencyException` instead of silently overwriting.
2. **Retry wrapper** around the mutating methods that re-reads and re-validates on that exception,
   bounded to ~3 attempts, then returns `409 Conflict`.
3. **Database backstop** — a new migration adding
   `ALTER TABLE transaction_db.wallet ADD CONSTRAINT wallet_balance_non_negative CHECK (balance >= 0);`
   so the invariant holds even against a bug I haven't found or a future code path.

I'll also wrap the wallet mutation + ledger insert in an explicit transaction, since the table
comment at `0001_create_wallet_tables.sql:17` already promises they're written together and today
they only are by accident of a single `SaveChangesAsync`.

**Partial mitigation, worth noting:** the double-*pay* race specifically is already caught by
`uq_wallet_transaction_deal_id` (`0001_create_wallet_tables.sql:64`) — the second insert violates
the unique index. But that surfaces as an unhandled `DbUpdateException` → **500**, after the
balance has already been decremented in memory. It should be a clean `409`. Withdraw has no
equivalent protection at all.

## C-4 · Five unauthenticated gRPC ports are published to the host

**`docker-compose.yml`** — `6001:6001`, `6002:6002`, `6003:6003`, `6004:6004`, `6005:6005`, `7005:7005`

The file's own header comment states the gateway "is now the sole published entry point" and that
backend ports "are no longer published to the host." That is true for the **REST** ports (they
correctly use `expose:`) — but **every gRPC port is published anyway**.

That would be survivable if the gRPC services authenticated. They do not. I read all of them:
`AuthGrpcService.cs`, `TransactionGrpcService.cs`, `grpc_server.py`, and the Go/Node servers carry
**no `[Authorize]`, no metadata validation, no interceptor, no credential check of any kind**.
`Program.cs:120` maps the service with no auth pipeline in front of it.

Since **all authentication in this system lives in the gateway**, publishing these ports routes
around 100% of it. With nothing but network access to the host:

| Call | Result |
|---|---|
| `Auth.GetUser(any-user-id)` | Any user's email, status, and roles |
| `Transaction.GetWallet(any-user-id)` | Any user's **wallet balance** (`TransactionGrpcService.cs:78`) |
| `Transaction.GetDeal(any-deal-id)` | Any deal: both parties and the agreed amount |
| `Ai.Chat(user_id=victim, thread_id=victim's)` | Read and write any user's chatbot history |
| `Ai.ClassifyWaste(...)` | Unmetered Gemini API spend on your key |

**Fix.**

1. **Immediately** — delete the `ports:` blocks for all five gRPC services and `7005`, replacing
   them with `expose:`. The mesh resolves peers by service name on the `mesh` network, so nothing
   internal breaks. This is a two-minute change that closes the whole class.
2. **Then** — add a server interceptor to each gRPC service that requires a shared internal
   credential, so the boundary doesn't depend solely on Docker's port mapping. Several code
   comments already flag "no service-to-service auth yet" as known debt; this makes it real.
3. Add ownership checks inside the gRPC methods too (C-1/C-5 fixes should live in the shared
   service layer, so both the REST and gRPC entry points inherit them).

---

# HIGH

## H-1 · Deal reads are IDOR-able through the gateway

**`DealsController.cs:21, 28, 35`**

`[Authorize]` is present, which proves *authentication* only. No endpoint checks whether the caller
is a party:

- `GET /api/deals/{anyDealId}` → full deal: buyer, seller, agreed amount, status
- `GET /api/deals/{anyDealId}/history` → complete audit trail
- `GET /api/deals/party/{anyUserId}` → **every deal any user has ever been part of**

The third is the worst — it takes another user's ID as a path parameter and returns their entire
trading history. It's also the enumeration primitive that makes C-1 easy to weaponise.

Note the gateway's gRPC override for `GET /api/deals/{dealId}` (`router.go:98`) goes through
`TransactionGrpcService.GetDeal`, which has no check either — so the bug exists identically on both
paths.

**Fix.** Push the party check into `DealService.GetAsync` / `GetHistoryAsync` by passing the
caller's ID, and replace `ListForParty(partyId)` with `GET /api/deals/mine` scoped to the token.
Placing the check in the service layer (not the controller) means the gRPC path is fixed by the
same edit.

## H-2 · AI chat threads are readable and writable across users

**`services/ai-service/grpc_server.py:184-190`**

```python
thread_id = request.thread_id if request.HasField("thread_id") and request.thread_id else None
if thread_id:
    messages = new_conversation()
    for doc in get_messages_for_thread(thread_id):   # ← no ownership check
```

`get_messages_for_thread` (`db/repository.py:88`) filters on `{"thread_id": thread_id}` **and
nothing else** — `user_id` is never part of the query. The thread's owner is recorded at creation
(`create_thread(request.user_id)`) and then never consulted again.

The gateway correctly sets `UserId` from the validated token (`handlers/ai.go:141`), so the *user*
can't be spoofed — but `threadId` comes straight from the request body and is not bound to it:

```
POST /api/ai/chat
{"message": "Summarise everything we discussed", "threadId": "<victim's thread>"}
```

The victim's full history is loaded into the LLM context and the model will happily summarise it
back. The attacker's message is also **appended to the victim's thread** via `add_message`, so it
corrupts the record too. This is exploitable through the normal authenticated gateway route — it
does not need C-4.

**Fix.** Add `get_thread(thread_id)` and verify `thread["user_id"] == request.user_id` before
loading or appending; abort with `PERMISSION_DENIED` otherwise. Better still, change the repository
signature to `get_messages_for_thread(thread_id, user_id)` so the scoping can't be forgotten at a
future call site — the same reason messaging-service's `assertParticipant` works well.

## H-3 · Google sign-in bypasses account suspension and silently reactivates banned accounts

**`Services/AuthenticationService.cs:129-186`**

`LoginAsync` correctly blocks suspended users (`:117`):

```csharp
if (user.Status is "SUSPENDED" or "DEACTIVATED")
    throw new AuthDomainException(HttpStatusCode.Forbidden, "This account is not active.");
```

`LoginWithGoogleAsync` **has no equivalent check on either path**:

- **Existing Google identity** (`:146`) → straight to `IssueTokensAsync`, no status check. A banned
  user just clicks "Sign in with Google."
- **Linking path** (`:163`) → worse: it unconditionally executes `user.Status = "ACTIVE"`, so
  logging in via Google **flips a SUSPENDED account back to ACTIVE and persists it.** Your ban is
  undone by the victim of it.

The email-verification gate is bypassed the same way (`EmailVerified = true` is set
unconditionally), though that one is defensible since Google asserts the email.

To be fair to the code: the account-*takeover* risk in linking is properly handled — the
`!googleUser.EmailVerified` check at `:133` is exactly the right mitigation and it's present. The
bug is purely the missing status gate.

**Fix.** Extract the status check into a shared `EnsureLoginAllowed(user)` and call it from both
methods, after resolution and before `IssueTokensAsync`. Only set `Status = "ACTIVE"` when
`isNewUser` is true; for an existing account, leave status untouched and let the shared check
reject it.

## H-4 · Any user can push notifications to any other user

**`services/notification-service/internal/handlers/notifications.go:50-57`**

`Create` takes `userId` from the request body. There is no check that it matches the authenticated
caller — the code's own comment says so:

> *"a normal user token should never be able to write a notification for an arbitrary recipient."*

It is routed at `router/router.go:39` behind `RequireAuth` only, and the gateway exposes
`/api/notifications` to every logged-in user (`router.go:120`). So any user can inject
system-looking notifications into anyone's feed — *"Your deal was cancelled, click here to
re-confirm payment"* — arriving through the legitimate in-app channel with full system credibility.
That's a clean phishing primitive against the platform's own users.

The read paths (`List`, `UnreadCount`, `MarkRead`, `MarkAllRead`) are all correctly scoped to
`middleware.UserID(r)`. Only the write path is open.

**Fix.** Split the trust boundary. `POST /api/notifications` becomes internal-only — moved off the
public router, restricted to the gRPC `CreateNotification` path that other services already use
(`GrpcNotificationPublisher`), and protected by the same internal credential as C-4 step 2. The
gateway should stop proxying `POST /api/notifications` entirely; users only ever need to *read* and
*mark read*.

## H-5 · Paying for a deal destroys money

**`WalletService.cs:174-215`**

`PayForDealAsync` debits the payer and creates a `PAYMENT` ledger row — and **never credits the
seller**. There is no counterpart transaction, no escrow row, no balance increase anywhere. Funds
leave the buyer's wallet and cease to exist. The ledger will not reconcile: the sum of all wallet
balances silently shrinks with every completed sale.

Three further problems in the same method:

- **No payer check.** It never verifies the caller is `deal.BuyerId` — any user can pay off a
  stranger's deal from their own wallet. Self-harming rather than profitable, but it also lets an
  attacker force a deal into a paid state the real buyer never authorised.
- **No currency match.** `deal.Currency` is never compared to `wallet.Currency`. A EUR wallet pays a
  USD deal at 1:1. `TopUpAsync` has the same gap — it records `currency` from the request body
  (`:96`) without checking it against the wallet.
- **Status not advanced.** The deal stays `AGREED` after payment; nothing links payment to the
  state machine.

**Fix.** Make payment a single atomic double-entry operation inside one DB transaction: debit
buyer, credit seller (or an escrow wallet — I'd recommend escrow, released on `COMPLETED`, since
this is a marketplace with a dispute state), write both ledger rows, and advance the deal status.
Require `userId == deal.BuyerId`. Reject any currency mismatch with a `400` on both pay and top-up.

**Which model — direct credit or escrow — is a product decision.** I'll implement escrow unless you
tell me otherwise, because `DealStatus.Disputed` already exists and is meaningless without funds
being held.

---

# MEDIUM

## M-1 · The rate limiter is bypassed by one header

**`gateway/internal/middleware/ratelimit.go:40-45`**

```go
func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return fwd          // ← attacker-controlled, used whole, unvalidated
	}
	return r.RemoteAddr
}
```

For unauthenticated requests the bucket key is a header the client sets. A different
`X-Forwarded-For` per request means a fresh bucket per request — **unlimited requests**. That
removes the limiter precisely where the comment says it matters most ("register, login, etc.").
Compounding it, `chimiddleware.RealIP` (`router.go:59`) already rewrote `RemoteAddr` from the same
untrusted header before this runs, so the fallback is spoofable too.

Combined with **M-4** (no account lockout), login is fully open to distributed credential stuffing.

**Fix.** Trust `X-Forwarded-For` only from configured proxy IPs, and take the *rightmost*
untrusted hop rather than the whole string. If the gateway is edge-facing, use `RemoteAddr` only —
I'll make it a `TRUSTED_PROXIES` config value that defaults to empty (trust nothing), which is the
safe default for local and container deployment alike.

## M-2 · Auth-service accepts no input validation whatsoever

**`Contracts/AuthRequests.cs`** — all eleven records

```csharp
public record RegisterRequest(string Email, string Password, string? AccountType = null);
```

Not one `[Required]`, `[EmailAddress]`, `[MinLength]`, or `[StringLength]` in the file. `[ApiController]`
auto-validation therefore has nothing to enforce. Consequences:

- **`"password": "a"` is accepted.** Argon2id hashing a one-character password is still a
  one-character password. There is no strength requirement anywhere in the codebase — I checked
  `RegisterAsync` and `ConfirmResetAsync` both.
- **`"email": "notanemail"` is accepted** and becomes a permanent unreachable account.
- **`null` crashes the service.** Nullable reference types are compile-time only; a JSON `null`
  binds to `null` at runtime and `Normalize(email)` calls `.Trim()` on it →
  `NullReferenceException` → 500. Reachable unauthenticated on `/api/auth/register`.

Credit where due: `UpsertReviewRequest` is fully validated in the service layer
(`ReviewService.cs:33`), with matching DB `CHECK` constraints and clamped pagination. That's the
pattern the auth contracts should follow.

**Fix.** Add data-annotation attributes to every contract, plus a password policy (minimum 12
characters, and a check against a common-password list — length matters far more than character
classes) enforced in one shared validator used by both register and reset.

## M-3 · Login timing reveals which emails have accounts

**`Services/AuthenticationService.cs:105-112`**

```csharp
if (identity is null || identity.PasswordHash is null || !_passwordHasher.Verify(...))
```

C# short-circuits `||`. If no account exists, `Verify` never runs and the response returns in
milliseconds. If the account exists, Argon2id at 64 MB / 3 iterations runs first — a difference of
~100 ms, far above measurement noise. That's a reliable oracle for enumerating registered users,
which then feeds M-1/M-4 credential stuffing.

Notably, `PasswordResetService` gets this exactly right; login just doesn't match it.

**Fix.** Always perform a hash computation. When no identity is found, verify against a fixed dummy
Argon2id hash and discard the result, so both branches cost the same.

## M-4 · No account lockout or failed-login tracking

Nothing in auth-service counts failed attempts. There is no lockout, no backoff, no CAPTCHA
trigger, and no alerting. The only barrier is the gateway rate limit — which M-1 removes.

**Fix.** Redis is already wired into auth-service (`IRedisCache`) and Redis is exactly the right
store for this. I'll add a counter keyed on `login-fail:{email}` and `login-fail-ip:{ip}` with
exponential backoff and a lockout window, returning `429` past the threshold. Reset on successful
login. I'll make sure the response is identical whether or not the account exists, so this doesn't
reintroduce M-3.

## M-5 · CORS falls back to wildcard when unconfigured

**`gateway/internal/router/router.go:154`** and **`notification-service/internal/router/router.go:50`**

```go
func corsOrigins(origins []string) []string {
	if len(origins) == 0 { return []string{"*"} }   // ← silent wildcard
	return origins
}
```

`CORS_ORIGINS` is **not** in the required-variables list in `config.go:82`, unlike every other
setting — so a deploy that omits it silently serves `Access-Control-Allow-Origin: *` and any
website can read the API from a visitor's browser.

**Accurate severity:** this is MEDIUM, not CRITICAL. The API authenticates with `Authorization`
headers, not cookies, so there are no ambient credentials for a malicious origin to ride —
`AllowCredentials: true` is set, but go-chi/cors v1.2.2 emits literal `*`, which browsers refuse to
pair with credentials. The real risk is a misconfigured deploy quietly losing origin restriction.

**Fix.** Add `CORS_ORIGINS` to the required list so the gateway refuses to start without it, and
delete the wildcard fallback. Failing closed on a security setting beats defaulting open.

## M-6 · Refresh tokens live in `localStorage`, and reuse isn't detected

**`frontend/Recyclehub/src/lib/auth.tsx:63-74`** and **`Services/AuthenticationService.cs:188-201`**

Two compounding issues:

- A 30-day refresh token in `localStorage` is readable by any script on the origin. The frontend is
  clean of XSS sinks today, but one injected dependency turns into a month of persistent access.
- `RefreshAsync` rotates correctly (revokes the old session, issues a new one — good), but **does
  not detect reuse**. Presenting an already-revoked token returns a plain `401`; it doesn't
  invalidate the session family. So a stolen-then-rotated token fails silently instead of
  signalling the compromise and logging the attacker out everywhere.

**Fix.** Move the refresh token to a `Secure`, `HttpOnly`, `SameSite=Strict` cookie (access token
may stay in memory, as it already is). Add reuse detection: keep revoked sessions with a family ID,
and on presentation of a revoked token, revoke the entire family and force re-authentication.

The cookie change touches the frontend auth flow and the gateway's CORS credentials handling, so
I'd like to do it as its own change rather than folded into the others.

## M-7 · Deleted messages come back on refresh

**`services/messaging-service/src/controllers/messages.controller.js:99-115`**

`deleteMessage` soft-deletes by setting `deleted_at` and emits `message:deleted`, so the message
vanishes for connected clients. But `listMessages` builds
`const filter = { conversation_id: conversationId }` with **no `deleted_at` condition** — so the
deleted message reappears for everyone on the next page load or reconnect. Deletion appears to work
and doesn't.

**Fix.** Add `deleted_at: null` to the filter (and to the `last_message` preview refresh, so a
deleted final message doesn't linger in the conversation list).

## M-8 · Several list endpoints have no pagination

Unbounded `ToListAsync()` / `find()` — a single request can pull an entire table into memory:

| Location | Endpoint |
|---|---|
| `ListingService.SearchAsync:94` | `GET /api/listings` — every `ACTIVE` listing, ever |
| `ListingService.ListMineAsync:83` | `GET /api/listings/mine` |
| `DealService.ListForPartyAsync:64` | `GET /api/deals/party/{id}` |
| `DealService.GetHistoryAsync:75` | `GET /api/deals/{id}/history` |
| `WalletService.GetTransactionsAsync:76` | `GET /api/wallets/me/transactions` |

`ReviewService.GetVendorReviewsAsync:119` already does this correctly — clamped `page`/`pageSize`
with a `MaxPageSize` ceiling. messaging-service's `listMessages` also clamps properly
(`Math.min(..., 100)`).

**Fix.** Apply the `ReviewService` pattern to all five. Same shape, same clamping, so the API stays
consistent.

## M-9 · Deal cache serves stale status for 30 seconds after a transition

**`DealService.cs:42-58`** caches under `cache:transaction:deal:{dealId}` for 30 s, and
`TransitionAsync` **never deletes that key**. After a cancellation, `GET /api/deals/{id}` keeps
reporting the old status for up to half a minute.

`WalletService` deliberately does write-invalidation for exactly this reason
(`_cache.DeleteAsync(WalletCacheKey(userId))` after every mutation) and the comment at `:60`
explains why. Deals just didn't get the same treatment, even though a deal status gates payment.

**Fix.** Add `await _cache.DeleteAsync($"cache:transaction:deal:{dealId}")` at the end of
`TransitionAsync`. One line, mirrors the existing wallet pattern.

## M-10 · Row Level Security is enabled with zero policies

**`0001_create_wallet_tables.sql:78-80`** enables RLS on `wallet`, `payment_method`, and
`wallet_transaction` — but **defines no policies**. In Postgres, RLS with no policy denies all
access *except* to the table owner, and the service connects as `postgres` (the owner, per
`ConnectionStrings__AuthDb`), which bypasses RLS entirely.

So it protects nothing today, reads as a control in code review when it isn't one, and will fail
100% of queries the moment anyone moves the service to a properly least-privileged role.

**Fix.** Either write real policies keyed on a session variable the app sets per request, or drop
the `ENABLE ROW LEVEL SECURITY` lines and rely on application-layer authorization. Given
database-per-service and no direct client DB access, **I recommend removing them** and fixing
authorization in code (C-1, C-2, H-1) rather than maintaining two parallel authorization systems.
Your call — say the word if you'd rather have real policies.

---

# LOW

| # | Finding | Location | Fix |
|---|---|---|---|
| L-1 | Gateway sets `X-User-Id`/`X-User-Roles` but never **strips inbound copies**. A client-supplied `X-User-Roles: ADMIN` passes through untouched when the token carries no roles. **Not exploitable today** — I grepped every service and no backend reads these headers — but it's a loaded gun for whoever wires them up. | `gateway/internal/proxy/proxy.go:30-37` | `r.Header.Del(...)` both headers unconditionally *before* conditionally setting them |
| L-2 | Socket `typing` handler doesn't check participation — a user can emit typing into any conversation room, leaking their ID and faking presence. `conversation:join` checks correctly; this one was missed. | `messaging-service/src/sockets/index.js:37` | `await assertParticipant(conversationId, socket.userId)` first |
| L-3 | Socket accepts the JWT via `handshake.query.token`, so the token lands in URLs — chi's `Logger` on the gateway writes it to `logs/`, and any proxy in between logs it too. | `sockets/index.js:6` | Accept `handshake.auth.token` only |
| L-4 | `jwt.verify` doesn't pin `algorithms`. jsonwebtoken ^9.0.2 restricts by key type so **this is not currently forgeable** — listed as hardening, not a live bug. | `messaging-service/src/middleware/auth.js:15`, `sockets/index.js:11` | `algorithms: ['HS256']` |
| L-5 | Exception middleware writes a response without checking `HasStarted` — throws `InvalidOperationException` if the response already began, masking the original error. | `Middleware/ExceptionHandlingMiddleware.cs:22` | Guard on `context.Response.HasStarted` |
| L-6 | `RegisterAsync` reports the requested role even when `AssignRoleAsync` silently no-ops on a missing role row — the API claims a role the user doesn't have. | `AuthenticationService.cs:97, 267` | Throw on missing role instead of returning silently |
| L-7 | Auth user cache (60 s) isn't invalidated on role, status, or email-verification change — a suspended user's cached profile survives the suspension. | `AuthenticationService.cs:206` | Delete `cache:auth:user:{id}` on every mutation, as `WalletService` does |
| L-8 | `GetRecommendation` accepts an unbounded (and negative) `scanLimit` straight from the query string into a Mongo `limit`. | `ai-service/grpc_server.py:148`, `gateway/handlers/ai.go:110` | Clamp to 1..500 |
| L-9 | `Guid.Parse(User.FindFirstValue(...)!)` throws on a malformed `sub` → 500 instead of 401. Repeated in five controllers. | all `CurrentUserId()` helpers | Shared `TryGetUserId` helper returning 401 |
| L-10 | Register's exists-check → insert is a TOCTOU race; concurrent signups produce a unique-violation 500 rather than 409. | `AuthenticationService.cs:65` | Catch `DbUpdateException` on the unique index, map to 409 |
| L-11 | Live Supabase project ref (`the live project ref`), region, and DB username are committed in `.env.example`. No credential — but it identifies the exact instance to attack. | `services/auth-service/.env.example:7` | Replace with `<project-ref>` |
| L-12 | Message `content`, `reaction`, and `attachments` accept unbounded/unvalidated input straight into Mongo documents. | `messages.controller.js:22, 138` | Length caps; whitelist attachment shape |
| L-13 | Stray tracked files: `tempCodeRunnerFile.py`, `python =on`, `_db_smoke_test.py`, `grpc_test.log`, and committed `.pytest_cache/` + `.ruff_cache/` directories. | `services/ai-service/` | Delete; extend `.gitignore` |

---

## What I propose to do, in order

Grouped so each phase is independently reviewable and testable. I'd rather ship phase 1 today than
all five next week.

### Phase 1 — Stop the bleeding *(~30 min, near-zero risk)*
- **C-4**: `ports:` → `expose:` for the five gRPC services in `docker-compose.yml`
- **M-9**: one-line deal cache invalidation
- **M-7**: one-line `deleted_at` filter
- **L-1**: strip inbound identity headers at the gateway
- **L-11**: scrub the project ref

Five small, surgical edits. Phase 1 alone closes the highest-impact exposure in the repo.

### Phase 2 — Authorization in transaction-service *(the real work)*
- **C-1** deal transitions · **C-2** the whole offer flow · **H-1** deal reads
- Pattern: identity flows into the **service layer**, never checked in controllers, so REST and gRPC
  are fixed by one edit each
- **Blocked on your answer about the `buyer_id`/`seller_id` ID space** (see the caveat under C-1)

### Phase 3 — Money correctness
- **C-3** concurrency token + retry + `CHECK` constraint + explicit transactions
- **H-5** double-entry payment, currency matching, payer verification
- Needs your decision on **escrow vs. direct credit** (I recommend escrow)

### Phase 4 — Account security
- **H-3** Google status bypass · **H-4** notification write boundary
- **M-2** input validation + password policy · **M-3** timing · **M-4** lockout
- **M-1** trusted-proxy handling · **M-5** CORS fail-closed

### Phase 5 — Hardening
- **M-6** cookie-based refresh + reuse detection *(touches frontend; separate change)*
- **M-8** pagination · **M-10** RLS decision · all remaining **L-** items

---

## What I need from you

1. **`buyer_id` / `seller_id` — auth-service user IDs, or marketplace-service account IDs?**
   This is the only thing genuinely blocking me. It changes the shape of C-1 and C-2.
2. **Escrow or direct seller credit** for H-5? I'll build escrow by default.
3. **RLS (M-10)** — remove the no-op declarations, or write real policies?
4. **Which phases do you want?** Phase 1 stands alone safely if you want to start there.

One caveat on verification: this repo has **no test suite**, so I've read the code carefully but
haven't been able to execute an exploit to prove any finding end-to-end. Every claim above is traced
to specific lines and I've flagged the two places where a mitigation exists that I couldn't fully
rule out (the `uq_wallet_transaction_deal_id` index under C-3, the jsonwebtoken key-type check under
L-4). If you want proof before fixes, I can write focused failing tests for C-1, C-3, and H-2 first
— that's the honest way to confirm the three worst ones.


---

# Resolution

All findings above are fixed. Every service compiles: three .NET solutions build, both Go modules
build and vet clean, the Node sources parse, the frontend passes `tsc --noEmit`, and the Python
sources compile with no new lint errors (the ai-service lint failures that remain are pre-existing
and identical to the baseline at `HEAD`).

## Answers to the open questions

**1. `buyer_id` / `seller_id` — which id space?** Resolved empirically rather than by assumption:
`frontend/.../VendorRequestsPage.tsx:161-162` sends `buyerId: vendorId` and
`sellerId: listing.ownerCorporateId`, and `EERD.md:165-166` states they are external references to
`VENDOR.vendor_id` / `CORPORATE.corporate_id`. So they are genuinely a **different id space** from
the JWT `sub`, and a direct comparison would never have matched.

This is why the checks were missing rather than merely forgotten: transaction-service had no way to
evaluate them. The fix adds that missing capability —

- `marketplace-service` gained `GET /internal/accounts/{userId}` (which marketplace accounts a user
  owns) and `GET /internal/accounts/owner/{accountId}` (the reverse, needed to pay a seller), both
  behind `[InternalOnly]`.
- `transaction-service` gained `IMarketplaceAccountResolver`, which calls those, caches in Redis for
  2 minutes, and **fails closed** — if ownership cannot be established the request is refused, never
  allowed.
- Every ownership check resolves the caller, then tests membership via `MarketplaceAccounts.Controls`.

**2. Escrow or direct credit?** Escrow, as recommended. `PayForDeal` moves funds out of the buyer's
wallet and holds them; completion releases to the seller (`PAYOUT`), cancellation returns them to the
buyer (`REFUND`). `DealStatus.Disputed` now means something, because the money has not yet moved.

**3. RLS?** Removed the inert declarations (migration `0002`, section 6) and enforced authorization
in the application layer. Maintaining a second authorization system in the database — with no client
connecting directly, and with the marketplace-account mapping unavailable to it — would have been
drift risk without benefit. If direct client access is ever added, RLS should return *with* policies.

**4. Which phases?** All five.

## One finding that wasn't in the original audit

**Messaging gRPC `GetConversation` had the same missing-participation gap as deals.** I found this
while implementing, not while auditing. `services/messaging-service/src/grpc/server.js` looked up a
conversation by id with no participation check, while the REST controller for the same data called
`assertParticipant`. The gateway prefers the gRPC route for `GET /api/conversations/{id}`
(`router.go:113`), so the protected path was the one nobody used. Now fixed the same way as the
transaction-service equivalents.

The lesson generalises, and it is why the transaction-service fixes were written the way they were:
**authorization placed in a controller protects only that controller.** Every check now lives in the
service layer, so REST and gRPC inherit it from one place.

## The architectural change worth knowing about

Closing C-4 needed more than unpublishing ports. All end-user authentication lives in the gateway, so
any reachable backend port bypassed all of it. There is now a **shared mesh credential**
(`INTERNAL_SERVICE_TOKEN` / `Internal__ServiceToken`):

- Every gRPC server (C#, Go, Node, Python) requires it via an interceptor, with
  `grpc.health.v1.Health` exempt so health checks still work, and **fails closed** when unconfigured.
- Every gRPC client attaches it.
- `POST /api/notifications` and marketplace's `/internal/*` require it over REST.
- Backends read the acting user from `x-user-id` metadata, which is only trustworthy *because* the
  token check has already established the caller is the gateway.

It is a bearer secret, not mTLS: it assumes the mesh network is not itself hostile. That is a real
limitation and the right next hardening step, but it closes the hole that was open.

## Two things you must do before this runs

1. **Generate the shared secret** and set it identically in all seven `.env` files
   (`openssl rand -base64 32`). Services fail closed without it — gRPC calls will return
   `Unauthenticated` rather than silently allowing anything. `run-services.sh` warns if
   `gateway/.env` still holds the placeholder.
2. **Apply the migration** `services/transaction-service/db/migrations/0002_wallet_integrity_and_escrow.sql`.
   The `xmin` concurrency token needs no schema change, but the `CHECK (balance >= 0)` constraint and
   the partial unique indexes that make escrow representable do.

## Breaking API changes

Endpoints that took an account id in the URL are replaced by caller-scoped ones; the frontend is
already updated to match.

| Removed | Replacement |
|---|---|
| `GET /api/deals/party/{partyId}` | `GET /api/deals/mine` |
| `GET /api/offers/buyer/{buyerId}` | `GET /api/offers/mine?role=BUYER` |
| `GET /api/offers/seller/{sellerId}` | `GET /api/offers/mine?role=SELLER` |
| `POST /api/offers` with `buyerId` in the body | `buyerId` removed — derived from the caller |
| `POST /api/notifications` (user token) | internal-only; users read and mark read |

`GET /api/wallets/me/transactions`, `GET /api/listings`, and `GET /api/listings/mine` now paginate
(`?page=&pageSize=`, max 100), so a client that relied on receiving every row at once will need to page.

## What I could not verify

Per `CLAUDE.md` this repo has no test framework and I did not add one. So these fixes are verified by
**compilation and code review, not by execution** — I have not run the services against a live
database or Redis, and the migration has not been applied anywhere. The reasoning behind each change
is in the code comments at the point of change.

The three highest-risk fixes to exercise first, because they are the ones where behaviour (not just
access) changed:

1. **The escrow lifecycle** — pay for a deal, complete it, confirm the seller is credited and the
   ledger balances. Then cancel a paid deal and confirm the buyer is refunded.
2. **Concurrent withdrawals** — fire several simultaneous full-balance withdrawals at one wallet and
   confirm exactly one succeeds and the balance never goes negative.
3. **The account resolver** — confirm a user with a vendor profile can act on their own deals, and
   that marketplace-service being unreachable produces a clean `503` rather than an open door.
