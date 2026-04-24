from pydantic import BaseModel
import os
from dotenv import load_dotenv


load_dotenv()


class Settings(BaseModel):
    app_name: str = "AI Backend"
    version: str = "1.0.0"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["*"]
    deepgram_api_key: str = os.getenv("DEEPGRAM_API_KEY", "")
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_model: str = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    elevenlabs_api_key: str = os.getenv("ELEVENLABS_API_KEY", "")
    elevenlabs_voice_id: str = os.getenv("ELEVENLABS_VOICE_ID", "onwK4LulDFLSqKGlkXAp")


settings = Settings()
