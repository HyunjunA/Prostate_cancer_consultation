"""
Patient First-Visit Behavior Tracking — POST/GET endpoints

Receives strict, area-specific behavior events from the patient first-visit
page and stores them in patient_first_behavior. Provides per-session and
per-file aggregations for the admin tracking UI.

Pattern A — area-specific schema, no event_type free-text, no OR-merge.
"""

from typing import List, Literal, Optional
from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models import PatientFirstBehavior

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/api/track/patient-first",
    tags=["Track-PatientFirst"],
    dependencies=[Depends(get_current_user)],
)


# ── Pydantic models ──────────────────────────────────────────────────────────

EventType = Literal[
    "page_view", "topic_open", "topic_close",
    "evidence_open", "evidence_close",
    "rating_click", "session_end",
]
Domain = Literal["cp", "le", "ed", "inc", "ius"]


class PatientFirstEvent(BaseModel):
    event_type: EventType
    domain: Optional[Domain] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    metadata: dict = {}
    device_type: Optional[str] = None
    client_timestamp: str  # ISO 8601

    @model_validator(mode="after")
    def _validate_required_fields(self):
        if self.event_type == "rating_click":
            if self.domain is None or self.rating is None:
                raise ValueError("rating_click requires both domain and rating")
        if self.event_type in ("topic_open", "topic_close", "evidence_open", "evidence_close"):
            if self.domain is None:
                raise ValueError(f"{self.event_type} requires domain")
        return self


class PatientFirstBatch(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=100)
    file: str = Field(..., min_length=1, max_length=255)
    speaker: str = Field(..., min_length=1, max_length=100)
    events: List[PatientFirstEvent] = Field(..., min_length=1, max_length=500)


class TrackResponse(BaseModel):
    status: str
    events_stored: int
    session_id: str


# ── POST /api/track/patient-first ────────────────────────────────────────────

@router.post("", response_model=TrackResponse)
async def post_patient_first_events(
    batch: PatientFirstBatch,
    db: AsyncSession = Depends(get_db),
):
    """Bulk-insert a batch of patient first-visit behavior events."""
    rows = []
    for ev in batch.events:
        try:
            client_ts = datetime.fromisoformat(ev.client_timestamp.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=422, detail=f"Invalid client_timestamp: {ev.client_timestamp}")

        rows.append(PatientFirstBehavior(
            session_id=batch.session_id,
            file=batch.file,
            speaker=batch.speaker,
            event_type=ev.event_type,
            domain=ev.domain,
            rating=ev.rating,
            event_metadata=ev.metadata or {},
            device_type=ev.device_type,
            client_timestamp=client_ts,
        ))

    try:
        db.add_all(rows)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"patient_first_behavior insert failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to store events")

    return TrackResponse(status="ok", events_stored=len(rows), session_id=batch.session_id)


# ── GET /sessions ────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    file: Optional[str] = Query(None, description="Filter by patient file"),
    speaker: Optional[str] = Query(None, description="Filter by speaker"),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Return one row per session with per-session counts and time range."""
    stmt = select(
        PatientFirstBehavior.session_id,
        PatientFirstBehavior.file,
        PatientFirstBehavior.speaker,
        func.min(PatientFirstBehavior.client_timestamp).label("started_at"),
        func.max(PatientFirstBehavior.client_timestamp).label("ended_at"),
        func.count().label("event_count"),
    ).group_by(
        PatientFirstBehavior.session_id,
        PatientFirstBehavior.file,
        PatientFirstBehavior.speaker,
    ).order_by(desc("started_at")).limit(limit)

    if file:
        stmt = stmt.where(PatientFirstBehavior.file == file)
    if speaker:
        stmt = stmt.where(PatientFirstBehavior.speaker == speaker)

    res = await db.execute(stmt)
    return {
        "sessions": [
            {
                "session_id": r.session_id,
                "file": r.file,
                "speaker": r.speaker,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "ended_at": r.ended_at.isoformat() if r.ended_at else None,
                "event_count": r.event_count,
            }
            for r in res.all()
        ]
    }


# ── GET /session/{session_id} ────────────────────────────────────────────────

@router.get("/session/{session_id}")
async def get_session_events(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return all events for a single session, ordered by client_timestamp."""
    stmt = select(PatientFirstBehavior).where(
        PatientFirstBehavior.session_id == session_id
    ).order_by(PatientFirstBehavior.client_timestamp.asc())

    res = await db.execute(stmt)
    rows = res.scalars().all()
    return {
        "session_id": session_id,
        "events": [
            {
                "id": r.id,
                "event_type": r.event_type,
                "domain": r.domain,
                "rating": r.rating,
                "metadata": r.event_metadata,
                "device_type": r.device_type,
                "client_timestamp": r.client_timestamp.isoformat() if r.client_timestamp else None,
            }
            for r in rows
        ],
        "count": len(rows),
    }


# ── GET /aggregate ───────────────────────────────────────────────────────────

@router.get("/aggregate")
async def aggregate_by_session(
    file: str = Query(..., description="Patient file (required)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Per-session aggregation for one file.

    Returns one row per session with per-domain open/close counts, ratings,
    and event totals. Critically: NO OR-merge across sessions — each session
    is reported independently. (Fixes the legacy "Still open" bug.)
    """
    stmt = select(PatientFirstBehavior).where(
        PatientFirstBehavior.file == file
    ).order_by(PatientFirstBehavior.client_timestamp.asc())
    res = await db.execute(stmt)
    rows = res.scalars().all()

    sessions: dict = {}
    for r in rows:
        s = sessions.setdefault(r.session_id, {
            "session_id": r.session_id,
            "file": r.file,
            "speaker": r.speaker,
            "started_at": r.client_timestamp,
            "ended_at": r.client_timestamp,
            "by_domain": {},
            "ratings": {},
            "total_events": 0,
        })
        s["ended_at"] = r.client_timestamp
        s["total_events"] += 1

        if r.domain:
            d = s["by_domain"].setdefault(r.domain, {"open": 0, "close": 0, "evidence_open": 0, "evidence_close": 0})
            if r.event_type == "topic_open":
                d["open"] += 1
            elif r.event_type == "topic_close":
                d["close"] += 1
            elif r.event_type == "evidence_open":
                d["evidence_open"] += 1
            elif r.event_type == "evidence_close":
                d["evidence_close"] += 1

        if r.event_type == "rating_click" and r.domain and r.rating is not None:
            s["ratings"][r.domain] = r.rating  # last rating per domain wins within a session

    return {
        "file": file,
        "sessions": [
            {**s,
             "started_at": s["started_at"].isoformat() if s["started_at"] else None,
             "ended_at": s["ended_at"].isoformat() if s["ended_at"] else None}
            for s in sessions.values()
        ],
    }
