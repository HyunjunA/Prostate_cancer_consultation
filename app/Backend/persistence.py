"""Database persistence module — Step 10 of the pipeline.

Ivan's rule: "Pipeline ≠ DB ≠ UI — never mix them."
This module handles all DB writes for the pipeline. The pipeline_runner
calls persistence.save_all() as a single line — it doesn't know DB internals.

What this module owns:
    Every INSERT / UPSERT the NLP pipeline performs at the end of a
    run. Centralising them here means:
      - pipeline_runner.py stays focused on orchestration ("step 1
        then 2 then 3 then save").
      - DB schema changes touch ONE file, not every pipeline step.
      - One transaction wraps every write so a partial failure rolls
        back cleanly.

Tables this module writes to:
    1. transcript_analysis_log    (1 row : the run itself)
    2. sentence_prediction        (~50 rows : top-N per model with context)
    3. patient_summary            (1 row : UPSERT, survives re-runs)
    4. patient_summary_domain     (5 rows : one per domain)
    5. nlp_all_predictions        (~hundreds : every sentence × 5 model scores)
    6. nlp_pipeline_intermediate  (4 rows : raw / filtered / sentences /
                                   top_by_model as JSONB blobs)

Tables this module DOES NOT write to:
    - llm_pipeline_intermediate, llm_domain_scoring_and_summary :
      handled later by ai_pipeline_service.py during the LLM stage.
    - survey_submission_log, doctor_rewrite_log, behaviour tables :
      written by user-facing routes, not by the batch pipeline.
"""

import logging
from typing import Any, Dict, List

import pandas as pd
from sqlalchemy.ext.asyncio import async_sessionmaker

import models

logger = logging.getLogger(__name__)


