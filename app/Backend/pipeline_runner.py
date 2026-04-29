#!/usr/bin/env python3
"""Full Pipeline Runner — Thin Main.

Ivan's rules applied:
  - Thin main: each Step is ONE function call, no inline logic
  - Config-driven: all parameters from config.yaml
  - Pipeline ≠ DB: persistence is a separate module
  - Worker/Monitor: optional continuous scanning mode
  - Output folder: per-file subfolder structure for traceability

What this script orchestrates (high level):
    transcript file (.xlsx / .csv)
       │
       ▼
    Step 1: read file -> DataFrame + patient_id
    Step 2: identify the doctor + filter to doctor utterances
    Step 3: split utterances into sentences (R stringi via rpy2)
    Step 4: classify every sentence with all 5 NLP models
    Step 5: pick top-N sentences per domain
    Step 6: attach surrounding context to each top sentence
    Step 7: write per-file output folder (xlsx + intermediate csvs)
    Step 8: build in-memory xlsx bytes for DB-side download
    Step 9: persistence.save_all() -> 6 PostgreSQL tables
    Step 9b: ai_pipeline_service.run_ai_scoring_and_summary() -> LLM stage

Each Step is exactly ONE function call here; the heavy logic lives in
sentence_classification/ (NLP), persistence.py (DB), and ai_pipeline_service.py
(LLM). This file is the conductor.

Usage:
  python pipeline_runner.py                          # Process all, then exit
  python pipeline_runner.py --dir /path/to/files     # Custom directory
  python pipeline_runner.py --file /path/to/one.xlsx # Single file
  python pipeline_runner.py --watch                  # Continuous monitoring mode
"""

import asyncio
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv

import io

import pandas as pd

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── Constants (matches R pipeline outcome names) ─────────────────────────────
# These mappings translate between the two naming conventions used
# upstream:
#   - Long names ("cancer_prognosis", ...) come from the AI repo's
#     classification module and feed persistence.save_all().
#   - Short codes ("cp", ...) are what sentence_classification.export
#     and the NLP container both use.
# pipeline_runner is the seam — we accept both and translate as needed.

OUTCOME_TO_SHEET = {
    "cancer_prognosis": "cp",
    "continence": "inc",
    "erectile_dysfunction_potency": "ed",
    "irritative_urinary_symptoms_frequency_urgency_nocturnia": "ius",
    "life_expectancy": "le",
}


def _read_transcript(filepath: str, filename: str):
    """Read transcript file identically to sentence_classification's read_input_file.

    Mirrors the exact logic of AI_physician_patient_communication/utils/file_manager.py
    read_input_file() — no column normalization, no text stripping — so that
    sentence segmentation via R stringi produces identical results.

    Patient ID extraction order:
      1. "processed_transcripts_<id>" pattern -> use the suffix.
      2. "SID 14" / "SID14" pattern -> "SID_14".
      3. Fallback: file stem with whitespace -> underscore.
    """
    import re

    path = Path(filepath)
    suffix = path.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(path)
    else:
        df = pd.read_excel(path, engine="openpyxl")

    # Validate required columns (same check as read_input_file).
    # Failing here gives a clean per-file error instead of a cryptic
    # KeyError several steps deeper.
    if "speaker" not in df.columns or "text" not in df.columns:
        raise ValueError(f"Missing 'speaker' or 'text' columns in {filename}")

    # Extract patient_id (same logic as extract_patient_id)
    stem = path.stem
    match = re.search(r"processed_transcripts_(.+)", stem)
    if match:
        patient_id = match.group(1)
    else:
        match = re.search(r"SID\s*(\d+)", stem, re.IGNORECASE)
        if match:
            patient_id = f"SID_{match.group(1)}"
        else:
            patient_id = re.sub(r"\s+", "_", stem)

    return df, patient_id


def _export_to_xlsx_bytes(final_results) -> bytes:
    """Convert final_results dict to in-memory xlsx bytes for DB storage.

    We never touch the disk here — the bytes go directly into
    transcript_analysis_log.xlsx_data so the backend can serve
    "download original analysis" without a shared filesystem.
    """
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        for outcome, df in final_results.items():
            # Excel sheet names cap at 31 chars — slice defensively.
            sheet = OUTCOME_TO_SHEET.get(outcome, outcome)[:31]
            df.to_excel(writer, sheet_name=sheet, index=False)
    return output.getvalue()


