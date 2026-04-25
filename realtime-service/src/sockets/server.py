from __future__ import annotations

import asyncio
import datetime
import time
from typing import Any, Dict, Optional

import httpx
import socketio

from src.settings import SUPABASE_ANON_KEY, SUPABASE_URL
from src.supabase import validate_access_token

# Short TTL cache to avoid PostgREST on every typing event (membership rarely changes).
_MEMBER_CACHE_TTL_SEC = 45.0
_member_ok_cache: dict[tuple[str, str], tuple[float, bool]] = {}
_member_list_cache: dict[tuple[str, str], tuple[float, list[str]]] = {}


async def _user_is_chat_member(chat_id: str, user_id: str, access_token: str) -> bool:
    """RLS-enforced: caller's JWT must match user_id row in group_members."""
    cid = (chat_id or "").strip()
    uid = (user_id or "").strip()
    tok = (access_token or "").strip()
    if not cid or not uid or not tok or not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return False
    now = time.monotonic()
    cache_key = (cid, uid)
    hit = _member_ok_cache.get(cache_key)
    if hit and now < hit[0]:
        return hit[1]

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"
    params = {"select": "chat_id", "chat_id": f"eq.{cid}", "user_id": f"eq.{uid}", "limit": "1"}
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "authorization": f"Bearer {tok}",
        "content-type": "application/json",
    }
    ok = False
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url, headers=headers, params=params)
        if r.status_code < 400:
            rows = r.json()
            ok = isinstance(rows, list) and len(rows) > 0
    except Exception:
        ok = False
    # Cache negative results for a much shorter time so new DM memberships propagate quickly
    ttl = _MEMBER_CACHE_TTL_SEC if ok else 2.0
    _member_ok_cache[cache_key] = (now + ttl, ok)
    return ok


async def _list_chat_member_ids(chat_id: str, access_token: str) -> list[str]:
    """
    Best-effort list of member user_ids for a chat (RLS enforced by caller JWT).
    Used to notify user rooms so sidebars update without joining the chat room.
    """
    cid = (chat_id or "").strip()
    tok = (access_token or "").strip()
    if not cid or not tok or not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return []
    now = time.monotonic()
    cache_key = (cid, tok[:12])  # avoid storing full token in key
    hit = _member_list_cache.get(cache_key)
    if hit and now < hit[0]:
        return hit[1]
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"
    params = {"select": "user_id", "chat_id": f"eq.{cid}", "limit": "200"}
    headers = {"apikey": SUPABASE_ANON_KEY, "authorization": f"Bearer {tok}", "content-type": "application/json"}
    out: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url, headers=headers, params=params)
        if r.status_code < 400:
            rows = r.json()
            if isinstance(rows, list):
                out = [str((row or {}).get("user_id") or "").strip() for row in rows]
                out = [x for x in out if x]
    except Exception:
        out = []
    _member_list_cache[cache_key] = (now + 10.0, out)
    return out


