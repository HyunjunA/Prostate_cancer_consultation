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
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

import io

import pandas as pd

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── Constants (matches R pipeline outcome names) ─────────────────────────────

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
    """
    import re

    path = Path(filepath)
    suffix = path.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(path)
    else:
        df = pd.read_excel(path, engine="openpyxl")

    # Validate required columns (same check as read_input_file)
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
    """Convert final_results dict to in-memory xlsx bytes for DB storage."""
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        for outcome, df in final_results.items():
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

    # Patch: sentence_classification modules import "from config import MODEL_TO_FULL"
    # but Docker's /app/config.py is the Backend config, not the pipeline config.
    # Inject a shim module so sentence_classification finds the right constants.
    import types
    _sc_config = types.ModuleType("sc_config")
    _sc_config.MODEL_TO_FULL = {
        "cp": "cancer_prognosis",
        "le": "life_expectancy",
        "ed": "erectile_dysfunction_potency",
        "inc": "continence",
        "ius": "irritative_urinary_symptoms_frequency_urgency_nocturnia",
    }
    _sc_config.MODEL_TO_SHEET = {v: k for k, v in OUTCOME_TO_SHEET.items()}
    _sc_config.SHEET_ORDER = ["cp", "inc", "ed", "ius", "le"]

    # Temporarily replace 'config' in sys.modules for sentence_classification imports
    _orig_config = sys.modules.get("config")
    sys.modules["config"] = _sc_config

    from sentence_classification.preprocessing import identify_doctor_speaker, filter_doctor_rows
    from sentence_classification.segmentation import segment_sentences
    from sentence_classification.classification import classify_all_models
    from sentence_classification.selection import select_top_sentences_all_outcomes
    from sentence_classification.context import add_context_all_outcomes
    # AI repo's export module — also writes nested output_test-compatible format
    # into a separate directory (NESTED_OUTPUT_DIR, default = AI repo's data/output).
    # Import inside the shim so its own `from config import ...` resolves correctly.
    from sentence_classification.export import (
        export_intermediate_files as _ai_export_intermediate_files,
        export_final_csv as _ai_export_final_csv,
    )
    # Stash on the module so _save_output_files can reach them after the shim is restored.
    sys.modules[__name__]._ai_export_intermediate_files = _ai_export_intermediate_files
    sys.modules[__name__]._ai_export_final_csv = _ai_export_final_csv

    # Restore original config module
    if _orig_config is not None:
        sys.modules["config"] = _orig_config
    else:
        del sys.modules["config"]

    filename = os.path.basename(filepath)

    # Skip if already processed
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
        logger.error("  Skipping %s — cannot read: %s", filename, e)
        return None

    # ── Step 2: Identify & filter doctor (sentence_classification) ───────
    doctor = identify_doctor_speaker(df_raw, "speaker", "text")
    df_filtered = filter_doctor_rows(df_raw, "speaker", "text", doctor=doctor)
    if len(df_filtered) == 0:
        logger.warning("  Skipping %s — no doctor utterances found", filename)
        return None

    # ── Step 3: Sentence segmentation (R stringi via rpy2) ───────────────
    df_sentences = segment_sentences(df_filtered, text_col="text")
    logger.info("  %d sentences after segmentation (R stringi)", len(df_sentences))

    # ── Step 4: NLP prediction (5 models) ────────────────────────────────
    df_predicted = await asyncio.to_thread(
        classify_all_models, df_sentences,
        outcomes=outcomes, base_url=nlp_url, text_col="text",
    )

    # ── Step 5: Select top-N per domain ──────────────────────────────────
    top_by_model = select_top_sentences_all_outcomes(
        df_predicted, outcomes=outcomes, k=top_n,
    )

    # ── Step 6: Generate context ─────────────────────────────────────────
    final_results = add_context_all_outcomes(
        df_sentences, top_by_model, window=context_window,
    )

    # ── Convert keys: sentence_classification uses short names (cp, le, ...)
    #    but persistence.save_all expects full names (cancer_prognosis, ...)
    _short_to_full = {v: k for k, v in OUTCOME_TO_SHEET.items()}
    final_results = {_short_to_full.get(k, k): v for k, v in final_results.items()}

    # ── Step 7: Export xlsx (in-memory bytes for DB) ─────────────────────
    xlsx_bytes = _export_to_xlsx_bytes(final_results)

    # ── Determine speakers ───────────────────────────────────────────────
    doctor_speaker = df_filtered["speaker"].iloc[0] if len(df_filtered) > 0 else "Unknown"
    patient_speaker = f"Patient_{Path(filename).stem}"

    # ── Step 8: Save to DB (processed=False, AI pipeline not yet run) ───
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

    # ── Save output files (traceability) ─────────────────────────────────
    _save_output_files(
        cfg, filename, patient_id, xlsx_bytes,
        df_raw=df_raw,
        df_filtered=df_filtered,
        df_sentences=df_sentences,
        df_predicted=df_predicted,
        top_by_model=top_by_model,
        final_results=final_results,
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


def _save_output_files(cfg, filename, patient_id, xlsx_bytes,
                       df_raw=None, df_filtered=None, df_sentences=None,
                       df_predicted=None, top_by_model=None, final_results=None):
    """Save output files to per-file subfolder (Ivan's traceability rule).

    Saves all intermediate results for debugging and traceability:
      - step0_raw.csv           (original input)
      - step1_filtered.csv      (doctor utterances only)
      - step2_sentences.csv     (sentence segmentation)
      - step3_predictions.csv   (NLP 5-model scores)
      - step4_top10.xlsx        (top-K per domain)
      - step5_top10_context.xlsx (top-K + surrounding context)
      - {patient_id}_predictions.xlsx (combined final xlsx)
    """
    output_dir = cfg.get("paths", {}).get("output_dir", "/app/data/output")
    stem = Path(filename).stem
    file_output_dir = Path(output_dir) / stem

    try:
        file_output_dir.mkdir(parents=True, exist_ok=True)

        # Existing: combined xlsx
        (file_output_dir / f"{patient_id}_predictions.xlsx").write_bytes(xlsx_bytes)

        # Step 0: Raw input
        if df_raw is not None:
            df_raw.to_csv(file_output_dir / "step0_raw.csv", index=False)

        # Step 1: Doctor-filtered utterances
        if df_filtered is not None:
            df_filtered.to_csv(file_output_dir / "step1_filtered.csv", index=False)

        # Step 2: Segmented sentences
        if df_sentences is not None:
            df_sentences.to_csv(file_output_dir / "step2_sentences.csv", index=False)

        # Step 3: NLP predictions (all 5 models)
        if df_predicted is not None:
            df_predicted.to_csv(file_output_dir / "step3_predictions.csv", index=False)

        # Step 4: Top-K selection per domain
        if top_by_model is not None:
            with pd.ExcelWriter(file_output_dir / "step4_top10.xlsx") as w:
                for domain, df in top_by_model.items():
                    sheet = domain[:31]  # Excel sheet name max 31 chars
                    df.to_excel(w, sheet_name=sheet, index=False)

        # Step 5: Top-K with context
        if final_results is not None:
            with pd.ExcelWriter(file_output_dir / "step5_top10_context.xlsx") as w:
                for domain, df in final_results.items():
                    sheet = domain[:31]
                    df.to_excel(w, sheet_name=sheet, index=False)

        logger.info("  Output saved: %s/ (step0-step5 + xlsx)", file_output_dir)
    except Exception as e:
        logger.debug("  Output save skipped (non-fatal): %s", e)

    # Also produce AI repo's nested format (output_test compatible) into a
    # separate directory so the result can be diffed against output_test/.
    nested_dir = cfg.get("paths", {}).get("nested_output_dir")
    _intermediate = globals().get("_ai_export_intermediate_files")
    _final = globals().get("_ai_export_final_csv")
    if nested_dir and _intermediate and _final and df_sentences is not None and df_predicted is not None and final_results is not None:
        try:
            Path(nested_dir).mkdir(parents=True, exist_ok=True)
            _intermediate(
                segmented_df=df_sentences,
                predictions_df=df_predicted,
                top_dfs=final_results,
                output_path=str(nested_dir),
                folder_name=stem,
            )
            _final(
                top_dfs=final_results,
                folder_name=stem,
                output_path=str(nested_dir),
            )
            logger.info("  Nested output saved: %s/%s/ (step2-5 + final/, output_test compatible)", nested_dir, stem)
        except Exception as e:
            logger.warning("  Nested output save skipped (non-fatal): %s", e)


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
