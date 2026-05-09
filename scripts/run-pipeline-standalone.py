"""Standalone AI Pipeline runner — Phase A entry point.

Runs the full pipeline (NLP 7 steps + AI 5 sub-steps) on one or more
transcript files, against the native PostgreSQL configured in
app/Backend/.env.native. Manages the NLP classifier container
lifecycle itself — load the OCI archive if the image is missing, bring
the container up via docker-compose-pipeline.yml, wait for the
healthcheck, run the pipeline. The dashboard's read-time stack
(scripts/run-native.sh) is unaffected.

Usage (from the repo root):

    # 1. Make sure native postgres + redis are up (one-time, brew):
    brew services start postgresql@16 redis

    # 2. Activate the venv and run:
    source .venv/bin/activate
    python scripts/run-pipeline-standalone.py \
        --file data/transcripts/SID_10.xlsx

    # Other options:
    --skip-ai             skip the Azure OpenAI sub-pipeline (NLP only)
    --skip-nlp-startup    assume nlp-classifiers is already running
                          (e.g., for repeated runs)
    --stop-nlp-after      stop the NLP container after the run
    --top-n 10            top-N sentences per domain (default 10)
    --context-window 3    context ±N sentences (default 3)
    --quiet               only show stage headers, hide chatty INFO logs

Output: every database INSERT is printed with a [DB] prefix so the
operator can see exactly what is being persisted, when, and where.

Reference: README.md "Quick Start — Native Deployment" (Phase A)
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

# Make sibling AI repo modules importable so persistence.py / pipeline_runner
# can `from sentence_classification import ...` and `from ai_pipeline import ...`
# without the operator having to set PYTHONPATH manually. Mirrors the
# convention enforced by run-backend-native.sh for the uvicorn process.
AI_REPO_DIR = REPO_ROOT.parent / "AI_physician_patient_communication"
if AI_REPO_DIR.is_dir():
    sys.path.insert(0, str(AI_REPO_DIR))

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


# ── NLP container lifecycle ────────────────────────────────────────────────
# The pipeline owns the NLP classifier container's lifecycle now —
# starts it before processing, optionally stops it afterwards. The
# dashboard (scripts/run-native.sh, docker-compose-minimal.yml) does
# not touch this container.

NLP_COMPOSE_FILE = REPO_ROOT / "docker-compose-pipeline.yml"
NLP_IMAGE_TAG = "r01-nlp-classifiers:latest"
NLP_CONTAINER = "prostatecancer-nlp-native"
NLP_OCI_DIR_DEFAULT = (
    REPO_ROOT.parent
    / "AI_physician_patient_communication"
    / "nlp-classifiers"
    / "r01-nlp-classifiers-docker-image"
)


def _docker_image_exists(tag: str) -> bool:
    import subprocess
    r = subprocess.run(
        ["docker", "image", "inspect", tag],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return r.returncode == 0


def _load_nlp_image_from_oci() -> None:
    """Load the NLP image from the sibling AI repo's OCI archive."""
    import subprocess, tarfile, tempfile
    oci_dir = Path(os.getenv("NLP_IMAGE_DIR", str(NLP_OCI_DIR_DEFAULT)))
    if not oci_dir.is_dir():
        fail(f"NLP OCI archive not found at {oci_dir}")
        print(
            "       Set NLP_IMAGE_DIR or clone AI_physician_patient_communication\n"
            "       as a sibling of this repo.",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"  ▸ Loading NLP image from {oci_dir} (~1.4 GB) ...")
    with tempfile.NamedTemporaryFile(suffix=".tar", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        with tarfile.open(tmp_path, "w") as tar:
            for entry in oci_dir.iterdir():
                tar.add(entry, arcname=entry.name)
        subprocess.run(
            ["docker", "load", "-i", str(tmp_path)],
            check=True,
        )
    finally:
        tmp_path.unlink(missing_ok=True)
    ok("NLP image loaded")


def _ensure_nlp_running(skip_startup: bool) -> None:
    """Make sure the NLP container is up and healthy before pipeline start."""
    import subprocess, time
    if skip_startup:
        ok("--skip-nlp-startup — assuming NLP container is already running")
        return

    if not _docker_image_exists(NLP_IMAGE_TAG):
        _load_nlp_image_from_oci()

    # `up -d` is idempotent — does nothing if already running.
    print("  ▸ Bringing NLP container up via docker-compose-pipeline.yml ...")
    subprocess.run(
        ["docker", "compose", "-f", str(NLP_COMPOSE_FILE), "up", "-d", "--pull", "never"],
        check=True,
    )

    # Wait for healthcheck — R + stringi cold start typically lands inside 60 s
    # on a warm cache, longer on the first run.
    print("  ▸ Waiting for NLP healthcheck (up to 120s) ...")
    deadline = time.time() + 120
    last_status = "unknown"
    while time.time() < deadline:
        r = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Health.Status}}", NLP_CONTAINER],
            capture_output=True, text=True,
        )
        last_status = r.stdout.strip() or "missing"
        if last_status == "healthy":
            ok("NLP container healthy")
            return
        time.sleep(3)
    print(
        f"  ⚠ NLP not healthy after 120 s (last status: {last_status}). "
        "Pipeline will still try; failures show up as Step 2 segmentation errors.",
        file=sys.stderr,
    )


