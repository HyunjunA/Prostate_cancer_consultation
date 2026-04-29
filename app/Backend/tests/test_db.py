"""Unit tests for db.py — engine/session factory and readiness probe.

Functions tested:
    get_db()         : FastAPI dependency that yields one session per request.
    db_ready_ping()  : Returns True/False without raising; uses engine.connect().

Strategy:
    - No real DB connection is made. We mock `db.engine` (the module-level
      singleton) so every test is purely in-memory and sub-millisecond.
    - AsyncMock replaces the async context managers that engine.connect()
      and AsyncSessionLocal() return.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── get_db ───────────────────────────────────────────────────────────────────


class TestGetDb:
    """get_db() yields a session from AsyncSessionLocal and closes it cleanly."""

    async def test_yields_a_session(self):
        """get_db() must yield exactly one session object."""
        fake_session = AsyncMock()
        fake_session_ctx = AsyncMock()
        fake_session_ctx.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session_ctx.__aexit__ = AsyncMock(return_value=False)

        fake_factory = MagicMock(return_value=fake_session_ctx)

        with patch("db.AsyncSessionLocal", fake_factory):
            from db import get_db
            sessions_yielded = []
            async for session in get_db():
                sessions_yielded.append(session)

        assert len(sessions_yielded) == 1
        assert sessions_yielded[0] is fake_session

    async def test_session_context_is_entered_and_exited(self):
        """get_db() must call __aenter__ and __aexit__ on the session context."""
        fake_session = AsyncMock()
        fake_session_ctx = AsyncMock()
        fake_session_ctx.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session_ctx.__aexit__ = AsyncMock(return_value=False)

        fake_factory = MagicMock(return_value=fake_session_ctx)

        with patch("db.AsyncSessionLocal", fake_factory):
            from db import get_db
            async for _ in get_db():
                pass

        fake_session_ctx.__aenter__.assert_called_once()
        fake_session_ctx.__aexit__.assert_called_once()

    async def test_session_closed_even_if_caller_raises(self):
        """__aexit__ is called even when the caller of get_db() raises an error.

        get_db() is an async generator. When the caller raises during iteration
        we must explicitly call gen.aclose() to trigger the inner async-context
        cleanup — that is what FastAPI's Depends() does internally.
        """
        fake_session = AsyncMock()
        fake_session_ctx = AsyncMock()
        fake_session_ctx.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session_ctx.__aexit__ = AsyncMock(return_value=False)

        fake_factory = MagicMock(return_value=fake_session_ctx)

        with patch("db.AsyncSessionLocal", fake_factory):
            from db import get_db
            gen = get_db()
            try:
                async for _ in gen:
                    raise ValueError("simulated request error")
            except ValueError:
                pass
            finally:
                await gen.aclose()

        fake_session_ctx.__aexit__.assert_called_once()


# ── db_ready_ping ─────────────────────────────────────────────────────────────


class TestDbReadyPing:
    """db_ready_ping() returns True/False without raising any exception."""

    async def test_returns_true_when_db_responds(self):
        """Returns True when SELECT 1 succeeds."""
        fake_conn = AsyncMock()
        fake_conn.execute = AsyncMock()
        fake_conn_ctx = AsyncMock()
        fake_conn_ctx.__aenter__ = AsyncMock(return_value=fake_conn)
        fake_conn_ctx.__aexit__ = AsyncMock(return_value=False)

        fake_engine = MagicMock()
        fake_engine.connect = MagicMock(return_value=fake_conn_ctx)

        with patch("db.engine", fake_engine):
            from db import db_ready_ping
            result = await db_ready_ping()

        assert result is True

    async def test_returns_false_when_db_is_unreachable(self):
        """Returns False (not raises) when engine.connect() throws."""
        fake_engine = MagicMock()
        fake_engine.connect.side_effect = OSError("connection refused")

        with patch("db.engine", fake_engine):
            from db import db_ready_ping
            result = await db_ready_ping()

        assert result is False

    async def test_returns_false_on_any_exception_type(self):
        """Any exception — even an unexpected one — results in False, never a raise."""
        fake_engine = MagicMock()
        fake_engine.connect.side_effect = RuntimeError("completely unexpected")

        with patch("db.engine", fake_engine):
            from db import db_ready_ping
            result = await db_ready_ping()

        assert result is False

    async def test_returns_false_when_select_1_raises(self):
        """Returns False when the connection opens but SELECT 1 itself throws."""
        fake_conn = AsyncMock()
        fake_conn.execute = AsyncMock(side_effect=Exception("query error"))
        fake_conn_ctx = AsyncMock()
        fake_conn_ctx.__aenter__ = AsyncMock(return_value=fake_conn)
        fake_conn_ctx.__aexit__ = AsyncMock(return_value=False)

        fake_engine = MagicMock()
        fake_engine.connect = MagicMock(return_value=fake_conn_ctx)

        with patch("db.engine", fake_engine):
            from db import db_ready_ping
            result = await db_ready_ping()

        assert result is False
