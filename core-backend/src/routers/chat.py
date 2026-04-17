from __future__ import annotations

from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from src.settings import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, require_supabase
from src.supabase import postgrest_headers, safe_json_list, validate_access_token

router = APIRouter()


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip() or None


async def _require_user(authorization: Optional[str]) -> tuple[Optional[dict], Optional[str]]:
    token = _extract_bearer_token(authorization)
    if not token:
        return None, None
    user = await validate_access_token(token)
    return user, token


def _dm_key(a: str, b: str) -> str:
    x, y = sorted([str(a or "").strip(), str(b or "").strip()])
    return f"dm:{x}:{y}"


@router.get("/users/search")
async def search_users(username: str = "", exclude: str = "", authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    term = (username or "").strip()
    if not term:
        return {"success": True, "users": []}

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/users"
    params: Dict[str, str] = {
        "select": "id,username,avatar_url",
        "username": f"ilike.*{term}*",
        "order": "username.asc",
        "limit": "15",
    }
    if exclude:
        params["id"] = f"neq.{exclude}"

    # Use service role for directory search so it works even if RLS/GRANTs are restrictive.
    # Auth is still enforced by validating the caller's access token above.
    use_service_role = bool(SUPABASE_SERVICE_ROLE_KEY)
    if use_service_role:
        headers = postgrest_headers(use_service_role=True)
    else:
        # Fallback: anon key + user access token so RLS is enforced.
        headers = {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url, headers=headers, params=params)
    if r.status_code >= 400:
        # Surface a safe upstream hint to make configuration issues debuggable.
        upstream_text = (r.text or "").strip()
        if len(upstream_text) > 300:
            upstream_text = upstream_text[:300] + "…"
        hint = f"Supabase error ({r.status_code})"
        if upstream_text:
            hint = f"{hint}: {upstream_text}"
        if not SUPABASE_SERVICE_ROLE_KEY:
            hint = f"{hint} (note: SUPABASE_SERVICE_ROLE_KEY is not set on core-backend)"
        return JSONResponse(status_code=503, content={"success": False, "message": hint})
    return {"success": True, "users": await safe_json_list(r)}


@router.get("/groups/my")
async def list_my_groups(authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"
    params = {
        "select": "chat_id,chats!inner(id,name,type),role",
        "user_id": f"eq.{uid}",
        "chats.type": "eq.group",
        "limit": "100",
    }
    headers = {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, headers=headers, params=params)
    if r.status_code >= 400:
        return JSONResponse(status_code=503, content={"success": False, "message": "Groups are unavailable"})

    rows = await safe_json_list(r)
    groups = []
    for row in rows:
        chat = (row or {}).get("chats") or {}
        if not chat:
            continue
        groups.append({"id": chat.get("id"), "name": chat.get("name") or chat.get("id"), "role": row.get("role")})
    return {"success": True, "groups": groups}


@router.post("/groups/ensure")
async def ensure_group(req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    body = await req.json()
    group_key = str((body or {}).get("groupKey") or (body or {}).get("groupId") or "").strip()
    if not group_key:
        return JSONResponse(status_code=400, content={"success": False, "message": "groupKey is required"})

    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required for group writes"})

    chats_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/chats"
    gm_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"

    async with httpx.AsyncClient(timeout=20.0) as client:
        # Find existing group chat
        r_find = await client.get(
            chats_url,
            headers=postgrest_headers(use_service_role=True),
            params={"select": "id,name,type", "type": "eq.group", "name": f"eq.{group_key}", "limit": "1"},
        )
        if r_find.status_code >= 400:
            return JSONResponse(status_code=503, content={"success": False, "message": "Chat storage is unavailable"})
        items = await safe_json_list(r_find)
        chat = items[0] if items else None

        if not chat:
            r_create = await client.post(
                chats_url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "return=representation"}),
                json={"type": "group", "name": group_key, "created_by": uid},
            )
            if r_create.status_code >= 400:
                return JSONResponse(status_code=503, content={"success": False, "message": "Could not create group"})
            created = await safe_json_list(r_create)
            chat = created[0] if created else None

        chat_id = (chat or {}).get("id")
        if not chat_id:
            return JSONResponse(status_code=503, content={"success": False, "message": "Could not open group"})

        r_member = await client.post(
            gm_url,
            headers=postgrest_headers(use_service_role=True, extra={"prefer": "resolution=merge-duplicates,return=minimal"}),
            json={"chat_id": chat_id, "user_id": uid, "role": "owner"},
        )
        if r_member.status_code not in (201, 204, 409):
            return JSONResponse(status_code=503, content={"success": False, "message": "Could not join group"})

    return {"success": True, "group": {"id": chat_id, "name": (chat or {}).get("name") or group_key}}


@router.post("/dm/ensure")
async def ensure_dm(req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, _access_token = await _require_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    body = await req.json()
    peer_id = str((body or {}).get("peerId") or (body or {}).get("receiverId") or (body or {}).get("userId") or "").strip()
    if not peer_id:
        return JSONResponse(status_code=400, content={"success": False, "message": "peerId is required"})
    if peer_id == uid:
        return JSONResponse(status_code=400, content={"success": False, "message": "Cannot DM yourself"})

    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required for DM writes"})

    dm_key = _dm_key(uid, peer_id)
    chats_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/chats"
    gm_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"

    async with httpx.AsyncClient(timeout=20.0) as client:
        r_find = await client.get(
            chats_url,
            headers=postgrest_headers(use_service_role=True),
            params={"select": "id,name,type", "type": "eq.direct", "name": f"eq.{dm_key}", "limit": "1"},
        )
        if r_find.status_code >= 400:
            return JSONResponse(status_code=503, content={"success": False, "message": "Chat storage is unavailable"})
        items = await safe_json_list(r_find)
        chat = items[0] if items else None

        if not chat:
            r_create = await client.post(
                chats_url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "return=representation"}),
                json={"type": "direct", "name": dm_key, "created_by": uid},
            )
            if r_create.status_code >= 400:
                return JSONResponse(status_code=503, content={"success": False, "message": "Could not create DM chat"})
            created = await safe_json_list(r_create)
            chat = created[0] if created else None

        chat_id = (chat or {}).get("id")
        if not chat_id:
            return JSONResponse(status_code=503, content={"success": False, "message": "Could not open DM chat"})

        # Ensure both users are members (we reuse group_members for *all* chat types).
        r_m1 = await client.post(
            gm_url,
            headers=postgrest_headers(use_service_role=True, extra={"prefer": "resolution=merge-duplicates,return=minimal"}),
            json={"chat_id": chat_id, "user_id": uid, "role": "member"},
        )
        if r_m1.status_code not in (201, 204, 409):
            return JSONResponse(status_code=503, content={"success": False, "message": "Could not join DM"})
        r_m2 = await client.post(
            gm_url,
            headers=postgrest_headers(use_service_role=True, extra={"prefer": "resolution=merge-duplicates,return=minimal"}),
            json={"chat_id": chat_id, "user_id": peer_id, "role": "member"},
        )
        if r_m2.status_code not in (201, 204, 409):
            return JSONResponse(status_code=503, content={"success": False, "message": "Could not open DM"})

    return {"success": True, "chatId": chat_id}


