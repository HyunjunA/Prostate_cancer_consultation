"""Transcript Analysis REST API — FastAPI router for the ML scoring pipeline.

HTTP front door to the same NLP+LLM pipeline that pipeline_runner.py
executes from the CLI. The CLI runs the pipeline as a batch over a
folder; this module runs it ad-hoc on whatever the React dashboard
(or any cURL caller) uploads.

Both paths share the same heavy lifting (sentence_classification +
persistence + ai_pipeline_service) — only the entry point differs.

Endpoints
---------
``POST /api/transcript/analyze``
    Upload a single xlsx file → run pipeline → return JSON with per-model
    top sentences, scores, and context. The xlsx result is saved to disk
    and to the ``transcript_analysis_log`` database table.

``POST /api/transcript/analyze-batch``
    Upload multiple xlsx files → process each independently (per-file error
    handling) → return aggregated results. Each successful analysis is saved
    to disk and DB.

``GET /api/transcript/download/{patient_id}``
    Download the generated xlsx result file. Falls back to the database
    ``xlsx_data`` column if the file is missing from disk.

``GET /api/transcript/download-batch?patient_ids=sid-01,sid-02``
    Download results for multiple patients as a single zip archive.

``GET /api/transcript/history/{patient_id}``
    Retrieve the analysis history for a patient from the database, including
    parameters used, timestamps, and per-model score summaries.

``GET /api/transcript/predictions/{patient_id}``
    Query the per-sentence prediction table for a specific analysis,
    with optional model / score / top-N filters. Includes a backfill
    path for legacy rows that pre-date the sentence_prediction table.

Authentication
--------------
All endpoints require an ``X-API-Key`` header matching the ``API_KEY``
environment variable (server refuses to start if not set). Patient-
specific endpoints additionally enforce per-user patient access via
auth/access_control.check_patient_access().

Storage
-------
* **File system**: xlsx files are written to ``UPLOAD_DIR/{patient_id}_predictions.xlsx``
  (shared across gunicorn workers).
* **Database**: each analysis run is logged to ``transcript_analysis_log`` with
  metadata, the full model results as JSON, and the xlsx binary. DB storage is
  wrapped in try/except so a DB failure never blocks the primary response.

Resilience patterns used throughout:
* **Disk + DB dual persistence** for downloads — disk is fast, DB is durable.
* **Disk fallback rebuild** — if the file is missing but DB has the bytes,
  we serve from DB AND re-save to disk so future requests skip the lookup.
* **Per-file isolation** in batch — one bad file does not abort the others.
* **Non-fatal DB/AI failures** — the response still goes out so the
  caller is not blocked by an internal write issue.
"""

import logging
import os
import re
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.settings import get_settings
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.access_control import check_patient_access
from auth.base import AuthUser
from db import get_db, AsyncSessionLocal
from models import SentencePrediction, TranscriptAnalysisLog
from pipeline_runner import (
    OUTCOME_TO_SHEET,
    _read_transcript,
    _export_to_xlsx_bytes,
    _DOMAIN_SLOT_MAP,
    _DOMAIN_SHORT_MAP,
)  # noqa: E402
import persistence
import ai_pipeline_service

# .env loading is centralised in core.settings now; no module-level
# load_dotenv() needed here.
logger = logging.getLogger(__name__)


