"""
Patient Follow-up Survey Behavior Tracking — POST/GET endpoints

Receives strict, area-specific behavior events from the patient follow-up
survey page and stores them in patient_followup_survey. This table tracks
behavior metadata only (timing, ordering, step navigation). Canonical
answer payloads continue to live in survey_submission_log.

Pattern A — area-specific schema, no event_type free-text, no OR-merge.
"""

from typing import List, Literal, Optional
from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models import PatientFollowupSurvey

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/api/track/patient-followup",
    tags=["Track-PatientFollowup"],
    dependencies=[Depends(get_current_user)],
)


# ── Pydantic models ──────────────────────────────────────────────────────────

EventType = Literal[
    "page_view", "survey_step_view",
    "survey_answer", "survey_complete",
    "session_end",
]
SurveyType = Literal["sdm", "dcs", "risk_perception", "satisfaction"]


class PatientFollowupEvent(BaseModel):
    event_type: EventType
    survey_type: Optional[SurveyType] = None
    question_id: Optional[str] = Field(None, max_length=50)
    step_number: Optional[int] = Field(None, ge=1)
    metadata: dict = {}
    device_type: Optional[str] = None
    client_timestamp: str

    @model_validator(mode="after")
    def _validate_required_fields(self):
        if self.event_type == "survey_answer":
            if not self.survey_type or not self.question_id:
                raise ValueError("survey_answer requires survey_type and question_id")
        if self.event_type == "survey_step_view" and self.step_number is None:
            raise ValueError("survey_step_view requires step_number")
        if self.step_number is not None and self.event_type != "survey_step_view":
            raise ValueError("step_number is only allowed on survey_step_view")
        return self


class PatientFollowupBatch(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=100)
    file: str = Field(..., min_length=1, max_length=255)
    speaker: str = Field(..., min_length=1, max_length=100)
    events: List[PatientFollowupEvent] = Field(..., min_length=1, max_length=500)


class TrackResponse(BaseModel):
    status: str
    events_stored: int
    session_id: str


# ── POST /api/track/patient-followup ─────────────────────────────────────────

@router.post("", response_model=TrackResponse)
async def post_patient_followup_events(
    batch: PatientFollowupBatch,
    db: AsyncSession = Depends(get_db),
):
    rows = []
    for ev in batch.events:
        try:
            client_ts = datetime.fromisoformat(ev.client_timestamp.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=422, detail=f"Invalid client_timestamp: {ev.client_timestamp}")

        rows.append(PatientFollowupSurvey(
            session_id=batch.session_id,
            file=batch.file,
            speaker=batch.speaker,
            event_type=ev.event_type,
            survey_type=ev.survey_type,
            question_id=ev.question_id,
            step_number=ev.step_number,
            event_metadata=ev.metadata or {},
            device_type=ev.device_type,
            client_timestamp=client_ts,
        ))

    try:
        db.add_all(rows)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"patient_followup_survey insert failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to store events")

    return TrackResponse(status="ok", events_stored=len(rows), session_id=batch.session_id)


# ── GET /sessions ────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    file: Optional[str] = Query(None),
    speaker: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(
        PatientFollowupSurvey.session_id,
        PatientFollowupSurvey.file,
        PatientFollowupSurvey.speaker,
        func.min(PatientFollowupSurvey.client_timestamp).label("started_at"),
        func.max(PatientFollowupSurvey.client_timestamp).label("ended_at"),
        func.count().label("event_count"),
    ).group_by(
        PatientFollowupSurvey.session_id,
        PatientFollowupSurvey.file,
        PatientFollowupSurvey.speaker,
    ).order_by(desc("started_at")).limit(limit)

    if file:
        stmt = stmt.where(PatientFollowupSurvey.file == file)
    if speaker:
        stmt = stmt.where(PatientFollowupSurvey.speaker == speaker)

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
    stmt = select(PatientFollowupSurvey).where(
        PatientFollowupSurvey.session_id == session_id
    ).order_by(PatientFollowupSurvey.client_timestamp.asc())

    res = await db.execute(stmt)
    rows = res.scalars().all()
    return {
        "session_id": session_id,
        "events": [
            {
                "id": r.id,
                "event_type": r.event_type,
                "survey_type": r.survey_type,
                "question_id": r.question_id,
                "step_number": r.step_number,
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
    """Per-session survey progress and timing for one file."""
    stmt = select(PatientFollowupSurvey).where(
        PatientFollowupSurvey.file == file
    ).order_by(PatientFollowupSurvey.client_timestamp.asc())
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
            "by_survey": {},
            "completed": [],
            "total_events": 0,
        })
        s["ended_at"] = r.client_timestamp
        s["total_events"] += 1

        if r.survey_type:
            sv = s["by_survey"].setdefault(r.survey_type, {
                "answered": 0, "step_views": 0, "completed": False
            })
            if r.event_type == "survey_answer":
                sv["answered"] += 1
            elif r.event_type == "survey_step_view":
                sv["step_views"] += 1
            elif r.event_type == "survey_complete":
                sv["completed"] = True
                if r.survey_type not in s["completed"]:
                    s["completed"].append(r.survey_type)

    return {
        "file": file,
        "sessions": [
            {**s,
             "started_at": s["started_at"].isoformat() if s["started_at"] else None,
             "ended_at": s["ended_at"].isoformat() if s["ended_at"] else None}
            for s in sessions.values()
        ],
    }
