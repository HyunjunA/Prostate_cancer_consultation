"""Async SQLAlchemy engine + session factory for the FastAPI Backend.

This module owns the single global asyncpg-backed engine that every
request handler reuses. Connection pool size and timeout knobs all come
from environment variables (DATABASE_POOL_*) so production can tune
without code changes.

Why asyncpg specifically:
    - FastAPI runs handlers on the asyncio event loop.
    - psycopg2 would block the loop and starve concurrent requests.
    - We hard-fail at import time if DATABASE_URL does not say "+asyncpg".

Public API used elsewhere:
    - get_db()          : FastAPI dependency, yields one session per request.
    - db_ready_ping()   : readiness probe (used by /ready in routes_system.py).
    - engine            : raw async engine (used by alembic and scripts).
    - AsyncSessionLocal : session factory (rarely used outside get_db).

Connection pool model (high level):
    A pool keeps `pool_size` open connections idle, hands them out on
    demand, and creates up to `max_overflow` extras during traffic
    spikes. Connections older than `pool_recycle` seconds are tossed
    so we never hand back a connection the DB has already closed (e.g.
    via pgbouncer idle timeout). Every checkout is `pool_pre_ping`-ed
    so a connection that died silently behind our back is detected
    and replaced before the request sees a stale-socket error.
"""

import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

# Load .env so DATABASE_URL is available even when this module is
# imported by a CLI script (alembic, init_db.py, …) that does not boot
# uvicorn first.
load_dotenv()

# ──────────────────────────────────────────────────────────────────────────────
# Connection string
# ──────────────────────────────────────────────────────────────────────────────
# Must use the SQLAlchemy `postgresql+asyncpg://` scheme. If someone
# pastes a plain `postgresql://` DSN, SQLAlchemy will silently pick the
# default psycopg2 driver, which is SYNCHRONOUS and will block the
# asyncio event loop. We fail loudly at import time rather than letting
# that misconfiguration ship to production unnoticed.
DATABASE_URL = os.getenv("DATABASE_URL")  # must be postgresql+asyncpg://...
if not DATABASE_URL or "+asyncpg" not in DATABASE_URL:
    raise ValueError("DATABASE_URL must be postgresql+asyncpg://... and use asyncpg")

# ──────────────────────────────────────────────────────────────────────────────
# Pool tuning knobs (all overridable via environment)
# ──────────────────────────────────────────────────────────────────────────────
# Size of the warm idle pool — connections kept open even when no
# requests are in flight. 10 covers most dev/test loads cheaply.
POOL_SIZE        = int(os.getenv("DATABASE_POOL_SIZE", 10))

# Extra connections created during traffic spikes, on top of POOL_SIZE.
# Hard cap on total concurrent connections is POOL_SIZE + MAX_OVERFLOW
# (here: 10 + 20 = 30). Keep this comfortably under postgres'
# max_connections (typically 100) to leave room for other clients.
MAX_OVERFLOW     = int(os.getenv("DATABASE_MAX_OVERFLOW", 20))

# Seconds a request waits for a free connection before raising
# TimeoutError. Hitting this almost always means traffic exceeds your
# pool capacity — increase POOL_SIZE/MAX_OVERFLOW or add an instance.
POOL_TIMEOUT     = int(os.getenv("DATABASE_POOL_TIMEOUT", 30))

# Recycle (close + recreate) connections older than this many seconds.
# Defends against connections silently killed by load balancers /
# pgbouncer / firewall idle timeouts. 1800 s = 30 min is a safe
# default that comfortably beats the typical 60-min-or-shorter
# infrastructure timeout.
POOL_RECYCLE     = int(os.getenv("DATABASE_POOL_RECYCLE", 1800))

# LIFO (last-in, first-out) checkout order. With LIFO the recently-
# returned connection is reused first, so a small subset of
# connections stays "hot" and the rest can age out — this plays
# nicely with pool_recycle. FIFO would round-robin all connections,
# keeping every one warm but also harder to recycle.
POOL_USE_LIFO    = os.getenv("DATABASE_POOL_USE_LIFO", "true").lower() == "true"

# When SQL_ECHO=true, SQLAlchemy logs every emitted SQL statement.
# Useful for local debugging; NEVER enable in production — it both
# floods logs and risks leaking sensitive data into them.
ECHO_SQL         = os.getenv("SQL_ECHO", "false").lower() == "true"

# ──────────────────────────────────────────────────────────────────────────────
# Engine + session factory
# ──────────────────────────────────────────────────────────────────────────────
# The engine is the singleton "I know how to talk to the database"
# object. Created exactly once at import time; every request reuses it
# via `get_db()`. Never call `await engine.dispose()` from request
# code — that would tear down the pool for the whole process.
engine = create_async_engine(
    DATABASE_URL,
    # Validate connections on every checkout. Cheap (`SELECT 1`) and
    # the ONLY reliable defence against "connection died while idle".
    pool_pre_ping=True,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_recycle=POOL_RECYCLE,
    pool_use_lifo=POOL_USE_LIFO,
    echo=ECHO_SQL,
)

# Session factory. Each call (`AsyncSessionLocal()`) returns a brand-
# new session bound to a connection from the pool above.
#
# expire_on_commit=False: by default SQLAlchemy invalidates ALL loaded
# attributes on commit so the next access has to re-fetch. That breaks
# the FastAPI pattern of "commit, then return ORM objects in the
# response" because Pydantic would see an expired attribute and lazy-
# load it AFTER the session has closed -> error. Disabling expiry on
# commit means our handlers can serialise post-commit objects safely.
AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    """FastAPI dependency: one async session per request.

    Used as `db: AsyncSession = Depends(get_db)` in route signatures.
    The `async with` block guarantees the session is closed and its
    underlying connection returned to the pool no matter how the
    request ends — success, exception, or client disconnect.

    Yields:
        AsyncSession bound to a live pool connection. Caller can run
        ORM queries (`await db.execute(select(...))`) and `commit()`
        / `rollback()` against it.
    """
    async with AsyncSessionLocal() as session:
        yield session


async def db_ready_ping() -> bool:
    """Cheap readiness probe used by `/ready` in routes_system.py.

    Returns True iff we can open a fresh connection and round-trip
    `SELECT 1`. Catches every exception so the readiness endpoint
    never raises — orchestrators expect a boolean answer, not a 500.

    Why a NEW connection rather than reusing the pool:
        Readiness has to detect "the DB is reachable RIGHT NOW", not
        "we have a stale pooled connection that happens to still
        respond". Calling engine.connect() forces an actual TCP/TLS
        handshake every time the probe runs.
    """
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        # Broad except is intentional: ANY failure -> "not ready".
        # The orchestrator's job is to retry; ours is to answer
        # truthfully.
        return False
