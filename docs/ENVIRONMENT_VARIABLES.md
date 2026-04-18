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

- **`NEXT_PUBLIC_ICE_SERVERS_JSON`**: JSON array passed to `RTCPeerConnection` (`iceServers`). Default in code is Google STUN only. **Restart `next dev` / rebuild after changing this** (Next inlines `NEXT_PUBLIC_*` at build time).
  - **LAN / quick tests**: `[{"urls":["stun:stun.l.google.com:19302"]}]` (same as root `.env.example`).
  - **Many mobile or strict NAT networks**: add a **TURN** server (e.g. coturn, Twilio, Cloudflare) so media can relay when UDP peer-to-peer fails. If the browser shows *ICE failed, add a TURN server*, you are in this case. Example shape (UDP + TLS; match ports to your coturn config):
    - `[{"urls":["stun:stun.l.google.com:19302"]},{"urls":["turn:turn.example.com:3478","turns:turn.example.com:5349"],"username":"your-user","credential":"your-secret"}]`
  - Keep secrets out of git; set in deployment env or `.env.local`.

#### Deploy checklist (e.g. Vercel + Render)

- **Socket.IO**: Set `NEXT_PUBLIC_CHAT_SOCKET_URL` / `NEXT_PUBLIC_CALL_SOCKET_URL` to your Render **HTTPS** origin (e.g. `https://dlite-chatapp.onrender.com`). On Render, set **`SOCKET_IO_CORS_ORIGINS`** to include your Vercel URL (e.g. `https://frontend-dlite.vercel.app`) so polling and WebSocket upgrades are allowed.
- **TURN “appears broken” in Firefox**: Usually means relay candidates failed (not missing). Verify: **valid TLS** for `turns:` (no self-signed without trust), **static username/password** match `coturn`, **listening ports** reachable from the public internet, and **both peers** get the same `NEXT_PUBLIC_ICE_SERVERS_JSON` after redeploy. Use **about:webrtc** → connection log for `relay` / error lines.

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

