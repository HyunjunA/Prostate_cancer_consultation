"""
Doctor Consultation Behavior Tracking — POST/GET endpoints

Receives strict, area-specific behavior events from the doctor consultation
interface (PhysicianReports, ConsultationScoring, AI rewrite tools) and
stores them in doctor_behavior.

Pattern A — area-specific schema, no event_type free-text, no OR-merge.
"""

from typing import List, Literal, Optional
from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models import DoctorBehavior

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/api/track/doctor",
    tags=["Track-Doctor"],
    dependencies=[Depends(get_current_user)],
)


# ── Pydantic models ──────────────────────────────────────────────────────────

EventType = Literal[
    "page_view", "view_change",
    "patient_select", "topic_select", "sentence_select",
    "rewrite_open", "rewrite_input", "rewrite_apply",
    "rubric_open", "rubric_close", "rubric_score_lock",
    "tour_open", "tour_end",
    "session_end",
]
TargetType = Literal["patient", "topic", "sentence"]


class DoctorEvent(BaseModel):
    event_type: EventType
    target_type: Optional[TargetType] = None
    target_id: Optional[str] = Field(None, max_length=255)
    metadata: dict = {}
    device_type: Optional[str] = None
    client_timestamp: str


class DoctorBatch(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=100)
    file: Optional[str] = Field(None, max_length=255)  # nullable: dashboard not tied to a file
    speaker: str = Field(..., min_length=1, max_length=100)
    events: List[DoctorEvent] = Field(..., min_length=1, max_length=500)


class TrackResponse(BaseModel):
    status: str
    events_stored: int
    session_id: str


# ── POST /api/track/doctor ───────────────────────────────────────────────────

@router.post("", response_model=TrackResponse)
async def post_doctor_events(
    batch: DoctorBatch,
    db: AsyncSession = Depends(get_db),
):
    rows = []
    for ev in batch.events:
        try:
            client_ts = datetime.fromisoformat(ev.client_timestamp.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=422, detail=f"Invalid client_timestamp: {ev.client_timestamp}")

        rows.append(DoctorBehavior(
            session_id=batch.session_id,
            file=batch.file,
            speaker=batch.speaker,
            event_type=ev.event_type,
            target_type=ev.target_type,
            target_id=ev.target_id,
            event_metadata=ev.metadata or {},
            device_type=ev.device_type,
            client_timestamp=client_ts,
        ))

    try:
        db.add_all(rows)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"doctor_behavior insert failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to store events")

    return TrackResponse(status="ok", events_stored=len(rows), session_id=batch.session_id)


