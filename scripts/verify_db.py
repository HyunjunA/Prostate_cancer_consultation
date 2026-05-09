"""Standalone DB verification — Phase 5.

Mirrors app/Backend/verify_pipeline_db.py but runs as a plain Python
script (no Backend startup needed). Reads DATABASE_URL from
app/Backend/.env and runs the same 7 checks per analysis.

Usage:
    source .venv/bin/activate
    python scripts/verify_db.py
    python scripts/verify_db.py --analysis-id 5
    python scripts/verify_db.py --json

Exits 0 on all-pass, 1 on any failure.

Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 5)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / "app" / "Backend" / ".env"

# Load env BEFORE importing sqlalchemy (asyncpg URL must be set)
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

GREEN = "\033[92m"; RED = "\033[91m"; BOLD = "\033[1m"; RESET = "\033[0m"


class CheckResult:
    def __init__(self, name: str, passed: bool, observed, expected: str, detail: str = ""):
        self.name = name
        self.passed = passed
        self.observed = observed
        self.expected = expected
        self.detail = detail

    def to_dict(self):
        return {"name": self.name, "pass": self.passed, "observed": self.observed,
                "expected": self.expected, "detail": self.detail}

    def render(self):
        tag = f"{GREEN}[PASS]{RESET}" if self.passed else f"{RED}[FAIL]{RESET}"
        line = f"  {tag} {self.name}: observed={self.observed} expected={self.expected}"
        if self.detail:
            line += f"\n         {self.detail}"
        return line


async def _check(db, aid: int) -> list[CheckResult]:
    out: list[CheckResult] = []

    log = (await db.execute(
        text("SELECT id, source_filename, ai_overall_score, processed FROM transcript_analysis_log WHERE id=:aid"),
        {"aid": aid},
    )).first()
    if log is None:
        out.append(CheckResult(f"analysis {aid} exists", False, "missing", "row in transcript_analysis_log"))
        return out

    out.append(CheckResult(
        f"analysis_id={aid} transcript_analysis_log AI complete",
        log.processed is True and log.ai_overall_score is not None,
        f"processed={log.processed} ai_overall_score={log.ai_overall_score}",
        "processed=true and ai_overall_score IS NOT NULL",
    ))

    rows = (await db.execute(
        text("SELECT step, row_count FROM nlp_pipeline_intermediate WHERE analysis_id=:aid"),
        {"aid": aid},
    )).all()
    steps = {r.step: r.row_count for r in rows}
    expected = {"raw", "filtered", "sentences", "top_by_model"}
    missing = expected - set(steps)
    empty = [s for s, n in steps.items() if not n or n <= 0]
    out.append(CheckResult(
        f"analysis_id={aid} nlp_pipeline_intermediate: 4 non-empty JSONB blobs",
        not missing and not empty,
        f"steps={sorted(steps)}",
        "raw + filtered + sentences + top_by_model, row_count>0",
        f"missing={sorted(missing)} empty={empty}" if (missing or empty) else "",
    ))

    pred = (await db.execute(text("""
        SELECT count(*) AS total,
               count(pred_cp) AS cp_nn, count(pred_le) AS le_nn,
               count(pred_ed) AS ed_nn, count(pred_inc) AS inc_nn,
               count(pred_ius) AS ius_nn
        FROM nlp_all_predictions WHERE analysis_id=:aid
    """), {"aid": aid})).one()
    nulls = [c for c in ("cp_nn", "le_nn", "ed_nn", "inc_nn", "ius_nn") if getattr(pred, c) != pred.total]
    out.append(CheckResult(
        f"analysis_id={aid} nlp_all_predictions: pred_* fully populated (Bug 1 guard)",
        pred.total > 0 and not nulls,
        f"total={pred.total} cp={pred.cp_nn} le={pred.le_nn} ed={pred.ed_nn} inc={pred.inc_nn} ius={pred.ius_nn}",
        "total>0 AND every pred_* non-null count = total",
        f"NULL leak in: {nulls}" if nulls else "",
    ))

    sp = (await db.execute(text("""
        SELECT count(*) AS total,
               count(*) FILTER (WHERE context IS NOT NULL AND length(context) > 0) AS with_ctx,
               count(DISTINCT model) AS distinct_models
        FROM sentence_prediction WHERE analysis_id=:aid
    """), {"aid": aid})).one()
    out.append(CheckResult(
        f"analysis_id={aid} sentence_prediction: 50 rows with context",
        sp.total == 50 and sp.with_ctx == 50 and sp.distinct_models == 5,
        f"total={sp.total} with_context={sp.with_ctx} distinct_models={sp.distinct_models}",
        "total=50 AND with_context=50 AND distinct_models=5",
    ))

    ai = (await db.execute(text("""
        SELECT count(*) AS total,
               count(DISTINCT domain) AS distinct_domains,
               count(*) FILTER (WHERE survived_filter) AS survived
        FROM llm_pipeline_intermediate WHERE analysis_id=:aid
    """), {"aid": aid})).one()
    out.append(CheckResult(
        f"analysis_id={aid} llm_pipeline_intermediate: 5 domains + survival",
        ai.distinct_domains == 5 and ai.total > 0 and ai.survived > 0,
        f"total={ai.total} distinct_domains={ai.distinct_domains} survived={ai.survived}",
        "distinct_domains=5 AND total>0 AND survived>0",
    ))

    final = (await db.execute(text("SELECT count(*) FROM llm_domain_scoring_and_summary WHERE analysis_id=:aid"),
                              {"aid": aid})).scalar_one()
    out.append(CheckResult(
        f"analysis_id={aid} llm_domain_scoring_and_summary: final rows present",
        5 <= final <= 25,
        f"rows={final}",
        "5 <= rows <= 25",
    ))

    ps = (await db.execute(text("SELECT count(*) FROM patient_summary WHERE file=:fn"),
                           {"fn": log.source_filename})).scalar_one()
    out.append(CheckResult(
        f"analysis_id={aid} patient_summary: 1 row per file (Bug 2 guard)",
        ps == 1,
        f"rows_for_file={ps}",
        "exactly 1",
        f"source_filename={log.source_filename}",
    ))
    return out


async def main(aid_arg: int | None, as_json: bool) -> int:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        return 2

    engine = create_async_engine(db_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        if aid_arg is not None:
            ids = [aid_arg]
        else:
            r = await db.execute(text("SELECT id FROM transcript_analysis_log ORDER BY id"))
            ids = [row[0] for row in r.all()]

        if not ids:
            print("NOTHING TO VERIFY: transcript_analysis_log is empty.", file=sys.stderr)
            await engine.dispose()
            return 1

        all_results = {aid: await _check(db, aid) for aid in ids}

    await engine.dispose()

    flat = [r for rs in all_results.values() for r in rs]
    total = len(flat)
    passed = sum(1 for r in flat if r.passed)
    failed = total - passed

    if as_json:
        print(json.dumps({
            "summary": {"total": total, "passed": passed, "failed": failed},
            "analyses": {aid: [r.to_dict() for r in rs] for aid, rs in all_results.items()},
        }, indent=2))
    else:
        print(f"\n{BOLD}=== Pipeline DB Verification (standalone) ==={RESET}")
        for aid, rs in all_results.items():
            print(f"\n  {BOLD}analysis_id = {aid}{RESET}")
            for r in rs:
                print(r.render())
        print(f"\n{BOLD}=== Summary ==={RESET}")
        color = GREEN if failed == 0 else RED
        status = "PASS" if failed == 0 else "FAIL"
        print(f"  {color}{BOLD}{status}{RESET}  {passed}/{total} checks across {len(ids)} analyses")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--analysis-id", type=int, default=None)
    p.add_argument("--json", action="store_true")
    args = p.parse_args()
    sys.exit(asyncio.run(main(args.analysis_id, args.json)))