def _stop_nlp_container() -> None:
    """Tear down the NLP container after the pipeline run."""
    import subprocess
    print(f"  ▸ Stopping NLP container ({NLP_CONTAINER}) ...")
    subprocess.run(
        ["docker", "compose", "-f", str(NLP_COMPOSE_FILE), "down"],
        check=False,   # don't raise if compose file or container missing
    )
    ok("NLP container stopped")


# ── Env validation ──────────────────────────────────────────────────────────
def check_env(skip_ai: bool, skip_nlp_startup: bool) -> None:
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

    nlp = os.getenv("NLP_API_URL", "http://localhost:8888")
    ok(f"NLP_API_URL:  {nlp}")

    # Bring the NLP container up ourselves (Phase A owns its lifecycle now).
    _ensure_nlp_running(skip_startup=skip_nlp_startup)

    # Final reachability probe — ensures the route from the host to the
    # container's exposed port works, not just that the container is healthy.
    try:
        import httpx
        httpx.get(f"{nlp}/ping", timeout=2.0).raise_for_status()
        ok("NLP service reachable")
    except Exception as e:
        fail(f"NLP service not reachable at {nlp} ({e.__class__.__name__}: {e})")
        print(
            "       The NLP container is up but the host port is not. Check\n"
            "       NLP_API_URL in app/Backend/.env.native and the port mapping\n"
            "       in docker-compose-pipeline.yml.",
            file=sys.stderr,
        )
        sys.exit(1)

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


# ── Resolve a list of transcript paths from --file or --dir ─────────────────
def _resolve_transcripts(args: argparse.Namespace) -> list[Path]:
    """Return a sorted list of *.xlsx paths from --file or --dir."""
    if args.file:
        p = Path(args.file)
        if not p.is_absolute():
            p = (REPO_ROOT / p).resolve()
        if not p.exists():
            fail(f"Transcript not found: {p}")
            sys.exit(1)
        return [p]

    # --dir mode
    d = Path(args.dir)
    if not d.is_absolute():
        d = (REPO_ROOT / d).resolve()
    if not d.is_dir():
        fail(f"Directory not found: {d}")
        sys.exit(1)
    files = sorted(d.glob("*.xlsx")) + sorted(d.glob("*.csv"))
    if not files:
        fail(f"No .xlsx / .csv files in {d}")
        sys.exit(1)
    return files


async def _process_one(transcript: Path, Session, models_mod, pipeline_runner_mod) -> dict | None:
    """Run pipeline for a single file, return summary or None on failure."""
    section(f"Pipeline run — {transcript.name}")
    t0 = time.perf_counter()
    result = await pipeline_runner_mod.process_single_file(str(transcript), Session)
    elapsed = time.perf_counter() - t0

    if not result:
        fail(f"pipeline returned no result for {transcript.name} (already processed — see [NLP] logs)")
        return None

    # Find the analysis_id we just inserted
    from sqlalchemy import select
    async with Session() as db:
        r = await db.execute(
            select(models_mod.TranscriptAnalysisLog.id, models_mod.TranscriptAnalysisLog.ai_overall_score)
            .where(models_mod.TranscriptAnalysisLog.source_filename == transcript.name)
            .order_by(models_mod.TranscriptAnalysisLog.id.desc())
            .limit(1)
        )
        row = r.first()
    aid = row[0] if row else None
    score = row[1] if row else None
    print(f"  {GREEN}{BOLD}OK{RESET} — {transcript.name}: {result.get('total_sentences')} sentences in {elapsed:.1f}s   analysis_id={aid}  ai_overall_score={score}")
    return {"file": transcript.name, "analysis_id": aid, "score": score, "elapsed": elapsed}


