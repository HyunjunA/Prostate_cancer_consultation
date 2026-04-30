"""Admin endpoint for verifying pipeline DB storage.

Mirrors the verify_pipeline_db.py CLI as a JSON HTTP endpoint so that:
    - Slack/PagerDuty bots can poll for regressions.
    - Managers can confirm pipeline storage integrity from a browser.
    - CI smoke tests can hit the endpoint after deploy.

What "pipeline DB storage" means here:
    The NLP + LLM pipeline writes to seven tables in sequence:
        1. transcript_analysis_log    (one row per analysis)
        2. nlp_pipeline_intermediate  (raw / filtered / sentences / top_by_model)
        3. nlp_all_predictions        (per-sentence scores for all 5 models)
        4. sentence_prediction        (top-N rows with surrounding context)
        5. llm_pipeline_intermediate  (per-domain LLM input/output trace)
        6. llm_domain_scoring_and_summary (final scoring + summary rows)
        7. patient_summary            (one row per patient — should NOT duplicate)
    Each check below validates exactly one of those storage steps.

Why a separate admin endpoint instead of a generic /healthz:
    /health already covers "DB reachable + Redis up + NLP reachable",
    which is the live-traffic readiness signal. This endpoint is a
    deeper *correctness* probe — it verifies that recently-completed
    pipelines actually wrote everything they were supposed to. Useful
    in CI ("did the demo run produce all 7 tables of output?") and
    after deploys ("did the migration silently break a write path?").

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
    """Run all checks for a single analysis_id and return a status dict.

    Each check is a small dict of the shape:
        {"name": "...", "pass": bool, "observed": {...}}
    The endpoint composes these into the final response so the consumer
    can see WHICH check failed, not just an overall pass/fail flag.
    """
    # First locate the parent log row. If the caller asked for a non-
    # existent analysis_id we report exists=False and skip the rest;
    # raising here would 500 the whole batch endpoint.
    log = (await db.execute(
        select(M.TranscriptAnalysisLog).where(M.TranscriptAnalysisLog.id == aid)
    )).scalar_one_or_none()
    if log is None:
        return {"analysis_id": aid, "exists": False, "checks": []}

    checks: List[Dict[str, Any]] = []

    # ── 1. transcript_analysis_log: pipeline ran to completion ──────────
    # `processed=True` AND a non-null AI overall score together indicate
    # both the NLP half and the LLM half finished writing. Either one
    # being missing means we crashed mid-pipeline.
    checks.append({
        "name": "transcript_analysis_log_ai_complete",
        "pass": log.processed is True and log.ai_overall_score is not None,
        "observed": {"processed": log.processed, "ai_overall_score": log.ai_overall_score},
    })

    # ── 2. nlp_pipeline_intermediate: all four expected steps wrote ────
    # The NLP pipeline records four named steps; missing one usually
    # means the corresponding stage skipped its persistence call (a
    # silent regression we have hit twice before).
    intermediate = (await db.execute(
        select(M.NLPPipelineIntermediate.step, M.NLPPipelineIntermediate.row_count)
        .where(M.NLPPipelineIntermediate.analysis_id == aid)
    )).all()
    steps = {row.step: row.row_count for row in intermediate}
    expected = {"raw", "filtered", "sentences", "top_by_model"}
    checks.append({
        "name": "nlp_intermediates_jsonb",
        # Two conditions: (a) every expected step exists, (b) every step
        # has a positive row_count (a present-but-empty step is also a bug).
        "pass": expected.issubset(steps.keys()) and all(n and n > 0 for n in steps.values()),
        "observed": {"steps": steps, "expected": sorted(expected)},
    })

    # ── 3. nlp_all_predictions — Bug 1 guard ────────────────────────────
    # We previously had a regression where one of the five model columns
    # silently stayed NULL (the "null leak"). This counts non-null values
    # per column and flags any column where non-nulls < total.
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

    # ── 4. sentence_prediction: top-N rows with context ────────────────
    # The pipeline picks top-10 sentences per model (5 models x 10 = 50
    # rows total) and stores each with its surrounding context. ALL 50
    # must have non-empty context — empty context means the context-
    # extraction step ran but its output never got persisted.
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

    # ── 5. llm_pipeline_intermediate: per-domain LLM trace ─────────────
    # We expect one LLM trace per domain (5 total). At least one row per
    # domain must have survived_filter=True so we know the LLM stage
    # actually picked candidates rather than rejecting everything.
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

    # ── 6. llm_domain_scoring_and_summary: final user-visible output ───
    # One row per (domain, finalist sentence) pair. With 5 domains x 1-5
    # finalists each, expect 5-25 rows; outside that band signals an
    # over- or under-pruning regression.
    final_count = (await db.execute(text(
        "SELECT count(*) FROM llm_domain_scoring_and_summary WHERE analysis_id = :aid"
    ), {"aid": aid})).scalar_one()
    checks.append({
        "name": "ai_final_summary_rows",
        "pass": 5 <= final_count <= 25,
        "observed": {"rows": final_count, "expected_range": [5, 25]},
    })

    # ── 7. patient_summary — Bug 2 guard ────────────────────────────────
    # Each transcript file should produce exactly ONE patient_summary row.
    # A previous regression caused the upsert to insert duplicates instead
    # of overwriting, which then broke the patient dashboard.
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
        # Roll-up flag so the consumer can branch on a single bool
        # without having to re-walk the checks list.
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

    Query params:
        analysis_id : if provided, check ONLY this id (cheap probe).
                      Omitted = check every row in
                      transcript_analysis_log (slower, used by
                      scheduled audits / nightly CI).
    """
    # Decide which analyses to walk: a single id from the query, or the
    # entire log table.
    if analysis_id is not None:
        aids = [analysis_id]
    else:
        aids = (await db.execute(
            select(M.TranscriptAnalysisLog.id).order_by(M.TranscriptAnalysisLog.id)
        )).scalars().all()

    # Empty DB is NOT a failure — fresh installs and stale environments
    # both legitimately have zero analyses. Return 200 with a clearly
    # tagged "EMPTY" status so monitoring tools can choose to ignore it.
    if not aids:
        return JSONResponse(
            status_code=200,
            content={
                "status": "EMPTY",
                "message": "No analyses in transcript_analysis_log yet.",
                "analyses_checked": 0,
            },
        )

    # Run checks one analysis at a time. Sequential (not concurrent) on
    # purpose — each _check_one_analysis fires several DB queries and we
    # do not want to flood the connection pool when called against a
    # database with hundreds of analyses.
    analyses = []
    for aid in aids:
        analyses.append(await _check_one_analysis(db, aid))

    # Summary stats so consumers do not have to walk `analyses` to know
    # whether to alert.
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
    # The 200/503 split is what makes this endpoint useful as a probe:
    # any HTTP-level monitor (UptimeRobot, Pingdom, Datadog) will treat
    # 503 as an alert without needing to parse the body.
    return JSONResponse(
        status_code=200 if overall_pass else 503,
        content=payload,
    )
