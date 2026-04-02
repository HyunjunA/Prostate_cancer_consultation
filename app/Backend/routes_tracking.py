"""
User Interaction Tracking API Routes

Receives batched interaction events from the frontend TrackingEventManager
and stores them in the user_interaction_log table for research analysis.
"""

from typing import List, Optional
from datetime import datetime
import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc, asc, and_, distinct, cast, Date, extract
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db, AsyncSessionLocal
from models import UserInteractionLog

# Rate limiter — gracefully disabled if Redis is not available
try:
    from fastapi_limiter.depends import RateLimiter
    _tracking_rate_limit = [Depends(RateLimiter(times=30, seconds=60))]
except Exception:
    _tracking_rate_limit = []

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Router
# ──────────────────────────────────────────────────────────────────────────────
router = APIRouter(
    prefix="/api/tracking",
    tags=["Tracking"],
    dependencies=[Depends(get_current_user)],
)


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────────────────────────────────────

class TrackingEvent(BaseModel):
    """Single interaction event from the frontend."""
    event_type: str
    element_id: Optional[str] = None
    timestamp: str                              # ISO 8601 from client
    metadata: Optional[dict] = None


class TrackingEventBatch(BaseModel):
    """Batch of events to store."""
    session_id: str
    role: str = "patient"                      # "patient" | "physician"
    file: str
    speaker: str
    device_type: Optional[str] = "desktop"
    events: List[TrackingEvent] = Field(..., min_length=1, max_length=500)


class TrackingEventResponse(BaseModel):
    """Response after storing events."""
    status: str
    events_stored: int
    session_id: str