# ── GET /sessions ────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    speaker: Optional[str] = Query(None),
    file: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    # Group by session_id only — both `speaker` and `file` can legitimately
    # change within a single doctor session (auto-detect → URL doctorid race
    # for speaker; null → patient.fileName after patient_select for file).
    # Aggregate distinct values into comma lists so the admin sees one row
    # per real session.
    files_agg = func.string_agg(
        func.distinct(func.coalesce(DoctorBehavior.file, "")), ","
    ).label("files_csv")
    speakers_agg = func.string_agg(
        func.distinct(DoctorBehavior.speaker), ","
    ).label("speakers_csv")
    stmt = select(
        DoctorBehavior.session_id,
        speakers_agg,
        files_agg,
        func.min(DoctorBehavior.client_timestamp).label("started_at"),
        func.max(DoctorBehavior.client_timestamp).label("ended_at"),
        func.count().label("event_count"),
    ).group_by(
        DoctorBehavior.session_id,
    ).order_by(desc("started_at")).limit(limit)

    if speaker:
        stmt = stmt.where(DoctorBehavior.speaker == speaker)
    if file:
        stmt = stmt.where(DoctorBehavior.file == file)

    res = await db.execute(stmt)

    def _csv_to_label(csv: Optional[str]) -> Optional[str]:
        if not csv:
            return None
        items = [f for f in csv.split(",") if f]  # drop empty strings (NULLs)
        if not items:
            return None
        if len(items) == 1:
            return items[0]
        return f"{items[0]} (+{len(items) - 1} more)"

    return {
        "sessions": [
            {
                "session_id": r.session_id,
                "speaker": _csv_to_label(r.speakers_csv),
                "file": _csv_to_label(r.files_csv),
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
    stmt = select(DoctorBehavior).where(
        DoctorBehavior.session_id == session_id
    ).order_by(DoctorBehavior.client_timestamp.asc())

    res = await db.execute(stmt)
    rows = res.scalars().all()
    return {
        "session_id": session_id,
        "events": [
            {
                "id": r.id,
                "event_type": r.event_type,
                "file": r.file,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "metadata": r.event_metadata,
                "device_type": r.device_type,
                "client_timestamp": r.client_timestamp.isoformat() if r.client_timestamp else None,
            }
            for r in rows
        ],
        "count": len(rows),
    }


# ── GET /speakers ────────────────────────────────────────────────────────────

@router.get("/speakers")
async def list_speakers(
    db: AsyncSession = Depends(get_db),
):
    """Distinct doctor speakers seen in doctor_behavior, with event counts."""
    stmt = (
        select(
            DoctorBehavior.speaker,
            func.count().label("event_count"),
            func.max(DoctorBehavior.client_timestamp).label("last_seen"),
        )
        .group_by(DoctorBehavior.speaker)
        .order_by(desc("last_seen"))
    )
    res = await db.execute(stmt)
    return {
        "speakers": [
            {
                "speaker": r.speaker,
                "event_count": r.event_count,
                "last_seen": r.last_seen.isoformat() if r.last_seen else None,
            }
            for r in res.all()
        ]
    }


# ── GET /actions ─────────────────────────────────────────────────────────────

@router.get("/actions")
async def list_actions(
    speaker: str = Query(..., description="Doctor identifier (required)"),
    file: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
):
    """
    Flat chronological action log for a single doctor.

    Returns every event for the given speaker in time-ascending order,
    irrespective of session_id. Each event still carries its session_id
    so the admin UI can render subtle session boundaries between bursts
    of activity. (Sessions are kept in the data; the UI surfaces them
    only as separators, not as the primary grouping.)
    """
    stmt = select(DoctorBehavior).where(
        DoctorBehavior.speaker == speaker,
    ).order_by(DoctorBehavior.client_timestamp.asc()).limit(limit)
    if file:
        stmt = stmt.where(DoctorBehavior.file == file)

    res = await db.execute(stmt)
    rows = res.scalars().all()
    return {
        "speaker": speaker,
        "count": len(rows),
        "actions": [
            {
                "id": r.id,
                "session_id": r.session_id,
                "file": r.file,
                "event_type": r.event_type,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "metadata": r.event_metadata,
                "device_type": r.device_type,
                "client_timestamp": r.client_timestamp.isoformat() if r.client_timestamp else None,
            }
            for r in rows
        ],
    }


# ── GET /aggregate ───────────────────────────────────────────────────────────

@router.get("/aggregate")
async def aggregate_by_session(
    speaker: str = Query(..., description="Doctor identifier (required)"),
    db: AsyncSession = Depends(get_db),
):
    """Per-session activity counts for one doctor, grouped by event_type."""
    stmt = select(
        DoctorBehavior.session_id,
        DoctorBehavior.event_type,
        func.count().label("count"),
        func.min(DoctorBehavior.client_timestamp).label("started_at"),
        func.max(DoctorBehavior.client_timestamp).label("ended_at"),
    ).where(
        DoctorBehavior.speaker == speaker,
    ).group_by(
        DoctorBehavior.session_id,
        DoctorBehavior.event_type,
    )

    res = await db.execute(stmt)
    sessions: dict = {}
    for r in res.all():
        s = sessions.setdefault(r.session_id, {
            "session_id": r.session_id,
            "speaker": speaker,
            "started_at": r.started_at,
            "ended_at": r.ended_at,
            "by_event_type": {},
            "total_events": 0,
        })
        s["by_event_type"][r.event_type] = r.count
        s["total_events"] += r.count
        if r.started_at and (s["started_at"] is None or r.started_at < s["started_at"]):
            s["started_at"] = r.started_at
        if r.ended_at and (s["ended_at"] is None or r.ended_at > s["ended_at"]):
            s["ended_at"] = r.ended_at

    return {
        "speaker": speaker,
        "sessions": [
            {**s,
             "started_at": s["started_at"].isoformat() if s["started_at"] else None,
             "ended_at": s["ended_at"].isoformat() if s["ended_at"] else None}
            for s in sessions.values()
        ],
    }
