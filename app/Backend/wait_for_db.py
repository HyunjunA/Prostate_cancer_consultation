#!/usr/bin/env python3
"""Boot-time helper: block until the database accepts connections.

Run by the Docker entrypoint *before* the FastAPI process starts so the
backend never tries to query a DB that is not ready yet (for example
when the postgres and backend containers boot at the same time).

Why this exists at all:
    Docker brings containers up in parallel by default. Even with
    `depends_on: postgres` in docker-compose, "depends_on" only waits
    until the postgres container's process starts — NOT until postgres
    itself has finished its own startup (loading WAL, replaying tail,
    accepting TCP). Without this script, the backend boots a few
    seconds too early and dies with a connection refused, taking the
    whole stack down.

Usage:
    python wait_for_db.py    # exits 0 once DB responds, raises on timeout

Environment variables:
    DATABASE_URL     : same DSN the backend uses; the "+asyncpg" suffix
                       is stripped here because asyncpg.connect() expects
                       a plain "postgresql://..." DSN.
    DB_WAIT_TIMEOUT  : max seconds to wait before giving up (default 60).

Exit behaviour:
    Success       -> prints "DB is ready" and exits 0.
    Timeout       -> raises RuntimeError; the Docker entrypoint sees a
                     non-zero exit and the container will be restarted
                     by the orchestrator (or fail loudly in CI).
"""

import os
import asyncio
import asyncpg

from dotenv import load_dotenv

# Load .env so DATABASE_URL is available even when this script is run
# outside of the FastAPI process (e.g. directly by the Docker entrypoint
# before uvicorn boots).
load_dotenv()

# Upper bound on how long we'll keep retrying. 60 s is plenty for a
# healthy postgres on a fresh boot; bump it via env when running on slow
# CI hardware or against a cold cloud instance.
TIMEOUT = int(os.getenv("DB_WAIT_TIMEOUT", "60"))


async def wait_for_db():
    """Poll postgres every 2 seconds until it accepts a connection.

    Returns:
        None on success.

    Raises:
        RuntimeError: if DATABASE_URL is unset, or if the database
            never becomes reachable within TIMEOUT seconds. The last
            exception from asyncpg is included in the message so you
            can tell apart "DNS unresolved" / "connection refused" /
            "auth failed" / etc.
    """
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        # Fail loud and immediate — there's no point sleeping in a loop
        # when we know we can never succeed.
        raise RuntimeError("DATABASE_URL is not set")

    # SQLAlchemy DSNs use the "postgresql+asyncpg://..." scheme to pick
    # the driver, but the asyncpg library itself only understands the
    # plain "postgresql://" scheme. Strip the suffix so the same env
    # var works for both the SQLAlchemy engine and this raw probe.
    dsn = dsn.replace("postgresql+asyncpg", "postgresql")

    # Convert "wait at most TIMEOUT seconds" into an absolute deadline
    # against the event loop clock. Using a deadline (instead of a
    # countdown) makes the loop drift-free even if individual attempts
    # take longer than expected.
    deadline = asyncio.get_event_loop().time() + TIMEOUT
    last_error = None

    while asyncio.get_event_loop().time() < deadline:
        try:
            # Open and immediately close a connection. We do not need
            # to run any query — TCP + auth handshake is the actual
            # readiness signal we care about.
            conn = await asyncpg.connect(dsn)
            await conn.close()
            print("DB is ready")
            return
        except Exception as e:
            # Common cases here: ConnectionRefusedError (postgres still
            # booting), asyncpg.PostgresError (auth not yet seeded),
            # socket.gaierror (DNS not yet resolved). All transient —
            # remember and retry.
            last_error = e
            print("DB not ready yet:", e)
            # Fixed 2 s back-off. Exponential back-off would just push
            # us past the deadline more aggressively without solving
            # anything; we want quick retries because postgres typically
            # comes up within ~5-10 seconds.
            await asyncio.sleep(2)

    # We exhausted the deadline. Surface the *last* asyncpg error so
    # the operator can see the real problem (e.g. wrong password) rather
    # than just "timed out".
    raise RuntimeError(f"DB not ready within {TIMEOUT}s: {last_error}")


if __name__ == "__main__":
    # Top-level entry point when executed as a script. There is
    # intentionally no try/except here — any failure should surface as
    # a non-zero exit so the Docker entrypoint aborts the boot sequence
    # instead of silently launching a backend that cannot reach the DB.
    asyncio.run(wait_for_db())