async def process_single_file(
    filepath: str, Session, cfg: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Process one transcript through Steps 1-9. Each Step = one call.

    Uses sentence_classification/ modules (R stringi for sentence segmentation)
    instead of transcript_service.py to guarantee identical results with the
    original R pipeline.
    """
    import persistence
    import ai_pipeline_service

    # sentence_classification submodules are imported once at process startup
    # by sentence_classification_loader, which handles the `config` name
    # collision the upstream package introduces. See that module's docstring
    # for the rationale and the previous race-prone behavior.
    from sentence_classification_loader import (
        identify_doctor_speaker,
        filter_doctor_rows,
        segment_sentences,
        classify_all_models,
        select_top_sentences_all_outcomes,
        add_context_all_outcomes,
        export_intermediate_files,
        export_final_csv,
    )

    filename = os.path.basename(filepath)

    # Skip files we have already processed — saves time when --watch
    # mode rescans a folder full of older transcripts.
    if await persistence.file_already_processed(Session, filename):
        logger.info("[SKIP] Skipping %s — already in DB", filename)
        return None

    from datetime import datetime, timezone
    pipeline_started_at = datetime.now(timezone.utc)

    logger.info("=" * 60)
    logger.info("Processing: %s", filename)
    logger.info("=" * 60)

    top_n = cfg["pipeline"]["top_n"]
    context_window = cfg["pipeline"]["context_window"]
    nlp_url = cfg.get("nlp", {}).get("api_url", "http://nlp-classifiers:8000")
    outcomes = list(OUTCOME_TO_SHEET.values())  # ["cp", "inc", "ed", "ius", "le"]

    # ── Step 1: Read transcript (xlsx or csv) ────────────────────────────
    try:
        df_raw, patient_id = _read_transcript(filepath, filename)
    except Exception as e:
        # Per-file error → log + return None. The outer loop continues
        # with the next file rather than aborting the whole batch.
        logger.error("  Skipping %s — cannot read: %s", filename, e)
        return None

    # ── Step 2: Identify & filter doctor (sentence_classification) ───────
    # `identify_doctor_speaker` uses heuristics on the speaker column
    # to pick the doctor (longest speaker label, most utterances, etc.).
    doctor = identify_doctor_speaker(df_raw, "speaker", "text")
    df_filtered = filter_doctor_rows(df_raw, "speaker", "text", doctor=doctor)
    if len(df_filtered) == 0:
        logger.warning("  Skipping %s — no doctor utterances found", filename)
        return None

    # ── Step 3: Sentence segmentation (R stringi via rpy2) ───────────────
    # Run R's stringi tokenizer for byte-perfect parity with the
    # original R pipeline (Python's nltk produces slightly different
    # boundaries on edge cases).
    df_sentences = segment_sentences(df_filtered, text_col="text")
    logger.info("  %d sentences after segmentation (R stringi)", len(df_sentences))

    # ── Step 4: NLP prediction (5 models) ────────────────────────────────
    # classify_all_models is sync (uses requests under the hood). Run
    # it in a worker thread so the asyncio loop can keep handling the
    # outer pipeline orchestration.
    df_predicted = await asyncio.to_thread(
        classify_all_models, df_sentences,
        outcomes=outcomes, base_url=nlp_url, text_col="text",
    )

    # ── Step 5: Select top-N per domain ──────────────────────────────────
    top_by_model = select_top_sentences_all_outcomes(
        df_predicted, outcomes=outcomes, k=top_n,
    )

    # ── Step 6: Generate context ─────────────────────────────────────────
    # final_results keeps the SHORT names (cp/le/ed/inc/ius) that
    # sentence_classification produces — that's exactly what AI repo's
    # export.py expects, so no mutation.
    final_results = add_context_all_outcomes(
        df_sentences, top_by_model, window=context_window,
    )

    # ── Step 7: Save output via AI repo's export module (single source of truth) ──
    # Calls sentence_classification.export directly — produces
    # data/output/<file-stem>/{step2_segmentation, step3_classification,
    # step4_selection, step5_context, final}/ exactly like data/output_test.
    output_dir = cfg.get("paths", {}).get("output_dir")
    if output_dir and df_sentences is not None and df_predicted is not None:
        try:
            Path(output_dir).mkdir(parents=True, exist_ok=True)
            stem = Path(filename).stem
            export_intermediate_files(
                segmented_df=df_sentences,
                predictions_df=df_predicted,
                top_dfs=final_results,
                output_path=str(output_dir),
                folder_name=stem,
            )
            export_final_csv(
                top_dfs=final_results,
                folder_name=stem,
                output_path=str(output_dir),
            )
            logger.info("  Output saved: %s/%s/ (nested format, output_test compatible)", output_dir, stem)
        except Exception as e:
            # Disk export is non-fatal — DB save below still happens.
            logger.warning("  Output save failed (non-fatal): %s", e)

    # ── Build LONG-keyed view for persistence.save_all ───────────────────
    # persistence.save_all expects full names (cancer_prognosis, …);
    # build a view here without mutating the original SHORT-keyed dict.
    _short_to_full = {v: k for k, v in OUTCOME_TO_SHEET.items()}
    final_results_long = {_short_to_full.get(k, k): v for k, v in final_results.items()}

    # ── Step 8: Export xlsx (in-memory bytes for DB) ─────────────────────
    xlsx_bytes = _export_to_xlsx_bytes(final_results_long)

    # ── Determine speakers ───────────────────────────────────────────────
    # `doctor_speaker`: read from the filtered df (the actual doctor
    # label appearing in the transcript).
    # `patient_speaker`: derived from filename — every patient's data
    # uses one consistent speaker label across surveys, etc.
    doctor_speaker = df_filtered["speaker"].iloc[0] if len(df_filtered) > 0 else "Unknown"
    patient_speaker = f"Patient_{Path(filename).stem}"

    # ── Step 9: Save to DB (processed=False, AI pipeline not yet run) ───
    # persistence.save_all owns the actual INSERT/UPSERT logic. It
    # writes 6 tables in one transaction; returns False if anything
    # failed (rollback already applied).
    success = await persistence.save_all(
        Session,
        filename=filename,
        patient_id=patient_id,
        doctor_speaker=doctor_speaker,
        patient_speaker=patient_speaker,
        total_sentences=len(df_sentences),
        top_n=top_n,
        context_window=context_window,
        xlsx_bytes=xlsx_bytes,
        final_results=final_results_long,
        outcome_to_sheet=OUTCOME_TO_SHEET,
        domain_slot_map=_DOMAIN_SLOT_MAP,
        domain_short_map=_DOMAIN_SHORT_MAP,
        pipeline_started_at=pipeline_started_at,
        df_raw=df_raw,
        df_filtered=df_filtered,
        df_sentences=df_sentences,
        df_predicted=df_predicted,
        top_by_model=top_by_model,
    )

    # ── Step 9: AI pipeline — GPT-4o scoring + patient summary rewriting ──
    #    Uses Guille's ai_pipeline module (volume-mounted from
    #    AI_physician_patient_communication/ai_pipeline/).
    #    Non-blocking: if Azure OpenAI is unavailable, pipeline still completes.
    if success:
        try:
            # Get analysis_id from the DB record just saved
            analysis_id = await persistence.get_latest_analysis_id(Session, patient_id)
            if analysis_id:
                ai_ok = await ai_pipeline_service.run_ai_scoring_and_summary(
                    Session,
                    analysis_id=analysis_id,
                    patient_id=patient_id,
                    source_filename=filename,
                    final_results=final_results,
                    outcome_to_sheet=OUTCOME_TO_SHEET,
                )
                if ai_ok:
                    logger.info("  [OK] AI pipeline: scoring + patient summary saved")
                else:
                    logger.info("  [SKIP] AI pipeline: not available or failed (non-blocking)")
        except Exception as e:
            # AI stage failure does NOT roll back the NLP rows we
            # already saved — those are still useful on their own.
            logger.warning("  [SKIP] AI pipeline error (non-blocking): %s", e)

    if success:
        return {"file": filename, "patient_id": patient_id, "total_sentences": len(df_sentences)}
    return None


# ── Domain mappings (used by persistence) ────────────────────────────────────

_DOMAIN_SHORT_MAP = {
    "cancer_prognosis": "cp",
    "continence": "inc",
    "erectile_dysfunction_potency": "ed",
    "irritative_urinary_symptoms_frequency_urgency_nocturnia": "ius",
    "life_expectancy": "le",
}

_DOMAIN_SLOT_MAP = {
    "cancer_prognosis": "1",
    "continence": "2",
    "erectile_dysfunction_potency": "3",
    "irritative_urinary_symptoms_frequency_urgency_nocturnia": "4",
    "life_expectancy": "5",
}




# ── Main: single run or worker/monitor ───────────────────────────────────────

async def run_pipeline(cfg: Dict[str, Any], transcript_dir: str = None, single_file: str = None):
    """Run pipeline on all transcripts or a single file."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    import models

    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        logger.error("DATABASE_URL not set")
        sys.exit(1)

    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False)

    # Idempotent: if tables already exist, create_all is a no-op.
    # Lets pipeline_runner work against a fresh DB without first
    # running init_db.py.
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    if single_file:
        files = [single_file]
    else:
        dir_path = transcript_dir or cfg.get("paths", {}).get("transcript_dir", "/app/data/transcripts")
        if not os.path.isdir(dir_path):
            logger.warning("Transcript directory not found: %s", dir_path)
            await engine.dispose()
            return
        files = sorted([
            os.path.join(dir_path, f)
            for f in os.listdir(dir_path)
            if f.endswith(".xlsx") or f.endswith(".csv")
        ])

    if not files:
        logger.warning("No transcript files found")
        await engine.dispose()
        return

    logger.info("Found %d transcript files to process", len(files))

    # Sequential processing — predictable resource usage and easier
    # log reading. For high-volume batches we could use asyncio.gather
    # with a Semaphore later if throughput becomes the bottleneck.
    results = []
    for filepath in files:
        result = await process_single_file(filepath, Session, cfg)
        if result:
            results.append(result)

    await engine.dispose()

    logger.info("")
    logger.info("=" * 60)
    logger.info("Pipeline Complete")
    logger.info("=" * 60)
    logger.info("  Files processed: %d / %d", len(results), len(files))
    for r in results:
        logger.info("    %s → %d sentences", r["file"], r["total_sentences"])
    logger.info("=" * 60)


