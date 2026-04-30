"""Standalone analysis inspector — Phase 5.

Mirrors app/Backend/inspect_pipeline_run.py but runs as a plain script
against the native PostgreSQL. Dumps every NLP + AI stage for one
analysis (or one patient).

Usage:
    source .venv/bin/activate
    python scripts/show.py --analysis-id 5
    python scripts/show.py --patient-id SID_10
    python scripts/show.py --patient-id SID_10 --full

Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 5)
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / "app" / "Backend" / ".env.native"

try:
    from dotenv import load_dotenv
    load_dotenv(ENV_FILE)
except ImportError:
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

SEP = "=" * 78
SUB = "-" * 78


def _h(t: str): print(f"\n{SEP}\n  {t}\n{SEP}")
def _sub(t: str, n: int = None, note: str = ""):
    s = ""
    if n is not None: s = f"  [{n} row{'s' if n != 1 else ''}]"
    if note: s += f"  {note}"
    print(f"\n{SUB}\n  {t}{s}\n{SUB}")


def _trunc(s, n=80):
    if s is None: return "—"
    s = str(s).replace("\n", " ").strip()
    return s[:n - 3] + "..." if len(s) > n else s


async def _resolve_aid(db, args) -> int | None:
    if args.analysis_id is not None:
        r = (await db.execute(text("SELECT id FROM transcript_analysis_log WHERE id=:aid"),
                              {"aid": args.analysis_id})).scalar_one_or_none()
        return r
    if args.patient_id:
        r = (await db.execute(text("""
            SELECT id FROM transcript_analysis_log
            WHERE patient_id=:pid ORDER BY analyzed_at DESC LIMIT 1
        """), {"pid": args.patient_id})).scalar_one_or_none()
        return r
    return None


async def main(args) -> int:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        return 2

    engine = create_async_engine(db_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        aid = await _resolve_aid(db, args)
        if aid is None:
            print(f"ERROR: no analysis found for arg(s)", file=sys.stderr)
            await engine.dispose()
            return 1

        log = (await db.execute(text("""
            SELECT id, patient_id, source_filename, total_sentences, top_n,
                   context_window, analyzed_at, processed, processed_at,
                   ai_overall_score, octet_length(xlsx_data) AS xlsx_bytes
            FROM transcript_analysis_log WHERE id=:aid
        """), {"aid": aid})).one()

        _h(f"transcript_analysis_log  (analysis_id = {aid})")
        print(f"  patient_id        : {log.patient_id}")
        print(f"  source_filename   : {log.source_filename}")
        print(f"  total_sentences   : {log.total_sentences}")
        print(f"  top_n             : {log.top_n}    context_window: {log.context_window}")
        print(f"  analyzed_at       : {log.analyzed_at}")
        print(f"  processed (AI)    : {log.processed}    processed_at: {log.processed_at}")
        print(f"  ai_overall_score  : {log.ai_overall_score}")
        print(f"  xlsx_data         : {log.xlsx_bytes or 0} bytes")

        # NLP intermediates (JSONB blobs)
        _h("NLP PIPELINE — intermediate stages")
        for stp in ("raw", "filtered", "sentences", "top_by_model"):
            row = (await db.execute(text("""
                SELECT row_count FROM nlp_pipeline_intermediate
                WHERE analysis_id=:aid AND step=:s
            """), {"aid": aid, "s": stp})).scalar_one_or_none()
            if row is None:
                _sub(f"NLP step='{stp}' (JSONB)", 0, "(MISSING)")
            else:
                _sub(f"NLP step='{stp}' (JSONB)", row)

        # NLP step 3
        rows = (await db.execute(text("""
            SELECT sentence_index, sentence_text, pred_cp, pred_le, pred_ed, pred_inc, pred_ius
            FROM nlp_all_predictions WHERE analysis_id=:aid
            ORDER BY pred_cp DESC NULLS LAST LIMIT 5
        """), {"aid": aid})).all()
        total3 = (await db.execute(text("SELECT count(*) FROM nlp_all_predictions WHERE analysis_id=:aid"),
                                   {"aid": aid})).scalar_one()
        _sub("NLP Step 3 — nlp_all_predictions (top-5 by pred_cp)", total3)
        for r in rows:
            print(f"  idx={r.sentence_index:<4}  cp={r.pred_cp}  le={r.pred_le}  ed={r.pred_ed}  inc={r.pred_inc}  ius={r.pred_ius}")
            print(f"     text: {_trunc(r.sentence_text, 100)}")

        # NLP Step 5
        rows = (await db.execute(text("""
            SELECT model, sentence_index, pred_score, sentence_text
            FROM sentence_prediction WHERE analysis_id=:aid
            ORDER BY model, pred_score DESC
        """), {"aid": aid})).all()
        _sub("NLP Step 5 — sentence_prediction (top-N + context)", len(rows))
        cur = None
        for r in rows:
            if r.model != cur:
                print(f"\n  domain='{r.model}':")
                cur = r.model
            print(f"    idx={r.sentence_index:<4} score={r.pred_score:.4f}  {_trunc(r.sentence_text, 80)}")

        # AI intermediate
        _h("AI PIPELINE — intermediate + final")
        rows = (await db.execute(text("""
            SELECT domain, sentence_index, ai_score, estimate, treatment, survived_filter, sentence_text
            FROM llm_pipeline_intermediate WHERE analysis_id=:aid
            ORDER BY domain, ai_score DESC NULLS LAST
        """), {"aid": aid})).all()
        _sub("AI Sub 1-3 — llm_pipeline_intermediate", len(rows))
        cur = None
        for r in rows:
            if r.domain != cur:
                print(f"\n  domain='{r.domain}':")
                cur = r.domain
            survived = "Y" if r.survived_filter else "N"
            print(f"    idx={r.sentence_index:<4} ai={r.ai_score} survived={survived} estimate={_trunc(r.estimate, 40)} treatment={_trunc(r.treatment, 20)}")

        # AI final
        rows = (await db.execute(text("""
            SELECT domain, ai_score, extracted_estimate, treatment, source_sentence, reformat_sentence
            FROM llm_domain_scoring_and_summary WHERE analysis_id=:aid
            ORDER BY domain
        """), {"aid": aid})).all()
        _sub("AI Sub 4-5 — llm_domain_scoring_and_summary (final)", len(rows))
        for r in rows:
            print(f"\n  domain='{r.domain}'  ai_score={r.ai_score}  estimate={_trunc(r.extracted_estimate, 60)}")
            print(f"     source  : {_trunc(r.source_sentence, 90)}")
            print(f"     reformat: {_trunc(r.reformat_sentence, 90)}")

        _h("END")
        print(f"  AI overall score: {log.ai_overall_score}    processed={log.processed}")

    await engine.dispose()
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--analysis-id", type=int)
    g.add_argument("--patient-id", type=str)
    p.add_argument("--full", action="store_true", help="(reserved) print every row")
    args = p.parse_args()
    sys.exit(asyncio.run(main(args)))
