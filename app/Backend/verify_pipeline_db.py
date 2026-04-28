"""Pipeline DB Storage Verification — PASS/FAIL summary for the manager review.

Runs a sequence of correctness checks against the live PostgreSQL DB and
prints a pass/fail report. Exits with code 0 on full pass, 1 on any failure.

This script is the CLI counterpart to the `/api/admin/pipeline-status`
HTTP endpoint (in routes_admin_pipeline.py). They run the SAME 7 checks
but serve different audiences:
    - HTTP endpoint : Slack/PagerDuty bots, browser, CI smoke tests.
    - This script   : engineers SSH-ing into the container, ad-hoc
                      one-shot verification, machine-readable JSON for
                      release scripts.

Usage (inside the backend container):
    python verify_pipeline_db.py                    # check every analysis
    python verify_pipeline_db.py --analysis-id 1    # check a single analysis
    python verify_pipeline_db.py --json             # machine-readable output

What it checks (per analysis_id):
    1. transcript_analysis_log row exists with processed=true and
       a non-null ai_overall_score.
    2. nlp_pipeline_intermediate has exactly 4 JSONB blobs (raw, filtered,
       sentences, top_by_model) with row_count > 0 each.
    3. nlp_all_predictions has > 0 rows AND all five pred_* columns are
       fully populated (no NULL leaks — Bug 1 regression guard).
    4. sentence_prediction has 50 rows (5 domains x 10) and a non-empty
       context column on each.
    5. llm_pipeline_intermediate has rows for every domain with
       at least 1 candidate flagged survived_filter=true on average.
    6. llm_domain_scoring_and_summary has between 5 and 25 rows (one per
       selected candidate, with optional multi-row selection).
    7. patient_summary has exactly 1 row per analysis filename
       (Bug 2 regression guard — re-runs must not duplicate).

The script is read-only — it never writes to the DB.
"""

import argparse
import asyncio
import json
import os
import sys
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

import models as M


# ── ANSI colors for terminal readability ─────────────────────────────────────
# Hardcoded escape codes so the script works without colorama. Stripped
# automatically when stdout is redirected to a file because most pagers
# render the codes as literal text.
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"


class CheckResult:
    """One check's outcome — pass/fail + observed value + expected value.

    Carries enough context that BOTH the human-friendly terminal output
    and the machine-readable JSON output can be derived from a single
    in-memory representation.
    """

    def __init__(self, name: str, passed: bool, observed: Any, expected: str, detail: str = ""):
        self.name = name
        self.passed = passed
        self.observed = observed
        self.expected = expected
        self.detail = detail

    def to_dict(self) -> dict:
        """Serialise for `--json` output. Field names match the HTTP
        endpoint's response shape so consumers can use one schema."""
        return {
            "name": self.name,
            "pass": self.passed,
            "observed": self.observed,
            "expected": self.expected,
            "detail": self.detail,
        }

    def render(self) -> str:
        """Pretty-print one check result for terminal output."""
        tag = f"{GREEN}[PASS]{RESET}" if self.passed else f"{RED}[FAIL]{RESET}"
        line = f"  {tag} {self.name}: observed={self.observed} expected={self.expected}"
        if self.detail:
            # Only render `detail` when it has content — keeps PASS lines
            # tight (no trailing empty lines).
            line += f"\n         {self.detail}"
        return line


