from __future__ import annotations

import asyncio
import hashlib
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, File, Header, Request, UploadFile
from fastapi.responses import JSONResponse

from src.settings import (
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    CLOUDINARY_CLOUD_NAME,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
    require_supabase,
)
from src.supabase import postgrest_headers, safe_json_list, validate_access_token

router = APIRouter()


def _cloudinary_signature(params: Dict[str, str], api_secret: str) -> str:
    """SHA1 signature for Cloudinary signed uploads (sorted key=value joined with &)."""
    pairs = "&".join(f"{k}={params[k]}" for k in sorted(params.keys()))
    return hashlib.sha1((pairs + api_secret).encode("utf-8")).hexdigest()


@router.post("/media/upload")
async def upload_chat_media(file: UploadFile = File(...), authorization: Optional[str] = Header(default=None)):
    """
    Upload media for chat messages and return a public HTTPS URL (Cloudinary).

    Env (server-side only):
    - CLOUDINARY_CLOUD_NAME
    - CLOUDINARY_API_KEY
    - CLOUDINARY_API_SECRET
    """
    require_supabase()
    user, _access_token = await _require_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    cloud = (CLOUDINARY_CLOUD_NAME or "").strip()
    api_key = (CLOUDINARY_API_KEY or "").strip()
    api_secret = (CLOUDINARY_API_SECRET or "").strip()
    if not cloud or not api_key or not api_secret:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "message": "Cloudinary is not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)",
            },
        )

    safe_name = (file.filename or "upload").replace("/", "_").replace("\\", "_")
    folder = f"d_lite_chat/{uid}"

    try:
        data = await file.read()
    except Exception:
        data = b""
    if not data:
        return JSONResponse(status_code=400, content={"success": False, "message": "file is required"})

    content_type = file.content_type or "application/octet-stream"
    t = content_type.lower()
    if t.startswith("image/"):
        resource = "image"
        kind = "image"
    elif t.startswith("video/"):
        resource = "video"
        kind = "video"
    elif t.startswith("audio/"):
        # Cloudinary treats many audio uploads under the video API.
        resource = "video"
        kind = "audio"
    else:
        resource = "raw"
        kind = "file"

    ts = str(int(time.time()))
    params_to_sign: Dict[str, str] = {"folder": folder, "timestamp": ts}
    signature = _cloudinary_signature(params_to_sign, api_secret)

    upload_url = f"https://api.cloudinary.com/v1_1/{cloud}/{resource}/upload"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                upload_url,
                data={
                    "api_key": api_key,
                    "timestamp": ts,
                    "signature": signature,
                    "folder": folder,
                },
                files={"file": (safe_name, data, content_type)},
            )
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})

    if r.status_code >= 400:
        err_text = (r.text or "").strip()
        if len(err_text) > 400:
            err_text = err_text[:400] + "…"
        return JSONResponse(
            status_code=502,
            content={"success": False, "message": f"Cloudinary upload failed ({r.status_code}): {err_text or r.reason_phrase}"},
        )

    try:
        body = r.json()
    except Exception:
        return JSONResponse(status_code=502, content={"success": False, "message": "Cloudinary returned invalid JSON"})

    public_url = str(body.get("secure_url") or body.get("url") or "").strip()
    if not public_url:
        return JSONResponse(status_code=502, content={"success": False, "message": "Cloudinary response missing URL"})

    return {"success": True, "url": public_url, "type": kind, "contentType": content_type}


def _supabase_hint(r: httpx.Response) -> str:
    upstream_text = (r.text or "").strip()
    if len(upstream_text) > 300:
        upstream_text = upstream_text[:300] + "…"
    hint = f"Supabase error ({r.status_code})"
    if upstream_text:
        hint = f"{hint}: {upstream_text}"
    return hint


def _status_map(code: int) -> int:
    return code if code in (400, 401, 403, 404, 406, 409) else 503


def _net_err_hint(err: Exception) -> str:
    msg = f"{type(err).__name__}: {err}".strip()
    if len(msg) > 300:
        msg = msg[:300] + "…"
    return f"Upstream network error: {msg}"


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


def _now_iso() -> str:
    # PostgREST accepts ISO timestamps for timestamptz columns.
    import datetime as _dt

    return _dt.datetime.now(tz=_dt.timezone.utc).isoformat()

def _normalize_group_role(role: Optional[str]) -> str:
    r = str(role or "").strip().lower()
    # Back-compat: older rows used "owner" for group creators.
    if r == "owner":
        return "admin"
    if r in ("admin", "member"):
        return r
    return "member"


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
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, headers=headers, params=params)
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})
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


