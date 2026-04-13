import os
import time
from typing import Any, Dict, Optional

import httpx
import jwt
import socketio
from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v else default


PORT = int(_env("PORT", "4002") or "4002")
SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = _env("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_ANON_KEY = _env("SUPABASE_ANON_KEY")
AUTH_JWT_SECRET = _env("AUTH_JWT_SECRET") or _env("JWT_SECRET") or "dev-only-secret-change-me"


def _looks_placeholder(v: Optional[str]) -> bool:
    if not v:
        return True
    s = v.strip()
    if not s:
        return True
    if "your-project" in s or "your-supabase" in s or "xxxx.supabase.co" in s or "..." in s:
        return True
    return False


def is_supabase_configured() -> bool:
    return not _looks_placeholder(SUPABASE_URL) and not _looks_placeholder(SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY)


def _sb_key() -> str:
    return (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY or "").strip()


def _sb_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    headers = {
        "apikey": _sb_key(),
        "authorization": f"Bearer {_sb_key()}",
    }
    if extra:
        headers.update(extra)
    return headers


app = FastAPI()


@app.get("/")
async def root():
    return {"success": True, "service": "chat-service", "message": "Chat service is running"}


@app.get("/health")
async def health():
    return {"success": True, "service": "chat-service", "status": "ok"}


async def _validate_token(token: str) -> Optional[dict]:
    # If Supabase isn't configured, accept locally-issued JWTs from auth-service fallback.
    if not is_supabase_configured():
        try:
            return jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"])
        except Exception:
            return None

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url, headers=_sb_headers({"authorization": f"Bearer {token}"}))
    if r.status_code >= 400:
        # If Supabase is reachable but token is a local fallback token, still allow it.
        try:
            return jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"])
        except Exception:
            return None
    return r.json()


def _claims_user_id(claims: Optional[dict]) -> Optional[str]:
    if not isinstance(claims, dict):
        return None
    # Supabase user payload: {"id": "..."} ; local JWTs commonly: {"sub": "..."}
    uid = claims.get("id") or claims.get("sub") or claims.get("user_id") or claims.get("userId")
    return str(uid).strip() if uid else None


@app.get("/messages/{chat_id}")
async def get_messages(chat_id: str, authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"success": False, "message": "Missing or invalid authorization header"})

    token = authorization.split(" ", 1)[1].strip()
    user = await _validate_token(token)
    if user is None:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    if not is_supabase_configured():
        return {"success": True, "chatId": chat_id, "messages": []}

    # PostgREST query
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/messages"
    params = {
        "select": "id,chat_id,sender_id,content,type,created_at",
        "chat_id": f"eq.{chat_id}",
        "order": "created_at.asc",
        "limit": "200",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, headers=_sb_headers({"authorization": f"Bearer {_sb_key()}"}), params=params)
    if r.status_code >= 400:
        return JSONResponse(status_code=503, content={"success": False, "message": "Chat storage is unavailable"})

    return {"success": True, "chatId": chat_id, "messages": r.json()}


sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

_connections_by_user: Dict[str, set[str]] = {}


def _user_room(user_id: str) -> str:
    return f"user:{user_id}"


def _chat_room(chat_id: str) -> str:
    return f"chat:{chat_id}"


async def _broadcast_user_status(user_id: str, status: str):
    await sio.emit("user_status", {"userId": user_id, "status": status})


