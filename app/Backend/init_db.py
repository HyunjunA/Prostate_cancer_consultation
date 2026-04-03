#!/usr/bin/env python3
"""Database initialization script — creates tables only.

Table creation uses SQLAlchemy Base.metadata.create_all() which is
idempotent (skips existing tables). Data population is handled by
pipeline_runner.py which processes real transcript files through
the full NLP + scorer + rewriter pipeline.

Usage:
  python init_db.py          # Create all tables
"""

import os
import asyncio
from dotenv import load_dotenv

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from models import Base
# Auth models share the same Base — import so create_all picks them up
from auth.models import AuthUser, AuthAPIKey, PatientAccess  # noqa: F401

load_dotenv()


async def init_database():
    """Create async engine and ensure all tables exist."""
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL or "+asyncpg" not in DATABASE_URL:
        raise ValueError("DATABASE_URL must be postgresql+asyncpg://...")

    print(f"Connecting to database: {DATABASE_URL.split('@')[0]}@***")

    engine = create_async_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=int(os.getenv("DATABASE_POOL_SIZE", 10)),
        max_overflow=int(os.getenv("DATABASE_MAX_OVERFLOW", 20)),
    )

    # Create all tables (idempotent — skips existing)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print("[OK] All tables created (or already exist)")

        # Expression indexes — date_trunc/extract are not IMMUTABLE on TIMESTAMP WITH TIME ZONE
        # so PostgreSQL rejects them as index expressions.
        # TODO: Create IMMUTABLE wrapper functions or use TIMESTAMP WITHOUT TIME ZONE
        # See dev_docs/TODO.md #42
        print("[OK] Expression indexes skipped (requires IMMUTABLE wrapper — see TODO #42)")

    # Verify connection
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        assert result.scalar() == 1
        print("[OK] Database connection verified")

    return engine


async def main():
    print("\n" + "=" * 60)
    print("[START] Database Initialization (tables only)")
    print("=" * 60 + "\n")

    engine = await init_database()
    await engine.dispose()

    print("\n" + "=" * 60)
    print("[OK] Database initialization completed!")
    print("   Data population: run pipeline_runner.py with real transcripts")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