@router.get("/presence/{user_id}")
async def get_presence(user_id: str, authorization: Optional[str] = Header(default=None)):
    """
    Returns a presence snapshot for a target user.
    RLS should enforce who can read presence rows (e.g., only chat members).
    """
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    target = str(user_id or "").strip()
    if not target:
        return JSONResponse(status_code=400, content={"success": False, "message": "user_id is required"})

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/presence"
    params: Dict[str, str] = {
        "select": "user_id,status,last_seen",
        "user_id": f"eq.{target}",
        "limit": "1",
    }
    # Use anon key + user access token so RLS is enforced.
    headers = {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, headers=headers, params=params)
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})
    if r.status_code >= 400:
        return JSONResponse(status_code=_status_map(r.status_code), content={"success": False, "message": _supabase_hint(r)})

    rows = await safe_json_list(r)
    row = rows[0] if rows else None
    if not row:
        return {"success": True, "presence": {"userId": target, "status": "offline", "last_seen": None}}

    return {
        "success": True,
        "presence": {
            "userId": row.get("user_id") or target,
            "status": row.get("status") or "offline",
            "last_seen": row.get("last_seen"),
        },
    }


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
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, headers=headers, params=params)
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})
    if r.status_code >= 400:
        return JSONResponse(status_code=503, content={"success": False, "message": "Groups are unavailable"})

    rows = await safe_json_list(r)
    groups = []
    for row in rows:
        chat = (row or {}).get("chats") or {}
        if not chat:
            continue
        groups.append(
            {
                "id": chat.get("id"),
                "name": chat.get("name") or chat.get("id"),
                "role": _normalize_group_role(row.get("role")),
            }
        )
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

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # Find existing group chat
            r_find = await client.get(
                chats_url,
                headers=postgrest_headers(use_service_role=True),
                params={"select": "id,name,type", "type": "eq.group", "name": f"eq.{group_key}", "limit": "1"},
            )
            if r_find.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_find.status_code), content={"success": False, "message": _supabase_hint(r_find)})
            items = await safe_json_list(r_find)
            chat = items[0] if items else None

            if not chat:
                r_create = await client.post(
                    chats_url,
                    headers=postgrest_headers(use_service_role=True, extra={"prefer": "return=representation"}),
                    json={"type": "group", "name": group_key, "created_by": uid},
                )
                if r_create.status_code >= 400:
                    return JSONResponse(status_code=_status_map(r_create.status_code), content={"success": False, "message": _supabase_hint(r_create)})
                created = await safe_json_list(r_create)
                chat = created[0] if created else None

            chat_id = (chat or {}).get("id")
            if not chat_id:
                return JSONResponse(status_code=503, content={"success": False, "message": "Could not open group"})

            r_member = await client.post(
                gm_url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "resolution=merge-duplicates,return=minimal"}),
                # WhatsApp-style: group creator is admin.
                json={"chat_id": chat_id, "user_id": uid, "role": "admin"},
            )
            # Some PostgREST setups return 200 for inserts depending on Prefer headers.
            if r_member.status_code not in (200, 201, 204, 409):
                return JSONResponse(status_code=_status_map(r_member.status_code), content={"success": False, "message": _supabase_hint(r_member)})
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})

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

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r_find = await client.get(
                chats_url,
                headers=postgrest_headers(use_service_role=True),
                params={"select": "id,name,type", "type": "eq.direct", "name": f"eq.{dm_key}", "limit": "1"},
            )
            if r_find.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_find.status_code), content={"success": False, "message": _supabase_hint(r_find)})
            items = await safe_json_list(r_find)
            chat = items[0] if items else None

            if not chat:
                r_create = await client.post(
                    chats_url,
                    headers=postgrest_headers(use_service_role=True, extra={"prefer": "return=representation"}),
                    json={"type": "direct", "name": dm_key, "created_by": uid},
                )
                if r_create.status_code >= 400:
                    return JSONResponse(status_code=_status_map(r_create.status_code), content={"success": False, "message": _supabase_hint(r_create)})
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
            if r_m1.status_code not in (200, 201, 204, 409):
                return JSONResponse(status_code=_status_map(r_m1.status_code), content={"success": False, "message": _supabase_hint(r_m1)})
            r_m2 = await client.post(
                gm_url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "resolution=merge-duplicates,return=minimal"}),
                json={"chat_id": chat_id, "user_id": peer_id, "role": "member"},
            )
            if r_m2.status_code not in (200, 201, 204, 409):
                return JSONResponse(status_code=_status_map(r_m2.status_code), content={"success": False, "message": _supabase_hint(r_m2)})
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})

    return {"success": True, "chatId": chat_id}


