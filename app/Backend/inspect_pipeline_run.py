"""Inspect every NLP + AI pipeline stage for a single transcript.

Sister script to verify_pipeline_db.py. The verification script
answers "did everything pass?" with a PASS/FAIL summary; this script
answers "WHAT did each stage actually produce?" by dumping the rows
that landed in every table the pipeline writes to.

Use this when you have a specific transcript that produced unexpected
output and need to walk the pipeline state stage-by-stage to find
where things went wrong.

Usage (inside the backend container):
    python inspect_pipeline_run.py <patient_id_or_analysis_id> [--full] [--export json]

Examples:
    python inspect_pipeline_run.py SID_14
    python inspect_pipeline_run.py 42 --full
    python inspect_pipeline_run.py SID_14 --export sid14_dump.json

What it shows for the resolved analysis_id:
    NLP Step 0  raw transcript                       (nlp_pipeline_intermediate, JSONB)
    NLP Step 1  doctor-only filter                   (nlp_pipeline_intermediate, JSONB)
    NLP Step 2  sentence segmentation                (nlp_pipeline_intermediate, JSONB)
    NLP Step 3  per-sentence x 5-domain scores       (nlp_all_predictions)
    NLP Step 4  top-N per domain                     (nlp_pipeline_intermediate, JSONB)
    NLP Step 5  top-N + context                      (sentence_prediction)
    NLP Step 6  xlsx bytes                           (transcript_analysis_log.xlsx_data)
    AI  Sub 1-3 scoring + extraction + filtering     (llm_pipeline_intermediate)
    AI  Sub 4-5 selection + reformat                 (llm_domain_scoring_and_summary)
    AI  final   overall score + processed flag       (transcript_analysis_log)

Each stage prints a row count + sample rows. Use --full to dump every row.
"""

import argparse
import asyncio
import json
import sys
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

import models as M
from core.settings import get_settings


# ── Plain-text formatting helpers ──────────────────────────────────────────
# These render output that stays readable even when the script is
# piped to a pager (less, more) or saved to a file. No ANSI colours
# here on purpose — output is most often re-shared in tickets / Slack
# threads where escape codes look like garbage.
SEP = "=" * 78
SUB = "-" * 78


def _h(title: str) -> None:
    """Print a top-level section header (double rule)."""
    print(f"\n{SEP}\n  {title}\n{SEP}")


def _sub(title: str, count: int = None, note: str = "") -> None:
    """Print a sub-section header with optional row count and note."""
    suffix = ""
    if count is not None:
        suffix = f"  [{count} row{'s' if count != 1 else ''}]"
    if note:
        suffix += f"  {note}"
    print(f"\n{SUB}\n  {title}{suffix}\n{SUB}")


def _truncate(s, n: int = 80) -> str:
    """Trim long strings + replace newlines for single-line table cells."""
    if s is None:
        return "—"
    s = str(s).replace("\n", " ").strip()
    return s[: n - 3] + "..." if len(s) > n else s


def _kv(rows: list[dict], cols: list[str], limit: int = 5) -> None:
    """Print first `limit` rows of `rows`, only the columns in `cols`.

    Mini text-table renderer. Computes the per-column width from the
    actual data so columns line up vertically without dragging in a
    table library.
    """
    if not rows:
        print("  (empty)")
        return
    widths = {c: max(len(c), max((len(_truncate(r.get(c), 40)) for r in rows[:limit]), default=0)) for c in cols}
    header = "  | ".join(c.ljust(widths[c]) for c in cols)
    print(f"  {header}")
    print(f"  {'-' * len(header)}")
    for r in rows[:limit]:
        print("  " + "  | ".join(_truncate(r.get(c), 40).ljust(widths[c]) for c in cols))
    if len(rows) > limit:
        print(f"  ... ({len(rows) - limit} more)")


