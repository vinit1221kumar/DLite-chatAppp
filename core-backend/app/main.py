from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from src.modules.auth.router import router as auth_router
from src.modules.chat.router import router as chat_router
from src.modules.media.router import router as media_router


def _parse_origins(value: str) -> list[str]:
    v = (value or "").strip()
    if not v:
        return ["*"]
    if v == "*":
        return ["*"]
    return [o.strip() for o in v.split(",") if o.strip()]


app = FastAPI()

cors_origins = _parse_origins(os.getenv("CORS_ORIGINS", "http://localhost:3000"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=("*" not in cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "success": True,
        "service": "core-backend",
        "message": "D-Lite core backend is running",
        "routes": {"auth": "/auth", "chat": "/chat", "media": "/media"},
    }


@app.get("/health")
async def health():
    return {"success": True, "service": "core-backend", "status": "ok"}


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


app.include_router(auth_router, prefix="/auth")
app.include_router(chat_router, prefix="/chat")
app.include_router(media_router, prefix="/media")