@router.get("/dm/recent")
async def list_recent_dms(authorization: Optional[str] = Header(default=None)):
    """
    Returns the "Recent chats" list for the current user (direct chats only).
    Uses service role for aggregation but requires a valid user token.
    """
    require_supabase()
    user, _access_token = await _require_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required"})

    base = SUPABASE_URL.rstrip("/")
    gm_url = f"{base}/rest/v1/group_members"
    chats_url = f"{base}/rest/v1/chats"
    users_url = f"{base}/rest/v1/users"
    settings_url = f"{base}/rest/v1/chat_settings"
    msgs_url = f"{base}/rest/v1/messages"

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            # 1) Fetch direct chat ids where user is member
            r_gm = await client.get(
                gm_url,
                headers=postgrest_headers(use_service_role=True),
                params={"select": "chat_id", "user_id": f"eq.{uid}", "limit": "200"},
            )
            if r_gm.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_gm.status_code), content={"success": False, "message": _supabase_hint(r_gm)})
            gm_rows = await safe_json_list(r_gm)
            chat_ids = [str(r.get("chat_id") or "").strip() for r in gm_rows if str(r.get("chat_id") or "").strip()]
            if not chat_ids:
                return {"success": True, "chats": []}

            # 2) Filter to direct chats
            r_chats = await client.get(
                chats_url,
                headers=postgrest_headers(use_service_role=True),
                params={"select": "id,type", "id": f"in.({','.join(chat_ids)})", "type": "eq.direct", "limit": "200"},
            )
            if r_chats.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_chats.status_code), content={"success": False, "message": _supabase_hint(r_chats)})
            chats = await safe_json_list(r_chats)
            direct_ids = [str(c.get("id") or "").strip() for c in chats if str(c.get("id") or "").strip()]
            if not direct_ids:
                return {"success": True, "chats": []}

            # 3) For each direct chat, find the peer (other member)
            r_peers = await client.get(
                gm_url,
                headers=postgrest_headers(use_service_role=True),
                params={"select": "chat_id,user_id", "chat_id": f"in.({','.join(direct_ids)})", "limit": "400"},
            )
            if r_peers.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_peers.status_code), content={"success": False, "message": _supabase_hint(r_peers)})
            peer_rows = await safe_json_list(r_peers)
            members_by_chat: dict[str, list[str]] = {}
            for row in peer_rows:
                cid = str(row.get("chat_id") or "").strip()
                mid = str(row.get("user_id") or "").strip()
                if not cid or not mid:
                    continue
                members_by_chat.setdefault(cid, []).append(mid)

            peer_ids: list[str] = []
            peer_by_chat: dict[str, str] = {}
            for cid in direct_ids:
                members = [m for m in members_by_chat.get(cid, []) if m and m != uid]
                peer = members[0] if members else ""
                if peer:
                    peer_by_chat[cid] = peer
                    peer_ids.append(peer)

            # 4) Peer profiles + chat settings in parallel (independent PostgREST calls).
            profiles_by_id: dict[str, dict] = {}
            settings_by_chat: dict[str, dict] = {}

            async def _fetch_peer_profiles() -> Optional[httpx.Response]:
                if not peer_ids:
                    return None
                return await client.get(
                    users_url,
                    headers=postgrest_headers(use_service_role=True),
                    params={"select": "id,username,avatar_url", "id": f"in.({','.join(sorted(set(peer_ids)))})", "limit": "200"},
                )

            async def _fetch_chat_settings() -> httpx.Response:
                return await client.get(
                    settings_url,
                    headers=postgrest_headers(use_service_role=True),
                    params={"select": "chat_id,archived,locked,hidden,last_read_at", "user_id": f"eq.{uid}", "chat_id": f"in.({','.join(direct_ids)})", "limit": "200"},
                )

            r_users, r_set = await asyncio.gather(_fetch_peer_profiles(), _fetch_chat_settings())
            if r_users is not None:
                if r_users.status_code >= 400:
                    return JSONResponse(status_code=_status_map(r_users.status_code), content={"success": False, "message": _supabase_hint(r_users)})
                for u in await safe_json_list(r_users):
                    pid = str((u or {}).get("id") or "").strip()
                    if pid:
                        profiles_by_id[pid] = u or {}
            if r_set.status_code < 400:
                for s in await safe_json_list(r_set):
                    cid = str((s or {}).get("chat_id") or "").strip()
                    if cid:
                        settings_by_chat[cid] = s or {}

            # 5) Last message + unread per chat (parallel: was 2 sequential HTTP calls × N chats).
            sem = asyncio.Semaphore(20)

            async def fetch_recent_row(cid: str) -> Optional[dict]:
                peer = peer_by_chat.get(cid, "")
                prof = profiles_by_id.get(peer, {}) if peer else {}
                s = settings_by_chat.get(cid, {}) or {}
                if s.get("hidden") is True:
                    return None
                last_read = s.get("last_read_at") or "1970-01-01T00:00:00Z"
                async with sem:
                    r_last, r_unread = await asyncio.gather(
                        client.get(
                            msgs_url,
                            headers=postgrest_headers(use_service_role=True),
                            params={
                                "select": "id,content,sender_id,created_at,is_deleted",
                                "chat_id": f"eq.{cid}",
                                "order": "created_at.desc",
                                "limit": "1",
                            },
                        ),
                        client.get(
                            msgs_url,
                            headers=postgrest_headers(use_service_role=True),
                            params={
                                "select": "id",
                                "chat_id": f"eq.{cid}",
                                "sender_id": f"neq.{uid}",
                                "created_at": f"gt.{last_read}",
                                "limit": "200",
                            },
                        ),
                    )
                if r_last.status_code >= 400:
                    return None
                last_rows = await safe_json_list(r_last)
                last = last_rows[0] if last_rows else {}
                last_msg = "" if not last else ("" if last.get("is_deleted") else (last.get("content") or ""))
                last_at = last.get("created_at") or None
                unread = 0
                if r_unread.status_code < 400:
                    unread = len(await safe_json_list(r_unread))
                return {
                    "threadId": cid,
                    "peerId": peer,
                    "peerUsername": prof.get("username") or (peer[:6] + "…" if peer else ""),
                    "lastMessage": last_msg,
                    "lastAt": last_at,
                    "unreadCount": unread,
                    "archived": bool(s.get("archived")),
                    "locked": bool(s.get("locked")),
                }

            row_results = await asyncio.gather(*(fetch_recent_row(cid) for cid in direct_ids))
            items = [row for row in row_results if row is not None]

            # Sort by lastAt desc, fallback stable
            items.sort(key=lambda x: (x.get("lastAt") or ""), reverse=True)
            return {"success": True, "chats": items[:60]}
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})


