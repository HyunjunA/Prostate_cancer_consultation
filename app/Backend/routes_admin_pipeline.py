"""Admin endpoint for verifying pipeline DB storage.

Mirrors the verify_pipeline_db.py CLI as a JSON HTTP endpoint so that:
  - Slack/PagerDuty bots can poll for regressions
  - Managers can confirm pipeline storage integrity from a browser
  - CI smoke tests can hit the endpoint after deploy

Returns 200 with status payload on full pass, 503 on any failure
(monitoring tools treat 5xx as alert-worthy).
"""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.base import AuthUser
from db import get_db
import models as M

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin Pipeline"])


# ── Per-analysis check functions ─────────────────────────────────────────────
async def _check_one_analysis(db: AsyncSession, aid: int) -> Dict[str, Any]:
    """Run all checks for a single analysis_id and return a status dict."""
    log = (await db.execute(
        select(M.TranscriptAnalysisLog).where(M.TranscriptAnalysisLog.id == aid)
    )).scalar_one_or_none()
    if log is None:
        return {"analysis_id": aid, "exists": False, "checks": []}

    checks: List[Dict[str, Any]] = []

    # 1. transcript_analysis_log
    checks.append({
        "name": "transcript_analysis_log_ai_complete",
        "pass": log.processed is True and log.ai_overall_score is not None,
        "observed": {"processed": log.processed, "ai_overall_score": log.ai_overall_score},
    })

    # 2. nlp_pipeline_intermediate
    intermediate = (await db.execute(
        select(M.NLPPipelineIntermediate.step, M.NLPPipelineIntermediate.row_count)
        .where(M.NLPPipelineIntermediate.analysis_id == aid)
    )).all()
    steps = {row.step: row.row_count for row in intermediate}
    expected = {"raw", "filtered", "sentences", "top_by_model"}
    checks.append({
        "name": "nlp_intermediates_jsonb",
        "pass": expected.issubset(steps.keys()) and all(n and n > 0 for n in steps.values()),
        "observed": {"steps": steps, "expected": sorted(expected)},
    })

    # 3. nlp_all_predictions — Bug 1 guard
    pred = (await db.execute(text(
        """
        SELECT count(*) AS total,
               count(pred_cp) AS cp_nn,
               count(pred_le) AS le_nn,
               count(pred_ed) AS ed_nn,
               count(pred_inc) AS inc_nn,
               count(pred_ius) AS ius_nn
        FROM nlp_all_predictions
        WHERE analysis_id = :aid
        """
    ), {"aid": aid})).one()
    nulls = [
        col for col in ("cp_nn", "le_nn", "ed_nn", "inc_nn", "ius_nn")
        if getattr(pred, col) != pred.total
    ]
    checks.append({
        "name": "nlp_step3_predictions_no_null_leak",
        "pass": pred.total > 0 and not nulls,
        "observed": {"total": pred.total, "null_in": nulls},
    })

    # 4. sentence_prediction
    sp = (await db.execute(text(
        """
        SELECT count(*) AS total,
               count(*) FILTER (WHERE context IS NOT NULL AND length(context) > 0) AS with_ctx,
               count(DISTINCT model) AS distinct_models
        FROM sentence_prediction WHERE analysis_id = :aid
        """
    ), {"aid": aid})).one()
    checks.append({
        "name": "nlp_step5_top_with_context",
        "pass": sp.total == 50 and sp.with_ctx == 50 and sp.distinct_models == 5,
        "observed": {"total": sp.total, "with_context": sp.with_ctx, "distinct_models": sp.distinct_models},
    })

    # 5. llm_pipeline_intermediate
    ai = (await db.execute(text(
        """
        SELECT count(*) AS total,
               count(DISTINCT domain) AS distinct_domains,
               count(*) FILTER (WHERE survived_filter) AS survived
        FROM llm_pipeline_intermediate WHERE analysis_id = :aid
        """
    ), {"aid": aid})).one()
    checks.append({
        "name": "ai_intermediates_per_domain",
        "pass": ai.distinct_domains == 5 and ai.total > 0 and ai.survived > 0,
        "observed": {"total": ai.total, "distinct_domains": ai.distinct_domains, "survived": ai.survived},
    })

    # 6. llm_domain_scoring_and_summary
    final_count = (await db.execute(text(
        "SELECT count(*) FROM llm_domain_scoring_and_summary WHERE analysis_id = :aid"
    ), {"aid": aid})).scalar_one()
    checks.append({
        "name": "ai_final_summary_rows",
        "pass": 5 <= final_count <= 25,
        "observed": {"rows": final_count, "expected_range": [5, 25]},
    })

    # 7. patient_summary — Bug 2 guard
    ps_count = (await db.execute(text(
        "SELECT count(*) FROM patient_summary WHERE file = :fn"
    ), {"fn": log.source_filename})).scalar_one()
    checks.append({
        "name": "patient_summary_no_duplicates",
        "pass": ps_count == 1,
        "observed": {"rows_for_file": ps_count, "source_filename": log.source_filename},
    })

    return {
        "analysis_id": aid,
        "exists": True,
        "patient_id": log.patient_id,
        "source_filename": log.source_filename,
        "ai_overall_score": log.ai_overall_score,
        "processed": log.processed,
        "checks": checks,
        "all_pass": all(c["pass"] for c in checks),
    }


# ── Endpoint ─────────────────────────────────────────────────────────────────
@router.get("/pipeline-status")
async def pipeline_status(
    analysis_id: int | None = Query(None, description="Verify a single analysis_id (default: all)"),
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify pipeline DB storage integrity.

    Returns 200 OK with detailed status if all checks pass, 503 if any
    check fails (so monitoring tools alert).
    """
    if analysis_id is not None:
        aids = [analysis_id]
    else:
        aids = (await db.execute(
            select(M.TranscriptAnalysisLog.id).order_by(M.TranscriptAnalysisLog.id)
        )).scalars().all()

    if not aids:
        return JSONResponse(
            status_code=200,
            content={
                "status": "EMPTY",
                "message": "No analyses in transcript_analysis_log yet.",
                "analyses_checked": 0,
            },
        )

    analyses = []
    for aid in aids:
        analyses.append(await _check_one_analysis(db, aid))

    total_checks = sum(len(a.get("checks", [])) for a in analyses)
    passed = sum(1 for a in analyses for c in a.get("checks", []) if c["pass"])
    failed = total_checks - passed
    overall_pass = failed == 0

    payload = {
        "status": "OK" if overall_pass else "FAIL",
        "summary": {
            "analyses_checked": len(aids),
            "checks_total": total_checks,
            "checks_passed": passed,
            "checks_failed": failed,
        },
        "analyses": analyses,
    }
    return JSONResponse(
        status_code=200 if overall_pass else 503,
        content=payload,
    )
