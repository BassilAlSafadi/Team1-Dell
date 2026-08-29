"""Shared Gemini API key + model fallback handling for every Gemini call site in this
service (waste_classifier.py, waste_recommendations.py, the chatbot).

Two independent fallback axes, tried together via call_with_gemini_fallback():
- MODEL_FALLBACK_CHAIN: gemini-3.6-flash -> gemini-3.5-flash -> gemini-3.1-pro ->
  gemini-3.1-flash-lite -> gemini-2.5-flash, advanced on a "this model is
  unavailable/overloaded/quota-exhausted right now" error (a different model could
  still work — Gemini's free-tier quota is scoped per model, not per key, so this is
  also where a 429/RESOURCE_EXHAUSTED belongs).
- API_KEYS: GEMINI_API_KEY (always the first go-to) then GEMINI_API_KEY_FALLBACK,
  GEMINI_API_KEY_FALLBACK_2, _3, ... in that order, advanced only on an error about the
  key itself (invalid/unauthorized) — a quota error doesn't imply the key is bad, so it
  stays on the model axis instead of skipping straight to a different key."""

import os

from dotenv import load_dotenv

load_dotenv()

# Max GEMINI_API_KEY_FALLBACK_<n> suffix to look for (n from 2 upward).
_MAX_FALLBACK_KEYS = 10


def _clean_key(value: str | None) -> str | None:
    value = (value or "").strip()
    if not value or value == "CHANGE_ME":
        return None
    return value


def _collect_api_keys() -> list[str]:
    """Every configured Gemini key, best first: GEMINI_API_KEY, then
    GEMINI_API_KEY_FALLBACK and GEMINI_API_KEY_FALLBACK_2.._N. Deduped, first position
    wins."""
    primary = _clean_key(os.getenv("GEMINI_API_KEY"))
    if not primary:
        raise ValueError("GEMINI_API_KEY not found in .env")

    ordered = [primary]
    fallback = _clean_key(os.getenv("GEMINI_API_KEY_FALLBACK"))
    if fallback:
        ordered.append(fallback)
    for i in range(2, _MAX_FALLBACK_KEYS + 1):
        extra = _clean_key(os.getenv(f"GEMINI_API_KEY_FALLBACK_{i}"))
        if extra:
            ordered.append(extra)

    return list(dict.fromkeys(ordered))


API_KEYS = _collect_api_keys()

# Back-compat single-name exports (chatbot/config.py re-exports these).
PRIMARY_API_KEY = API_KEYS[0]
FALLBACK_API_KEY = API_KEYS[1] if len(API_KEYS) > 1 else None

MODEL_FALLBACK_CHAIN = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-pro",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
]


def is_retryable_key_error(exc: Exception) -> bool:
    """True for errors that are about the key itself (invalid/unauthorized) — a
    different key could plausibly fix these, but a different model on the same key
    would not, so these skip straight to the next key rather than cycling models
    first."""
    text = str(exc).lower()
    return any(
        marker in text
        for marker in (
            "permission_denied",
            "unauthenticated",
            "api key not valid",
            "api_key_invalid",
        )
    )


def is_retryable_model_error(exc: Exception) -> bool:
    """True for errors suggesting this specific model is unavailable/overloaded/quota-
    exhausted right now — a different model in the chain could still work. Gemini's free
    tier quota (seen in the API's own error as
    GenerateRequestsPerDayPerProjectPerModel-FreeTier) is scoped per model, not per
    key/project, so a 429/RESOURCE_EXHAUSTED here belongs in the model axis: the same key
    against the next model in the chain has its own separate quota bucket and will very
    likely succeed immediately, whereas jumping straight to a different key (or raising,
    if there's only one key) wastes the fallback the moment the first model's quota is
    hit."""
    text = str(exc).lower()
    return any(
        marker in text
        for marker in (
            "503",
            "unavailable",
            "overloaded",
            "not found",
            "not_found",
            "internal error",
            "model_not_found",
            "429",
            "resource_exhausted",
            "quota",
            "rate limit",
        )
    )


def is_retryable_gemini_error(exc: Exception) -> bool:
    """True if either fallback axis could plausibly help — used as the top-level "is
    this worth retrying at all" gate. Not for errors that would fail identically no
    matter which key or model is used (bad request shape, network/timeout issues)."""
    return is_retryable_key_error(exc) or is_retryable_model_error(exc)


def call_with_gemini_fallback(build_and_call):
    """build_and_call(model: str, api_key: str) -> T — (re)builds whatever client(s) are
    needed for this attempt and performs the actual Gemini call, raising on failure.

    Tries MODEL_FALLBACK_CHAIN x API_KEYS in priority order, model-major: every
    non-exhausted key is tried against gemini-3.6-flash before moving to
    gemini-3.5-flash, and so on. A key that fails with an auth-type error (invalid/
    unauthorized) is marked exhausted and skipped for every remaining model (retrying a
    dead key against a different model wastes a call — the key is the problem, not the
    model). A quota/overload/unavailable error instead advances to the next model on the
    *same* key, since Gemini's free-tier quota is scoped per model. Raises the last
    exception once nothing left is worth trying, or immediately for any error that isn't
    a recognized key/model-type failure at all.
    """
    keys = list(API_KEYS)
    last_exc: Exception | None = None
    key_idx = 0

    # Key is the outer axis: cycle the *entire* model chain on the current key first
    # (a model-type error, including a per-model quota hit, just advances to the next
    # model, same key — it isn't key-specific, so switching keys on it wouldn't help).
    # Only once every model has failed on this key do we move to the next key and start
    # the model chain over from the top — an auth error on the *first* model of a key
    # jumps straight there (via the inner `break`) rather than burning through every
    # model on a key that's already known to be bad.
    while key_idx < len(keys):
        key = keys[key_idx]

        for model in MODEL_FALLBACK_CHAIN:
            try:
                return build_and_call(model, key)
            except Exception as exc:
                last_exc = exc
                if is_retryable_key_error(exc):
                    key_idx += 1
                    break
                if is_retryable_model_error(exc):
                    continue
                raise  # not a recognized retryable condition — don't waste more attempts
        else:
            # Every model in the chain failed with a model-type error on this key —
            # move on to the next key and retry the whole chain with it.
            key_idx += 1

    raise last_exc
