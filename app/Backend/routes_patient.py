"""Patient-side API routes + dashboard stats + REDCap integration.

Authentication: every endpoint requires a valid auth header. Patient-
specific endpoints additionally enforce per-user patient access via
auth/access_control.check_patient_access() — non-superuser callers can
only read patients explicitly granted to them in the patient_access
table.

Endpoint groups:
    /api/patient/summaries*       : patient consultation summaries
    /api/patient/files            : list of patients the user can see
    /api/patient/sentences/{file} : tokenised sentences for a file
    /api/patient/ai-summary*      : LLM-generated per-domain summaries
    /api/stats/dashboard          : aggregate counts/scores for the home view
    /api/redcap/import            : push records into REDCap (config lives in
                                    redcap_config.py)

Core data model:
    PatientSummary           : (file, speaker) PK — one row per patient.
    PatientSummaryDomain     : (file, speaker, domain) PK — five rows per
                                patient (per-domain identity / display order).
    LLMDomainScoringAndSummary: GPT-4o output, one row per (analysis, domain).

Related modules:
    models.py             : PatientSummary, PatientSummaryDomain, DoctorRewriteLog
    redcap_config.py      : REDCAP_API_URL / REDCAP_API_TOKEN single source
    auth/access_control.py: enforces patient_id allow-list per user
"""

import json
import logging
from typing import Optional, List, Dict, Any, Literal, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user
from auth.access_control import check_patient_access
from auth.base import AuthUser
from db import get_db
from models import (
    DoctorRewriteLog,
    PatientFirstVisitAnswer,
    PatientSummary,
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

# ── Shared first-visit domain constants ───────────────────────────────────────
# DomainLiteral + the per-domain factor whitelist are shared by the first-visit
# ANSWERS endpoints below. (The old fixed-column "responses" endpoints and their
# patient_first_visit_responses table were dropped in migration 020.)

DomainLiteral = Literal["cp", "le", "ed", "inc", "ius"]

_FACTOR_WHITELIST: Dict[str, set[str]] = {
    "le":  {"Tumor grade", "Age", "Marital status",
            "Health conditions or comorbidities", "Tumor stage"},
    "ed":  {"Tumor grade", "Age", "Tumor stage",
            "Health conditions or comorbidities", "Baseline function"},
    "inc": {"Tumor grade", "Age", "Tumor stage",
            "Health conditions or comorbidities", "Baseline function"},
    "ius": {"Tumor grade", "Age", "Tumor stage",
            "Health conditions or comorbidities", "Baseline function"},
}


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
                {"class_name": d.domain}
                for d in summary.domains
            ]
        }
    }


