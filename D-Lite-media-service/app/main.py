import os
from typing import Optional

import cloudinary
import cloudinary.uploader
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v else default


PORT = int(_env("PORT", "4004") or "4004")
MAX_FILE_SIZE_MB = int(_env("MAX_FILE_SIZE_MB", "50") or "50")

CLOUDINARY_CLOUD_NAME = _env("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = _env("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = _env("CLOUDINARY_API_SECRET")
CLOUDINARY_FOLDER = _env("CLOUDINARY_FOLDER", "d-lite/media") or "d-lite/media"


def is_cloudinary_configured() -> bool:
    return bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)


if is_cloudinary_configured():
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )


app = FastAPI()


@app.get("/")
async def root():
    return {"success": True, "service": "media-service", "message": "Media service is running"}


@app.get("/health")
async def health():
    return {"success": True, "service": "media-service", "status": "ok"}


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    if not is_cloudinary_configured():
        return JSONResponse(status_code=503, content={"success": False, "message": "Media storage is not configured"})

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(status_code=413, detail=f"File exceeds max size of {MAX_FILE_SIZE_MB}MB")

    result = cloudinary.uploader.upload(
        content,
        folder=CLOUDINARY_FOLDER,
        resource_type="auto",
    )

    return JSONResponse(
        status_code=201,
        content={
            "success": True,
            "message": "File uploaded successfully",
            "data": {
                "publicId": result.get("public_id"),
                "secureUrl": result.get("secure_url"),
                "resourceType": result.get("resource_type"),
                "format": result.get("format"),
                "bytes": result.get("bytes"),
            },
        },
    )


@app.delete("/delete")
async def delete(payload: dict):
    if not is_cloudinary_configured():
        return JSONResponse(status_code=503, content={"success": False, "message": "Media storage is not configured"})

    public_id = str(payload.get("publicId") or "").strip()
    resource_type = str(payload.get("resourceType") or "image").strip()
    if not public_id:
        raise HTTPException(status_code=400, detail="publicId is required")

    result = cloudinary.uploader.destroy(public_id, resource_type=resource_type)
    return {"success": True, "message": "File deleted successfully", "data": result}

