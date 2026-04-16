from __future__ import annotations

from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from src.modules.auth.token import claims_user_id, validate_token
from src.modules.chat.config import SUPABASE_URL, SUPABASE_ANON_KEY, is_supabase_configured, sb_key, sb_service_role_key

router = APIRouter()


def _safe_json_list(r: httpx.Response) -> list:
    try:
        parsed = r.json()
    except Exception:
        return []
    return parsed if isinstance(parsed, list) else []


def _safe_json_dict(r: httpx.Response) -> dict:
    try:
        parsed = r.json()
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _safe_json_any(r: httpx.Response) -> Any:
    try:
        return r.json()
    except Exception:
        return None


def _sb_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    # Prefer service role for server-side reads to avoid RLS blocking lookups
    # (endpoint access is still gated by auth token validation).
    key = sb_service_role_key() or sb_key()
    headers = {
        "apikey": key,
        "authorization": f"Bearer {key}",
    }
    if extra:
        headers.update(extra)
    return headers


def _sb_write_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    # Writes should use service role key to avoid RLS blocking server-side operations.
    key = sb_service_role_key()
    headers = {
        "apikey": key,
        "authorization": f"Bearer {key}",
    }
    if extra:
        headers.update(extra)
    return headers


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip()


def _sb_anon_user_headers(access_token: str, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    # Use anon key + user access token so Supabase RLS policies are enforced.
    key = (SUPABASE_ANON_KEY or "").strip()
    headers = {"apikey": key, "authorization": f"Bearer {access_token}"}
    if extra:
        headers.update(extra)
    return headers


async def _require_user(authorization: Optional[str]) -> Optional[dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    return await validate_token(token, supabase_api_key=sb_key() or None)


@router.get("/users/search")
async def search_users(username: str = "", exclude: str = "", authorization: Optional[str] = Header(default=None)):
    user = await _require_user(authorization)
    if user is None:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    access_token = _extract_bearer_token(authorization) or ""

    term = (username or "").strip()
    if not term:
        return {"success": True, "users": []}

    if not is_supabase_configured():
        return {"success": True, "users": []}

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/users"
    params = {
        "select": "id,username",
        "username": f"ilike.*{term}*",
        "order": "username.asc",
        "limit": "15",
    }
    if exclude:
        params["id"] = f"neq.{exclude}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url, headers=_sb_anon_user_headers(access_token), params=params)
    if r.status_code >= 400:
        return JSONResponse(status_code=503, content={"success": False, "message": "User search is unavailable"})

    return {"success": True, "users": _safe_json_list(r)}


@router.get("/groups/my")
async def list_my_groups(authorization: Optional[str] = Header(default=None)):
    user = await _require_user(authorization)
    if user is None:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    access_token = _extract_bearer_token(authorization) or ""
    uid = claims_user_id(user)
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    if not is_supabase_configured():
        return {"success": True, "groups": []}

    # Fetch group chats by membership.
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"
    params = {
        "select": "chat_id,chats!inner(id,name,type),role",
        "user_id": f"eq.{uid}",
        "chats.type": "eq.group",
        "limit": "100",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, headers=_sb_anon_user_headers(access_token), params=params)
    if r.status_code >= 400:
        return JSONResponse(status_code=503, content={"success": False, "message": "Groups are unavailable"})

    rows = _safe_json_list(r)
    groups = []
    for row in rows:
        chat = (row or {}).get("chats") or {}
        if not chat:
            continue
        groups.append({"id": chat.get("id"), "name": chat.get("name") or chat.get("id"), "role": row.get("role")})

    return {"success": True, "groups": groups}


@router.post("/groups/ensure")
async def ensure_group(req: Request, authorization: Optional[str] = Header(default=None)):
    user = await _require_user(authorization)
    if user is None:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = claims_user_id(user)
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    body = await req.json()
    group_key = str(body.get("groupKey") or body.get("groupId") or "").strip()
    if not group_key:
        return JSONResponse(status_code=400, content={"success": False, "message": "groupKey is required"})

    if not is_supabase_configured():
        return JSONResponse(status_code=503, content={"success": False, "message": "Chat storage is unavailable"})
    if not sb_service_role_key():
        return JSONResponse(
            status_code=503,
            content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required for group writes"},
        )

    async with httpx.AsyncClient(timeout=20.0) as client:
        # Find existing group chat by name
        find_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/chats"
        r_find = await client.get(
            find_url,
            headers=_sb_headers(),
            params={"select": "id,name,type", "type": "eq.group", "name": f"eq.{group_key}", "limit": "1"},
        )
        if r_find.status_code >= 400:
            return JSONResponse(status_code=503, content={"success": False, "message": "Chat storage is unavailable"})
        items = _safe_json_list(r_find)
        chat = items[0] if items else None

        if not chat:
            # Create new group chat
            r_create = await client.post(
                find_url,
                headers=_sb_write_headers({"prefer": "return=representation"}),
                json={"type": "group", "name": group_key, "created_by": uid},
            )
            if r_create.status_code >= 400:
                msg = r_create.text
                return JSONResponse(status_code=503, content={"success": False, "message": f"Could not create group ({r_create.status_code}): {msg}"})
            created = _safe_json_any(r_create)
            chat = created[0] if isinstance(created, list) else created

        chat_id = (chat or {}).get("id")
        if not chat_id:
            return JSONResponse(status_code=503, content={"success": False, "message": "Could not open group"})

        # Ensure membership row exists
        gm_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"
        r_member = await client.post(
            gm_url,
            headers=_sb_write_headers({"prefer": "resolution=merge-duplicates,return=minimal"}),
            json={"chat_id": chat_id, "user_id": uid, "role": "owner"},
        )
        # If user already member, supabase returns 409; ignore
        if r_member.status_code not in (201, 204, 409):
            return JSONResponse(status_code=503, content={"success": False, "message": "Could not join group"})

    return {"success": True, "group": {"id": chat_id, "name": (chat or {}).get("name") or group_key}}


@router.get("/groups/{chat_id}/members")
async def list_group_members(chat_id: str, authorization: Optional[str] = Header(default=None)):
    user = await _require_user(authorization)
    if user is None:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    access_token = _extract_bearer_token(authorization) or ""
    uid = claims_user_id(user)
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    if not is_supabase_configured():
        return {"success": True, "members": []}

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"
    params = {
        "select": "role,users(id,username)",
        "chat_id": f"eq.{chat_id}",
        "order": "joined_at.asc",
        "limit": "200",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, headers=_sb_anon_user_headers(access_token), params=params)
    if r.status_code >= 400:
        return JSONResponse(status_code=503, content={"success": False, "message": "Could not load group members"})

    members = []
    for row in _safe_json_list(r):
        u = (row or {}).get("users") or {}
        if not u:
            continue
        members.append({"id": u.get("id"), "username": u.get("username"), "role": row.get("role") or "member"})
    return {"success": True, "members": members}


@router.post("/groups/{chat_id}/members/add-by-username")
async def add_member_by_username(chat_id: str, req: Request, authorization: Optional[str] = Header(default=None)):
    user = await _require_user(authorization)
    if user is None:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    body = await req.json()
    username = str(body.get("username") or "").strip()
    if not username:
        return JSONResponse(status_code=400, content={"success": False, "message": "username is required"})

    if not is_supabase_configured():
        return JSONResponse(status_code=503, content={"success": False, "message": "Chat storage is unavailable"})
    if not sb_service_role_key():
        return JSONResponse(
            status_code=503,
            content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required for group writes"},
        )

    async with httpx.AsyncClient(timeout=20.0) as client:
        # Resolve user by username
        u_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/users"
        r_user = await client.get(u_url, headers=_sb_headers(), params={"select": "id,username", "username": f"eq.{username}", "limit": "1"})
        if r_user.status_code >= 400:
            return JSONResponse(status_code=503, content={"success": False, "message": "User lookup failed"})
        items = _safe_json_list(r_user)
        if not items:
            return JSONResponse(status_code=404, content={"success": False, "message": "User not found"})
        target = items[0]

        gm_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"
        r_add = await client.post(
            gm_url,
            headers=_sb_write_headers({"prefer": "resolution=merge-duplicates,return=minimal"}),
            json={"chat_id": chat_id, "user_id": target.get("id"), "role": "member"},
        )
        if r_add.status_code not in (201, 204, 409):
            return JSONResponse(status_code=503, content={"success": False, "message": "Could not add member"})

    return {"success": True, "member": {"id": target.get("id"), "username": target.get("username"), "role": "member"}}

@router.get("/messages/{chat_id}")
async def get_messages(chat_id: str, authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"success": False, "message": "Missing or invalid authorization header"})

    token = authorization.split(" ", 1)[1].strip()
    user = await validate_token(token, supabase_api_key=sb_key() or None)
    if user is None:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    if not is_supabase_configured():
        return {"success": True, "chatId": chat_id, "messages": []}
    access_token = token

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/messages"
    params = {
        "select": "id,chat_id,sender_id,content,type,created_at",
        "chat_id": f"eq.{chat_id}",
        "order": "created_at.asc",
        "limit": "200",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, headers=_sb_anon_user_headers(access_token), params=params)
    if r.status_code >= 400:
        return JSONResponse(status_code=503, content={"success": False, "message": "Chat storage is unavailable"})

    return {"success": True, "chatId": chat_id, "messages": _safe_json_list(r)}