async def analyze_transcript(
    file_bytes: bytes,
    filename: str,
    top_n: int = 0,
    context_window: int = 3,
) -> Dict[str, Any]:
    """Run transcript analysis using sentence_classification (R stringi).

    Replaces the old transcript_service.analyze_transcript to guarantee
    identical sentence segmentation with the original R pipeline. Mirrors
    pipeline_runner.process_single_file's logic — same Steps 1-6 — but
    operates on uploaded bytes instead of files on disk.

    Returns:
        Dict with `patient_id`, `total_sentences`, `models` (response
        payload for the HTTP caller), `xlsx_bytes`, plus the
        intermediate DataFrames the persistence layer needs
        (df_raw, df_filtered, df_sentences, df_predicted, top_by_model).
    """
    import asyncio
    import sys
    import types
    import tempfile

    # sentence_classification.read_input_file expects a real file path.
    # Write the upload to a temp file, then delete it in `finally` below
    # so we never leak temp files even on exceptions.
    suffix = ".csv" if filename.lower().endswith(".csv") else ".xlsx"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        # ── sys.modules shim for sentence_classification's `from config import` ──
        # Same trick as pipeline_runner.process_single_file: the package
        # was written assuming `config` means a constants module, but in
        # the Backend container `config` means our YAML loader. Swap a
        # fake `config` into sys.modules just long enough to import the
        # submodules, then restore the real one.
        _sc_config = types.ModuleType("sc_config")
        _sc_config.MODEL_TO_FULL = {v: k for k, v in OUTCOME_TO_SHEET.items()}
        _sc_config.MODEL_TO_SHEET = dict(OUTCOME_TO_SHEET)
        _sc_config.SHEET_ORDER = ["cp", "inc", "ed", "ius", "le"]

        _orig_config = sys.modules.get("config")
        sys.modules["config"] = _sc_config

        from sentence_classification.preprocessing import identify_doctor_speaker, filter_doctor_rows
        from sentence_classification.segmentation import segment_sentences
        from sentence_classification.classification import classify_all_models
        from sentence_classification.selection import select_top_sentences_all_outcomes
        from sentence_classification.context import add_context_all_outcomes

        if _orig_config is not None:
            sys.modules["config"] = _orig_config
        else:
            sys.modules.pop("config", None)

        # Step 1: Read
        df_raw, patient_id = _read_transcript(tmp_path, filename)

        # Step 2: Filter doctor
        doctor = identify_doctor_speaker(df_raw, "speaker", "text")
        df_filtered = filter_doctor_rows(df_raw, "speaker", "text", doctor=doctor)

        # Step 3: Segment (R stringi)
        df_sentences = segment_sentences(df_filtered, text_col="text")

        # Step 4: NLP classify
        nlp_url = get_settings().nlp_api_url
        outcomes = list(OUTCOME_TO_SHEET.values())
        df_predicted = await asyncio.to_thread(
            classify_all_models, df_sentences,
            outcomes=outcomes, base_url=nlp_url, text_col="text",
        )

        # Step 5: Select top-N
        top_by_model = select_top_sentences_all_outcomes(
            df_predicted, outcomes=outcomes, k=top_n if top_n > 0 else 10,
        )

        # Step 6: Context
        final_results = add_context_all_outcomes(
            df_sentences, top_by_model, window=context_window,
        )

        # Step 7: Export xlsx bytes
        xlsx_bytes = _export_to_xlsx_bytes(final_results)

        # Build response
        response_models = {}
        for outcome, df in final_results.items():
            sheet = OUTCOME_TO_SHEET.get(outcome, outcome)
            response_models[sheet] = [
                {
                    "index": int(row["index"]),
                    "i": int(row["i"]),
                    "i2": int(row["i2"]),
                    "speaker": row["speaker"],
                    "text": row["text"],
                    "pred_1": round(float(row[".pred_1"]), 6),
                    "context": row.get("context", ""),
                }
                for _, row in df.iterrows()
            ]

        # Determine speakers (same convention as pipeline_runner.run_one)
        doctor_speaker = df_filtered["speaker"].iloc[0] if len(df_filtered) > 0 else "Unknown"
        patient_speaker = f"Patient_{Path(filename).stem}"

        return {
            "patient_id": patient_id,
            "total_sentences": len(df_sentences),
            "models": response_models,
            "xlsx_bytes": xlsx_bytes,
            "final_results": final_results,
            # Intermediate dataframes — needed by persistence.save_all to
            # populate nlp_all_predictions + nlp_pipeline_intermediate.
            "df_raw": df_raw,
            "df_filtered": df_filtered,
            "df_sentences": df_sentences,
            "df_predicted": df_predicted,
            "top_by_model": top_by_model,
            "doctor_speaker": doctor_speaker,
            "patient_speaker": patient_speaker,
        }
    finally:
        os.unlink(tmp_path)