@router.post("/dm/recent/read")
async def mark_recent_read(req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, _access_token = await _require_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required"})

    body = await req.json()
    chat_id = str((body or {}).get("threadId") or (body or {}).get("chatId") or "").strip()
    if not chat_id:
        return JSONResponse(status_code=400, content={"success": False, "message": "threadId is required"})

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/chat_settings"
    payload = {"chat_id": chat_id, "user_id": uid, "last_read_at": _now_iso(), "updated_at": _now_iso()}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "resolution=merge-duplicates,return=minimal"}),
                json=payload,
            )
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})
    if r.status_code not in (200, 201, 204, 409):
        return JSONResponse(status_code=_status_map(r.status_code), content={"success": False, "message": _supabase_hint(r)})
    return {"success": True}


@router.post("/dm/recent/settings")
async def set_recent_settings(req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, _access_token = await _require_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required"})

    body = await req.json()
    chat_id = str((body or {}).get("threadId") or (body or {}).get("chatId") or "").strip()
    if not chat_id:
        return JSONResponse(status_code=400, content={"success": False, "message": "threadId is required"})
    archived = body.get("archived")
    locked = body.get("locked")
    hidden = body.get("hidden")

    patch: dict[str, object] = {"chat_id": chat_id, "user_id": uid, "updated_at": _now_iso()}
    if archived is not None:
        patch["archived"] = bool(archived)
    if locked is not None:
        patch["locked"] = bool(locked)
    if hidden is not None:
        patch["hidden"] = bool(hidden)

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/chat_settings"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "resolution=merge-duplicates,return=minimal"}),
                json=patch,
            )
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})
    if r.status_code not in (200, 201, 204, 409):
        return JSONResponse(status_code=_status_map(r.status_code), content={"success": False, "message": _supabase_hint(r)})
    return {"success": True}


@router.get("/groups/{group_id}/members")
async def list_group_members(group_id: str, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    gid = str(group_id or "").strip()
    if not gid:
        return JSONResponse(status_code=400, content={"success": False, "message": "groupId is required"})

    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required"})

    base = SUPABASE_URL.rstrip("/")
    gm_url = f"{base}/rest/v1/group_members"
    users_url = f"{base}/rest/v1/users"

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            # 1) Fetch membership rows for this group (service role).
            r_gm = await client.get(
                gm_url,
                headers=postgrest_headers(use_service_role=True),
                params={"select": "user_id,role", "chat_id": f"eq.{gid}", "limit": "200"},
            )
            if r_gm.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_gm.status_code), content={"success": False, "message": _supabase_hint(r_gm)})
            rows = await safe_json_list(r_gm)

            # Enforce: caller must be a member
            if not any(str((r or {}).get("user_id") or "").strip() == uid for r in rows):
                return JSONResponse(status_code=403, content={"success": False, "message": "You are not a member of this group"})

            user_ids = [str((r or {}).get("user_id") or "").strip() for r in rows if str((r or {}).get("user_id") or "").strip()]
            profiles_by_id: dict[str, dict] = {}
            if user_ids:
                r_users = await client.get(
                    users_url,
                    headers=postgrest_headers(use_service_role=True),
                    params={"select": "id,username,avatar_url,created_at", "id": f"in.({','.join(sorted(set(user_ids)))})", "limit": "200"},
                )
                if r_users.status_code >= 400:
                    return JSONResponse(status_code=_status_map(r_users.status_code), content={"success": False, "message": _supabase_hint(r_users)})
                for u in await safe_json_list(r_users):
                    pid = str((u or {}).get("id") or "").strip()
                    if pid:
                        profiles_by_id[pid] = u or {}

            members = []
            for row in rows:
                mid = str((row or {}).get("user_id") or "").strip()
                members.append(
                    {
                        "userId": mid,
                        "role": _normalize_group_role((row or {}).get("role")),
                        "user": profiles_by_id.get(mid) or {"id": mid, "username": None, "avatar_url": None, "created_at": None},
                    }
                )
            return {"success": True, "groupId": gid, "members": members}
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})


@router.post("/groups/{group_id}/members/add-by-username")
async def add_group_member_by_username(group_id: str, req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    gid = str(group_id or "").strip()
    if not gid:
        return JSONResponse(status_code=400, content={"success": False, "message": "groupId is required"})

    body = await req.json()
    username = str((body or {}).get("username") or "").strip()
    if not username:
        return JSONResponse(status_code=400, content={"success": False, "message": "username is required"})

    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(
            status_code=503,
            content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required for member writes"},
        )

    users_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/users"
    gm_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"

    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1) Ensure caller is already a member (prevent arbitrary adds)
        r_mem = await client.get(
            gm_url,
            headers=postgrest_headers(use_service_role=True),
            params={"select": "chat_id,user_id,role", "chat_id": f"eq.{gid}", "user_id": f"eq.{uid}", "limit": "1"},
        )
        if r_mem.status_code >= 400:
            return JSONResponse(status_code=_status_map(r_mem.status_code), content={"success": False, "message": _supabase_hint(r_mem)})
        mem_rows = await safe_json_list(r_mem)
        if not mem_rows:
            return JSONResponse(status_code=403, content={"success": False, "message": "You are not a member of this group"})
        caller_role = _normalize_group_role((mem_rows[0] or {}).get("role"))
        if caller_role != "admin":
            return JSONResponse(status_code=403, content={"success": False, "message": "Admin only"})

        # 2) Lookup user by username
        r_user = await client.get(
            users_url,
            headers=postgrest_headers(use_service_role=True),
            params={"select": "id,username,avatar_url,created_at", "username": f"eq.{username}", "limit": "1"},
        )
        if r_user.status_code >= 400:
            return JSONResponse(status_code=_status_map(r_user.status_code), content={"success": False, "message": _supabase_hint(r_user)})
        found = await safe_json_list(r_user)
        target = found[0] if found else None
        if not target or not target.get("id"):
            return JSONResponse(status_code=404, content={"success": False, "message": "User not found"})

        target_id = str(target.get("id")).strip()

        # 3) Insert membership (idempotent)
        r_add = await client.post(
            gm_url,
            headers=postgrest_headers(use_service_role=True, extra={"prefer": "resolution=merge-duplicates,return=minimal"}),
            json={"chat_id": gid, "user_id": target_id, "role": "member"},
        )
        if r_add.status_code not in (200, 201, 204, 409):
            return JSONResponse(status_code=_status_map(r_add.status_code), content={"success": False, "message": _supabase_hint(r_add)})

    return {"success": True, "member": {"userId": target_id, "role": "member", "user": target}}


