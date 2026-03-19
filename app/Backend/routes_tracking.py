"""
User Interaction Tracking API Routes

Receives batched interaction events from the frontend TrackingEventManager
and stores them in the user_interaction_log table for research analysis.
"""

from typing import List, Optional
from datetime import datetime
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc, asc, and_, distinct, cast, Date, extract
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models import UserInteractionLog

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

@router.post("/events", response_model=TrackingEventResponse)
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
                file=batch.file,
                speaker=batch.speaker,
                event_type=event.event_type,
                element_id=event.element_id,
                event_data=json.dumps(event.metadata) if event.metadata else None,
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
        raise HTTPException(status_code=500, detail=f"Failed to store events: {str(e)}")


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tracking/events — Query interaction events
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/events")
async def get_tracking_events(
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
    stmt = (
        select(UserInteractionLog)
        .where(and_(*conditions)) if conditions else select(UserInteractionLog)
    )
    stmt = stmt.order_by(desc(UserInteractionLog.created_at)).offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    events = []
    for row in rows:
        event_data = None
        if row.event_data:
            try:
                event_data = json.loads(row.event_data)
            except (json.JSONDecodeError, TypeError):
                event_data = row.event_data

        events.append({
            "id": row.id,
            "session_id": row.session_id,
            "file": row.file,
            "speaker": row.speaker,
            "event_type": row.event_type,
            "element_id": row.element_id,
            "event_data": event_data,
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
    db: AsyncSession = Depends(get_db),
):
    """
    Return summary statistics: total events, unique sessions, unique patients,
    and event counts by type.
    """
    total_result = await db.execute(
        select(func.count(UserInteractionLog.id))
    )
    total_events = total_result.scalar() or 0

    session_result = await db.execute(
        select(func.count(distinct(UserInteractionLog.session_id)))
    )
    total_sessions = session_result.scalar() or 0

    patient_result = await db.execute(
        select(func.count(distinct(UserInteractionLog.file)))
    )
    total_patients = patient_result.scalar() or 0

    type_result = await db.execute(
        select(
            UserInteractionLog.event_type,
            func.count(UserInteractionLog.id).label("count"),
        )
        .group_by(UserInteractionLog.event_type)
        .order_by(desc("count"))
    )
    event_type_counts = {row.event_type: row.count for row in type_result.all()}

    return {
        "total_events": total_events,
        "total_sessions": total_sessions,
        "total_patients": total_patients,
        "total_event_types": len(event_type_counts),
        "event_type_counts": event_type_counts,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tracking/patients — List tracked patients (for dropdown)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/patients")
async def get_tracked_patients(
    db: AsyncSession = Depends(get_db),
):
    """
    Return distinct patient file identifiers that have tracking events.
    """
    result = await db.execute(
        select(
            UserInteractionLog.file,
            func.count(UserInteractionLog.id).label("event_count"),
        )
        .group_by(UserInteractionLog.file)
        .order_by(UserInteractionLog.file)
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

    # ── 1. Timeline: events grouped by hour ──────────────────────────────────
    timeline_result = await db.execute(
        select(
            func.date_trunc("hour", UserInteractionLog.client_timestamp).label("hour"),
            func.count(UserInteractionLog.id).label("count"),
        )
        .where(UserInteractionLog.client_timestamp.isnot(None))
        .group_by("hour")
        .order_by(asc("hour"))
    )
    timeline = [
        {"hour": row.hour.isoformat() if row.hour else None, "count": row.count}
        for row in timeline_result.all()
    ]

    # ── 2. Events by patient ─────────────────────────────────────────────────
    patient_result = await db.execute(
        select(
            UserInteractionLog.file,
            UserInteractionLog.event_type,
            func.count(UserInteractionLog.id).label("count"),
        )
        .group_by(UserInteractionLog.file, UserInteractionLog.event_type)
        .order_by(UserInteractionLog.file, desc("count"))
    )
    by_patient_raw = patient_result.all()
    by_patient: dict = {}
    for row in by_patient_raw:
        if row.file not in by_patient:
            by_patient[row.file] = {"file": row.file, "total": 0, "types": {}}
        by_patient[row.file]["types"][row.event_type] = row.count
        by_patient[row.file]["total"] += row.count
    by_patient_list = list(by_patient.values())

    # ── 3. Per-session summary ───────────────────────────────────────────────
    session_result = await db.execute(
        select(
            UserInteractionLog.session_id,
            UserInteractionLog.file,
            UserInteractionLog.device_type,
            func.count(UserInteractionLog.id).label("event_count"),
            func.min(UserInteractionLog.client_timestamp).label("first_event"),
            func.max(UserInteractionLog.client_timestamp).label("last_event"),
        )
        .group_by(
            UserInteractionLog.session_id,
            UserInteractionLog.file,
            UserInteractionLog.device_type,
        )
        .order_by(desc("first_event"))
    )
    sessions = []
    for row in session_result.all():
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

    # ── 4. Device breakdown ──────────────────────────────────────────────────
    device_result = await db.execute(
        select(
            UserInteractionLog.device_type,
            func.count(UserInteractionLog.id).label("count"),
        )
        .group_by(UserInteractionLog.device_type)
        .order_by(desc("count"))
    )
    device_breakdown = [
        {"device": row.device_type or "unknown", "count": row.count}
        for row in device_result.all()
    ]

    # ── 5. Top interacted elements ───────────────────────────────────────────
    element_result = await db.execute(
        select(
            UserInteractionLog.element_id,
            UserInteractionLog.event_type,
            func.count(UserInteractionLog.id).label("count"),
        )
        .where(UserInteractionLog.element_id.isnot(None))
        .group_by(UserInteractionLog.element_id, UserInteractionLog.event_type)
        .order_by(desc("count"))
        .limit(20)
    )
    top_elements = [
        {"element_id": row.element_id, "event_type": row.event_type, "count": row.count}
        for row in element_result.all()
    ]

    # ── 6. Hourly heatmap (hour of day) ──────────────────────────────────────
    hourly_result = await db.execute(
        select(
            extract("hour", UserInteractionLog.client_timestamp).label("hour_of_day"),
            func.count(UserInteractionLog.id).label("count"),
        )
        .where(UserInteractionLog.client_timestamp.isnot(None))
        .group_by("hour_of_day")
        .order_by(asc("hour_of_day"))
    )
    hourly_heatmap = [
        {"hour": int(row.hour_of_day), "count": row.count}
        for row in hourly_result.all()
    ]

    return {
        "timeline": timeline,
        "by_patient": by_patient_list,
        "sessions": sessions,
        "device_breakdown": device_breakdown,
        "top_elements": top_elements,
        "hourly_heatmap": hourly_heatmap,
    }
