from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    success: bool = True
    service: str = "ai-backend"
    status: str = "ok"
    version: str = "1.0.0"


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    style: str | None = Field(default=None, max_length=80)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)


class GenerateResponse(BaseModel):
    success: bool = True
    service: str = "ai-backend"
    reply: str
    prompt: str
    style: str | None = None


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    success: bool = True
    service: str = "ai-backend"
    reply: str
    messages_count: int


class SpeechToTextResponse(BaseModel):
    success: bool = True
    service: str = "ai-backend"
    text: str
    language: str | None = None
    model: str


class TextToSpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class ModelInfoResponse(BaseModel):
    success: bool = True
    service: str = "ai-backend"
    stt_provider: str = "deepgram"
    tts_provider: str = "elevenlabs"
    llm_provider: str = "openrouter"


class VoiceChatResponse(BaseModel):
    success: bool = True
    service: str = "ai-backend"
    transcript: str
    reply_text: str
    stt_provider: str = "deepgram"
    tts_provider: str = "elevenlabs"