@router.post("/groups/{group_id}/members/remove")
async def remove_group_member(group_id: str, req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    gid = str(group_id or "").strip()
    if not gid:
        return JSONResponse(status_code=400, content={"success": False, "message": "groupId is required"})

    body = await req.json()
    target_user_id = str((body or {}).get("userId") or (body or {}).get("memberId") or "").strip()
    if not target_user_id:
        return JSONResponse(status_code=400, content={"success": False, "message": "userId is required"})

    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required for member writes"})

    chats_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/chats"
    gm_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"
    headers = postgrest_headers(use_service_role=True)

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # Admin check
            r_mem = await client.get(
                gm_url,
                headers=headers,
                params={"select": "role", "chat_id": f"eq.{gid}", "user_id": f"eq.{uid}", "limit": "1"},
            )
            if r_mem.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_mem.status_code), content={"success": False, "message": _supabase_hint(r_mem)})
            mem_rows = await safe_json_list(r_mem)
            if not mem_rows:
                return JSONResponse(status_code=403, content={"success": False, "message": "You are not a member of this group"})
            if _normalize_group_role((mem_rows[0] or {}).get("role")) != "admin":
                return JSONResponse(status_code=403, content={"success": False, "message": "Admin only"})

            # Prevent removing creator/admin-of-record: check created_by
            r_chat = await client.get(
                chats_url,
                headers=headers,
                params={"select": "id,created_by", "id": f"eq.{gid}", "limit": "1"},
            )
            if r_chat.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_chat.status_code), content={"success": False, "message": _supabase_hint(r_chat)})
            chats = await safe_json_list(r_chat)
            chat = chats[0] if chats else None
            created_by = str((chat or {}).get("created_by") or "").strip()
            if created_by and target_user_id == created_by:
                return JSONResponse(status_code=400, content={"success": False, "message": "Cannot remove group creator"})

            r_del = await client.delete(
                gm_url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "return=minimal"}),
                params={"chat_id": f"eq.{gid}", "user_id": f"eq.{target_user_id}"},
            )
            if r_del.status_code not in (200, 204):
                return JSONResponse(status_code=_status_map(r_del.status_code), content={"success": False, "message": _supabase_hint(r_del)})
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})

    return {"success": True}


@router.post("/groups/{group_id}/members/set-role")
async def set_group_member_role(group_id: str, req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    gid = str(group_id or "").strip()
    if not gid:
        return JSONResponse(status_code=400, content={"success": False, "message": "groupId is required"})

    body = await req.json()
    target_user_id = str((body or {}).get("userId") or "").strip()
    role = _normalize_group_role((body or {}).get("role"))
    if not target_user_id:
        return JSONResponse(status_code=400, content={"success": False, "message": "userId is required"})

    if role not in ("admin", "member"):
        return JSONResponse(status_code=400, content={"success": False, "message": "Invalid role"})

    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required for member writes"})

    chats_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/chats"
    gm_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/group_members"
    headers = postgrest_headers(use_service_role=True)

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # Admin check
            r_mem = await client.get(
                gm_url,
                headers=headers,
                params={"select": "role", "chat_id": f"eq.{gid}", "user_id": f"eq.{uid}", "limit": "1"},
            )
            if r_mem.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_mem.status_code), content={"success": False, "message": _supabase_hint(r_mem)})
            mem_rows = await safe_json_list(r_mem)
            if not mem_rows:
                return JSONResponse(status_code=403, content={"success": False, "message": "You are not a member of this group"})
            if _normalize_group_role((mem_rows[0] or {}).get("role")) != "admin":
                return JSONResponse(status_code=403, content={"success": False, "message": "Admin only"})

            # Prevent demoting creator
            r_chat = await client.get(
                chats_url,
                headers=headers,
                params={"select": "id,created_by", "id": f"eq.{gid}", "limit": "1"},
            )
            if r_chat.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_chat.status_code), content={"success": False, "message": _supabase_hint(r_chat)})
            chats = await safe_json_list(r_chat)
            chat = chats[0] if chats else None
            created_by = str((chat or {}).get("created_by") or "").strip()
            if created_by and target_user_id == created_by and role != "admin":
                return JSONResponse(status_code=400, content={"success": False, "message": "Creator must remain admin"})

            r_up = await client.post(
                gm_url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "resolution=merge-duplicates,return=minimal"}),
                json={"chat_id": gid, "user_id": target_user_id, "role": role},
            )
            if r_up.status_code not in (200, 201, 204, 409):
                return JSONResponse(status_code=_status_map(r_up.status_code), content={"success": False, "message": _supabase_hint(r_up)})
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})

    return {"success": True, "member": {"userId": target_user_id, "role": role}}


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

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r_mem = await client.get(
                gm_url,
                headers=postgrest_headers(use_service_role=True),
                params={"select": "chat_id,user_id", "chat_id": f"eq.{chat_id}", "user_id": f"eq.{uid}", "limit": "1"},
            )
            if r_mem.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_mem.status_code), content={"success": False, "message": _supabase_hint(r_mem)})
            rows = await safe_json_list(r_mem)
            if not rows:
                return JSONResponse(status_code=403, content={"success": False, "message": "You are not a member of this chat"})

            r_ins = await client.post(
                msg_url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "return=representation"}),
                json={"chat_id": chat_id, "sender_id": uid, "content": content, "type": msg_type},
            )
            if r_ins.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_ins.status_code), content={"success": False, "message": _supabase_hint(r_ins)})
            created = await safe_json_list(r_ins)
            msg = created[0] if created else None
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})

    if not msg:
        return JSONResponse(status_code=503, content={"success": False, "message": "Could not save message"})

    return {"success": True, "message": msg}