# ── Resolve analysis_id from CLI arg ───────────────────────────────────────
async def _resolve_analysis_id(db, arg: str) -> int | None:
    """Accept either a numeric analysis_id or a patient_id.

    For a patient_id we pick the MOST RECENT analysis (latest
    analyzed_at) — almost always what the operator means when they
    type a sid name.
    """
    if arg.isdigit():
        result = await db.execute(
            select(M.TranscriptAnalysisLog).where(M.TranscriptAnalysisLog.id == int(arg))
        )
        row = result.scalar_one_or_none()
        return row.id if row else None

    result = await db.execute(
        select(M.TranscriptAnalysisLog.id)
        .where(M.TranscriptAnalysisLog.patient_id == arg)
        .order_by(M.TranscriptAnalysisLog.analyzed_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


# ── Per-stage dump functions ───────────────────────────────────────────────
async def _dump_log_header(db, aid: int, full: bool) -> dict:
    """Print the parent transcript_analysis_log row + return key facts."""
    row = (await db.execute(
        select(M.TranscriptAnalysisLog).where(M.TranscriptAnalysisLog.id == aid)
    )).scalar_one()

    _h(f"transcript_analysis_log  (analysis_id = {aid})")
    print(f"  patient_id        : {row.patient_id}")
    print(f"  source_filename   : {row.source_filename}")
    print(f"  total_sentences   : {row.total_sentences}")
    print(f"  top_n             : {row.top_n}    context_window: {row.context_window}")
    print(f"  analyzed_at       : {row.analyzed_at}")
    print(f"  pipeline_started  : {row.pipeline_started_at}")
    print(f"  processed (AI)    : {row.processed}    processed_at: {row.processed_at}")
    print(f"  ai_overall_score  : {row.ai_overall_score}")
    print(f"  xlsx_data         : {len(row.xlsx_data) if row.xlsx_data else 0} bytes")
    # The dict we return is what gets serialised by --export, so keep
    # it compact (no DataFrames, no ORM objects).
    return {
        "analysis_id": aid,
        "patient_id": row.patient_id,
        "source_filename": row.source_filename,
        "ai_overall_score": row.ai_overall_score,
        "processed": row.processed,
        "xlsx_bytes": len(row.xlsx_data) if row.xlsx_data else 0,
    }


async def _dump_nlp_jsonb(db, aid: int, step: str, full: bool) -> Any:
    """Dump one JSONB step from nlp_pipeline_intermediate.

    Steps 0/1/2/4 of the NLP pipeline land here as JSONB blobs (one
    row per step). The blob is either a list (steps 0/1/2) or a dict-
    of-lists keyed by domain (step 4).
    """
    row = (await db.execute(
        select(M.NLPPipelineIntermediate)
        .where(M.NLPPipelineIntermediate.analysis_id == aid)
        .where(M.NLPPipelineIntermediate.step == step)
    )).scalar_one_or_none()

    if row is None:
        # Pre-migration analyses do not have these rows. Print a clear
        # marker rather than crashing — operator can decide whether to
        # backfill or just inspect later stages.
        _sub(f"NLP step='{step}' (JSONB)", 0, note="(MISSING — analysis ran before migration 006)")
        return None

    payload = row.payload
    n = len(payload) if isinstance(payload, list) else (sum(len(v) for v in payload.values()) if isinstance(payload, dict) else 0)
    _sub(f"NLP step='{step}' (JSONB)", n, note=f"row_count column = {row.row_count}")
    if isinstance(payload, list):
        # Steps 0/1/2: flat list of row dicts.
        sample = payload[: (None if full else 3)]
        for i, p in enumerate(sample):
            print(f"  [{i}] " + ", ".join(f"{k}={_truncate(v, 30)}" for k, v in list(p.items())[:6]))
        if not full and len(payload) > 3:
            print(f"  ... ({len(payload) - 3} more rows; use --full to see all)")
    elif isinstance(payload, dict):
        # Step 4: dict of lists, one entry per domain.
        for domain, rows in payload.items():
            print(f"  domain='{domain}': {len(rows)} rows")
            if full:
                for r in rows:
                    print(f"     {_truncate(r.get('text'), 70)}  pred={r.get('.pred_1')}")
    return {"step": step, "row_count": row.row_count}


async def _dump_nlp_step3(db, aid: int, full: bool) -> dict:
    """Dump nlp_all_predictions — every sentence × 5 model scores."""
    rows = (await db.execute(
        select(M.NLPAllPredictions)
        .where(M.NLPAllPredictions.analysis_id == aid)
        .order_by(M.NLPAllPredictions.sentence_index)
    )).scalars().all()

    _sub("NLP Step 3 — nlp_all_predictions (every sentence x 5 domain scores)", len(rows),
         note="(MISSING — pre-migration analysis)" if not rows else "")
    if not rows:
        return {"step3_rows": 0}

    dicts = [
        {"idx": r.sentence_index, "text": r.sentence_text,
         "cp": r.pred_cp, "le": r.pred_le, "ed": r.pred_ed, "inc": r.pred_inc, "ius": r.pred_ius}
        for r in rows
    ]
    limit = len(dicts) if full else 5
    _kv(dicts, ["idx", "text", "cp", "le", "ed", "inc", "ius"], limit=limit)
    return {"step3_rows": len(rows)}


async def _dump_nlp_step5(db, aid: int, full: bool) -> dict:
    """Dump sentence_prediction — top-N per domain with context."""
    rows = (await db.execute(
        select(M.SentencePrediction)
        .where(M.SentencePrediction.analysis_id == aid)
        .order_by(M.SentencePrediction.model, M.SentencePrediction.pred_score.desc())
    )).scalars().all()

    _sub("NLP Step 5 — sentence_prediction (top-N + context)", len(rows))
    # Group by model so the operator sees "for cp these 10 sentences,
    # for le those 10, ..." rather than a flat 50-row list.
    by_domain: dict[str, list[dict]] = {}
    for r in rows:
        by_domain.setdefault(r.model, []).append({
            "idx": r.sentence_index, "score": round(r.pred_score, 4),
            "text": r.sentence_text, "context": r.context,
        })
    for domain, items in by_domain.items():
        print(f"\n  domain='{domain}' ({len(items)} rows):")
        _kv(items, ["idx", "score", "text"], limit=(len(items) if full else 3))
    return {"step5_rows": len(rows), "step5_per_domain": {d: len(v) for d, v in by_domain.items()}}


async def _dump_ai_intermediate(db, aid: int, full: bool) -> dict:
    """Dump llm_pipeline_intermediate — every LLM-scored candidate."""
    rows = (await db.execute(
        select(M.LLMPipelineIntermediate)
        .where(M.LLMPipelineIntermediate.analysis_id == aid)
        .order_by(M.LLMPipelineIntermediate.domain, M.LLMPipelineIntermediate.ai_score.desc().nulls_last())
    )).scalars().all()

    _sub("AI Sub 1-3 — llm_pipeline_intermediate (scoring + extraction + filtering)", len(rows),
         note="(MISSING — pre-migration analysis)" if not rows else "")
    if not rows:
        return {"ai_intermediate_rows": 0}

    by_domain: dict[str, list[dict]] = {}
    for r in rows:
        by_domain.setdefault(r.domain, []).append({
            "idx": r.sentence_index, "ai": r.ai_score, "pred": r.pred_score,
            "estimate": r.estimate, "treatment": r.treatment,
            # Y/N is more readable than True/False in the table.
            "survived": "Y" if r.survived_filter else "N",
            "text": r.sentence_text,
        })
    for domain, items in by_domain.items():
        survived = sum(1 for i in items if i["survived"] == "Y")
        print(f"\n  domain='{domain}' ({len(items)} candidates, {survived} survived):")
        _kv(items, ["idx", "ai", "survived", "estimate", "treatment", "text"],
            limit=(len(items) if full else 5))
    return {
        "ai_intermediate_rows": len(rows),
        "ai_intermediate_per_domain": {d: {"total": len(v), "survived": sum(1 for i in v if i["survived"] == "Y")} for d, v in by_domain.items()},
    }


async def _dump_ai_final(db, aid: int, full: bool) -> dict:
    """Dump llm_domain_scoring_and_summary — final patient-visible rows."""
    rows = (await db.execute(
        select(M.LLMDomainScoringAndSummary)
        .where(M.LLMDomainScoringAndSummary.analysis_id == aid)
        .order_by(M.LLMDomainScoringAndSummary.domain)
    )).scalars().all()

    _sub("AI Sub 4-5 — llm_domain_scoring_and_summary (final selection + reformat)", len(rows))
    if not rows:
        return {"ai_final_rows": 0}
    for r in rows:
        print(f"\n  domain='{r.domain}'  ai_score={r.ai_score}  estimate='{r.extracted_estimate}'  treatment='{r.treatment}'")
        print(f"     source : {_truncate(r.source_sentence, 100)}")
        print(f"     reformat: {_truncate(r.reformat_sentence, 100)}")
        if full:
            # --full prints the surrounding context + the LLM's
            # explanation for the score — long fields, only worth
            # showing when the operator explicitly asked.
            print(f"     context : {_truncate(r.source_context, 200)}")
            print(f"     why     : {_truncate(r.score_explanation, 200)}")
    return {"ai_final_rows": len(rows)}


# ── Main ───────────────────────────────────────────────────────────────────
async def main(arg: str, full: bool, export: str | None) -> int:
    # core.settings validates DATABASE_URL (must use the +asyncpg
    # driver) and fails the Settings constructor when the env var is
    # missing or malformed. Catch that here so the CLI keeps its
    # int-exit-code contract instead of a bare stack trace.
    try:
        db_url = get_settings().database_url
    except Exception as e:
        print(f"ERROR: backend configuration invalid: {e}", file=sys.stderr)
        return 2

    engine = create_async_engine(db_url, future=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        aid = await _resolve_analysis_id(db, arg)
        if aid is None:
            print(f"ERROR: no analysis found for '{arg}' (try patient_id or numeric analysis_id)", file=sys.stderr)
            return 1

        # Walk every stage of the pipeline in pipeline order so the
        # output reads like a journey through the data: raw -> filtered
        # -> scored -> selected -> rewritten.
        summary = await _dump_log_header(db, aid, full)

        _h("NLP PIPELINE — intermediate stages")
        s_raw = await _dump_nlp_jsonb(db, aid, "raw", full)
        s_filt = await _dump_nlp_jsonb(db, aid, "filtered", full)
        s_sent = await _dump_nlp_jsonb(db, aid, "sentences", full)
        s_step3 = await _dump_nlp_step3(db, aid, full)
        s_top = await _dump_nlp_jsonb(db, aid, "top_by_model", full)
        s_step5 = await _dump_nlp_step5(db, aid, full)

        _h("AI PIPELINE — intermediate + final")
        s_ai_int = await _dump_ai_intermediate(db, aid, full)
        s_ai_fin = await _dump_ai_final(db, aid, full)

        _h("END")
        print(f"  Stage row counts:  step3={s_step3['step3_rows']}  step5={s_step5['step5_rows']}  "
              f"ai_intermediate={s_ai_int['ai_intermediate_rows']}  ai_final={s_ai_fin['ai_final_rows']}")
        print(f"  AI overall score:  {summary['ai_overall_score']}    processed={summary['processed']}")

        if export:
            # Roll the per-stage summary dicts into one JSON blob.
            # default=str so datetimes/Decimals serialise without us
            # needing custom encoders.
            full_dump = {**summary, **s_step3, **s_step5, **s_ai_int, **s_ai_fin,
                         "jsonb_steps_present": [s for s in [s_raw, s_filt, s_sent, s_top] if s]}
            with open(export, "w") as f:
                json.dump(full_dump, f, indent=2, default=str)
            print(f"\n  Exported summary to {export}")

    await engine.dispose()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", help="patient_id (e.g. SID_14) or numeric analysis_id (e.g. 42)")
    parser.add_argument("--full", action="store_true", help="print every row instead of samples")
    parser.add_argument("--export", metavar="FILE.json", help="write a JSON summary to FILE.json")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.target, args.full, args.export)))
