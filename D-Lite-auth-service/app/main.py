import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import bcrypt
import httpx
import jwt
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v else default


PORT = int(_env("PORT", "4001") or "4001")
SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_ANON_KEY = _env("SUPABASE_ANON_KEY")
AUTH_JWT_SECRET = _env("AUTH_JWT_SECRET") or _env("JWT_SECRET") or "dev-only-secret-change-me"


def _looks_placeholder(v: Optional[str]) -> bool:
    if not v:
        return True
    s = v.strip()
    if not s:
        return True
    if "your-project" in s or "your-supabase" in s:
        return True
    if "xxxx.supabase.co" in s or "example.supabase.co" in s:
        return True
    if "..." in s:
        return True
    return False


def is_supabase_configured() -> bool:
    return not _looks_placeholder(SUPABASE_URL) and not _looks_placeholder(SUPABASE_ANON_KEY)


@dataclass
class LocalUser:
    id: str
    email: str
    username: Optional[str]
    password_hash: str


_local_users_by_email: Dict[str, LocalUser] = {}
_local_users_by_username: Dict[str, LocalUser] = {}


def _hash_password(password: str) -> str:
    pw = password.encode("utf-8")
    hashed = bcrypt.hashpw(pw, bcrypt.gensalt(rounds=10))
    return hashed.decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def _issue_local_tokens(user: LocalUser) -> Dict[str, Any]:
    now = int(time.time())
    expires_in = 3600
    payload = {
        "sub": user.id,
        "email": user.email,
        "user_metadata": {"username": user.username},
        "iss": "d-lite-auth-service",
        "iat": now,
    }
    access_token = jwt.encode({**payload, "exp": now + expires_in}, AUTH_JWT_SECRET, algorithm="HS256")
    refresh_token = jwt.encode({**payload, "typ": "refresh", "exp": now + 60 * 60 * 24 * 30}, AUTH_JWT_SECRET, algorithm="HS256")
    return {
        "session": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": expires_in,
            "token_type": "bearer",
        },
        "user": {
            "id": user.id,
            "email": user.email,
            "user_metadata": {"username": user.username},
        },
    }


def _format_auth_response(auth_data: Dict[str, Any]) -> Dict[str, Any]:
    session = (auth_data or {}).get("session") or {}
    user = (auth_data or {}).get("user")
    return {
        "accessToken": session.get("access_token"),
        "refreshToken": session.get("refresh_token"),
        "expiresIn": session.get("expires_in"),
        "tokenType": session.get("token_type"),
        "user": user,
    }


