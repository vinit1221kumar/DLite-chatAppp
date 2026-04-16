from __future__ import annotations

from src.utils.env import env, looks_placeholder

PORT = int(env("PORT", "4000") or "4000")

SUPABASE_URL = env("SUPABASE_URL")
SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY")

_DEFAULT_JWT_SECRET = "dev-only-secret-change-me"
AUTH_JWT_SECRET = env("AUTH_JWT_SECRET") or env("JWT_SECRET") or _DEFAULT_JWT_SECRET
AUTH_MODE = (env("AUTH_MODE") or "auto").strip().lower()

if AUTH_MODE != "local" and AUTH_JWT_SECRET == _DEFAULT_JWT_SECRET:
    # Avoid silently running with a guessable JWT secret in production-like mode.
    raise RuntimeError("AUTH_JWT_SECRET (or JWT_SECRET) must be set when AUTH_MODE is not 'local'")


def is_supabase_configured() -> bool:
    # AUTH_MODE:
    # - "auto" (default): use Supabase if configured, otherwise local auth fallback
    # - "local": force local auth (bypass Supabase) — useful when Supabase rate limits block signups
    if AUTH_MODE == "local":
        return False
    # Supabase auth endpoints (/auth/v1/...) rely on the anon/public key.
    # Service role is optional for some server-side DB operations, so we don't
    # require it for deciding whether Supabase auth is usable.
    return not looks_placeholder(SUPABASE_URL) and not looks_placeholder(SUPABASE_ANON_KEY)

