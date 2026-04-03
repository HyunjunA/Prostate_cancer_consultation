#!/usr/bin/env python3
"""Full Pipeline Runner — transcript files → NLP → scorer → rewriter → DB.

Processes all transcript xlsx files in a directory through the complete pipeline:
  Step 1-3: Read, filter interviewer, split into sentences
  Step 4:   NLP prediction (5 models via r01-nlp-classifiers)
  Step 5:   Select top-N sentences per domain
  Step 6:   Generate context (±3 surrounding sentences)
  Step 7:   Export to xlsx
  Step 8:   Consultation quality scoring (0-5 via consultation-scorer)
  Step 9:   Patient summary rewriting (via patient-summary-rewriter)
  Step 10:  Save all results directly to PostgreSQL

No fake CSV files. No intermediate files. Real data only.

Usage:
  python pipeline_runner.py                          # Process all files in TRANSCRIPT_DIR
  python pipeline_runner.py --dir /path/to/files     # Custom directory
  python pipeline_runner.py --file /path/to/one.xlsx # Single file
"""

import asyncio
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Default transcript directory (inside Docker: mounted volume or bundled data)
TRANSCRIPT_DIR = os.getenv(
    "TRANSCRIPT_DIR",
    "/app/data/transcripts"
)


async def process_single_file(filepath: str, Session) -> Optional[Dict[str, Any]]:
    """Process one transcript file through the full pipeline (Steps 1-10)."""
    from transcript_service import (
        read_transcript, filter_interviewer, split_sentences,
        run_predictions, select_top_n, generate_context,
        export_to_xlsx, OUTCOME_TO_SHEET, MODEL_TO_OUTCOME,
    )
    from scorer_service import score_batch
    from rewriter_service import rewrite_batch
    from models import (
        DoctorSentenceView, DoctorRewriteLog,
        PatientSummary, PatientSummaryScoring, PatientResponses,
        TranscriptAnalysisLog, SentencePrediction,
    )
    from sqlalchemy import select

    filename = os.path.basename(filepath)

    # Skip if already processed (check doctor_sentence_view for this file)
    from sqlalchemy import select, func
    from models import DoctorSentenceView
    async with Session() as session:
        count = (await session.execute(
            select(func.count()).select_from(DoctorSentenceView).where(DoctorSentenceView.file == filename)
        )).scalar()
        if count and count > 0:
            logger.info("⏭️  Skipping %s — already has %d sentences in DB", filename, count)
            return None

    file_bytes = Path(filepath).read_bytes()

    logger.info("=" * 60)
    logger.info("Processing: %s", filename)
    logger.info("=" * 60)

    # ── Steps 1-3: Read, filter, split ───────────────────────────────────
    try:
        df_raw, patient_id = read_transcript(file_bytes, filename)
    except Exception:
        # Try reading as CSV (TurboScribe format)
        import pandas as pd
        from io import BytesIO
        try:
            df_raw = pd.read_csv(BytesIO(file_bytes))
            if not {"speaker", "text"}.issubset(df_raw.columns):
                logger.error("  Skipping %s — missing speaker/text columns", filename)
                return None
            patient_id = re.sub(r"^processed_transcripts_", "", Path(filename).stem)
            df_raw = df_raw[["speaker", "text"]].copy()
            df_raw.insert(0, "index", range(1, len(df_raw) + 1))
        except Exception as e:
            logger.error("  Skipping %s — cannot read: %s", filename, e)
            return None

    df_filtered = filter_interviewer(df_raw)
    if len(df_filtered) == 0:
        logger.warning("  Skipping %s — no interviewer utterances found", filename)
        return None

    df_sentences = split_sentences(df_filtered)
    total_sentences = len(df_sentences)
    logger.info("  %d sentences after segmentation", total_sentences)

    # ── Step 4: NLP prediction (5 models, parallel) ──────────────────────
    df_predicted = await run_predictions(df_sentences)

    # ── Step 5: Select top-N per domain ──────────────────────────────────
    top_n = 10
    context_window = 3
    top_by_model = select_top_n(df_predicted, n=top_n)

    # ── Step 6: Generate context ─────────────────────────────────────────
    final_results = {}
    for outcome, top_df in top_by_model.items():
        contexts = generate_context(df_sentences, top_df, window=context_window)
        top_df = top_df.copy()
        top_df["context"] = contexts
        final_results[outcome] = top_df

    # ── Step 7: Export to xlsx ───────────────────────────────────────────
    xlsx_bytes = export_to_xlsx(final_results, patient_id)

    # ── Step 8: Score each sentence (0-5) via consultation-scorer ────────
    logger.info("  Step 8: Scoring sentences (0-5)...")

    # Build batch for ALL sentences (not just top-N)
    domain_short = {
        "cancer_prognosis": "cp",
        "continence": "inc",
        "erectile_dysfunction_potency": "ed",
        "irritative_urinary_symptoms_frequency_urgency_nocturnia": "ius",
        "life_expectancy": "le",
    }

    # For doctor_sentence_view: each sentence gets best domain + score
    # Use top-N results to determine domain assignment
    sentence_domain_map: Dict[tuple, tuple] = {}  # (i, i2) → (domain_full, pred_1)
    for outcome, top_df in final_results.items():
        for _, row in top_df.iterrows():
            key = (int(row["i"]), int(row["i2"]))
            pred = float(row[".pred_1"])
            if key not in sentence_domain_map or pred > sentence_domain_map[key][1]:
                sentence_domain_map[key] = (outcome, pred)

    # Score via consultation-scorer
    scorer_input = []
    scorer_keys = []
    for (i, i2), (domain_full, _) in sentence_domain_map.items():
        text_row = df_sentences[(df_sentences["i"] == i) & (df_sentences["i2"] == i2)]
        if len(text_row) > 0:
            text = text_row.iloc[0]["text"]
            scorer_input.append({"text": text, "domain": domain_short.get(domain_full, "")})
            scorer_keys.append((i, i2, domain_full, text, doctor_speaker))

    scores_0_5 = await score_batch(scorer_input)
    logger.info("  Step 8: %d sentences scored", len(scores_0_5))

    # ── Step 9: Rewrite summaries via patient-summary-rewriter ───────────
    logger.info("  Step 9: Generating patient summaries...")

    domains_for_rewrite = []
    for outcome in OUTCOME_TO_SHEET.keys():
        if outcome in final_results:
            top_df = final_results[outcome]
            top_sentences = top_df["text"].head(3).tolist()
            if top_sentences:
                domains_for_rewrite.append({
                    "sentences": top_sentences,
                    "domain": domain_short.get(outcome, ""),
                })

    summaries_by_domain = await rewrite_batch(domains_for_rewrite) if domains_for_rewrite else {}
    logger.info("  Step 9: %d domain summaries generated", len(summaries_by_domain))

    # ── Step 10: Save everything to DB ───────────────────────────────────
    logger.info("  Step 10: Saving to database...")

    # Determine file identifier and speaker
    file_id = filename
    # Use the dynamically identified doctor speaker from Step 2
    doctor_speaker = df_filtered["speaker"].iloc[0] if len(df_filtered) > 0 else "Unknown"
    patient_speaker = f"Patient_{Path(filename).stem}"

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    async with Session() as session:
        try:
            # 10a: transcript_analysis_log
            analysis_log = TranscriptAnalysisLog(
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

            # 10b: sentence_prediction (all top-N sentences × 5 domains)
            for outcome, top_df in final_results.items():
                sheet = OUTCOME_TO_SHEET[outcome]
                for _, row in top_df.iterrows():
                    session.add(SentencePrediction(
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

            # 10c: doctor_sentence_view (deduplicated: one row per sentence, best domain)
            for idx, ((i, i2, domain_full, text, speaker), score) in enumerate(zip(scorer_keys, scores_0_5)):
                session.add(DoctorSentenceView(
                    file=file_id,
                    i=i,
                    i2=i2,
                    speaker=speaker or doctor_speaker,
                    sentence=text,
                    score=float(score),
                    class_=domain_full,
                    time=now,
                ))

            # 10d: patient_summary
            domain_slot_map = {
                "cancer_prognosis": "1",
                "continence": "2",
                "erectile_dysfunction_potency": "3",
                "irritative_urinary_symptoms_frequency_urgency_nocturnia": "4",
                "life_expectancy": "5",
            }
            summary_kwargs = {
                "file": file_id,
                "speaker": patient_speaker,
            }
            for domain_full, slot in domain_slot_map.items():
                short = domain_short.get(domain_full, "")
                summary_kwargs[f"class_{slot}"] = domain_full
                summary_kwargs[f"summary_class_{slot}"] = summaries_by_domain.get(short, "")

            session.add(PatientSummary(**summary_kwargs))
            await session.flush()  # flush patient_summary before FK-dependent tables

            # 10e: patient_summary_scoring (initial NULLs)
            session.add(PatientSummaryScoring(
                file=file_id,
                speaker=patient_speaker,
            ))

            # 10f: patient_responses (initial NULLs)
            session.add(PatientResponses(
                file=file_id,
                speaker=patient_speaker,
            ))

            await session.commit()
            logger.info("  ✅ Saved: %d doctor sentences, %d predictions, 1 patient summary",
                        len(scorer_keys), sum(len(df) for df in final_results.values()))

        except Exception as e:
            await session.rollback()
            logger.error("  ❌ DB save failed: %s", e)
            return None

    return {
        "file": filename,
        "patient_id": patient_id,
        "total_sentences": total_sentences,
        "doctor_sentences": len(scorer_keys),
    }


async def run_pipeline(transcript_dir: str = None, single_file: str = None):
    """Run the full pipeline on all transcripts or a single file."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from models import Base

    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        logger.error("DATABASE_URL not set")
        sys.exit(1)

    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False)

    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    if single_file:
        files = [single_file]
    else:
        dir_path = transcript_dir or TRANSCRIPT_DIR
        if not os.path.isdir(dir_path):
            logger.error("Transcript directory not found: %s", dir_path)
            await engine.dispose()
            return
        files = [
            os.path.join(dir_path, f)
            for f in sorted(os.listdir(dir_path))
            if f.endswith(".xlsx") or f.endswith(".csv")
        ]

    if not files:
        logger.warning("No transcript files found")
        await engine.dispose()
        return

    logger.info("Found %d transcript files to process", len(files))

    results = []
    for filepath in files:
        result = await process_single_file(filepath, Session)
        if result:
            results.append(result)

    await engine.dispose()

    # Summary
    logger.info("")
    logger.info("=" * 60)
    logger.info("Pipeline Complete")
    logger.info("=" * 60)
    logger.info("  Files processed: %d / %d", len(results), len(files))
    for r in results:
        logger.info("    %s → %d sentences", r["file"], r["doctor_sentences"])
    logger.info("=" * 60)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Full transcript analysis pipeline")
    parser.add_argument("--dir", type=str, default=None, help="Transcript directory")
    parser.add_argument("--file", type=str, default=None, help="Single transcript file")
    args = parser.parse_args()

    asyncio.run(run_pipeline(transcript_dir=args.dir, single_file=args.file))
