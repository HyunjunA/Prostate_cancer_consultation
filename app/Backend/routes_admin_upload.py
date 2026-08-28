"""Admin endpoint: upload a transcript into the pipeline drop folder.

Purpose
    Let the study coordinator drop a transcript through the dashboard admin UI
    instead of SFTP-through-a-jump-server. The file is written into the pipeline's
    watched drop folder (``settings.pipeline_drop_dir``); the already-running
    pipeline watch picks it up and processes it. Nothing about the pipeline itself
    changes — this is an additional transport path.

Only de-identified files are accepted
    De-identification — removing PHI from the transcript text AND hashing the study
    id in the filename — is done by the Secure Transcript Preparation app on the
    clinical machine, BEFORE upload, so the server never receives PHI. This endpoint
    therefore accepts only a file already prepared by the app (a hashed
    ``<hp>_<hd>_<MMDDYYYY>.csv`` name) and stores it as-is. A raw transcript is
    rejected — the server does NOT de-identify (it could only hash the filename, not
    scrub the body, which would leak PHI while looking clean). Admin-only.
"""

import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.admin_session import require_admin_user
from auth.base import AuthUser
from auth.rate_limit import limit
from core.settings import get_settings
from db import get_db
from models import AdminUploadLog, TranscriptAnalysisLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin Upload"])


async def _record_upload(db: AsyncSession, queued_filename, status_str: str,
                         message, uploaded_by) -> None:
    """Log one upload attempt so /admin/upload can rebuild its list after a refresh.

    Best-effort and non-blocking: a logging failure must never break the upload.
    Stores only the de-identified queued name — callers pass None for the filename
    on rejected raw uploads so the real study id is never persisted.
    """
    try:
        db.add(AdminUploadLog(
            queued_filename=queued_filename,
            status=status_str,
            message=message,
            uploaded_by=uploaded_by,
        ))
        await db.commit()
    except Exception:  # noqa: BLE001 - logging is best-effort
        logger.exception("admin upload: failed to write upload log row")
        await db.rollback()


# Already-de-identified filename: <hashedPatient>[_<hashedDoctor>]_<date>.<ext>.
# Every segment is a de-id token — AES-SIV Base32 (letters + 2-7) or a legacy affine
# digit code — and the trailing <date> is now hashed too (Base32), though legacy
# plaintext MMDDYYYY (8 digits) is still accepted. All tokens therefore match
# [A-Z0-9]+. Require at least two segments (patient + date); the doctor is optional.
_DEID_NAME_RX = re.compile(
    r"^[A-Z0-9]+_[A-Z0-9]+(_[A-Z0-9]+)?\.(csv|xlsx)$", re.IGNORECASE
)
_MAX_BYTES = 25 * 1024 * 1024  # 25 MB
_CHUNK = 1024 * 1024

# Files the pipeline watch will pick up. An upload in flight is written as
# "<name>.part" (see _stream_to) and matches neither glob, so a partially received
# file never counts as queued work.
_QUEUE_GLOBS = ("*.csv", "*.xlsx")

# How recently a queued file may have arrived and still not block a new upload.
# Without it the drop folder blocks the caller's own batch: /admin/upload posts one
# file per request, so the first file of a 3-file batch would 409 the other two. A
# real run is well past this by the time anyone could click again.
_UPLOAD_GRACE_SECONDS = 30


def _queue_state(drop_dir: Path) -> dict:
    """Describe the drop folder: what is queued, and for how long.

    The drop folder IS the queue — the upload endpoint writes into it and the
    pipeline watch moves each file to archive/ or error/ when the run finishes — so
    "a matching file is present" means "queued or being processed right now".
    """
    queued = sorted(
        (p for pattern in _QUEUE_GLOBS for p in drop_dir.glob(pattern) if p.is_file()),
        key=lambda p: p.name,
    )
    if not queued:
        return {"busy": False, "queued": [], "waiting_seconds": 0}

    now = time.time()
    oldest = 0.0
    for p in queued:
        try:
            oldest = max(oldest, now - p.stat().st_mtime)
        except OSError:
            continue  # vanished mid-scan (the watcher just archived it)
    return {
        "busy": True,
        "queued": [p.name for p in queued],
        "waiting_seconds": int(max(oldest, 0)),
    }


async def _stream_to(file: UploadFile, dest: Path) -> int:
    """Stream the upload to ``dest`` with a running size cap. Returns byte count."""
    total = 0
    with dest.open("wb") as out:
        while True:
            chunk = await file.read(_CHUNK)
            if not chunk:
                break
            total += len(chunk)
            if total > _MAX_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="File too large (max 25 MB).",
                )
            out.write(chunk)
    return total


