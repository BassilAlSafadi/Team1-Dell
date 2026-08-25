# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Circular economy marketplace, built as a polyglot microservices monorepo. Most of the intended
structure is scaffolding only — **only two services have real code**:

- `services/ai-service/` — **Python**, no web framework (not an HTTP service). Standalone
  CLI/module scripts: a RAG chatbot, a waste image classifier, waste recommendations, vendor
  search.
- `services/auth-service/` — **C# / ASP.NET Core 9.0** Web API. Clean Architecture split across
  `AuthService.Api`, `AuthService.Domain`, `AuthService.Infrastructure` (see `AuthService.sln`).
  Handles register/login/JWT/Google sign-in/email verification/password reset.

Everything else — `services/marketplace-service/`, `services/messaging-service/`,
`services/notification-service/`, `services/review-service/`, `services/social-service/`,
`services/transaction-service/`, `frontend/`, `gateway/` — is an **empty, not-yet-scaffolded
directory** with no code (`services/transaction-service/` has a design doc,
`services/transaction-service/EERD.md`, but no implementation yet). There's no established
convention for how these should be built; decide the stack/pattern per the requirements given at
the time rather than assuming they should mirror ai-service or auth-service. Per
`Artifacts/circular-economy-marketplace-eerds.pdf`, the intended stack for transaction-service is
.NET/PostgreSQL, same as auth-service.

No README exists at the repo root. No CI (`.github/workflows/`) exists.

`Artifacts/circular-economy-marketplace-eerds.pdf` is the system-wide database design doc:
EERDs for all four planned PostgreSQL databases (Auth, Marketplace, Transaction, Review) plus the
MongoDB document models for Messaging/Social/Notification/AI services, and the governing rules
(database-per-service, no cross-database foreign keys, cross-service references are plain
external IDs never FKs). Consult it before designing schema for any service — new per-service
EERD docs (e.g. `services/transaction-service/EERD.md`) should extend it rather than duplicate or
contradict it.

## Running / building

**ai-service** (from `services/ai-service/`, after `pip install -r requirements.txt`):
- `python -m chatbot.chat` — interactive RAG chatbot CLI
- `python -m chatbot.ingest [--force]` — builds the Chroma vector store from PDFs in
  `data/source_pdfs/` (gitignored, must be placed manually first — see Gotchas)
- `python waste_classifier.py` — image classifier demo (currently hardcoded to a test image path)
- `python waste_recommendations.py` — recommendations demo using mock data
- `python vendor_search.py` — vendor search demo
- Docker: `docker build` then `docker run --env-file .env -v ./data:/app/data ai-service`
  (default CMD is `python -m chatbot.chat`; the `data/` dir is a declared volume, not baked in)

**auth-service** (from `services/auth-service/`):
- `dotnet restore`, `dotnet build`, `dotnet run --project src/AuthService.Api`
- Docker: multi-stage build (SDK → aspnet runtime), listens on `ASPNETCORE_URLS=http://+:8080`

No `docker-compose.yml` exists yet — the two services are not wired together.

## Environment variables

Each implemented service has a `.env.example` template — copy it to `.env` in that service's
directory rather than guessing variable names:
- `services/ai-service/.env.example` — Gemini API key/model, HuggingFace token, embedding model,
  chunk size/overlap, MongoDB Atlas URI
- `services/auth-service/.env.example` — Postgres connection string (Supabase), JWT
  issuer/audience/signing key, Google client ID, SMTP settings, email verification settings

## Testing / CI / linting

No test framework or CI (`.github/workflows/`) exists — don't proactively suggest adding them,
only set them up if explicitly asked.

Linting is configured:
- **ai-service**: `ruff.toml` (Python 3.11 target, line-length 100). Install with
  `pip install -r requirements-dev.txt`, run with `python -m ruff check .` from
  `services/ai-service/`. `tempCodeRunnerFile.py` and `python=on` are excluded (see Gotchas).
- **auth-service**: `Directory.Build.props` at `services/auth-service/` enables .NET analyzers
  (`EnableNETAnalyzers`, `AnalysisLevel=latest-recommended`) for all three projects. Runs
  automatically on `dotnet build`.
- A root `.editorconfig` sets basic style (indent, line endings) for Python, C#, JSON/YAML, and
  Markdown.

## Commit / branch style

Match the existing free-form style: short descriptive commit messages, feature-named branches
(e.g. `Transactions`, `AI-Features-Wireframe-and-Auth`). No Conventional Commits prefix in use.

## Gotchas

- **Model name mismatch**: `chatbot/config.py` reads `GEMINI_CHAT_MODEL` from env (default
  `gemini-3.5-flash`), but `waste_classifier.py` and `waste_recommendations.py` each hardcode
  `MODEL_NAME = "gemini-3.6-flash"` directly, ignoring the env var. Check both places when
  changing the model.
- **RAG ingestion is a manual prerequisite**: `chatbot/chat.py` exits with an error if
  `data/vector_store/` is empty. Two source PDFs must be placed in `data/source_pdfs/` (gitignored,
  not shipped) before running `python -m chatbot.ingest`. One PDF (Arabic-language) needs
  per-page Gemini-vision OCR, cached to `data/ocr_cache/`, because standard text extraction
  produces mojibake on its font — ingestion can be slow/costly on first run.
- **Guardrail is prompt-only**: despite a commit titled "Adding Guardrails", the only chatbot
  safety mechanism is one instruction inside `SYSTEM_PROMPT` in `chatbot/agent.py` telling the
  model to refuse illegal/unsafe requests — there's no moderation API or code-level filter.
- **auth-service schema is incomplete in-repo**: `db/migrations/` only has
  `0001_create_email_verification.sql` and `0002_seed_roles_and_permissions.sql`, but `0001`
  references `auth_db.users` and other tables with no corresponding `CREATE TABLE` migration
  checked in. Don't assume the full schema is reconstructable from `db/migrations/` alone.
- **Supabase pooler required**: the auth-service connection string must use the Supavisor
  session-mode pooler host, not `db.<ref>.supabase.co` directly — the direct host is IPv6-only
  and most dev/CI environments lack an IPv6 route.
- **Stray tracked files** in `services/ai-service/`: `tempCodeRunnerFile.py`, `python =on` (an
  empty accidental-redirect artifact), and `_db_smoke_test.py` (a manual script whose own
  docstring says "deleted after use" but is still committed) are not real modules.
- `.claude/skills/` and `.agents/skills/` both vendor the same third-party `supabase/agent-skills`
  content — if editing one, mirror the change in the other to avoid desync.
