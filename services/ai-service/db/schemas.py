from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

MessageRole = Literal["human", "ai"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# Chat: threads + messages
# ============================================================

class Thread(BaseModel):
    user_id: str
    title: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Message(BaseModel):
    thread_id: str
    role: MessageRole
    content: str
    # Metadata for an attachment sent with this turn, for rendering a chip when the thread is
    # reloaded. The bytes themselves are never stored, and the model only sees the attachment
    # on the turn it was sent — it is not replayed into later turns.
    media_name: str | None = None
    media_type: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


# ============================================================
# Waste classifier history
# ============================================================

class ClassificationRecord(BaseModel):
    user_id: str
    image_name: str | None = None

    primary_category: str
    confidence: float
    is_mixed: bool
    hazard_flag: bool
    hazard_reason: str = ""
    contamination_notes: str = ""
    reasoning: str

    # Serialized DetectedItem list from waste_classifier.WasteClassification.
    items: list[dict] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=utcnow)


# ============================================================
# Waste recommendation history
# ============================================================

class RecommendationRecord(BaseModel):
    user_id: str

    # Serialized output of waste_recommendations.analyze_waste() /
    # analyze_weekly_trends().
    analysis: dict
    trend_analysis: dict | None = None

    recommendation_text: str

    created_at: datetime = Field(default_factory=utcnow)