# ──────────────────────────────────────────────────────────────────────────────
# Router
# ──────────────────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/transcript", tags=["Transcript Analysis"])


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze(
    file: UploadFile = File(..., description="xlsx file with [speaker, text] columns"),
    top_n: int = Form(default=0, ge=0, le=1000, description="Number of top sentences per model (0 = all)"),
    context_window: int = Form(default=3, ge=0, le=10, description="Number of surrounding sentences for context"),
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a transcript xlsx and run the full analysis pipeline.

    Steps 1,2,3 (preprocessing) and 5,6,7 (postprocessing) run in Backend.
    Step 4 (NLP prediction) calls the r01-nlp-classifiers Docker container.

    Returns JSON with per-model top sentences, prediction scores, and context.
    The xlsx file can be downloaded via /api/transcript/download.
    """
    # Validate file type
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an .xlsx file",
        )

    try:
        file_bytes = await file.read()
    except Exception as exc:
        logger.error("Failed to read uploaded file: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read uploaded file.",
        )

    try:
        result = await analyze_transcript(
            file_bytes=file_bytes,
            filename=file.filename,
            top_n=top_n,
            context_window=context_window,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("Transcript analysis failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Analysis failed. Please check the uploaded file and try again.",
        )

    # Save xlsx to disk (shared across gunicorn workers)
    _save_xlsx(result["patient_id"], result["xlsx_bytes"])

    # Save to database via the unified persistence layer — populates
    # transcript_analysis_log + sentence_prediction + nlp_all_predictions +
    # nlp_pipeline_intermediate + patient_summary(_domain). Then run the AI
    # pipeline (GPT-4o scoring + reformat) which fills llm_pipeline_intermediate
    # + llm_domain_scoring_and_summary and updates ai_overall_score / processed.
    await _persist_and_run_ai(
        result=result,
        filename=file.filename,
        top_n=top_n,
        context_window=context_window,
    )

    return {
        "patient_id": result["patient_id"],
        "total_sentences": result["total_sentences"],
        "models": result["models"],
        "output_file": f"{result['patient_id']}_predictions.xlsx",
    }


@router.get("/download/{patient_id}")
async def download(
    patient_id: str,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download the generated xlsx result file for a patient.

    Tries the file system first; falls back to the database if the file is
    missing (e.g. after a container restart that wiped /app/uploads).

    The fallback also RE-SAVES to disk so future downloads of the same
    patient skip the DB lookup — turns a one-time slow path into a
    repeated fast path.
    """
    await check_patient_access(patient_id, user, db)
    filepath = _xlsx_path(patient_id)
    filename = f"{patient_id}_predictions.xlsx"
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    # Primary: serve from disk (cheap, just a sendfile syscall).
    if filepath.exists():
        return FileResponse(path=str(filepath), media_type=media_type, filename=filename)

    # Fallback: serve from DB. Pull the LATEST row that has xlsx_data
    # (xlsx_data may be NULL on legacy rows from before the binary
    # storage migration).
    try:
        stmt = (
            select(TranscriptAnalysisLog.xlsx_data)
            .where(TranscriptAnalysisLog.patient_id == patient_id)
            .where(TranscriptAnalysisLog.xlsx_data.isnot(None))
            .order_by(TranscriptAnalysisLog.analyzed_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        xlsx_data = result.scalar_one_or_none()
    except Exception:
        logger.warning("DB fallback failed for patient %s", patient_id, exc_info=True)
        xlsx_data = None

    if xlsx_data is not None:
        logger.info("Serving %s from DB fallback", filename)
        # Re-save to disk so future requests skip the DB lookup
        try:
            _save_xlsx(patient_id, xlsx_data)
            logger.info("Re-saved %s to disk from DB fallback", patient_id)
        except Exception:
            logger.debug("Failed to re-save %s to disk (non-fatal)", patient_id)
        return Response(
            content=xlsx_data,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No results found for the requested patient. Run /analyze first.",
    )


@router.post("/analyze-batch")
async def analyze_batch(
    files: List[UploadFile] = File(..., description="One or more xlsx files with [speaker, text] columns"),
    top_n: int = Form(default=0, ge=0, le=1000, description="Number of top sentences per model (0 = all)"),
    context_window: int = Form(default=3, ge=0, le=10, description="Number of surrounding sentences for context"),
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload multiple transcript xlsx files and run the analysis pipeline on each.

    Each file is processed independently. If one file fails, the rest continue.
    Results are saved to disk and DB, and can be downloaded individually or via /download-batch.
    """
    results: List[dict] = []
    successful = 0
    failed = 0

    for file in files:
        # Validate file type
        if not file.filename or not file.filename.endswith(".xlsx"):
            failed += 1
            results.append({
                "filename": file.filename or "(unknown)",
                "status": "error",
                "detail": "File must be an .xlsx file",
            })
            continue

        try:
            file_bytes = await file.read()
        except Exception as exc:
            logger.error("Failed to read uploaded file %s: %s", file.filename, exc)
            failed += 1
            results.append({
                "filename": file.filename,
                "status": "error",
                "detail": "Failed to read uploaded file.",
            })
            continue

        try:
            result = await analyze_transcript(
                file_bytes=file_bytes,
                filename=file.filename,
                top_n=top_n,
                context_window=context_window,
            )
        except ValueError as exc:
            failed += 1
            results.append({
                "filename": file.filename,
                "status": "error",
                "detail": str(exc),
            })
            continue
        except Exception as exc:
            logger.error("Batch analysis failed for %s: %s", file.filename, exc, exc_info=True)
            failed += 1
            results.append({
                "filename": file.filename,
                "status": "error",
                "detail": "Analysis failed. Please check the file and try again.",
            })
            continue

        # Save xlsx to disk
        _save_xlsx(result["patient_id"], result["xlsx_bytes"])

        # Save full pipeline data to DB + run AI pipeline (per-file isolation).
        await _persist_and_run_ai(
            result=result,
            filename=file.filename,
            top_n=top_n,
            context_window=context_window,
        )

        successful += 1
        results.append({
            "filename": file.filename,
            "status": "success",
            "patient_id": result["patient_id"],
            "total_sentences": result["total_sentences"],
            "output_file": f"{result['patient_id']}_predictions.xlsx",
        })

    # If every file failed, return 500
    if successful == 0 and failed > 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="All files failed processing",
        )

    return {
        "total_files": len(files),
        "successful": successful,
        "failed": failed,
        "results": results,
    }


@router.get("/download-batch")
async def download_batch(
    patient_ids: str,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download results for multiple patients as a single zip file.

    Tries the file system first for each patient; falls back to the database
    if the file is missing (e.g. after a container restart).

    Args:
        patient_ids: Comma-separated list of patient IDs (e.g. "sid-01,sid-02").
    """
    ids = [pid.strip() for pid in patient_ids.split(",") if pid.strip()]
    if not ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="patient_ids parameter is required (comma-separated list)",
        )

    # Check access for each patient
    for pid in ids:
        await check_patient_access(pid, user, db)

    # Collect existing result files (disk first, then DB fallback)
    found: List[tuple] = []  # (patient_id, xlsx_bytes)
    missing: List[str] = []
    db_needed: List[str] = []  # patients not found on disk

    for pid in ids:
        filepath = _xlsx_path(pid)
        if filepath.exists():
            found.append((pid, filepath.read_bytes()))
        else:
            db_needed.append(pid)

    # Single DB query for all missing patients (instead of N individual queries).
    # DISTINCT ON (postgres-specific) returns one row per patient_id —
    # the order_by determines WHICH row we get (latest analyzed_at).
    if db_needed:
        try:
            # Use DISTINCT ON to get the latest row per patient_id
            stmt = (
                select(
                    TranscriptAnalysisLog.patient_id,
                    TranscriptAnalysisLog.xlsx_data,
                )
                .where(TranscriptAnalysisLog.patient_id.in_(db_needed))
                .where(TranscriptAnalysisLog.xlsx_data.isnot(None))
                .order_by(TranscriptAnalysisLog.patient_id, TranscriptAnalysisLog.analyzed_at.desc())
                .distinct(TranscriptAnalysisLog.patient_id)
            )
            result = await db.execute(stmt)
            db_rows = {row.patient_id: row.xlsx_data for row in result.all()}
        except Exception:
            logger.warning("DB batch fallback failed", exc_info=True)
            db_rows = {}

        for pid in db_needed:
            xlsx_data = db_rows.get(pid)
            if xlsx_data is not None:
                logger.info("Serving %s from DB fallback (batch)", pid)
                found.append((pid, xlsx_data))
                try:
                    _save_xlsx(pid, xlsx_data)
                except Exception:
                    logger.debug("Failed to re-save %s to disk (non-fatal)", pid)
            else:
                missing.append(pid)

    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No results found for any of the requested patients.",
        )

    # Build zip in memory
    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for pid, xlsx_bytes in found:
            arcname = f"{pid}_predictions.xlsx"
            zf.writestr(arcname, xlsx_bytes)

    zip_buffer.seek(0)

    headers = {
        "Content-Disposition": "attachment; filename=batch_results.zip",
    }

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers=headers,
    )


# ──────────────────────────────────────────────────────────────────────────────
# File-based xlsx storage (shared across gunicorn workers via disk)
# ──────────────────────────────────────────────────────────────────────────────
_UPLOAD_DIR = Path(get_settings().upload_dir)
_PATIENT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,254}$")


