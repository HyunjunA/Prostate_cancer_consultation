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
) -> bool:
    """Save all pipeline results to DB in a single transaction.

    Called as one line from pipeline_runner: persistence.save_all(Session, ...)

    Tables written:
      - transcript_analysis_log (1 row)
      - sentence_prediction (N rows)
      - doctor_sentence_view (N rows)
      - patient_summary (1 row)
      - patient_summary_scoring (1 row, NULLs)
      - patient_responses (1 row, NULLs)
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

            # 2. sentence_prediction
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

            # 3. doctor_sentence_view (score populated later by AI pipeline)
            #    PK is (file, i, i2) — same sentence can appear in multiple domains,
            #    so deduplicate by (i, i2), keeping the first domain encountered.
            seen_keys = set()
            for outcome, top_df in final_results.items():
                domain_full = outcome
                for _, row in top_df.iterrows():
                    key = (int(row["i"]), int(row["i2"]))
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    session.add(models.DoctorSentenceView(
                        file=filename,
                        i=key[0],
                        i2=key[1],
                        speaker=doctor_speaker,
                        sentence=row["text"],
                        score=None,
                        class_=domain_full,
                        time=now,
                    ))

            # 4. patient_summary + domain rows
            session.add(models.PatientSummary(
                file=filename, speaker=patient_speaker,
            ))
            await session.flush()

            for order, (domain_full, slot) in enumerate(domain_slot_map.items(), start=1):
                short = domain_short_map.get(domain_full, "")
                session.add(models.PatientSummaryDomain(
                    file=filename,
                    speaker=patient_speaker,
                    domain=domain_full,
                    display_order=order,
                    summary_text="",  # populated by AI pipeline (reformat_sentence)
                ))

            await session.commit()
            logger.info(
                "  [OK] Saved: %d predictions, 1 patient summary",
                sum(len(df) for df in final_results.values()),
            )
            return True

        except Exception as e:
            await session.rollback()
            logger.error("  [ERROR] DB save failed: %s", e)
            return False


async def file_already_processed(Session: async_sessionmaker, filename: str) -> bool:
    """Check if a file has already been processed (exists in doctor_sentence_view)."""
    from sqlalchemy import select, func

    async with Session() as session:
        count = (await session.execute(
            select(func.count())
            .select_from(models.DoctorSentenceView)
            .where(models.DoctorSentenceView.file == filename)
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