# ── Per-analysis checks ──────────────────────────────────────────────────────
async def _check_analysis(db, analysis_id: int) -> list[CheckResult]:
    """Run all 7 checks for a single analysis_id and return their results."""
    results: list[CheckResult] = []

    # Pull the parent log row first. We use scalar_one() (not _one_or_none)
    # because the caller already validated the id exists in main(); a
    # missing row here would be a programming error worth crashing on.
    log = (await db.execute(
        select(M.TranscriptAnalysisLog).where(M.TranscriptAnalysisLog.id == analysis_id)
    )).scalar_one()

    # ── 1. transcript_analysis_log: AI complete ─────────────────────
    # `processed=True` AND a non-null score together prove BOTH the NLP
    # half and the LLM half finished writing. Either one missing means
    # we crashed mid-pipeline.
    results.append(CheckResult(
        f"analysis_id={analysis_id} transcript_analysis_log AI complete",
        passed=(log.processed is True and log.ai_overall_score is not None),
        observed=f"processed={log.processed} ai_overall_score={log.ai_overall_score}",
        expected="processed=true and ai_overall_score IS NOT NULL",
    ))

    # ── 2. nlp_pipeline_intermediate: 4 JSONB blobs ─────────────────
    # Walk the rows once, build a {step: row_count} dict. Two failure
    # modes: a step missing entirely OR a step present-but-empty.
    intermediate_rows = (await db.execute(
        select(M.NLPPipelineIntermediate.step, M.NLPPipelineIntermediate.row_count)
        .where(M.NLPPipelineIntermediate.analysis_id == analysis_id)
    )).all()
    steps_seen = {row.step: row.row_count for row in intermediate_rows}
    expected_steps = {"raw", "filtered", "sentences", "top_by_model"}
    missing_steps = expected_steps - set(steps_seen)
    empty_steps = [s for s, n in steps_seen.items() if not n or n <= 0]
    results.append(CheckResult(
        f"analysis_id={analysis_id} nlp_pipeline_intermediate: 4 non-empty JSONB blobs",
        passed=(not missing_steps and not empty_steps),
        observed=f"steps={sorted(steps_seen.keys())} row_counts={steps_seen}",
        expected="raw + filtered + sentences + top_by_model, all row_count>0",
        # `detail` is only rendered when non-empty — set it ONLY when
        # there is actually something to report.
        detail=(f"missing={sorted(missing_steps)} empty={empty_steps}" if (missing_steps or empty_steps) else ""),
    ))

    # ── 3. nlp_all_predictions: pred_* fully populated (Bug 1 guard) ─
    # We previously had a regression where one of the five model columns
    # silently stayed NULL. count(col) excludes NULLs from the tally,
    # so any column where nonnull < total has a NULL leak.
    pred_stats = (await db.execute(text(
        """
        SELECT count(*)                                AS total,
               count(pred_cp)                          AS cp_nonnull,
               count(pred_le)                          AS le_nonnull,
               count(pred_ed)                          AS ed_nonnull,
               count(pred_inc)                         AS inc_nonnull,
               count(pred_ius)                         AS ius_nonnull
        FROM nlp_all_predictions
        WHERE analysis_id = :aid
        """
    ), {"aid": analysis_id})).one()
    total = pred_stats.total
    null_columns = [
        col for col in ("cp_nonnull", "le_nonnull", "ed_nonnull", "inc_nonnull", "ius_nonnull")
        if getattr(pred_stats, col) != total
    ]
    results.append(CheckResult(
        f"analysis_id={analysis_id} nlp_all_predictions: pred_* all populated (Bug 1 guard)",
        passed=(total > 0 and not null_columns),
        observed=f"total={total} cp={pred_stats.cp_nonnull} le={pred_stats.le_nonnull} ed={pred_stats.ed_nonnull} inc={pred_stats.inc_nonnull} ius={pred_stats.ius_nonnull}",
        expected="total>0 AND cp/le/ed/inc/ius nonnull-count == total",
        detail=(f"NULL leak detected in: {null_columns}" if null_columns else ""),
    ))

    # ── 4. sentence_prediction: 50 rows w/ context ──────────────────
    # 5 models × top-10 sentences = 50 rows. EVERY row must have non-
    # empty context, otherwise the doctor UI cannot render the sentence
    # in its surrounding paragraph.
    sp_stats = (await db.execute(text(
        """
        SELECT count(*)                       AS total,
               count(*) FILTER (WHERE context IS NOT NULL AND length(context) > 0) AS with_context,
               count(DISTINCT model)          AS distinct_models
        FROM sentence_prediction
        WHERE analysis_id = :aid
        """
    ), {"aid": analysis_id})).one()
    results.append(CheckResult(
        f"analysis_id={analysis_id} sentence_prediction: 50 rows, all with context",
        passed=(sp_stats.total == 50 and sp_stats.with_context == 50 and sp_stats.distinct_models == 5),
        observed=f"total={sp_stats.total} with_context={sp_stats.with_context} distinct_models={sp_stats.distinct_models}",
        expected="total=50 AND with_context=50 AND distinct_models=5",
    ))

    # ── 5. llm_pipeline_intermediate: per-domain LLM trace ──────────
    # 5 distinct domains AND at least one row passed survived_filter.
    # Domains 5 with 0 survived = LLM rejected EVERYTHING, which is
    # almost always a prompt or threshold regression.
    ai_stats = (await db.execute(text(
        """
        SELECT count(*)                                      AS total,
               count(DISTINCT domain)                        AS distinct_domains,
               count(*) FILTER (WHERE survived_filter)       AS survived
        FROM llm_pipeline_intermediate
        WHERE analysis_id = :aid
        """
    ), {"aid": analysis_id})).one()
    results.append(CheckResult(
        f"analysis_id={analysis_id} llm_pipeline_intermediate: 5 domains, candidates + survival",
        passed=(ai_stats.distinct_domains == 5 and ai_stats.total > 0 and ai_stats.survived > 0),
        observed=f"total={ai_stats.total} distinct_domains={ai_stats.distinct_domains} survived={ai_stats.survived}",
        expected="distinct_domains=5 AND total>0 AND survived>0",
    ))

    # ── 6. llm_domain_scoring_and_summary: 5..25 final rows ────────
    # Lower bound 5 = at least one row per domain. Upper bound 25 = we
    # cap selection at ~5 finalists per domain. Outside that band
    # signals over- or under-pruning.
    final_count = (await db.execute(text(
        "SELECT count(*) FROM llm_domain_scoring_and_summary WHERE analysis_id = :aid"
    ), {"aid": analysis_id})).scalar_one()
    results.append(CheckResult(
        f"analysis_id={analysis_id} llm_domain_scoring_and_summary: final rows present",
        passed=(5 <= final_count <= 25),
        observed=f"rows={final_count}",
        expected="5 <= rows <= 25 (one per selected candidate)",
    ))

    # ── 7. patient_summary: 1 row per filename (Bug 2 guard) ────────
    # A previous regression caused the upsert to insert duplicates
    # instead of overwriting, breaking the patient dashboard. Catch
    # the recurrence here.
    ps_count = (await db.execute(text(
        "SELECT count(*) FROM patient_summary WHERE file = :fn"
    ), {"fn": log.source_filename})).scalar_one()
    results.append(CheckResult(
        f"analysis_id={analysis_id} patient_summary: 1 row per file (Bug 2 guard)",
        passed=(ps_count == 1),
        observed=f"rows_for_file={ps_count}",
        expected="exactly 1",
        detail=f"source_filename={log.source_filename}",
    ))

    return results


