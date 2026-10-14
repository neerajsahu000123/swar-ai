from __future__ import annotations

import asyncio
import re
import json
import logging
import base64
import binascii
import io
import wave
from collections.abc import Awaitable, Callable
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse

from config import settings
from schemas import AudioTranscriptionRequest, AudioTranscriptionResponse, ChatRequest, ChatResponse, HealthResponse, SpeechRequest, TranslationRequest, TranslationResponse, VoiceAnswerRequest, VoiceAnswerResponse, VoiceAudioAnswerRequest
from services.gemini_audio import GeminiAudioError, generate_voice_answer, generate_voice_answer_from_audio, synthesize_speech
from services.gemini import GeminiError, generate_grounded_answer, translate_full_text
from services.gemini import transcribe_audio_clip
from services.knowledge import approved_records, retrieve_records
from services.web_sources import retrieve_web_evidence

APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
console_logger = logging.getLogger("swar_ai")

app = FastAPI(
    title="SWAR_AI Backend",
    description="Marathi-first citizen-service information API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        gemini_configured=bool(settings.gemini_api_key),
        gemini_audio_configured=bool(settings.gemini_api_key),
        gemini_model=settings.gemini_model,
        search_grounding_enabled=settings.gemini_search_grounding,
    )


def log_input(endpoint: str, payload: object) -> None:
    data = payload.model_dump(exclude_none=True)  # type: ignore[attr-defined]
    console_logger.info("INPUT %s | %s", endpoint, json.dumps(data, ensure_ascii=False))


@app.middleware("http")
async def log_api_output(request, call_next):
    """Print API results for local development without dumping generated audio."""
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        return response

    if response.headers.get("content-type", "").startswith("application/x-ndjson"):
        console_logger.info("OUTPUT %s %s | streaming response", request.method, request.url.path)
        return response

    body = b"".join([chunk async for chunk in response.body_iterator])
    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            output = json.loads(body)
            if isinstance(output, dict) and isinstance(output.get("audio_base64"), str):
                encoded_audio = output["audio_base64"]
                output["audio_base64"] = f"[omitted; {len(encoded_audio)} base64 characters]"
            if request.url.path in {"/api/voice/transcribe", "/api/voice/answer-audio"} and isinstance(output, dict) and isinstance(output.get("transcript"), str):
                output["transcript"] = "[omitted from logs]"
            console_logger.info(
                "OUTPUT %s %s | %s",
                request.method,
                request.url.path,
                json.dumps(output, ensure_ascii=False),
            )
        except (ValueError, TypeError):
            console_logger.info("OUTPUT %s %s | %s bytes", request.method, request.url.path, len(body))
    else:
        console_logger.info("OUTPUT %s %s | %s bytes (%s)", request.method, request.url.path, len(body), content_type)
    return Response(
        content=body,
        status_code=response.status_code,
        headers=dict(response.headers),
        background=response.background,
    )


async def _voice_answer_result(
    payload: VoiceAnswerRequest,
    on_transcript: Callable[[str, str], None] | None = None,
    on_audio: Callable[[bytes], None] | None = None,
    endpoint: str = "/api/voice/answer",
) -> VoiceAnswerResponse:
    answer_language = infer_answer_language(payload.question, payload.language)
    is_small_talk = bool(small_talk_reply(payload.question, answer_language))
    records = [] if is_small_talk else retrieve_records(payload.question, answer_language, payload.jurisdiction)
    direct_answer = None if is_small_talk else curated_fact_answer(payload.question, answer_language, records)
    evidence_records = records
    evidence = [record.prompt_context(answer_language) for record in evidence_records]
    answer_override = small_talk_reply(payload.question, answer_language)
    if direct_answer:
        console_logger.info("ROUTE %s | approved local record: %s", endpoint, [record.id for record in direct_answer[1]])
        answer_override, evidence_records = direct_answer
        evidence = [record.prompt_context(answer_language) for record in evidence_records]
    try:
        console_logger.info("ROUTE %s | fast Gemini Live model=%s; remote lookup skipped", endpoint, payload.model)
        answer, audio_base64, search_sources = await generate_voice_answer(
            question=payload.question,
            language=answer_language,
            evidence=evidence,
            history=payload.history,
            model=payload.model,
            answer_override=answer_override,
            on_transcript=on_transcript,
            on_audio=on_audio,
        )
    except GeminiAudioError as exc:
        console_logger.warning("ROUTE %s | Live unavailable; falling back to text/browser speech: %s", endpoint, exc)
        if answer_override:
            answer, search_sources = answer_override, []
            audio_base64 = ""
        else:
            try:
                answer, search_sources = await generate_grounded_answer(
                    question=payload.question,
                    language=answer_language,
                    records=evidence_records,
                    history=payload.history,
                )
                audio_base64 = ""
            except GeminiError as text_exc:
                raise HTTPException(status_code=502, detail=gemini_failure_message(answer_language, text_exc)) from exc
        if on_transcript:
            on_transcript("answer", answer)
    return VoiceAnswerResponse(
        answer=answer,
        audio_base64=audio_base64,
        language=answer_language,
        sources=merge_sources([record.public_source() for record in evidence_records], search_sources),
        grounded=bool(evidence_records or search_sources),
        transcript=payload.question,
        audio_fallback=not bool(audio_base64),
    )


