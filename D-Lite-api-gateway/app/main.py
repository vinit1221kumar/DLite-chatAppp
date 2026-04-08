import os
from typing import AsyncIterator, Optional

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v else default


GATEWAY_PORT = int(_env("GATEWAY_PORT", "4000") or "4000")
GATEWAY_CORS_ORIGIN = _env("GATEWAY_CORS_ORIGIN", "*")

AUTH_SERVICE_URL = _env("AUTH_SERVICE_URL", "http://localhost:4001")
CHAT_SERVICE_URL = _env("CHAT_SERVICE_URL", "http://localhost:4002")
CALL_SERVICE_URL = _env("CALL_SERVICE_URL", "http://localhost:4003")
MEDIA_SERVICE_URL = _env("MEDIA_SERVICE_URL", "http://localhost:4004")

SERVICE_MAP = {
    "auth": AUTH_SERVICE_URL,
    "chat": CHAT_SERVICE_URL,
    "call": CALL_SERVICE_URL,
    "media": MEDIA_SERVICE_URL,
}

app = FastAPI()


@app.get("/")
async def root():
    return {
        "success": True,
        "message": "D-Lite API Gateway is running",
        "services": {"auth": "/auth", "chat": "/chat", "call": "/call", "media": "/media"},
    }


@app.get("/health")
async def health():
    return {"success": True, "service": "api-gateway", "status": "ok"}


def _filter_headers(headers: httpx.Headers) -> dict:
    # Remove hop-by-hop headers.
    excluded = {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "host",
    }
    return {k: v for k, v in headers.items() if k.lower() not in excluded}


async def _iter_request_body(req: Request) -> AsyncIterator[bytes]:
    async for chunk in req.stream():
        yield chunk


@app.api_route("/{service}/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy(service: str, path: str, request: Request):
    target = SERVICE_MAP.get(service)
    if not target:
        return JSONResponse(status_code=404, content={"success": False, "message": f"Unknown service prefix: {service}"})

    url = f"{target.rstrip('/')}/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    timeout = httpx.Timeout(connect=5.0, read=60.0, write=60.0, pool=5.0)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        try:
            upstream = await client.request(
                method=request.method,
                url=url,
                headers=_filter_headers(request.headers),
                content=_iter_request_body(request),
            )
        except httpx.HTTPError:
            return JSONResponse(status_code=502, content={"success": False, "message": f"{service} service is unavailable"})

    # Stream the response body through.
    async def body_stream() -> AsyncIterator[bytes]:
        yield upstream.content

    return StreamingResponse(
        body_stream(),
        status_code=upstream.status_code,
        headers=_filter_headers(upstream.headers),
        media_type=upstream.headers.get("content-type"),
        background=None,
    )