def _validate_patient_id(patient_id: str) -> str:
    """Validate patient_id to prevent path traversal attacks.

    Two-layer defence:
      1. Regex whitelist — only [a-zA-Z0-9_-], 1-255 chars, must start
         with alphanumeric. Rejects "..", "/", "\\", null bytes, etc.
      2. Resolved-path check — even if step 1 passed, ensure the
         resulting absolute path stays inside UPLOAD_DIR. Defends
         against weird unicode normalisation tricks the regex might
         miss.
    """
    if not _PATIENT_ID_PATTERN.match(patient_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid patient_id format",
        )
    resolved = (_UPLOAD_DIR / f"{patient_id}_predictions.xlsx").resolve()
    if not str(resolved).startswith(str(_UPLOAD_DIR.resolve())):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid patient_id",
        )
    return patient_id


def _xlsx_path(patient_id: str) -> Path:
    _validate_patient_id(patient_id)
    return _UPLOAD_DIR / f"{patient_id}_predictions.xlsx"


def _save_xlsx(patient_id: str, xlsx_bytes: bytes) -> None:
    _validate_patient_id(patient_id)
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (_UPLOAD_DIR / f"{patient_id}_predictions.xlsx").write_bytes(xlsx_bytes)


def _get_xlsx_bytes(patient_id: str) -> Optional[bytes]:
    _validate_patient_id(patient_id)
    path = _UPLOAD_DIR / f"{patient_id}_predictions.xlsx"
    return path.read_bytes() if path.exists() else None