async def _audio_voice_answer_result(
    payload: VoiceAudioAnswerRequest,
    on_transcript: Callable[[str, str], None] | None = None,
    on_audio: Callable[[bytes], None] | None = None,
    endpoint: str = "/api/voice/answer-audio",
) -> VoiceAnswerResponse:
    try:
        audio_pcm = base64.b64decode(payload.audio_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid base64 audio data.") from exc
    if len(audio_pcm) < 3200 or len(audio_pcm) % 2:
        raise HTTPException(status_code=422, detail="Audio must contain at least 100 ms of 16-bit PCM data.")
    console_logger.info(
        "INPUT %s | %s",
        endpoint,
        json.dumps({"language": payload.language, "model": payload.model, "audio_bytes": len(audio_pcm), "sample_rate": 16000}),
    )
    evidence_records = approved_records(payload.jurisdiction)
    evidence = [record.prompt_context(payload.language) for record in evidence_records]
    try:
        transcript, answer, audio_base64, search_sources = await generate_voice_answer_from_audio(
            audio_pcm=audio_pcm,
            language=payload.language,
            evidence=evidence,
            history=payload.history,
            model=payload.model,
            on_transcript=on_transcript,
            on_audio=on_audio,
        )
    except GeminiAudioError as exc:
        console_logger.warning("ROUTE %s | Live audio failed; transcribing and falling back to text: %s", endpoint, exc)
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(16000)
            wav_file.writeframes(audio_pcm)
        wav_base64 = base64.b64encode(wav_buffer.getvalue()).decode("ascii")
        try:
            transcript = await transcribe_audio_clip(wav_base64, "audio/wav", payload.language)
        except GeminiError as transcription_error:
            raise HTTPException(
                status_code=502,
                detail=gemini_failure_message(payload.language, transcription_error),
            ) from exc
        if on_transcript:
            on_transcript("question", transcript)
        text_result = await _voice_answer_result(
            VoiceAnswerRequest(
                question=transcript,
                language=payload.language,
                jurisdiction=payload.jurisdiction,
                history=payload.history,
            ),
            on_transcript=on_transcript,
            endpoint=f"{endpoint} text fallback",
        )
        return text_result.model_copy(update={"transcript": transcript, "audio_fallback": True})
    matched_records = retrieve_records(transcript, payload.language, payload.jurisdiction)
    return VoiceAnswerResponse(
        transcript=transcript,
        answer=answer,
        audio_base64=audio_base64,
        language=payload.language,
        sources=merge_sources([record.public_source() for record in matched_records], search_sources),
        grounded=bool(matched_records or search_sources),
        audio_fallback=False,
    )


def _voice_event_stream(
    operation: Callable[[Callable[[str, str], None], Callable[[bytes], None]], Awaitable[VoiceAnswerResponse]],
) -> StreamingResponse:
    async def events():
        queue: asyncio.Queue[dict] = asyncio.Queue()
        streamed_audio = False

        def publish(channel: str, text: str) -> None:
            if text:
                queue.put_nowait({"type": channel, "text": text})

        def publish_audio(chunk: bytes) -> None:
            nonlocal streamed_audio
            if chunk:
                streamed_audio = True
                queue.put_nowait({"type": "audio", "audio": base64.b64encode(chunk).decode("ascii")})

        async def run() -> None:
            try:
                result = await operation(publish, publish_audio)
                response_data = result.model_dump()
                response_data["audio_streamed"] = streamed_audio
                queue.put_nowait({"type": "final", "response": response_data})
            except HTTPException as exc:
                queue.put_nowait({"type": "error", "detail": str(exc.detail)})
            except Exception as exc:
                console_logger.exception("Voice stream failed (%s)", type(exc).__name__)
                queue.put_nowait({"type": "error", "detail": "The voice answer could not be completed."})

        task = asyncio.create_task(run())
        try:
            yield json.dumps({"type": "start"}) + "\n"
            while True:
                event = await queue.get()
                yield json.dumps(event, ensure_ascii=False) + "\n"
                if event["type"] in {"final", "error"}:
                    break
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    log_input("/api/chat", payload)
    answer_language = infer_answer_language(payload.question, payload.language)
    small_talk = small_talk_reply(payload.question, answer_language)
    if small_talk:
        console_logger.info("ROUTE /api/chat | local small-talk answer; no model request")
        return ChatResponse(answer=small_talk, language=answer_language, sources=[], grounded=False)

    records = retrieve_records(payload.question, answer_language, payload.jurisdiction)
    direct_answer = curated_fact_answer(payload.question, answer_language, records)
    if direct_answer:
        console_logger.info("ROUTE /api/chat | approved local record: %s", [record.id for record in direct_answer[1]])
    if not direct_answer:
        console_logger.info("LOOKUP official Maharashtra portal | %s", payload.question)
    web_records = [] if direct_answer else await retrieve_web_evidence(payload.question)
    # Keep official evidence authoritative for government facts; relevant
    # Wikipedia excerpts may supply general Maharashtra background only.
    official_web_records = [
        record for record in web_records
        if record.source_kind.startswith("Official Maharashtra Government")
    ]
    chief_minister_record = next(
        (record for record in official_web_records if record.id == "maharashtra-chief-minister"),
        None,
    )
    if chief_minister_record:
        officeholder = re.search(
            r"(?:Shri|Mr)\.?\s+(.+?)\s+(?:Hon.?ble\s+)?Chief Minister\b",
            chief_minister_record.text,
            re.IGNORECASE,
        )
        if officeholder:
            name = " ".join(officeholder.group(1).strip(" .,").split())
            answer = {
                "mr": f"महाराष्ट्राचे मुख्यमंत्री श्री. {name} आहेत.",
                "hi": f"महाराष्ट्र के मुख्यमंत्री श्री {name} हैं।",
                "en": f"The Chief Minister of Maharashtra is Shri {name}.",
            }[answer_language]
            return ChatResponse(
                answer=answer,
                language=answer_language,
                sources=[chief_minister_record.public_source()],
                grounded=True,
            )
    evidence = [*records, *web_records]

    if direct_answer:
        answer, selected_records = direct_answer
        return ChatResponse(
            answer=answer,
            language=answer_language,
            sources=[record.public_source() for record in selected_records],
            grounded=True,
        )

    try:
        console_logger.info(
            "ROUTE /api/chat | Gemini model=%s; Google Search grounding=%s",
            settings.gemini_model,
            "enabled" if settings.gemini_search_grounding else "disabled (project has no grounding quota)",
        )
        answer, search_sources = await generate_grounded_answer(
            question=payload.question,
            language=answer_language,
            records=evidence,
            history=payload.history,
        )
    except GeminiError as exc:
        if records:
            # When Gemini is rate-limited, approved local facts can still answer
            # directly without inventing anything or waiting for another request.
            fallback = " ".join(
                record.content.get(answer_language, record.content["mr"]).get("summary", "").strip()
                for record in records[:2]
                if record.content.get(answer_language, record.content["mr"]).get("summary")
            )
            if fallback:
                return ChatResponse(
                    answer=fallback,
                    language=answer_language,
                    sources=[record.public_source() for record in records[:2]],
                    grounded=True,
                    message=str(exc),
                )
        # Do not turn retrieved web text into a factual answer without Gemini;
        # give the user the source links so they can check the original pages.
        sources = [record.public_source() for record in evidence]
        if exc.status_code == 429:
            sources.append({
                "title": "View Gemini API limits in Google AI Studio",
                "url": "https://aistudio.google.com/rate-limit",
                "verified_at": None,
            })
            sources.append({
                "title": "Gemini API rate limits — Google AI for Developers",
                "url": "https://ai.google.dev/gemini-api/docs/rate-limits",
                "verified_at": None,
            })
        return ChatResponse(
            answer=gemini_failure_message(answer_language, exc),
            language=answer_language,
            sources=sources,
            grounded=False,
            message=str(exc),
        )

    # Cite both supplied government evidence and pages returned by Search grounding.
    sources = [record.public_source() for record in evidence]
    seen_urls = {source["url"] for source in sources}
    for source in search_sources:
        if source["url"] not in seen_urls:
            sources.append(source)
            seen_urls.add(source["url"])
    return ChatResponse(answer=answer, language=answer_language, sources=sources, grounded=bool(sources))


@app.post("/api/voice/synthesize")
async def speech(payload: SpeechRequest):
    log_input("/api/voice/synthesize", payload)
    try:
        audio = await synthesize_speech(payload.text, payload.language, payload.model)
    except GeminiAudioError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    from fastapi.responses import Response

    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@app.post("/api/voice/transcribe", response_model=AudioTranscriptionResponse)
async def transcribe_voice(payload: AudioTranscriptionRequest) -> AudioTranscriptionResponse:
    # Never print microphone audio or its transcript to the local console.
    approximate_bytes = len(payload.audio_base64) * 3 // 4
    console_logger.info(
        "INPUT /api/voice/transcribe | %s",
        json.dumps({"language": payload.language, "mime_type": payload.mime_type, "audio_bytes": approximate_bytes}),
    )
    try:
        transcript = await transcribe_audio_clip(payload.audio_base64, payload.mime_type, payload.language)
    except GeminiError as exc:
        status_code = 429 if exc.status_code == 429 else 502
        raise HTTPException(
            status_code=status_code,
            detail=gemini_failure_message(payload.language, exc),
        ) from exc
    return AudioTranscriptionResponse(transcript=transcript, language=payload.language)


@app.post("/api/voice/answer", response_model=VoiceAnswerResponse)
async def voice_answer(payload: VoiceAnswerRequest) -> VoiceAnswerResponse:
    """Answer a recognized voice question from local approved facts without waiting for a web lookup."""
    log_input("/api/voice/answer", payload)
    return await _voice_answer_result(payload)


@app.post("/api/voice/answer-stream")
async def voice_answer_stream(payload: VoiceAnswerRequest):
    """Stream answer text while Gemini Live finishes generating speech."""
    log_input("/api/voice/answer-stream", payload)
    return _voice_event_stream(
        lambda on_transcript, on_audio: _voice_answer_result(
            payload, on_transcript, on_audio, "/api/voice/answer-stream"
        )
    )


@app.post("/api/voice/answer-audio", response_model=VoiceAnswerResponse)
async def voice_answer_audio(payload: VoiceAudioAnswerRequest) -> VoiceAnswerResponse:
    """Send recorded audio to Gemini Live once for transcription, answer, and speech."""
    return await _audio_voice_answer_result(payload)


@app.post("/api/voice/answer-audio-stream")
async def voice_answer_audio_stream(payload: VoiceAudioAnswerRequest):
    """Stream the recognized question and answer while the audio-first turn runs."""
    return _voice_event_stream(
        lambda on_transcript, on_audio: _audio_voice_answer_result(
            payload, on_transcript, on_audio, "/api/voice/answer-audio-stream"
        )
    )


def merge_sources(primary: list[dict], extra: list[dict]) -> list[dict]:
    merged = list(primary)
    seen = {item.get("url") for item in merged}
    for item in extra:
        if item.get("url") and item["url"] not in seen:
            merged.append(item)
            seen.add(item["url"])
    return merged


@app.post("/api/translate", response_model=TranslationResponse)
async def translate(payload: TranslationRequest) -> TranslationResponse:
    log_input("/api/translate", payload)
    try:
        translation = await translate_full_text(
            text=payload.text,
            source_language=payload.source_language,
            target_language=payload.target_language,
        )
    except GeminiError as exc:
        status_code = 429 if exc.status_code == 429 else 502
        raise HTTPException(
            status_code=status_code,
            detail=gemini_failure_message(payload.target_language, exc),
        ) from exc
    return TranslationResponse(
        translation=translation,
        source_language=payload.source_language,
        target_language=payload.target_language,
    )


def unsupported_message(language: str) -> str:
    messages = {
        "mr": "या प्रश्नासाठी सध्या पडताळलेली माहिती उपलब्ध नाही. कृपया सेवा किंवा जिल्ह्याचे नाव स्पष्ट करा, किंवा अधिकृत महाराष्ट्र शासन पोर्टलवर माहिती तपासा.",
        "hi": "इस सवाल के लिए अभी सत्यापित जानकारी उपलब्ध नहीं है। कृपया सेवा या ज़िले का नाम स्पष्ट करें, या महाराष्ट्र सरकार के आधिकारिक पोर्टल पर जानकारी देखें।",
        "en": "I don't have verified information for this question yet. Please specify the service or district, or check the official Maharashtra government portal.",
    }
    return messages[language]


def small_talk_reply(question: str, language: str) -> str | None:
    """Answer simple greetings and assistant-introduction questions instantly."""
    normalized = re.sub(r"[^\w\s]", " ", question.casefold())
    normalized = " ".join(normalized.split())
    greetings = {
        "hello", "hi", "hey", "hello there", "good morning", "good afternoon", "good evening",
        "namaste", "namaskar", "नमस्कार", "नमस्ते", "हॅलो", "नमस्कारम",
    }
    identity = {
        "who are you", "who are you swar ai", "tum kaun ho", "tum kon ho", "kaun ho tum",
        "aap kaun ho", "aap kaun hain", "tumhara naam kya hai", "aapka naam kya hai", "tera naam kya hai",
        "तुम कौन हो", "आप कौन हैं", "तुम्हारा नाम क्या है", "आपका नाम क्या है", "तू कोण आहेस", "तुम्ही कोण आहात",
    }
    capabilities = {
        "what can you do", "what do you do", "tum kya kar sakte ho", "aap kya kar sakte ho",
        "tum kya kar sakte ho", "तुम क्या कर सकते हो", "आप क्या कर सकते हैं", "तुम्ही काय करू शकता",
    }
    what_doing = {
        "what are you doing", "what are you doing now", "what are you doing right now",
        "kya kar rahe ho", "kya kar rahe ho abhi", "tum kya kar rahe ho abhi", "abhi kya kar rahe ho", "क्या कर रहे हो अभी",
        "तुम क्या कर रहे हो", "तुम्ही काय करत आहात",
    }
    if normalized in greetings:
        return {
            "mr": "नमस्कार! महाराष्ट्र शासनाच्या सेवांबद्दल काही विचारायचे आहे का?",
            "hi": "नमस्ते! महाराष्ट्र सरकार की सेवाओं के बारे में क्या जानना चाहेंगे?",
            "en": "Hello! What would you like to know about Maharashtra government services?",
        }[language]
    if normalized in identity:
        return {
            "mr": "मी SWAR_AI आहे. महाराष्ट्र शासनाच्या सेवा आणि नागरिकांच्या प्रश्नांबद्दल माहिती देतो.",
            "hi": "मैं SWAR_AI हूँ। मैं महाराष्ट्र सरकार की सेवाओं और नागरिकों के सवालों में मदद करता हूँ।",
            "en": "I’m SWAR_AI, here to help with Maharashtra government services and citizen questions.",
        }[language]
    if normalized in capabilities:
        return {
            "mr": "मी महाराष्ट्र शासनाच्या सेवा, योजना, कागदपत्रे आणि अर्ज प्रक्रियेबद्दल माहिती शोधण्यात मदत करू शकतो.",
            "hi": "मैं महाराष्ट्र सरकार की सेवाओं, योजनाओं, दस्तावेज़ों और आवेदन प्रक्रिया की जानकारी देने में मदद कर सकता हूँ।",
            "en": "I can help find information about Maharashtra government services, schemes, documents, and application steps.",
        }[language]
    if normalized in what_doing:
        return {
            "mr": "मी तुमच्या महाराष्ट्र शासनाशी संबंधित प्रश्नांची उत्तरे देण्यासाठी तयार आहे.",
            "hi": "मैं यहीं हूँ—महाराष्ट्र सरकार से जुड़े आपके सवालों में मदद करने के लिए।",
            "en": "I’m here and ready to help with your questions about Maharashtra government services.",
        }[language]
    if "youtube" in normalized and any(word in normalized for word in ("check", "देख", "जाओ", "jao")):
        return {
            "mr": "मी उत्तरांसाठी YouTube ऐवजी अधिकृत सरकारी स्रोत वापरतो. रेशन कार्डसाठी शासनाच्या सेवा पृष्ठावरील अर्ज दुवा वापरू शकता.",
            "hi": "मैं YouTube के बजाय आधिकारिक सरकारी स्रोत इस्तेमाल करता हूँ। राशन कार्ड के लिए विभाग के सेवा पेज पर दिया आवेदन लिंक खोलें।",
            "en": "I use official government sources instead of YouTube. For a ration card, open the application link on the department’s Services page.",
        }[language]
    if any(phrase in normalized for phrase in (
        "tumhen samajh", "tumhe samajh", "samajh aa raha", "samajh rahe ho",
        "क्या तुम समझ", "समझ आ रहा", "तुम्हें समझ", "तुम्हे समझ", "तुम्ही समज",
    )):
        return {
            "mr": "हो, तुमचा प्रश्न मला समजला. रेशन कार्डसाठी अर्जाची पद्धत सांगू का?",
            "hi": "हाँ, मैं आपकी बात समझ रहा हूँ। राशन कार्ड के आवेदन का तरीका बताऊँ?",
            "en": "Yes, I understand you. Would you like the steps to apply for a ration card?",
        }[language]
    return None


def curated_fact_answer(question: str, language: str, records) -> tuple[str, list] | None:
    """Return instant answers for reviewed facts with direct government sources."""
    normalized = re.sub(r"[^\w\s]", " ", question.casefold())
    normalized = " ".join(normalized.split())
    by_id = {record.id: record for record in records}
    if "maharashtra-capital" in by_id and any(term in normalized.split() for term in ("capital", "rajdhani", "राजधानी")):
        record = by_id["maharashtra-capital"]
        return record.content[language]["summary"], [record]

    school = by_id.get("maharashtra-school-education-minister")
    higher = by_id.get("maharashtra-higher-technical-education-minister")
    is_education_minister_question = (
        ("education" in normalized and "minister" in normalized)
        or "शिक्षा मंत्री" in normalized
        or "शिक्षण मंत्री" in normalized
    )
    if is_education_minister_question and (school or higher):
        if any(term in normalized for term in ("higher", "technical", "उच्च", "तंत्र")) and higher:
            return higher.content[language]["summary"], [higher]
        if any(term in normalized for term in ("school", "शालेय", "स्कूल")) and school:
            return school.content[language]["summary"], [school]
        selected = [record for record in (school, higher) if record]
        answers = [record.content[language]["summary"] for record in selected]
        return " ".join(answers), selected

    aadhaar = by_id.get("uidai-aadhaar-enrolment-update")
    if aadhaar and any(term in normalized for term in ("aadhaar", "aadhar", "आधार")):
        localized = aadhaar.content[language]
        answer = f"{localized['summary']} {localized['steps']} {localized['limitations']}"
        return answer, [aadhaar]

    ration = by_id.get("mahafood-ration-card")
    if ration and any(term in normalized for term in ("ration", "rashan", "राशन", "रेशन", "शिधापत्रिका")):
        asks_documents = any(term in normalized for term in (
            "document", "documents", "paper", "papers", "dastavez", "kagaz", "कागज़", "कागज", "दस्तावेज़", "कागदपत्र",
        ))
        localized = ration.content[language]
        if asks_documents:
            answer = f"{localized['summary']} {localized['limitations']}"
        else:
            answer = f"{localized['summary']} {localized['steps']}"
        return answer, [ration]
    return None


def infer_answer_language(question: str, selected_language: str) -> str:
    """Honor explicit UI language, while recognizing strongly transliterated Hindi/Marathi."""
    words = set(re.findall(r"[a-z]+", question.casefold()))
    hindi_markers = {
        "mujhe", "batao", "bataiye", "kaise", "banaa", "bana", "banwana", "sakta", "sakti", "hun",
        "tum", "tumhara", "aapka", "kyon", "kyu", "rahe", "raha", "rahi", "samajh", "bol", "chahiye",
        "kya", "kaun", "ho", "hai", "hain", "kar", "sakte", "sakti",
    }
    marathi_markers = {"mala", "sanga", "kay", "kasa", "kashi", "kase", "aahe", "shakto", "mahiti", "tumhi"}
    if len(words & hindi_markers) >= 2:
        return "hi"
    if len(words & marathi_markers) >= 2:
        return "mr"
    return selected_language


def gemini_failure_message(language: str, error: GeminiError) -> str:
    retry_hint = ""
    if error.retry_after is not None and error.retry_after > 0:
        seconds = max(1, round(error.retry_after))
        retry_hint = {
            "mr": f" सुमारे {seconds} सेकंदांनी पुन्हा प्रयत्न करा.",
            "hi": f" लगभग {seconds} सेकंड बाद फिर कोशिश करें।",
            "en": f" Try again in about {seconds} seconds.",
        }[language]

    if error.category == "quota":
        return {
            "mr": "या Gemini प्रकल्पाची कोटा मर्यादा संपली आहे. Google AI Studio मध्ये वापर आणि कोटा तपासा; कोटा रीसेट होईपर्यंत थांबा.",
            "hi": "इस Gemini प्रोजेक्ट का कोटा पूरा हो गया है। Google AI Studio में उपयोग और कोटा देखें; कोटा रीसेट होने तक प्रतीक्षा करें।",
            "en": "This Gemini project has exhausted its quota. Check usage and quota in Google AI Studio, then wait for the quota to reset.",
        }[language]
    if error.category == "authentication":
        return {
            "mr": "Gemini API key अवैध किंवा अनधिकृत आहे. BACKEND/.env मधील GEMINI_API_KEY वैध Google AI Studio API key ने बदला आणि सर्व्हर पुन्हा सुरू करा.",
            "hi": "Gemini API key अमान्य या अनधिकृत है। BACKEND/.env में GEMINI_API_KEY को मान्य Google AI Studio API key से बदलें और सर्वर फिर से शुरू करें।",
            "en": "The Gemini API key is invalid or unauthorized. Replace GEMINI_API_KEY in BACKEND/.env with a valid Google AI Studio API key, then restart the server.",
        }[language]
    if error.category == "rate_limit":
        return {
            "mr": "Gemini च्या विनंती मर्यादेमुळे उत्तर सध्या तयार झाले नाही. थोडा वेळ थांबून पुन्हा प्रयत्न करा; Google AI Studio मध्ये या प्रकल्पाची मर्यादा तपासा.",
            "hi": "Gemini की अनुरोध सीमा के कारण अभी जवाब नहीं बन पाया। थोड़ी देर बाद फिर कोशिश करें और Google AI Studio में इस प्रोजेक्ट की सीमा देखें।",
            "en": "Gemini rate-limited this project, so the answer could not be generated. Wait briefly and try again; check this project's limits in Google AI Studio.",
        }[language] + retry_hint
    return {
        "mr": "उत्तर सेवा सध्या उपलब्ध नाही. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा किंवा खालील स्रोत उघडा.",
        "hi": "जवाब सेवा अभी उपलब्ध नहीं है। थोड़ी देर बाद फिर कोशिश करें या नीचे दिए स्रोत देखें।",
        "en": "The answer service is temporarily unavailable. Please try again shortly or open the sources below.",
    }[language]


# Serve the existing front end from the same origin when running the API locally.
@app.get("/", include_in_schema=False)
async def frontend_index():
    return FileResponse(PROJECT_DIR / "index.html")


@app.get("/{asset_name}", include_in_schema=False)
async def frontend_asset(asset_name: str):
    if asset_name not in {"styles.css", "app.js"}:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(PROJECT_DIR / asset_name)
