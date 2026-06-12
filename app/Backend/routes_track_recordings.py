"""Session Recording (rrweb) — POST/GET endpoints, area-aware.

Stores and serves browser-side session replays produced by `rrweb`
(https://www.rrweb.io/) — a JS library that captures every DOM mutation
and user input into a stream of "events". When played back through
rrweb-player it reproduces exactly what the user saw and did.

Replaces the legacy /api/tracking/recordings endpoints with an area-
aware variant. The underlying session_recording table is shared across
all three tracking areas (patient_first, patient_followup, doctor); the
new `area` column lets the admin UI filter recordings by which interface
produced them.

Why "chunks" instead of one big blob:
    rrweb produces 50-200 events per second. A 5-minute session can
    easily exceed 50 MB of raw JSON. The frontend uploads in chunks
    every few seconds so:
      - A network blip loses one chunk, not the whole session.
      - The DB never has to swallow a >100 MB POST body in one go.
      - The user does not have to "wait for upload" at session end.
    On read we stitch chunks back together by `chunk_index` order.

Why gzip the events before storing:
    rrweb event JSON is highly repetitive (the same DOM strings appear
    over and over). gzip on the encoded bytes typically gives 5-15x
    compression, dropping a 50 MB session to ~5 MB of BYTEA in postgres.

Endpoint shape (all under /api/track/recordings):
    POST /{area}                  -> append a chunk
    GET  /{area}                  -> list distinct sessions in this area
    GET  /{area}/{session_id}     -> stitched + decompressed payload
                                     (ready for rrweb-player)

Authentication: every endpoint requires a valid auth header — applied
once at the router level via `dependencies=[Depends(get_current_user)]`.
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
from auth.admin_session import require_admin_user
from db import get_db
from models import SessionRecording

logger = logging.getLogger(__name__)


# Router declaration. `dependencies=[Depends(get_current_user)]` applies
# auth to EVERY endpoint without us having to add it to each signature.
# `tags=` controls the section header in the auto-generated /docs UI.
router = APIRouter(
    prefix="/api/track/recordings",
    tags=["Track-Recordings"],
    dependencies=[Depends(get_current_user)],
)


# Pydantic-friendly enum of valid `area` values. Using a Literal type
# means FastAPI will reject (with 422) any path like `/api/track/recordings/admin`
# at the router level, before our handler runs.
#
# Interface-level areas the admin UI filters by:
#   patient_first_report / patient_first_survey / patient_followup / physician
# Interface-level areas the admin UI filters by are the first four. The legacy
# values ('patient_first', 'doctor') are still ACCEPTED on POST so a browser
# running the pre-split JS (or an in-flight session) does not lose its upload
# with a 422; they are normalised to the new keys at write time (see
# _AREA_NORMALIZE) so every recording lands in the correct new tab regardless
# of which client version produced it.
Area = Literal[
    "patient_first_report",
    "patient_first_survey",
    "patient_followup",
    "physician",
    "patient_first",
    "doctor",
]

# Legacy area key -> canonical new key. Applied on write so old-client uploads
# show up under the new taxonomy (patient_first was the pre-split first visit;
# 'doctor' is the same interface now called 'physician').
_AREA_NORMALIZE = {
    "patient_first": "patient_first_report",
    "doctor": "physician",
}


# ── Pydantic models ──────────────────────────────────────────────────────────

class RecordingChunk(BaseModel):
    """One chunk uploaded by the rrweb capture script."""

    # session_id is generated client-side (uuid4) and stays constant
    # for the duration of one recording. We use it to group chunks back
    # together in list_recordings / get_recording_payload.
    session_id: str = Field(..., min_length=1, max_length=100)

    # Optional logical "file" tag — for example the patient .xlsx the
    # recording is associated with. Lets the admin UI filter by patient.
    file: Optional[str] = Field(None, max_length=255)

    # JSON-encoded array of rrweb eventWithTime objects. We keep it as a
    # string (rather than parsing into a Python list at the API boundary)
    # so the upload is byte-for-byte preserved before gzipping below.
    events: str = Field(..., description="JSON-encoded array of rrweb eventWithTime objects")


class RecordingResponse(BaseModel):
    """Acknowledgement payload returned to the rrweb uploader."""

    status: str
    chunk_id: int      # primary key of the row we just inserted
    event_count: int   # how many rrweb events we ingested in this chunk


# ── POST /api/track/recordings/{area} ────────────────────────────────────────

@router.post("/{area}", response_model=RecordingResponse)
async def post_recording_chunk(
    area: Area,
    chunk: RecordingChunk,
    db: AsyncSession = Depends(get_db),
):
    """Store a gzip-compressed rrweb chunk under the given area.

    The frontend calls this every few seconds while a session is active.
    Each call appends one row to `session_recording`; we never UPDATE
    existing rows, which keeps the write path lock-free.
    """
    # First sanity-check the events payload. We do not trust the client
    # to send well-formed JSON, and storing a corrupt blob would only
    # explode later when the GET endpoint tries to decompress + parse it.
    try:
        events_list = json.loads(chunk.events)
        if not isinstance(events_list, list):
            raise ValueError("events payload must decode to a JSON array")
    except (ValueError, json.JSONDecodeError) as e:
        # 422 Unprocessable Entity — the request body parsed as JSON but
        # the inner `events` string did not. Different from 400 (bad
        # request) so the frontend can branch on validation vs auth/etc.
        raise HTTPException(status_code=422, detail=f"Invalid events payload: {e}")

    # Determine the next `chunk_index` for this session.
    #
    # Why coalesce(max(chunk_index), -1) + 1 instead of count(*) + 1:
    #   `max + 1` is correct even if rows have been deleted (gaps in the
    #   sequence are fine; we only need monotonic ordering). count() would
    #   reuse a deleted index and break ordering.
    # Why -1 as the coalesce default:
    #   max() on an empty set returns NULL; coalesced to -1 so the first
    #   chunk gets index 0. (Coalescing to 0 would start at 1 and waste
    #   the convenient 0-indexed convention.)
    chunk_idx_stmt = select(func.coalesce(func.max(SessionRecording.chunk_index), -1) + 1).where(
        SessionRecording.session_id == chunk.session_id
    )
    next_idx = (await db.execute(chunk_idx_stmt)).scalar_one()

    # gzip the raw event JSON. Compression ratios for rrweb data are
    # typically 5-15x because the same DOM strings repeat constantly.
    compressed = gzip.compress(chunk.events.encode("utf-8"))

    # Normalise legacy area keys ('patient_first', 'doctor') to the new
    # taxonomy so uploads from a cached pre-split client still land in the
    # correct tab instead of an invisible/old bucket.
    stored_area = _AREA_NORMALIZE.get(area, area)

    row = SessionRecording(
        session_id=chunk.session_id,
        chunk_index=next_idx,
        file=chunk.file,
        recording_data=compressed,
        event_count=len(events_list),
        area=stored_area,
    )

    try:
        db.add(row)
        await db.commit()
        # refresh() pulls back the auto-generated id (and any other
        # server-defaults) so we can return the chunk_id to the client.
        await db.refresh(row)
    except Exception as e:
        # Rollback explicitly on failure — async SQLAlchemy will not
        # auto-rollback like a sync transaction would, so an error here
        # would leave the session in a broken state for the next request.
        await db.rollback()
        logger.error(f"session_recording insert failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to store recording chunk")

    return RecordingResponse(status="ok", chunk_id=row.id, event_count=row.event_count)


# ── GET /api/track/recordings/{area} ─────────────────────────────────────────

@router.get("/{area}", dependencies=[Depends(require_admin_user)])
async def list_recordings(
    area: Area,
    file: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List recording sessions in this area (one row per session_id).

    Returns a list of {session_id, file, chunk_count, event_count,
    started_at, ended_at} — enough metadata for the admin UI to render
    a session table without downloading the actual recording payloads.

    Query params (all optional):
        file       : filter to recordings tagged with this file
        session_id : filter to one specific session (mostly debug use)
        limit      : page size, 1-500 (default 50). We DO NOT paginate
                     beyond a single page here — admin UI is internal
                     and can refine via filters instead.
    """
    # Group-by session_id so the admin UI sees one row per session.
    # We aggregate chunk metadata: count, total events, first/last
    # timestamps.
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

    # Optional filters tighten the WHERE clause AFTER the group_by base
    # so they apply to the aggregation, not just to the raw rows.
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
                # event_count can be NULL when a session has zero events
                # (theoretically possible if every chunk was empty); coerce
                # to 0 so the admin UI does not have to handle nulls.
                "event_count": r.event_count or 0,
                # ISO-8601 strings are JSON-friendly and timezone-aware.
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "ended_at": r.ended_at.isoformat() if r.ended_at else None,
            }
            for r in res.all()
        ],
    }