@router.post("/messages/send")
async def send_message(req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, _access_token = await _require_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    body = await req.json()
    chat_id = str((body or {}).get("chatId") or "").strip()
    content = str((body or {}).get("content") or "").strip()
    msg_type = str((body or {}).get("type") or "text").strip() or "text"
    if not chat_id or not content:
        return JSONResponse(status_code=400, content={"success": False, "message": "chatId and content are required"})

    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required for message writes"})

    gm_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"
    msg_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/messages"

    async with httpx.AsyncClient(timeout=20.0) as client:
        r_mem = await client.get(
            gm_url,
            headers=postgrest_headers(use_service_role=True),
            params={"select": "chat_id,user_id", "chat_id": f"eq.{chat_id}", "user_id": f"eq.{uid}", "limit": "1"},
        )
        if r_mem.status_code >= 400:
            return JSONResponse(status_code=503, content={"success": False, "message": "Chat membership check failed"})
        rows = await safe_json_list(r_mem)
        if not rows:
            return JSONResponse(status_code=403, content={"success": False, "message": "You are not a member of this chat"})

        r_ins = await client.post(
            msg_url,
            headers=postgrest_headers(use_service_role=True, extra={"prefer": "return=representation"}),
            json={"chat_id": chat_id, "sender_id": uid, "content": content, "type": msg_type},
        )
        if r_ins.status_code >= 400:
            return JSONResponse(status_code=503, content={"success": False, "message": "Could not save message"})
        created = await safe_json_list(r_ins)
        msg = created[0] if created else None

    if not msg:
        return JSONResponse(status_code=503, content={"success": False, "message": "Could not save message"})

    return {"success": True, "message": msg}

@router.get("/messages/{chat_id}")
async def get_messages(chat_id: str, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/messages"
    params = {
        "select": "id,chat_id,sender_id,content,type,created_at",
        "chat_id": f"eq.{chat_id}",
        "order": "created_at.asc",
        "limit": "200",
    }
    headers = {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, headers=headers, params=params)
    if r.status_code >= 400:
        upstream_text = (r.text or "").strip()
        if len(upstream_text) > 300:
            upstream_text = upstream_text[:300] + "…"
        hint = f"Supabase error ({r.status_code})"
        if upstream_text:
            hint = f"{hint}: {upstream_text}"
        # Pass through common auth/RLS/missing-table codes to make debugging + UI behavior sane.
        status = r.status_code if r.status_code in (400, 401, 403, 404, 406) else 503
        return JSONResponse(status_code=status, content={"success": False, "message": hint})
    return {"success": True, "chatId": chat_id, "messages": await safe_json_list(r)}