async def run_worker(cfg: Dict[str, Any]):
    """Worker/Monitor mode — continuously scan for new transcripts.

    Ivan's rule: "continuously running, scanning folder, sleeping for an hour."
    """
    interval = cfg.get("worker", {}).get("scan_interval_seconds", 3600)
    logger.info("Worker mode: scanning every %d seconds", interval)

    while True:
        await run_pipeline(cfg)
        # Sleep BETWEEN scans rather than running tightly — gives the
        # operator a window to land new files without us holding any
        # DB connection.
        logger.info("Sleeping %d seconds until next scan...", interval)
        await asyncio.sleep(interval)


if __name__ == "__main__":
    import argparse
    import config

    parser = argparse.ArgumentParser(description="Full transcript analysis pipeline")
    parser.add_argument("--dir", type=str, default=None, help="Transcript directory")
    parser.add_argument("--file", type=str, default=None, help="Single transcript file")
    parser.add_argument("--watch", action="store_true", help="Continuous monitoring mode")
    parser.add_argument("--config", type=str, default=None, help="Config file path")
    args = parser.parse_args()

    cfg = config.load_config(args.config)

    # --watch on the CLI OR worker.enabled in YAML triggers worker
    # mode; either is enough so ops can flip the switch without code.
    if args.watch or cfg.get("worker", {}).get("enabled", False):
        asyncio.run(run_worker(cfg))
    else:
        asyncio.run(run_pipeline(cfg, transcript_dir=args.dir, single_file=args.file))
