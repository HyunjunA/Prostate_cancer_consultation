"""Standalone AI Pipeline runner — Phase 4, manager's primary requirement.

Runs the full pipeline (NLP 7 steps + AI 5 sub-steps) on one transcript
file, against the native PostgreSQL configured in app/Backend/.env.native.
No FastAPI server, no Docker for the pipeline itself — pure Python +
the existing backend modules.

Usage (from the repo root):

    # 1. Make sure native postgres + Docker NLP are up:
    brew services start postgresql@13 redis            # native
    docker compose -f docker-compose-minimal.yml up -d # NLP + webapp

    # 2. Activate the venv and run:
    source .venv/bin/activate
    python scripts/run-pipeline-standalone.py \
        --file data/transcripts/SID_10.xlsx

    # Other options:
    --skip-ai             skip the Azure OpenAI sub-pipeline (NLP only)
    --top-n 10            top-N sentences per domain (default 10)
    --context-window 3    context ±N sentences (default 3)
    --quiet               only show stage headers, hide chatty INFO logs

Output: every database INSERT is printed with a [DB] prefix so the
manager can see exactly what is being persisted, when, and where.

Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 4)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
from pathlib import Path

# ── Repo / sys.path bootstrap ───────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "app" / "Backend"
ENV_FILE = BACKEND_DIR / ".env.native"

# Make backend modules importable
sys.path.insert(0, str(BACKEND_DIR))

# Load env BEFORE importing backend modules (they may read DATABASE_URL at import time)
try:
    from dotenv import load_dotenv
    load_dotenv(ENV_FILE)
except ImportError:
    # Fallback: parse the env file by hand
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


# ── ANSI colours ────────────────────────────────────────────────────────────
GREEN = "\033[92m"
BLUE = "\033[94m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"


def section(title: str) -> None:
    print(f"\n{BOLD}{BLUE}=== {title} ==={RESET}")


def step(label: str, msg: str = "") -> None:
    print(f"{CYAN}[{label}]{RESET} {msg}")


def ok(msg: str) -> None:
    print(f"  {GREEN}✓{RESET} {msg}")


def fail(msg: str) -> None:
    print(f"  {RED}✗{RESET} {msg}", file=sys.stderr)


# ── Logging — surface persistence/AI logs with a [DB]/[AI] prefix ───────────
class PrefixFilter(logging.Filter):
    """Prefix log messages by module so they're easy to scan."""

    PREFIX_MAP = {
        "persistence": "[DB]    ",
        "ai_pipeline_service": "[AI]    ",
        "pipeline_runner": "[NLP]   ",
    }

    def filter(self, record: logging.LogRecord) -> bool:
        prefix = self.PREFIX_MAP.get(record.module, "")
        record.msg = f"{prefix}{record.msg}"
        return True


