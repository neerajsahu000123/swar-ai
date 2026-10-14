from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Language = Literal["mr", "hi", "en"]
VoiceModel = Literal[
    "gemini-3.8-live",
    "gemini-2.5-flash-native-audio-preview-12-2025",
    "gemini-3.1-flash-live-preview",
]


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    language: Language = "mr"
    jurisdiction: str | None = Field(default=None, max_length=120)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)


class SourceRecord(BaseModel):
    title: str
    url: str
    verified_at: str | None = None


class ChatResponse(BaseModel):
    answer: str
    language: Language
    sources: list[SourceRecord]
    grounded: bool
    message: str | None = None


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2500)
    language: Language = "mr"
    model: VoiceModel | None = None


class VoiceAnswerRequest(ChatRequest):
    model: VoiceModel = "gemini-2.5-flash-native-audio-preview-12-2025"


class VoiceAudioAnswerRequest(BaseModel):
    audio_base64: str = Field(min_length=32, max_length=5_500_000)
    language: Language = "mr"
    jurisdiction: str | None = Field(default=None, max_length=120)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)
    model: VoiceModel = "gemini-2.5-flash-native-audio-preview-12-2025"


class VoiceAnswerResponse(ChatResponse):
    audio_base64: str
    transcript: str | None = None
    audio_fallback: bool = False


class TranslationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    target_language: Language
    source_language: Language | None = None


class TranslationResponse(BaseModel):
    translation: str
    source_language: Language | None
    target_language: Language


class AudioTranscriptionRequest(BaseModel):
    audio_base64: str = Field(min_length=32, max_length=5_500_000)
    mime_type: Literal["audio/webm", "audio/ogg", "audio/mp4", "audio/m4a", "audio/wav", "audio/mpeg", "audio/aac"]
    language: Language = "mr"


class AudioTranscriptionResponse(BaseModel):
    transcript: str
    language: Language


class HealthResponse(BaseModel):
    status: str
    gemini_configured: bool
    gemini_audio_configured: bool
    gemini_model: str
    search_grounding_enabled: bool
