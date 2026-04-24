import httpx
from fastapi import HTTPException
from app.core.config import settings


async def transcribe_audio_file(audio_path: str) -> dict:
    """Transcribe audio file using Deepgram API."""
    if not settings.deepgram_api_key:
        raise HTTPException(
            status_code=500,
            detail="Deepgram API key not configured"
        )

    try:
        with open(audio_path, 'rb') as f:
            audio_data = f.read()
    except IOError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read audio file: {e}"
        ) from e

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.post(
                "https://api.deepgram.com/v1/listen",
                headers={
                    "Authorization": f"Token {settings.deepgram_api_key}",
                    "Content-Type": "application/octet-stream"
                },
                content=audio_data,
                params={
                    "model": "nova-2",
                    "smart_format": "true",
                    "language": "en"
                }
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Deepgram transcription failed: {e}"
            ) from e

    result = response.json()
    transcript = ""
    if result.get("results") and result["results"].get("channels"):
        for channel in result["results"]["channels"]:
            if channel.get("alternatives"):
                transcript = channel["alternatives"][0].get("transcript", "").strip()
                break

    return {
        "text": transcript,
        "language": "en"
    }


async def synthesize_text_to_wav_bytes(text: str) -> tuple[bytes, int]:
    """Synthesize text to speech using ElevenLabs API."""
    if not settings.elevenlabs_api_key:
        raise HTTPException(
            status_code=500,
            detail="ElevenLabs API key not configured"
        )

    if not settings.elevenlabs_voice_id:
        raise HTTPException(
            status_code=500,
            detail="ElevenLabs voice ID not configured"
        )

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{settings.elevenlabs_voice_id}",
                headers={
                    "xi-api-key": settings.elevenlabs_api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "text": text,
                    "model_id": "eleven_monolingual_v1",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75
                    }
                }
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=400,
                detail=f"ElevenLabs synthesis failed: {e}"
            ) from e

    audio_data = response.content
    sample_rate = 24000

    return audio_data, sample_rate