@router.get("/api/patient/files")
async def get_patient_files(
    limit: int = Query(default=500, ge=1, le=5000, description="Max files to return"),
    doctor_id: Optional[str] = Query(default=None, description="Scope to one doctor (NULL rows excluded when set)"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """List distinct patient file identifiers (xlsx names) the user can see."""
    # `.distinct()` collapses the (file, speaker) PK to file only —
    # the frontend uses this for the patient picker dropdown.
    stmt = select(PatientSummary.file)
    # When a doctor is selected, scope the list to files processed for that
    # doctor by joining the run header (source_filename == PatientSummary.file).
    if doctor_id:
        stmt = stmt.join(
            TranscriptAnalysisLog,
            TranscriptAnalysisLog.source_filename == PatientSummary.file,
        ).where(TranscriptAnalysisLog.doctor_id == doctor_id)
    stmt = stmt.distinct().order_by(PatientSummary.file).limit(limit)
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
    # Key on (source_sentence, domain): a sentence can represent more than one
    # domain, so a text-only key would let one domain's score overwrite another's.
    ai_score_map: dict[tuple[str, str], int | None] = {}
    ai_stmt = select(
        LLMDomainScoringAndSummary.source_sentence,
        LLMDomainScoringAndSummary.domain,
        LLMDomainScoringAndSummary.ai_score,
    ).where(LLMDomainScoringAndSummary.analysis_id == analysis_id)
    for ai_row in (await db.execute(ai_stmt)).all():
        if ai_row.source_sentence:
            ai_score_map[(ai_row.source_sentence, ai_row.domain)] = ai_row.ai_score

    by_class: dict[str, list[dict]] = {}
    for r in results:
        model = r.model
        if model not in by_class:
            by_class[model] = []

        by_class[model].append({
            "sentence": r.sentence_text,
            "context": r.context,  # ±N surrounding sentences w/ <main>...</main>
            "pred_score": round(float(r.pred_score), 4),
            "score": ai_score_map.get((r.sentence_text, model)),
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

    # Patient per-domain scoring was removed (dropped columns) — the patient
    # rating feature is no longer collected. Kept as an empty map for API
    # backward-compatibility with the dashboard consumer.
    average_scores: Dict[str, Any] = {}

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


# Domain order shared by the first-visit ANSWERS endpoints below.
_DOMAIN_ORDER: List[str] = ["cp", "le", "ed", "inc", "ius"]


# ──────────────────────────────────────────────────────────────────────────────
# First-visit ANSWERS — row-per-question (question_id). Table:
# patient_first_visit_answer (migration 014). The active first-visit page (V41)
# uses these. (The old fixed-column "responses" table + endpoints were dropped
# in migration 020.)
# ──────────────────────────────────────────────────────────────────────────────

FieldLiteral = Literal["vas", "timeline", "factors"]


class AnswerItem(BaseModel):
    """One question's answer. `value` is interpreted per `field`."""

    question_id: str = Field(..., min_length=1, max_length=100)
    field: FieldLiteral
    # vas -> int 0-100, timeline -> str, factors -> list[str]. Stored as JSONB.
    value: Any = None

    @field_validator("value")
    @classmethod
    def _value_matches_field(cls, v, info):
        field = info.data.get("field")
        if field == "vas":
            if not isinstance(v, int) or isinstance(v, bool) or not (0 <= v <= 100):
                raise ValueError("vas value must be an int in 0..100")
        elif field == "timeline":
            if not isinstance(v, str) or len(v) > 50:
                raise ValueError("timeline value must be a string (<=50 chars)")
        elif field == "factors":
            if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
                raise ValueError("factors value must be a list of strings")
        return v


class FirstVisitAnswersUpsert(BaseModel):
    """Body for PUT /api/patient/first-visit-answers — one domain's answers."""

    file: str = Field(..., min_length=1, max_length=255)
    speaker: str = Field(..., min_length=1, max_length=100)
    domain: DomainLiteral
    answers: List[AnswerItem] = Field(..., min_length=1, max_length=50)

    @field_validator("answers")
    @classmethod
    def _factors_match_domain(cls, answers, info):
        domain = info.data.get("domain")
        for a in answers:
            if a.field == "factors":
                if domain == "cp":
                    raise ValueError("cp domain does not support factors")
                allowed = _FACTOR_WHITELIST.get(domain, set())
                invalid = [f for f in (a.value or []) if f not in allowed]
                if invalid:
                    raise ValueError(f"invalid factors for {domain}: {invalid}")
        return answers


class AnswerRead(BaseModel):
    """One persisted answer row."""

    question_id: str
    field: str
    value: Any
    submitted_at: str  # ISO8601


class FirstVisitAnswersGet(BaseModel):
    """GET response — answers nested by domain, then by question_id.

    All five domain keys are always present (empty dict if nothing submitted
    for that domain) so the frontend can index directly.
    """

    responses: Dict[DomainLiteral, Dict[str, AnswerRead]]


@router.get(
    "/api/patient/first-visit-answers/{file}/{speaker}",
    response_model=FirstVisitAnswersGet,
)
async def get_first_visit_answers(
    file: str,
    speaker: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    """Return all first-visit answers for one patient, nested domain -> question_id."""
    await check_patient_access(file, user, db)

    stmt = select(PatientFirstVisitAnswer).where(
        PatientFirstVisitAnswer.file == file,
        PatientFirstVisitAnswer.speaker == speaker,
    )
    rows = (await db.execute(stmt)).scalars().all()

    by_domain: Dict[str, Dict[str, AnswerRead]] = {d: {} for d in _DOMAIN_ORDER}
    for row in rows:
        by_domain.setdefault(row.domain, {})[row.question_id] = AnswerRead(
            question_id=row.question_id,
            field=row.field,
            value=row.value,
            submitted_at=row.submitted_at.isoformat(),
        )
    return FirstVisitAnswersGet(responses=by_domain)


# ──────────────────────────────────────────────────────────────────────────────
# First-visit answers -> REDCap "post_risk_perception_2" sync
# ──────────────────────────────────────────────────────────────────────────────
# The first-visit page (PatientInitialVisitReportV38) collects the same 14
# inputs that the REDCap "post_risk_perception_2" instrument stores, but the two
# systems use different identifiers:
#   - domain codes differ:  inc -> ui,  ius -> il  (cp/le/ed are identical)
#   - radio / factor answers are stored as TEXT here but as numeric CHOICE CODES
#     in REDCap.
# This block translates at the boundary so neither side has to be renamed.

# question_id -> REDCap field name. The domain-name differences (inc->ui,
# ius->il) are absorbed here, so no prefix arithmetic is needed elsewhere.
_FV_QUESTION_TO_REDCAP_FIELD: Dict[str, str] = {
    "cp_risk_without_treatment": "cp_1_rp_v2",
    "cp_risk_with_treatment":    "cp_2_rp_v2",
    "cp_timeline":               "cp_3_rp_v2",
    "le_timeline":               "le_1_rp_v2",
    "le_factors":                "le_2_rp_v2",
    "ed_baseline_return":        "ed_1_rp_v2",
    "ed_timeline":               "ed_2_rp_v2",
    "ed_factors":                "ed_3_rp_v2",
    "inc_risk":                  "ui_1_rp_v2",
    "inc_timeline":              "ui_2_rp_v2",
    "inc_factors":               "ui_3_rp_v2",
    "ius_risk":                  "il_1_rp_v2",
    "ius_timeline":              "il_2_rp_v2",
    "ius_factors":               "il_3_rp_v2",
}

# timeline TEXT -> REDCap choice code. Order matches the live REDCap
# instrument's choice order exactly (verified against project PID 14791).
_FV_TIMELINE_CODES: Dict[str, Dict[str, str]] = {
    "cp_timeline": {
        "Over my lifetime": "1",
        "Over next 5 years": "2",
        "Over next 5-10 years": "3",
        "Over next 11-15 years": "4",
        "Over next 16-20 years": "5",
        "Over next 20-30 years": "6",
    },
    "le_timeline": {
        "Less than 5 years": "1",
        "5-10 years": "2",
        "11-15 years": "3",
        "16-20 years": "4",
        "More than 20 years": "5",
    },
    "ed_timeline": {
        "3 months after treatment": "1",
        "6 months after treatment": "2",
        "12 months after treatment": "3",
        "24 months after treatment": "4",
        "Lifetime": "5",
    },
    "inc_timeline": {
        "3 months": "1",
        "6 months": "2",
        "9 months": "3",
        "1 year": "4",
        "2 years": "5",
    },
    "ius_timeline": {
        "1 month": "1",
        "3-6 months": "2",
        "1 year": "3",
        "2 years": "4",
        "Lifetime": "5",
    },
}

# factor TEXT -> REDCap choice code. le has its own option set; ed/inc/ius share
# one. factors is a multi-select: every selected factor is sent to REDCap using
# the checkbox import format `field___<code>` = "1" (see _fv_answer_to_redcap).
# The REDCap target field must be a CHECKBOX for this format to be accepted.
_FV_FACTOR_CODES: Dict[str, Dict[str, str]] = {
    "le_factors": {
        "Tumor grade": "1",
        "Age": "2",
        "Marital status": "3",
        "Health conditions or comorbidities": "4",
        "Tumor stage": "5",
    },
    "ed_factors": {
        "Tumor grade": "1",
        "Age": "2",
        "Tumor stage": "3",
        "Health conditions or comorbidities": "4",
        "Baseline function": "5",
    },
}
_FV_FACTOR_CODES["inc_factors"] = _FV_FACTOR_CODES["ed_factors"]
_FV_FACTOR_CODES["ius_factors"] = _FV_FACTOR_CODES["ed_factors"]

# REDCap's auto-generated form-complete status field for the risk_perception_2
# instrument. The project's instrument is named `risk_perception_2` (NOT
# `post_risk_perception_2`), so its complete field is `risk_perception_2_complete`.
# Using the wrong name made REDCap reject the entire first-visit record (HTTP 400).
_REDCAP_POST_RISK_2_COMPLETE_FIELD = "risk_perception_2_complete"


def _fv_answer_to_redcap(question_id: str, field: str, value: Any) -> List[Tuple[str, str]]:
    """Translate one first-visit answer into REDCap (field, value) pairs.

    Returns a list of (redcap_field, redcap_value) pairs:
      - vas / timeline map to a single pair.
      - a multi-select "factors" answer maps to ONE pair per selected factor,
        using REDCap's checkbox import format (``field___<code>`` = "1").

    Returns [] when the answer cannot/should not be synced: an unmapped
    question_id, a blank value, or a text option missing from the code table.

    NOTE: the factors branch requires the REDCap target field to be a CHECKBOX.
    A single radio field rejects the ``field___<code>`` import format.
    """
    redcap_field = _FV_QUESTION_TO_REDCAP_FIELD.get(question_id)
    if not redcap_field:
        return []

    if field == "vas":
        if value is None:
            return []
        return [(redcap_field, str(int(value)))]

    if field == "timeline":
        code = _FV_TIMELINE_CODES.get(question_id, {}).get(value)
        return [(redcap_field, code)] if code else []

    if field == "factors":
        # UI multi-select -> REDCap checkbox: one `field___<code>` = "1" per
        # selected factor. Unknown options are skipped.
        if not isinstance(value, list):
            return []
        codes = _FV_FACTOR_CODES.get(question_id, {})
        pairs: List[Tuple[str, str]] = []
        for factor in value:
            code = codes.get(factor)
            if code:
                pairs.append((f"{redcap_field}___{code}", "1"))
        return pairs

    return []


async def _sync_first_visit_answers_to_redcap(record_id: str, answers) -> None:
    """Best-effort mirror of one domain's first-visit answers into the REDCap
    'post_risk_perception_2' instrument.

    Never raises: REDCap being down or misconfigured must not break the primary
    DB write. record_id matches the existing survey flow, which uses the patient
    'speaker' as the REDCap record identifier.
    """
    if not (REDCAP_API_URL and REDCAP_API_TOKEN):
        logger.info("REDCap not configured; skipping post_risk_perception_2 sync")
        return

    fields: Dict[str, str] = {}
    for a in answers:
        for redcap_field, redcap_value in _fv_answer_to_redcap(a.question_id, a.field, a.value):
            fields[redcap_field] = redcap_value

    if not fields:
        return

    fields[_REDCAP_POST_RISK_2_COMPLETE_FIELD] = "2"  # mark instrument complete (green)
    record = {"record_id": record_id, **fields}
    payload = {
        "token": REDCAP_API_TOKEN,
        "content": "record",
        "format": "json",
        "type": "flat",
        "overwriteBehavior": "normal",
        "returnContent": "count",
        "returnFormat": "json",
        "data": json.dumps([record]),
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(REDCAP_API_URL, data=payload)
        if resp.status_code == 200:
            logger.info(
                "REDCap post_risk_perception_2 sync ok: record_id=%s fields=%s",
                record_id, list(fields.keys()),
            )
        else:
            logger.warning(
                "REDCap post_risk_perception_2 sync failed: record_id=%s status=%s body=%s",
                record_id, resp.status_code, resp.text[:300],
            )
    except Exception as exc:  # noqa: BLE001 - best-effort mirror, never fatal
        logger.warning("REDCap post_risk_perception_2 sync error: %s", exc)


@router.put(
    "/api/patient/first-visit-answers",
    response_model=FirstVisitAnswersGet,
)
async def upsert_first_visit_answers(
    body: FirstVisitAnswersUpsert,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    """Upsert one domain's answers (one row per question_id).

    Called when the patient clicks Submit on a domain card. Each answer is
    upserted by (file, speaker, domain, question_id); re-Submits overwrite the
    matching rows and reset their submitted_at. Returns the full answer set for
    the patient so the caller can refresh its cache.
    """
    await check_patient_access(body.file, user, db)

    for a in body.answers:
        stmt = select(PatientFirstVisitAnswer).where(
            PatientFirstVisitAnswer.file == body.file,
            PatientFirstVisitAnswer.speaker == body.speaker,
            PatientFirstVisitAnswer.domain == body.domain,
            PatientFirstVisitAnswer.question_id == a.question_id,
        )
        record = (await db.execute(stmt)).scalars().first()
        if record:
            record.field = a.field
            record.value = a.value
            record.submitted_at = func.now()
        else:
            db.add(PatientFirstVisitAnswer(
                file=body.file,
                speaker=body.speaker,
                domain=body.domain,
                question_id=a.question_id,
                field=a.field,
                value=a.value,
            ))

    await db.commit()

    # Best-effort mirror to REDCap "post_risk_perception_2" (never breaks the DB
    # write). record_id follows the existing survey flow: the patient 'speaker'.
    await _sync_first_visit_answers_to_redcap(body.speaker, body.answers)

    return await get_first_visit_answers(body.file, body.speaker, db, user)
