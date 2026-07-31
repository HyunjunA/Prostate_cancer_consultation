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
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.admin_session import require_admin_user
from auth.base import AuthUser
from core.settings import get_settings
from db import get_db
from models import AdminUploadLog

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


@router.post("/upload-transcript")
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


@router.get("/upload-log", dependencies=[Depends(require_admin_user)])
async def get_upload_log(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Recent admin uploads, newest first — lets /admin/upload rebuild its list after
    a refresh. Contains only de-identified queued names, never the real study id."""
    limit = max(1, min(limit, 500))
    stmt = (
        select(AdminUploadLog)
        .order_by(AdminUploadLog.uploaded_at.desc(), AdminUploadLog.id.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "uploads": [
            {
                "queued": r.queued_filename,
                "status": r.status,
                "message": r.message,
                "uploaded_by": r.uploaded_by,
                "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
            }
            for r in rows
        ]
    }
