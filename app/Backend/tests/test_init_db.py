"""Unit tests for init_db.py — DB initialization script.

Functions tested:
    init_database() : Creates all tables via create_all, runs SELECT 1,
                      returns the engine.
    main()          : Calls init_database(), disposes the engine, and prints
                      a banner. Tested only for its print/dispose side-effects.

Strategy:
    - We mock `create_async_engine` so no real DB connection is ever made.
    - The mock engine's `begin()` and `connect()` context managers are
      replaced with AsyncMock instances that simulate a working DB.
    - We patch `core.settings.get_settings` to return a minimal Settings
      object so the function does not require a live environment.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_fake_engine(select_1_result=1):
    """Build a fake async engine whose begin()/connect() contexts succeed.

    Args:
        select_1_result: What conn.execute(...).scalar() returns.
                         Pass something other than 1 to simulate a broken DB.
    """
    # begin() context manager — used by create_all
    fake_begin_conn = AsyncMock()
    fake_begin_conn.run_sync = AsyncMock()
    fake_begin_ctx = AsyncMock()
    fake_begin_ctx.__aenter__ = AsyncMock(return_value=fake_begin_conn)
    fake_begin_ctx.__aexit__ = AsyncMock(return_value=False)

    # connect() context manager — used by SELECT 1
    fake_result = MagicMock()
    fake_result.scalar = MagicMock(return_value=select_1_result)
    fake_connect_conn = AsyncMock()
    fake_connect_conn.execute = AsyncMock(return_value=fake_result)
    fake_connect_ctx = AsyncMock()
    fake_connect_ctx.__aenter__ = AsyncMock(return_value=fake_connect_conn)
    fake_connect_ctx.__aexit__ = AsyncMock(return_value=False)

    fake_engine = MagicMock()
    fake_engine.begin = MagicMock(return_value=fake_begin_ctx)
    fake_engine.connect = MagicMock(return_value=fake_connect_ctx)
    fake_engine.dispose = AsyncMock()

    return fake_engine


def _make_fake_settings(url="postgresql+asyncpg://test:test@localhost/testdb"):
    settings = MagicMock()
    settings.database_url = url
    settings.database_pool_size = 5
    settings.database_max_overflow = 10
    return settings


# ── init_database ─────────────────────────────────────────────────────────────


class TestInitDatabase:
    """init_database() creates tables, verifies the connection, returns the engine."""

    async def test_returns_engine_on_success(self):
        """init_database() returns the engine object it created."""
        fake_engine = _make_fake_engine()
        fake_settings = _make_fake_settings()

        with patch("init_db.get_settings", return_value=fake_settings), \
             patch("init_db.create_async_engine", return_value=fake_engine):
            from init_db import init_database
            result = await init_database()

        assert result is fake_engine

    async def test_create_all_is_called(self):
        """create_all must be called via run_sync inside engine.begin()."""
        fake_engine = _make_fake_engine()
        fake_settings = _make_fake_settings()

        with patch("init_db.get_settings", return_value=fake_settings), \
             patch("init_db.create_async_engine", return_value=fake_engine):
            from init_db import init_database
            await init_database()

        # run_sync should have been called with Base.metadata.create_all
        fake_engine.begin().__aenter__.return_value.run_sync.assert_called_once()

    async def test_select_1_verify_is_called(self):
        """After create_all, a SELECT 1 round-trip must be performed."""
        fake_engine = _make_fake_engine()
        fake_settings = _make_fake_settings()

        with patch("init_db.get_settings", return_value=fake_settings), \
             patch("init_db.create_async_engine", return_value=fake_engine):
            from init_db import init_database
            await init_database()

        # engine.connect() must have been called for the SELECT 1 verify
        fake_engine.connect.assert_called_once()

    async def test_assertion_error_raised_when_select_1_returns_wrong_value(self):
        """If SELECT 1 does not return 1, an AssertionError must propagate."""
        fake_engine = _make_fake_engine(select_1_result=0)
        fake_settings = _make_fake_settings()

        with patch("init_db.get_settings", return_value=fake_settings), \
             patch("init_db.create_async_engine", return_value=fake_engine):
            from init_db import init_database
            with pytest.raises(AssertionError):
                await init_database()

    async def test_engine_created_with_correct_url(self):
        """create_async_engine must be called with the DATABASE_URL from settings."""
        fake_engine = _make_fake_engine()
        fake_url = "postgresql+asyncpg://user:pass@db:5432/mydb"
        fake_settings = _make_fake_settings(url=fake_url)

        with patch("init_db.get_settings", return_value=fake_settings), \
             patch("init_db.create_async_engine", return_value=fake_engine) as mock_create:
            from init_db import init_database
            await init_database()

        mock_create.assert_called_once()
        call_url = mock_create.call_args[0][0]
        assert call_url == fake_url

    async def test_prints_connecting_message(self, capsys):
        """init_database() must print a 'Connecting to database' message."""
        fake_engine = _make_fake_engine()
        fake_settings = _make_fake_settings()

        with patch("init_db.get_settings", return_value=fake_settings), \
             patch("init_db.create_async_engine", return_value=fake_engine):
            from init_db import init_database
            await init_database()

        captured = capsys.readouterr()
        assert "Connecting to database" in captured.out

    async def test_host_is_masked_in_print_output(self, capsys):
        """The database URL printed must mask the host portion with ***.

        Source masks the right side of '@' (host/port/db) — see init_db.py:72.
        Note: the LEFT side (user:password) is NOT masked by the current source
        — that is a separate hardening concern, tracked outside this test.
        """
        fake_engine = _make_fake_engine()
        fake_settings = _make_fake_settings(
            url="postgresql+asyncpg://myuser:supersecret@secret-host.internal:5432/proddb"
        )

        with patch("init_db.get_settings", return_value=fake_settings), \
             patch("init_db.create_async_engine", return_value=fake_engine):
            from init_db import init_database
            await init_database()

        captured = capsys.readouterr()
        assert "@***" in captured.out
        assert "secret-host.internal" not in captured.out
        assert "proddb" not in captured.out


# ── main ──────────────────────────────────────────────────────────────────────


class TestMain:
    """main() calls init_database(), disposes the engine, and prints a banner."""

    async def test_dispose_is_called(self):
        """main() must call engine.dispose() before exiting."""
        fake_engine = _make_fake_engine()
        fake_settings = _make_fake_settings()

        with patch("init_db.get_settings", return_value=fake_settings), \
             patch("init_db.create_async_engine", return_value=fake_engine):
            from init_db import main
            await main()

        fake_engine.dispose.assert_called_once()

    async def test_prints_completion_banner(self, capsys):
        """main() must print a completion banner after a successful run."""
        fake_engine = _make_fake_engine()
        fake_settings = _make_fake_settings()

        with patch("init_db.get_settings", return_value=fake_settings), \
             patch("init_db.create_async_engine", return_value=fake_engine):
            from init_db import main
            await main()

        captured = capsys.readouterr()
        assert "completed" in captured.out.lower() or "OK" in captured.out