class TrackingEventDetail(BaseModel):
    """Single event returned from query."""
    id: int
    session_id: str
    role: str
    file: str
    speaker: str
    event_type: str
    element_id: Optional[str]
    event_data: Optional[dict]
    device_type: Optional[str]
    client_timestamp: Optional[str]
    created_at: str


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/tracking/events — Store batched interaction events
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/events", response_model=TrackingEventResponse, dependencies=_tracking_rate_limit)
async def store_tracking_events(
    batch: TrackingEventBatch,
    db: AsyncSession = Depends(get_db),
):
    """
    Store a batch of user interaction events.

    Events are collected by TrackingEventManager on the frontend and sent
    in bulk when the user navigates away or at periodic intervals.
    """
    try:
        rows = []
        for event in batch.events:
            # Parse client timestamp
            client_ts = None
            try:
                client_ts = datetime.fromisoformat(event.timestamp.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                pass

            row = UserInteractionLog(
                session_id=batch.session_id,
                role=batch.role,
                file=batch.file,
                speaker=batch.speaker,
                event_type=event.event_type,
                element_id=event.element_id,
                event_data=event.metadata,  # JSONB column — dict stored directly
                device_type=batch.device_type,
                client_timestamp=client_ts,
            )
            rows.append(row)

        db.add_all(rows)
        await db.commit()

        logger.info(
            f"Stored {len(rows)} tracking events for session={batch.session_id}, "
            f"file={batch.file}, speaker={batch.speaker}"
        )

        return TrackingEventResponse(
            status="ok",
            events_stored=len(rows),
            session_id=batch.session_id,
        )

    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to store tracking events: {e}")
        raise HTTPException(status_code=500, detail="Failed to store events. Please try again.")


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tracking/events — Query interaction events
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/events")
async def get_tracking_events(
    role: Optional[str] = Query(None, description="Filter by role (patient/physician)"),
    file: Optional[str] = Query(None, description="Filter by patient file"),
    speaker: Optional[str] = Query(None, description="Filter by speaker"),
    session_id: Optional[str] = Query(None, description="Filter by session"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """
    Query stored interaction events with optional filters.
    Returns events ordered by client_timestamp descending.
    """
    conditions = []
    if role:
        conditions.append(UserInteractionLog.role == role)
    if file:
        conditions.append(UserInteractionLog.file == file)
    if speaker:
        conditions.append(UserInteractionLog.speaker == speaker)
    if session_id:
        conditions.append(UserInteractionLog.session_id == session_id)
    if event_type:
        conditions.append(UserInteractionLog.event_type == event_type)

    # Count total
    count_stmt = select(func.count(UserInteractionLog.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Fetch rows
    stmt = select(UserInteractionLog)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(desc(UserInteractionLog.created_at)).offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    events = []
    for row in rows:
        events.append({
            "id": row.id,
            "session_id": row.session_id,
            "role": getattr(row, 'role', 'patient'),
            "file": row.file,
            "speaker": row.speaker,
            "event_type": row.event_type,
            "element_id": row.element_id,
            "event_data": row.event_data,  # JSONB column — already a dict
            "device_type": row.device_type,
            "client_timestamp": row.client_timestamp.isoformat() if row.client_timestamp else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "events": events,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tracking/stats — Summary statistics for admin dashboard
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_tracking_stats(
    role: Optional[str] = Query(None, description="Filter by role (patient/physician)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Return summary statistics: total events, unique sessions, unique patients,
    and event counts by type. Optionally filtered by role.
    """
    base_condition = UserInteractionLog.role == role if role else None

    total_stmt = select(func.count(UserInteractionLog.id))
    if base_condition is not None:
        total_stmt = total_stmt.where(base_condition)
    total_result = await db.execute(total_stmt)
    total_events = total_result.scalar() or 0

    session_stmt = select(func.count(distinct(UserInteractionLog.session_id)))
    if base_condition is not None:
        session_stmt = session_stmt.where(base_condition)
    session_result = await db.execute(session_stmt)
    total_sessions = session_result.scalar() or 0

    patient_stmt = select(func.count(distinct(UserInteractionLog.file)))
    if base_condition is not None:
        patient_stmt = patient_stmt.where(base_condition)
    patient_result = await db.execute(patient_stmt)
    total_patients = patient_result.scalar() or 0

    type_stmt = (
        select(
            UserInteractionLog.event_type,
            func.count(UserInteractionLog.id).label("count"),
        )
        .group_by(UserInteractionLog.event_type)
        .order_by(desc("count"))
    )
    if base_condition is not None:
        type_stmt = type_stmt.where(base_condition)
    type_result = await db.execute(type_stmt)
    event_type_counts = {row.event_type: row.count for row in type_result.all()}

    # Role breakdown (always returned)
    role_stmt = select(
        UserInteractionLog.role,
        func.count(UserInteractionLog.id).label("count"),
    ).group_by(UserInteractionLog.role)
    role_result = await db.execute(role_stmt)
    role_counts = {(row.role or "patient"): row.count for row in role_result.all()}

    return {
        "total_events": total_events,
        "total_sessions": total_sessions,
        "total_patients": total_patients,
        "total_event_types": len(event_type_counts),
        "event_type_counts": event_type_counts,
        "role_counts": role_counts,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tracking/patients — List tracked patients (for dropdown)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/patients")
async def get_tracked_patients(
    role: Optional[str] = Query(None, description="Filter by role (patient/physician)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Return distinct patient file identifiers that have tracking events.
    """
    stmt = select(
        UserInteractionLog.file,
        func.count(UserInteractionLog.id).label("event_count"),
    )
    if role:
        stmt = stmt.where(UserInteractionLog.role == role)
    result = await db.execute(
        stmt.group_by(UserInteractionLog.file).order_by(UserInteractionLog.file)
    )
    patients = [
        {"file": row.file, "event_count": row.event_count}
        for row in result.all()
    ]

    return {"patients": patients}


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tracking/analytics — Aggregated analytics for visualization
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/analytics")
async def get_tracking_analytics(
    role: Optional[str] = Query(None, description="Filter by role (patient/physician)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Return pre-aggregated analytics data for dashboard charts:
    - timeline: events per hour
    - by_patient: event breakdown per patient
    - by_session: per-session summary (duration, event count, device)
    - device_breakdown: events by device type
    - top_elements: most interacted elements
    - hourly_heatmap: activity by hour of day
    """

    role_condition = UserInteractionLog.role == role if role else None

    # ── Helper: run a query in an independent session ────────────────────────
    async def _run(stmt):
        async with AsyncSessionLocal() as s:
            return (await s.execute(stmt)).all()

    def _apply_role(stmt):
        return stmt.where(role_condition) if role_condition is not None else stmt

    # ── Build all 6 statements (no await yet) ────────────────────────────────
    timeline_stmt = _apply_role(
        select(
            func.date_trunc("hour", UserInteractionLog.client_timestamp).label("hour"),
            func.count(UserInteractionLog.id).label("count"),
        ).where(UserInteractionLog.client_timestamp.isnot(None))
    ).group_by("hour").order_by(asc("hour"))

    by_patient_stmt = _apply_role(
        select(
            UserInteractionLog.file,
            UserInteractionLog.event_type,
            func.count(UserInteractionLog.id).label("count"),
        )
    ).group_by(UserInteractionLog.file, UserInteractionLog.event_type) \
     .order_by(UserInteractionLog.file, desc("count"))

    session_stmt = _apply_role(
        select(
            UserInteractionLog.session_id,
            UserInteractionLog.file,
            UserInteractionLog.device_type,
            func.count(UserInteractionLog.id).label("event_count"),
            func.min(UserInteractionLog.client_timestamp).label("first_event"),
            func.max(UserInteractionLog.client_timestamp).label("last_event"),
        )
    ).group_by(
        UserInteractionLog.session_id,
        UserInteractionLog.file,
        UserInteractionLog.device_type,
    ).order_by(desc("first_event"))

    device_stmt = _apply_role(
        select(
            UserInteractionLog.device_type,
            func.count(UserInteractionLog.id).label("count"),
        )
    ).group_by(UserInteractionLog.device_type).order_by(desc("count"))

    element_stmt = _apply_role(
        select(
            UserInteractionLog.element_id,
            UserInteractionLog.event_type,
            func.count(UserInteractionLog.id).label("count"),
        ).where(UserInteractionLog.element_id.isnot(None))
    ).group_by(UserInteractionLog.element_id, UserInteractionLog.event_type) \
     .order_by(desc("count")).limit(20)

    hourly_stmt = _apply_role(
        select(
            extract("hour", UserInteractionLog.client_timestamp).label("hour_of_day"),
            func.count(UserInteractionLog.id).label("count"),
        ).where(UserInteractionLog.client_timestamp.isnot(None))
    ).group_by("hour_of_day").order_by(asc("hour_of_day"))

    # ── Execute all 6 queries in parallel (independent sessions) ─────────────
    (timeline_rows, patient_rows, session_rows,
     device_rows, element_rows, hourly_rows) = await asyncio.gather(
        _run(timeline_stmt),
        _run(by_patient_stmt),
        _run(session_stmt),
        _run(device_stmt),
        _run(element_stmt),
        _run(hourly_stmt),
    )

    # ── Format results ───────────────────────────────────────────────────────
    timeline = [
        {"hour": row.hour.isoformat() if row.hour else None, "count": row.count}
        for row in timeline_rows
    ]

    by_patient: dict = {}
    for row in patient_rows:
        if row.file not in by_patient:
            by_patient[row.file] = {"file": row.file, "total": 0, "types": {}}
        by_patient[row.file]["types"][row.event_type] = row.count
        by_patient[row.file]["total"] += row.count

    sessions = []
    for row in session_rows:
        duration_sec = None
        if row.first_event and row.last_event:
            duration_sec = int((row.last_event - row.first_event).total_seconds())
        sessions.append({
            "session_id": row.session_id,
            "file": row.file,
            "device_type": row.device_type,
            "event_count": row.event_count,
            "first_event": row.first_event.isoformat() if row.first_event else None,
            "last_event": row.last_event.isoformat() if row.last_event else None,
            "duration_sec": duration_sec,
        })

    device_breakdown = [
        {"device": row.device_type or "unknown", "count": row.count}
        for row in device_rows
    ]

    top_elements = [
        {"element_id": row.element_id, "event_type": row.event_type, "count": row.count}
        for row in element_rows
    ]

    hourly_heatmap = [
        {"hour": int(row.hour_of_day), "count": row.count}
        for row in hourly_rows
    ]

    return {
        "timeline": timeline,
        "by_patient": list(by_patient.values()),
        "sessions": sessions,
        "device_breakdown": device_breakdown,
        "top_elements": top_elements,
        "hourly_heatmap": hourly_heatmap,
    }
