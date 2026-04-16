# Environment variables (production, per-service)

You said you’re deploying each service to a separate “site”/host. This doc lists **exact environment variables** each service needs.

## Common Supabase variables (used by backend services)

- **`SUPABASE_URL`**: Your Supabase project URL (like `https://xxxxx.supabase.co`)
- **`SUPABASE_ANON_KEY`**: Supabase anon/public API key
- **`SUPABASE_SERVICE_ROLE_KEY`**: Supabase service role key (**keep secret**, server-only)

Notes:
- **Never put `SUPABASE_SERVICE_ROLE_KEY` in the frontend.**
- Chat “user search” and server-side writes are most reliable when `SUPABASE_SERVICE_ROLE_KEY` is set on the server.

## `core-backend` (REST API)

### Required (recommended)
- **`PORT`**: HTTP port (default `4000`)
- **`CORS_ORIGINS`**: Comma-separated allowed origins (example: `https://app.example.com`)
- **`SUPABASE_URL`**
- **`SUPABASE_ANON_KEY`**
- **`SUPABASE_SERVICE_ROLE_KEY`**: recommended (enables server-side upserts/writes without RLS pain)
- **`AUTH_JWT_SECRET`**: recommended even with Supabase (local fallback consistency)

### Optional
- **`AUTH_MODE`**: `auto` (default) or `local` (force local auth fallback)
- **Cloudinary (media)**:
  - **`CLOUDINARY_CLOUD_NAME`**
  - **`CLOUDINARY_API_KEY`**
  - **`CLOUDINARY_API_SECRET`**
  - **`CLOUDINARY_FOLDER`** (default `d-lite/media`)
  - **`MAX_FILE_SIZE_MB`** (default `50`)
- **Uvicorn tuning**:
  - **`UVICORN_WORKERS`**
  - **`UVICORN_LOG_LEVEL`**
- **Local auth persistence (used for the local fallback user store)**:
  - **`LOCAL_AUTH_PERSISTENCE`**: `file` / `supabase` / `both` (default `file`)
  - **`LOCAL_AUTH_STATE_FILE`**: path to JSON file that stores the local fallback users (default `data/local_users.json`)
  - If `supabase` or `both` is enabled, the backend will use `public.local_users` (requires `SUPABASE_SERVICE_ROLE_KEY`)

### Minimal example

```bash
PORT=4000
CORS_ORIGINS=https://app.example.com

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

AUTH_JWT_SECRET=replace-with-strong-secret
```

## `realtime-service` (Socket.IO / WebRTC signaling)

### Required (recommended)
- **`PORT`**: HTTP port (default `4003`)
- **`SOCKET_IO_CORS_ORIGINS`**: `*` or comma-separated (example: `https://app.example.com`)
- **`SUPABASE_URL`**
- **`SUPABASE_ANON_KEY`** (or service role)
- **`SUPABASE_SERVICE_ROLE_KEY`**: recommended
- **`AUTH_JWT_SECRET`**: recommended (JWT fallback validation)

### Optional
- **`UVICORN_WORKERS`**
- **`UVICORN_LOG_LEVEL`**

### Minimal example

```bash
PORT=4003
SOCKET_IO_CORS_ORIGINS=https://app.example.com

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

AUTH_JWT_SECRET=replace-with-strong-secret
```

## `worker-service` (backups)

### Required (if you use backups)
- **`SUPABASE_URL`**
- **`SUPABASE_SERVICE_ROLE_KEY`** (required)

### Worker settings
- **`WORKER_HTTP_ENABLED`**: `1` to enable HTTP status endpoints (optional)
- **`PORT`**: worker HTTP port (only if HTTP enabled; platform may inject)
- **`BACKUP_INTERVAL_SECONDS`**: default `300`
- **`BACKUP_BATCH_SIZE`**: default `500`
- **`BACKUP_OUTPUT_DIR`**: default `/data`
- **`BACKUP_STATE_FILE`**: default `/data/state.json`

### Minimal example

```bash
WORKER_HTTP_ENABLED=1
PORT=10000

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

BACKUP_INTERVAL_SECONDS=300
BACKUP_BATCH_SIZE=500
BACKUP_OUTPUT_DIR=/data
BACKUP_STATE_FILE=/data/state.json
```

## `frontend-service` (Next.js)

### Required (public)
- **`NEXT_PUBLIC_API_BASE_URL`**: where `core-backend` is reachable (example: `https://api.example.com`)
- **`NEXT_PUBLIC_CHAT_SOCKET_URL`**: where `realtime-service` is reachable (example: `https://ws.example.com`)
- **`NEXT_PUBLIC_CALL_SOCKET_URL`**: usually same as chat socket URL
- **`NEXT_PUBLIC_SUPABASE_URL`**
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**

### Optional
- **`NEXT_PUBLIC_ICE_SERVERS_JSON`**: JSON string for STUN/TURN
- **Mongo (only if you use Next.js internal APIs like message backup)**:
  - **`MONGODB_URI`**
  - **`MONGODB_DB_NAME`**

### Important: build-time vs runtime

This frontend uses `NEXT_PUBLIC_*` at **build time** (Dockerfile has `ARG` → `ENV`). If you change these, you must **rebuild** the frontend.

### Minimal example

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_CHAT_SOCKET_URL=https://ws.example.com
NEXT_PUBLIC_CALL_SOCKET_URL=https://ws.example.com

NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

NEXT_PUBLIC_ICE_SERVERS_JSON=[{"urls":["stun:stun.l.google.com:19302"]}]
```

