from __future__ import annotations

import os


def _env(name: str, default: str | None = None) -> str | None:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v else default


SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_ANON_KEY = _env("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = _env("SUPABASE_SERVICE_ROLE_KEY")

# Chat media uploads (Cloudinary). Server-side only; never expose API secret to clients.
CLOUDINARY_CLOUD_NAME = _env("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = _env("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = _env("CLOUDINARY_API_SECRET")


def require_supabase() -> None:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")

