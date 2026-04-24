# AI Backend

Standalone backend service for AI-related experiments.

## Run locally

```bash
cd ai-backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

Base prefix: `/api/v1`

- `GET /`
- `GET /api/v1/health`
- `GET /api/v1/ready`
- `POST /api/v1/generate`
- `POST /api/v1/chat`
- `GET /api/v1/models`
- `POST /api/v1/speech-to-text`
- `POST /api/v1/text-to-speech`

## Notes

This backend is fully isolated from the existing chat app backend.

Speech endpoints use hosted providers:

- STT: `deepgram` (`nova-2`)
- TTS: `elevenlabs`

## API keys and models

Set your keys in `.env`:

```bash
DEEPGRAM_API_KEY=dg_xxx
ELEVENLABS_API_KEY=sk_xxx
ELEVENLABS_VOICE_ID=onwK4LulDFLSqKGlkXAp
OPENROUTER_API_KEY=sk-or-v1-xxx
```

Default models:

```bash
OPENROUTER_MODEL=openai/gpt-4o-mini
```