# 10/min: an admin uploading a batch by hand sends far fewer, and every
# accepted file is 25 MB and starts a pipeline run.
@router.post("/upload-transcript", dependencies=[limit(10, 60)])
async def upload_transcript(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: AuthUser = Depends(require_admin_user),
) -> dict:
    """Accept an already de-identified transcript into the pipeline drop folder.

    Only a file prepared by the Secure Transcript Preparation app (a hashed
    ``<hp>[_<hd>]_<date>.csv`` name) is accepted, and it is stored as-is. A raw
    transcript is rejected with 400 — the server never de-identifies, because it
    could only hash the filename, not scrub PHI from the body (see the module
    docstring). Admin-only. Every attempt is logged to admin_upload_log so the
    upload page can rebuild its list after a refresh — with only the de-identified
    queued name, never the real study id.
    """
    uploader = getattr(admin, "username", None)
    try:
        return await _do_upload(file, db, uploader)
    except HTTPException as exc:
        # Record the rejection WITHOUT the filename (a raw name is a real study id).
        await _record_upload(db, None, "error", str(exc.detail), uploader)
        raise


async def _do_upload(file: UploadFile, db: AsyncSession, uploader) -> dict:
    name = Path(file.filename or "").name  # strip path components (traversal guard)
    settings = get_settings()
    drop_dir = Path(settings.pipeline_drop_dir).resolve()
    drop_dir.mkdir(parents=True, exist_ok=True)

    # ── Busy gate: one transcript through the pipeline at a time ─────────────
    # The watch processes the drop folder serially, so uploading mid-run just piles
    # work up invisibly. /admin/upload disables its button off the same signal; this
    # is the backstop for a second tab or a direct POST. A stale queue is NOT
    # blocked — a file the watcher can never process must not lock uploading
    # forever (same escape hatch the UI uses).
    state = _queue_state(drop_dir)
    stale_after = get_settings().upload_gate_stale_seconds
    if (state["busy"]
            and state["waiting_seconds"] > _UPLOAD_GRACE_SECONDS
            and state["waiting_seconds"] <= stale_after):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(f"The pipeline is still processing {state['queued'][0]}. "
                    "Wait for it to finish, then upload again."),
        )

    # ── Accepted: already de-identified — store as-is (overwrite) ────────────
    if _DEID_NAME_RX.match(name):
        dest = (drop_dir / name).resolve()
        if dest.parent != drop_dir:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Invalid filename.")
        replaced = dest.exists()
        tmp = dest.with_name(dest.name + ".part")
        try:
            total = await _stream_to(file, tmp)
            os.replace(tmp, dest)  # atomic overwrite
        except HTTPException:
            tmp.unlink(missing_ok=True)
            raise
        except Exception as exc:  # noqa: BLE001
            tmp.unlink(missing_ok=True)
            logger.exception("upload-transcript: failed to store %s", name)
            raise HTTPException(status_code=500, detail="Failed to store the file.") from exc
        logger.info("admin upload: %s %s (%d bytes)",
                    "replaced" if replaced else "queued", name, total)
        # The name is already de-identified (hashed) — safe to record.
        await _record_upload(db, name, "queued",
                             "replaced existing" if replaced else None, uploader)
        return {"queued": name, "bytes": total, "replaced": replaced}

    # ── Anything else: reject. ───────────────────────────────────────────────
    # De-identification (both removing PHI from the text AND hashing the study id in
    # the filename) is the Secure Transcript Preparation app's job, on the clinical
    # machine, BEFORE upload — so the server never receives PHI. The server therefore
    # accepts only files already prepared by the app (the hashed name above) and
    # rejects a raw transcript. It deliberately does NOT de-identify here: it could
    # only hash the filename, not remove PHI from the body (that needs the app's
    # model), which would let PHI through while looking de-identified.
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=("This file has not been de-identified. Run it through the Secure "
                "Transcript Preparation app first, then upload the file it creates "
                "in the ready_to_upload folder."),
    )


@router.get("/upload-gate", dependencies=[Depends(require_admin_user)])
async def upload_gate() -> dict:
    """Report whether the pipeline is busy, so /admin/upload can disable uploading.

    The pipeline watch handles the drop folder one file at a time and a run takes
    a couple of minutes, so a second upload mid-run silently queues behind the
    first with nothing on screen to say so. This lets the page disable its Upload
    button and name what is being processed.

    ``stale`` means a queued file has been sitting far longer than a run takes —
    most likely the watcher is down or the file cannot be processed. The page
    re-enables uploading in that case rather than staying locked forever; the
    stuck file still needs a human.
    """
    settings = get_settings()
    drop_dir = Path(settings.pipeline_drop_dir).resolve()
    if not drop_dir.is_dir():
        # Not yet created (fresh host) — nothing can be queued.
        return {"busy": False, "stale": False, "queued": [], "waiting_seconds": 0,
                "stale_after_seconds": settings.upload_gate_stale_seconds}
    state = _queue_state(drop_dir)
    return {
        **state,
        "stale": state["waiting_seconds"] > settings.upload_gate_stale_seconds,
        "stale_after_seconds": settings.upload_gate_stale_seconds,
    }


