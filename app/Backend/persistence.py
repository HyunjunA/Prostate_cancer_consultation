"""Database persistence module — Step 10 of the pipeline.

Ivan's rule: "Pipeline ≠ DB ≠ UI — never mix them."
This module handles all DB writes for the pipeline. The pipeline_runner
calls persistence.save_all() as a single line — it doesn't know DB internals.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import models

logger = logging.getLogger(__name__)


def _df_to_jsonable(df) -> List[Dict[str, Any]]:
    """Convert a DataFrame to a list of JSON-serializable dicts.

    Pandas-native types (numpy int64, float64, NaN) are not JSON-serializable
    by default, so we let pandas convert via to_dict + nan-to-None coercion.
    """
    if df is None:
        return []
    # pandas to_json roundtrip handles NaN → null and numpy types → native.
    import json as _json
    return _json.loads(df.to_json(orient="records"))


def _top_by_model_to_jsonable(top_by_model) -> Dict[str, List[Dict[str, Any]]]:
    """Same as _df_to_jsonable but for the Dict[domain, DataFrame] shape of step 4."""
    if top_by_model is None:
        return {}
    return {domain: _df_to_jsonable(df) for domain, df in top_by_model.items()}


async def save_all(
    Session: async_sessionmaker,
    *,
    filename: str,
    patient_id: str,
    doctor_speaker: str,
    patient_speaker: str,
    total_sentences: int,
    top_n: int,
    context_window: int,
    xlsx_bytes: bytes,
    final_results: Dict[str, pd.DataFrame],
    outcome_to_sheet: Dict[str, str],
    domain_slot_map: Dict[str, str],
    domain_short_map: Dict[str, str],
    pipeline_started_at=None,
    # NLP intermediates (steps 0-4) — optional so HTTP-path callers can
    # still invoke save_all() without them.
    df_raw: pd.DataFrame = None,
    df_filtered: pd.DataFrame = None,
    df_sentences: pd.DataFrame = None,
    df_predicted: pd.DataFrame = None,
    top_by_model: Dict[str, pd.DataFrame] = None,
) -> bool:
    """Save all pipeline results to DB in a single transaction.

    Called as one line from pipeline_runner: persistence.save_all(Session, ...)

    Tables written:
      - transcript_analysis_log    (1 row)
      - sentence_prediction        (N rows — step 5 top-N)
      - patient_summary            (1 row)
      - patient_summary_domain     (N rows)
      - nlp_all_predictions        (M rows — step 3 ALL sentences x 5 model scores; only if df_predicted given)
      - nlp_pipeline_intermediate  (4 rows — steps 0/1/2/4 as JSONB; only if dfs given)
    """
    now = datetime.now(timezone.utc)

    async with Session() as session:
        try:
            # 1. transcript_analysis_log (processed=False until AI pipeline completes)
            analysis_log = models.TranscriptAnalysisLog(
                patient_id=patient_id,
                total_sentences=total_sentences,
                top_n=top_n,
                context_window=context_window,
                model_results=None,
                xlsx_data=xlsx_bytes,
                source_filename=filename,
                pipeline_started_at=pipeline_started_at,
                processed=False,
            )
            session.add(analysis_log)
            await session.flush()

            # 2. sentence_prediction (step 5 top-N with context)
            for outcome, top_df in final_results.items():
                sheet = outcome_to_sheet[outcome]
                for _, row in top_df.iterrows():
                    session.add(models.SentencePrediction(
                        analysis_id=analysis_log.id,
                        patient_id=patient_id,
                        model=sheet,
                        sentence_index=int(row["index"]),
                        utterance_index=int(row["i"]),
                        sentence_in_utterance=int(row["i2"]),
                        speaker=doctor_speaker,
                        sentence_text=row["text"],
                        pred_score=float(row[".pred_1"]),
                        context=row.get("context"),
                    ))

            # 3. patient_summary + domain rows — UPSERT to handle re-processing
            #    (patient_summary uses (file, speaker) PK with no FK to
            #    transcript_analysis_log, so CASCADE doesn't clean it up.
            #    ON CONFLICT DO NOTHING keeps the row + survey_submission_log
            #    references intact across re-runs.)
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            await session.execute(
                pg_insert(models.PatientSummary)
                .values(file=filename, speaker=patient_speaker)
                .on_conflict_do_nothing(index_elements=["file", "speaker"])
            )

            for order, (domain_full, slot) in enumerate(domain_slot_map.items(), start=1):
                short = domain_short_map.get(domain_full, "")
                await session.execute(
                    pg_insert(models.PatientSummaryDomain)
                    .values(
                        file=filename,
                        speaker=patient_speaker,
                        domain=domain_full,
                        display_order=order,
                    )
                    .on_conflict_do_update(
                        index_elements=["file", "speaker", "domain"],
                        set_={"display_order": order},
                    )
                )

            # 4. NLP intermediates — step 3 fully normalized (every sentence
            #    × 5 NLP scores). Useful for cross-domain SQL analysis.
            if df_predicted is not None:
                # `classify_all_models` (sentence_classification/classification.py:108)
                # writes scores under the FULL domain name column
                # (e.g. "cancer_prognosis"). We accept all known variants for
                # forward compatibility with alternate upstream pipelines.
                def _get(row, *candidates):
                    for c in candidates:
                        if c in row.index and pd.notna(row[c]):
                            return float(row[c])
                    return None

                for _, row in df_predicted.iterrows():
                    session.add(models.NLPAllPredictions(
                        analysis_id=analysis_log.id,
                        patient_id=patient_id,
                        sentence_index=int(row["index"]) if "index" in row.index else 0,
                        utterance_index=int(row["i"]) if "i" in row.index else 0,
                        sentence_in_utterance=int(row["i2"]) if "i2" in row.index else 0,
                        speaker=row.get("speaker"),
                        sentence_text=row.get("text"),
                        pred_cp=_get(row, "cancer_prognosis", ".pred_1_cp", "pred_cp", "cp_pred_1"),
                        pred_le=_get(row, "life_expectancy", ".pred_1_le", "pred_le", "le_pred_1"),
                        pred_ed=_get(row, "erectile_dysfunction_potency", ".pred_1_ed", "pred_ed", "ed_pred_1"),
                        pred_inc=_get(row, "continence", ".pred_1_inc", "pred_inc", "inc_pred_1"),
                        pred_ius=_get(row, "irritative_urinary_symptoms_frequency_urgency_nocturnia", ".pred_1_ius", "pred_ius", "ius_pred_1"),
                    ))

            # 5. NLP intermediates — steps 0/1/2/4 as JSONB blobs
            for step_name, df_or_dict in [
                ("raw", df_raw),
                ("filtered", df_filtered),
                ("sentences", df_sentences),
                ("top_by_model", top_by_model),
            ]:
                if df_or_dict is None:
                    continue
                if isinstance(df_or_dict, dict):
                    payload = _top_by_model_to_jsonable(df_or_dict)
                    row_count = sum(len(v) for v in payload.values())
                else:
                    payload = _df_to_jsonable(df_or_dict)
                    row_count = len(payload)
                session.add(models.NLPPipelineIntermediate(
                    analysis_id=analysis_log.id,
                    patient_id=patient_id,
                    step=step_name,
                    payload=payload,
                    row_count=row_count,
                ))

            await session.commit()
            n_pred = sum(len(df) for df in final_results.values())
            n_all = len(df_predicted) if df_predicted is not None else 0
            n_int = sum(1 for x in [df_raw, df_filtered, df_sentences, top_by_model] if x is not None)
            logger.info(
                "  [OK] Saved: %d top-N preds, %d all preds, %d intermediates, 1 patient summary",
                n_pred, n_all, n_int,
            )
            return True

        except Exception as e:
            await session.rollback()
            logger.error("  [ERROR] DB save failed: %s", e)
            return False


async def file_already_processed(Session: async_sessionmaker, filename: str) -> bool:
    """Check if a file has already been processed (exists in sentence_prediction)."""
    from sqlalchemy import select, func

    async with Session() as session:
        count = (await session.execute(
            select(func.count())
            .select_from(models.SentencePrediction)
            .where(models.SentencePrediction.patient_id == filename)
        )).scalar()
        return count is not None and count > 0


async def get_latest_analysis_id(Session, patient_id: str) -> int | None:
    """Get the most recent transcript_analysis_log.id for a patient."""
    from sqlalchemy import select
    async with Session() as session:
        result = await session.execute(
            select(models.TranscriptAnalysisLog.id)
            .where(models.TranscriptAnalysisLog.patient_id == patient_id)
            .order_by(models.TranscriptAnalysisLog.analyzed_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
