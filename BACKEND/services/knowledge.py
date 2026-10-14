from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "knowledge_base.json"
_STOPWORDS = {
    "a", "an", "and", "are", "about", "can", "could", "do", "does", "for", "from", "how", "i",
    "in", "is", "it", "me", "of", "on", "please", "the", "to", "what", "where", "which", "who",
    "why", "with", "you", "your", "maharashtra", "state", "ka", "ke", "ki", "hai", "hain", "ho",
    "kya", "kaun", "kahan", "kaise", "mein", "me", "mujhe", "batao", "bataiye", "sakta", "sakti", "hun", "का", "की", "के", "है",
    "हैं", "में", "मुझे", "कौन", "क्या", "कहाँ", "बताओ", "बताइए", "महाराष्ट्र", "सांगा", "काय", "आहे",
}
_ROMAN_HINDI_EQUIVALENTS = {
    "rashan": "ration", "rashancard": "ration", "rashan-card": "ration",
    "bana": "apply", "banaa": "apply", "banana": "apply", "banau": "apply",
    "banaun": "apply", "banwana": "apply", "banwa": "apply", "banvane": "apply",
}


@dataclass(frozen=True)
class KnowledgeRecord:
    id: str
    title: str
    jurisdiction: str
    status: str
    source_title: str
    source_url: str
    verified_at: str | None
    keywords: list[str]
    content: dict[str, Any]

    def public_source(self) -> dict[str, str | None]:
        return {"title": self.source_title, "url": self.source_url, "verified_at": self.verified_at}

    def prompt_context(self, language: str) -> str:
        localized = self.content.get(language) or self.content["mr"]
        return "\n".join(
            [
                f"Service: {self.title}",
                f"Jurisdiction: {self.jurisdiction}",
                f"Verified date: {self.verified_at or 'not recorded'}",
                f"Official source: {self.source_title} ({self.source_url})",
                f"Approved information: {localized['summary']}",
                f"Known steps: {localized['steps']}",
                f"Known limitations: {localized['limitations']}",
            ]
        )


def _records() -> list[KnowledgeRecord]:
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return [KnowledgeRecord(**item) for item in data]


def approved_records(jurisdiction: str | None = None) -> list[KnowledgeRecord]:
    requested_jurisdiction = (jurisdiction or "").casefold()
    return [
        record for record in _records()
        if record.status == "approved"
        and (not requested_jurisdiction or requested_jurisdiction in record.jurisdiction.casefold())
    ]


def _terms(text: str) -> set[str]:
    terms = {term.lower() for term in re.findall(r"[\w\u0900-\u097f]+", text) if len(term) > 1}
    terms = {_ROMAN_HINDI_EQUIVALENTS.get(term, term) for term in terms}
    return terms - _STOPWORDS


def retrieve_records(question: str, language: str, jurisdiction: str | None = None) -> list[KnowledgeRecord]:
    query_terms = _terms(question)
    ranked: list[tuple[int, KnowledgeRecord]] = []
    requested_jurisdiction = (jurisdiction or "").casefold()

    for record in _records():
        if record.status != "approved":
            continue
        if requested_jurisdiction and requested_jurisdiction not in record.jurisdiction.casefold():
            continue
        searchable = _terms(" ".join([record.title, *record.keywords]))
        score = len(query_terms & searchable)
        if score:
            ranked.append((score, record))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return [record for score, record in ranked[:2] if score >= 1]