@router.get("/messages/{chat_id}")
async def get_messages(chat_id: str, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/messages"
    params = {
        "select": "id,chat_id,sender_id,content,type,is_deleted,deleted_at,deleted_by,created_at",
        "chat_id": f"eq.{chat_id}",
        "order": "created_at.asc",
        "limit": "200",
    }
    headers = {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, headers=headers, params=params)
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})
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
    messages = await safe_json_list(r)

    # Apply "delete for me" filter (hidden messages).
    # Requires table `hidden_messages(user_id, chat_id, message_id, created_at)`.
    try:
        if messages:
            hide_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/hidden_messages"
            headers_hide = (
                postgrest_headers(use_service_role=True)
                if SUPABASE_SERVICE_ROLE_KEY
                else {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}"}
            )
            params_hide = {
                "select": "message_id",
                "user_id": f"eq.{uid}",
                "chat_id": f"eq.{chat_id}",
                "limit": "2000",
            }
            async with httpx.AsyncClient(timeout=20.0) as client:
                r_hide = await client.get(hide_url, headers=headers_hide, params=params_hide)
            if r_hide.status_code < 400:
                hidden_rows = await safe_json_list(r_hide)
                hidden_ids = {str((row or {}).get("message_id") or "").strip() for row in hidden_rows}
                hidden_ids = {x for x in hidden_ids if x}
                if hidden_ids:
                    messages = [m for m in messages if str((m or {}).get("id") or "").strip() not in hidden_ids]
    except Exception:
        pass

    # Attach reaction aggregation (emoji -> { userId: true }) so clients can render
    # consistent reaction pills and they survive refresh.
    try:
        ids = [str((m or {}).get("id") or "").strip() for m in (messages or [])]
        ids = [i for i in ids if i]
        if ids:
            rx_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/message_reactions"
            headers_rx = (
                postgrest_headers(use_service_role=True)
                if SUPABASE_SERVICE_ROLE_KEY
                else {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}"}
            )
            params_rx = {
                "select": "message_id,user_id,emoji",
                "message_id": f"in.({','.join(ids)})",
                "limit": "2000",
            }
            async with httpx.AsyncClient(timeout=20.0) as client:
                r_rx = await client.get(rx_url, headers=headers_rx, params=params_rx)
            if r_rx.status_code < 400:
                rows = await safe_json_list(r_rx)
                agg: Dict[str, Dict[str, Dict[str, bool]]] = {}
                for row in rows:
                    mid = str((row or {}).get("message_id") or "").strip()
                    uid = str((row or {}).get("user_id") or "").strip()
                    emoji = str((row or {}).get("emoji") or "").strip()
                    if not mid or not uid or not emoji:
                        continue
                    agg.setdefault(mid, {}).setdefault(emoji, {})[uid] = True
                for m in messages:
                    mid = str((m or {}).get("id") or "").strip()
                    if mid:
                        m["reactions"] = agg.get(mid, {})
    except Exception:
        # Best-effort only; messages should still load if reactions fail.
        pass

    return {"success": True, "chatId": chat_id, "messages": messages}