# ──────────────────────────────────────────────────────────────────────────────
# DB storage + AI pipeline orchestration
# ──────────────────────────────────────────────────────────────────────────────

async def _persist_and_run_ai(
    *,
    result: Dict[str, Any],
    filename: str,
    top_n: int,
    context_window: int,
) -> None:
    """Save full pipeline output via persistence.save_all + run AI pipeline.

    Mirrors what `pipeline_runner.run_one` does for the CLI batch path. All
    failures are logged but never propagate — a DB or AI failure must not
    break the HTTP response.
    """
    patient_id = result["patient_id"]

    try:
        ok = await persistence.save_all(
            AsyncSessionLocal,
            filename=filename,
            patient_id=patient_id,
            doctor_speaker=result["doctor_speaker"],
            patient_speaker=result["patient_speaker"],
            total_sentences=result["total_sentences"],
            top_n=top_n,
            context_window=context_window,
            xlsx_bytes=result["xlsx_bytes"],
            final_results=result["final_results"],
            outcome_to_sheet=OUTCOME_TO_SHEET,
            domain_slot_map=_DOMAIN_SLOT_MAP,
            domain_short_map=_DOMAIN_SHORT_MAP,
            df_raw=result["df_raw"],
            df_filtered=result["df_filtered"],
            df_sentences=result["df_sentences"],
            df_predicted=result["df_predicted"],
            top_by_model=result["top_by_model"],
        )
    except Exception:
        logger.warning("persistence.save_all failed for %s (non-fatal)", patient_id, exc_info=True)
        return

    if not ok:
        logger.warning("persistence.save_all returned False for %s — skipping AI pipeline", patient_id)
        return

    try:
        analysis_id = await persistence.get_latest_analysis_id(AsyncSessionLocal, patient_id)
        if analysis_id is None:
            logger.warning("No analysis_id resolved for %s — skipping AI pipeline", patient_id)
            return
        await ai_pipeline_service.run_ai_scoring_and_summary(
            AsyncSessionLocal,
            analysis_id=analysis_id,
            patient_id=patient_id,
            source_filename=filename,
            final_results=result["final_results"],
            outcome_to_sheet=OUTCOME_TO_SHEET,
        )
    except Exception:
        logger.warning("AI pipeline failed for %s (non-fatal)", patient_id, exc_info=True)


