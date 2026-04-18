# Environment variables (Supabase Auth setup)

This project is configured to use **Supabase Auth** (no local-auth fallback).

## Common Supabase variables (backend services)

- **`SUPABASE_URL`**: your project URL (example: `https://xxxxx.supabase.co`)
- **`SUPABASE_ANON_KEY`**: anon/public key (safe to use in client, but here used server-side too)
- **`SUPABASE_SERVICE_ROLE_KEY`**: service role key (**server-only**) for privileged writes (required for some server endpoints)

## `core-backend` (FastAPI REST)

### Required
- **`PORT`**: default `4000`
- **`CORS_ORIGINS`**: comma-separated allowed origins (example: `https://app.example.com`)
- **`SUPABASE_URL`**
- **`SUPABASE_ANON_KEY`**

### Recommended
- **`SUPABASE_SERVICE_ROLE_KEY`**: required for `POST /chat/groups/ensure` (server-side writes)

## `realtime-service` (Socket.IO)

### Required
- **`PORT`**: default `4003`
- **`SOCKET_IO_CORS_ORIGINS`**: `*` or comma-separated list of allowed origins
- **`SUPABASE_URL`**
- **`SUPABASE_ANON_KEY`**

## `frontend-service` (Next.js)

### Required (public)
- **`NEXT_PUBLIC_API_BASE_URL`**: where `core-backend` is reachable
- **`NEXT_PUBLIC_CHAT_SOCKET_URL`**: where `realtime-service` is reachable
- **`NEXT_PUBLIC_CALL_SOCKET_URL`**: usually same as chat socket URL
- **`NEXT_PUBLIC_SUPABASE_URL`**
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**

### WebRTC / calls (public)

- **`NEXT_PUBLIC_ICE_SERVERS_JSON`**: JSON array passed to `RTCPeerConnection` (`iceServers`). Default in code is Google STUN only.
  - **LAN / quick tests**: `[{"urls":["stun:stun.l.google.com:19302"]}]` (same as root `.env.example`).
  - **Many mobile or strict NAT networks**: add a **TURN** server (e.g. coturn, Twilio, Cloudflare) so media can relay when UDP peer-to-peer fails. Example shape:
    - `[{"urls":["stun:stun.l.google.com:19302"]},{"urls":"turn:turn.example.com:3478","username":"your-user","credential":"your-secret"}]`
  - Keep secrets out of git; set in deployment env or `.env.local`.

## `worker-service` (backups)

This service periodically exports messages from Supabase and writes them to disk (JSON files).

### Required
- **`SUPABASE_URL`**
- **`SUPABASE_SERVICE_ROLE_KEY`** (required)

### Worker settings
- **`PORT`**: default `10000` (only for the status server)
- **`WORKER_HTTP_ENABLED`**: `1` to expose `/health` + `/status` (default `1`)
- **`BACKUP_INTERVAL_SECONDS`**: default `300`
- **`BACKUP_BATCH_SIZE`**: default `500`
- **`BACKUP_OUTPUT_DIR`**: default `/data`
- **`BACKUP_STATE_FILE`**: default `/data/state.json`