@router.post("/messages/{message_id}/delete")
async def delete_message_for_everyone(message_id: str, authorization: Optional[str] = Header(default=None)):
    """
    Soft-delete a message (delete for everyone).
    """
    require_supabase()
    user, _access_token = await _require_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required"})

    base = SUPABASE_URL.rstrip("/")
    msg_url = f"{base}/rest/v1/messages"
    headers = postgrest_headers(use_service_role=True, extra={"prefer": "return=representation"})
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # Ensure sender owns the message
            r_get = await client.get(
                msg_url,
                headers=postgrest_headers(use_service_role=True),
                params={"select": "id,sender_id,chat_id,is_deleted", "id": f"eq.{message_id}", "limit": "1"},
            )
            if r_get.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_get.status_code), content={"success": False, "message": _supabase_hint(r_get)})
            rows = await safe_json_list(r_get)
            msg = rows[0] if rows else None
            if not msg:
                return JSONResponse(status_code=404, content={"success": False, "message": "Message not found"})
            if str(msg.get("sender_id") or "").strip() != uid:
                return JSONResponse(status_code=403, content={"success": False, "message": "Not allowed"})
            if msg.get("is_deleted") is True:
                return {"success": True, "message": msg}

            r_upd = await client.patch(
                msg_url,
                headers=headers,
                params={"id": f"eq.{message_id}"},
                json={"is_deleted": True, "deleted_by": uid, "deleted_at": _now_iso()},
            )
            if r_upd.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_upd.status_code), content={"success": False, "message": _supabase_hint(r_upd)})
            updated = await safe_json_list(r_upd)
            return {"success": True, "message": (updated[0] if updated else msg)}
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})


@router.post("/messages/{message_id}/edit")
async def edit_message(message_id: str, req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, _access_token = await _require_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required"})

    body = await req.json()
    content = str((body or {}).get("content") or "").strip()
    if not content:
        return JSONResponse(status_code=400, content={"success": False, "message": "content is required"})

    base = SUPABASE_URL.rstrip("/")
    msg_url = f"{base}/rest/v1/messages"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r_get = await client.get(
                msg_url,
                headers=postgrest_headers(use_service_role=True),
                params={"select": "id,sender_id,is_deleted", "id": f"eq.{message_id}", "limit": "1"},
            )
            if r_get.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_get.status_code), content={"success": False, "message": _supabase_hint(r_get)})
            rows = await safe_json_list(r_get)
            msg = rows[0] if rows else None
            if not msg:
                return JSONResponse(status_code=404, content={"success": False, "message": "Message not found"})
            if str(msg.get("sender_id") or "").strip() != uid:
                return JSONResponse(status_code=403, content={"success": False, "message": "Not allowed"})
            if msg.get("is_deleted") is True:
                return JSONResponse(status_code=409, content={"success": False, "message": "Message was deleted and cannot be edited"})

            r_upd = await client.patch(
                msg_url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "return=representation"}),
                params={"id": f"eq.{message_id}"},
                json={"content": content},
            )
            if r_upd.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_upd.status_code), content={"success": False, "message": _supabase_hint(r_upd)})
            updated = await safe_json_list(r_upd)
            return {"success": True, "message": (updated[0] if updated else msg)}
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})


@router.post("/messages/{message_id}/hide")
async def hide_message_for_me(message_id: str, authorization: Optional[str] = Header(default=None)):
    """
    "Delete for me": hide a message for the current user only.
    Requires table `hidden_messages(user_id, chat_id, message_id, created_at)`.
    """
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    if not SUPABASE_SERVICE_ROLE_KEY:
        return JSONResponse(status_code=503, content={"success": False, "message": "SUPABASE_SERVICE_ROLE_KEY is required"})

    base = SUPABASE_URL.rstrip("/")
    msg_url = f"{base}/rest/v1/messages"
    hide_url = f"{base}/rest/v1/hidden_messages"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r_get = await client.get(
                msg_url,
                headers=postgrest_headers(use_service_role=True),
                params={"select": "id,chat_id", "id": f"eq.{message_id}", "limit": "1"},
            )
            if r_get.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_get.status_code), content={"success": False, "message": _supabase_hint(r_get)})
            rows = await safe_json_list(r_get)
            msg = rows[0] if rows else None
            if not msg:
                return JSONResponse(status_code=404, content={"success": False, "message": "Message not found"})
            chat_id = str((msg or {}).get("chat_id") or "").strip()
            if not chat_id:
                return JSONResponse(status_code=503, content={"success": False, "message": "Message chat_id missing"})

            r_ins = await client.post(
                hide_url,
                headers=postgrest_headers(use_service_role=True, extra={"prefer": "resolution=merge-duplicates,return=minimal"}),
                json={"user_id": uid, "chat_id": chat_id, "message_id": message_id, "created_at": _now_iso()},
            )
            if r_ins.status_code not in (200, 201, 204, 409):
                return JSONResponse(status_code=_status_map(r_ins.status_code), content={"success": False, "message": _supabase_hint(r_ins)})
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})

    return {"success": True}


@router.get("/pins/{chat_id}")
async def list_pins(chat_id: str, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/pinned_messages"
    params = {
        "select": "chat_id,user_id,message_id,created_at,messages(id,content,sender_id,created_at,is_deleted)",
        "chat_id": f"eq.{chat_id}",
        "user_id": f"eq.{uid}",
        "order": "created_at.desc",
        "limit": "50",
    }
    headers = {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, headers=headers, params=params)
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})
    if r.status_code >= 400:
        return JSONResponse(status_code=_status_map(r.status_code), content={"success": False, "message": _supabase_hint(r)})
    rows = await safe_json_list(r)
    pins = []
    for row in rows:
        m = (row or {}).get("messages") or {}
        pins.append(
            {
                "messageId": row.get("message_id"),
                "chatId": row.get("chat_id"),
                "createdAt": row.get("created_at"),
                "content": m.get("content") or "",
            }
        )
    return {"success": True, "chatId": chat_id, "pins": pins}


