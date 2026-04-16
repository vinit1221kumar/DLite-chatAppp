from __future__ import annotations

import asyncio
import logging
import json
import os
import re
from email.utils import parseaddr
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from src.modules.auth.config import (
    AUTH_JWT_SECRET,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
    is_supabase_configured,
)
from src.utils.env import env, looks_placeholder

router = APIRouter()
logger = logging.getLogger(__name__)


@dataclass
class LocalUser:
    id: str
    email: str
    username: Optional[str]
    password_hash: str


_local_users_by_email: Dict[str, LocalUser] = {}
_local_users_by_username: Dict[str, LocalUser] = {}

_MIN_PASSWORD_LENGTH = 6
_LOCAL_AUTH_STATE_FILE = env("LOCAL_AUTH_STATE_FILE", "data/local_users.json") or "data/local_users.json"
_LOCAL_AUTH_PERSISTENCE = (env("LOCAL_AUTH_PERSISTENCE", "file") or "file").strip().lower()
_LOCAL_AUTH_SUPABASE_TABLE = (env("LOCAL_AUTH_SUPABASE_TABLE", "local_users") or "local_users").strip()
_LOCAL_AUTH_PERSIST_FILE = _LOCAL_AUTH_PERSISTENCE in ("file", "both")
_LOCAL_AUTH_PERSIST_SUPABASE = _LOCAL_AUTH_PERSISTENCE in ("supabase", "both")
_local_user_store_lock = asyncio.Lock()


def _serialize_local_user(user: LocalUser) -> Dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "password_hash": user.password_hash,
    }


def _deserialize_local_user(data: Dict[str, Any]) -> Optional[LocalUser]:
    try:
        return LocalUser(
            id=str(data.get("id") or ""),
            email=str(data.get("email") or ""),
            username=data.get("username"),
            password_hash=str(data.get("password_hash") or ""),
        )
    except Exception:
        return None


def _load_local_users_from_file() -> None:
    state_path = Path(_LOCAL_AUTH_STATE_FILE)
    if not state_path.exists():
        return

    try:
        raw = json.loads(state_path.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("Failed to load local auth state; starting empty")
        return

    users_obj: Any = raw.get("users") if isinstance(raw, dict) else None
    if not users_obj:
        return

    if isinstance(users_obj, dict):
        items = users_obj.items()
    elif isinstance(users_obj, list):
        items = [(u.get("email"), u) for u in users_obj if isinstance(u, dict)]
    else:
        return

    for key_email, user_data in items:
        if not isinstance(user_data, dict):
            continue
        user = _deserialize_local_user(user_data)
        if not user or not user.email or not user.id or not user.password_hash:
            continue
        email = str(user.email).strip().lower()
        # Trust the embedded email, but normalize it for consistent lookups.
        user.email = email
        _local_users_by_email[email] = user
        if user.username:
            _local_users_by_username[str(user.username).lower()] = user


async def _persist_local_users_to_file() -> None:
    async with _local_user_store_lock:
        state_path = Path(_LOCAL_AUTH_STATE_FILE)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        snapshot = {"version": 1, "users": {email: _serialize_local_user(user) for email, user in _local_users_by_email.items()}}
        tmp_path = state_path.with_suffix(state_path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
        os.replace(tmp_path, state_path)


if _LOCAL_AUTH_PERSIST_FILE:
    _load_local_users_from_file()


def _is_valid_email(email: str) -> bool:
    # Keep it intentionally simple: reject obviously invalid values.
    e = (email or "").strip().lower()
    if not e or " " in e or "@" not in e:
        return False
    # parseaddr is tolerant; we additionally enforce that it doesn't change the input.
    _, addr = parseaddr(e)
    if addr != e:
        return False
    # Require a dot in the domain part.
    parts = e.split("@", 1)
    if len(parts) != 2:
        return False
    domain = parts[1]
    return "." in domain and not domain.startswith(".") and not domain.endswith(".")


def _normalize_username(username: Any) -> Optional[str]:
    if username is None:
        return None
    s = str(username).strip()
    if not s:
        return None
    # Disallow whitespace and weird characters to avoid duplicates and DB issues.
    if any(ch.isspace() for ch in s):
        return None
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,30}", s):
        return None
    return s


def _validate_signup_or_login_fields(*, email: str, password: str, username: Optional[str] = None) -> None:
    if not _is_valid_email(email):
        raise HTTPException(status_code=400, detail="Invalid email")
    if not password or len(password) < _MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {_MIN_PASSWORD_LENGTH} characters")
    if username is not None and not username:
        raise HTTPException(status_code=400, detail="Invalid username")


def _hash_password(password: str) -> str:
    pw = password.encode("utf-8")
    hashed = bcrypt.hashpw(pw, bcrypt.gensalt(rounds=10))
    return hashed.decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def _issue_local_tokens(user: LocalUser) -> Dict[str, Any]:
    now = int(time.time())
    expires_in = 3600
    payload = {
        "sub": user.id,
        "email": user.email,
        "user_metadata": {"username": user.username},
        "iss": "d-lite-core-backend",
        "iat": now,
    }
    access_token = jwt.encode({**payload, "exp": now + expires_in}, AUTH_JWT_SECRET, algorithm="HS256")
    refresh_token = jwt.encode(
        {**payload, "typ": "refresh", "exp": now + 60 * 60 * 24 * 30},
        AUTH_JWT_SECRET,
        algorithm="HS256",
    )
    return {
        "session": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": expires_in,
            "token_type": "bearer",
        },
        "user": {
            "id": user.id,
            "email": user.email,
            "user_metadata": {"username": user.username},
        },
    }


