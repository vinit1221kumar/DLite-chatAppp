from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import Response

from app.core.config import settings
from app.models.schemas import ModelInfoResponse, SpeechToTextResponse, TextToSpeechRequest, VoiceChatResponse
from app.services.generator import build_friendly_reply
from app.services.speech import synthesize_text_to_wav_bytes, transcribe_audio_file

router = APIRouter(tags=["speech"])


@router.get("/models", response_model=ModelInfoResponse)
def models():
    return ModelInfoResponse()


@router.post("/speech-to-text", response_model=SpeechToTextResponse)
async def speech_to_text(audio: UploadFile = File(...)):
    suffix = Path(audio.filename or "audio.wav").suffix or ".wav"
    with NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(await audio.read())
        tmp.flush()
        result = await transcribe_audio_file(tmp.name)

    return SpeechToTextResponse(text=result["text"], language=result.get("language"), model="deepgram-nova-2")


@router.post("/text-to-speech")
async def text_to_speech(payload: TextToSpeechRequest):
    wav_bytes, sample_rate = await synthesize_text_to_wav_bytes(payload.text)
    headers = {
        "Content-Disposition": 'inline; filename="speech.wav"',
        "X-AI-TTS-Provider": "elevenlabs",
        "X-AI-Sample-Rate": str(sample_rate),
    }
    return Response(content=wav_bytes, media_type="audio/wav", headers=headers)


@router.post("/voice-chat", response_model=VoiceChatResponse)
async def voice_chat(audio: UploadFile = File(...)):
    suffix = Path(audio.filename or "voice.webm").suffix or ".webm"
    with NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(await audio.read())
        tmp.flush()
        result = await transcribe_audio_file(tmp.name)

    transcript = result["text"].strip()
    reply_text = build_friendly_reply(transcript)
    wav_bytes, sample_rate = await synthesize_text_to_wav_bytes(reply_text)

    headers = {
        "Content-Disposition": 'inline; filename="voice-chat.wav"',
        "X-AI-Transcript": transcript,
        "X-AI-Reply": reply_text,
        "X-AI-STT-Provider": "deepgram",
        "X-AI-TTS-Provider": "elevenlabs",
        "X-AI-Sample-Rate": str(sample_rate),
    }
    return Response(content=wav_bytes, media_type="audio/wav", headers=headers)