@router.post("/pins/{chat_id}/pin")
async def pin_message(chat_id: str, req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    body = await req.json()
    message_id = str((body or {}).get("messageId") or "").strip()
    if not message_id:
        return JSONResponse(status_code=400, content={"success": False, "message": "messageId is required"})

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/pinned_messages"
    headers = {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}", "content-type": "application/json", "prefer": "resolution=merge-duplicates,return=minimal"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(url, headers=headers, json={"chat_id": chat_id, "user_id": uid, "message_id": message_id})
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})
    if r.status_code not in (200, 201, 204, 409):
        return JSONResponse(status_code=_status_map(r.status_code), content={"success": False, "message": _supabase_hint(r)})
    return {"success": True}


@router.post("/pins/{chat_id}/unpin")
async def unpin_message(chat_id: str, req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    body = await req.json()
    message_id = str((body or {}).get("messageId") or "").strip()
    if not message_id:
        return JSONResponse(status_code=400, content={"success": False, "message": "messageId is required"})

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/pinned_messages"
    headers = {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.delete(
                url,
                headers=headers,
                params={"chat_id": f"eq.{chat_id}", "user_id": f"eq.{uid}", "message_id": f"eq.{message_id}"},
            )
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})
    if r.status_code not in (200, 201, 204):
        return JSONResponse(status_code=_status_map(r.status_code), content={"success": False, "message": _supabase_hint(r)})
    return {"success": True}


@router.post("/reactions/toggle")
async def toggle_reaction(req: Request, authorization: Optional[str] = Header(default=None)):
    require_supabase()
    user, access_token = await _require_user(authorization)
    if not user or not access_token:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    uid = str(user.get("id") or "").strip()
    if not uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    body = await req.json()
    message_id = str((body or {}).get("messageId") or "").strip()
    emoji = str((body or {}).get("emoji") or "").strip()
    if not message_id or not emoji:
        return JSONResponse(status_code=400, content={"success": False, "message": "messageId and emoji are required"})

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/message_reactions"
    headers = {"apikey": postgrest_headers(use_service_role=False).get("apikey", ""), "authorization": f"Bearer {access_token}", "content-type": "application/json"}
    r_ins: Optional[httpx.Response] = None
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # PostgREST DELETE can succeed with 204 even when 0 rows match; don't use "delete-first" blindly.
            r_get = await client.get(
                url,
                headers=headers,
                params={
                    "select": "message_id,user_id,emoji",
                    "message_id": f"eq.{message_id}",
                    "user_id": f"eq.{uid}",
                    "emoji": f"eq.{emoji}",
                    "limit": "1",
                },
            )
            if r_get.status_code >= 400:
                return JSONResponse(status_code=_status_map(r_get.status_code), content={"success": False, "message": _supabase_hint(r_get)})
            existing = await safe_json_list(r_get)
            if existing:
                r_del = await client.delete(
                    url,
                    headers=headers,
                    params={"message_id": f"eq.{message_id}", "user_id": f"eq.{uid}", "emoji": f"eq.{emoji}"},
                )
                if r_del.status_code >= 400:
                    return JSONResponse(status_code=_status_map(r_del.status_code), content={"success": False, "message": _supabase_hint(r_del)})
                return {"success": True, "active": False}

            r_ins = await client.post(
                url,
                headers={**headers, "prefer": "resolution=merge-duplicates,return=minimal"},
                json={"message_id": message_id, "user_id": uid, "emoji": emoji},
            )
    except Exception as e:
        return JSONResponse(status_code=503, content={"success": False, "message": _net_err_hint(e)})
    if r_ins is None:
        return JSONResponse(status_code=500, content={"success": False, "message": "Reaction toggle failed"})
    if r_ins.status_code not in (200, 201, 204, 409):
        return JSONResponse(status_code=_status_map(r_ins.status_code), content={"success": False, "message": _supabase_hint(r_ins)})
    return {"success": True, "active": True}


@router.get("/debug/supabase")
async def debug_supabase(authorization: Optional[str] = Header(default=None)):
    """
    Production-safe debugging endpoint:
    - Requires a valid user access token (so it's not public)
    - Does NOT return secrets
    - Checks whether Supabase PostgREST is reachable and expected tables exist
    """
    require_supabase()
    user, _access_token = await _require_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    base = SUPABASE_URL.rstrip("/")
    rest = f"{base}/rest/v1"

    checks: Dict[str, Any] = {
        "supabaseUrl": base,
        "hasServiceRoleKey": bool(SUPABASE_SERVICE_ROLE_KEY),
        "tables": {},
    }

    # Prefer service role to bypass RLS for existence checks.
    headers = postgrest_headers(use_service_role=bool(SUPABASE_SERVICE_ROLE_KEY))

    async def _check_table(name: str) -> Dict[str, Any]:
        url = f"{rest}/{name}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(url, headers=headers, params={"select": "*", "limit": "1"})
        except Exception as e:
            return {"ok": False, "status": 0, "message": _net_err_hint(e)}
        if r.status_code >= 400:
            return {"ok": False, "status": r.status_code, "message": _supabase_hint(r)}
        return {"ok": True, "status": r.status_code}

    for table in ("users", "chats", "group_members", "messages"):
        checks["tables"][table] = await _check_table(table)

    ok = all(bool((checks["tables"][t] or {}).get("ok")) for t in checks["tables"])
    return JSONResponse(status_code=200 if ok else 503, content={"success": ok, "checks": checks})