def _supabase_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    headers = {
        "apikey": SUPABASE_ANON_KEY or "",
        "authorization": f"Bearer {SUPABASE_ANON_KEY or ''}",
        "content-type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


app = FastAPI()


@app.get("/")
async def root():
    return {"success": True, "service": "auth-service", "message": "Supabase auth service is running"}


@app.get("/health")
async def health():
    return {"success": True, "service": "auth-service", "status": "ok"}


@app.post("/signup")
async def signup(req: Request):
    body = await req.json()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    username = body.get("username")
    username_norm = str(username).strip() if username is not None else None

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    # Local fallback when Supabase is missing/unreachable.
    if not is_supabase_configured():
        if email in _local_users_by_email:
            return JSONResponse(status_code=409, content={"success": False, "message": "User already registered"})
        if username_norm and username_norm.lower() in _local_users_by_username:
            return JSONResponse(status_code=409, content={"success": False, "message": "Username already taken"})

        user = LocalUser(
            id=f"local_{int(time.time()*1000)}",
            email=email,
            username=username_norm,
            password_hash=_hash_password(password),
        )
        _local_users_by_email[email] = user
        if username_norm:
            _local_users_by_username[username_norm.lower()] = user

        auth_data = _issue_local_tokens(user)
        return JSONResponse(
            status_code=201,
            content={"success": True, "message": "Signup successful", "data": _format_auth_response(auth_data)},
        )

    payload: Dict[str, Any] = {"email": email, "password": password}
    if username_norm:
        payload["data"] = {"username": username_norm}

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/signup"
    timeout = httpx.Timeout(connect=5.0, read=30.0, write=30.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.post(url, headers=_supabase_headers(), json=payload)
        except httpx.HTTPError:
            # Network failure → local fallback
            user = LocalUser(
                id=f"local_{int(time.time()*1000)}",
                email=email,
                username=username_norm,
                password_hash=_hash_password(password),
            )
            _local_users_by_email[email] = user
            if username_norm:
                _local_users_by_username[username_norm.lower()] = user
            auth_data = _issue_local_tokens(user)
            return JSONResponse(status_code=201, content={"success": True, "message": "Signup successful", "data": _format_auth_response(auth_data)})

    if r.status_code >= 400:
        return JSONResponse(status_code=400, content={"success": False, "message": (r.json().get("msg") if r.headers.get("content-type","").startswith("application/json") else r.text) or "Signup failed"})

    data = r.json()
    # Supabase returns either {user, session} or {user} depending on email confirmation settings.
    return JSONResponse(status_code=201, content={"success": True, "message": "Signup successful", "data": _format_auth_response(data)})


@app.post("/login")
async def login(req: Request):
    body = await req.json()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    if not is_supabase_configured():
        user = _local_users_by_email.get(email)
        if not user or not _verify_password(password, user.password_hash):
            return JSONResponse(status_code=401, content={"success": False, "message": "Invalid email or password"})
        auth_data = _issue_local_tokens(user)
        return JSONResponse(status_code=200, content={"success": True, "message": "Login successful", "data": _format_auth_response(auth_data)})

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/token?grant_type=password"
    timeout = httpx.Timeout(connect=5.0, read=30.0, write=30.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.post(url, headers=_supabase_headers(), json={"email": email, "password": password})
        except httpx.HTTPError:
            user = _local_users_by_email.get(email)
            if not user or not _verify_password(password, user.password_hash):
                return JSONResponse(status_code=401, content={"success": False, "message": "Invalid email or password"})
            auth_data = _issue_local_tokens(user)
            return JSONResponse(status_code=200, content={"success": True, "message": "Login successful", "data": _format_auth_response(auth_data)})

    if r.status_code >= 400:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid email or password"})

    data = r.json()
    return JSONResponse(status_code=200, content={"success": True, "message": "Login successful", "data": _format_auth_response(data)})


@app.post("/otp/request")
async def otp_request(req: Request):
    if not is_supabase_configured():
        return JSONResponse(status_code=503, content={"success": False, "message": "OTP is unavailable (Supabase not configured)"})

    body = await req.json()
    email = str(body.get("email") or "").strip()
    redirect_to = body.get("redirectTo")
    if not email:
        return JSONResponse(status_code=400, content={"success": False, "message": "email is required"})

    payload: Dict[str, Any] = {"email": email, "create_user": False}
    if redirect_to:
        payload["redirect_to"] = redirect_to

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/otp"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, headers=_supabase_headers(), json=payload)
    if r.status_code >= 400:
        return JSONResponse(status_code=400, content={"success": False, "message": "OTP request failed"})
    return {"success": True, "message": "OTP sent to your email", "data": {"ok": True}}


@app.post("/otp/verify")
async def otp_verify(req: Request):
    if not is_supabase_configured():
        return JSONResponse(status_code=503, content={"success": False, "message": "OTP is unavailable (Supabase not configured)"})

    body = await req.json()
    email = str(body.get("email") or "").strip()
    token = str(body.get("token") or "").strip()
    if not email or not token:
        return JSONResponse(status_code=400, content={"success": False, "message": "email and token are required"})

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/verify"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, headers=_supabase_headers(), json={"type": "email", "email": email, "token": token})
    if r.status_code >= 400:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
    data = r.json()
    return {"success": True, "message": "OTP verified", "data": _format_auth_response(data)}


@app.get("/me")
async def me(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"success": False, "message": "Missing or invalid authorization header"})

    token = authorization.split(" ", 1)[1].strip()

    if not is_supabase_configured():
        try:
            payload = jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"])
        except Exception:
            return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})
        return {"success": True, "message": "Current user fetched successfully", "data": {"user": payload}}

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(url, headers=_supabase_headers({"authorization": f"Bearer {token}"}))
    if r.status_code >= 400:
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid token"})

    return {"success": True, "message": "Current user fetched successfully", "data": {"user": r.json()}}

