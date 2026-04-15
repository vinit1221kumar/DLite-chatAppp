## Production checklist (Docker Compose)

### 1) Set real secrets (root `.env`)
- Set **real** Supabase config:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (needed for backups / message writes)
- Set local auth fallback secret (recommended):
  - `AUTH_JWT_SECRET` (keep consistent across services)
- Optional (media uploads):
  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Optional (Mongo message backup via Next API routes):
  - `MONGODB_URI`, `MONGODB_DB_NAME` (set on `frontend-service`)

### 2) Only expose public ports
Default `docker-compose.yml` exposes:
- `frontend-service` on `3000`
- `core-backend` on `4000`
- `realtime-service` on `4003`

### 3) Run (recommended production overlay)
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose ps
```

### 4) Health checks
```bash
curl -fsS http://localhost:4000/health
curl -fsS http://localhost:4003/health
```

### 5) Put behind a reverse proxy (recommended)
Expose only 80/443 externally via Nginx/Caddy and route:
- `api.example.com` → `core-backend:4000`
- `ws.example.com` → `realtime-service:4003`
- `app.example.com` → `frontend-service:3000`