@router.get("/upload-precheck", dependencies=[Depends(require_admin_user)])
async def upload_precheck(
    name: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Report whether this de-identified filename has already been processed.

    Lets /admin/upload warn the coordinator BEFORE any bytes are sent. Without it a
    re-upload of an already-processed name looks like it worked — the file lands in
    the drop folder, but the pipeline watcher dedupes by path in an in-memory set
    (utils/file_manager.watch_input_folder) and skips it with no log line, no error,
    and no move to the error folder, so the file just sits there.

    Match key is transcript_analysis_log.source_filename — the same de-identified
    name the drop folder receives — so "already processed" means "results are in the
    DB", which is exactly what the dashboard shows. A duplicate is reported, never
    blocked: re-running is legitimate (e.g. after the DB was cleared).
    """
    safe = Path(name or "").name  # strip path components
    if not safe:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="name is required.")
    stmt = (
        select(TranscriptAnalysisLog)
        .where(TranscriptAnalysisLog.source_filename == safe)
        .order_by(TranscriptAnalysisLog.id.desc())
        .limit(1)
    )
    row = (await db.execute(stmt)).scalars().first()
    if row is None:
        return {"name": safe, "duplicate": False}
    return {
        "name": safe,
        "duplicate": True,
        "analysis_id": row.id,
        "patient_id": row.patient_id,
        "processed": bool(row.processed),
        "analyzed_at": row.analyzed_at.isoformat() if row.analyzed_at else None,
    }


# When a run actually finished. analyzed_at is only the NLP save (step 8); the AI
# stage lands later and stamps processed_at (step 9). Older rows predate
# processed_at, so fall back to analyzed_at rather than reporting nothing.
_COMPLETED_AT = func.coalesce(
    TranscriptAnalysisLog.processed_at, TranscriptAnalysisLog.analyzed_at
)


def _derive_state(
    row: AdminUploadLog,
    completed_at: datetime | None,
    in_drop_folder: set[str],
) -> str:
    """Where this upload actually is in the pipeline.

    ``admin_upload_log.status`` cannot answer this — see get_upload_log. Priority
    order matters: a rejected upload stays an error even if some earlier run
    happens to match the name.
    """
    if row.status == "error":
        return "error"
    if completed_at is not None:
        return "analyzed"
    if row.queued_filename and row.queued_filename in in_drop_folder:
        return "processing"
    return "queued"


@router.get("/upload-log", dependencies=[Depends(require_admin_user)])
async def get_upload_log(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Recent admin uploads, newest first, each with where it actually is in the
    pipeline — so /admin/upload can rebuild its list after a refresh AND show
    progress instead of a single frozen badge.

    ``admin_upload_log.status`` is written once, at POST time, and is never
    advanced: the pipeline runs in the AI repo and has no handle on this table, so
    every row reads 'queued' forever even after its run finished. Rendering that
    column literally showed a green "done" for transcripts that had not been
    started yet and for ones that were mid-run, which is indistinguishable from
    the upload silently failing.

    The state is therefore DERIVED from the two sources that ARE authoritative:

    * ``transcript_analysis_log.source_filename`` — the same de-identified name the
      drop folder receives. This is the join ``upload_precheck`` already relies on.
    * the drop folder itself — the watcher only moves a file to archive/ once the
      run returns, so a file still sitting there is queued or running right now.

    The analysis must have completed AFTER this upload (``_COMPLETED_AT >
    uploaded_at``). Without that comparison, re-uploading an already-processed name
    would immediately report the PREVIOUS run's result and the page would claim the
    new run was done before it started.

    Contains only de-identified queued names, never the real study id.
    """
    limit = max(1, min(limit, 500))

    # Earliest run that finished after this upload — the one this upload triggered.
    # A correlated scalar subquery, not a LEFT JOIN: a name processed several times
    # would otherwise multiply the log rows.
    completed_at = (
        select(func.min(_COMPLETED_AT))
        .where(
            TranscriptAnalysisLog.source_filename == AdminUploadLog.queued_filename,
            TranscriptAnalysisLog.processed.is_(True),
            _COMPLETED_AT > AdminUploadLog.uploaded_at,
        )
        .correlate(AdminUploadLog)
        .scalar_subquery()
    )

    stmt = (
        select(AdminUploadLog, completed_at.label("completed_at"))
        .order_by(AdminUploadLog.uploaded_at.desc(), AdminUploadLog.id.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    # One folder scan for the whole page, not one per row.
    drop_dir = Path(get_settings().pipeline_drop_dir).resolve()
    in_drop_folder = (
        set(_queue_state(drop_dir)["queued"]) if drop_dir.is_dir() else set()
    )
    now = datetime.now(timezone.utc)

    uploads = []
    for row, finished in rows:
        # How long the run took, or has been going so far. The page renders a live
        # timer off this: a run is minutes long, and a static badge reads as stuck.
        elapsed = None
        if row.uploaded_at is not None:
            elapsed = max(int(((finished or now) - row.uploaded_at).total_seconds()), 0)
        uploads.append({
            "queued": row.queued_filename,
            "status": row.status,      # raw column, kept so older clients still work
            "state": _derive_state(row, finished, in_drop_folder),
            "message": row.message,
            "uploaded_by": row.uploaded_by,
            "uploaded_at": row.uploaded_at.isoformat() if row.uploaded_at else None,
            "analyzed_at": finished.isoformat() if finished else None,
            "elapsed_seconds": elapsed,
        })
    return {"uploads": uploads}
