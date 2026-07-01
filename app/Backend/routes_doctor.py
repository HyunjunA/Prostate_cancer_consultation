"""Doctor-side API routes — endpoints used by the doctor dashboard.

This is the largest router by endpoint count (~20+) because the
doctor side has many different views: sentence inspection, rewrite
audit trails, multiple score aggregations, class distributions,
on-the-fly NLP scoring, AI-powered rewriting, and improvement tips.

Authentication: every endpoint requires a valid auth header (X-API-Key
by default; see auth/registry.py for AUTH_MODE switching). All endpoints
are also subject to the per-user patient access rules in
auth/access_control.py.

Endpoint groups:
    /sentences/*                : per-file/speaker sentence + score view
    /rewrites, /rewrites/*      : revision history (DoctorRewriteLog table)
    /scores/*                   : averages, trajectories, per-patient summaries
    /class-distribution*        : domain (cancer-prognosis / life-exp / ED /
                                  incontinence / irritative-urinary) breakdown
                                  for the dashboard charts
    /score-sentence             : on-the-fly NLP scoring of a single sentence
    /ai-rewrite                 : LLM-powered sentence revision suggestions
    /improvement-suggestions*   : pre-canned guidance per domain class

Data sources:
    DoctorRewriteLog       : audit log of every doctor sentence rewrite
                             (composite PK includes `time` so all
                             revisions are kept).
    SentencePrediction     : top-N NLP-scored sentences per analysis.
    TranscriptAnalysisLog  : analysis-run metadata + AI overall score.
    PatientSummaryDomain   : patient-entered scores (separate from
                             AI scores — see models.py docstring).

Related modules:
    models.py        : DoctorRewriteLog, PatientSummary, PatientSummaryDomain
    routes_patient.py: patient-side equivalent
    persistence.py   : shared DB query helpers
    /score-sentence  : calls Azure OpenAI directly (via the AI repo's
                       ai_pipeline.llm); does not touch the NLP container.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.access_control import check_patient_access
from auth.base import AuthUser
from db import get_db
from models import DoctorRewriteLog, SentencePrediction, TranscriptAnalysisLog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/doctor", tags=["Doctor Interface"])


class DoctorRewriteUpdateFull(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file: str
    i: int
    i2: int
    speaker: str
    time: Optional[datetime] = None
    original_sentence: str
    revised_sentence: str
    score: Optional[float] = None
    class_: str


@router.get("/sentences/{file}/{speaker}")
async def get_doctor_sentences(
    file: str,
    speaker: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get doctor sentence view data for specific file and speaker where class != -1"""
    await check_patient_access(file, user, db)

    # Find latest analysis for this file
    analysis_stmt = select(TranscriptAnalysisLog.id).where(
        TranscriptAnalysisLog.source_filename == file
    ).order_by(TranscriptAnalysisLog.analyzed_at.desc()).limit(1)
    analysis_id = (await db.execute(analysis_stmt)).scalar_one_or_none()

    if not analysis_id:
        raise HTTPException(
            status_code=404,
            detail="No data found for the specified file and speaker."
        )

    # One row per (sentence x model): a sentence selected by several models must
    # surface in EVERY domain that selected it, tagged with that model. Do NOT
    # merge the per-model rows into one with a single class — a multi-domain
    # sentence would then land in only one domain's bucket (which one was
    # arbitrary: array_agg has no defined order), so the other domain's grid row
    # loses it and falls back to the wrong sentence. Emitting the model directly
    # keeps each domain independent and deterministic.
    distinct_stmt = (
        select(
            SentencePrediction.utterance_index.label('i'),
            SentencePrediction.sentence_in_utterance.label('i2'),
            SentencePrediction.speaker,
            SentencePrediction.sentence_text.label('sentence'),
            SentencePrediction.context,
            SentencePrediction.model.label('model'),
        )
        .where(
            SentencePrediction.analysis_id == analysis_id,
            SentencePrediction.speaker == speaker,
        )
        .distinct()
        .order_by(
            SentencePrediction.utterance_index,
            SentencePrediction.sentence_in_utterance,
            SentencePrediction.model,
        )
    )
    results = (await db.execute(distinct_stmt)).all()

    logger.debug("get_doctor_sentences: found %d unique rows for file=%s, speaker=%s", len(results), file, speaker)

    if not results:
        raise HTTPException(
            status_code=404,
            detail="No data found for the specified file and speaker."
        )

    # Build ai_score lookup from llm_domain_scoring_and_summary
    from models import LLMDomainScoringAndSummary
    ai_score_map = {}
    ai_stmt = select(
        LLMDomainScoringAndSummary.source_sentence,
        LLMDomainScoringAndSummary.ai_score,
    ).where(LLMDomainScoringAndSummary.analysis_id == analysis_id)
    for row in (await db.execute(ai_stmt)).all():
        if row.source_sentence:
            ai_score_map[row.source_sentence] = row.ai_score

    return {
        "file": file,
        "speaker": speaker,
        "total": len(results),
        "data": [
            {
                "i": r.i,
                "i2": r.i2,
                "sentence": r.sentence,
                "context": r.context,
                "score": ai_score_map.get(r.sentence),
                "class": r.model,
                "time": None
            }
            for r in results
        ]
    }

