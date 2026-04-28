"""AI Pipeline Service — wraps the LLM scoring + patient-summary stage.

This module is the thin Backend wrapper around the heavier
`ai_pipeline/` package (mounted into the Backend container as a Docker
volume from `AI_physician_patient_communication/ai_pipeline/`).

What "the AI pipeline" actually does, per domain:
    1. SCORING       — Ask GPT-4o to rate each candidate sentence's
                       clinical relevance from 0 to 5.
    2. EXTRACTION    — Pull structured estimates out of high-scoring
                       sentences (e.g. "24-25%", "13 years", treatment
                       name).
    3. FILTERING     — Keep only the rows that pass the per-domain
                       sanity rules.
    4. SELECTION     — Pick the single best estimate for the domain
                       (or several, for "side-effect" domains like ED).
    5. REFORMAT      — Rewrite the chosen estimate as plain language
                       the patient can read.

Outputs land in two DB tables:
    - llm_pipeline_intermediate     : every candidate after extraction,
                                      with `survived_filter` set to
                                      true/false. Lets analysts inspect
                                      what got rejected.
    - llm_domain_scoring_and_summary: the final per-domain rows the
                                      patient dashboard renders.

Why this lives in Backend (not inside ai_pipeline/):
    `ai_pipeline/` is a pure-Python package — it knows nothing about
    DB sessions, FastAPI, or our table schemas. Keeping the DB write
    code over here lets us swap or upgrade the LLM module without
    rewriting persistence logic, and follows the same separation of
    concerns as `persistence.py` for the NLP half of the pipeline.
"""

import logging
import os
import sys
from typing import Dict, Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Ensure /app is on the import path so the volume-mounted ai_pipeline/
# package can be `import`-ed below. /app is the Backend container's
# working directory; in native mode the path is already on sys.path so
# this is a no-op.
if "/app" not in sys.path:
    sys.path.insert(0, "/app")


def _create_client():
    """Create Azure OpenAI client from environment variables.

    Returns None (with a warning log) when:
      - The `openai` package is not installed.
      - AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_KEY is missing.
    Returning None lets the caller skip the LLM stage gracefully
    instead of crashing the whole pipeline run.
    """
    try:
        from openai import AzureOpenAI

        endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        key = os.getenv("AZURE_OPENAI_KEY")

        if not endpoint or not key:
            logger.warning("Azure OpenAI credentials not configured — AI pipeline disabled")
            return None

        return AzureOpenAI(
            azure_endpoint=endpoint,
            api_key=key,
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
            # 30-minute timeout because the AI pipeline runs sequentially
            # over 5 domains × 5 steps each = 25 LLM calls per analysis.
            # The default 10 min is not enough on slow OpenAI instances.
            timeout=1800.0,
        )
    except ImportError:
        logger.warning("openai package not installed — AI pipeline disabled")
        return None


def _load_prompts():
    """Load AI pipeline domain prompts configuration.

    Returns the same shape ai_pipeline/config.yaml expects: a per-domain
    dict of prompt-id mappings. Hardcoded here (rather than read from
    yaml) because every domain currently uses prompt set "1" and the
    redirection through yaml would just add a load step with no value.
    Switch to yaml-based loading when prompts start diverging per domain.
    """
    return {
        "le": {"prompts": {"scoring": "1", "extraction": "1", "selection": "1", "reformat": "1"}},
        "cp": {"prompts": {"scoring": "1", "extraction": "1", "selection": "1", "reformat": "1"}},
        "ed": {"prompts": {"scoring": "1", "extraction": "1", "selection": "1", "reformat": "1"}},
        "inc": {"prompts": {"scoring": "1", "extraction": "1", "selection": "1", "reformat": "1"}},
        "ius": {"prompts": {"scoring": "1", "extraction": "1", "selection": "1", "reformat": "1"}},
    }


