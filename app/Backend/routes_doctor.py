"""Doctor Interface API routes.

Endpoints for doctor sentence view, rewrite history, scoring,
class distribution, AI rewrite, and improvement suggestions.
"""

import logging
from datetime import datetime
from typing import List, Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.access_control import check_patient_access
from auth.base import AuthUser
from db import get_db
from models import DoctorSentenceView, DoctorRewriteLog
from nlp_service import predict_single, CLASS_TO_MODEL, NLPServiceError

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

    # Get speakers for the file
    all_speakers_stmt = select(DoctorSentenceView.speaker).distinct().where(
        DoctorSentenceView.file == file
    )
    all_speakers_raw = (await db.execute(all_speakers_stmt)).scalars().all()

    # Filter out None values to prevent TypeError
    all_speakers = [s for s in all_speakers_raw if s is not None]

    logger.debug("get_doctor_sentences: file=%s, speaker=%s, available_speakers=%d", file, speaker, len(all_speakers))

    # Execute actual query
    stmt = select(DoctorSentenceView).where(
        DoctorSentenceView.file == file,
        DoctorSentenceView.speaker == speaker,
        DoctorSentenceView.class_ != '-1'
    ).order_by(DoctorSentenceView.i, DoctorSentenceView.i2)
    
    results = (await db.execute(stmt)).scalars().all()
    logger.debug("get_doctor_sentences: found %d rows for file=%s, speaker=%s", len(results), file, speaker)

    if not results:
        raise HTTPException(
            status_code=404,
            detail="No data found for the specified file and speaker."
        )
    
    return {
        "file": file,
        "speaker": speaker,
        "total": len(results),
        "data": [
            {
                "i": r.i,
                "i2": r.i2,
                "sentence": r.sentence,
                "score": r.score,
                "class": r.class_,
                "time": r.time.isoformat() if r.time else None
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

    # Check if file exists in DoctorSentenceView
    file_exists_stmt = select(func.count()).select_from(DoctorSentenceView).where(
        DoctorSentenceView.file == update_data.file
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
    Includes original_score from doctor_sentence_view
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
    
    # ═══════════════════════════════════════════════════════════
    # NEW: Get original_score from doctor_sentence_view
    # ═══════════════════════════════════════════════════════════
    original_score = None
    try:
        # Query doctor_sentence_view to get the original score
        sentence_stmt = select(DoctorSentenceView).where(
            DoctorSentenceView.file == file,
            DoctorSentenceView.i == i,
            DoctorSentenceView.i2 == i2
        )
        sentence_result = (await db.execute(sentence_stmt)).scalars().first()
        
        if sentence_result:
            original_score = sentence_result.score
            print(f"   Original score from doctor_sentence_view: {original_score}")
        else:
            print(f"   ⚠️ No matching sentence found in doctor_sentence_view")
    except Exception as e:
        print(f"   ⚠️ Error fetching original score: {e}")
    
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
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get list of unique files in doctor interface"""
    stmt = select(DoctorSentenceView.file).distinct().order_by(DoctorSentenceView.file).limit(limit)
    files_raw = (await db.execute(stmt)).scalars().all()
    files = [f for f in files_raw if f is not None]
    return {"files": files}




# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Score Average APIs (with Rewrite Log Priority)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/scores/average")
async def get_doctor_score_average(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    class_: Optional[str] = Query(None, alias="class"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get average score grouped by file, speaker, class

    Uses ONLY original NLP scores from doctor_sentence_view.
    Rewrite scores (doctor_rewrite_log) are NOT used here — rewrites are
    purely a training/practice tool and do not affect score analysis.

    Filter options:
    - No filters: Average for all file/speaker/class combinations
    - file only: Average by speaker/class for the specified file
    - file + speaker: Average by class for the specified file and speaker
    - file + speaker + class: Single average value for the specific combination
    """
    print("=" * 80)
    print("DEBUG [get_doctor_score_average] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")
    print(f"   class: {class_}")

    # ⚠️ WARNING — TEMPORARY SCORING APPROACH (NOT PRODUCTION-READY)
    # Currently this endpoint returns the score of the LAST sentence (highest i, then i2)
    # per file/speaker/class group. This is a simplified placeholder used during development.
    # For production, this must be replaced with a proper scoring algorithm that aggregates
    # across all relevant sentences (e.g., weighted average, rubric-based composite, or
    # domain-specific scoring logic). The last-sentence score does NOT accurately represent
    # overall communication quality for a given domain.
    #
    # Step 2: Get the LAST sentence score (highest i, then i2) per file/speaker/class
    # Subquery to find the max (i, i2) per group
    last_sentence_subq = (
        select(
            DoctorSentenceView.file,
            DoctorSentenceView.speaker,
            DoctorSentenceView.class_,
            func.max(DoctorSentenceView.i).label('max_i')
        )
        .where(
            DoctorSentenceView.class_ != '-1',
            DoctorSentenceView.score.isnot(None)
        )
        .group_by(
            DoctorSentenceView.file,
            DoctorSentenceView.speaker,
            DoctorSentenceView.class_
        )
    ).subquery('last_sent')

    # Get the actual last sentence row (max i, then max i2 within that i)
    last_i2_subq = (
        select(
            DoctorSentenceView.file,
            DoctorSentenceView.speaker,
            DoctorSentenceView.class_,
            DoctorSentenceView.i,
            func.max(DoctorSentenceView.i2).label('max_i2')
        )
        .join(
            last_sentence_subq,
            and_(
                DoctorSentenceView.file == last_sentence_subq.c.file,
                DoctorSentenceView.speaker == last_sentence_subq.c.speaker,
                DoctorSentenceView.class_ == last_sentence_subq.c.class_,
                DoctorSentenceView.i == last_sentence_subq.c.max_i,
            )
        )
        .where(
            DoctorSentenceView.class_ != '-1',
            DoctorSentenceView.score.isnot(None)
        )
        .group_by(
            DoctorSentenceView.file,
            DoctorSentenceView.speaker,
            DoctorSentenceView.class_,
            DoctorSentenceView.i
        )
    ).subquery('last_i2')

    # Final query: join back to get the score of the last sentence
    stmt = select(
        DoctorSentenceView.file,
        DoctorSentenceView.speaker,
        DoctorSentenceView.class_,
        DoctorSentenceView.score.label('avg_score'),  # Named avg_score for frontend compatibility
        DoctorSentenceView.i,
        DoctorSentenceView.i2,
    ).join(
        last_i2_subq,
        and_(
            DoctorSentenceView.file == last_i2_subq.c.file,
            DoctorSentenceView.speaker == last_i2_subq.c.speaker,
            DoctorSentenceView.class_ == last_i2_subq.c.class_,
            DoctorSentenceView.i == last_i2_subq.c.i,
            DoctorSentenceView.i2 == last_i2_subq.c.max_i2,
        )
    ).where(
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None)
    )

    # Apply filters
    if file:
        stmt = stmt.where(DoctorSentenceView.file == file)
    if speaker:
        stmt = stmt.where(DoctorSentenceView.speaker == speaker)
    if class_:
        stmt = stmt.where(DoctorSentenceView.class_ == class_)

    stmt = stmt.order_by(
        DoctorSentenceView.file,
        DoctorSentenceView.speaker,
        DoctorSentenceView.class_
    )

    results = (await db.execute(stmt)).all()

    print(f"   Found {len(results)} groups")
    print("=" * 80)

    return {
        "total_groups": len(results),
        "filters": {
            "file": file,
            "speaker": speaker,
            "class": class_
        },
        "data": [
            {
                "file": r.file,
                "speaker": r.speaker,
                "class": r.class_,
                "avg_score": round(r.avg_score, 2) if r.avg_score else None,
                "count": 1,
                "rewritten_count": 0,
                "original_count": 1,
                "min_score": r.avg_score,
                "max_score": r.avg_score
            }
            for r in results
        ]
    }


@router.get("/scores/summary/{file}/{speaker}")
async def get_doctor_score_summary_by_file_speaker(
    file: str,
    speaker: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get score summary for specific file and speaker (all classes)

    Uses ONLY original NLP scores from doctor_sentence_view.
    Rewrite scores (doctor_rewrite_log) are NOT used here — rewrites are
    purely a training/practice tool and do not affect score analysis.

    Returns:
    - Average, count, min/max for each class
    - Overall average across all classes
    """
    print("=" * 80)
    print("DEBUG [get_doctor_score_summary] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")

    # Statistics by class — original NLP scores only
    class_stats_stmt = select(
        DoctorSentenceView.class_,
        func.avg(DoctorSentenceView.score).label('avg_score'),
        func.count(DoctorSentenceView.score).label('count'),
        func.min(DoctorSentenceView.score).label('min_score'),
        func.max(DoctorSentenceView.score).label('max_score'),
    ).where(
        DoctorSentenceView.file == file,
        DoctorSentenceView.speaker == speaker,
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None)
    ).group_by(
        DoctorSentenceView.class_
    ).order_by(
        DoctorSentenceView.class_
    )

    class_results = (await db.execute(class_stats_stmt)).all()

    # Overall statistics — original NLP scores only
    overall_stmt = select(
        func.avg(DoctorSentenceView.score).label('avg_score'),
        func.count(DoctorSentenceView.score).label('count'),
        func.min(DoctorSentenceView.score).label('min_score'),
        func.max(DoctorSentenceView.score).label('max_score'),
    ).where(
        DoctorSentenceView.file == file,
        DoctorSentenceView.speaker == speaker,
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None)
    )

    overall = (await db.execute(overall_stmt)).one()

    print(f"   Found {len(class_results)} classes")
    print(f"   Total sentences: {overall.count}")
    print("=" * 80)

    return {
        "file": file,
        "speaker": speaker,
        "overall": {
            "avg_score": round(overall.avg_score, 2) if overall.avg_score else None,
            "count": overall.count,
            "min_score": overall.min_score,
            "max_score": overall.max_score
        },
        "by_class": [
            {
                "class": r.class_,
                "avg_score": round(r.avg_score, 2) if r.avg_score else None,
                "count": r.count,
                "min_score": r.min_score,
                "max_score": r.max_score
            }
            for r in class_results
        ]
    }


# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Score Trajectory API (B-2 feedback)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/scores/trajectory")
async def get_doctor_score_trajectory(
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get cumulative score trajectory over time (B-2 feedback).

    Uses ONLY original NLP scores from doctor_sentence_view.
    Rewrite scores (doctor_rewrite_log) are NOT used here — rewrites are
    purely a training/practice tool and do not affect score analysis.

    Each data point = a consultation event.
    Y-value = cumulative average of all patients seen so far,
              where each patient contributes 5 category averages,
              and the overall = average of 5 category averages.
    """
    logger.info("[trajectory] speaker=%s", speaker)

    # ── Step 1: Get all original sentences ──
    sent_stmt = select(
        DoctorSentenceView.file,
        DoctorSentenceView.i,
        DoctorSentenceView.i2,
        DoctorSentenceView.class_,
        DoctorSentenceView.score,
    ).where(
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None),
    )
    if speaker:
        sent_stmt = sent_stmt.where(DoctorSentenceView.speaker == speaker)

    sent_results = (await db.execute(sent_stmt)).all()

    # Build: file_sentences[file][class][(i,i2)] = original_score
    file_sentences: Dict[str, Dict[str, Dict[tuple, float]]] = {}
    for r in sent_results:
        file_sentences.setdefault(r.file, {}).setdefault(r.class_, {})[(r.i, r.i2)] = r.score

    # ── Step 2: Get consultation dates per file ──
    consult_stmt = select(
        DoctorSentenceView.file,
        func.min(DoctorSentenceView.time).label('consultation_date'),
    ).where(
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None),
    )
    if speaker:
        consult_stmt = consult_stmt.where(DoctorSentenceView.speaker == speaker)
    consult_stmt = consult_stmt.group_by(DoctorSentenceView.file)

    consult_results = (await db.execute(consult_stmt)).all()

    # ── Step 3: Build consultation timeline (sorted by date) ──
    events = []
    for r in consult_results:
        events.append({
            "time": r.consultation_date,
            "file": r.file,
        })
    events.sort(key=lambda x: x["time"])

    # ── Step 4: Process timeline → cumulative trajectory ──
    consulted_files: list = []
    trajectory = []

    for event in events:
        file = event["file"]
        consulted_files.append(file)

        # For each category, average across all consulted patients
        class_avgs: Dict[str, float] = {}
        patient_class_scores: Dict[str, Dict[str, float]] = {}
        for cls in ["1", "2", "3", "4", "5"]:
            patient_scores = []
            for f in consulted_files:
                if f in file_sentences and cls in file_sentences[f]:
                    scores = list(file_sentences[f][cls].values())
                    if scores:
                        avg = sum(scores) / len(scores)
                        patient_scores.append(avg)
                        patient_class_scores.setdefault(f, {})[cls] = avg
            if patient_scores:
                class_avgs[cls] = sum(patient_scores) / len(patient_scores)

        # Compute per-patient overall score (avg of their category avgs)
        patients_detail = []
        for f in consulted_files:
            if f in patient_class_scores and patient_class_scores[f]:
                p_avgs = patient_class_scores[f]
                p_overall = sum(p_avgs.values()) / len(p_avgs)
                patients_detail.append({
                    "file": f,
                    "overall_score": round(p_overall, 4),
                })

        # Overall = average of category averages
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

@router.post("/score-sentence", response_model=SentenceScoringResponse)
async def score_sentence(
    request_data: SentenceScoringRequest,
    user: AuthUser = Depends(get_current_user)
):
    """Score a sentence.

    Placeholder: always returns 5 until the communication quality
    scoring pipeline (Steps 6-9) is implemented.
    """
    return SentenceScoringResponse(
        score=5,
        sentence=request_data.sentence
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
    Get class distribution per file in doctor_sentence_view
    
    Returns count of each class (1~5) for each file
    
    Parameters:
    - file: Optional filter for specific file
    - include_invalid: If True, include class=-1 in results (default: False)
    """
    print("=" * 80)
    print("DEBUG [get_doctor_class_distribution] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   include_invalid: {include_invalid}")
    
    # Base query
    stmt = select(
        DoctorSentenceView.file,
        DoctorSentenceView.class_,
        func.count().label('count')
    )
    
    # Exclude invalid class unless requested
    if not include_invalid:
        stmt = stmt.where(DoctorSentenceView.class_ != '-1')
    
    # Apply file filter if provided
    if file:
        stmt = stmt.where(DoctorSentenceView.file == file)
    
    # Group by file and class
    stmt = stmt.group_by(
        DoctorSentenceView.file,
        DoctorSentenceView.class_
    ).order_by(
        DoctorSentenceView.file,
        DoctorSentenceView.class_
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
    
    print(f"   Found {len(data)} files")
    print("=" * 80)
    
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
    Get detailed class distribution for a specific file
    
    Returns:
    - Count of each class
    - Percentage of each class
    - List of sentences per class (optional summary)
    """
    print("=" * 80)
    print("DEBUG [get_doctor_class_distribution_by_file] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   include_invalid: {include_invalid}")
    
    # Base query
    stmt = select(
        DoctorSentenceView.class_,
        func.count().label('count')
    ).where(
        DoctorSentenceView.file == file
    )
    
    # Exclude invalid class unless requested
    if not include_invalid:
        stmt = stmt.where(DoctorSentenceView.class_ != '-1')
    
    # Group by class
    stmt = stmt.group_by(
        DoctorSentenceView.class_
    ).order_by(
        DoctorSentenceView.class_
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
    
    print(f"   Found {len(class_distribution)} classes, total {total} sentences")
    print("=" * 80)
    
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
    
    print(f"   [PLACEHOLDER] Returning placeholder response")
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
    print("📋 DEBUG [get_improvement_suggestions] - Input:")
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
    print("📋 DEBUG [get_improvement_suggestions POST] - Input:")
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
    print("📋 DEBUG [get_all_improvement_suggestions]")
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

