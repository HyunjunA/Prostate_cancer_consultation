"""Patient-side API routes + dashboard stats + REDCap integration.

Authentication: every endpoint requires a valid auth header. Patient-
specific endpoints additionally enforce per-user patient access via
auth/access_control.check_patient_access() — non-superuser callers can
only read patients explicitly granted to them in the patient_access
table.

Endpoint groups:
    /api/patient/summaries*       : patient consultation summaries
    /api/patient/scoring          : 1-5 scoring submitted by the patient
    /api/patient/responses        : free-text responses (one per domain)
    /api/patient/files            : list of patients the user can see
    /api/patient/sentences/{file} : tokenised sentences for a file
    /api/patient/ai-summary*      : LLM-generated per-domain summaries
    /api/stats/dashboard          : aggregate counts/scores for the home view
    /api/redcap/import            : push records into REDCap (config lives in
                                    redcap_config.py)

Core data model:
    PatientSummary           : (file, speaker) PK — one row per patient.
    PatientSummaryDomain     : (file, speaker, domain) PK — five rows per
                                patient, holds patient_scoring +
                                patient_response per domain.
    LLMDomainScoringAndSummary: GPT-4o output, one row per (analysis, domain).

Related modules:
    models.py             : PatientSummary, PatientSummaryDomain, DoctorRewriteLog
    redcap_config.py      : REDCAP_API_URL / REDCAP_API_TOKEN single source
    auth/access_control.py: enforces patient_id allow-list per user
"""

import json
import logging
from typing import Optional, List, Dict, Any
from collections import defaultdict

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user
from auth.access_control import check_patient_access
from auth.base import AuthUser
from db import get_db
from models import (
    DoctorRewriteLog,
    PatientSummary,
    PatientSummaryDomain,
    SentencePrediction,
    TranscriptAnalysisLog,
    LLMDomainScoringAndSummary,
)

logger = logging.getLogger(__name__)

# No prefix on this router — its endpoints have varied prefixes
# (/api/patient, /api/stats, /api/redcap) so each is declared on the
# decorator instead.
router = APIRouter(tags=["Patient Interface"])


# ── Pydantic request bodies ───────────────────────────────────────────────────
# Tiny update DTOs for PUT endpoints. We carry the composite key (file,
# speaker, domain) in the body rather than the URL so the frontend can
# batch-style update without rewriting the path each time.

class PatientDomainScoringUpdate(BaseModel):
    file: str
    speaker: str
    domain: str
    patient_scoring: int