async def run_ai_scoring_and_summary(
    Session,
    analysis_id: int,
    patient_id: str,
    source_filename: str,
    final_results: Dict[str, list],
    outcome_to_sheet: Dict[str, str],
) -> bool:
    """Run the AI pipeline and save results to llm_domain_scoring_and_summary.

    Args:
        Session: async sessionmaker for DB access.
        analysis_id: FK to transcript_analysis_log.id.
        patient_id: Patient identifier (e.g., "SID_10").
        source_filename: Original transcript filename.
        final_results: Dict mapping outcome key → list of sentence dicts
                       (same format as pipeline_runner Step 6 output).
        outcome_to_sheet: Maps outcome key → short domain name (e.g., "cp").

    Returns:
        True if successful, False otherwise. False covers a wide range
        of "skip the AI stage" reasons (no openai pkg, no creds, no
        candidate sentences, LLM call failed, DB save failed). The
        caller surfaces the result to the operator.
    """
    # Lazy import: ai_pipeline lives in a volume mount that may not be
    # present in every environment (e.g. standalone tests). Importing
    # at function call time means the module load does not blow up
    # when the volume is missing.
    try:
        from ai_pipeline.pipeline import run_ai_pipeline
        from ai_pipeline.utils.prompts import load_domain_prompts
    except ImportError as e:
        logger.warning("ai_pipeline module not available: %s — skipping AI scoring", e)
        return False

    client = _create_client()
    if client is None:
        return False

    # LLM call parameters. Low temperature + low top_p + fixed seed so
    # the same input produces the same scoring across re-runs — important
    # for reproducibility of clinical outputs.
    model = os.getenv("AZURE_OPENAI_MODEL", "gpt-4o")
    params = {
        "max_tokens": 4096,
        "temperature": 0.3,
        "top_p": 0.4,
        "seed": 0,
    }
    domains_cfg = _load_prompts()

    # ── Reshape pipeline output into ai_pipeline's expected format ──
    # final_results comes from the NLP stage as Dict[outcome_key, DataFrame].
    # ai_pipeline expects Dict[short_domain_name, DataFrame] with at
    # minimum the columns "text" + "context". We translate keys + drop
    # any domain that has no usable rows.
    domain_dfs = {}
    for outcome_key, data in final_results.items():
        short_name = outcome_to_sheet.get(outcome_key, outcome_key)
        if short_name not in domains_cfg:
            continue
        df = data if isinstance(data, pd.DataFrame) else pd.DataFrame(data)
        if df.empty:
            continue
        if "text" in df.columns and "context" in df.columns:
            domain_dfs[short_name] = df

    if not domain_dfs:
        logger.warning("No domain data available for AI pipeline")
        return False

    logger.info("Running AI pipeline for %d domains: %s", len(domain_dfs), list(domain_dfs.keys()))

    # The actual LLM work — this is the slow part (typically 1-5 min
    # depending on candidate volume + Azure OpenAI latency).
    try:
        ai_results = run_ai_pipeline(client, model, params, domains_cfg, domain_dfs)
    except Exception as e:
        # Broad except: anything from "OpenAI rate-limited us" to
        # "extraction prompt returned malformed JSON". We log and
        # bail rather than crashing the whole pipeline run.
        logger.error("AI pipeline failed: %s", e, exc_info=True)
        return False

    # ── Save results to DB (intermediate + final tables) ──────────
    # Lazy imports again — keeps the import block at the top focused
    # on what is actually used at module load.
    from models import LLMDomainScoringAndSummary, LLMPipelineIntermediate

    try:
        async with Session() as db:
            rows_saved = 0
            intermediate_saved = 0
            for domain, (result, df_extraction, df_filtering) in ai_results.items():
                # ── Save AI intermediate ────────────────────────────
                # Captures every candidate after the EXTRACTION step,
                # tagging which ones survived FILTERING. Lets analysts
                # answer "why was THIS sentence rejected?" without
                # re-running the LLM.
                try:
                    surviving_indices = set(df_filtering.index.tolist()) if df_filtering is not None else set()
                    if df_extraction is not None:
                        for idx, row in df_extraction.iterrows():
                            db.add(LLMPipelineIntermediate(
                                analysis_id=analysis_id,
                                patient_id=patient_id,
                                domain=domain,
                                step="extraction",
                                sentence_index=int(idx),
                                sentence_text=row.get("text") if "text" in row.index else None,
                                context=row.get("context") if "context" in row.index else None,
                                pred_score=float(row[".pred_1"]) if ".pred_1" in row.index and pd.notna(row[".pred_1"]) else None,
                                ai_score=int(row["score"]) if "score" in row.index and pd.notna(row["score"]) else None,
                                score_explanation=row.get("score_explanation") if "score_explanation" in row.index else None,
                                estimate=str(row["estimate"]) if "estimate" in row.index and pd.notna(row["estimate"]) else None,
                                treatment=str(row["treatment"]) if "treatment" in row.index and pd.notna(row["treatment"]) else None,
                                survived_filter=(idx in surviving_indices),
                            ))
                            intermediate_saved += 1
                except Exception as ie:
                    # Per-domain intermediate save is best-effort. If it
                    # fails (e.g. a DataFrame has an unexpected shape),
                    # log and continue so the FINAL row save below
                    # still happens — losing the trace is OK, losing
                    # the patient-visible result is not.
                    logger.warning("intermediate save skipped for domain=%s: %s", domain, ie)

                # ── Save final patient-visible rows ─────────────────
                # Two cases per domain:
                #   - "side-effect" domains (ED, INC, IUS) can emit
                #     multiple selected rows.
                #   - Other domains emit exactly one selected row.
                if isinstance(result.get("selected"), list):
                    reformat = result.get("reformat", "")
                    for selected_row in result["selected"]:
                        record = LLMDomainScoringAndSummary(
                            analysis_id=analysis_id,
                            patient_id=patient_id,
                            domain=domain,
                            ai_score=selected_row.get("score"),
                            score_explanation=selected_row.get("score_explanation"),
                            extracted_estimate=selected_row.get("estimate"),
                            treatment=selected_row.get("treatment"),
                            source_sentence=selected_row.get("sentence"),  # original single sentence
                            source_context=selected_row.get("text"),       # surrounding context
                            reformat_sentence=reformat,
                            source_filename=source_filename,
                        )
                        db.add(record)
                        rows_saved += 1
                else:
                    # Regular domain (single selected row)
                    record = LLMDomainScoringAndSummary(
                        analysis_id=analysis_id,
                        patient_id=patient_id,
                        domain=domain,
                        ai_score=result.get("score"),
                        score_explanation=result.get("score_explanation"),
                        extracted_estimate=result.get("estimate"),
                        treatment=result.get("treatment"),
                        source_sentence=result.get("sentence"),  # original single sentence
                        source_context=result.get("text"),       # surrounding context
                        reformat_sentence=result.get("reformat"),
                        source_filename=source_filename,
                    )
                    db.add(record)
                    rows_saved += 1

            # ── Roll up an overall score for the patient dashboard ──
            # Average of every per-domain ai_score we just added. The
            # `db.new` set contains the rows queued for INSERT but not
            # yet committed; we walk it as a fast path and fall back
            # to recomputing from `ai_results` if attribute access fails.
            all_scores = [r.ai_score for r in db.new if hasattr(r, 'ai_score') and r.ai_score is not None]
            if not all_scores:
                # Re-collect from what we just added
                all_scores = []
                for domain, (result, _, _) in ai_results.items():
                    if isinstance(result.get("selected"), list):
                        for sel in result["selected"]:
                            if sel.get("score") is not None:
                                all_scores.append(sel["score"])
                    elif result.get("score") is not None:
                        all_scores.append(result["score"])

            if all_scores:
                overall = round(sum(all_scores) / len(all_scores), 2)
                # Patch the parent transcript_analysis_log row with
                # the overall score AND flip processed=True so callers
                # know the LLM half is done.
                from sqlalchemy import update
                from models import TranscriptAnalysisLog as TAL
                from datetime import datetime, timezone
                await db.execute(
                    update(TAL).where(TAL.id == analysis_id).values(
                        ai_overall_score=overall,
                        processed=True,
                        processed_at=datetime.now(timezone.utc),
                    )
                )

                logger.info("AI pipeline: overall score = %.2f (%d domains), processed=True", overall, len(all_scores))

            await db.commit()
            logger.info(
                "AI pipeline: saved %d final rows + %d intermediate rows",
                rows_saved, intermediate_saved,
            )
            return True

    except Exception as e:
        # Rollback would happen automatically when the `async with`
        # exits with an exception, but logging here gives us a clear
        # tracking message for ops dashboards.
        logger.error("Failed to save AI pipeline results to DB: %s", e, exc_info=True)
        return False
