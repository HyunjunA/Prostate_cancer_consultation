"""Patient Interface, Stats, and REDCap API routes.

Endpoints for patient summaries, scoring, responses,
dashboard statistics, and REDCap integration.
"""

import logging
import os
from typing import Optional, List, Dict, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.access_control import check_patient_access
from auth.base import AuthUser
from db import get_db
from models import (
    DoctorSentenceView,
    DoctorRewriteLog,
    PatientSummary,
    PatientSummaryScoring,
    PatientResponses,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Patient Interface"])


class PatientScoringUpdate(BaseModel):
    file: str
    speaker: str
    class_1_patient_scoring: Optional[int] = None
    class_2_patient_scoring: Optional[int] = None
    class_3_patient_scoring: Optional[int] = None
    class_4_patient_scoring: Optional[int] = None
    class_5_patient_scoring: Optional[int] = None


# ──────────────────────────────────────────────────────────────────────────────
# Patient Interface APIs
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/api/patient/summaries")
async def get_patient_summaries(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get patient summaries with optional filters"""
    print("=" * 80)
    print("🔍 DEBUG [get_patient_summaries] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")
    print(f"   skip: {skip}, limit: {limit}")
    
    stmt = select(PatientSummary)
    
    if file:
        stmt = stmt.where(PatientSummary.file == file)
    if speaker:
        stmt = stmt.where(PatientSummary.speaker == speaker)
    
    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()
    
    # Get paginated results
    stmt = stmt.offset(skip).limit(limit)
    results = (await db.execute(stmt)).scalars().all()
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": [
            {
                "file": r.file,
                "speaker": r.speaker,
                "entire_summary": r.entire_summary,
                "classes": [
                    {
                        "class_name": r.class_1,
                        "summary": r.summary_class_1
                    },
                    {
                        "class_name": r.class_2,
                        "summary": r.summary_class_2
                    },
                    {
                        "class_name": r.class_3,
                        "summary": r.summary_class_3
                    },
                    {
                        "class_name": r.class_4,
                        "summary": r.summary_class_4
                    },
                    {
                        "class_name": r.class_5,
                        "summary": r.summary_class_5
                    }
                ]
            }
            for r in results
        ]
    }

@router.get("/api/patient/summaries/{file}/{speaker}")
async def get_patient_summary_detail(
    file: str,
    speaker: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get detailed patient summary for specific file and speaker"""
    await check_patient_access(file, user, db)
    print("=" * 80)
    print("🔍 DEBUG [get_patient_summary_detail] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")

    # Get summary
    summary_stmt = select(PatientSummary).where(
        PatientSummary.file == file,
        PatientSummary.speaker == speaker
    )
    summary = (await db.execute(summary_stmt)).scalar_one_or_none()
    
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    
    # Get scoring
    scoring_stmt = select(PatientSummaryScoring).where(
        PatientSummaryScoring.file == file,
        PatientSummaryScoring.speaker == speaker
    )
    scoring = (await db.execute(scoring_stmt)).scalar_one_or_none()
    
    return {
        "file": file,
        "speaker": speaker,
        "summary": {
            "entire_summary": summary.entire_summary,
            "classes": [
                {
                    "class_name": summary.class_1,
                    "summary": summary.summary_class_1,
                    "score": scoring.class_1_patient_scoring if scoring else None
                },
                {
                    "class_name": summary.class_2,
                    "summary": summary.summary_class_2,
                    "score": scoring.class_2_patient_scoring if scoring else None
                },
                {
                    "class_name": summary.class_3,
                    "summary": summary.summary_class_3,
                    "score": scoring.class_3_patient_scoring if scoring else None
                },
                {
                    "class_name": summary.class_4,
                    "summary": summary.summary_class_4,
                    "score": scoring.class_4_patient_scoring if scoring else None
                },
                {
                    "class_name": summary.class_5,
                    "summary": summary.summary_class_5,
                    "score": scoring.class_5_patient_scoring if scoring else None
                }
            ]
        }
    }


@router.get("/api/patient/scoring")
async def get_patient_scoring(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get patient scoring data"""
    print("=" * 80)
    print("🔍 DEBUG [get_patient_scoring] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")
    
    stmt = select(PatientSummaryScoring)
    
    if file:
        stmt = stmt.where(PatientSummaryScoring.file == file)
    if speaker:
        stmt = stmt.where(PatientSummaryScoring.speaker == speaker)
    
    results = (await db.execute(stmt)).scalars().all()
    
    return {
        "total": len(results),
        "data": [
            {
                "file": r.file,
                "speaker": r.speaker,
                "scores": {
                    "class_1": r.class_1_patient_scoring,
                    "class_2": r.class_2_patient_scoring,
                    "class_3": r.class_3_patient_scoring,
                    "class_4": r.class_4_patient_scoring,
                    "class_5": r.class_5_patient_scoring
                },
                "average": round(sum(filter(None, [
                    r.class_1_patient_scoring,
                    r.class_2_patient_scoring,
                    r.class_3_patient_scoring,
                    r.class_4_patient_scoring,
                    r.class_5_patient_scoring
                ])) / len(list(filter(None, [
                    r.class_1_patient_scoring,
                    r.class_2_patient_scoring,
                    r.class_3_patient_scoring,
                    r.class_4_patient_scoring,
                    r.class_5_patient_scoring
                ]))), 2) if any([
                    r.class_1_patient_scoring,
                    r.class_2_patient_scoring,
                    r.class_3_patient_scoring,
                    r.class_4_patient_scoring,
                    r.class_5_patient_scoring
                ]) else None
            }
            for r in results
        ]
    }

@router.put("/api/patient/scoring")
async def update_patient_scoring(
    update_data: PatientScoringUpdate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Update or create patient scoring record"""
    print("=" * 80)
    print("🔍 DEBUG [update_patient_scoring] - Input Data:")
    print(f"   file: {update_data.file}")
    print(f"   speaker: {update_data.speaker}")
    print(f"   class_1: {update_data.class_1_patient_scoring}")
    print(f"   class_2: {update_data.class_2_patient_scoring}")
    print(f"   class_3: {update_data.class_3_patient_scoring}")
    print(f"   class_4: {update_data.class_4_patient_scoring}")
    print(f"   class_5: {update_data.class_5_patient_scoring}")
    
    # Find existing record by file and speaker
    stmt = select(PatientSummaryScoring).where(
        (PatientSummaryScoring.file == update_data.file) &
        (PatientSummaryScoring.speaker == update_data.speaker)
    )
    existing_record = (await db.execute(stmt)).scalars().first()
    
    # If exists, update; if not, create new
    if existing_record:
        record = existing_record
    else:
        record = PatientSummaryScoring(
            file=update_data.file,
            speaker=update_data.speaker
        )
    
    # Update only provided fields
    if update_data.class_1_patient_scoring is not None:
        record.class_1_patient_scoring = update_data.class_1_patient_scoring
    if update_data.class_2_patient_scoring is not None:
        record.class_2_patient_scoring = update_data.class_2_patient_scoring
    if update_data.class_3_patient_scoring is not None:
        record.class_3_patient_scoring = update_data.class_3_patient_scoring
    if update_data.class_4_patient_scoring is not None:
        record.class_4_patient_scoring = update_data.class_4_patient_scoring
    if update_data.class_5_patient_scoring is not None:
        record.class_5_patient_scoring = update_data.class_5_patient_scoring
    
    db.add(record)
    await db.commit()
    await db.refresh(record)
    
    # Calculate average
    scores = [
        record.class_1_patient_scoring,
        record.class_2_patient_scoring,
        record.class_3_patient_scoring,
        record.class_4_patient_scoring,
        record.class_5_patient_scoring
    ]
    valid_scores = [s for s in scores if s is not None]
    average = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else None
    
    return {
        "file": record.file,
        "speaker": record.speaker,
        "scores": {
            "class_1": record.class_1_patient_scoring,
            "class_2": record.class_2_patient_scoring,
            "class_3": record.class_3_patient_scoring,
            "class_4": record.class_4_patient_scoring,
            "class_5": record.class_5_patient_scoring
        },
        "average": average
    }

@router.get("/api/patient/responses")
async def get_patient_responses(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get patient question responses"""
    print("=" * 80)
    print("🔍 DEBUG [get_patient_responses] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")
    
    stmt = select(PatientResponses)
    
    if file:
        stmt = stmt.where(PatientResponses.file == file)
    if speaker:
        stmt = stmt.where(PatientResponses.speaker == speaker)
    
    results = (await db.execute(stmt)).scalars().all()
    
    return {
        "total": len(results),
        "data": [
            {
                "file": r.file,
                "speaker": r.speaker,
                "answers": {
                    "answer_1": r.answer_1,
                    "answer_2": r.answer_2,
                    "answer_3": r.answer_3,
                    "answer_4": r.answer_4,
                    "answer_5": r.answer_5
                }
            }
            for r in results
        ]
    }

@router.get("/api/patient/files")
async def get_patient_files(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get list of unique files in patient interface"""
    print("=" * 80)
    print("🔍 DEBUG [get_patient_files] - Querying distinct files")
    
    stmt = select(PatientSummary.file).distinct().order_by(PatientSummary.file)
    files_raw = (await db.execute(stmt)).scalars().all()
    
    # Filter out None values
    files = [f for f in files_raw if f is not None]
    none_count = len(files_raw) - len(files)
    
    print(f"   Found {len(files)} files ({none_count} NULL values filtered)")
    print("=" * 80)
    
    return {"files": files}


@router.get("/api/patient/sentences/{file}")
async def get_patient_sentences_by_class(
    file: str,
    top_n: int = Query(7, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get top-scoring sentences from doctor_sentence_view grouped by class.

    Returns the highest-scoring sentences per class for the patient
    "View relevant sentences from your visit" feature.
    All speakers in the transcript are included (doctor, patient, etc.).
    """
    await check_patient_access(file, user, db)

    stmt = select(
        DoctorSentenceView.class_,
        DoctorSentenceView.sentence,
        DoctorSentenceView.score,
        DoctorSentenceView.speaker,
        DoctorSentenceView.i,
        DoctorSentenceView.i2,
    ).where(
        DoctorSentenceView.file == file,
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None),
    ).order_by(
        DoctorSentenceView.class_,
        DoctorSentenceView.score.desc(),
    )

    results = (await db.execute(stmt)).all()

    # Group by class, keep top_n per class
    by_class: dict[str, list[dict]] = {}
    for r in results:
        cls = r.class_
        if cls not in by_class:
            by_class[cls] = []
        if len(by_class[cls]) < top_n:
            by_class[cls].append({
                "sentence": r.sentence,
                "score": r.score,
                "speaker": r.speaker,
                "i": r.i,
                "i2": r.i2,
            })

    return {
        "file": file,
        "top_n": top_n,
        "by_class": by_class,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard/Stats APIs
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/api/stats/dashboard")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get overall dashboard statistics"""
    print("=" * 80)
    print("🔍 DEBUG [get_dashboard_stats] - Querying statistics")
    
    # Doctor stats
    print("   Querying doctor interface stats...")
    doctor_sentences_count = (await db.execute(
        select(func.count()).select_from(DoctorSentenceView)
    )).scalar_one()
    print(f"   - doctor_sentences_count: {doctor_sentences_count}")
    
    doctor_rewrites_count = (await db.execute(
        select(func.count()).select_from(DoctorRewriteLog)
    )).scalar_one()
    
    doctor_files_count = (await db.execute(
        select(func.count(func.distinct(DoctorSentenceView.file)))
    )).scalar_one()
    
    # Patient stats
    patient_summaries_count = (await db.execute(
        select(func.count()).select_from(PatientSummary)
    )).scalar_one()
    
    patient_files_count = (await db.execute(
        select(func.count(func.distinct(PatientSummary.file)))
    )).scalar_one()
    
    # Average patient scoring
    avg_scores_stmt = select(
        func.avg(PatientSummaryScoring.class_1_patient_scoring).label('avg_class_1'),
        func.avg(PatientSummaryScoring.class_2_patient_scoring).label('avg_class_2'),
        func.avg(PatientSummaryScoring.class_3_patient_scoring).label('avg_class_3'),
        func.avg(PatientSummaryScoring.class_4_patient_scoring).label('avg_class_4'),
        func.avg(PatientSummaryScoring.class_5_patient_scoring).label('avg_class_5')
    )
    avg_scores = (await db.execute(avg_scores_stmt)).one()
    
    return {
        "doctor_interface": {
            "total_sentences": doctor_sentences_count,
            "total_rewrites": doctor_rewrites_count,
            "unique_files": doctor_files_count
        },
        "patient_interface": {
            "total_summaries": patient_summaries_count,
            "unique_files": patient_files_count,
            "average_scores": {
                "class_1": round(avg_scores.avg_class_1, 2) if avg_scores.avg_class_1 else None,
                "class_2": round(avg_scores.avg_class_2, 2) if avg_scores.avg_class_2 else None,
                "class_3": round(avg_scores.avg_class_3, 2) if avg_scores.avg_class_3 else None,
                "class_4": round(avg_scores.avg_class_4, 2) if avg_scores.avg_class_4 else None,
                "class_5": round(avg_scores.avg_class_5, 2) if avg_scores.avg_class_5 else None
            }
        }
    }


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic Model for Patient Responses Update
# ──────────────────────────────────────────────────────────────────────────────

class PatientResponsesUpdate(BaseModel):
    file: str
    speaker: str
    answer_1: Optional[str] = None
    answer_2: Optional[str] = None
    answer_3: Optional[str] = None
    answer_4: Optional[str] = None
    answer_5: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# PUT endpoint for Patient Responses
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/api/patient/responses")
async def update_patient_responses(
    update_data: PatientResponsesUpdate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Update or create patient question responses"""
    print("=" * 80)
    print("🔍 DEBUG [update_patient_responses] - Input Data:")
    print(f"   file: {update_data.file}")
    print(f"   speaker: {update_data.speaker}")
    print(f"   answer_1: {update_data.answer_1[:30] if update_data.answer_1 else None}...")
    print(f"   answer_2: {update_data.answer_2[:30] if update_data.answer_2 else None}...")
    print(f"   answer_3: {update_data.answer_3[:30] if update_data.answer_3 else None}...")
    print(f"   answer_4: {update_data.answer_4[:30] if update_data.answer_4 else None}...")
    print(f"   answer_5: {update_data.answer_5[:30] if update_data.answer_5 else None}...")
    
    # Find existing record by file and speaker
    stmt = select(PatientResponses).where(
        (PatientResponses.file == update_data.file) &
        (PatientResponses.speaker == update_data.speaker)
    )
    existing_record = (await db.execute(stmt)).scalars().first()
    
    # If exists, update; if not, create new
    if existing_record:
        record = existing_record
    else:
        record = PatientResponses(
            file=update_data.file,
            speaker=update_data.speaker
        )
    
    # Update only provided fields (partial update support)
    if update_data.answer_1 is not None:
        record.answer_1 = update_data.answer_1
    if update_data.answer_2 is not None:
        record.answer_2 = update_data.answer_2
    if update_data.answer_3 is not None:
        record.answer_3 = update_data.answer_3
    if update_data.answer_4 is not None:
        record.answer_4 = update_data.answer_4
    if update_data.answer_5 is not None:
        record.answer_5 = update_data.answer_5
    
    db.add(record)
    await db.commit()
    await db.refresh(record)
    
    return {
        "file": record.file,
        "speaker": record.speaker,
        "answers": {
            "answer_1": record.answer_1,
            "answer_2": record.answer_2,
            "answer_3": record.answer_3,
            "answer_4": record.answer_4,
            "answer_5": record.answer_5
        }
    }


# ──────────────────────────────────────────────────────────────────────────────
# REDCap Integration
# ──────────────────────────────────────────────────────────────────────────────

# Load REDCap configuration from environment variables
REDCAP_API_URL = os.getenv("REDCAP_API_URL")  # e.g., https://redcap.csmc.edu/api/
REDCAP_API_TOKEN = os.getenv("REDCAP_API_TOKEN")  # 32-character token from REDCap

class RedcapImportRequest(BaseModel):
    """Records to import into REDCap"""
    records: List[Dict[str, Any]]  # List of records to import
    overwrite: Optional[str] = "normal"  # normal, overwrite
    return_content: Optional[str] = "count"  # count, ids, auto_ids

@router.post("/api/redcap/import")
async def import_to_redcap(
    request_data: RedcapImportRequest,
    user: AuthUser = Depends(get_current_user)
):
    """Import records to REDCap project"""
    print("=" * 80)
    print("🔍 DEBUG [import_to_redcap] - Input Data:")
    print(f"   Number of records: {len(request_data.records)}")
    print(f"   overwrite: {request_data.overwrite}")
    print(f"   return_content: {request_data.return_content}")
    
    if not REDCAP_API_URL or not REDCAP_API_TOKEN:
        print("   ❌ ERROR: REDCap API configuration missing")
        print("=" * 80)
        raise HTTPException(
            status_code=500,
            detail="REDCap API configuration missing"
        )
    
    payload = {
        'token': REDCAP_API_TOKEN,
        'content': 'record',
        'format': 'json',
        'type': 'flat',
        'overwriteBehavior': request_data.overwrite,
        'returnContent': request_data.return_content,
        'returnFormat': 'json',
        'data': json.dumps(request_data.records)
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(REDCAP_API_URL, data=payload)
    
    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"REDCap API error: {response.text}"
        )
    
    return {
        "status": "success",
        "redcap_response": response.json()
    }