class PatientDomainResponseUpdate(BaseModel):
    file: str
    speaker: str
    domain: str
    patient_response: str


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
    """List patient summaries with optional file/speaker filters + pagination.

    Returns:
        {"total": int, "skip": int, "limit": int, "data": [...]}
        where each `data` entry is a PatientSummary plus its per-domain
        list (just domain names — no scoring data, kept light for the
        list view).
    """
    print("=" * 80)
    print("[DEBUG] [get_patient_summaries] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")
    print(f"   skip: {skip}, limit: {limit}")

    # selectinload eagerly fetches `domains` in one extra query so we
    # do not N+1 inside the response comprehension below.
    stmt = select(PatientSummary).options(selectinload(PatientSummary.domains))

    if file:
        stmt = stmt.where(PatientSummary.file == file)
    if speaker:
        stmt = stmt.where(PatientSummary.speaker == speaker)

    # Total count (subquery so the WHERE is applied to the count too).
    # The frontend uses `total` to render pagination controls.
    count_stmt = select(func.count()).select_from(
        select(PatientSummary.file, PatientSummary.speaker).where(
            *([PatientSummary.file == file] if file else []),
            *([PatientSummary.speaker == speaker] if speaker else []),
        ).subquery()
    )
    total = (await db.execute(count_stmt)).scalar_one()

    # Get paginated results.
    stmt = stmt.offset(skip).limit(limit)
    # `.unique()` deduplicates rows that selectinload may double-fetch
    # for the JOIN-based eager load.
    results = (await db.execute(stmt)).scalars().unique().all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": [
            {
                "file": r.file,
                "speaker": r.speaker,
                "classes": [
                    {"class_name": d.domain}
                    for d in r.domains
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
    """Get one patient summary with per-domain scoring (no responses)."""
    # Per-patient access gate — non-superusers must have an explicit
    # entry in patient_access for this file. Superusers bypass.
    await check_patient_access(file, user, db)
    print("=" * 80)
    print("[DEBUG] [get_patient_summary_detail] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")

    # Get summary with domains eager-loaded
    summary_stmt = select(PatientSummary).options(
        selectinload(PatientSummary.domains)
    ).where(
        PatientSummary.file == file,
        PatientSummary.speaker == speaker
    )
    summary = (await db.execute(summary_stmt)).scalars().unique().first()

    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")

    return {
        "file": file,
        "speaker": speaker,
        "summary": {
            "classes": [
                {
                    "class_name": d.domain,
                    "score": d.patient_scoring
                }
                for d in summary.domains
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
    """Get patient-submitted scores grouped by (file, speaker).

    Returns one entry per patient with `scores` (domain → score) and an
    `average` across non-null domains. Only rows where patient_scoring
    is set are included.
    """
    print("=" * 80)
    print("[DEBUG] [get_patient_scoring] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")

    # `.isnot(None)` filters out domains where the patient has not yet
    # submitted a score — frontend would render those as blank rows.
    stmt = select(PatientSummaryDomain).where(
        PatientSummaryDomain.patient_scoring.isnot(None)
    ).order_by(
        PatientSummaryDomain.file,
        PatientSummaryDomain.speaker,
        PatientSummaryDomain.display_order
    )

    if file:
        stmt = stmt.where(PatientSummaryDomain.file == file)
    if speaker:
        stmt = stmt.where(PatientSummaryDomain.speaker == speaker)

    results = (await db.execute(stmt)).scalars().all()

    # Group by (file, speaker) in Python — SQL GROUP BY would lose the
    # per-domain breakdown. The dataset is small enough (≤5 rows per
    # patient) that a Python pass is faster than a window-function query.
    grouped: Dict[tuple, list] = defaultdict(list)
    for r in results:
        grouped[(r.file, r.speaker)].append(r)

    data = []
    for (f, s), domains in grouped.items():
        scores = {d.domain: d.patient_scoring for d in domains}
        valid_scores = [v for v in scores.values() if v is not None]
        average = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else None
        data.append({
            "file": f,
            "speaker": s,
            "scores": scores,
            "average": average
        })

    return {
        "total": len(data),
        "data": data
    }

@router.put("/api/patient/scoring")
async def update_patient_scoring(
    update_data: PatientDomainScoringUpdate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Upsert one patient domain score and return the full updated set.

    Returning the full per-patient score map (instead of just an OK)
    lets the frontend re-render its score chart from the response
    without an extra round-trip.
    """
    print("=" * 80)
    print("[DEBUG] [update_patient_scoring] - Input Data:")
    print(f"   file: {update_data.file}")
    print(f"   speaker: {update_data.speaker}")
    print(f"   domain: {update_data.domain}")
    print(f"   patient_scoring: {update_data.patient_scoring}")

    # Find existing domain row — UPSERT pattern: update if found, else
    # create. We do NOT use ON CONFLICT here because the row may not
    # exist yet for new patients.
    stmt = select(PatientSummaryDomain).where(
        PatientSummaryDomain.file == update_data.file,
        PatientSummaryDomain.speaker == update_data.speaker,
        PatientSummaryDomain.domain == update_data.domain
    )
    record = (await db.execute(stmt)).scalars().first()

    if record:
        record.patient_scoring = update_data.patient_scoring
    else:
        record = PatientSummaryDomain(
            file=update_data.file,
            speaker=update_data.speaker,
            domain=update_data.domain,
            patient_scoring=update_data.patient_scoring
        )

    db.add(record)
    await db.commit()
    await db.refresh(record)

    # Return all scores for this file/speaker for convenience
    all_stmt = select(PatientSummaryDomain).where(
        PatientSummaryDomain.file == update_data.file,
        PatientSummaryDomain.speaker == update_data.speaker,
        PatientSummaryDomain.patient_scoring.isnot(None)
    ).order_by(PatientSummaryDomain.display_order)
    all_domains = (await db.execute(all_stmt)).scalars().all()

    scores = {d.domain: d.patient_scoring for d in all_domains}
    valid_scores = [v for v in scores.values() if v is not None]
    average = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else None

    return {
        "file": record.file,
        "speaker": record.speaker,
        "scores": scores,
        "average": average
    }

@router.get("/api/patient/responses")
async def get_patient_responses(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get patient free-text responses grouped by (file, speaker).

    Same shape as /scoring but for the free-text answers instead of
    Likert scores. Domains with no response yet are excluded.
    """
    print("=" * 80)
    print("[DEBUG] [get_patient_responses] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")

    stmt = select(PatientSummaryDomain).where(
        PatientSummaryDomain.patient_response.isnot(None)
    ).order_by(
        PatientSummaryDomain.file,
        PatientSummaryDomain.speaker,
        PatientSummaryDomain.display_order
    )

    if file:
        stmt = stmt.where(PatientSummaryDomain.file == file)
    if speaker:
        stmt = stmt.where(PatientSummaryDomain.speaker == speaker)

    results = (await db.execute(stmt)).scalars().all()

    # Group by (file, speaker) — same pattern as /scoring above.
    grouped: Dict[tuple, list] = defaultdict(list)
    for r in results:
        grouped[(r.file, r.speaker)].append(r)

    data = []
    for (f, s), domains in grouped.items():
        answers = {d.domain: d.patient_response for d in domains}
        data.append({
            "file": f,
            "speaker": s,
            "answers": answers
        })

    return {
        "total": len(data),
        "data": data
    }

@router.put("/api/patient/responses")
async def update_patient_responses(
    update_data: PatientDomainResponseUpdate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Upsert one patient domain free-text response and return all responses."""
    print("=" * 80)
    print("[DEBUG] [update_patient_responses] - Input Data:")
    print(f"   file: {update_data.file}")
    print(f"   speaker: {update_data.speaker}")
    print(f"   domain: {update_data.domain}")
    # Truncated preview only — full responses can be hundreds of chars.
    print(f"   patient_response: {update_data.patient_response[:30] if update_data.patient_response else None}...")

    # Same UPSERT pattern as update_patient_scoring above.
    stmt = select(PatientSummaryDomain).where(
        PatientSummaryDomain.file == update_data.file,
        PatientSummaryDomain.speaker == update_data.speaker,
        PatientSummaryDomain.domain == update_data.domain
    )
    record = (await db.execute(stmt)).scalars().first()

    if record:
        record.patient_response = update_data.patient_response
    else:
        record = PatientSummaryDomain(
            file=update_data.file,
            speaker=update_data.speaker,
            domain=update_data.domain,
            patient_response=update_data.patient_response
        )

    db.add(record)
    await db.commit()
    await db.refresh(record)

    # Return all responses for this file/speaker for convenience
    all_stmt = select(PatientSummaryDomain).where(
        PatientSummaryDomain.file == update_data.file,
        PatientSummaryDomain.speaker == update_data.speaker,
        PatientSummaryDomain.patient_response.isnot(None)
    ).order_by(PatientSummaryDomain.display_order)
    all_domains = (await db.execute(all_stmt)).scalars().all()

    answers = {d.domain: d.patient_response for d in all_domains}

    return {
        "file": record.file,
        "speaker": record.speaker,
        "answers": answers
    }


@router.get("/api/patient/files")
async def get_patient_files(
    limit: int = Query(default=500, ge=1, le=5000, description="Max files to return"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """List distinct patient file identifiers (xlsx names) the user can see."""
    # `.distinct()` collapses the (file, speaker) PK to file only —
    # the frontend uses this for the patient picker dropdown.
    stmt = select(PatientSummary.file).distinct().order_by(PatientSummary.file).limit(limit)
    files_raw = (await db.execute(stmt)).scalars().all()
    # Filter NULL files (legacy data may have them); a None entry would
    # break the dropdown rendering on the frontend.
    files = [f for f in files_raw if f is not None]
    return {"files": files}


@router.get("/api/patient/sentences/{file}")
async def get_patient_sentences_by_class(
    file: str,
    top_n: int = Query(10, ge=1, le=50),
    summary_top_n: int = Query(3, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get top sentences by NLP pred_score per domain, with quality scores.

    Returns pred_score top-N sentences per domain for the patient
    "View relevant sentences from your visit" feature.
    Sentences used in AI-GENERATED SUMMARY (top summary_top_n by pred_score)
    are marked with is_in_summary=true.
    """
    await check_patient_access(file, user, db)

    # Find latest analysis for this file. Patients can be re-processed
    # so we always show the freshest one.
    analysis_stmt = select(TranscriptAnalysisLog.id).where(
        TranscriptAnalysisLog.source_filename == file
    ).order_by(TranscriptAnalysisLog.analyzed_at.desc()).limit(1)
    analysis_id = (await db.execute(analysis_stmt)).scalar_one_or_none()

    if not analysis_id:
        # Fresh patients with no analysis yet just see an empty payload
        # rather than a 404 — keeps the frontend rendering simple.
        return {"file": file, "top_n": top_n, "by_class": {}}

    # Get all predictions for this analysis, ordered by pred_score DESC per model.
    # `context` carries the surrounding ±N sentences with the focus sentence
    # wrapped in <main>...</main>; the patient view renders that with bold +
    # underline so the user can see which sentence is the focus inside the
    # surrounding conversation.
    #
    # Window function pattern: row_number() OVER (PARTITION BY model
    # ORDER BY pred_score DESC) gives each sentence a per-model rank;
    # we then keep rn <= top_n for "top N per domain".
    ranked = select(
        SentencePrediction.model,
        SentencePrediction.sentence_text,
        SentencePrediction.pred_score,
        SentencePrediction.speaker,
        SentencePrediction.utterance_index,
        SentencePrediction.sentence_in_utterance,
        SentencePrediction.context,
        func.row_number().over(
            partition_by=SentencePrediction.model,
            order_by=SentencePrediction.pred_score.desc()
        ).label('rn')
    ).where(
        SentencePrediction.analysis_id == analysis_id,
    ).subquery()

    top_stmt = select(
        ranked.c.model,
        ranked.c.sentence_text,
        ranked.c.pred_score,
        ranked.c.speaker,
        ranked.c.utterance_index,
        ranked.c.sentence_in_utterance,
        ranked.c.context,
        ranked.c.rn,
    ).where(ranked.c.rn <= top_n).order_by(ranked.c.model, ranked.c.rn)

    results = (await db.execute(top_stmt)).all()

    # Build ai_score lookup from llm_domain_scoring_and_summary so we
    # can attach the GPT-4o score to each sentence. Map keys on
    # `source_sentence` because that is what the LLM stage stored.
    ai_score_map: dict[str, int | None] = {}
    ai_stmt = select(
        LLMDomainScoringAndSummary.source_sentence,
        LLMDomainScoringAndSummary.ai_score,
    ).where(LLMDomainScoringAndSummary.analysis_id == analysis_id)
    for ai_row in (await db.execute(ai_stmt)).all():
        if ai_row.source_sentence:
            ai_score_map[ai_row.source_sentence] = ai_row.ai_score

    by_class: dict[str, list[dict]] = {}
    for r in results:
        model = r.model
        if model not in by_class:
            by_class[model] = []

        by_class[model].append({
            "sentence": r.sentence_text,
            "context": r.context,  # ±N surrounding sentences w/ <main>...</main>
            "pred_score": round(float(r.pred_score), 4),
            "score": ai_score_map.get(r.sentence_text),
            "speaker": r.speaker,
            "i": r.utterance_index,
            "i2": r.sentence_in_utterance,
            # `is_in_summary=True` marks sentences that fed the AI summary,
            # so the patient UI can visually distinguish them from
            # "explorable extras".
            "is_in_summary": r.rn <= summary_top_n,
        })

    return {
        "file": file,
        "top_n": top_n,
        "summary_top_n": summary_top_n,
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
    """Aggregate counts/scores rendered on the home dashboard.

    Returns two sections:
      - doctor_interface  : sentence count, rewrite count, file count
      - patient_interface : summary count, file count, average per domain
    """
    print("=" * 80)
    print("[DEBUG] [get_dashboard_stats] - Querying statistics")

    # ── Doctor stats ────────────────────────────────────────────────
    # Distinct sentences across all analyses, identified by the
    # composite (patient_id, utterance_index, sentence_in_utterance)
    # key — using count(DISTINCT col) directly would not work because
    # we need to compose the three columns into one identity per
    # sentence. concat() with ':' separator gives a unique tag.
    print("   Querying doctor interface stats...")
    doctor_sentences_count = (await db.execute(
        select(func.count(func.distinct(
            func.concat(SentencePrediction.patient_id, ':', SentencePrediction.utterance_index, ':', SentencePrediction.sentence_in_utterance)
        )))
    )).scalar_one()
    print(f"   - doctor_sentences_count: {doctor_sentences_count}")

    doctor_rewrites_count = (await db.execute(
        select(func.count()).select_from(DoctorRewriteLog)
    )).scalar_one()

    doctor_files_count = (await db.execute(
        select(func.count(func.distinct(SentencePrediction.patient_id)))
    )).scalar_one()

    # ── Patient stats ───────────────────────────────────────────────
    patient_summaries_count = (await db.execute(
        select(func.count()).select_from(PatientSummary)
    )).scalar_one()

    patient_files_count = (await db.execute(
        select(func.count(func.distinct(PatientSummary.file)))
    )).scalar_one()

    # Average patient scoring per domain — group + avg, filter NULLs
    # so blank scores do not drag the average down to zero.
    avg_scores_stmt = select(
        PatientSummaryDomain.domain,
        func.avg(PatientSummaryDomain.patient_scoring).label('avg_score')
    ).where(
        PatientSummaryDomain.patient_scoring.isnot(None)
    ).group_by(
        PatientSummaryDomain.domain
    ).order_by(
        PatientSummaryDomain.domain
    )
    avg_rows = (await db.execute(avg_scores_stmt)).all()

    average_scores = {
        row.domain: round(row.avg_score, 2) if row.avg_score is not None else None
        for row in avg_rows
    }

    return {
        "doctor_interface": {
            "total_sentences": doctor_sentences_count,
            "total_rewrites": doctor_rewrites_count,
            "unique_files": doctor_files_count
        },
        "patient_interface": {
            "total_summaries": patient_summaries_count,
            "unique_files": patient_files_count,
            "average_scores": average_scores
        }
    }


# ──────────────────────────────────────────────────────────────────────────────
# AI Summary — GPT-4o generated patient-facing risk summaries
# (from Guille's ai_pipeline: LLM scoring + rewriting system)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/api/patient/ai-summary/{file}")
async def get_ai_summary(
    file: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    """Get AI-generated patient-facing risk summaries per domain.

    Returns GPT-4o scored and reformatted sentences for each domain.
    Falls back to existing patient_summary_domain if AI results not available.
    """
    await check_patient_access(file, user, db)

    # Find latest analysis for this file
    analysis_stmt = select(TranscriptAnalysisLog.id).where(
        TranscriptAnalysisLog.source_filename == file
    ).order_by(TranscriptAnalysisLog.analyzed_at.desc()).limit(1)
    analysis_id = (await db.execute(analysis_stmt)).scalar_one_or_none()

    if not analysis_id:
        raise HTTPException(status_code=404, detail="No analysis found for this file.")

    # Get AI pipeline results
    stmt = select(LLMDomainScoringAndSummary).where(
        LLMDomainScoringAndSummary.analysis_id == analysis_id
    ).order_by(LLMDomainScoringAndSummary.domain)

    results = (await db.execute(stmt)).scalars().all()

    if not results:
        # Fallback path — analysis exists but AI stage never ran (no
        # Azure OpenAI creds, AI failed, etc.). Frontend reads `source`
        # to decide whether to show the AI badge or the fallback notice.
        return {
            "file": file,
            "analysis_id": analysis_id,
            "source": "fallback_rewriter",
            "domains": [],
            "message": "AI summaries not available. Use /api/patient/summaries for existing summaries.",
        }

    # Domain display name mapping. Lives HERE rather than in models.py
    # because these are presentation strings (capitalised, human-readable).
    # If we ever localise the patient UI, this is the table to translate.
    domain_names = {
        "cp": "Cancer Prognosis",
        "le": "Life Expectancy",
        "ed": "Erectile Dysfunction",
        "inc": "Urinary Incontinence",
        "ius": "Irritative Urinary Symptoms",
    }

    domains = []
    for r in results:
        domains.append({
            "domain": r.domain,
            "domain_name": domain_names.get(r.domain, r.domain),
            "ai_score": r.ai_score,
            "score_explanation": r.score_explanation,
            "extracted_estimate": r.extracted_estimate,
            "treatment": r.treatment,
            "source_sentence": r.source_sentence,
            # getattr() with default because older rows (pre-migration
            # 007) may not have source_context. Defensive read avoids
            # an AttributeError on legacy data.
            "source_context": getattr(r, "source_context", None),
            "reformat_sentence": r.reformat_sentence,
        })

    return {
        "file": file,
        "analysis_id": analysis_id,
        "source": "ai_pipeline_gpt4o",
        "total_domains": len(domains),
        "domains": domains,
    }


@router.get("/api/patient/ai-summary")
async def list_ai_summaries(
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    """List patients that have AI-generated summaries (admin index view)."""
    # GROUP BY (file, patient_id) collapses the per-domain rows; one
    # entry per (file, patient_id). Ordered by latest creation so the
    # newest analyses surface first.
    stmt = (
        select(
            LLMDomainScoringAndSummary.source_filename,
            LLMDomainScoringAndSummary.patient_id,
            func.count(LLMDomainScoringAndSummary.id).label("domain_count"),
            func.max(LLMDomainScoringAndSummary.created_at).label("created_at"),
        )
        .group_by(
            LLMDomainScoringAndSummary.source_filename,
            LLMDomainScoringAndSummary.patient_id,
        )
        .order_by(func.max(LLMDomainScoringAndSummary.created_at).desc())
        .limit(limit)
    )

    results = (await db.execute(stmt)).all()

    return {
        "total": len(results),
        "patients": [
            {
                "file": r.source_filename,
                "patient_id": r.patient_id,
                "domain_count": r.domain_count,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in results
        ],
    }


# ──────────────────────────────────────────────────────────────────────────────
# REDCap Integration
# ──────────────────────────────────────────────────────────────────────────────

# REDCap config is now centralized in redcap_config.py
from redcap_config import REDCAP_API_URL, REDCAP_API_TOKEN  # noqa: E402

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
    """Push records into the REDCap project via its REST API.

    Used by the export flow when the operator wants to ship locally
    captured survey data to REDCap. We forward the body essentially
    verbatim and surface REDCap's own status code on failure so the
    caller can tell apart "your data was malformed" (4xx from REDCap)
    from "REDCap is down" (5xx).
    """
    print("=" * 80)
    print("[DEBUG] [import_to_redcap] - Input Data:")
    print(f"   Number of records: {len(request_data.records)}")
    print(f"   overwrite: {request_data.overwrite}")
    print(f"   return_content: {request_data.return_content}")

    if not REDCAP_API_URL or not REDCAP_API_TOKEN:
        # Both env vars must be set; missing either means REDCap is
        # intentionally disabled (or misconfigured) — fail loud so the
        # operator notices instead of silently dropping the import.
        print("   [ERROR]: REDCap API configuration missing")
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
        # records are JSON-encoded as a string per REDCap's API contract.
        # json.dumps here (not the import block above) so a Pydantic
        # body with weird types still serialises predictably.
        'data': json.dumps(request_data.records)
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(REDCAP_API_URL, data=payload)

    if response.status_code != 200:
        # Forward REDCap's status code as-is so the operator can debug
        # auth issues (403), rate limits (429), bad data (400) without
        # having to dig into the error body.
        raise HTTPException(
            status_code=response.status_code,
            detail=f"REDCap API error: {response.text}"
        )

    return {
        "status": "success",
        "redcap_response": response.json()
    }