def _format_auth_response(auth_data: Dict[str, Any]) -> Dict[str, Any]:
    data = auth_data or {}
    # Local auth stores tokens under `session`.
    session = data.get("session") or {}
    user = data.get("user")

    # Supabase GoTrue responses include token fields at the top-level, not inside `session`.
    access_token = session.get("access_token") or data.get("access_token")
    refresh_token = session.get("refresh_token") or data.get("refresh_token")
    expires_in = session.get("expires_in") or data.get("expires_in")
    token_type = session.get("token_type") or data.get("token_type")
    return {
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "expiresIn": expires_in,
        "tokenType": token_type,
        "user": user,
    }


def _supabase_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    # GoTrue auth endpoints use `apikey`; `Authorization` should only be
    # provided when we actually have a user JWT access token.
    headers = {
        "apikey": SUPABASE_ANON_KEY or "",
        "content-type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def _supabase_db_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    # For PostgREST access, prefer service role key (bypasses RLS). Fallback to anon if needed.
    key = (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY or "").strip()
    headers = {
        "apikey": key,
        "authorization": f"Bearer {key}",
        "content-type": "application/json",
        "prefer": "return=representation,resolution=merge-duplicates",
    }
    if extra:
        headers.update(extra)
    return headers


async def _ensure_user_profile_row(*, user_id: str, email: str, username: Optional[str]) -> None:
    # Keep public.users in sync for chat/user search features.
    if looks_placeholder(SUPABASE_URL) or (
        looks_placeholder(SUPABASE_ANON_KEY) and looks_placeholder(SUPABASE_SERVICE_ROLE_KEY)
    ):
        return
    if not user_id or not email or not username:
        return
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/users"
    payload = {"id": user_id, "email": email, "username": username}
    last_err: Optional[BaseException] = None
    # Supabase upserts can intermittently fail due to networking/transient errors.
    for attempt in range(1, 4):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(
                    url,
                    headers=_supabase_db_headers({"prefer": "resolution=merge-duplicates,return=minimal"}),
                    json=payload,
                )
            if r.status_code >= 400:
                # Avoid dumping response body; just log status.
                raise RuntimeError(f"Supabase profile upsert failed ({r.status_code})")
            return
        except (httpx.TimeoutException, httpx.HTTPError) as e:
            last_err = e
            logger.warning(
                "Supabase profile upsert failed (attempt retryable)",
                extra={"attempt": attempt, "email": email, "username": username},
            )
        except Exception as e:
            last_err = e
            logger.warning(
                "Supabase profile upsert failed (attempt non-retryable)",
                extra={"attempt": attempt, "email": email, "username": username},
            )
        if attempt < 3:
            await asyncio.sleep(0.5 * (2 ** (attempt - 1)))

    # Let caller decide whether it's fatal; callers currently log and proceed.
    raise RuntimeError("Supabase profile upsert failed after retries") from last_err


def _extract_user_identity(auth_json: Dict[str, Any]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Extract (user_id, email, username) from Supabase auth payloads.

    Supabase responses vary (signup returns {user, session?}; login returns tokens).
    For login we may need a follow-up /auth/v1/user call, so this helper only extracts
    what is already present.
    """
    data = auth_json or {}
    user = data.get("user") or {}
    user_id = user.get("id")
    email = user.get("email")
    meta = user.get("user_metadata") or {}
    username = meta.get("username")
    return user_id, email, username


def _safe_json_dict(r: httpx.Response) -> Dict[str, Any]:
    """
    Supabase (or proxies) can sometimes return empty/non-JSON bodies.
    This helper prevents hard crashes when calling `response.json()`.
    """
    try:
        parsed = r.json()
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _safe_json_list(r: httpx.Response) -> list:
    """
    Supabase (or proxies) can sometimes return empty/non-JSON bodies.
    This helper prevents hard crashes when calling `response.json()` for lists.
    """
    try:
        parsed = r.json()
    except Exception:
        return []
    return parsed if isinstance(parsed, list) else []


def _supabase_service_role_available() -> bool:
    return not looks_placeholder(SUPABASE_SERVICE_ROLE_KEY)


async def _load_local_users_from_supabase() -> None:
    """
    Load local fallback users from Supabase into the in-memory indexes.
    This is only intended for the AUTH_MODE=local fallback path.
    """
    if not _LOCAL_AUTH_PERSIST_SUPABASE:
        return
    if looks_placeholder(SUPABASE_URL) or not _supabase_service_role_available():
        logger.warning(
            "Supabase local auth persistence enabled but service role/URL not configured; skipping",
        )
        return

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{_LOCAL_AUTH_SUPABASE_TABLE}"
    params = {"select": "id,email,username,password_hash"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url, headers=_supabase_db_headers(), params=params)

    if r.status_code >= 400:
        logger.warning(
            "Failed to load local auth users from Supabase; skipping",
            extra={"status_code": r.status_code},
        )
        return

    for row in _safe_json_list(r):
        if not isinstance(row, dict):
            continue
        email = str(row.get("email") or "").strip().lower()
        user_id = str(row.get("id") or "").strip()
        username = row.get("username")
        password_hash = str(row.get("password_hash") or "")
        if not email or not user_id or not password_hash:
            continue
        user = LocalUser(id=user_id, email=email, username=str(username).strip() if username is not None else None, password_hash=password_hash)
        _local_users_by_email[email] = user
        if user.username:
            _local_users_by_username[user.username.lower()] = user


async def _persist_local_user_to_supabase(*, user: LocalUser) -> None:
    if not _LOCAL_AUTH_PERSIST_SUPABASE:
        return
    if looks_placeholder(SUPABASE_URL) or not _supabase_service_role_available():
        return

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{_LOCAL_AUTH_SUPABASE_TABLE}"
    payload = {"id": user.id, "email": user.email, "username": user.username, "password_hash": user.password_hash}

    last_err: Optional[BaseException] = None
    for attempt in range(1, 4):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(
                    url,
                    headers=_supabase_db_headers({"prefer": "resolution=merge-duplicates,return=minimal"}),
                    json=payload,
                )
            if r.status_code >= 400:
                raise RuntimeError(f"Supabase local_users upsert failed ({r.status_code})")
            return
        except (httpx.TimeoutException, httpx.HTTPError) as e:
            last_err = e
            logger.warning(
                "Supabase local_users upsert failed (attempt retryable)",
                extra={"attempt": attempt, "email": user.email},
            )
        except Exception as e:
            last_err = e
            logger.warning(
                "Supabase local_users upsert failed (attempt non-retryable)",
                extra={"attempt": attempt, "email": user.email},
            )
        if attempt < 3:
            await asyncio.sleep(0.5 * (2 ** (attempt - 1)))

    raise RuntimeError("Supabase local_users upsert failed after retries") from last_err


async def init_local_user_persistence() -> None:
    """
    Called by FastAPI startup to initialize local fallback users from the chosen persistence backends.
    """
    await _load_local_users_from_supabase()


async def _fetch_supabase_user(*, access_token: str) -> Optional[Dict[str, Any]]:
    if not access_token or looks_placeholder(SUPABASE_URL) or looks_placeholder(SUPABASE_ANON_KEY):
        return None
    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url, headers=_supabase_headers({"authorization": f"Bearer {access_token}"}))
    if r.status_code >= 400:
        return None
    return _safe_json_dict(r) or None


@router.post("/signup")
async def signup(req: Request):
    body = await req.json()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    raw_username = body.get("username")
    username_norm = _normalize_username(raw_username)
    if raw_username is not None and username_norm is None:
        raise HTTPException(status_code=400, detail="Invalid username")
    _validate_signup_or_login_fields(email=email, password=password, username=username_norm)

    if not is_supabase_configured():
        if email in _local_users_by_email:
            return JSONResponse(status_code=409, content={"success": False, "message": "User already registered"})
        if username_norm and username_norm.lower() in _local_users_by_username:
            return JSONResponse(status_code=409, content={"success": False, "message": "Username already taken"})

        user = LocalUser(
            id=str(uuid.uuid4()),
            email=email,
            username=username_norm,
            password_hash=_hash_password(password),
        )
        _local_users_by_email[email] = user
        if username_norm:
            _local_users_by_username[username_norm.lower()] = user
        if _LOCAL_AUTH_PERSIST_FILE:
            try:
                await _persist_local_users_to_file()
            except Exception:
                # Non-fatal: signup/login can still work, but users may be lost on restart.
                logger.exception(
                    "Failed to persist local auth state",
                    extra={"email": email, "username": username_norm},
                )
        if _LOCAL_AUTH_PERSIST_SUPABASE:
            try:
                await _persist_local_user_to_supabase(user=user)
            except Exception:
                # Non-fatal: local signup still works, but Supabase-backed persistence won't.
                logger.exception(
                    "Failed to persist local auth user to Supabase",
                    extra={"email": email, "username": username_norm},
                )

        try:
            await _ensure_user_profile_row(user_id=user.id, email=user.email, username=user.username)
        except Exception:
            # Non-fatal: signup/login should still succeed for local fallback.
            logger.exception(
                "Failed to ensure local user profile row",
                extra={"email": email, "username": username_norm},
            )

        auth_data = _issue_local_tokens(user)
        return JSONResponse(
            status_code=201,
            content={"success": True, "message": "Signup successful", "data": _format_auth_response(auth_data)},
        )

    payload: Dict[str, Any] = {"email": email, "password": password}
    if username_norm:
        payload["data"] = {"username": username_norm}

    if looks_placeholder(SUPABASE_URL) or looks_placeholder(SUPABASE_ANON_KEY):
        return JSONResponse(status_code=503, content={"success": False, "message": "Auth provider is not configured"})

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/signup"
    timeout = httpx.Timeout(connect=5.0, read=30.0, write=30.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.post(url, headers=_supabase_headers(), json=payload)
        except httpx.HTTPError:
            # Do not fall back to local signup when Supabase mode is enabled.
            # Otherwise users can end up in public.users without auth.users entry,
            # causing "signup works but login fails" in production.
            return JSONResponse(
                status_code=503,
                content={"success": False, "message": "Auth provider is unreachable. Please try again."},
            )

    if r.status_code >= 400:
        err_json: Dict[str, Any] = {}
        if r.headers.get("content-type", "").startswith("application/json"):
            err_json = _safe_json_dict(r)
        msg = (
            err_json.get("msg")
            or err_json.get("error_description")
            or err_json.get("error")
            or err_json.get("message")
        )
        msg_text = (msg or r.text or "Signup failed") or "Signup failed"

        status_code = r.status_code if r.status_code in (400, 401, 403, 409, 422, 429) else 400
        return JSONResponse(status_code=status_code, content={"success": False, "message": msg_text})

    # Ensure the profile row exists so chat user-search works.
    try:
        auth_json = _safe_json_dict(r) or {}
        user_id, sb_email, sb_username = _extract_user_identity(auth_json)
        # Prefer explicit signup username (if provided).
        await _ensure_user_profile_row(user_id=user_id or "", email=(sb_email or email), username=(username_norm or sb_username))
    except Exception:
        logger.exception(
            "Failed to ensure Supabase user profile row after signup",
            extra={"email": email, "username": username_norm},
        )

    return JSONResponse(
        status_code=201,
        content={"success": True, "message": "Signup successful", "data": _format_auth_response(_safe_json_dict(r))},
    )


@router.post("/login")
async def login(req: Request):
    body = await req.json()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    _validate_signup_or_login_fields(email=email, password=password)

    if not is_supabase_configured():
        user = _local_users_by_email.get(email)
        if not user or not _verify_password(password, user.password_hash):
            return JSONResponse(status_code=401, content={"success": False, "message": "Invalid email or password"})
        auth_data = _issue_local_tokens(user)
        return JSONResponse(
            status_code=200,
            content={"success": True, "message": "Login successful", "data": _format_auth_response(auth_data)},
        )

    if looks_placeholder(SUPABASE_URL) or looks_placeholder(SUPABASE_ANON_KEY):
        return JSONResponse(status_code=503, content={"success": False, "message": "Auth provider is not configured"})

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/token?grant_type=password"
    timeout = httpx.Timeout(connect=5.0, read=30.0, write=30.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.post(url, headers=_supabase_headers(), json={"email": email, "password": password})
        except httpx.HTTPError:
            return JSONResponse(
                status_code=503,
                content={"success": False, "message": "Auth provider is unreachable. Please try again."},
            )

    if r.status_code >= 400:
        err_json: Dict[str, Any] = {}
        if r.headers.get("content-type", "").startswith("application/json"):
            err_json = _safe_json_dict(r)
        msg = (
            err_json.get("msg")
            or err_json.get("error_description")
            or err_json.get("error")
            or err_json.get("message")
        )
        msg_text = (msg or r.text or "Invalid email or password") or "Invalid email or password"

        # Preserve provider status/message so frontend can show exact reason
        # (e.g. email not confirmed vs invalid credentials).
        status_code = r.status_code if r.status_code in (400, 401, 403, 429) else 401
        return JSONResponse(status_code=status_code, content={"success": False, "message": msg_text})

    # Ensure the profile row exists so chat user-search works (covers existing accounts too).
    try:
        auth_json = _safe_json_dict(r) or {}
        access_token = (auth_json.get("access_token") or (auth_json.get("session") or {}).get("access_token") or "").strip()
        sb_user = await _fetch_supabase_user(access_token=access_token)
        if sb_user:
            user_id = sb_user.get("id") or ""
            sb_email = sb_user.get("email") or ""
            sb_username = ((sb_user.get("user_metadata") or {}).get("username") or "").strip() or None
            if user_id and sb_email and sb_username:
                await _ensure_user_profile_row(user_id=user_id, email=sb_email, username=sb_username)
    except Exception:
        logger.exception(
            "Failed to ensure Supabase user profile row after login",
            extra={"email": email},
        )

    return JSONResponse(
        status_code=200,
        content={"success": True, "message": "Login successful", "data": _format_auth_response(_safe_json_dict(r))},
    )


@router.post("/otp/request")
async def otp_request(req: Request):
    if not is_supabase_configured():
        return JSONResponse(status_code=503, content={"success": False, "message": "OTP is unavailable (Supabase not configured)"})

    body = await req.json()
    email = str(body.get("email") or "").strip()
    redirect_to = body.get("redirectTo")
    email_norm = str(email).strip().lower()
    if not _is_valid_email(email_norm):
        return JSONResponse(status_code=400, content={"success": False, "message": "Invalid email"})

    payload: Dict[str, Any] = {"email": email_norm, "create_user": False}
    if redirect_to:
        payload["redirect_to"] = redirect_to

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/otp"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, headers=_supabase_headers(), json=payload)
    if r.status_code >= 400:
        return JSONResponse(status_code=400, content={"success": False, "message": "OTP request failed"})
    return {"success": True, "message": "OTP sent to your email", "data": {"ok": True}}


@router.post("/otp/verify")
async def otp_verify(req: Request):
    if not is_supabase_configured():
        return JSONResponse(status_code=503, content={"success": False, "message": "OTP is unavailable (Supabase not configured)"})

    body = await req.json()
    email = str(body.get("email") or "").strip().lower()
    token = str(body.get("token") or "").strip()
    if not _is_valid_email(email) or not token:
        return JSONResponse(status_code=400, content={"success": False, "message": "Invalid email or token"})

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/verify"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, headers=_supabase_headers(), json={"type": "email", "email": email, "token": token})
    if r.status_code >= 400:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    return {"success": True, "message": "OTP verified", "data": _format_auth_response(_safe_json_dict(r))}


@router.get("/me")
async def me(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"success": False, "message": "Missing or invalid authorization header"})

    token = authorization.split(" ", 1)[1].strip()

    if not is_supabase_configured():
        try:
            payload = jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"])
        except Exception:
            return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
        return {"success": True, "message": "Current user fetched successfully", "data": {"user": payload}}

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(url, headers=_supabase_headers({"authorization": f"Bearer {token}"}))
    if r.status_code >= 400:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    return {"success": True, "message": "Current user fetched successfully", "data": {"user": _safe_json_dict(r)}}

