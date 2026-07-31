"""
Root conftest.py — shared fixtures for the entire backend test suite.

Strategy:
  - A real PostgreSQL database, the same engine production runs on
  - Environment variables patched before any app module is imported
  - AsyncClient from httpx for endpoint testing
  - Redis mocked as None (caching disabled)
  - NLP service mocked via monkeypatch / respx

Why PostgreSQL and not in-memory SQLite
    The suite used to run on SQLite so it needed no database of its own. The
    cost was silent: SQLAlchemy renders PostgreSQL-only constructs verbatim, so
    routes using them could not be tested at all (10 tests sat permanently red
    with "no such function: concat"), and a green run never proved PostgreSQL
    behaviour — SQLite ignores VARCHAR(n) limits, coerces types loosely, and
    orders rows differently. Tests now run on the same engine as production.

Pointing the suite at a database
    Set TEST_DATABASE_URL. It must name a database ending in "_test"; the guard
    below refuses anything else so a stray run can never write into the live
    database. The default is a `prostatecancer_test` database beside the app's
    own, created on first use.
"""

import os
import sys

# ── Patch env BEFORE any app-level import ─────────────────────────────────
# db.py reads DATABASE_URL at import time and requires "+asyncpg". Point it at
# the test database so any module that grabs the engine at import time (db.py
# does) is already wired to the right place.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://prostatecancer_user:secure_password_123"
    "@localhost:5439/prostatecancer_test",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("API_KEY", "test-api-key")
os.environ.setdefault("AUTH_MODE", "api_key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("NLP_API_URL", "http://nlp-classifiers:8000")

# Add Backend/ to sys.path so imports like `from db import ...` work
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import pytest
import pytest_asyncio
from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from httpx import AsyncClient, ASGITransport

from models import Base


# ── Guard: never let the suite touch a non-test database ──────────────────
# This is not hypothetical. An ad-hoc script that overrode only the drop folder
# — and left DATABASE_URL pointing at the live database — wrote four junk rows
# into the production admin_upload_log. A name check is cheap; recovering a
# polluted production table by hand is not.

_URL = make_url(TEST_DATABASE_URL)

if not (_URL.database or "").endswith("_test"):
    raise RuntimeError(
        f"Refusing to run: TEST_DATABASE_URL names database {_URL.database!r}, "
        "which does not end in '_test'. The suite creates and drops data freely, "
        "so it must own its database. Set TEST_DATABASE_URL to a dedicated one, "
        "e.g. postgresql+asyncpg://user:pw@localhost:5439/prostatecancer_test"
    )


async def _ensure_test_database() -> None:
    """Create the test database if it does not exist yet.

    CREATE DATABASE cannot run inside a transaction, hence AUTOCOMMIT, and it
    cannot run from a connection to the database being created, hence the
    connection to the `postgres` maintenance database.
    """
    admin_url = _URL.set(database="postgres")
    engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as conn:
            exists = (await conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": _URL.database},
            )).scalar()
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{_URL.database}"'))
    finally:
        await engine.dispose()


# ── Database fixtures ─────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def engine():
    """Session-scoped engine against the test database, schema created once.

    Per-test create_all/drop_all on PostgreSQL would dominate the runtime for a
    suite this size; per-test isolation comes from the transaction in `db`
    instead.
    """
    await _ensure_test_database()
    eng = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with eng.begin() as conn:
        # Drop first so a schema left behind by an interrupted run cannot make
        # the next one pass or fail for the wrong reason.
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db(engine):
    """Yield a session whose writes are discarded when the test ends.

    The session runs inside an outer transaction that is always rolled back, so
    every test starts from an empty schema without paying for a re-create. Tests
    call `await db.commit()` freely; `join_transaction_mode="create_savepoint"`
    turns those into savepoint releases inside the outer transaction rather than
    real commits, so nothing survives teardown.
    """
    async with engine.connect() as conn:
        outer = await conn.begin()
        factory = async_sessionmaker(
            bind=conn,
            expire_on_commit=False,
            class_=AsyncSession,
            join_transaction_mode="create_savepoint",
        )
        async with factory() as session:
            # Code under test that opens its own session (persistence.py takes a
            # sessionmaker) must join THIS connection. A factory bound to the
            # engine would take a different connection and, since the test's
            # writes live in an uncommitted transaction, would see none of them.
            session.info["session_factory"] = factory
            yield session
        await outer.rollback()


@pytest_asyncio.fixture
async def session_factory(db):
    """Sessionmaker sharing the test's connection and rollback scope.

    Pass this to helpers that take a sessionmaker (persistence.file_already_processed,
    get_latest_analysis_id, save_all) instead of building one from `engine`.
    """
    return db.info["session_factory"]


# ── App & client fixtures ─────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db, monkeypatch):
    """AsyncClient wired to the FastAPI app with DB overridden to in-memory SQLite."""
    # Prevent the registry from caching a stale backend between tests
    from auth.registry import _get_backend
    _get_backend.cache_clear()

    monkeypatch.setenv("AUTH_MODE", "api_key")
    monkeypatch.setenv("API_KEY", "test-api-key")

    from main import app
    from db import get_db

    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db

    # Mock Redis to None (caching disabled)
    import redis_client
    monkeypatch.setattr(redis_client, "_redis", None)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def api_headers():
    """Standard headers for authenticated requests."""
    return {"X-API-Key": "test-api-key"}


@pytest.fixture
def bad_api_headers():
    """Headers with wrong API key."""
    return {"X-API-Key": "wrong-key"}


@pytest.fixture
def stub_admin_auth():
    """Satisfy require_admin_user for admin-guarded endpoints under test.

    The suite authenticates via X-API-Key, not an admin JWT, so endpoints that
    depend on require_admin_user would 401. These routes attach the dependency
    via ``dependencies=[...]`` and never bind its return value, so a no-op
    override is enough to let the request through. Opt in per test module via
    ``pytestmark = pytest.mark.usefixtures("stub_admin_auth")`` — the dedicated
    auth tests do not use it, so their 401/403 assertions stay intact.
    """
    from main import app
    from auth.admin_session import require_admin_user
    app.dependency_overrides[require_admin_user] = lambda: None
    yield
    app.dependency_overrides.pop(require_admin_user, None)


# ── pytest configuration ──────────────────────────────────────────────────

def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "e2e: end-to-end tests requiring Docker")
    config.addinivalue_line("markers", "integration: integration tests")
    config.addinivalue_line("markers", "slow: slow-running tests")
    config.addinivalue_line(
        "markers",
        "live: hits the real REDCap API; skipped unless REDCAP_API_URL/TOKEN are available",
    )
