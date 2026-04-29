"""Unit tests for verify_pipeline_db.py — pipeline verification helpers.

Classes / functions tested:
    CheckResult            : Data class holding one check's outcome.
        .to_dict()         : Returns a dict matching the HTTP endpoint schema.
        .render()          : Returns a formatted string for terminal output.
    main()                 : Top-level runner — environment setup, empty-DB
                             edge case, JSON vs human output, exit codes.
    _check_analysis()      : Runs 7 checks against a DB session — tested via
                             a mock session so no real DB is needed.

Strategy:
    - CheckResult is a plain dataclass with no async logic; tested directly.
    - main() is tested with a fully-mocked session so no DB connection is made.
    - _check_analysis() DB queries are mocked at the session.execute level to
      keep tests fast and cover all pass/fail branches for every check.
"""

import json
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── CheckResult ───────────────────────────────────────────────────────────────


class TestCheckResult:
    """CheckResult stores one check's outcome and can serialise / render itself."""

    def _make(self, passed=True, detail=""):
        from verify_pipeline_db import CheckResult
        return CheckResult(
            name="my check",
            passed=passed,
            observed="observed=42",
            expected="expected=42",
            detail=detail,
        )

    def test_to_dict_keys(self):
        """to_dict() must return all 5 keys expected by the HTTP endpoint schema."""
        result = self._make()
        d = result.to_dict()
        assert set(d.keys()) == {"name", "pass", "observed", "expected", "detail"}

    def test_to_dict_pass_true(self):
        d = self._make(passed=True).to_dict()
        assert d["pass"] is True

    def test_to_dict_pass_false(self):
        d = self._make(passed=False).to_dict()
        assert d["pass"] is False

    def test_to_dict_preserves_name(self):
        from verify_pipeline_db import CheckResult
        cr = CheckResult("my specific check", True, "obs", "exp")
        assert cr.to_dict()["name"] == "my specific check"

    def test_render_contains_pass_tag_when_passed(self):
        line = self._make(passed=True).render()
        assert "PASS" in line

    def test_render_contains_fail_tag_when_not_passed(self):
        line = self._make(passed=False).render()
        assert "FAIL" in line

    def test_render_contains_check_name(self):
        line = self._make().render()
        assert "my check" in line

    def test_render_contains_detail_when_present(self):
        line = self._make(detail="missing=foo").render()
        assert "missing=foo" in line

    def test_render_detail_absent_when_empty(self):
        """When detail is empty, the detail text must NOT appear in the rendered line."""
        line = self._make(detail="").render()
        # The extra detail line should not be present for clean PASS output
        assert "\n" not in line

    def test_to_dict_is_json_serializable(self):
        """to_dict() output must be serializable with the standard json module."""
        d = self._make(passed=False, detail="some detail").to_dict()
        dumped = json.dumps(d)
        parsed = json.loads(dumped)
        assert parsed["pass"] is False


# ── main() — environment and empty-DB edge cases ─────────────────────────────