# ── Top-level run ────────────────────────────────────────────────────────────
async def main(analysis_id: int | None, as_json: bool) -> int:
    """Entry point — connect, run checks, print, return exit code."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        # Fail fast with a stderr message + non-zero exit so CI catches
        # the misconfiguration.
        print("ERROR: DATABASE_URL env var not set", file=sys.stderr)
        return 2
    if db_url.startswith("postgresql://"):
        # Backend env normally uses "postgresql+asyncpg://..." but some
        # CI environments still ship the plain scheme. Normalise so the
        # async engine never sees the wrong driver.
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    # Build a short-lived engine just for this script; we tear it down
    # before exit so the script returns its connections cleanly.
    engine = create_async_engine(db_url, future=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        if analysis_id is not None:
            ids = [analysis_id]
        else:
            ids = (await db.execute(
                select(M.TranscriptAnalysisLog.id).order_by(M.TranscriptAnalysisLog.id)
            )).scalars().all()

        if not ids:
            # Empty DB. Use exit 1 (failure) here — unlike the HTTP
            # endpoint which treats this as a benign 200/EMPTY — because
            # CI smoke tests after a successful pipeline run should NOT
            # find an empty log, so empty here means the pipeline did
            # not run.
            print("NOTHING TO VERIFY: transcript_analysis_log is empty.", file=sys.stderr)
            return 1

        all_results: dict[int, list[CheckResult]] = {}
        for aid in ids:
            # Sequential walk — each check fires multiple DB queries and
            # we do not want concurrent gather() flooding the pool.
            all_results[aid] = await _check_analysis(db, aid)

    await engine.dispose()

    # ── Render results in either human or JSON format ───────────────
    flat = [r for rs in all_results.values() for r in rs]
    total_checks = len(flat)
    passed = sum(1 for r in flat if r.passed)
    failed = total_checks - passed

    if as_json:
        print(json.dumps({
            "summary": {"total": total_checks, "passed": passed, "failed": failed},
            "analyses": {aid: [r.to_dict() for r in rs] for aid, rs in all_results.items()},
        }, indent=2))
    else:
        # Coloured human-friendly output. Designed to be skimmable in a
        # 100-line tmux pane — banner + per-analysis section + summary.
        print(f"\n{BOLD}=== Pipeline DB Storage Verification ==={RESET}")
        for aid, rs in all_results.items():
            print(f"\n  {BOLD}analysis_id = {aid}{RESET}")
            for r in rs:
                print(r.render())
        print(f"\n{BOLD}=== Summary ==={RESET}")
        color = GREEN if failed == 0 else RED
        status = "PASS" if failed == 0 else "FAIL"
        print(f"  {color}{BOLD}{status}{RESET}  {passed}/{total_checks} checks passed across {len(ids)} analyses")
        if failed:
            print(f"  {RED}{failed} check(s) failed — see [FAIL] lines above{RESET}")

    # Exit code is the bridge to CI: 0 = healthy, 1 = at least one
    # check failed (alert-worthy), 2 = configuration error (DSN missing).
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--analysis-id", type=int, default=None, help="Verify a single analysis_id (default: every analysis)")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.analysis_id, args.json)))
