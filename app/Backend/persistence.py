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
    scorer_keys: List[Tuple],
    scores: List[int],
    summaries_by_domain: Dict[str, str],
    domain_slot_map: Dict[str, str],
    domain_short_map: Dict[str, str],
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
            # 1. transcript_analysis_log
            analysis_log = models.TranscriptAnalysisLog(
                patient_id=patient_id,
                total_sentences=total_sentences,
                top_n=top_n,
                context_window=context_window,
                model_results=None,
                xlsx_data=xlsx_bytes,
                source_filename=filename,
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

            # 3. doctor_sentence_view
            for (i, i2, domain_full, text, speaker), score in zip(scorer_keys, scores):
                session.add(models.DoctorSentenceView(
                    file=filename,
                    i=i,
                    i2=i2,
                    speaker=speaker,
                    sentence=text,
                    score=float(score),
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
                    summary_text=summaries_by_domain.get(short, ""),
                ))

            await session.commit()
            logger.info(
                "  ✅ Saved: %d doctor sentences, %d predictions, 1 patient summary",
                len(scorer_keys), sum(len(df) for df in final_results.values()),
            )
            return True

        except Exception as e:
            await session.rollback()
            logger.error("  ❌ DB save failed: %s", e)
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
