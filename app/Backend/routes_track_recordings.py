"""
Session Recording (rrweb) — POST/GET endpoints, area-aware

Replaces the legacy /api/tracking/recordings endpoints with an area-aware
variant. The underlying session_recording table is shared across all three
tracking areas (patient_first, patient_followup, doctor); the new `area`
column lets the admin UI filter recordings by which interface produced them.
"""

from typing import List, Literal, Optional
import gzip
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models import SessionRecording

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/api/track/recordings",
    tags=["Track-Recordings"],
    dependencies=[Depends(get_current_user)],
)


Area = Literal["patient_first", "patient_followup", "doctor"]


# ── Pydantic models ──────────────────────────────────────────────────────────

class RecordingChunk(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=100)
    file: Optional[str] = Field(None, max_length=255)
    events: str = Field(..., description="JSON-encoded array of rrweb eventWithTime objects")


class RecordingResponse(BaseModel):
    status: str
    chunk_id: int
    event_count: int


# ── POST /api/track/recordings/{area} ────────────────────────────────────────

@router.post("/{area}", response_model=RecordingResponse)
async def post_recording_chunk(
    area: Area,
    chunk: RecordingChunk,
    db: AsyncSession = Depends(get_db),
):
    """Store a gzip-compressed rrweb chunk under the given area."""
    try:
        events_list = json.loads(chunk.events)
        if not isinstance(events_list, list):
            raise ValueError("events payload must decode to a JSON array")
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid events payload: {e}")

    # Determine the next chunk_index for this session
    chunk_idx_stmt = select(func.coalesce(func.max(SessionRecording.chunk_index), -1) + 1).where(
        SessionRecording.session_id == chunk.session_id
    )
    next_idx = (await db.execute(chunk_idx_stmt)).scalar_one()

    compressed = gzip.compress(chunk.events.encode("utf-8"))

    row = SessionRecording(
        session_id=chunk.session_id,
        chunk_index=next_idx,
        file=chunk.file,
        recording_data=compressed,
        event_count=len(events_list),
        area=area,
    )

    try:
        db.add(row)
        await db.commit()
        await db.refresh(row)
    except Exception as e:
        await db.rollback()
        logger.error(f"session_recording insert failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to store recording chunk")

    return RecordingResponse(status="ok", chunk_id=row.id, event_count=row.event_count)


# ── GET /api/track/recordings/{area} ─────────────────────────────────────────

@router.get("/{area}")
async def list_recordings(
    area: Area,
    file: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List recording sessions in this area (one row per session_id)."""
    stmt = select(
        SessionRecording.session_id,
        SessionRecording.file,
        func.count().label("chunk_count"),
        func.sum(SessionRecording.event_count).label("event_count"),
        func.min(SessionRecording.created_at).label("started_at"),
        func.max(SessionRecording.created_at).label("ended_at"),
    ).where(
        SessionRecording.area == area
    ).group_by(
        SessionRecording.session_id, SessionRecording.file,
    ).order_by(desc("started_at")).limit(limit)

    if file:
        stmt = stmt.where(SessionRecording.file == file)
    if session_id:
        stmt = stmt.where(SessionRecording.session_id == session_id)

    res = await db.execute(stmt)
    return {
        "area": area,
        "sessions": [
            {
                "session_id": r.session_id,
                "file": r.file,
                "chunk_count": r.chunk_count,
                "event_count": r.event_count or 0,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "ended_at": r.ended_at.isoformat() if r.ended_at else None,
            }
            for r in res.all()
        ],
    }


# ── GET /api/track/recordings/{area}/{session_id} ────────────────────────────

@router.get("/{area}/{session_id}")
async def get_recording_payload(
    area: Area,
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Return all chunks for one session as a single decompressed event list,
    ready for rrweb-player consumption.
    """
    stmt = select(SessionRecording).where(
        SessionRecording.session_id == session_id,
        SessionRecording.area == area,
    ).order_by(SessionRecording.chunk_index.asc())

    res = await db.execute(stmt)
    rows = res.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Recording not found")

    events: List[dict] = []
    for r in rows:
        if not r.recording_data:
            continue
        try:
            decompressed = gzip.decompress(r.recording_data).decode("utf-8")
            chunk_events = json.loads(decompressed)
            if isinstance(chunk_events, list):
                events.extend(chunk_events)
        except Exception as e:
            logger.warning(f"Skipping corrupt chunk {r.id}: {e}")

    return {
        "session_id": session_id,
        "area": area,
        "chunk_count": len(rows),
        "event_count": len(events),
        "events": events,
    }