# ── Main ────────────────────────────────────────────────────────────────────
async def main(args: argparse.Namespace) -> int:
    configure_logging(args.quiet)
    check_env(skip_ai=args.skip_ai, skip_nlp_startup=args.skip_nlp_startup)

    transcripts = _resolve_transcripts(args)

    section("Transcripts to process")
    for t in transcripts:
        print(f"  · {t}  ({t.stat().st_size:,} bytes)")
    print(f"  total: {len(transcripts)} file(s)")

    # Single output path — nested format (output_test compatible).
    # Default points at the AI repo's data/output so binary diff against
    # data/output_test/ works out of the box.
    _output_dir_raw = os.getenv("OUTPUT_DIR", "../AI_physician_patient_communication/data/output")
    _output_dir = _output_dir_raw if Path(_output_dir_raw).is_absolute() else str((REPO_ROOT / _output_dir_raw).resolve())

    # Push CLI overrides into the environment BEFORE importing backend
    # modules. pipeline_runner reads its tuning via core.settings (which
    # is @lru_cache'd on first import), so this is the last moment we
    # can influence top_n / context_window / output_dir without a cache
    # bust. Same trick the underlying YAML loader used to do internally.
    os.environ["PIPELINE_TOP_N"] = str(args.top_n)
    os.environ["PIPELINE_CONTEXT_WINDOW"] = str(args.context_window)
    os.environ["OUTPUT_DIR"] = _output_dir

    # Optional: skip the AI pipeline by short-circuiting the env var the
    # ai_pipeline_service uses to load credentials
    if args.skip_ai:
        os.environ.pop("AZURE_OPENAI_KEY", None)

    # Import backend modules now (after env + sys.path are set)
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    import models  # noqa: F401  (registers metadata)
    import pipeline_runner
    from core.settings import get_settings

    db_url = get_settings().database_url
    engine = create_async_engine(db_url, pool_pre_ping=True)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False)

    # Snapshot before any processing
    before = await snapshot_counts(Session)

    results: list[dict] = []
    failures: list[str] = []
    for transcript in transcripts:
        try:
            r = await _process_one(transcript, Session, models, pipeline_runner)
            if r:
                results.append(r)
            else:
                failures.append(transcript.name)
        except Exception as e:
            fail(f"{transcript.name}: {e}")
            failures.append(transcript.name)

    # Snapshot delta after all processing
    after = await snapshot_counts(Session)
    print_delta(before, after)

    # Summary
    section("Summary")
    print(f"  Processed OK : {len(results)} / {len(transcripts)}")
    if failures:
        print(f"  Failed/skipped: {len(failures)}  ({', '.join(failures)})")
    if results:
        print(f"\n  Verify:  python scripts/verify_db.py")
        for r in results:
            print(f"           python scripts/verify_db.py --analysis-id {r['analysis_id']}")

    await engine.dispose()

    # Optional teardown — keep NLP container running by default so a follow-up
    # transcript run is fast (no container start, no healthcheck wait).
    if args.stop_nlp_after:
        section("Stopping NLP container (--stop-nlp-after)")
        _stop_nlp_container()

    return 0 if not failures else 1


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--file", help="Transcript .xlsx/.csv path (relative to repo root or absolute)")
    src.add_argument("--dir", help="Directory: every .xlsx/.csv inside is processed in sorted order")
    p.add_argument("--top-n", type=int, default=10, help="Top-N sentences per NLP domain (default 10)")
    p.add_argument("--context-window", type=int, default=3, help="Context window size (default 3)")
    p.add_argument("--skip-ai", action="store_true", help="Skip the Azure OpenAI sub-pipeline (NLP-only run)")
    p.add_argument(
        "--skip-nlp-startup", action="store_true",
        help="Assume the NLP container is already running (default: bring it up)",
    )
    p.add_argument(
        "--stop-nlp-after", action="store_true",
        help="Stop the NLP container after the run (default: leave it up for repeat runs)",
    )
    p.add_argument("--quiet", action="store_true", help="Suppress INFO logs (only stage headers)")
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(parse_args())))