async def _persist_presence_row(user_id: str, status: str, access_token: Optional[str]) -> None:
    """
    Mirror socket online/offline into Supabase `public.presence` so REST `/chat/presence/:id` matches.
    Uses the client's JWT (RLS: users may only write their own row).
    """
    tok = (access_token or "").strip()
    if not tok or not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/presence"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "authorization": f"Bearer {tok}",
        "content-type": "application/json",
        "prefer": "resolution=merge-duplicates,return=minimal",
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(
                url,
                headers=headers,
                json={"user_id": user_id, "status": status, "last_seen": now},
            )
    except Exception:
        return


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
        if not token:
            await sio.emit("socket_error", {"message": "Missing token"}, to=sid)
            return False

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
        await sio.save_session(sid, {"userId": uid, "accessToken": (token or "").strip()})
        await sio.enter_room(sid, user_room(uid))

        if len(connections_by_user[uid]) == 1:
            await broadcast_user_status(uid, "online")
            asyncio.create_task(_persist_presence_row(uid, "online", token))
        await sio.emit("connected", {"userId": uid, "socketId": sid}, to=sid)

    @sio.event
    async def disconnect(sid):
        session = await sio.get_session(sid)
        uid = (session or {}).get("userId")
        access_token = (session or {}).get("accessToken")
        if not uid:
            return
        conns = connections_by_user.get(uid)
        if conns and sid in conns:
            conns.remove(sid)
        if not connections_by_user.get(uid):
            connections_by_user.pop(uid, None)
            await broadcast_user_status(uid, "offline")
            asyncio.create_task(_persist_presence_row(str(uid), "offline", access_token))

    @sio.event
    async def join_chat(sid, data):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        token = (session or {}).get("accessToken")
        chat_id = str((data or {}).get("chatId") or "").strip()
        if not chat_id:
            await sio.emit("socket_error", {"message": "chatId is required"}, to=sid)
            return
        if not user_id or not token:
            await sio.emit("socket_error", {"message": "Not authenticated"}, to=sid)
            return
        if not await _user_is_chat_member(chat_id, str(user_id), str(token)):
            await sio.emit("socket_error", {"message": "Not a member of this chat"}, to=sid)
            return
        await sio.enter_room(sid, chat_room(chat_id))

    @sio.event
    async def send_message(sid, data):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        access_token = (session or {}).get("accessToken")
        if not user_id:
            return

        chat_id = str((data or {}).get("chatId") or "").strip()
        # Never trust client-supplied senderId (spoofing). Socket session is authoritative.
        sender_id = str(user_id).strip()
        content = str((data or {}).get("content") or "").strip()
        msg_type = str((data or {}).get("type") or "text").strip()
        message_id = (data or {}).get("_id") or (data or {}).get("id")
        created_at = (data or {}).get("createdAt") or (data or {}).get("created_at")

        if not chat_id or not sender_id or not content:
            await sio.emit("socket_error", {"message": "chatId, senderId, and content are required"}, to=sid)
            return
        if not access_token or not await _user_is_chat_member(chat_id, sender_id, str(access_token)):
            await sio.emit("socket_error", {"message": "Not a member of this chat"}, to=sid)
            return

        # Realtime service doesn't write to DB; core-backend does that.
        await sio.emit(
            "receive_message",
            {
                "chatId": chat_id,
                "senderId": sender_id,
                "content": content,
                "type": msg_type,
                "_id": str(message_id) if message_id else None,
                "createdAt": created_at,
            },
            room=chat_room(chat_id),
            skip_sid=sid,
        )

        # Also notify all members' user rooms so inbox/group lists can refresh without full reload.
        try:
            member_ids = await _list_chat_member_ids(chat_id, str(access_token))
            payload = {"chatId": chat_id}
            for mid in sorted(set(member_ids)):
                await sio.emit("thread_updated", payload, room=user_room(mid))
        except Exception:
            pass

    @sio.event
    async def message_updated(sid, data):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        access_token = (session or {}).get("accessToken")
        if not user_id:
            return
        chat_id = str((data or {}).get("chatId") or "").strip()
        message = (data or {}).get("message") or {}
        if not chat_id:
            return
        if not access_token or not await _user_is_chat_member(chat_id, str(user_id), str(access_token)):
            return
        await sio.emit("message_updated", {"chatId": chat_id, "message": message}, room=chat_room(chat_id))

    @sio.event
    async def message_deleted(sid, data):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        access_token = (session or {}).get("accessToken")
        if not user_id:
            return
        chat_id = str((data or {}).get("chatId") or "").strip()
        message_id = str((data or {}).get("messageId") or (data or {}).get("_id") or "").strip()
        if not chat_id or not message_id:
            return
        if not access_token or not await _user_is_chat_member(chat_id, str(user_id), str(access_token)):
            return
        await sio.emit("message_deleted", {"chatId": chat_id, "messageId": message_id}, room=chat_room(chat_id))

    @sio.event
    async def group_deleted(sid, data):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        if not user_id:
            return
        group_id = str((data or {}).get("groupId") or (data or {}).get("chatId") or "").strip()
        member_ids = [str(uid or "").strip() for uid in ((data or {}).get("memberIds") or [])]
        member_ids = [uid for uid in member_ids if uid]
        if not group_id or not member_ids:
            return
        payload = {"groupId": group_id}
        for mid in sorted(set(member_ids)):
            await sio.emit("group_deleted", payload, room=user_room(mid))

    @sio.event
    async def group_member_removed(sid, data):
        """
        Notify clients that a member was removed from a group.
        Security: we only verify the sender is a member of the chat; the actual removal is enforced in core-backend.
        Payload: { groupId/chatId, userId/removedUserId }.
        """
        session = await sio.get_session(sid)
        actor_id = (session or {}).get("userId")
        access_token = (session or {}).get("accessToken")
        if not actor_id or not access_token:
            return
        group_id = str((data or {}).get("groupId") or (data or {}).get("chatId") or "").strip()
        removed_id = str((data or {}).get("userId") or (data or {}).get("removedUserId") or "").strip()
        if not group_id or not removed_id:
            return
        if not await _user_is_chat_member(group_id, str(actor_id), str(access_token)):
            return
        payload = {"groupId": group_id, "userId": removed_id, "removedUserId": removed_id}
        # Update everyone currently viewing the group
        await sio.emit("group_member_removed", payload, room=chat_room(group_id))
        # Ensure the removed user gets the event even if not in the room
        await sio.emit("group_member_removed", payload, room=user_room(removed_id))

    @sio.event
    async def reaction_updated(sid, data):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        access_token = (session or {}).get("accessToken")
        if not user_id:
            return
        chat_id = str((data or {}).get("chatId") or "").strip()
        message_id = str((data or {}).get("messageId") or "").strip()
        reactions = (data or {}).get("reactions") or {}
        if not chat_id or not message_id:
            return
        if not access_token or not await _user_is_chat_member(chat_id, str(user_id), str(access_token)):
            return
        await sio.emit(
            "reaction_updated",
            {"chatId": chat_id, "messageId": message_id, "reactions": reactions},
            room=chat_room(chat_id),
        )

    @sio.event
    async def typing(sid, data):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        access_token = (session or {}).get("accessToken")
        if not user_id:
            return
        chat_id = str((data or {}).get("chatId") or "").strip()
        sender_id = str(user_id).strip()
        if not chat_id:
            return
        if not access_token or not await _user_is_chat_member(chat_id, sender_id, str(access_token)):
            return
        await sio.emit("typing", {"chatId": chat_id, "senderId": sender_id}, room=chat_room(chat_id), skip_sid=sid)

    @sio.event
    async def stop_typing(sid, data):
        session = await sio.get_session(sid)
        user_id = (session or {}).get("userId")
        access_token = (session or {}).get("accessToken")
        if not user_id:
            return
        chat_id = str((data or {}).get("chatId") or "").strip()
        sender_id = str(user_id).strip()
        if not chat_id:
            return
        if not access_token or not await _user_is_chat_member(chat_id, sender_id, str(access_token)):
            return
        await sio.emit("stop_typing", {"chatId": chat_id, "senderId": sender_id}, room=chat_room(chat_id), skip_sid=sid)

    @sio.event
    async def get_user_status(sid, data):
        """Return whether a user currently has any socket connection (online)."""
        target = str((data or {}).get("userId") or "").strip()
        if not target:
            return
        online = bool(connections_by_user.get(target))
        await sio.emit(
            "user_status",
            {"userId": target, "status": "online" if online else "offline"},
            to=sid,
        )

    @sio.event
    async def call_user(sid, data):
        """
        Relay WebRTC offer to callee. Frontend listens for event name `call_user` on the callee socket.
        """
        session = await sio.get_session(sid)
        from_uid = (session or {}).get("userId")
        if not from_uid:
            return
        payload = data or {}
        to_uid = str(payload.get("toUserId") or "").strip()
        if not to_uid or to_uid == str(from_uid):
            return
        await sio.emit(
            "call_user",
            {
                "fromUserId": str(from_uid),
                "callType": payload.get("callType") or "audio",
                "roomId": payload.get("roomId"),
                "offer": payload.get("offer"),
            },
            room=user_room(to_uid),
        )

    @sio.event
    async def accept_call(sid, data):
        """Relay SDP answer from callee to caller."""
        session = await sio.get_session(sid)
        from_uid = (session or {}).get("userId")
        if not from_uid:
            return
        payload = data or {}
        to_uid = str(payload.get("toUserId") or "").strip()
        answer = payload.get("answer")
        if not to_uid or to_uid == str(from_uid) or not answer:
            return
        await sio.emit(
            "call_answer",
            {"fromUserId": str(from_uid), "answer": answer},
            room=user_room(to_uid),
        )

    @sio.event
    async def reject_call(sid, data):
        session = await sio.get_session(sid)
        from_uid = (session or {}).get("userId")
        if not from_uid:
            return
        payload = data or {}
        to_uid = str(payload.get("toUserId") or "").strip()
        if not to_uid or to_uid == str(from_uid):
            return
        await sio.emit(
            "call_rejected",
            {
                "fromUserId": str(from_uid),
                "reason": str(payload.get("reason") or "rejected"),
            },
            room=user_room(to_uid),
        )

    @sio.event
    async def ice_candidate(sid, data):
        session = await sio.get_session(sid)
        from_uid = (session or {}).get("userId")
        if not from_uid:
            return
        payload = data or {}
        to_uid = str(payload.get("toUserId") or "").strip()
        candidate = payload.get("candidate")
        if not to_uid or to_uid == str(from_uid) or candidate is None:
            return
        await sio.emit(
            "call_ice_candidate",
            {"fromUserId": str(from_uid), "candidate": candidate},
            room=user_room(to_uid),
        )

    @sio.event
    async def end_call(sid, data):
        session = await sio.get_session(sid)
        from_uid = (session or {}).get("userId")
        if not from_uid:
            return
        payload = data or {}
        to_uid = str(payload.get("toUserId") or "").strip()
        if not to_uid or to_uid == str(from_uid):
            return
        await sio.emit(
            "call_ended",
            {
                "fromUserId": str(from_uid),
                "reason": str(payload.get("reason") or "ended"),
            },
            room=user_room(to_uid),
        )

    return socketio.ASGIApp(sio, other_asgi_app=other_asgi_app, socketio_path="socket.io")
