import time
from typing import Dict, Optional

import socketio
from fastapi import FastAPI
from fastapi.responses import JSONResponse


app = FastAPI()


@app.get("/")
async def root():
    return {"success": True, "service": "call-service", "message": "WebRTC signaling service is running"}


@app.get("/health")
async def health():
    return {"success": True, "service": "call-service", "status": "ok"}


sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

connected_users: Dict[str, set[str]] = {}
active_calls: Dict[str, dict] = {}


def _user_room(user_id: str) -> str:
    return f"user:{user_id}"


def _get_user_id(environ, auth) -> Optional[str]:
    if isinstance(auth, dict) and auth.get("userId"):
        return str(auth.get("userId"))
    qs = environ.get("QUERY_STRING", "")
    for part in qs.split("&"):
        if part.startswith("userId="):
            return part.split("=", 1)[1]
    return None


@sio.event
async def connect(sid, environ, auth):
    user_id = _get_user_id(environ, auth)
    if not user_id:
        await sio.emit("socket_error", {"message": "Missing userId"}, to=sid)
        return False

    connected_users.setdefault(user_id, set()).add(sid)
    await sio.save_session(sid, {"userId": user_id})
    await sio.enter_room(sid, _user_room(user_id))
    await sio.emit("connected", {"userId": user_id, "socketId": sid}, to=sid)


@sio.event
async def disconnect(sid):
    session = await sio.get_session(sid)
    user_id = (session or {}).get("userId")
    if not user_id:
        return
    sids = connected_users.get(user_id)
    if sids and sid in sids:
        sids.remove(sid)
    if not sids:
        connected_users.pop(user_id, None)


def _ensure_call_id(call_id: Optional[str]) -> str:
    if call_id:
        return str(call_id)
    return f"call_{int(time.time()*1000)}"


@sio.event
async def call_user(sid, data):
    session = await sio.get_session(sid)
    from_user_id = (session or {}).get("userId")
    if not from_user_id:
        await sio.emit("socket_error", {"message": "Unauthorized"}, to=sid)
        return

    to_user_id = str((data or {}).get("toUserId") or "").strip()
    offer = (data or {}).get("offer")
    call_type = str((data or {}).get("callType") or "video")
    call_id = _ensure_call_id((data or {}).get("callId"))

    if not to_user_id or not offer:
        await sio.emit("socket_error", {"message": "toUserId and offer are required"}, to=sid)
        return

    active_calls[call_id] = {
        "callId": call_id,
        "callerId": from_user_id,
        "calleeId": to_user_id,
        "callType": call_type,
        "status": "ringing",
    }

    await sio.emit(
        "call_user",
        {"callId": call_id, "fromUserId": from_user_id, "callType": call_type, "offer": offer},
        room=_user_room(to_user_id),
    )


@sio.event
async def accept_call(sid, data):
    session = await sio.get_session(sid)
    from_user_id = (session or {}).get("userId")
    call_id = str((data or {}).get("callId") or "").strip()
    answer = (data or {}).get("answer")

    if not from_user_id or not call_id or not answer:
        await sio.emit("socket_error", {"message": "callId and answer are required"}, to=sid)
        return

    call = active_calls.get(call_id)
    if not call:
        await sio.emit("socket_error", {"message": "Call not found"}, to=sid)
        return

    call["status"] = "accepted"
    await sio.emit(
        "accept_call",
        {"callId": call_id, "fromUserId": from_user_id, "answer": answer, "callType": call.get("callType")},
        room=_user_room(call["callerId"]),
    )


@sio.event
async def reject_call(sid, data):
    session = await sio.get_session(sid)
    from_user_id = (session or {}).get("userId")
    call_id = str((data or {}).get("callId") or "").strip()
    reason = (data or {}).get("reason") or "rejected"

    if not from_user_id or not call_id:
        await sio.emit("socket_error", {"message": "callId is required"}, to=sid)
        return

    call = active_calls.pop(call_id, None)
    if not call:
        return

    await sio.emit(
        "reject_call",
        {"callId": call_id, "fromUserId": from_user_id, "reason": reason},
        room=_user_room(call["callerId"]),
    )


@sio.event
async def ice_candidate(sid, data):
    session = await sio.get_session(sid)
    from_user_id = (session or {}).get("userId")
    call_id = str((data or {}).get("callId") or "").strip()
    to_user_id = str((data or {}).get("toUserId") or "").strip()
    candidate = (data or {}).get("candidate")

    if not from_user_id or not call_id or not to_user_id or not candidate:
        return

    await sio.emit(
        "ice_candidate",
        {"callId": call_id, "fromUserId": from_user_id, "candidate": candidate},
        room=_user_room(to_user_id),
    )


@sio.event
async def end_call(sid, data):
    session = await sio.get_session(sid)
    from_user_id = (session or {}).get("userId")
    call_id = str((data or {}).get("callId") or "").strip()
    reason = (data or {}).get("reason") or "ended"

    if not from_user_id or not call_id:
        return

    call = active_calls.pop(call_id, None)
    if not call:
        return

    other = call["calleeId"] if from_user_id == call["callerId"] else call["callerId"]
    await sio.emit(
        "end_call",
        {"callId": call_id, "fromUserId": from_user_id, "reason": reason},
        room=_user_room(other),
    )


asgi_app = socketio.ASGIApp(sio, other_asgi_app=app)

