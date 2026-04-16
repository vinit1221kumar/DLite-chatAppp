from __future__ import annotations

from typing import Any, Dict, Optional

import socketio

from src.supabase import validate_access_token


def _claims_user_id(claims: Optional[dict]) -> Optional[str]:
    if not isinstance(claims, dict):
        return None
    uid = claims.get("id") or claims.get("sub") or claims.get("user_id") or claims.get("userId")
    return str(uid).strip() if uid else None


def create_socket_app(*, cors_allowed_origins: list[str] | str, other_asgi_app=None):
    """
    Returns an ASGI app that serves Socket.IO on `/socket.io`.

    IMPORTANT: Do not mount this under `/socket.io` again, otherwise the path becomes
    `/socket.io/socket.io` and browsers will fail to connect.
    """
    sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=cors_allowed_origins)

    connections_by_user: Dict[str, set[str]] = {}

    def user_room(user_id: str) -> str:
        return f"user:{user_id}"

    def chat_room(chat_id: str) -> str:
        return f"chat:{chat_id}"

    async def broadcast_user_status(user_id: str, status: str):
        await sio.emit("user_status", {"userId": user_id, "status": status})

    def _get_user_id(environ, auth) -> Optional[str]:
        if isinstance(auth, dict) and auth.get("userId"):
            return str(auth.get("userId"))
        qs = environ.get("QUERY_STRING", "")
        for part in qs.split("&"):
            if part.startswith("userId="):
                return part.split("=", 1)[1]
        return None

    def _get_token(environ, auth) -> Optional[str]:
        if isinstance(auth, dict):
            t = auth.get("token") or auth.get("accessToken") or auth.get("jwt")
            if t:
                return str(t)
        qs = environ.get("QUERY_STRING", "")
        for part in qs.split("&"):
            if part.startswith("token=") or part.startswith("accessToken=") or part.startswith("jwt="):
                return part.split("=", 1)[1]
        return None

    @sio.event
    async def connect(sid, environ, auth):
        user_id = _get_user_id(environ, auth)
        token = _get_token(environ, auth)
        if not user_id:
            await sio.emit("socket_error", {"message": "Missing userId"}, to=sid)
            return False

        if token:
            claims = await validate_access_token(str(token).strip())
            token_uid = _claims_user_id(claims)
            if not token_uid:
                await sio.emit("socket_error", {"message": "Invalid token"}, to=sid)
                return False
            if token_uid != str(user_id):
                await sio.emit("socket_error", {"message": "userId does not match token"}, to=sid)
                return False

        uid = str(user_id)
        connections_by_user.setdefault(uid, set()).add(sid)
        await sio.save_session(sid, {"userId": uid})
        await sio.enter_room(sid, user_room(uid))

        if len(connections_by_user[uid]) == 1:
            await broadcast_user_status(uid, "online")
        await sio.emit("connected", {"userId": uid, "socketId": sid}, to=sid)

    @sio.event
    async def disconnect(sid):
        session = await sio.get_session(sid)
        uid = (session or {}).get("userId")
        if not uid:
            return
        conns = connections_by_user.get(uid)
        if conns and sid in conns:
            conns.remove(sid)
        if not conns:
            connections_by_user.pop(uid, None)
            await broadcast_user_status(uid, "offline")

    @sio.event
    async def join_chat(sid, data):
        chat_id = str((data or {}).get("chatId") or "").strip()
        if not chat_id:
            await sio.emit("socket_error", {"message": "chatId is required"}, to=sid)
            return
        await sio.enter_room(sid, chat_room(chat_id))

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

        # Realtime service doesn't write to DB; core-backend does that.
        await sio.emit(
            "receive_message",
            {"chatId": chat_id, "senderId": sender_id, "content": content, "type": msg_type},
            room=chat_room(chat_id),
        )

    @sio.event
    async def typing(sid, data):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        chat_id = str((data or {}).get("chatId") or "").strip()
        sender_id = str((data or {}).get("senderId") or user_id or "").strip()
        if not chat_id:
            return
        await sio.emit("typing", {"chatId": chat_id, "senderId": sender_id}, room=chat_room(chat_id), skip_sid=sid)

    @sio.event
    async def stop_typing(sid, data):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        chat_id = str((data or {}).get("chatId") or "").strip()
        sender_id = str((data or {}).get("senderId") or user_id or "").strip()
        if not chat_id:
            return
        await sio.emit("stop_typing", {"chatId": chat_id, "senderId": sender_id}, room=chat_room(chat_id), skip_sid=sid)

    return socketio.ASGIApp(sio, other_asgi_app=other_asgi_app, socketio_path="socket.io")

