import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorClient


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v else default


SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = _env("SUPABASE_SERVICE_ROLE_KEY")

MONGODB_URI = _env("MONGODB_URI")
MONGODB_DB_NAME = _env("MONGODB_DB_NAME", "d_lite_backup") or "d_lite_backup"
MONGODB_COLLECTION_NAME = _env("MONGODB_COLLECTION_NAME", "message_backups") or "message_backups"

BACKUP_INTERVAL_SECONDS = int(_env("BACKUP_INTERVAL_SECONDS", "300") or "300")
BACKUP_BATCH_SIZE = int(_env("BACKUP_BATCH_SIZE", "500") or "500")


def _looks_placeholder(v: Optional[str]) -> bool:
    if not v:
        return True
    s = v.strip()
    if not s:
        return True
    if "your-project" in s or "your-supabase" in s or "xxxx.supabase.co" in s or "..." in s:
        return True
    return False


def is_configured() -> bool:
    return not _looks_placeholder(SUPABASE_URL) and not _looks_placeholder(SUPABASE_SERVICE_ROLE_KEY) and not _looks_placeholder(MONGODB_URI)


def _sb_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY or "",
        "authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY or ''}",
    }
    if extra:
        headers.update(extra)
    return headers


async def ensure_indexes(col):
    await col.create_index("messageId", unique=True)
    await col.create_index([("createdAt", -1)])


async def fetch_messages(client: httpx.AsyncClient, last_synced_at: Optional[str]) -> List[Dict[str, Any]]:
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/messages"
    params = {
        "select": "id,chat_id,sender_id,content,type,created_at",
        "order": "created_at.asc",
        "limit": str(BACKUP_BATCH_SIZE),
    }
    if last_synced_at:
        params["created_at"] = f"gt.{last_synced_at}"

    r = await client.get(url, headers=_sb_headers(), params=params)
    r.raise_for_status()
    return r.json()


def to_backup_doc(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "messageId": row.get("id"),
        "chatId": row.get("chat_id"),
        "senderId": row.get("sender_id"),
        "content": row.get("content"),
        "type": row.get("type"),
        "createdAt": row.get("created_at"),
        "backedUpAt": datetime.now(timezone.utc).isoformat(),
    }


async def run_loop():
    if not is_configured():
        missing = []
        for k in ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MONGODB_URI"]:
            if _looks_placeholder(_env(k)):
                missing.append(k)
        print(f"[backup-worker] disabled mode (missing/placeholder env): {missing}")
        while True:
            await asyncio.sleep(3600)

    mongo = AsyncIOMotorClient(MONGODB_URI)
    db = mongo[MONGODB_DB_NAME]
    col = db[MONGODB_COLLECTION_NAME]
    await ensure_indexes(col)

    last_synced_at: Optional[str] = None

    timeout = httpx.Timeout(connect=5.0, read=30.0, write=30.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        while True:
            try:
                print(f"[backup-worker] job start lastSyncedAt={last_synced_at}")
                rows = await fetch_messages(client, last_synced_at)
                if not rows:
                    print("[backup-worker] no new messages")
                else:
                    ops = []
                    for row in rows:
                        doc = to_backup_doc(row)
                        ops.append(
                            {
                                "updateOne": {
                                    "filter": {"messageId": doc["messageId"]},
                                    "update": {"$set": doc},
                                    "upsert": True,
                                }
                            }
                        )

                    if ops:
                        result = await col.bulk_write(ops, ordered=False)
                        print(f"[backup-worker] upserts={getattr(result, 'upserted_count', None)} modified={getattr(result, 'modified_count', None)}")

                    last_synced_at = rows[-1].get("created_at") or last_synced_at
            except Exception as e:
                print(f"[backup-worker] job failed: {e}")

            await asyncio.sleep(BACKUP_INTERVAL_SECONDS)


def main():
    asyncio.run(run_loop())


if __name__ == "__main__":
    main()

