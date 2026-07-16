"""Admin endpoint: upload a transcript into the pipeline drop folder.

Purpose
    Let the study coordinator drop a transcript through the dashboard admin UI
    instead of SFTP-through-a-jump-server. The file is written into the pipeline's
    watched drop folder (``settings.pipeline_drop_dir``); the already-running
    pipeline watch picks it up and processes it. Nothing about the pipeline itself
    changes — this is an additional transport path.

Two accepted inputs
    1. A RAW study-id transcript (``SID 22_doc2.xlsx`` / ``DLC ...``): the server
       de-identifies it on upload (reusing the AI repo's AES-SIV de-id, which needs
       ``DEID_KEY``), writes the hashed ``<hp>_<hd>_<MMDDYYYY>.csv`` into the drop
       folder, and immediately deletes the raw file so no PHI lingers. The
       real<->hash mapping is returned in the response (never persisted server-side).
    2. An already de-identified file (``<hp>_<hd>_07142026.csv``): stored as-is.

    Anything else is rejected. Auth is admin-only (``require_admin_user``).
"""

import logging
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)

from auth.admin_session import require_admin_user
from core.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin Upload"])

# Already-de-identified filename: <hashedPatient>[_<hashedDoctor>]_<MMDDYYYY>.<ext>.
# Hash tokens are AES-SIV Base32 (letters + 2-7); legacy affine codes are digits —
# accept either (alphanumeric) so both store-as-is. The doctor token is optional.
_DEID_NAME_RX = re.compile(r"^[A-Z0-9]+(_[A-Z0-9]+)?_\d{8}\.(csv|xlsx)$", re.IGNORECASE)
_RAW_EXTS = (".xlsx", ".xls", ".csv")
_MAX_BYTES = 25 * 1024 * 1024  # 25 MB
_CHUNK = 1024 * 1024

# The sibling AI repo's de-id script (scripts/) is importable — the backend venv
# has pandas/openpyxl and the script is pure functions behind an __main__ guard.
_AI_SCRIPTS = (
    Path(__file__).resolve().parents[3]
    / "AI_physician_patient_communication"
    / "scripts"
)


def _load_deid():
    """Lazily import the AI repo's de-id helpers (reuse, don't reimplement)."""
    if str(_AI_SCRIPTS) not in sys.path:
        sys.path.append(str(_AI_SCRIPTS))
    try:
        from deidentify_transcript import (  # noqa: E402
            deidentify_file,
            extract_study_id,
        )
        return deidentify_file, extract_study_id
    except Exception as exc:  # noqa: BLE001
        logger.exception("upload-transcript: de-id module unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="De-identification module is unavailable on the server.",
        ) from exc


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


@router.post("/upload-transcript", dependencies=[Depends(require_admin_user)])
async def upload_transcript(file: UploadFile = File(...)) -> dict:
    """Accept a raw or de-identified transcript into the pipeline drop folder.

    Raw files are de-identified server-side (raw deleted immediately after);
    already-hashed files are stored as-is. Admin-only.
    """
    name = Path(file.filename or "").name  # strip path components (traversal guard)
    settings = get_settings()
    drop_dir = Path(settings.pipeline_drop_dir).resolve()
    drop_dir.mkdir(parents=True, exist_ok=True)

    # ── Path 1: already de-identified — store as-is (overwrite) ──────────────
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
        return {"queued": name, "bytes": total, "replaced": replaced,
                "deidentified": False}

    # ── Path 2: raw study-id transcript — de-identify on the server ──────────
    deidentify_file, extract_study_id = _load_deid()
    key = settings.deid_key
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server de-identification key (DEID_KEY) is not configured.",
        )
    if Path(name).suffix.lower() not in _RAW_EXTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Unsupported file type (use .xlsx / .xls / .csv).")
    try:
        extract_study_id(name)  # validates a known SID/DLC study id is present
    except Exception:  # noqa: BLE001 - fail-closed on unrecognized names
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Unrecognized filename. Upload a raw transcript named like "
                    "'SID 22_doc2.xlsx', or an already de-identified "
                    "'13511_13571_07142026.csv'."),
        )

    # Save the raw file to an isolated temp dir (NOT the drop folder, so the watch
    # never sees the PHI original), de-identify into the drop folder, then delete
    # the raw. The temp dir is always removed in `finally` — no PHI lingers.
    tmp_dir = Path(tempfile.mkdtemp(prefix="deid_upload_"))
    try:
        tmp_raw = tmp_dir / name
        await _stream_to(file, tmp_raw)
        today = datetime.now().strftime("%m%d%Y")
        mapping = deidentify_file(tmp_raw, out_dir=drop_dir, date_str=today, key=key)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("upload-transcript: server de-id failed for %s", name)
        raise HTTPException(status_code=500,
                            detail="Server-side de-identification failed.") from exc
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    out_name = mapping.get("output_file", "")
    logger.info("admin upload: de-identified %s -> %s", name, out_name)
    return {
        "queued": out_name,
        "deidentified": True,
        "mapping": {
            "real_sid": mapping.get("real_sid"),
            "hashed_patient": mapping.get("hashed_patient"),
            "doctor": mapping.get("doctor"),
            "hashed_doctor": mapping.get("hashed_doctor"),
        },
    }
