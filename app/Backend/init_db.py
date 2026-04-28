#!/usr/bin/env python3
"""Database initialization script — creates tables only.

Run by the Docker entrypoint AFTER wait_for_db.py says the database
is reachable, but BEFORE uvicorn boots. The job is "make sure every
table this codebase needs exists"; nothing more.

Why creating tables in a separate script instead of at FastAPI start:
    - Boot order is explicit: wait_for_db -> init_db -> uvicorn.
      Each step has its own exit code so the orchestrator can fail
      fast if any step breaks.
    - FastAPI's lifespan runs per-process. With multiple workers
      (uvicorn --workers 3) every worker would race to create the
      same tables, generating noise in the postgres logs.
    - Lets ops re-run table creation manually (`python init_db.py`)
      without restarting the API, e.g. after a manual schema reset
      in development.

Idempotency:
    Table creation uses SQLAlchemy `Base.metadata.create_all()` which
    SKIPS tables that already exist. Re-running this script on a fully-
    initialised database is therefore harmless. It does NOT migrate or
    alter columns — schema CHANGES go through Alembic in
    migrations/versions/.

Data population:
    Out of scope. Real data flows in via pipeline_runner.py (transcript
    -> NLP -> scoring -> DB), not via this bootstrap script.

Usage:
    python init_db.py          # Create all tables
"""

import os
import asyncio
from dotenv import load_dotenv

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# `Base` carries the metadata registry that `create_all` walks. Importing
# `models` is what registers every `class X(Base): __tablename__ = ...`
# definition so create_all knows about them.
from models import Base

# Auth tables are defined in a sibling module but share the same `Base`.
# Importing them here (even though we never reference the classes by name
# in this file) is what registers them with `Base.metadata` so create_all
# picks them up. The `# noqa: F401` tells lint tools to leave the unused
# imports alone — they exist for their side effects.
from auth.models import AuthUser, AuthAPIKey, PatientAccess  # noqa: F401

# Load .env so DATABASE_URL is set even when this script is run directly
# from a CLI (e.g. `python init_db.py`) instead of the Docker entrypoint.
load_dotenv()


async def init_database():
    """Create async engine and ensure all tables exist.

    Returns:
        The async engine used for the create-all + ping. Caller is
        responsible for `await engine.dispose()` so the connection
        pool does not outlive the script.
    """
    # Read DSN HERE (rather than at module top) so a misconfigured env
    # produces a clear error in the function we are actually running,
    # not at import time when the traceback is murkier.
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL or "+asyncpg" not in DATABASE_URL:
        # Same hard-fail as db.py — the SQLAlchemy default is psycopg2
        # which would silently block the asyncio loop. Better to crash
        # at boot than to ship a broken backend.
        raise ValueError("DATABASE_URL must be postgresql+asyncpg://...")

    # Print the URL with the password masked. Splitting on "@" yields
    # ["postgresql+asyncpg://user:pass", "host:port/db"]; we keep the
    # left half and replace the right half with ***.
    print(f"Connecting to database: {DATABASE_URL.split('@')[0]}@***")

    # Build a SHORT-LIVED engine just for this script. Pool tuning is
    # less important here than in the live backend (we run for seconds,
    # not weeks), but pool_pre_ping protects against the case where
    # postgres just finished booting and the first attempt would race
    # the listener.
    engine = create_async_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=int(os.getenv("DATABASE_POOL_SIZE", 10)),
        max_overflow=int(os.getenv("DATABASE_MAX_OVERFLOW", 20)),
    )

    # ── Create all tables (idempotent — skips existing) ─────────────
    # `engine.begin()` opens a transaction; `run_sync` runs a sync
    # callable (create_all is sync-only) inside an async context by
    # bridging through SQLAlchemy's compatibility layer.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print("[OK] All tables created (or already exist)")

        # Expression indexes (e.g. CREATE INDEX ... ON tbl ((date_trunc('day', ts))))
        # are blocked by PostgreSQL because date_trunc/extract on
        # TIMESTAMP WITH TIME ZONE are NOT marked IMMUTABLE. PG refuses
        # to index a non-immutable expression because the index would
        # silently desync if the runtime timezone changed.
        # Work-around (deferred): wrap the expression in a user-defined
        # IMMUTABLE function, or migrate the column to TIMESTAMP WITHOUT
        # TIME ZONE. Tracked in dev_docs/TODO.md #42.
        print("[OK] Expression indexes skipped (requires IMMUTABLE wrapper — see TODO #42)")

    # ── Verify connection ───────────────────────────────────────────
    # `SELECT 1` round-trip after create_all so we surface "DB unreachable
    # right after schema creation" as a clear assertion, not a cryptic
    # error from the first real query.
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        assert result.scalar() == 1
        print("[OK] Database connection verified")

    return engine


async def main():
    """Top-level entry point — pretty banner + create + dispose."""
    # Cosmetic banner so the Docker logs make it obvious which boot
    # step is currently running.
    print("\n" + "=" * 60)
    print("[START] Database Initialization (tables only)")
    print("=" * 60 + "\n")

    engine = await init_database()
    # Dispose so the script does not leave a connection pool open at
    # shutdown — important for fast Docker entrypoint progression.
    await engine.dispose()

    print("\n" + "=" * 60)
    print("[OK] Database initialization completed!")
    print("   Data population: run pipeline_runner.py with real transcripts")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    # No try/except: any failure should propagate as a non-zero exit
    # so the Docker entrypoint aborts the rest of the boot sequence
    # instead of silently launching uvicorn against a broken DB.
    asyncio.run(main())
