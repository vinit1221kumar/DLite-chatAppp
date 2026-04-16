from __future__ import annotations

import time
from typing import Any, Dict

import httpx


def register_chat_handlers(sio, *, user_room, chat_room, validate_token, sb_key, sb_headers, is_supabase_configured, supabase_url):
    async def save_message(chat_id: str, sender_id: str, content: str, msg_type: str) -> Dict[str, Any]:
        if not is_supabase_configured():
            return {
                "id": int(time.time() * 1000),
                "chat_id": chat_id,
                "sender_id": sender_id,
                "content": content,
                "type": msg_type,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }

        url = f"{supabase_url.rstrip('/')}/rest/v1/messages"
        payload = {"chat_id": chat_id, "sender_id": sender_id, "content": content, "type": msg_type}
        headers = sb_headers(
            {
                "authorization": f"Bearer {sb_key()}",
                "content-type": "application/json",
                "prefer": "return=representation",
            }
        )
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(url, headers=headers, json=payload)
        if r.status_code >= 400:
            raise RuntimeError("Failed to save message")
        try:
            rows = r.json()
        except Exception:
            rows = None
        return rows[0] if isinstance(rows, list) and rows else payload

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

        try:
            msg = await save_message(chat_id, sender_id, content, msg_type)
        except Exception:
            await sio.emit("socket_error", {"message": "Failed to send message"}, to=sid)
            return

        await sio.emit("receive_message", msg, room=chat_room(chat_id))

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

