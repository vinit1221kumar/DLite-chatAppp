from __future__ import annotations

import os
from typing import Dict, Optional

import httpx
import jwt
import socketio

from src.handlers.call_handler import register_call_handlers
from src.handlers.chat_handler import register_chat_handlers
from src.utils.env import env, looks_placeholder

SUPABASE_URL = env("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY")
_DEFAULT_JWT_SECRET = "dev-only-secret-change-me"
AUTH_JWT_SECRET = env("AUTH_JWT_SECRET") or env("JWT_SECRET") or _DEFAULT_JWT_SECRET


def is_supabase_configured() -> bool:
    # Supabase is considered usable if the URL is set and at least one key
    # (anon or service role) is non-placeholder.
    return not looks_placeholder(SUPABASE_URL) and (
        not looks_placeholder(SUPABASE_ANON_KEY) or not looks_placeholder(SUPABASE_SERVICE_ROLE_KEY)
    )

if not is_supabase_configured() and AUTH_JWT_SECRET == _DEFAULT_JWT_SECRET:
    # If Supabase isn't available, this service falls back to local JWT validation.
    # Avoid silently accepting tokens signed with a guessable dev secret.
    raise RuntimeError("AUTH_JWT_SECRET (or JWT_SECRET) must be set when Supabase is not configured")


def sb_key() -> str:
    return (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY or "").strip()


def sb_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    headers = {"apikey": sb_key(), "authorization": f"Bearer {sb_key()}"}
    if extra:
        headers.update(extra)
    return headers


async def validate_token(token: str) -> Optional[dict]:
    if not is_supabase_configured():
        try:
            return jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"])
        except Exception:
            return None
    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url, headers=sb_headers({"authorization": f"Bearer {token}"}))
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


def claims_user_id(claims: Optional[dict]) -> Optional[str]:
    if not isinstance(claims, dict):
        return None
    uid = claims.get("id") or claims.get("sub") or claims.get("user_id") or claims.get("userId")
    return str(uid).strip() if uid else None


def create_socket_server():
    allowed_origins_raw = env("SOCKET_IO_CORS_ORIGINS", "*") or "*"
    cors_allowed_origins = "*"
    if allowed_origins_raw.strip() != "*":
        cors_allowed_origins = [o.strip() for o in allowed_origins_raw.split(",") if o.strip()]

    sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=cors_allowed_origins)
    connections_by_user: Dict[str, set[str]] = {}
    active_calls: Dict[str, dict] = {}

    def user_room(user_id: str) -> str:
        return f"user:{user_id}"

    def chat_room(chat_id: str) -> str:
        return f"chat:{chat_id}"

    async def broadcast_user_status(user_id: str, status: str):
        await sio.emit("user_status", {"userId": user_id, "status": status})

    def get_user_id(environ, auth) -> Optional[str]:
        if isinstance(auth, dict) and auth.get("userId"):
            return str(auth.get("userId"))
        qs = environ.get("QUERY_STRING", "")
        for part in qs.split("&"):
            if part.startswith("userId="):
                return part.split("=", 1)[1]
        return None

    @sio.event
    async def connect(sid, environ, auth):
        user_id = get_user_id(environ, auth)
        token = None
        if isinstance(auth, dict):
            token = auth.get("token") or auth.get("accessToken") or auth.get("jwt")
        if not user_id:
            qs = environ.get("QUERY_STRING", "")
            for part in qs.split("&"):
                if part.startswith("token=") or part.startswith("accessToken=") or part.startswith("jwt="):
                    token = part.split("=", 1)[1]
        if not user_id:
            await sio.emit("socket_error", {"message": "Missing userId"}, to=sid)
            return False

        if token:
            claims = await validate_token(str(token).strip())
            token_uid = claims_user_id(claims)
            if not token_uid:
                await sio.emit("socket_error", {"message": "Invalid token"}, to=sid)
                return False
            if token_uid != str(user_id):
                await sio.emit("socket_error", {"message": "userId does not match token"}, to=sid)
                return False

        user_id = str(user_id)
        connections_by_user.setdefault(user_id, set()).add(sid)
        await sio.save_session(sid, {"userId": user_id})
        await sio.enter_room(sid, user_room(user_id))

        if len(connections_by_user[user_id]) == 1:
            await broadcast_user_status(user_id, "online")
        await sio.emit("connected", {"userId": user_id, "socketId": sid}, to=sid)

    @sio.event
    async def disconnect(sid):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        if not user_id:
            return
        conns = connections_by_user.get(user_id)
        if conns and sid in conns:
            conns.remove(sid)
        if not conns:
            connections_by_user.pop(user_id, None)
            await broadcast_user_status(user_id, "offline")

    register_chat_handlers(
        sio,
        user_room=user_room,
        chat_room=chat_room,
        validate_token=validate_token,
        sb_key=sb_key,
        sb_headers=sb_headers,
        is_supabase_configured=is_supabase_configured,
        supabase_url=SUPABASE_URL or "",
    )
    register_call_handlers(sio, user_room=user_room, active_calls=active_calls)

    return sio

