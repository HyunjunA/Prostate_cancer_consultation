"""AI Pipeline Service — Integrates Guille's LLM scoring + patient summary rewriting.

Calls the ai_pipeline module (mounted via Docker volume from
AI_physician_patient_communication/ai_pipeline/) to:
  1. Score each sentence's clinical relevance (0-5) using GPT-4o
  2. Extract risk estimates (e.g., "24-25%", "13 years")
  3. Filter and select the best estimate per domain
  4. Reformat into patient-facing plain language

Results are stored in the llm_domain_scoring_and_summary DB table.
"""

import logging
import os
import sys
from typing import Dict, Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Add /app to sys.path so ai_pipeline/ (volume-mounted) can be imported
if "/app" not in sys.path:
    sys.path.insert(0, "/app")


def _create_client():
    """Create Azure OpenAI client from environment variables."""
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
            timeout=1800.0,  # 30 min — AI pipeline processes 5 domains × 5 steps sequentially
        )
    except ImportError:
        logger.warning("openai package not installed — AI pipeline disabled")
        return None


def _load_prompts():
    """Load AI pipeline domain prompts configuration."""
    # Default config matching ai_pipeline/config.yaml
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
        True if successful, False otherwise.
    """
    try:
        from ai_pipeline.pipeline import run_ai_pipeline
        from ai_pipeline.utils.prompts import load_domain_prompts
    except ImportError as e:
        logger.warning("ai_pipeline module not available: %s — skipping AI scoring", e)
        return False

    client = _create_client()
    if client is None:
        return False

    model = os.getenv("AZURE_OPENAI_MODEL", "gpt-4o")
    params = {
        "max_tokens": 4096,
        "temperature": 0.3,
        "top_p": 0.4,
        "seed": 0,
    }
    domains_cfg = _load_prompts()

    # Convert final_results to DataFrames expected by ai_pipeline
    # final_results: Dict[str, pd.DataFrame] — already DataFrames from transcript_service
    domain_dfs = {}
    for outcome_key, data in final_results.items():
        short_name = outcome_to_sheet.get(outcome_key, outcome_key)
        if short_name not in domains_cfg:
            continue
        # data is already a DataFrame from generate_all_contexts()
        df = data if isinstance(data, pd.DataFrame) else pd.DataFrame(data)
        if df.empty:
            continue
        if "text" in df.columns and "context" in df.columns:
            domain_dfs[short_name] = df

    if not domain_dfs:
        logger.warning("No domain data available for AI pipeline")
        return False

    logger.info("Running AI pipeline for %d domains: %s", len(domain_dfs), list(domain_dfs.keys()))

    try:
        ai_results = run_ai_pipeline(client, model, params, domains_cfg, domain_dfs)
    except Exception as e:
        logger.error("AI pipeline failed: %s", e, exc_info=True)
        return False

    # Save results to DB
    from models import LLMDomainScoringAndSummary

    try:
        async with Session() as db:
            rows_saved = 0
            for domain, (result, df_extraction, df_filtering) in ai_results.items():
                # Handle side-effect domains (list of selected rows)
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

            # Calculate and save overall score to transcript_analysis_log
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
            logger.info("AI pipeline: saved %d rows to llm_domain_scoring_and_summary", rows_saved)
            return True

    except Exception as e:
        logger.error("Failed to save AI pipeline results to DB: %s", e, exc_info=True)
        return False
