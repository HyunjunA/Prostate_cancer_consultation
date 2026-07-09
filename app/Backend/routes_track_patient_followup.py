"""Patient Follow-up Survey Behaviour Tracking — POST/GET endpoints.

Receives strict, area-specific behaviour events from the patient
follow-up survey page and stores them in `patient_followup_survey_page_behavior`.
This table tracks **behaviour metadata only** (timing, ordering, step
navigation, which question was answered when). The canonical answer
payloads continue to live in `survey_submission_log`.

Why split behaviour from answers:
    - Behaviour events are dense (page_view, every step_view, every
      answer event, etc.) — separating them keeps the answers table
      small and easy to query.
    - Behaviour rows are append-only and never edited; answer rows are
      sometimes updated when REDCap sync corrections come back.
    - The admin UI (which renders behaviour analytics) and the patient
      UI (which reads back the answers) talk to different tables and
      can scale independently.

Pattern A — area-specific schema, no event_type free-text, no OR-merge
(matches the same pattern used by routes_track_patient_first.py and
routes_track_doctor.py — every tracking area has its own hard-typed
schema instead of one shared event-bag).

Endpoint shape (all under /api/track/patient-followup):
    POST  /                  -> append a batch of events
    GET   /sessions          -> list distinct sessions
    GET   /session/{sid}     -> all events for one session in time order
    GET   /aggregate         -> per-session survey progress for one file
"""

from typing import List, Literal, Optional
from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.admin_session import require_admin_user
from db import get_db
from models import PatientFollowupSurveyPageBehavior

logger = logging.getLogger(__name__)


# Router-level auth saves us from putting `user: AuthUser = Depends(...)`
# on every handler — and also stops anyone from forgetting it.
router = APIRouter(
    prefix="/api/track/patient-followup",
    tags=["Track-PatientFollowup"],
    dependencies=[Depends(get_current_user)],
)


# ── Pydantic models ──────────────────────────────────────────────────────────
# Locking the allowed event_type / survey_type values to a Literal turns
# any typo on the client side into a clean 422, instead of a polluted
# DB row that we have to clean up later.

EventType = Literal[
    "page_view", "survey_step_view",
    "survey_answer", "survey_complete",
    "session_end",
    # V41 (1st survey) event types — only used when the combined-flow Risk step
    # tracks here as survey_type='risk_perception' (schema-expansion, mig 019).
    "topic_open", "topic_close",
    "evidence_open", "evidence_close",
    "summary_open", "summary_close",
    "rating_click", "slider_moved",
    "answer_changed", "domain_submitted",
]
SurveyType = Literal["sdm", "dcs", "risk_perception", "satisfaction"]


class PatientFollowupEvent(BaseModel):
    """One behaviour event captured by the survey UI."""

    event_type: EventType
    survey_type: Optional[SurveyType] = None
    question_id: Optional[str] = Field(None, max_length=50)
    step_number: Optional[int] = Field(None, ge=1)
    # Free-form metadata for fields that vary per event type. We do NOT
    # validate the inner shape — anything the frontend sends is stored
    # verbatim into the JSONB column for later analysis.
    metadata: dict = {}
    device_type: Optional[str] = None
    client_timestamp: str

    @model_validator(mode="after")
    def _validate_required_fields(self):
        # Cross-field rules. Pydantic's per-field validators cannot see
        # other fields, so we run conditional requirements here:
        #   - "survey_answer" needs both survey_type and question_id
        #     (otherwise we cannot tell which question was answered).
        #   - "survey_step_view" needs step_number (the whole point).
        #   - step_number on any OTHER event type is suspicious — most
        #     likely a frontend bug — reject it explicitly.
        if self.event_type == "survey_answer":
            if not self.survey_type or not self.question_id:
                raise ValueError("survey_answer requires survey_type and question_id")
        if self.event_type == "survey_step_view" and self.step_number is None:
            raise ValueError("survey_step_view requires step_number")
        if self.step_number is not None and self.event_type != "survey_step_view":
            raise ValueError("step_number is only allowed on survey_step_view")
        return self


class PatientFollowupBatch(BaseModel):
    """Batch upload from the frontend — one batch per HTTP call."""

    session_id: str = Field(..., min_length=1, max_length=100)
    file: str = Field(..., min_length=1, max_length=255)
    speaker: str = Field(..., min_length=1, max_length=100)
    # 500-event cap so a single bad call cannot tie up the DB with a
    # 50000-row INSERT. The frontend flushes every few seconds, so 500
    # is more than enough headroom for normal pacing.
    events: List[PatientFollowupEvent] = Field(..., min_length=1, max_length=500)


