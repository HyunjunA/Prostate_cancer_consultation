"""Patient First-Visit Behaviour Tracking — POST/GET endpoints.

Receives strict, area-specific behaviour events from the patient first-
visit page (the page where the patient explores their consultation
results for the first time) and stores them in `patient_first_behavior`.

What "first-visit" means here vs. follow-up:
    - First-visit page : patient sees the AI-generated summary, opens
                         topics/evidence, rates the helpfulness of each
                         domain. Tracked in this module.
    - Follow-up page   : patient fills out structured surveys (SDM, DCS,
                         risk perception, satisfaction). Tracked in
                         routes_track_patient_followup.py.
    Each has its own table because the event vocabulary differs (topic
    open/close vs. survey answer/step view) — see Pattern A below.

Pattern A — area-specific schema, no event_type free-text, no OR-merge.
The legacy design used one shared "patient_event" table with a free-
text event_type column; that made queries error-prone and produced the
"Still open" UI bug where a topic OR-merged across sessions stayed
visually open forever. Each area now has its own table + its own
narrow Literal of valid event types.

Endpoint shape (all under /api/track/patient-first):
    POST  /                  -> append a batch of events
    GET   /sessions          -> list sessions (one row per session)
    GET   /session/{sid}     -> all events in one session, in time order
    GET   /aggregate?file=   -> per-session topic/evidence/rating rollup
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
from models import PatientFirstBehavior

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/api/track/patient-first",
    tags=["Track-PatientFirst"],
    # Router-level auth — every endpoint below requires X-API-Key.
    dependencies=[Depends(get_current_user)],
)


# ── Pydantic models ──────────────────────────────────────────────────────────
# Hard-typed event_type and domain. Anything outside these values gets
# rejected with 422 BEFORE reaching the handler — keeps free-text typos
# from polluting the analytics later.

EventType = Literal[
    "page_view", "topic_open", "topic_close",
    "evidence_open", "evidence_close",
    "summary_open", "summary_close",
    "rating_click", "slider_moved", "answer_changed", "domain_submitted",
    "session_end",
]
Domain = Literal["cp", "le", "ed", "inc", "ius"]


class PatientFirstEvent(BaseModel):
    """One behaviour event captured by the first-visit page."""

    event_type: EventType
    domain: Optional[Domain] = None
    # ge=1, le=5 enforces the 1-5 Likert range — invalid ratings are
    # rejected at the API boundary instead of stored and filtered later.
    rating: Optional[int] = Field(None, ge=1, le=5)
    # Free-form metadata (e.g. timing fields) — stored verbatim into
    # the JSONB column; we do NOT validate the inner shape.
    metadata: dict = {}
    device_type: Optional[str] = None
    client_timestamp: str  # ISO 8601

    @model_validator(mode="after")
    def _validate_required_fields(self):
        # Cross-field rules. Each event type implies a different
        # required combination:
        #   - rating_click  : both domain AND rating are mandatory
        #     (otherwise we cannot tell what was rated, or to what).
        #   - topic_*/evidence_*  : domain is mandatory
        #     (an "open" with no domain is meaningless).
        if self.event_type == "rating_click":
            if self.domain is None or self.rating is None:
                raise ValueError("rating_click requires both domain and rating")
        if self.event_type in (
            "topic_open", "topic_close",
            "evidence_open", "evidence_close",
            "summary_open", "summary_close",
        ):
            if self.domain is None:
                raise ValueError(f"{self.event_type} requires domain")
        #   - slider_moved : domain mandatory, plus metadata.slider_name so
        #     the aggregator can tell which of a domain's sliders was touched
        #     (Cancer Prognosis has two). The event firing AT ALL is the
        #     "answered vs left at default 50" signal.
        if self.event_type == "slider_moved":
            if self.domain is None:
                raise ValueError("slider_moved requires domain")
            if not self.metadata.get("slider_name"):
                raise ValueError("slider_moved requires metadata.slider_name")
        #   - domain_submitted : one event per Submit click, carrying a
        #     snapshot of that domain's answers (timeline / factors / vas) in
        #     metadata. domain is mandatory so the admin can attribute the
        #     submission; the metadata shape is free-form (stored verbatim).
        #     Re-submits produce additional rows — that IS the submit history.
        if self.event_type == "domain_submitted":
            if self.domain is None:
                raise ValueError("domain_submitted requires domain")
        #   - answer_changed : fired each time a non-slider question (timeline
        #     radio / factor multi-select) changes. domain mandatory, plus
        #     metadata.field ("timeline" | "factors") so the aggregator can
        #     group each question's change history separately.
        if self.event_type == "answer_changed":
            if self.domain is None:
                raise ValueError("answer_changed requires domain")
            if not self.metadata.get("field"):
                raise ValueError("answer_changed requires metadata.field")
        return self


class PatientFirstBatch(BaseModel):
    """Batch upload — one HTTP call carries one batch."""

    session_id: str = Field(..., min_length=1, max_length=100)
    file: str = Field(..., min_length=1, max_length=255)
    speaker: str = Field(..., min_length=1, max_length=100)
    # 500-event cap: the frontend flushes every few seconds, so 500 is
    # plenty of headroom; raising it any higher just lets one bad client
    # tie up DB writes.
    events: List[PatientFirstEvent] = Field(..., min_length=1, max_length=500)


class TrackResponse(BaseModel):
    """Acknowledgement returned to the frontend after a successful POST."""

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
        # Parse the client's ISO-8601 timestamp. The "Z" suffix indicates
        # UTC and Python's fromisoformat needs "+00:00" instead — substitute
        # before parsing. Reject the whole batch with 422 if any timestamp
        # is malformed (better than storing NULL and breaking aggregation).
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
        # add_all + single commit = one transaction. If anything in the
        # batch fails, the rollback in the except branch leaves the DB
        # untouched — sessions never end up half-written.
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
    # GROUP BY collapses raw events into one row per session_id. The
    # admin UI uses this to render the session table without having to
    # download every event in every session.
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
    """Return all events for a single session, ordered by client_timestamp.

    Time-ordered (not INSERT-ordered) so the consumer sees events in the
    order they actually happened on the client; network buffering can
    reorder rows on the way to the DB.
    """
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
    """Per-session aggregation for one file.

    Returns one row per session with per-domain open/close counts, ratings,
    and event totals. Critically: NO OR-merge across sessions — each session
    is reported independently. (Fixes the legacy "Still open" bug, where a
    topic opened in session A would show as still-open while viewing
    session B because the legacy aggregator OR-merged everything.)
    """
    stmt = select(PatientFirstBehavior).where(
        PatientFirstBehavior.file == file
    ).order_by(PatientFirstBehavior.client_timestamp.asc())
    res = await db.execute(stmt)
    rows = res.scalars().all()

    sessions: dict = {}
    for r in rows:
        # setdefault initialises the session dict on first encounter,
        # then re-uses it for every subsequent event in that session.
        # Single O(events) pass — much simpler than the SQL window-
        # function version that would also need per-domain rollups.
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
        # Rows arrive in client_timestamp ASC order, so the LAST event
        # we see for a session is also its end timestamp.
        s["ended_at"] = r.client_timestamp
        s["total_events"] += 1

        if r.domain:
            d = s["by_domain"].setdefault(r.domain, {"open": 0, "close": 0, "evidence_open": 0, "evidence_close": 0, "summary_open": 0, "summary_close": 0, "topic_by_screen": {}, "evidence_by_screen": {}, "summary_by_screen": {}, "sliders": [], "slider_history": {}, "answer_history": {}, "rating_history": {}, "submissions": []})
            # The page (wizard screen) a panel toggle happened on. The same card
            # renders on Overview and on its domain detail screen, so this is
            # what tells "opened evidence on Overview" from "...on the cp page".
            screen = (r.event_metadata or {}).get("screen") or "unknown"
            if r.event_type == "topic_open":
                d["open"] += 1
                d["topic_by_screen"].setdefault(screen, {"open": 0, "close": 0})["open"] += 1
            elif r.event_type == "topic_close":
                d["close"] += 1
                d["topic_by_screen"].setdefault(screen, {"open": 0, "close": 0})["close"] += 1
            elif r.event_type == "evidence_open":
                d["evidence_open"] += 1
                d["evidence_by_screen"].setdefault(screen, {"open": 0, "close": 0})["open"] += 1
            elif r.event_type == "evidence_close":
                d["evidence_close"] += 1
                d["evidence_by_screen"].setdefault(screen, {"open": 0, "close": 0})["close"] += 1
            elif r.event_type == "summary_open":
                d["summary_open"] += 1
                d["summary_by_screen"].setdefault(screen, {"open": 0, "close": 0})["open"] += 1
            elif r.event_type == "summary_close":
                d["summary_close"] += 1
                d["summary_by_screen"].setdefault(screen, {"open": 0, "close": 0})["close"] += 1
            elif r.event_type == "slider_moved":
                # `sliders`: distinct slider names the patient touched at all
                # — the admin compares this against the known slider set per
                # domain to show answered vs left-at-default.
                # `slider_history`: every committed value per slider, in
                # client_timestamp order (rows already arrive ASC). This is
                # the full change trajectory, including re-edits after Submit,
                # so analysis can reconstruct 50 -> 70 -> 65 and count revisions.
                meta = r.event_metadata or {}
                # Key by question_id (unified across all question types); fall
                # back to slider_name for older rows that predate question_id.
                # For sliders the two are equal, so the admin's DOMAIN_SLIDERS
                # comparison is unaffected.
                qid = meta.get("question_id") or meta.get("slider_name")
                if qid:
                    if qid not in d["sliders"]:
                        d["sliders"].append(qid)
                    d["slider_history"].setdefault(qid, []).append({
                        "value": meta.get("value"),
                        "ts": r.client_timestamp.isoformat() if r.client_timestamp else None,
                    })
            elif r.event_type == "answer_changed":
                # Per-selection change history for the non-slider questions, in
                # client_timestamp order. Keyed by metadata.question_id so two
                # questions of the same type in one domain stay separate (the
                # frontend defaults the id to "{domain}_{field}", but a second
                # question of the same type can pass its own id). `field`
                # ("timeline" / "factors") is kept on each entry for display:
                # timeline carries `value`, factors the full `factors` snapshot.
                meta = r.event_metadata or {}
                field = meta.get("field")
                qid = meta.get("question_id") or (f"{r.domain}_{field}" if field else None)
                if qid:
                    d["answer_history"].setdefault(qid, []).append({
                        "field": field,
                        "value": meta.get("value"),
                        "factors": meta.get("factors"),
                        "ts": r.client_timestamp.isoformat() if r.client_timestamp else None,
                    })
            elif r.event_type == "rating_click" and r.rating is not None:
                # Per-question rating history, keyed by metadata.question_id
                # (default "{domain}_helpfulness"). Distinguishes multiple
                # rating questions in one domain; the session-level `ratings`
                # map below keeps the last value per domain for the summary ★.
                meta = r.event_metadata or {}
                qid = meta.get("question_id") or f"{r.domain}_helpfulness"
                d["rating_history"].setdefault(qid, []).append({
                    "value": r.rating,
                    "ts": r.client_timestamp.isoformat() if r.client_timestamp else None,
                })
            elif r.event_type == "domain_submitted":
                # One entry per Submit click, in time order. metadata.answers is
                # the question_id-keyed snapshot the patient submitted that time
                # (list of {question_id, field, value}); re-submits append
                # further entries so the admin sees the full submission history.
                d["submissions"].append({
                    "answers": (r.event_metadata or {}).get("answers", []),
                    "ts": r.client_timestamp.isoformat() if r.client_timestamp else None,
                })

        if r.event_type == "rating_click" and r.domain and r.rating is not None:
            # Last-write-wins within a session: a patient might re-rate
            # before submitting; we keep only the final value per domain
            # so the admin UI shows what they actually settled on.
            s["ratings"][r.domain] = r.rating

    return {
        "file": file,
        "sessions": [
            {**s,
             "started_at": s["started_at"].isoformat() if s["started_at"] else None,
             "ended_at": s["ended_at"].isoformat() if s["ended_at"] else None}
            for s in sessions.values()
        ],
    }