def _df_to_jsonable(df) -> List[Dict[str, Any]]:
    """Convert a DataFrame to a list of JSON-serializable dicts.

    Pandas-native types (numpy int64, float64, NaN) are not JSON-serializable
    by default, so we let pandas convert via to_dict + nan-to-None coercion.
    """
    if df is None:
        return []
    # `to_json` round-trips through pandas' own JSON encoder which knows
    # to turn numpy.int64 -> int, numpy.float64 -> float, NaN -> null.
    # Doing `df.to_dict()` would leave the numpy types in place and
    # blow up later when SQLAlchemy tries to serialise to JSONB.
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

    Returns:
        True on success (commit applied), False on any failure (transaction
        rolled back). pipeline_runner uses the return value to decide
        whether to surface a per-file error to the operator.
    """
    # Single `async with Session()` opens ONE transaction for ALL writes
    # below. If anything raises, the except branch rolls everything back
    # — partial pipelines never end up in the DB.
    async with Session() as session:
        try:
            # ── 1. transcript_analysis_log ────────────────────────────
            # processed=False on insert: the LLM stage flips it to True
            # later. Until then we know "NLP wrote, LLM hasn't yet".
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
            # flush() pushes the INSERT to postgres so the auto-generated
            # primary key (analysis_log.id) is available for the FK
            # references in the rows we add below — without this, all
            # the child rows would have analysis_id=None.
            await session.flush()

            # ── 2. sentence_prediction (step 5: top-N with context) ──
            # One row per (model, top-N sentence). Each row is fully
            # self-describing (analysis_id, model, sentence text, score,
            # surrounding context) so the doctor UI can render it
            # directly without joining back to the original transcript.
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

            # ── 3. patient_summary + per-domain rows (UPSERT) ─────────
            # Why UPSERT instead of plain INSERT:
            #   patient_summary uses (file, speaker) as PK with NO FK
            #   to transcript_analysis_log, so CASCADE deletes do NOT
            #   clean it up when an analysis is removed. Re-processing
            #   the same file would otherwise INSERT a duplicate row
            #   and break survey_submission_log references that point
            #   at the (file, speaker) pair. ON CONFLICT DO NOTHING
            #   keeps the existing summary row + its referrers intact.
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            await session.execute(
                pg_insert(models.PatientSummary)
                .values(file=filename, speaker=patient_speaker)
                .on_conflict_do_nothing(index_elements=["file", "speaker"])
            )

            # Per-domain rows: UPSERT-with-update on display_order so
            # re-runs can change the domain ordering (e.g. if the
            # outcome list is reconfigured) without leaving stale rows.
            for order, (domain_full, slot) in enumerate(domain_slot_map.items(), start=1):
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

            # ── 4. nlp_all_predictions (step 3 fully normalized) ─────
            # One row per sentence with all 5 model scores. Lets ad-hoc
            # SQL queries do cross-domain analysis without re-running
            # the pipeline (e.g. "sentences where cp > 0.7 AND ed > 0.5").
            if df_predicted is not None:
                # The classifier writes scores under different column
                # names depending on the upstream pipeline variant. We
                # accept any of the known aliases so this code does not
                # have to be updated each time someone tweaks the upstream.
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

            # ── 5. nlp_pipeline_intermediate (steps 0/1/2/4 as JSONB) ─
            # Stores each step's full output as a JSONB blob. Useful for
            # debugging "where did this sentence come from?" without
            # re-running the pipeline. Skipped for any step the caller
            # didn't pass (HTTP path passes none of these).
            for step_name, df_or_dict in [
                ("raw", df_raw),
                ("filtered", df_filtered),
                ("sentences", df_sentences),
                ("top_by_model", top_by_model),
            ]:
                if df_or_dict is None:
                    continue
                # `top_by_model` is a Dict[domain, DataFrame], everything
                # else is a single DataFrame — branch on type.
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

            # Single commit at the end — all 5 sections above land
            # atomically. Either the entire pipeline run is in the DB
            # or none of it is.
            await session.commit()

            # Compact one-line summary for ops logs. Keeps the noise
            # level reasonable when the pipeline runs in batch over
            # many files.
            n_pred = sum(len(df) for df in final_results.values())
            n_all = len(df_predicted) if df_predicted is not None else 0
            n_int = sum(1 for x in [df_raw, df_filtered, df_sentences, top_by_model] if x is not None)
            logger.info(
                "  [OK] Saved: %d top-N preds, %d all preds, %d intermediates, 1 patient summary",
                n_pred, n_all, n_int,
            )
            return True

        except Exception as e:
            # Any exception above lands here. Roll back so the partially-
            # written rows do not persist, then return False so the
            # caller knows to surface the error.
            await session.rollback()
            logger.error("  [ERROR] DB save failed: %s", e)
            return False


async def file_already_processed(Session: async_sessionmaker, filename: str) -> bool:
    """Check if a file has already been processed (exists in sentence_prediction).

    Used by pipeline_runner to skip files it has already handled —
    saves several seconds per file in the typical "scan a folder, only
    process new ones" loop.

    Note we look at sentence_prediction (not transcript_analysis_log)
    because transcript_analysis_log gets its row at the START of the
    run, before any predictions have been written; checking it would
    incorrectly mark a crashed mid-run as "done".
    """
    from sqlalchemy import select, func

    async with Session() as session:
        count = (await session.execute(
            select(func.count())
            .select_from(models.SentencePrediction)
            .where(models.SentencePrediction.patient_id == filename)
        )).scalar()
        return count is not None and count > 0


async def get_latest_analysis_id(Session, patient_id: str) -> int | None:
    """Get the most recent transcript_analysis_log.id for a patient.

    The LLM stage and the patient dashboard both need the "current"
    analysis row — defined as the latest analyzed_at timestamp. This
    helper centralises the query so callers do not have to remember
    the ordering rule.
    """
    from sqlalchemy import select
    async with Session() as session:
        result = await session.execute(
            select(models.TranscriptAnalysisLog.id)
            .where(models.TranscriptAnalysisLog.patient_id == patient_id)
            .order_by(models.TranscriptAnalysisLog.analyzed_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