class TrackResponse(BaseModel):
    """Acknowledgement returned to the frontend after a successful POST."""

    status: str
    events_stored: int
    session_id: str


# ── POST /api/track/patient-followup ─────────────────────────────────────────

@router.post("", response_model=TrackResponse)
async def post_patient_followup_events(
    batch: PatientFollowupBatch,
    db: AsyncSession = Depends(get_db),
):
    """Append a batch of behaviour events under the given session."""
    rows = []
    for ev in batch.events:
        # Parse ISO-8601 client timestamps. The "Z" suffix is the
        # frontend's UTC indicator; Python's fromisoformat accepts
        # "+00:00" so we substitute. If parsing fails we 422 — better
        # to reject the batch than store a NULL timestamp that breaks
        # session aggregation later.
        try:
            client_ts = datetime.fromisoformat(ev.client_timestamp.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=422, detail=f"Invalid client_timestamp: {ev.client_timestamp}")

        rows.append(PatientFollowupSurveyPageBehavior(
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
        # add_all then commit = single INSERT batch + single transaction.
        # Faster than per-row commits AND atomic — partial failures roll
        # back the whole batch, so a session never ends up with a half-
        # written event stream.
        db.add_all(rows)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"patient_followup_survey_page_behavior insert failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to store events")

    return TrackResponse(status="ok", events_stored=len(rows), session_id=batch.session_id)


# ── GET /sessions ────────────────────────────────────────────────────────────

@router.get("/sessions", dependencies=[Depends(require_admin_user)])
async def list_sessions(
    file: Optional[str] = Query(None),
    speaker: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List distinct sessions (one row per (session_id, file, speaker))."""
    # GROUP BY collapses individual events into one row per session.
    # Aggregates expose the metadata the admin UI cares about (start /
    # end / event_count) without the cost of pulling every row.
    stmt = select(
        PatientFollowupSurveyPageBehavior.session_id,
        PatientFollowupSurveyPageBehavior.file,
        PatientFollowupSurveyPageBehavior.speaker,
        func.min(PatientFollowupSurveyPageBehavior.client_timestamp).label("started_at"),
        func.max(PatientFollowupSurveyPageBehavior.client_timestamp).label("ended_at"),
        func.count().label("event_count"),
    ).group_by(
        PatientFollowupSurveyPageBehavior.session_id,
        PatientFollowupSurveyPageBehavior.file,
        PatientFollowupSurveyPageBehavior.speaker,
    ).order_by(desc("started_at")).limit(limit)

    if file:
        stmt = stmt.where(PatientFollowupSurveyPageBehavior.file == file)
    if speaker:
        stmt = stmt.where(PatientFollowupSurveyPageBehavior.speaker == speaker)

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

@router.get("/session/{session_id}", dependencies=[Depends(require_admin_user)])
async def get_session_events(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return every event for one session, ordered by client_timestamp."""
    # Time-ordered fetch so the consumer (admin UI / replay tool) can
    # iterate the events in the order they actually happened on the
    # client, not in INSERT order which can drift due to network buffering.
    stmt = select(PatientFollowupSurveyPageBehavior).where(
        PatientFollowupSurveyPageBehavior.session_id == session_id
    ).order_by(PatientFollowupSurveyPageBehavior.client_timestamp.asc())

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

@router.get("/aggregate", dependencies=[Depends(require_admin_user)])
async def aggregate_by_session(
    file: str = Query(..., description="Patient file (required)"),
    db: AsyncSession = Depends(get_db),
):
    """Per-session survey progress and timing for one file.

    Returns one entry per session_id with:
      - timing window (started_at / ended_at)
      - per-survey-type progress (answered / step_views / completed)
      - completed[] list for quick "did patient finish all surveys?" checks

    Aggregation is done in Python (rather than via window functions)
    because the per-survey-type rollup is shaped enough that a SQL
    version would be harder to read than the small loop below.
    """
    stmt = select(PatientFollowupSurveyPageBehavior).where(
        PatientFollowupSurveyPageBehavior.file == file
    ).order_by(PatientFollowupSurveyPageBehavior.client_timestamp.asc())
    res = await db.execute(stmt)
    rows = res.scalars().all()

    sessions: dict = {}
    for r in rows:
        # setdefault initialises the session dict on first encounter,
        # then re-uses it for all subsequent events belonging to the
        # same session_id. This is O(events) — single pass — vs. the
        # O(sessions × events) we would get from a SQL JOIN per session.
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
        # Because rows arrive in client_timestamp ASC order, the LAST
        # event we see for a session is also its end timestamp.
        s["ended_at"] = r.client_timestamp
        s["total_events"] += 1

        if r.survey_type:
            # Per-survey-type rollup. Same setdefault trick as above.
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