# ── GET /api/track/recordings/{area}/{session_id} ────────────────────────────

@router.get("/{area}/{session_id}", dependencies=[Depends(require_admin_user)])
async def get_recording_payload(
    area: Area,
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return all chunks for one session as a single decompressed event list.

    The output is exactly the format rrweb-player expects:
        {"events": [eventWithTime, eventWithTime, ...]}
    so the admin UI can pipe the response straight into the player.

    Resilience:
        Each chunk is decompressed individually, with corrupt chunks
        skipped (logged but not raised). Better to hand the user 95% of
        a session than nothing — partial replays are still useful.
    """
    # Fetch chunks in chunk_index order so the stitched event stream
    # reproduces the original chronological sequence.
    stmt = select(SessionRecording).where(
        SessionRecording.session_id == session_id,
        SessionRecording.area == area,
    ).order_by(SessionRecording.chunk_index.asc())

    res = await db.execute(stmt)
    rows = res.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Stitch all chunks into one flat events list.
    events: List[dict] = []
    for r in rows:
        # Defensive: a row could in theory exist without recording_data
        # (e.g. an old migration left NULL). Skip rather than crash.
        if not r.recording_data:
            continue
        try:
            decompressed = gzip.decompress(r.recording_data).decode("utf-8")
            chunk_events = json.loads(decompressed)
            if isinstance(chunk_events, list):
                events.extend(chunk_events)
        except Exception as e:
            # One bad chunk should not kill the whole replay. Log and
            # move on — the admin UI gets the rest of the events.
            logger.warning(f"Skipping corrupt chunk {r.id}: {e}")

    return {
        "session_id": session_id,
        "area": area,
        "chunk_count": len(rows),
        "event_count": len(events),
        "events": events,
    }