# ──────────────────────────────────────────────────────────────────────────────
# History endpoint
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/history/{patient_id}")
async def history(
    patient_id: str,
    page: int = Query(default=1, ge=1, description="Page number"),
    size: int = Query(default=20, ge=1, le=100, description="Page size"),
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve analysis history for a patient from the database.

    Returns a paginated list of past analysis runs (newest first), including
    parameters used, timestamps, and source filenames.
    """
    _validate_patient_id(patient_id)
    await check_patient_access(patient_id, user, db)
    offset = (page - 1) * size

    # Count total rows
    count_stmt = (
        select(sa_func.count(TranscriptAnalysisLog.id))
        .where(TranscriptAnalysisLog.patient_id == patient_id)
    )
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    # Fetch page — explicitly select columns to avoid loading xlsx_data BYTEA
    stmt = (
        select(
            TranscriptAnalysisLog.id,
            TranscriptAnalysisLog.patient_id,
            TranscriptAnalysisLog.total_sentences,
            TranscriptAnalysisLog.top_n,
            TranscriptAnalysisLog.context_window,
            TranscriptAnalysisLog.source_filename,
            TranscriptAnalysisLog.analyzed_at,
            TranscriptAnalysisLog.xlsx_data.isnot(None).label("has_xlsx"),
        )
        .where(TranscriptAnalysisLog.patient_id == patient_id)
        .order_by(TranscriptAnalysisLog.analyzed_at.desc())
        .offset(offset)
        .limit(size)
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for row in rows:
        item = {
            "id": row.id,
            "patient_id": row.patient_id,
            "total_sentences": row.total_sentences,
            "top_n": row.top_n,
            "context_window": row.context_window,
            "source_filename": row.source_filename,
            "analyzed_at": row.analyzed_at.isoformat() if row.analyzed_at else None,
            "has_xlsx": row.has_xlsx,
        }
        items.append(item)

    return {
        "patient_id": patient_id,
        "total": total,
        "page": page,
        "size": size,
        "data": items,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Sentence-level predictions query endpoint
# ──────────────────────────────────────────────────────────────────────────────

_VALID_MODELS = {"cp", "inc", "ed", "ius", "le"}


@router.get("/predictions/{patient_id}")
async def get_predictions(
    patient_id: str,
    model: Optional[str] = Query(default=None, description="Filter by model (cp, inc, ed, ius, le)"),
    top_n: Optional[int] = Query(default=None, ge=1, le=10000, description="Return top N per model by pred_score"),
    analysis_id: Optional[int] = Query(default=None, ge=1, description="Specific analysis run ID (default: latest)"),
    min_score: Optional[float] = Query(default=None, ge=0.0, le=1.0, description="Minimum pred_score filter"),
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query sentence-level NLP predictions for a patient.

    By default returns all predictions from the most recent analysis run.
    Use query parameters to filter by model, score threshold, or specific run.
    """
    _validate_patient_id(patient_id)
    await check_patient_access(patient_id, user, db)
    if model and model not in _VALID_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid model '{model}'. Must be one of: {', '.join(sorted(_VALID_MODELS))}",
        )

    # Resolve analysis_id: use provided or find latest
    resolved_analysis_id = analysis_id
    if resolved_analysis_id is None:
        stmt = (
            select(TranscriptAnalysisLog.id)
            .where(TranscriptAnalysisLog.patient_id == patient_id)
            .order_by(TranscriptAnalysisLog.analyzed_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        resolved_analysis_id = result.scalar_one_or_none()
        if resolved_analysis_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No analysis found for the requested patient.",
            )

    # Build query
    stmt = (
        select(SentencePrediction)
        .where(SentencePrediction.analysis_id == resolved_analysis_id)
    )
    if model:
        stmt = stmt.where(SentencePrediction.model == model)
    if min_score is not None:
        stmt = stmt.where(SentencePrediction.pred_score >= min_score)
    stmt = stmt.order_by(SentencePrediction.model, SentencePrediction.pred_score.desc())

    result = await db.execute(stmt)
    rows = result.scalars().all()

    # Fallback: if no sentence_prediction rows exist for this analysis run
    # (e.g. run was created before the sentence_prediction feature), rebuild
    # from the model_results JSON stored in transcript_analysis_log.
    if not rows:
        rows = await _backfill_predictions(db, resolved_analysis_id)
        # Re-query with filters after backfill
        if rows:
            stmt = (
                select(SentencePrediction)
                .where(SentencePrediction.analysis_id == resolved_analysis_id)
            )
            if model:
                stmt = stmt.where(SentencePrediction.model == model)
            if min_score is not None:
                stmt = stmt.where(SentencePrediction.pred_score >= min_score)
            stmt = stmt.order_by(SentencePrediction.model, SentencePrediction.pred_score.desc())
            result = await db.execute(stmt)
            rows = result.scalars().all()

    # Apply top_n per model at DB level using window function
    if top_n is not None and rows:
        from sqlalchemy import func as wfunc
        ranked = (
            select(
                SentencePrediction,
                wfunc.row_number().over(
                    partition_by=SentencePrediction.model,
                    order_by=SentencePrediction.pred_score.desc(),
                ).label("rn"),
            )
            .where(SentencePrediction.analysis_id == resolved_analysis_id)
        )
        if model:
            ranked = ranked.where(SentencePrediction.model == model)
        if min_score is not None:
            ranked = ranked.where(SentencePrediction.pred_score >= min_score)
        ranked_sub = ranked.subquery()

        topn_stmt = (
            select(SentencePrediction)
            .join(ranked_sub, SentencePrediction.id == ranked_sub.c.id)
            .where(ranked_sub.c.rn <= top_n)
            .order_by(SentencePrediction.model, SentencePrediction.pred_score.desc())
        )
        result = await db.execute(topn_stmt)
        rows = result.scalars().all()

    predictions = [
        {
            "model": row.model,
            "sentence_index": row.sentence_index,
            "utterance_index": row.utterance_index,
            "sentence_in_utterance": row.sentence_in_utterance,
            "speaker": row.speaker,
            "sentence_text": row.sentence_text,
            "pred_score": row.pred_score,
            "context": row.context,
        }
        for row in rows
    ]

    return {
        "patient_id": patient_id,
        "analysis_id": resolved_analysis_id,
        "total": len(predictions),
        "predictions": predictions,
    }


async def _backfill_predictions(db: AsyncSession, analysis_id: int) -> list:
    """Rebuild sentence_prediction rows from model_results JSON for a legacy analysis run.

    Older analyses (pre-sentence_prediction table) only have the
    aggregate JSON in `transcript_analysis_log.model_results`; this
    helper unpacks that JSON into proper sentence_prediction rows on
    first read so /predictions can serve them. After backfill the rows
    persist, so subsequent calls hit the cheap query path.

    Returns the inserted SentencePrediction objects, or empty list on failure.
    """
    try:
        stmt = select(TranscriptAnalysisLog).where(TranscriptAnalysisLog.id == analysis_id)
        result = await db.execute(stmt)
        record = result.scalar_one_or_none()
        if not record or not record.model_results:
            return []

        models = record.model_results  # JSONB column — already a dict
        prediction_rows = []
        for model_key, sentences in models.items():
            for sent in sentences:
                prediction_rows.append(SentencePrediction(
                    analysis_id=record.id,
                    patient_id=record.patient_id,
                    model=model_key,
                    sentence_index=sent["index"],
                    utterance_index=sent["i"],
                    sentence_in_utterance=sent["i2"],
                    speaker=sent["speaker"],
                    sentence_text=sent["text"],
                    pred_score=sent["pred_1"],
                    context=sent.get("context"),
                ))
        if prediction_rows:
            db.add_all(prediction_rows)
            await db.commit()
            logger.info("Backfilled %d predictions for analysis_id %d", len(prediction_rows), analysis_id)
        return prediction_rows
    except Exception:
        await db.rollback()
        logger.warning("Backfill failed for analysis_id %d", analysis_id, exc_info=True)
        return []
