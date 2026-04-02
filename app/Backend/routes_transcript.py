"""
Transcript Analysis REST API — FastAPI router for the ML scoring pipeline.

This module exposes HTTP endpoints that allow external clients (e.g. the React
dashboard, R scripts, or cURL) to upload consultation transcript xlsx files,
run the full 7-step analysis pipeline, and retrieve the scored results.

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

Authentication
--------------
All endpoints require an ``X-API-Key`` header matching the ``API_KEY``
environment variable (server refuses to start if not set).

Storage
-------
* **File system**: xlsx files are written to ``UPLOAD_DIR/{patient_id}_predictions.xlsx``
  (shared across gunicorn workers).
* **Database**: each analysis run is logged to ``transcript_analysis_log`` with
  metadata, the full model results as JSON, and the xlsx binary. DB storage is
  wrapped in try/except so a DB failure never blocks the primary response.
"""

import json
import logging
import os
import re
import zipfile
from io import BytesIO
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.access_control import check_patient_access
from auth.base import AuthUser
from db import get_db, AsyncSessionLocal
from models import SentencePrediction, TranscriptAnalysisLog
from transcript_service import analyze_transcript

load_dotenv()
logger = logging.getLogger(__name__)

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

    # Save to database (non-blocking — DB failure does not affect the response)
    await _save_to_db(
        db,
        patient_id=result["patient_id"],
        total_sentences=result["total_sentences"],
        top_n=top_n,
        context_window=context_window,
        models=result["models"],
        xlsx_bytes=result["xlsx_bytes"],
        source_filename=file.filename,
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
    missing (e.g. after a container restart).
    """
    await check_patient_access(patient_id, user, db)
    filepath = _xlsx_path(patient_id)
    filename = f"{patient_id}_predictions.xlsx"
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    # Primary: serve from disk
    if filepath.exists():
        return FileResponse(path=str(filepath), media_type=media_type, filename=filename)

    # Fallback: serve from DB
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

        # Save to database — use independent session per file to isolate transactions.
        # A rollback in one file must not affect the session state of subsequent files.
        async with AsyncSessionLocal() as file_db:
            await _save_to_db(
                file_db,
                patient_id=result["patient_id"],
                total_sentences=result["total_sentences"],
                top_n=top_n,
                context_window=context_window,
                models=result["models"],
                xlsx_bytes=result["xlsx_bytes"],
                source_filename=file.filename,
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

    for pid in ids:
        filepath = _xlsx_path(pid)
        if filepath.exists():
            found.append((pid, filepath.read_bytes()))
        else:
            # DB fallback: same logic as single /download endpoint
            try:
                stmt = (
                    select(TranscriptAnalysisLog.xlsx_data)
                    .where(TranscriptAnalysisLog.patient_id == pid)
                    .where(TranscriptAnalysisLog.xlsx_data.isnot(None))
                    .order_by(TranscriptAnalysisLog.analyzed_at.desc())
                    .limit(1)
                )
                result = await db.execute(stmt)
                xlsx_data = result.scalar_one_or_none()
            except Exception:
                logger.warning("DB fallback failed for patient %s in batch download", pid, exc_info=True)
                xlsx_data = None

            if xlsx_data is not None:
                logger.info("Serving %s from DB fallback (batch)", pid)
                found.append((pid, xlsx_data))
                # Re-save to disk so future requests skip the DB lookup
                try:
                    _save_xlsx(pid, xlsx_data)
                    logger.info("Re-saved %s to disk from DB fallback", pid)
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
_UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/app/uploads"))
_PATIENT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,254}$")


def _validate_patient_id(patient_id: str) -> str:
    """Validate patient_id to prevent path traversal attacks."""
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
# DB storage helper
# ──────────────────────────────────────────────────────────────────────────────

async def _save_to_db(
    db: AsyncSession,
    *,
    patient_id: str,
    total_sentences: int,
    top_n: int,
    context_window: int,
    models: dict,
    xlsx_bytes: bytes,
    source_filename: Optional[str],
) -> None:
    """Persist analysis results to transcript_analysis_log.

    Wrapped in try/except so a DB failure never blocks the primary response.
    Each call inserts a new row (preserving analysis history for the same patient).
    """
    try:
        record = TranscriptAnalysisLog(
            patient_id=patient_id,
            total_sentences=total_sentences,
            top_n=top_n,
            context_window=context_window,
            model_results=models,  # JSONB column — dict stored directly
            xlsx_data=xlsx_bytes,
            source_filename=source_filename,
        )
        db.add(record)
        await db.flush()  # populate record.id before inserting child rows

        # Bulk-insert sentence-level predictions into sentence_prediction table.
        # Each entry in models dict maps: model_key (cp/inc/ed/ius/le) → list of sentence dicts.
        # Sentence dict keys map to DB columns as follows:
        #   dict key    →  DB column               (xlsx column)
        #   "index"     →  sentence_index           (index)
        #   "i"         →  utterance_index           (i)
        #   "i2"        →  sentence_in_utterance     (i2)
        #   "speaker"   →  speaker                   (speaker)
        #   "text"      →  sentence_text             (text)
        #   "pred_1"    →  pred_score                (.pred_1)
        #   "context"   →  context                   (context)
        prediction_rows = []
        for model_key, sentences in models.items():
            for sent in sentences:
                prediction_rows.append(SentencePrediction(
                    analysis_id=record.id,
                    patient_id=patient_id,
                    model=model_key,              # xlsx sheet name
                    sentence_index=sent["index"],  # xlsx 'index'
                    utterance_index=sent["i"],     # xlsx 'i'
                    sentence_in_utterance=sent["i2"],  # xlsx 'i2'
                    speaker=sent["speaker"],       # xlsx 'speaker'
                    sentence_text=sent["text"],    # xlsx 'text'
                    pred_score=sent["pred_1"],     # xlsx '.pred_1'
                    context=sent.get("context"),   # xlsx 'context'
                ))
        if prediction_rows:
            db.add_all(prediction_rows)

        await db.commit()
        logger.info("Saved analysis + %d predictions to DB for patient %s", len(prediction_rows), patient_id)
    except Exception:
        await db.rollback()
        logger.warning("DB save failed for patient %s (non-fatal)", patient_id, exc_info=True)


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
        "items": items,
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

    # Apply top_n per model if requested
    if top_n is not None:
        from collections import defaultdict
        by_model: dict[str, list] = defaultdict(list)
        for row in rows:
            by_model[row.model].append(row)
        rows = []
        for model_rows in by_model.values():
            rows.extend(model_rows[:top_n])

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
