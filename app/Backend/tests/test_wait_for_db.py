"""Unit tests for wait_for_db.py — boot-time DB readiness poller.

Function tested:
    wait_for_db() : Polls asyncpg.connect() every 2 seconds until success
                    or timeout, then raises RuntimeError if never reached.

Strategy:
    - asyncpg.connect is mocked so no real network call is ever made.
    - asyncio.sleep is mocked so retry tests complete in microseconds.
    - asyncio.get_event_loop().time() is mocked to control the deadline.
    - core.settings.get_settings is mocked to provide a stable DSN.

Key behaviours under test:
    - Returns None immediately when the first connect attempt succeeds.
    - Retries when the first attempt fails but a later one succeeds.
    - Raises RuntimeError when every attempt fails and the deadline passes.
    - Strips the "+asyncpg" SQLAlchemy prefix before passing to asyncpg.connect.
    - Includes the last asyncpg error in the RuntimeError message.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_fake_settings(url="postgresql+asyncpg://user:pass@localhost/testdb", timeout=10):
    settings = MagicMock()
    settings.database_url = url
    settings.db_wait_timeout = timeout
    return settings


# ── DSN stripping ─────────────────────────────────────────────────────────────


class TestDsnStripping:
    """wait_for_db() must strip '+asyncpg' before calling asyncpg.connect."""

    async def test_asyncpg_receives_plain_postgresql_dsn(self):
        """asyncpg.connect() must not receive '+asyncpg' in the DSN."""
        fake_conn = AsyncMock()
        fake_conn.close = AsyncMock()

        fake_settings = _make_fake_settings(
            url="postgresql+asyncpg://user:pass@localhost/testdb"
        )

        # Patch the event loop time so the deadline is never crossed
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", return_value=fake_conn) as mock_connect, \
             patch("asyncio.sleep", new_callable=AsyncMock), \
             patch.object(asyncio.get_event_loop(), "time", side_effect=[0, 5, 5]):
            from wait_for_db import wait_for_db
            await wait_for_db()

        called_dsn = mock_connect.call_args[0][0]
        assert "+asyncpg" not in called_dsn
        assert called_dsn.startswith("postgresql://")


# ── Successful connection ─────────────────────────────────────────────────────


class TestWaitForDbSuccess:
    """wait_for_db() returns None when a connection succeeds."""

    async def test_returns_none_on_first_successful_connect(self):
        """If asyncpg.connect succeeds immediately, wait_for_db returns None."""
        fake_conn = AsyncMock()
        fake_conn.close = AsyncMock()
        fake_settings = _make_fake_settings()

        # Loop time: first call returns 0 (before deadline), second returns 5
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", return_value=fake_conn), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            # Patch event loop time to be always inside deadline
            loop = asyncio.get_event_loop()
            with patch.object(loop, "time", side_effect=[0, 5, 5]):
                from wait_for_db import wait_for_db
                result = await wait_for_db()

        assert result is None

    async def test_connection_is_closed_after_success(self):
        """conn.close() must be called after a successful connect."""
        fake_conn = AsyncMock()
        fake_conn.close = AsyncMock()
        fake_settings = _make_fake_settings()

        loop = asyncio.get_event_loop()
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", return_value=fake_conn), \
             patch("asyncio.sleep", new_callable=AsyncMock), \
             patch.object(loop, "time", side_effect=[0, 5]):
            from wait_for_db import wait_for_db
            await wait_for_db()

        fake_conn.close.assert_called_once()

    async def test_prints_db_is_ready_on_success(self, capsys):
        """'DB is ready' must be printed when connection succeeds."""
        fake_conn = AsyncMock()
        fake_conn.close = AsyncMock()
        fake_settings = _make_fake_settings()

        loop = asyncio.get_event_loop()
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", return_value=fake_conn), \
             patch("asyncio.sleep", new_callable=AsyncMock), \
             patch.object(loop, "time", side_effect=[0, 5]):
            from wait_for_db import wait_for_db
            await wait_for_db()

        captured = capsys.readouterr()
        assert "DB is ready" in captured.out


# ── Retry behaviour ───────────────────────────────────────────────────────────


class TestWaitForDbRetry:
    """wait_for_db() retries when the first attempt fails."""

    async def test_succeeds_on_second_attempt(self):
        """If the first connect raises but the second succeeds, returns None."""
        fake_conn = AsyncMock()
        fake_conn.close = AsyncMock()
        fake_settings = _make_fake_settings()

        connect_calls = [OSError("connection refused"), fake_conn]

        loop = asyncio.get_event_loop()
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", side_effect=connect_calls), \
             patch("asyncio.sleep", new_callable=AsyncMock), \
             patch.object(loop, "time", side_effect=[0, 3, 5, 15]):
            from wait_for_db import wait_for_db
            result = await wait_for_db()

        assert result is None

    async def test_sleep_is_called_between_retries(self):
        """asyncio.sleep must be called after each failed attempt."""
        fake_conn = AsyncMock()
        fake_conn.close = AsyncMock()
        fake_settings = _make_fake_settings()

        # Fail twice, succeed on third
        connect_calls = [
            OSError("refused"),
            OSError("refused"),
            fake_conn,
        ]

        mock_sleep = AsyncMock()
        loop = asyncio.get_event_loop()
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", side_effect=connect_calls), \
             patch("asyncio.sleep", mock_sleep), \
             patch.object(loop, "time", side_effect=[0, 2, 4, 6, 15]):
            from wait_for_db import wait_for_db
            await wait_for_db()

        # sleep should have been called once for each failed attempt (2 failures)
        assert mock_sleep.call_count == 2

    async def test_sleep_duration_is_2_seconds(self):
        """Fixed 2-second back-off: asyncio.sleep must be called with 2."""
        fake_conn = AsyncMock()
        fake_conn.close = AsyncMock()
        fake_settings = _make_fake_settings()

        connect_calls = [OSError("refused"), fake_conn]
        mock_sleep = AsyncMock()

        loop = asyncio.get_event_loop()
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", side_effect=connect_calls), \
             patch("asyncio.sleep", mock_sleep), \
             patch.object(loop, "time", side_effect=[0, 3, 5, 15]):
            from wait_for_db import wait_for_db
            await wait_for_db()

        mock_sleep.assert_called_with(2)


# ── Timeout / failure ─────────────────────────────────────────────────────────


class TestWaitForDbTimeout:
    """wait_for_db() raises RuntimeError when the deadline is exhausted."""

    async def test_raises_runtime_error_on_timeout(self):
        """If all attempts fail before the deadline, RuntimeError is raised."""
        fake_settings = _make_fake_settings(timeout=5)

        loop = asyncio.get_event_loop()
        # time() returns 0 the first time (enters loop), then 10 (past deadline=5)
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", side_effect=OSError("refused")), \
             patch("asyncio.sleep", new_callable=AsyncMock), \
             patch.object(loop, "time", side_effect=[0, 10]):
            from wait_for_db import wait_for_db
            with pytest.raises(RuntimeError):
                await wait_for_db()

    async def test_runtime_error_message_contains_timeout_value(self):
        """The RuntimeError message must include the configured timeout."""
        fake_settings = _make_fake_settings(timeout=42)

        loop = asyncio.get_event_loop()
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", side_effect=OSError("refused")), \
             patch("asyncio.sleep", new_callable=AsyncMock), \
             patch.object(loop, "time", side_effect=[0, 100]):
            from wait_for_db import wait_for_db
            with pytest.raises(RuntimeError, match="42"):
                await wait_for_db()

    async def test_runtime_error_message_contains_last_exception(self):
        """The RuntimeError message must include the last asyncpg error.

        time() side_effect needs at least 3 values: deadline computation +
        one loop entry (so the body runs once and last_error is recorded) +
        one final past-deadline check.
        """
        fake_settings = _make_fake_settings(timeout=5)
        last_error = OSError("FATAL: password authentication failed")

        loop = asyncio.get_event_loop()
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", side_effect=last_error), \
             patch("asyncio.sleep", new_callable=AsyncMock), \
             patch.object(loop, "time", side_effect=[0, 0, 10]):
            from wait_for_db import wait_for_db
            with pytest.raises(RuntimeError, match="password authentication failed"):
                await wait_for_db()

    async def test_prints_not_ready_message_before_timeout(self, capsys):
        """Each failed attempt must print a 'not ready' message with the error."""
        fake_settings = _make_fake_settings(timeout=5)

        loop = asyncio.get_event_loop()
        with patch("wait_for_db.get_settings", return_value=fake_settings), \
             patch("asyncpg.connect", side_effect=OSError("refused")), \
             patch("asyncio.sleep", new_callable=AsyncMock), \
             patch.object(loop, "time", side_effect=[0, 0, 10]):
            from wait_for_db import wait_for_db
            with pytest.raises(RuntimeError):
                await wait_for_db()

        captured = capsys.readouterr()
        assert "not ready" in captured.out.lower()
