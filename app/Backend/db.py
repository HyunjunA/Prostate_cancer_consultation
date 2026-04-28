"""Async SQLAlchemy engine + session factory for the FastAPI Backend.

This module owns the single global asyncpg-backed engine that every
request handler reuses. Connection pool size and timeout knobs all come
from the typed Settings object (core/settings.py), which itself reads
DATABASE_POOL_* env vars — so production can tune without code changes.

Why asyncpg specifically:
    - FastAPI runs handlers on the asyncio event loop.
    - psycopg2 would block the loop and starve concurrent requests.
    - core.settings hard-fails at import time if DATABASE_URL does not
      say "+asyncpg" (the validator is centralised there now).

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

P1.S1 migration note (history):
    Before P1.S1 this module read DATABASE_* env vars directly via
    os.getenv. We now go through core.settings.get_settings() instead,
    which:
      - centralises the env-var schema (one file to audit),
      - gives us type-safe access (`settings.database_pool_size: int`),
      - moves the "+asyncpg" validator to one place (no more inline check).
    The runtime behaviour is unchanged — same env vars, same defaults.
"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

from core.settings import get_settings

# Pull the singleton Settings once at import time. This is identical to
# the previous behaviour (env vars were also read at import time) — we
# just route through a typed object now.
_settings = get_settings()

# ──────────────────────────────────────────────────────────────────────────────
# Engine + session factory
# ──────────────────────────────────────────────────────────────────────────────
# The engine is the singleton "I know how to talk to the database"
# object. Created exactly once at import time; every request reuses it
# via `get_db()`. Never call `await engine.dispose()` from request
# code — that would tear down the pool for the whole process.
engine = create_async_engine(
    _settings.database_url,
    # Validate connections on every checkout. Cheap (`SELECT 1`) and
    # the ONLY reliable defence against "connection died while idle".
    pool_pre_ping=True,
    pool_size=_settings.database_pool_size,
    max_overflow=_settings.database_max_overflow,
    pool_timeout=_settings.database_pool_timeout,
    pool_recycle=_settings.database_pool_recycle,
    pool_use_lifo=_settings.database_pool_use_lifo,
    echo=_settings.sql_echo,
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