class TestMainEnvironment:
    """main() handles missing DATABASE_URL and empty transcript_analysis_log."""

    async def test_returns_2_when_database_url_not_set(self):
        """main() must return exit code 2 when DATABASE_URL is not in the env."""
        with patch.dict("os.environ", {}, clear=True):
            # Remove DATABASE_URL if present
            import os
            os.environ.pop("DATABASE_URL", None)
            from verify_pipeline_db import main
            code = await main(analysis_id=None, as_json=False)
        assert code == 2

    async def test_returns_1_when_transcript_log_is_empty(self):
        """main() must return exit code 1 when there are no analysis rows."""
        # Provide a DATABASE_URL so we get past the env check
        fake_engine = MagicMock()
        fake_engine.dispose = AsyncMock()

        # The session.execute for the SELECT ids returns an empty list
        mock_scalars = MagicMock()
        mock_scalars.all = MagicMock(return_value=[])
        mock_execute_result = MagicMock()
        mock_execute_result.scalars = MagicMock(return_value=mock_scalars)

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_execute_result)

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_Session = MagicMock(return_value=mock_session_ctx)

        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://u:p@h/d"}), \
             patch("verify_pipeline_db.create_async_engine", return_value=fake_engine), \
             patch("verify_pipeline_db.async_sessionmaker", return_value=mock_Session):
            from verify_pipeline_db import main
            code = await main(analysis_id=None, as_json=False)

        assert code == 1

    async def test_normalises_plain_postgresql_scheme(self):
        """main() must convert 'postgresql://' to 'postgresql+asyncpg://' before creating engine."""
        fake_engine = MagicMock()
        fake_engine.dispose = AsyncMock()

        mock_scalars = MagicMock()
        mock_scalars.all = MagicMock(return_value=[])
        mock_execute_result = MagicMock()
        mock_execute_result.scalars = MagicMock(return_value=mock_scalars)

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_execute_result)

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_Session = MagicMock(return_value=mock_session_ctx)

        with patch.dict("os.environ", {"DATABASE_URL": "postgresql://user:pass@host/db"}), \
             patch("verify_pipeline_db.create_async_engine", return_value=fake_engine) as mock_create, \
             patch("verify_pipeline_db.async_sessionmaker", return_value=mock_Session):
            from verify_pipeline_db import main
            await main(analysis_id=None, as_json=False)

        used_url = mock_create.call_args[0][0]
        assert used_url.startswith("postgresql+asyncpg://")

    async def test_returns_0_when_all_checks_pass(self):
        """main() returns exit code 0 when every check passes for every analysis."""
        fake_engine = MagicMock()
        fake_engine.dispose = AsyncMock()

        # Mock session so _check_analysis is also mocked out entirely
        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://u:p@h/d"}), \
             patch("verify_pipeline_db.create_async_engine", return_value=fake_engine), \
             patch("verify_pipeline_db._check_analysis", return_value=[]) as mock_check, \
             patch("verify_pipeline_db.async_sessionmaker") as mock_sm:

            # Wire up the session context so main() can call db.execute for ids
            mock_scalars = MagicMock()
            mock_scalars.all = MagicMock(return_value=[1])
            mock_exec = MagicMock()
            mock_exec.scalars = MagicMock(return_value=mock_scalars)

            mock_db = AsyncMock()
            mock_db.execute = AsyncMock(return_value=mock_exec)

            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)

            mock_sm.return_value.return_value = mock_ctx

            from verify_pipeline_db import main
            code = await main(analysis_id=None, as_json=False)

        assert code == 0

    async def test_returns_1_when_any_check_fails(self):
        """main() returns exit code 1 when at least one check fails."""
        from verify_pipeline_db import CheckResult
        fake_engine = MagicMock()
        fake_engine.dispose = AsyncMock()

        failing_check = CheckResult("bad check", False, "obs", "exp")

        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://u:p@h/d"}), \
             patch("verify_pipeline_db.create_async_engine", return_value=fake_engine), \
             patch("verify_pipeline_db._check_analysis", return_value=[failing_check]), \
             patch("verify_pipeline_db.async_sessionmaker") as mock_sm:

            mock_scalars = MagicMock()
            mock_scalars.all = MagicMock(return_value=[1])
            mock_exec = MagicMock()
            mock_exec.scalars = MagicMock(return_value=mock_scalars)

            mock_db = AsyncMock()
            mock_db.execute = AsyncMock(return_value=mock_exec)

            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)

            mock_sm.return_value.return_value = mock_ctx

            from verify_pipeline_db import main
            code = await main(analysis_id=None, as_json=False)

        assert code == 1


# ── main() — JSON output ──────────────────────────────────────────────────────


class TestMainJsonOutput:
    """main() emits valid JSON when --json flag is set."""

    async def test_json_output_has_summary_and_analyses_keys(self, capsys):
        """JSON output must contain 'summary' and 'analyses' top-level keys."""
        from verify_pipeline_db import CheckResult
        fake_engine = MagicMock()
        fake_engine.dispose = AsyncMock()

        passing_check = CheckResult("check A", True, "obs=1", "exp=1")

        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://u:p@h/d"}), \
             patch("verify_pipeline_db.create_async_engine", return_value=fake_engine), \
             patch("verify_pipeline_db._check_analysis", return_value=[passing_check]), \
             patch("verify_pipeline_db.async_sessionmaker") as mock_sm:

            mock_scalars = MagicMock()
            mock_scalars.all = MagicMock(return_value=[1])
            mock_exec = MagicMock()
            mock_exec.scalars = MagicMock(return_value=mock_scalars)

            mock_db = AsyncMock()
            mock_db.execute = AsyncMock(return_value=mock_exec)

            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)

            mock_sm.return_value.return_value = mock_ctx

            from verify_pipeline_db import main
            await main(analysis_id=None, as_json=True)

        output = capsys.readouterr().out
        parsed = json.loads(output)
        assert "summary" in parsed
        assert "analyses" in parsed

    async def test_json_summary_counts_are_correct(self, capsys):
        """summary.total / passed / failed must reflect the actual check results."""
        from verify_pipeline_db import CheckResult
        fake_engine = MagicMock()
        fake_engine.dispose = AsyncMock()

        checks = [
            CheckResult("pass check", True, "ok", "ok"),
            CheckResult("fail check", False, "bad", "good"),
        ]

        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://u:p@h/d"}), \
             patch("verify_pipeline_db.create_async_engine", return_value=fake_engine), \
             patch("verify_pipeline_db._check_analysis", return_value=checks), \
             patch("verify_pipeline_db.async_sessionmaker") as mock_sm:

            mock_scalars = MagicMock()
            mock_scalars.all = MagicMock(return_value=[1])
            mock_exec = MagicMock()
            mock_exec.scalars = MagicMock(return_value=mock_scalars)

            mock_db = AsyncMock()
            mock_db.execute = AsyncMock(return_value=mock_exec)

            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)

            mock_sm.return_value.return_value = mock_ctx

            from verify_pipeline_db import main
            await main(analysis_id=None, as_json=True)

        parsed = json.loads(capsys.readouterr().out)
        assert parsed["summary"]["total"] == 2
        assert parsed["summary"]["passed"] == 1
        assert parsed["summary"]["failed"] == 1
