from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


def _csv(value: str, default: str) -> list[str]:
    return [item.strip() for item in (value or default).split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    # Search grounding has its own quota pool, separate from text generation.
    # Disable it when the project has no grounding quota so text answers still work.
    gemini_search_grounding: bool = os.getenv("GEMINI_SEARCH_GROUNDING", "false").strip().casefold() in {
        "1", "true", "yes", "on"
    }
    gemini_audio_model: str = os.getenv(
        "GEMINI_AUDIO_MODEL",
        "gemini-2.5-flash-native-audio-preview-12-2025",
    )
    gemini_audio_voice: str = os.getenv("GEMINI_AUDIO_VOICE", "Achernar")
    cors_origins: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.cors_origins is None:
            object.__setattr__(
                self,
                "cors_origins",
                _csv(os.getenv("CORS_ORIGINS", ""), "http://localhost:8000,http://127.0.0.1:8000"),
            )


settings = Settings()