def configure_logging(quiet: bool) -> None:
    level = logging.WARNING if quiet else logging.INFO
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    handler.addFilter(PrefixFilter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    # Keep noisy libs quiet
    for noisy in ("httpx", "openai", "asyncio", "urllib3", "alembic"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


# ── Env validation ──────────────────────────────────────────────────────────
def check_env(skip_ai: bool) -> None:
    section("Environment")
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        fail("DATABASE_URL not set — copy app/Backend/.env.native.example to .env.native")
        sys.exit(1)
    # Print credentials with password redacted
    redacted = db_url
    if "@" in db_url and "://" in db_url:
        scheme, rest = db_url.split("://", 1)
        userpw, host = rest.split("@", 1)
        if ":" in userpw:
            user = userpw.split(":", 1)[0]
            redacted = f"{scheme}://{user}:***@{host}"
    ok(f"DATABASE_URL: {redacted}")

    nlp = os.getenv("NLP_API_URL", "http://localhost:8001")
    ok(f"NLP_API_URL:  {nlp}")

    if not skip_ai:
        if os.getenv("AZURE_OPENAI_ENDPOINT") and os.getenv("AZURE_OPENAI_KEY"):
            ok("AZURE_OPENAI_*: configured")
        else:
            fail("AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_KEY missing — set them or pass --skip-ai")
            sys.exit(1)
    else:
        print("  (--skip-ai) skipping Azure OpenAI checks")


# ── Snapshot DB row counts before / after ───────────────────────────────────
async def snapshot_counts(Session) -> dict:
    from sqlalchemy import text
    tables = [
        "transcript_analysis_log",
        "sentence_prediction",
        "nlp_all_predictions",
        "nlp_pipeline_intermediate",
        "llm_pipeline_intermediate",
        "llm_domain_scoring_and_summary",
        "patient_summary",
    ]
    out: dict = {}
    async with Session() as db:
        for t in tables:
            r = await db.execute(text(f"SELECT count(*) FROM {t}"))
            out[t] = r.scalar_one()
    return out


def print_delta(before: dict, after: dict) -> None:
    section("DB row counts (delta)")
    width = max(len(t) for t in before)
    for t in before:
        b = before[t]
        a = after[t]
        d = a - b
        marker = f"{GREEN}+{d}{RESET}" if d > 0 else (f"{YELLOW}{d}{RESET}" if d < 0 else f"{d}")
        print(f"  {t:<{width}}  {b:>5} → {a:>5}   ({marker})")


# ── Main ────────────────────────────────────────────────────────────────────
async def main(args: argparse.Namespace) -> int:
    configure_logging(args.quiet)
    check_env(skip_ai=args.skip_ai)

    # Resolve transcript path
    transcript = Path(args.file)
    if not transcript.is_absolute():
        transcript = (REPO_ROOT / args.file).resolve()
    if not transcript.exists():
        fail(f"Transcript not found: {transcript}")
        return 1

    section("Transcript")
    print(f"  file: {transcript}")
    print(f"  size: {transcript.stat().st_size:,} bytes")

    # Build the cfg dict that pipeline_runner expects
    cfg = {
        "pipeline": {
            "top_n": args.top_n,
            "context_window": args.context_window,
        },
        "nlp": {
            "api_url": os.getenv("NLP_API_URL", "http://localhost:8001"),
        },
        "paths": {
            "output_dir": os.getenv("OUTPUT_DIR", str(REPO_ROOT / "data" / "output")),
        },
    }

    # Optional: skip the AI pipeline by short-circuiting the env var the
    # ai_pipeline_service uses to load credentials
    if args.skip_ai:
        os.environ.pop("AZURE_OPENAI_KEY", None)

    # Import backend modules now (after env + sys.path are set)
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    import models  # noqa: F401  (registers metadata)
    import pipeline_runner

    db_url = os.getenv("DATABASE_URL")
    engine = create_async_engine(db_url, pool_pre_ping=True)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False)

    # Snapshot
    before = await snapshot_counts(Session)

    # Run pipeline
    section("Pipeline run")
    t0 = time.perf_counter()
    result = await pipeline_runner.process_single_file(str(transcript), Session, cfg)
    elapsed = time.perf_counter() - t0

    # Snapshot delta
    after = await snapshot_counts(Session)
    print_delta(before, after)

    # Summary
    section("Result")
    if result:
        print(f"  {GREEN}{BOLD}OK{RESET} — {result.get('file')}: {result.get('total_sentences')} sentences in {elapsed:.1f}s")
        # Find the analysis_id we just inserted
        from sqlalchemy import select
        async with Session() as db:
            r = await db.execute(
                select(models.TranscriptAnalysisLog.id, models.TranscriptAnalysisLog.ai_overall_score)
                .where(models.TranscriptAnalysisLog.source_filename == transcript.name)
                .order_by(models.TranscriptAnalysisLog.id.desc())
                .limit(1)
            )
            row = r.first()
            if row:
                aid, score = row
                print(f"  analysis_id:       {aid}")
                print(f"  ai_overall_score:  {score}")
                print(f"\n  Verify:  python scripts/verify_db.py --analysis-id {aid}")
                print(f"  Inspect: python scripts/show.py --analysis-id {aid}")
    else:
        fail(f"pipeline returned no result (likely already processed — see [NLP] logs)")
        await engine.dispose()
        return 1

    await engine.dispose()
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--file", required=True, help="Transcript .xlsx path (relative to repo root or absolute)")
    p.add_argument("--top-n", type=int, default=10, help="Top-N sentences per NLP domain (default 10)")
    p.add_argument("--context-window", type=int, default=3, help="Context window size (default 3)")
    p.add_argument("--skip-ai", action="store_true", help="Skip the Azure OpenAI sub-pipeline (NLP-only run)")
    p.add_argument("--quiet", action="store_true", help="Suppress INFO logs (only stage headers)")
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(parse_args())))
