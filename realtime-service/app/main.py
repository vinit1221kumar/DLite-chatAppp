from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from src.sockets.server import create_socket_app


def _parse_origins(value: str) -> list[str] | str:
    v = (value or "").strip()
    if not v or v == "*":
        return "*"
    return [o.strip() for o in v.split(",") if o.strip()]


app = FastAPI()

cors_origins = _parse_origins(os.getenv("SOCKET_IO_CORS_ORIGINS", "*"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if isinstance(cors_origins, list) else ["*"],
    allow_credentials=(cors_origins != "*"),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"success": True, "service": "realtime-service", "message": "D-Lite realtime is running"}


@app.get("/health")
async def health():
    return {"success": True, "service": "realtime-service", "status": "ok"}


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


# Serve Socket.IO at `/socket.io` alongside the FastAPI routes.
# (Do NOT mount under `/socket.io`, Socket.IO already uses that path.)
app = create_socket_app(cors_allowed_origins=cors_origins, other_asgi_app=app)

