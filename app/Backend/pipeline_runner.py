#!/usr/bin/env python3
"""Full Pipeline Runner — Thin Main.

Ivan's rules applied:
  - Thin main: each Step is ONE function call, no inline logic
  - Config-driven: all parameters from config.yaml
  - Pipeline ≠ DB: persistence is a separate module
  - Worker/Monitor: optional continuous scanning mode
  - Output folder: per-file subfolder structure for traceability

Usage:
  python pipeline_runner.py                          # Process all, then exit
  python pipeline_runner.py --dir /path/to/files     # Custom directory
  python pipeline_runner.py --file /path/to/one.xlsx # Single file
  python pipeline_runner.py --watch                  # Continuous monitoring mode
"""

import asyncio
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def process_single_file(
    filepath: str, Session, cfg: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Process one transcript through Steps 1-10. Each Step = one call.

    Ivan's Thin Main: no inline logic, no for-loops, no data processing.
    Every step delegates to its responsible module.
    """
    import transcript_service
    import scorer_service
    import rewriter_service
    import persistence

    filename = os.path.basename(filepath)

    # Skip if already processed
    if await persistence.file_already_processed(Session, filename):
        logger.info("[SKIP] Skipping %s — already in DB", filename)
        return None

    file_bytes = Path(filepath).read_bytes()
    logger.info("=" * 60)
    logger.info("Processing: %s", filename)
    logger.info("=" * 60)

    top_n = cfg["pipeline"]["top_n"]
    context_window = cfg["pipeline"]["context_window"]
    summary_top_k = cfg["scoring"]["summary_top_k"]

    # ── Step 1: Read transcript (xlsx or csv, with patient_id extraction) ──
    try:
        df_raw, patient_id = transcript_service.read_transcript(file_bytes, filename)
    except Exception as e:
        logger.error("  Skipping %s — cannot read: %s", filename, e)
        return None

    # ── Step 2: Identify & filter doctor ─────────────────────────────────
    df_filtered = transcript_service.filter_interviewer(df_raw)
    if len(df_filtered) == 0:
        logger.warning("  Skipping %s — no doctor utterances found", filename)
        return None

    # ── Step 3: Split into sentences ─────────────────────────────────────
    df_sentences = transcript_service.split_sentences(df_filtered)
    logger.info("  %d sentences after segmentation", len(df_sentences))

    # ── Step 4: NLP prediction (5 models, parallel) ──────────────────────
    df_predicted = await transcript_service.run_predictions(df_sentences)

    # ── Step 5: Select top-N per domain ──────────────────────────────────
    top_by_model = transcript_service.select_top_n(df_predicted, n=top_n)

    # ── Step 6: Generate context (single call, no for-loop in main) ──────
    final_results = transcript_service.generate_all_contexts(
        top_by_model, df_sentences, window=context_window
    )

    # ── Step 7: Export xlsx ──────────────────────────────────────────────
    xlsx_bytes = transcript_service.export_to_xlsx(final_results, patient_id)

    # ── Determine speakers ───────────────────────────────────────────────
    doctor_speaker = df_filtered["speaker"].iloc[0] if len(df_filtered) > 0 else "Unknown"
    patient_speaker = f"Patient_{Path(filename).stem}"

    # ── Step 8: Score sentences (single call to scorer_service) ──────────
    scorer_keys, scores = await scorer_service.run_scoring(
        df_sentences, final_results, doctor_speaker, _DOMAIN_SHORT_MAP
    )

    # ── Step 9: Rewrite patient summaries (single call to rewriter_service)
    summaries_by_domain = await rewriter_service.run_rewriting(
        final_results, summary_top_k, transcript_service.OUTCOME_TO_SHEET, _DOMAIN_SHORT_MAP
    )

    # ── Step 10: Save to DB ──────────────────────────────────────────────
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
        final_results=final_results,
        outcome_to_sheet=transcript_service.OUTCOME_TO_SHEET,
        scorer_keys=scorer_keys,
        scores=scores,
        summaries_by_domain=summaries_by_domain,
        domain_slot_map=_DOMAIN_SLOT_MAP,
        domain_short_map=_DOMAIN_SHORT_MAP,
    )

    # ── Save output files (traceability) ─────────────────────────────────
    _save_output_files(cfg, filename, patient_id, xlsx_bytes)

    if success:
        return {"file": filename, "patient_id": patient_id, "doctor_sentences": len(scorer_keys)}
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


def _save_output_files(cfg, filename, patient_id, xlsx_bytes):
    """Save output files to per-file subfolder (Ivan's traceability rule)."""
    output_dir = cfg.get("paths", {}).get("output_dir", "/app/data/output")
    stem = Path(filename).stem
    file_output_dir = Path(output_dir) / stem

    try:
        file_output_dir.mkdir(parents=True, exist_ok=True)
        (file_output_dir / f"{patient_id}_predictions.xlsx").write_bytes(xlsx_bytes)
        logger.info("  Output saved: %s/", file_output_dir)
    except Exception as e:
        logger.debug("  Output save skipped (non-fatal): %s", e)


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
        logger.info("    %s → %d sentences", r["file"], r["doctor_sentences"])
    logger.info("=" * 60)


async def run_worker(cfg: Dict[str, Any]):
    """Worker/Monitor mode — continuously scan for new transcripts.

    Ivan's rule: "continuously running, scanning folder, sleeping for an hour."
    """
    interval = cfg.get("worker", {}).get("scan_interval_seconds", 3600)
    logger.info("Worker mode: scanning every %d seconds", interval)

    while True:
        await run_pipeline(cfg)
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

    if args.watch or cfg.get("worker", {}).get("enabled", False):
        asyncio.run(run_worker(cfg))
    else:
        asyncio.run(run_pipeline(cfg, transcript_dir=args.dir, single_file=args.file))