@router.get("/rewrites")
async def get_doctor_rewrites(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get doctor rewrite history with optional filters"""
    logger.debug("get_doctor_rewrites: file=%s, skip=%d, limit=%d", file, skip, limit)

    stmt = select(DoctorRewriteLog)

    if file:
        stmt = stmt.where(DoctorRewriteLog.file == file)
    if speaker:
        stmt = stmt.where(DoctorRewriteLog.speaker == speaker)

    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    # Get paginated results
    stmt = stmt.order_by(DoctorRewriteLog.time.desc()).offset(skip).limit(limit)
    results = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": [
            {
                "file": r.file,
                "i": r.i,
                "i2": r.i2,
                "speaker": r.speaker,
                "time": r.time.isoformat() if r.time else None,
                "original_sentence": r.original_sentence,
                "revised_sentence": r.revised_sentence,
                "score": r.score,
                "class": r.class_
            }
            for r in results
        ]
    }


@router.put("/rewrites")
async def update_doctor_rewrite(
    update_data: DoctorRewriteUpdateFull,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Insert new doctor rewrite log record with full data"""
    logger.debug("update_doctor_rewrite: file=%s, i=%d, i2=%d, class=%s", update_data.file, update_data.i, update_data.i2, update_data.class_)

    # Check if the source filename has been analyzed. transcript_analysis_log
    # stores the long source_filename that the frontend uses (e.g.
    # "Input_Keystrokes REC 001 (SID 10).xlsx"); sentence_prediction.patient_id
    # uses a short SID-form which does NOT match the file argument here.
    file_exists_stmt = select(func.count()).select_from(TranscriptAnalysisLog).where(
        TranscriptAnalysisLog.source_filename == update_data.file
    )
    file_exists = (await db.execute(file_exists_stmt)).scalar_one() > 0

    if not file_exists:
        raise HTTPException(
            status_code=404,
            detail="Specified file does not exist."
        )

    # Create new record in DoctorRewriteLog
    new_record = DoctorRewriteLog(
        file=update_data.file,
        i=update_data.i,
        i2=update_data.i2,
        speaker=update_data.speaker,
        time=update_data.time,
        original_sentence=update_data.original_sentence,
        revised_sentence=update_data.revised_sentence,
        score=update_data.score,
        class_=update_data.class_
    )

    db.add(new_record)
    await db.commit()
    await db.refresh(new_record)

    return {
        "file": new_record.file,
        "i": new_record.i,
        "i2": new_record.i2,
        "speaker": new_record.speaker,
        "time": new_record.time.isoformat() if new_record.time else None,
        "original_sentence": new_record.original_sentence,
        "revised_sentence": new_record.revised_sentence,
        "score": new_record.score,
        "class": new_record.class_
    }

@router.get("/rewrites/{file}/{i}/{i2}/history")
async def get_doctor_rewrite_history(
    file: str,
    i: int,
    i2: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get revision history for a specific sentence (file, i, i2)

    Returns all revisions ordered by time (oldest to newest)
    Includes original_score from llm_domain_scoring_and_summary
    """
    logger.debug("get_doctor_rewrite_history: file=%s, i=%d, i2=%d", file, i, i2)

    # Get all rewrites for this sentence, ordered by time ascending
    stmt = select(DoctorRewriteLog).where(
        DoctorRewriteLog.file == file,
        DoctorRewriteLog.i == i,
        DoctorRewriteLog.i2 == i2
    ).order_by(DoctorRewriteLog.time.asc())

    results = (await db.execute(stmt)).scalars().all()

    if not results:
        raise HTTPException(
            status_code=404,
            detail=f"No rewrite history found for file='{file}', i={i}, i2={i2}"
        )

    # Get original sentence info from first record
    original_sentence = results[0].original_sentence
    speaker = results[0].speaker
    class_ = results[0].class_

    # Get original_score from llm_domain_scoring_and_summary via sentence_prediction
    original_score = None
    try:
        from models import LLMDomainScoringAndSummary
        # Find the sentence text from sentence_prediction
        sp_stmt = select(SentencePrediction.sentence_text).where(
            SentencePrediction.patient_id == file,
            SentencePrediction.utterance_index == i,
            SentencePrediction.sentence_in_utterance == i2,
        ).limit(1)
        sentence_text = (await db.execute(sp_stmt)).scalar_one_or_none()

        if sentence_text:
            # Find analysis_id for this file
            analysis_stmt = select(TranscriptAnalysisLog.id).where(
                TranscriptAnalysisLog.source_filename == file
            ).order_by(TranscriptAnalysisLog.analyzed_at.desc()).limit(1)
            analysis_id = (await db.execute(analysis_stmt)).scalar_one_or_none()

            if analysis_id:
                ai_stmt = select(LLMDomainScoringAndSummary.ai_score).where(
                    LLMDomainScoringAndSummary.analysis_id == analysis_id,
                    LLMDomainScoringAndSummary.source_sentence == sentence_text,
                ).limit(1)
                original_score = (await db.execute(ai_stmt)).scalar_one_or_none()
    except Exception as e:
        logger.warning("Error fetching original score: %s", e)

    print(f"   Found {len(results)} revisions")
    print("=" * 80)

    return {
        "file": file,
        "i": i,
        "i2": i2,
        "speaker": speaker,
        "class": class_,
        "original_sentence": original_sentence,
        "original_score": original_score,
        "total_revisions": len(results),
        "history": [
            {
                "revision_number": idx + 1,
                "time": r.time.isoformat() if r.time else None,
                "revised_sentence": r.revised_sentence,
                "score": r.score,
                "class": r.class_
            }
            for idx, r in enumerate(results)
        ]
    }


@router.get("/rewrites/{file}/{i}/{i2}/{class_}")
async def get_doctor_rewrite_by_key(
    file: str,
    i: int,
    i2: int,
    class_: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get specific doctor rewrite record by composite key (file, i, i2, class)"""

    stmt = select(DoctorRewriteLog).where(
        (DoctorRewriteLog.file == file) &
        (DoctorRewriteLog.i == i) &
        (DoctorRewriteLog.i2 == i2) &
        (DoctorRewriteLog.class_ == class_)
    )
    result = (await db.execute(stmt)).scalars().first()

    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"Record not found for file='{file}', i={i}, i2={i2}, class='{class_}'"
        )

    return {
        "file": result.file,
        "i": result.i,
        "i2": result.i2,
        "speaker": result.speaker,
        "time": result.time.isoformat() if result.time else None,
        "original_sentence": result.original_sentence,
        "revised_sentence": result.revised_sentence,
        "score": result.score,
        "class": result.class_
    }

@router.get("/rewrites/stats")
async def get_doctor_rewrite_stats(
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get rewrite usage statistics per speaker/file for analytics.

    Returns total rewrite attempts, unique sentences rewritten, and per-file breakdown.
    Used to track physician engagement with the rewrite learning tool.
    """
    base_filter = []
    if speaker:
        base_filter.append(DoctorRewriteLog.speaker == speaker)

    # Total rewrite count
    total_stmt = select(func.count()).select_from(DoctorRewriteLog)
    for f in base_filter:
        total_stmt = total_stmt.where(f)
    total_rewrites = (await db.execute(total_stmt)).scalar() or 0

    # Unique sentences rewritten
    unique_stmt = select(
        func.count(func.distinct(
            func.concat(DoctorRewriteLog.file, ':', DoctorRewriteLog.i, ':', DoctorRewriteLog.i2)
        ))
    ).select_from(DoctorRewriteLog)
    for f in base_filter:
        unique_stmt = unique_stmt.where(f)
    unique_sentences = (await db.execute(unique_stmt)).scalar() or 0

    # Per-file breakdown
    file_stmt = select(
        DoctorRewriteLog.file,
        func.count().label('rewrite_count'),
        func.count(func.distinct(
            func.concat(DoctorRewriteLog.i, ':', DoctorRewriteLog.i2)
        )).label('unique_sentences'),
        func.min(DoctorRewriteLog.time).label('first_rewrite'),
        func.max(DoctorRewriteLog.time).label('last_rewrite'),
    ).group_by(DoctorRewriteLog.file)
    for f in base_filter:
        file_stmt = file_stmt.where(f)
    file_stmt = file_stmt.order_by(func.count().desc())

    file_results = (await db.execute(file_stmt)).all()

    return {
        "total_rewrites": total_rewrites,
        "unique_sentences_rewritten": unique_sentences,
        "per_file": [
            {
                "file": r.file,
                "rewrite_count": r.rewrite_count,
                "unique_sentences": r.unique_sentences,
                "first_rewrite": r.first_rewrite.isoformat() if r.first_rewrite else None,
                "last_rewrite": r.last_rewrite.isoformat() if r.last_rewrite else None,
            }
            for r in file_results
        ],
    }


@router.get("/files")
async def get_doctor_files(
    limit: int = Query(default=500, ge=1, le=5000, description="Max files to return"),
    doctor_id: Optional[str] = Query(default=None, description="Scope to one doctor (NULL rows excluded when set)"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get list of unique files with their doctor speaker label.

    Returns `file` as `source_filename` to align with /sentences/{file}/{speaker},
    /scores/average, /scores/summary/{file}, /scores/trajectory, and the patient
    view convention (frontend ?fileid=... also uses source_filename).
    """
    stmt = (
        select(
            TranscriptAnalysisLog.source_filename.label("file"),
            SentencePrediction.speaker,
            func.count(func.distinct(
                func.concat(SentencePrediction.utterance_index, ':', SentencePrediction.sentence_in_utterance)
            )).label("sentence_count"),
        )
        .join(TranscriptAnalysisLog, SentencePrediction.analysis_id == TranscriptAnalysisLog.id)
        .group_by(TranscriptAnalysisLog.source_filename, SentencePrediction.speaker)
        .order_by(TranscriptAnalysisLog.source_filename)
        .limit(limit)
    )
    if doctor_id:
        stmt = stmt.where(TranscriptAnalysisLog.doctor_id == doctor_id)
    rows = (await db.execute(stmt)).all()

    # Per-file consult date. NOTE: there is no real visit date in the schema yet;
    # this is the AI pipeline's processing timestamp (earliest created_at of the
    # LLM scoring rows) — the SAME source the /scores/trajectory X-axis uses, so
    # the table date and the graph stay aligned. Swap this to the de-identified
    # (±7-day shifted) visit date once the de-id pipeline provides it.
    from models import LLMDomainScoringAndSummary

    date_stmt = select(
        LLMDomainScoringAndSummary.source_filename.label("file"),
        func.min(LLMDomainScoringAndSummary.created_at).label("consult_date"),
    ).group_by(LLMDomainScoringAndSummary.source_filename)
    date_rows = (await db.execute(date_stmt)).all()
    date_map = {r.file: r.consult_date for r in date_rows}

    # Build file list — pick the speaker with most sentences per file
    file_map: dict = {}
    for row in rows:
        if row.file is None:
            continue
        if row.file not in file_map or row.sentence_count > file_map[row.file]["count"]:
            file_map[row.file] = {"speaker": row.speaker, "count": row.sentence_count}

    # Return both formats: "files" (legacy list) + "file_details" (with speaker)
    files = list(file_map.keys())
    file_details = [
        {
            "file": f,
            "speaker": info["speaker"],
            "sentence_count": info["count"],
            # Processing timestamp used as a stand-in visit date (see note above).
            "consult_date": (
                date_map[f].isoformat() if date_map.get(f) else None
            ),
        }
        for f, info in file_map.items()
    ]

    return {"files": files, "file_details": file_details}




@router.get("/list")
async def get_doctor_list(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    """Distinct doctor ids (with patient counts) for the doctor-selection screen.

    Only doctors that actually have data are returned (doctor_id NOT NULL), so
    the picker never shows an empty/legacy doctor.
    """
    stmt = (
        select(
            TranscriptAnalysisLog.doctor_id.label("doctor_id"),
            func.count(func.distinct(TranscriptAnalysisLog.source_filename)).label("patient_count"),
        )
        .where(TranscriptAnalysisLog.doctor_id.isnot(None))
        .group_by(TranscriptAnalysisLog.doctor_id)
        .order_by(TranscriptAnalysisLog.doctor_id)
    )
    rows = (await db.execute(stmt)).all()
    return {
        "doctors": [
            {"doctor_id": r.doctor_id, "patient_count": r.patient_count}
            for r in rows
        ]
    }


# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Score Average APIs (with Rewrite Log Priority)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/scores/average")
async def get_doctor_score_average(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    class_: Optional[str] = Query(None, alias="class"),
    doctor_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Per-(patient, category) summary score, plus a per-patient overall.

    Scoring rule:
      * For each (file, category) pair, the displayed score is the
        MAX(ai_score) across the evidence sentences within the latest
        analysis run for that file. The pipeline can store multiple
        evidence rows per category (one per top-N sentence that survived
        GPT-4o filtering); a category is treated as "covered" as soon as
        the doctor has at least one strong explanation, so taking MAX
        avoids letting weaker repeated evidence drag down the score.
      * The per-patient overall is AVG of the five per-category MAX
        values. Categories with no evidence in the latest analysis
        contribute 0 — every domain counts toward the denominator, so a
        domain the doctor never addressed is a real penalty rather than a
        neutral skip.

    Multiple historical analyses are deliberately ignored: re-running a
    transcript "replaces" prior assessments rather than averaging across
    them. Same convention as /scores/summary/{file}.

    Response shape is preserved for the dashboard hook
    (`ScoreAverageItem` in useDoctorData.tsx): one row per (file, class)
    with avg_score / min_score / max_score all carrying the MAX value,
    and count = number of evidence rows the MAX was chosen from.
    """
    from models import LLMDomainScoringAndSummary

    # ── Step 1: latest analysis_id per source_filename ──────────────
    # We aggregate this once and then join below; cheaper and clearer
    # than a correlated subquery per row.
    latest_analysis_q = select(
        TranscriptAnalysisLog.source_filename.label("file"),
        func.max(TranscriptAnalysisLog.id).label("aid"),
    )
    # When a doctor is selected, restrict which files aggregate at all.
    if doctor_id:
        latest_analysis_q = latest_analysis_q.where(
            TranscriptAnalysisLog.doctor_id == doctor_id
        )
    latest_analysis = latest_analysis_q.group_by(
        TranscriptAnalysisLog.source_filename
    ).subquery()

    # ── Step 2: MAX(ai_score) + COUNT per (file, domain) within that
    # latest analysis only. NULL ai_scores are excluded from the MAX
    # but still counted as evidence rows so operators see "we had 3
    # evidence sentences but no GPT-4o score" rather than silently
    # dropping the row.
    L = LLMDomainScoringAndSummary
    stmt = (
        select(
            L.source_filename.label("file"),
            L.domain.label("class_"),
            func.max(L.ai_score).label("score"),
            func.count(L.id).label("evidence_count"),
        )
        .join(
            latest_analysis,
            (L.source_filename == latest_analysis.c.file)
            & (L.analysis_id == latest_analysis.c.aid),
        )
        .where(_designated_treatment_filter(L))
        .group_by(L.source_filename, L.domain)
    )
    if file:
        stmt = stmt.where(L.source_filename == file)
    if class_:
        stmt = stmt.where(L.domain == class_)
    stmt = stmt.order_by(L.source_filename, L.domain)
    rows = (await db.execute(stmt)).all()

    # ── Step 3: speaker resolution (unchanged from previous version) ─
    speaker_val = speaker
    if not speaker_val and file:
        sp_stmt = (
            select(SentencePrediction.speaker)
            .where(SentencePrediction.patient_id == file)
            .distinct()
            .limit(1)
        )
        speaker_val = (await db.execute(sp_stmt)).scalar_one_or_none() or ""

    # ── Step 4: pad missing categories with score=0 ─────────────────
    # Every analysed file should have exactly 5 rows in the response —
    # one per category. A category the doctor never addressed shows up
    # as score=0, evidence_count=0. Without this, the dashboard would
    # see only the categories that have evidence and compute an
    # inflated 5-domain average over a partial denominator.
    ALL_CATEGORIES = ("cp", "le", "ed", "inc", "ius")
    by_file: dict[str, dict[str, dict]] = {}
    for r in rows:
        by_file.setdefault(r.file, {})[r.class_] = {
            "score": r.score,
            "evidence_count": r.evidence_count,
        }

    # If the caller filtered by class_, only emit that class — don't
    # invent rows the user explicitly excluded.
    target_categories = (class_,) if class_ else ALL_CATEGORIES

    data: list[dict] = []
    for fname, by_class in by_file.items():
        for cls in target_categories:
            entry = by_class.get(cls, {"score": 0, "evidence_count": 0})
            score = entry["score"] if entry["score"] is not None else 0
            data.append({
                "file": fname,
                "speaker": speaker_val or "",
                "class": cls,
                # avg_score is kept for ScoreAverageItem schema compatibility,
                # but it is now the designated-treatment ai_score, not an average.
                "avg_score": score,
                "count": entry["evidence_count"],
                "rewritten_count": 0,
                "original_count": entry["evidence_count"],
                "min_score": score,
                "max_score": score,
            })

    # ── Step 5: per-patient overall = AVG of 5 designated-treatment scores ──
    # Missing categories already padded to 0 above, so this is just a
    # straight mean over the 5 entries (or len(target_categories) if
    # the caller filtered to a single class).
    patient_overall: dict[str, dict] = {}
    n_categories = len(target_categories)
    for fname, by_class in by_file.items():
        scores = [
            (by_class.get(cls, {}).get("score") or 0)
            for cls in target_categories
        ]
        patient_overall[fname] = {
            "score": round(sum(scores) / n_categories, 2),
            "categories_present": sum(1 for cls in target_categories if cls in by_class),
            "categories_total": n_categories,
        }

    return {
        "total_groups": len(data),
        "filters": {"file": file, "speaker": speaker_val, "class": class_},
        "data": data,
        # patient_overall: keyed by source_filename. New field added on
        # top of the existing schema — TS interface ignores unknown keys
        # so the dashboard doesn't break, and a future migration can
        # promote this into the typed response when convenient.
        "patient_overall": patient_overall,
    }


@router.get("/scores/summary/{file}/{speaker}")
@router.get("/scores/summary/{file}")
async def get_doctor_score_summary_by_file_speaker(
    file: str,
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get score summary for specific patient (all classes).

    Uses Guille's GPT-4o ai_score (0-5) from llm_domain_scoring_and_summary.
    Uses AI pipeline ai_score only.
    """
    if not speaker:
        sp_stmt = select(SentencePrediction.speaker).where(
            SentencePrediction.patient_id == file
        ).distinct().limit(1)
        speaker = (await db.execute(sp_stmt)).scalar_one_or_none() or ""

    # Find analysis_id for this file
    analysis_stmt = select(TranscriptAnalysisLog.id).where(
        TranscriptAnalysisLog.source_filename == file
    ).order_by(TranscriptAnalysisLog.analyzed_at.desc()).limit(1)
    analysis_id = (await db.execute(analysis_stmt)).scalar_one_or_none()

    if not analysis_id:
        return {"file": file, "speaker": speaker, "overall": {"score": None, "count": 0}, "by_class": []}

    # Try GPT-4o ai_score from llm_domain_scoring_and_summary first
    from models import LLMDomainScoringAndSummary
    ai_stmt = select(LLMDomainScoringAndSummary).where(
        LLMDomainScoringAndSummary.analysis_id == analysis_id,
    ).order_by(LLMDomainScoringAndSummary.domain)
    ai_results = (await db.execute(ai_stmt)).scalars().all()

    # Select ONE row per domain for the grid. Side-effect domains store one row
    # per treatment; per the 2026-06-02 decision the dashboard scores each via a
    # single designated treatment (ED/inc=surgery, ius=radiation). If that
    # treatment was discussed, use its row with its real score. If it was NOT
    # discussed but the physician still mentioned the domain (a "<missing>"-
    # treatment row), surface that row's sentence with the score forced to 0
    # ("mentioned, not tied to the designated treatment"). cp/le have a single
    # row. This is the only surface that falls back to <missing>; /scores/average
    # and /scores/trajectory stay strictly designated (a not-discussed domain is
    # 0 there too), so every overall agrees.
    rows_by_domain: Dict[str, list] = {}
    for r in ai_results:
        rows_by_domain.setdefault(r.domain, []).append(r)

    selected: list = []  # (row, display_score)
    for domain, rows in rows_by_domain.items():
        designated = DOMAIN_DESIGNATED_TREATMENT.get(domain)
        if designated is None:
            chosen = max(
                rows, key=lambda x: x.ai_score if x.ai_score is not None else -1,
            )
            selected.append((chosen, chosen.ai_score))
            continue
        match = next((x for x in rows if x.treatment == designated), None)
        if match is not None:
            selected.append((match, match.ai_score))
        else:
            fallback = next((x for x in rows if x.treatment == "<missing>"), None)
            if fallback is not None:
                # Not discussed for the designated treatment -> score 0, but keep
                # the sentence the physician actually said about the domain.
                selected.append((fallback, 0))

    # Use AI pipeline ai_score only
    by_class = []
    scores_list = []
    domain_scores: Dict[str, float] = {}
    for r, display_score in selected:
        # Find matching (i, i2) and context with <main> tags from sentence_prediction
        i_val = None
        i2_val = None
        if r.source_sentence:
            match_stmt = select(
                SentencePrediction.utterance_index,
                SentencePrediction.sentence_in_utterance,
                SentencePrediction.context,
            ).where(
                SentencePrediction.analysis_id == analysis_id,
                SentencePrediction.sentence_text == r.source_sentence,
            ).limit(1)
            match_row = (await db.execute(match_stmt)).first()
            if match_row:
                i_val = match_row.utterance_index
                i2_val = match_row.sentence_in_utterance

        by_class.append({
            "class": r.domain,
            "score": display_score,
            "pred_score": None,
            "sentence": r.source_sentence,
            "i": i_val,
            "i2": i2_val,
            "explanation": r.score_explanation,
            "extracted_estimate": r.extracted_estimate,
            "treatment": r.treatment,
        })
        if display_score is not None:
            scores_list.append(display_score)
            domain_scores[r.domain] = display_score

    # Canonical overall: the per-domain designated-treatment score (a not-
    # discussed domain contributes 0), averaged over 5 — matches /scores/average
    # and /scores/trajectory so all surfaces agree.
    overall_score = _overall_from_domain_scores(domain_scores) if domain_scores else None

    return {
        "file": file,
        "speaker": speaker,
        "overall": {
            "score": overall_score,
            "count": len(scores_list),
        },
        "by_class": by_class,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Canonical per-patient overall score
# ──────────────────────────────────────────────────────────────────────────────
# Single source of truth shared by /scores/average, /scores/trajectory and
# /scores/summary so every dashboard surface shows ONE consistent overall.
#
# Rule: each domain contributes its DESIGNATED-treatment ai_score, then the
# mean over ALL 5 domains with any un-scored domain counting as 0. Side-effect
# domains store one ai_score row per treatment; per the 2026-06-02 decision the
# physician dashboard scores each via a single designated treatment (ED/inc =
# surgery, ius = radiation), selected by ``_designated_treatment_filter`` at the
# query level. cp/le have no treatment split. A side-effect domain whose
# designated treatment was never discussed yields no row -> counts as 0.
DOMAIN_COUNT = 5

# Designated treatment per side-effect domain (cp/le have none).
DOMAIN_DESIGNATED_TREATMENT = {"ed": "surgery", "inc": "surgery", "ius": "radiation"}


def _designated_treatment_filter(model):
    """SQLAlchemy WHERE keeping only the designated-treatment row per side-effect
    domain (cp/le pass through unchanged). A side-effect domain whose designated
    treatment was never discussed ends up with no rows, so it is padded to 0
    downstream.
    """
    return or_(
        model.domain.in_(("cp", "le")),
        and_(model.domain == "ed", model.treatment == "surgery"),
        and_(model.domain == "inc", model.treatment == "surgery"),
        and_(model.domain == "ius", model.treatment == "radiation"),
    )


def _overall_from_domain_scores(domain_scores: Dict[str, float]) -> float:
    """Mean over the 5 domains of the per-domain designated-treatment ai_score
    (missing = 0).

    ``domain_scores`` must contain at most the 5 canonical domains (extra keys
    would skew the denominator). Absent domains are treated as 0 by dividing
    the present-domain sum by the fixed domain count.
    """
    total = sum(v for v in domain_scores.values() if v is not None)
    return round(total / DOMAIN_COUNT, 2)


# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Score Trajectory API (B-2 feedback)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/scores/trajectory")
async def get_doctor_score_trajectory(
    speaker: Optional[str] = None,
    doctor_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get cumulative score trajectory over time (B-2 feedback).

    Uses AI pipeline ai_score (0-5) from llm_domain_scoring_and_summary.
    Each data point = a consultation event (patient transcript analysis).
    Y-value = cumulative average of all patients seen so far,
              where each patient contributes per-domain ai_scores,
              and the overall = average of domain scores.
    """
    logger.info("[trajectory] speaker=%s", speaker)

    from models import LLMDomainScoringAndSummary

    # Domain short → full name mapping
    domain_short_to_full = {
        "cp": "cancer_prognosis",
        "le": "life_expectancy",
        "ed": "erectile_dysfunction_potency",
        "inc": "continence",
        "ius": "irritative_urinary_symptoms",
    }

    # ── Step 1: Get AI scores per patient per domain, LATEST analysis only ──
    # Restrict to each file's most recent analysis (same basis as
    # /scores/average and /scores/summary). Without this, re-running a
    # transcript would mix old + new analysis rows and the trajectory would
    # diverge from those endpoints. Combined with the per-domain MAX merge
    # below, this makes the per-patient overall identical to /scores/average.
    latest_analysis_q = select(
        TranscriptAnalysisLog.source_filename.label("file"),
        func.max(TranscriptAnalysisLog.id).label("aid"),
    )
    # When a doctor is selected, restrict which files aggregate at all.
    if doctor_id:
        latest_analysis_q = latest_analysis_q.where(
            TranscriptAnalysisLog.doctor_id == doctor_id
        )
    latest_analysis = latest_analysis_q.group_by(
        TranscriptAnalysisLog.source_filename
    ).subquery()
    L = LLMDomainScoringAndSummary
    score_stmt = (
        select(
            L.source_filename,
            L.domain,
            L.ai_score,
            L.created_at,
        )
        .join(
            latest_analysis,
            (L.source_filename == latest_analysis.c.file)
            & (L.analysis_id == latest_analysis.c.aid),
        )
        .where(L.ai_score.isnot(None))
        .where(_designated_treatment_filter(L))
    )
    score_results = (await db.execute(score_stmt)).all()

    if not score_results:
        return {"total_events": 0, "speaker_filter": speaker, "trajectory": []}

    # Build: file_scores[file][domain_full] = ai_score
    file_scores: Dict[str, Dict[str, float]] = {}
    file_dates: Dict[str, Any] = {}
    for r in score_results:
        domain_full = domain_short_to_full.get(r.domain, r.domain)
        # score_results is filtered to the designated treatment per side-effect
        # domain (ED/inc=surgery, ius=radiation) by _designated_treatment_filter,
        # so at most one row per (file, domain) reaches here. The max() is a
        # harmless safety net should a domain ever carry duplicate rows.
        fs = file_scores.setdefault(r.source_filename, {})
        if r.ai_score is not None:
            prev = fs.get(domain_full)
            fs[domain_full] = r.ai_score if prev is None else max(prev, r.ai_score)
        if r.source_filename not in file_dates or r.created_at < file_dates[r.source_filename]:
            file_dates[r.source_filename] = r.created_at

    # ── Step 2: Build consultation timeline (sorted by date) ──
    events = [{"time": file_dates[f], "file": f} for f in file_scores]
    events.sort(key=lambda x: x["time"])

    # ── Step 3: Process timeline → cumulative trajectory ──
    consulted_files: list = []
    trajectory = []

    for event in events:
        file = event["file"]
        consulted_files.append(file)

        class_avgs: Dict[str, float] = {}
        patient_class_scores: Dict[str, Dict[str, float]] = {}
        for cls in domain_short_to_full.values():
            patient_scores = []
            for f in consulted_files:
                if f in file_scores and cls in file_scores[f]:
                    score = file_scores[f][cls]
                    patient_scores.append(score)
                    patient_class_scores.setdefault(f, {})[cls] = score
            if patient_scores:
                class_avgs[cls] = sum(patient_scores) / len(patient_scores)

        patients_detail = []
        for f in consulted_files:
            if f in patient_class_scores and patient_class_scores[f]:
                p_avgs = patient_class_scores[f]
                # Canonical per-patient overall: the designated-treatment score
                # per domain averaged over all 5 domains (missing = 0),
                # identical to /scores/average.
                p_overall = _overall_from_domain_scores(p_avgs)
                patients_detail.append({
                    "file": f,
                    "overall_score": p_overall,
                })

        overall = sum(class_avgs.values()) / len(class_avgs) if class_avgs else None

        trajectory.append({
            "timestamp": event["time"].isoformat(),
            "event_type": "consultation",
            "file": event["file"],
            "overall_score": round(overall, 4) if overall is not None else None,
            "by_class": {k: round(v, 4) for k, v in class_avgs.items()},
            "patients_count": len(consulted_files),
            "patients_detail": patients_detail,
        })

    logger.info("[trajectory] Returning %d events", len(trajectory))

    return {
        "total_events": len(trajectory),
        "speaker_filter": speaker,
        "trajectory": trajectory,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Sentence Scoring API
# ──────────────────────────────────────────────────────────────────────────────

class SentenceScoringRequest(BaseModel):
    sentence: str
    class_: Optional[str] = None

class SentenceScoringResponse(BaseModel):
    score: float
    sentence: str
    explanation: Optional[str] = None

@router.post("/score-sentence")
async def score_sentence(
    request_data: SentenceScoringRequest,
    user: AuthUser = Depends(get_current_user)
):
    """Score a sentence using Guille's AI pipeline (GPT-4o).

    Uses Azure OpenAI GPT-4o to evaluate how specifically the doctor
    communicated clinical risk in this sentence. Returns 0-5 score
    with chain-of-thought explanation.

    Score rubric:
      0 = No mention of domain topic
      1 = Mention but no risk description
      2 = Qualitative description only
      3 = Numeric estimate without timeline
      4 = Numeric estimate with timeline
      5 = Patient-specific estimate with timeline

    Uses AI pipeline for scoring via GPT-4o.
    """
    import sys
    if "/app" not in sys.path:
        sys.path.insert(0, "/app")

    try:
        from ai_pipeline.llm import call_llm
        from ai_pipeline.utils.prompts import load_prompt
        from openai import AzureOpenAI

        from core.settings import get_settings
        settings = get_settings()
        if not settings.azure_openai_endpoint or not settings.azure_openai_key:
            raise ValueError("Azure OpenAI not configured")

        client = AzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_key,
            api_version=settings.azure_openai_api_version,
        )

        model = settings.azure_openai_model
        params = {"max_tokens": 4096, "temperature": 0.3, "top_p": 0.4, "seed": 0}

        # Determine domain from class_ parameter
        domain = request_data.class_ or "cp"
        # Map class numbers/names to domain short names
        domain_map = {
            "1": "cp", "2": "inc", "3": "ed", "4": "ius", "5": "le",
            "cancer_prognosis": "cp", "continence": "inc",
            "erectile_dysfunction_potency": "ed",
            "irritative_urinary_symptoms_frequency_urgency_nocturnia": "ius",
            "life_expectancy": "le",
            "cp": "cp", "inc": "inc", "ed": "ed", "ius": "ius", "le": "le",
        }
        domain_short = domain_map.get(domain, "cp")

        # Load scoring prompt for this domain
        prompt = load_prompt("scoring", domain_short, "1")

        # Call GPT-4o scoring
        result = call_llm(client, model, params, prompt, text=request_data.sentence)

        return {
            "score": result["score"],
            "sentence": request_data.sentence,
            "explanation": result["explanation"],
        }

    except Exception as e:
        logger.error("GPT-4o scoring failed: %s", e)
        raise HTTPException(
            status_code=503,
            detail="AI scoring service temporarily unavailable. Please try again later."
        )

# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Class Distribution API
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/class-distribution")
async def get_doctor_class_distribution(
    file: Optional[str] = None,
    include_invalid: bool = Query(False, description="Include class=-1 (invalid) in results"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get class (model/domain) distribution per file from sentence_prediction.

    Each sentence_prediction row has a model (cp, le, ed, inc, ius).
    Returns count of each model for each file.

    Parameters:
    - file: Optional filter for specific file
    - include_invalid: kept for API compatibility (no-op, sentence_prediction has no invalid class)
    """
    logger.debug("get_doctor_class_distribution: file=%s, include_invalid=%s", file, include_invalid)

    # Base query — count predictions per (patient_id, model)
    stmt = select(
        SentencePrediction.patient_id.label('file'),
        SentencePrediction.model.label('class_'),
        func.count().label('count')
    )

    # Apply file filter if provided
    if file:
        stmt = stmt.where(SentencePrediction.patient_id == file)

    # Group by file and model
    stmt = stmt.group_by(
        SentencePrediction.patient_id,
        SentencePrediction.model,
    ).order_by(
        SentencePrediction.patient_id,
        SentencePrediction.model,
    )

    results = (await db.execute(stmt)).all()

    # Organize results by file
    distribution = {}
    for r in results:
        if r.file not in distribution:
            distribution[r.file] = {
                "file": r.file,
                "classes": {},
                "total": 0
            }
        distribution[r.file]["classes"][r.class_] = r.count
        distribution[r.file]["total"] += r.count

    # Convert to list format
    data = list(distribution.values())

    return {
        "total_files": len(data),
        "filters": {
            "file": file,
            "include_invalid": include_invalid
        },
        "data": data
    }


@router.get("/class-distribution/{file}")
async def get_doctor_class_distribution_by_file(
    file: str,
    include_invalid: bool = Query(False, description="Include class=-1 (invalid) in results"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get detailed class (model/domain) distribution for a specific file.

    Returns:
    - Count of each model
    - Percentage of each model
    """
    logger.debug("get_doctor_class_distribution_by_file: file=%s, include_invalid=%s", file, include_invalid)

    # Base query — count predictions per model for this file
    stmt = select(
        SentencePrediction.model.label('class_'),
        func.count().label('count')
    ).where(
        SentencePrediction.patient_id == file
    )

    # Group by model
    stmt = stmt.group_by(
        SentencePrediction.model
    ).order_by(
        SentencePrediction.model
    )

    results = (await db.execute(stmt)).all()

    if not results:
        raise HTTPException(
            status_code=404,
            detail=f"No data found for file: {file}"
        )

    # Calculate total and percentages
    total = sum(r.count for r in results)

    class_distribution = [
        {
            "class": r.class_,
            "count": r.count,
            "percentage": round((r.count / total) * 100, 2) if total > 0 else 0
        }
        for r in results
    ]

    return {
        "file": file,
        "total_sentences": total,
        "include_invalid": include_invalid,
        "distribution": class_distribution
    }

# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - AI Rewrite API
# Azure OpenAI Integration for sentence improvement
# ──────────────────────────────────────────────────────────────────────────────

# ═══════════════════════════════════════════════════════════
# Azure OpenAI Configuration (uncomment when ready to use)
# ═══════════════════════════════════════════════════════════
# import os
# from openai import AzureOpenAI
#
# azure_client = AzureOpenAI(
#     api_key=os.getenv("AZURE_OPENAI_API_KEY"),
#     api_version="2024-02-15-preview",
#     azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
# )
#
# AZURE_DEPLOYMENT_NAME = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4")


# ═══════════════════════════════════════════════════════════
# Constants - Class Names and Improvement Suggestions
# ═══════════════════════════════════════════════════════════
CLASS_NAMES: Dict[str, str] = {
    "1": "Cancer Prognosis",
    "2": "Life Expectancy",
    "3": "Erectile Dysfunction",
    "4": "Urinary Incontinence",
    "5": "Irritative Symptoms",
}

IMPROVEMENT_SUGGESTIONS: Dict[str, Dict[int, str]] = {
    "1": {  # Cancer Prognosis
        1: "Discuss potential for risk of cancer death, metastasis, or progression",
        2: 'Provide a generalization of magnitude of risk ("high"/"low")',
        3: "Provide a quantified estimate of risk",
        4: "Provide a quantified estimate of risk both with treatment and without treatment at an arbitrary timepoint",
        5: "Provide a quantified estimates of risk both with and without treatment at the patient's life expectancy",
    },
    "2": {  # Life Expectancy
        1: "Discuss the concept of competing risks of mortality",
        2: 'Provide a generalization of duration of life expectancy (i.e., "long"/"short")',
        3: 'Provide a rough quantified estimate of life expectancy (e.g., "about 15-20 years")',
        4: "Provide a probability of living to an arbitrary timepoint",
        5: "Provide a specific number of years and mention calculation based on the patient's age and health status",
    },
    "3": {  # Erectile Dysfunction
        1: "Discuss the potential risk of erectile dysfunction",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of ED without a time horizon (e.g., "45% risk of erectile dysfunction")',
        4: 'Provide an average probability of ED with a time horizon (e.g., "45% risk of erectile dysfunction at 1 year postop")',
        5: "Provide a patient-specific probability of ED with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
    "4": {  # Urinary Incontinence
        1: "Discuss the potential risk of urinary incontinence",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of UI without a time horizon (e.g., "10% risk of needing pads")',
        4: 'Provide an average probability of UI with a time horizon (e.g., "10% risk of needing pads beyond 1 year postop")',
        5: "Provide a patient-specific probability of UI with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
    "5": {  # Irritative Symptoms
        1: "Discuss the potential risk of irritative urinary symptoms",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of LUTS without a time horizon (e.g., "30% risk of developing irritative urinary symptoms")',
        4: 'Provide an average probability of LUTS with a time horizon (e.g., "30% risk of developing irritative urinary symptoms that may or may not resolve over the following year")',
        5: "Provide a patient-specific probability of LUTS with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
}


# ═══════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════
class AIRewriteRequest(BaseModel):
    """Request model for AI Rewrite"""
    sentence: str
    class_: str
    target_score: Optional[int] = None
    context: Optional[str] = None


class AIRewriteResponse(BaseModel):
    """Response model for AI Rewrite"""
    original_sentence: str
    rewritten_sentence: str
    original_score: Optional[float] = None
    new_score: float
    class_: str
    improvement_applied: str


# ═══════════════════════════════════════════════════════════
# AI Rewrite Endpoint
# ═══════════════════════════════════════════════════════════
@router.post("/ai-rewrite", response_model=AIRewriteResponse)
async def generate_ai_rewrite(
    request_data: AIRewriteRequest,
    user: AuthUser = Depends(get_current_user)
):
    """
    Generate AI-powered rewrite of a sentence to improve communication quality.

    Parameters:
    - sentence: Original sentence to rewrite
    - class_: Topic class (1-5)
    - target_score: Optional target score to aim for (1-5), defaults to 5
    - context: Optional full context for better rewriting

    Returns:
    - original_sentence: The input sentence
    - rewritten_sentence: AI-generated improved sentence
    - original_score: Score of original sentence (if available)
    - new_score: Expected score of rewritten sentence
    - class_: Topic class
    - improvement_applied: Description of improvements made
    """
    print("=" * 80)
    print("AI REWRITE [generate_ai_rewrite] - Input:")
    print(f"   sentence: {request_data.sentence[:100]}...")
    print(f"   class_: {request_data.class_}")
    print(f"   target_score: {request_data.target_score}")
    print(f"   context provided: {bool(request_data.context)}")

    # Validate class
    if request_data.class_ not in IMPROVEMENT_SUGGESTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid class. Must be one of: {list(IMPROVEMENT_SUGGESTIONS.keys())}"
        )

    # ═══════════════════════════════════════════════════════════
    # 1. Get improvement suggestion for target_score
    # ═══════════════════════════════════════════════════════════
    target_score = request_data.target_score if request_data.target_score else 5
    class_name = CLASS_NAMES.get(request_data.class_, "Unknown")

    # Get the suggestion for the target score
    improvement_suggestion = IMPROVEMENT_SUGGESTIONS[request_data.class_].get(
        target_score,
        IMPROVEMENT_SUGGESTIONS[request_data.class_].get(5, "")
    )

    # Get all suggestions for scores above current (for context)
    all_higher_suggestions = []
    for score in range(1, target_score + 1):
        if score in IMPROVEMENT_SUGGESTIONS[request_data.class_]:
            all_higher_suggestions.append(
                f"Score {score}: {IMPROVEMENT_SUGGESTIONS[request_data.class_][score]}"
            )

    print(f"   class_name: {class_name}")
    print(f"   target_score: {target_score}")
    print(f"   improvement_suggestion: {improvement_suggestion[:80]}...")

    # ═══════════════════════════════════════════════════════════
    # 2. Build LLM Prompt
    # ═══════════════════════════════════════════════════════════
    system_prompt = f"""You are a medical communication expert helping physicians improve their patient consultations about prostate cancer treatment.

Your task is to rewrite sentences to achieve better communication quality scores on a 1-5 scale.

Topic: {class_name}

Scoring criteria for this topic:
{chr(10).join(all_higher_suggestions)}

Guidelines:
- Maintain medical accuracy
- Use patient-friendly language
- Be specific and quantitative when appropriate
- Include relevant timeframes when discussing risks
- Consider patient-specific factors when applicable
"""

    user_prompt = f"""Please rewrite the following sentence to achieve a score of {target_score}.

Original sentence: "{request_data.sentence}"

Target score: {target_score}
Target criteria: {improvement_suggestion}

{f'Additional context: {request_data.context}' if request_data.context else ''}

Provide only the rewritten sentence without any explanation or additional text."""

    print("   LLM Prompt constructed successfully")
    print(f"   System prompt length: {len(system_prompt)} chars")
    print(f"   User prompt length: {len(user_prompt)} chars")

    # ═══════════════════════════════════════════════════════════
    # 3. Call Azure OpenAI API (COMMENTED OUT)
    # Uncomment when ready to integrate with actual LLM
    # ═══════════════════════════════════════════════════════════
    # try:
    #     response = azure_client.chat.completions.create(
    #         model=AZURE_DEPLOYMENT_NAME,
    #         messages=[
    #             {"role": "system", "content": system_prompt},
    #             {"role": "user", "content": user_prompt}
    #         ],
    #         temperature=0.7,
    #         max_tokens=500
    #     )
    #
    #     rewritten_sentence = response.choices[0].message.content.strip()
    #
    #     # Remove quotes if the model wrapped the response in quotes
    #     if rewritten_sentence.startswith('"') and rewritten_sentence.endswith('"'):
    #         rewritten_sentence = rewritten_sentence[1:-1]
    #
    #     print(f"   Azure OpenAI response received")
    #     print(f"   rewritten_sentence: {rewritten_sentence[:100]}...")
    #
    # except Exception as e:
    #     print(f"   ERROR calling Azure OpenAI: {str(e)}")
    #     raise HTTPException(
    #         status_code=500,
    #         detail=f"Failed to generate AI rewrite: {str(e)}"
    #     )

    # ═══════════════════════════════════════════════════════════
    # 4. Placeholder Response (remove when LLM is integrated)
    # ═══════════════════════════════════════════════════════════
    rewritten_sentence = "rewritten sentence"
    new_score = float(target_score)

    print("   [PLACEHOLDER] Returning placeholder response")
    print(f"   rewritten_sentence: {rewritten_sentence}")
    print(f"   new_score: {new_score}")
    print("=" * 80)

    return AIRewriteResponse(
        original_sentence=request_data.sentence,
        rewritten_sentence=rewritten_sentence,
        original_score=None,
        new_score=new_score,
        class_=request_data.class_,
        improvement_applied=improvement_suggestion
    )


# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Improvement Suggestions API
# Based on PDF pages 12-16 (exact wording)
# ──────────────────────────────────────────────────────────────────────────────

class ImprovementSuggestionItem(BaseModel):
    """Single improvement suggestion"""
    target_score: int
    suggestion: str

class ImprovementSuggestionsRequest(BaseModel):
    """Request model for improvement suggestions"""
    class_: str  # "1" | "2" | "3" | "4" | "5"
    current_score: Optional[float] = None  # If provided, filter suggestions above this score

class ImprovementSuggestionsResponse(BaseModel):
    """Response model for improvement suggestions"""
    class_: str
    class_name: str
    current_score: Optional[float]
    suggestions: List[ImprovementSuggestionItem]
    all_levels: Dict[int, str]  # All score level descriptions for reference

# ═══════════════════════════════════════════════════════════
# Improvement Suggestions Data (from PDF pages 12-16)
# ═══════════════════════════════════════════════════════════
IMPROVEMENT_SUGGESTIONS: Dict[str, Dict[int, str]] = {
    "1": {  # Cancer Prognosis (Page 12)
        1: "Discuss potential for risk of cancer death, metastasis, or progression",
        2: 'Provide a generalization of magnitude of risk ("high"/"low")',
        3: "Provide a quantified estimate of risk",
        4: "Provide a quantified estimate of risk both with treatment and without treatment at an arbitrary timepoint",
        5: "Provide a quantified estimates of risk both with and without treatment at the patient's life expectancy",
    },
    "2": {  # Life Expectancy (Page 13)
        1: "Discuss the concept of competing risks of mortality",
        2: 'Provide a generalization of duration of life expectancy (i.e., "long"/"short")',
        3: 'Provide a rough quantified estimate of life expectancy (e.g., "about 15-20 years")',
        4: "Provide a probability of living to an arbitrary timepoint",
        5: "Provide a specific number of years and mention calculation based on the patient's age and health status",
    },
    "3": {  # Erectile Dysfunction (Page 14)
        1: "Discuss the potential risk of erectile dysfunction",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of ED without a time horizon (e.g., "45% risk of erectile dysfunction")',
        4: 'Provide an average probability of ED with a time horizon (e.g., "45% risk of erectile dysfunction at 1 year postop")',
        5: "Provide a patient-specific probability of ED with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
    "4": {  # Urinary Incontinence (Page 15)
        1: "Discuss the potential risk of urinary incontinence",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of UI without a time horizon (e.g., "10% risk of needing pads")',
        4: 'Provide an average probability of UI with a time horizon (e.g., "10% risk of needing pads beyond 1 year postop")',
        5: "Provide a patient-specific probability of UI with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
    "5": {  # Irritative Symptoms (Page 16)
        1: "Discuss the potential risk of irritative urinary symptoms",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of LUTS without a time horizon (e.g., "30% risk of developing irritative urinary symptoms")',
        4: 'Provide an average probability of LUTS with a time horizon (e.g., "30% risk of developing irritative urinary symptoms that may or may not resolve over the following year")',
        5: "Provide a patient-specific probability of LUTS with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
}

CLASS_NAMES: Dict[str, str] = {
    "1": "Cancer Prognosis",
    "2": "Life Expectancy",
    "3": "Erectile Dysfunction",
    "4": "Urinary Incontinence",
    "5": "Irritative Symptoms",
}


@router.get("/improvement-suggestions/{class_}")
async def get_improvement_suggestions_by_class(
    class_: str,
    current_score: Optional[float] = Query(None, description="Current score to filter suggestions above this level"),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get improvement suggestions for a specific class (topic).

    Parameters:
    - class_: Topic class ("1" to "5")
    - current_score: Optional current score. If provided, returns only suggestions for scores above this level.

    Returns:
    - class_: The requested class
    - class_name: Human-readable class name
    - current_score: The provided current score (if any)
    - suggestions: List of applicable improvement suggestions
    - all_levels: All score level descriptions for reference
    """
    print("=" * 80)
    print("[INFO] DEBUG [get_improvement_suggestions] - Input:")
    print(f"   class_: {class_}")
    print(f"   current_score: {current_score}")

    # Validate class
    if class_ not in IMPROVEMENT_SUGGESTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid class. Must be one of: {list(IMPROVEMENT_SUGGESTIONS.keys())}"
        )

    class_name = CLASS_NAMES.get(class_, "Unknown")
    all_levels = IMPROVEMENT_SUGGESTIONS[class_]

    # Build suggestions list
    suggestions = []

    if current_score is not None:
        # Filter: only suggestions for scores above current_score
        score_floor = int(current_score)
        for score in range(score_floor + 1, 6):
            if score in all_levels:
                suggestions.append(ImprovementSuggestionItem(
                    target_score=score,
                    suggestion=all_levels[score]
                ))
    else:
        # Return all suggestions (scores 1-5)
        for score in range(1, 6):
            if score in all_levels:
                suggestions.append(ImprovementSuggestionItem(
                    target_score=score,
                    suggestion=all_levels[score]
                ))

    print(f"   class_name: {class_name}")
    print(f"   suggestions count: {len(suggestions)}")
    print("=" * 80)

    return ImprovementSuggestionsResponse(
        class_=class_,
        class_name=class_name,
        current_score=current_score,
        suggestions=suggestions,
        all_levels=all_levels
    )


@router.post("/improvement-suggestions")
async def get_improvement_suggestions(
    request_data: ImprovementSuggestionsRequest,
    user: AuthUser = Depends(get_current_user)
):
    """
    Get improvement suggestions for a specific class (POST version).

    Request body:
    - class_: Topic class ("1" to "5")
    - current_score: Optional current score. If provided, returns only suggestions for scores above this level.

    Returns same as GET version.
    """
    print("=" * 80)
    print("[INFO] DEBUG [get_improvement_suggestions POST] - Input:")
    print(f"   class_: {request_data.class_}")
    print(f"   current_score: {request_data.current_score}")

    # Validate class
    if request_data.class_ not in IMPROVEMENT_SUGGESTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid class. Must be one of: {list(IMPROVEMENT_SUGGESTIONS.keys())}"
        )

    class_name = CLASS_NAMES.get(request_data.class_, "Unknown")
    all_levels = IMPROVEMENT_SUGGESTIONS[request_data.class_]

    # Build suggestions list
    suggestions = []

    if request_data.current_score is not None:
        # Filter: only suggestions for scores above current_score
        score_floor = int(request_data.current_score)
        for score in range(score_floor + 1, 6):
            if score in all_levels:
                suggestions.append(ImprovementSuggestionItem(
                    target_score=score,
                    suggestion=all_levels[score]
                ))
    else:
        # Return all suggestions (scores 1-5)
        for score in range(1, 6):
            if score in all_levels:
                suggestions.append(ImprovementSuggestionItem(
                    target_score=score,
                    suggestion=all_levels[score]
                ))

    print(f"   class_name: {class_name}")
    print(f"   suggestions count: {len(suggestions)}")
    print("=" * 80)

    return ImprovementSuggestionsResponse(
        class_=request_data.class_,
        class_name=class_name,
        current_score=request_data.current_score,
        suggestions=suggestions,
        all_levels=all_levels
    )


@router.get("/improvement-suggestions")
async def get_all_improvement_suggestions(
    user: AuthUser = Depends(get_current_user)
):
    """
    Get all improvement suggestions for all classes.

    Returns a dictionary of all classes with their suggestions.
    """
    print("=" * 80)
    print("[INFO] DEBUG [get_all_improvement_suggestions]")
    print("=" * 80)

    result = {}

    for class_ in IMPROVEMENT_SUGGESTIONS:
        result[class_] = {
            "class_name": CLASS_NAMES.get(class_, "Unknown"),
            "suggestions": IMPROVEMENT_SUGGESTIONS[class_]
        }

    return {
        "total_classes": len(result),
        "data": result
    }

