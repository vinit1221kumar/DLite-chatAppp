from __future__ import annotations

from typing import Dict, Optional

import httpx
import jwt

from src.modules.auth.config import AUTH_JWT_SECRET, SUPABASE_URL, is_supabase_configured


def claims_user_id(claims: Optional[dict]) -> Optional[str]:
    if not isinstance(claims, dict):
        return None
    uid = claims.get("id") or claims.get("sub") or claims.get("user_id") or claims.get("userId")
    return str(uid).strip() if uid else None


def supabase_headers(api_key: str, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    headers = {
        "apikey": api_key,
        "authorization": f"Bearer {api_key}",
    }
    if extra:
        headers.update(extra)
    return headers


async def validate_token(token: str, *, supabase_api_key: Optional[str] = None) -> Optional[dict]:
    if not token:
        return None

    if not is_supabase_configured():
        try:
            return jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"])
        except Exception:
            return None

    if not SUPABASE_URL or not supabase_api_key:
        # Supabase is configured but no key provided; fall back to local JWT only.
        try:
            return jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"])
        except Exception:
            return None

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url, headers=supabase_headers(supabase_api_key, {"authorization": f"Bearer {token}"}))

    if r.status_code >= 400:
        try:
            return jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"])
        except Exception:
            return None

    try:
        parsed = r.json()
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None

