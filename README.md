# D-LITE

Monorepo for the D-LITE app (frontend + API gateway + microservices).

## Services

- **Frontend (Next.js)**: `http://localhost:3000`
- **API Gateway**: `http://localhost:4000`
- **Auth service**: `http://localhost:4001`
- **Chat service**: `http://localhost:4002`
- **Call service**: `http://localhost:4003`
- **Media service**: `http://localhost:4004`

The gateway proxies:

- `/auth/*` → auth-service
- `/chat/*` → chat-service
- `/call/*` → call-service
- `/media/*` → media-service

## Environment

Copy `.env.example` to `.env` in repo root and update values:

```bash
cp .env.example .env
```

### Required for full functionality

- **Supabase**
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (needed by backup worker; chat service can use it too)
- **MongoDB** (needed by backup worker)
  - `MONGODB_URI`

### Optional

- **Cloudinary** (needed for media upload/delete)
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`

If you don’t set these, services will still start, but the related features will respond with `503` until configured.

## Run with Docker

From repo root:

```bash
docker compose up --build
```

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

## Health checks (smoke test)

```bash
curl -sS http://localhost:3000/health
curl -sS http://localhost:4000/health
curl -sS http://localhost:4000/auth/health
curl -sS http://localhost:4000/chat/health
curl -sS http://localhost:4000/call/health
curl -sS http://localhost:4000/media/health
```
