# D-LITE

D-LITE is a real-time chat + calling app refactored into a **simplified 4-service architecture** with a modern Next.js frontend.

This repository contains:

- **frontend-service**: Next.js web app (UI + internal API routes for link preview / message backup).
- **core-backend**: merged REST backend for auth + chat reads + media uploads.
- **realtime-service**: Socket.IO service for chat realtime + WebRTC signaling.
- **worker-service**: background backup jobs (optional).
- **Database assets**: reference SQL schema and docs.

## Features

- **Authentication**
  - `core-backend` uses **Supabase Auth** (primary) with `/auth/me`.
  - If Supabase is unreachable in local setups, it can fall back to locally-issued JWTs (dev-friendly).
- **Direct & group chat**
  - `core-backend` provides REST reads and `realtime-service` provides Socket.IO realtime events.
  - When configured, messages are persisted in Supabase Postgres (`messages` table).
- **Calls**
  - WebRTC signaling via Socket.IO (`realtime-service`).
- **Media**
  - Media uploads to Cloudinary via `core-backend` (optional; runs in degraded mode when not configured).
- **Backups**
  - `worker-service` can sync Supabase messages into a JSONL backup volume (optional).

## Architecture (high level)

```text
Browser (Next.js)
  ├─ UI routes (/login, /dashboard, /groups, /call, /webrtc-call, /video-call)
  ├─ Internal API routes:
  │    ├─ /api/link-preview
  │    └─ /api/message-backup
  ├─ REST API -> core-backend (port 4000)
  │              ├─ /auth/*
  │              ├─ /chat/*
  │              └─ /media/*
  └─ WebSockets (Socket.IO) -> realtime-service (port 4003)
                 ├─ chat events
                 └─ call signaling events
```

## Services & ports

- **frontend-service (Next.js)**: `http://localhost:3000`
- **core-backend (REST)**: `http://localhost:4000`
- **realtime-service (Socket.IO)**: `http://localhost:4003`
- **worker-service (jobs)**: no HTTP port (writes backups to a volume)

## Repo structure

```text
core-backend/            # Auth + chat reads + media (FastAPI)
realtime-service/        # Chat realtime + call signaling (Socket.IO / ASGI)
worker-service/          # Backup worker (Python, optional)
frontend-service/         # Next.js frontend
database/                 # Reference schema/docs
docker-compose.yml        # Full stack (Docker)
.env.example              # Example env config
```

## Environment

Configuration is now unified via root `.env` (see `.env.example`).

For **production deployments where each service is hosted separately**, see `docs/ENVIRONMENT_VARIABLES.md`.

### Required for full functionality

- **Supabase (auth/chat storage/backups)**
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (for backups)

### Optional

- **Cloudinary (media uploads)**: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

- **Local auth fallback consistency**: set `AUTH_JWT_SECRET` (and keep it consistent across services)

If you don’t set optional values, services still start but related features may respond with `503` until configured.

## Run locally (without Docker)

Backend is now Python-based. You can still run locally, but Docker is recommended.

Notes:

- If Supabase/Mongo/Cloudinary env vars are missing, some services may run in **degraded mode** (health endpoints work, feature endpoints return `503`).

## Run with Docker

From repo root:

```bash
docker compose up --build
```

### Production notes (recommended)
- **Only expose** `frontend-service` (`3000`), `core-backend` (`4000`), and `realtime-service` (`4003`) publicly.
- Services include **healthchecks** and `depends_on: condition: service_healthy` for safer startup ordering.
- For production settings (stricter CORS + Socket.IO origins + tuned workers):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

See `docs/PRODUCTION.md` for a full checklist.

### Docker permission denied fix

If you see:
`permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`

Run:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

Then retry:

```bash
docker compose up --build
```

## API reference

### Auth

- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me` (requires `Authorization: Bearer <token>`)

### Chat

- `GET /chat/messages/:chatId` (requires `Authorization: Bearer <token>`)

### Media

- `POST /chat/media/upload` (multipart form-data, field: `file`; requires auth; stores on **Cloudinary**, returns `url` + `type`)
- Configure `core-backend`: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (server-only)

### Call (Socket.IO)

Connect with `userId` in handshake (`auth.userId` or query `userId`).

Events (client → server):

- `call_user` → `{ toUserId, callType: 'audio'|'video', offer: { type, sdp } }`
- `accept_call` → `{ toUserId, answer: { type, sdp } }` (callee → caller)
- `reject_call` → `{ toUserId, reason? }`
- `ice_candidate` → `{ toUserId, candidate: { candidate, sdpMid, sdpMLineIndex, usernameFragment? } }`
- `end_call` → `{ toUserId, reason? }`

Events (server → client):

- `call_user` (incoming offer), `call_answer`, `call_rejected`, `call_ice_candidate`, `call_ended`

## Health checks (smoke test)

```bash
curl -sS http://localhost:3000/health
curl -sS http://localhost:4000/health
curl -sS http://localhost:4000/auth/me
curl -sS http://localhost:4003/health
```

## Troubleshooting

- **Auth/Chat returns 503**
  - Set Supabase env vars in root `.env` and restart.
- **Media returns 503**
  - Set Cloudinary env vars in root `.env` and restart.
- **Backup disabled**
  - Set `SUPABASE_SERVICE_ROLE_KEY` in root `.env` and restart `worker-service`.
