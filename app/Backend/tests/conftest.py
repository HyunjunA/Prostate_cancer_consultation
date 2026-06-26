"""
Root conftest.py — shared fixtures for the entire backend test suite.

Strategy:
  - In-memory SQLite via aiosqlite (no Docker needed)
  - Environment variables patched before any app module is imported
  - AsyncClient from httpx for endpoint testing
  - Redis mocked as None (caching disabled)
  - NLP service mocked via monkeypatch / respx
"""

import os
import sys

# ── Patch env BEFORE any app-level import ─────────────────────────────────
# db.py reads DATABASE_URL at import time and requires "+asyncpg".
# We override it so the test suite can import app modules cleanly,
# then replace the engine/session with SQLite in fixtures.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
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
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from httpx import AsyncClient, ASGITransport

from models import Base


# ── Database fixtures ─────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def engine():
    """Create an in-memory SQLite async engine with all tables."""
    eng = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db(engine):
    """Yield an async DB session bound to the in-memory SQLite engine."""
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
    async with session_factory() as session:
        yield session
        await session.rollback()


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