@sio.event
async def connect(sid, environ, auth):
    user_id = None
    token = None
    if isinstance(auth, dict):
        user_id = auth.get("userId")
        token = auth.get("token") or auth.get("accessToken") or auth.get("jwt")

    if not user_id:
        # fallback to query string
        qs = environ.get("QUERY_STRING", "")
        for part in qs.split("&"):
            if part.startswith("userId="):
                user_id = part.split("=", 1)[1]
                break
            if part.startswith("token=") or part.startswith("accessToken=") or part.startswith("jwt="):
                token = part.split("=", 1)[1]

    if not user_id:
        await sio.emit("socket_error", {"message": "Missing userId"}, to=sid)
        return False

    user_id = str(user_id)

    # If a token is provided, validate it and ensure it matches the claimed userId.
    if token:
        claims = await _validate_token(str(token).strip())
        token_uid = _claims_user_id(claims)
        if not token_uid:
            await sio.emit("socket_error", {"message": "Invalid token"}, to=sid)
            return False
        if token_uid != user_id:
            await sio.emit("socket_error", {"message": "userId does not match token"}, to=sid)
            return False

    _connections_by_user.setdefault(user_id, set()).add(sid)
    await sio.save_session(sid, {"userId": user_id})
    await sio.enter_room(sid, _user_room(user_id))

    # First connection -> online
    if len(_connections_by_user[user_id]) == 1:
        await _broadcast_user_status(user_id, "online")


@sio.event
async def disconnect(sid):
    session = await sio.get_session(sid)
    user_id = (session or {}).get("userId")
    if not user_id:
        return
    conns = _connections_by_user.get(user_id)
    if conns and sid in conns:
        conns.remove(sid)
    if not conns:
        _connections_by_user.pop(user_id, None)
        await _broadcast_user_status(user_id, "offline")


@sio.event
async def join_chat(sid, data):
    chat_id = str((data or {}).get("chatId") or "").strip()
    if not chat_id:
        await sio.emit("socket_error", {"message": "chatId is required"}, to=sid)
        return
    await sio.enter_room(sid, _chat_room(chat_id))


async def _save_message(chat_id: str, sender_id: str, content: str, msg_type: str) -> Dict[str, Any]:
    # If Supabase isn't configured, return a synthetic message.
    if not is_supabase_configured():
        return {
            "id": int(time.time() * 1000),
            "chat_id": chat_id,
            "sender_id": sender_id,
            "content": content,
            "type": msg_type,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/messages"
    payload = {"chat_id": chat_id, "sender_id": sender_id, "content": content, "type": msg_type}
    headers = _sb_headers({"authorization": f"Bearer {_sb_key()}", "content-type": "application/json", "prefer": "return=representation"})
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, headers=headers, json=payload)
    if r.status_code >= 400:
        raise RuntimeError("Failed to save message")
    rows = r.json()
    return rows[0] if isinstance(rows, list) and rows else payload


@sio.event
async def send_message(sid, data):
    session = await sio.get_session(sid)
    user_id = (session or {}).get("userId")

    chat_id = str((data or {}).get("chatId") or "").strip()
    sender_id = str((data or {}).get("senderId") or user_id or "").strip()
    content = str((data or {}).get("content") or "").strip()
    msg_type = str((data or {}).get("type") or "text").strip()

    if not chat_id or not sender_id or not content:
        await sio.emit("socket_error", {"message": "chatId, senderId, and content are required"}, to=sid)
        return

    try:
        msg = await _save_message(chat_id, sender_id, content, msg_type)
    except Exception:
        await sio.emit("socket_error", {"message": "Failed to send message"}, to=sid)
        return

    await sio.emit("receive_message", msg, room=_chat_room(chat_id))


@sio.event
async def typing(sid, data):
    session = await sio.get_session(sid)
    user_id = (session or {}).get("userId")
    chat_id = str((data or {}).get("chatId") or "").strip()
    sender_id = str((data or {}).get("senderId") or user_id or "").strip()
    if not chat_id:
        return
    await sio.emit("typing", {"chatId": chat_id, "senderId": sender_id}, room=_chat_room(chat_id), skip_sid=sid)


@sio.event
async def stop_typing(sid, data):
    session = await sio.get_session(sid)
    user_id = (session or {}).get("userId")
    chat_id = str((data or {}).get("chatId") or "").strip()
    sender_id = str((data or {}).get("senderId") or user_id or "").strip()
    if not chat_id:
        return
    await sio.emit("stop_typing", {"chatId": chat_id, "senderId": sender_id}, room=_chat_room(chat_id), skip_sid=sid)


asgi_app = socketio.ASGIApp(sio, other_asgi_app=app)

