"""Unit tests for persistence.py — pipeline DB write layer.

Functions tested:
    _df_to_jsonable()           : Convert a DataFrame to JSON-safe list of dicts.
    _top_by_model_to_jsonable() : Convert Dict[domain, DataFrame] to JSON-safe dict.
    file_already_processed()    : Check if filename has rows in sentence_prediction.
    get_latest_analysis_id()    : Get newest TranscriptAnalysisLog.id for a patient.
    save_all()                  : Write all pipeline results inside one transaction.

Strategy:
    - _df_to_jsonable and _top_by_model_to_jsonable are pure functions (no DB),
      tested directly with pandas DataFrames.
    - file_already_processed, get_latest_analysis_id, and save_all use the
      conftest `engine` + `db` fixtures (in-memory SQLite) so no real DB is
      needed. SQLite does not support PostgreSQL's pg_insert ON CONFLICT syntax,
      so save_all() is tested via a mock Session to keep tests fast and portable.
"""

import json
import pytest
import pandas as pd
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from tests.factories import TestDataFactory


# ── _df_to_jsonable ───────────────────────────────────────────────────────────


class TestDfToJsonable:
    """_df_to_jsonable() converts a DataFrame to a plain list of dicts."""

    def test_none_returns_empty_list(self):
        from persistence import _df_to_jsonable
        assert _df_to_jsonable(None) == []

    def test_empty_dataframe_returns_empty_list(self):
        from persistence import _df_to_jsonable
        df = pd.DataFrame(columns=["a", "b"])
        result = _df_to_jsonable(df)
        assert result == []

    def test_single_row_dataframe(self):
        from persistence import _df_to_jsonable
        df = pd.DataFrame([{"text": "hello", "score": 0.9}])
        result = _df_to_jsonable(df)
        assert len(result) == 1
        assert result[0]["text"] == "hello"
        assert result[0]["score"] == pytest.approx(0.9)

    def test_multiple_rows(self):
        from persistence import _df_to_jsonable
        df = pd.DataFrame([
            {"text": "sentence one", "score": 0.8},
            {"text": "sentence two", "score": 0.6},
        ])
        result = _df_to_jsonable(df)
        assert len(result) == 2
        assert result[1]["text"] == "sentence two"

    def test_numpy_types_are_converted_to_python_types(self):
        """numpy.int64 / numpy.float64 must be converted — SQLAlchemy JSONB requires plain Python types."""
        import numpy as np
        from persistence import _df_to_jsonable
        df = pd.DataFrame([{"idx": np.int64(5), "score": np.float64(0.75)}])
        result = _df_to_jsonable(df)
        # Should be serializable with the standard json module (not just pandas')
        serialized = json.dumps(result)
        parsed = json.loads(serialized)
        assert parsed[0]["idx"] == 5
        assert parsed[0]["score"] == pytest.approx(0.75)

    def test_nan_values_become_none(self):
        """NaN must become None/null — JSON has no NaN."""
        from persistence import _df_to_jsonable
        df = pd.DataFrame([{"text": "ok", "score": float("nan")}])
        result = _df_to_jsonable(df)
        assert result[0]["score"] is None


# ── _top_by_model_to_jsonable ─────────────────────────────────────────────────


class TestTopByModelToJsonable:
    """_top_by_model_to_jsonable() converts Dict[domain, DataFrame] to JSON-safe dict."""

    def test_none_returns_empty_dict(self):
        from persistence import _top_by_model_to_jsonable
        assert _top_by_model_to_jsonable(None) == {}

    def test_empty_dict_returns_empty_dict(self):
        from persistence import _top_by_model_to_jsonable
        assert _top_by_model_to_jsonable({}) == {}

    def test_single_domain(self):
        from persistence import _top_by_model_to_jsonable
        df = pd.DataFrame([{"text": "sentence", "score": 0.9}])
        result = _top_by_model_to_jsonable({"cp": df})
        assert "cp" in result
        assert len(result["cp"]) == 1
        assert result["cp"][0]["text"] == "sentence"

    def test_multiple_domains(self):
        from persistence import _top_by_model_to_jsonable
        domains = ["cp", "le", "ed"]
        data = {d: pd.DataFrame([{"text": f"{d}-sent", "score": 0.5}]) for d in domains}
        result = _top_by_model_to_jsonable(data)
        assert set(result.keys()) == set(domains)
        for d in domains:
            assert result[d][0]["text"] == f"{d}-sent"

    def test_domain_with_empty_dataframe(self):
        from persistence import _top_by_model_to_jsonable
        result = _top_by_model_to_jsonable({"cp": pd.DataFrame()})
        assert result["cp"] == []


# ── file_already_processed ────────────────────────────────────────────────────


class TestFileAlreadyProcessed:
    """file_already_processed() returns True if sentence_prediction rows exist for a filename."""

    async def test_returns_false_for_unknown_filename(self, engine):
        from persistence import file_already_processed
        Session = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
        result = await file_already_processed(Session, "nonexistent-file.xlsx")
        assert result is False

    async def test_returns_false_for_empty_string_filename(self, engine):
        from persistence import file_already_processed
        Session = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
        result = await file_already_processed(Session, "")
        assert result is False

    async def test_returns_true_when_predictions_exist(self, engine, db):
        """If sentence_prediction rows exist for a patient_id, returns True."""
        from persistence import file_already_processed

        # Insert a parent analysis log first
        analysis = TestDataFactory.transcript_analysis(patient_id="file-check.xlsx")
        db.add(analysis)
        await db.flush()

        pred = TestDataFactory.sentence_prediction(
            analysis_id=analysis.id,
            patient_id="file-check.xlsx",
        )
        db.add(pred)
        await db.commit()

        Session = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
        result = await file_already_processed(Session, "file-check.xlsx")
        assert result is True

    async def test_different_filenames_are_independent(self, engine, db):
        """Processing file A must not affect the check for file B."""
        from persistence import file_already_processed

        analysis = TestDataFactory.transcript_analysis(patient_id="file-a.xlsx")
        db.add(analysis)
        await db.flush()
        pred = TestDataFactory.sentence_prediction(analysis_id=analysis.id, patient_id="file-a.xlsx")
        db.add(pred)
        await db.commit()

        Session = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
        assert await file_already_processed(Session, "file-a.xlsx") is True
        assert await file_already_processed(Session, "file-b.xlsx") is False


# ── get_latest_analysis_id ────────────────────────────────────────────────────


class TestGetLatestAnalysisId:
    """get_latest_analysis_id() returns the most recent id or None."""

    async def test_returns_none_for_unknown_patient(self, engine):
        from persistence import get_latest_analysis_id
        Session = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
        result = await get_latest_analysis_id(Session, "no-such-patient")
        assert result is None

    async def test_returns_id_for_known_patient(self, engine, db):
        from persistence import get_latest_analysis_id

        analysis = TestDataFactory.transcript_analysis(patient_id="sid-latest")
        db.add(analysis)
        await db.commit()

        Session = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
        result = await get_latest_analysis_id(Session, "sid-latest")
        assert result == analysis.id

    async def test_returns_most_recent_id_when_multiple_exist(self, engine, db):
        """With two runs for the same patient, the newest id is returned."""
        from persistence import get_latest_analysis_id

        a1 = TestDataFactory.transcript_analysis(patient_id="sid-multi")
        a2 = TestDataFactory.transcript_analysis(patient_id="sid-multi")
        db.add(a1)
        await db.flush()
        db.add(a2)
        await db.commit()

        Session = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
        result = await get_latest_analysis_id(Session, "sid-multi")
        # The latest analyzed_at should belong to a2 (inserted second)
        assert result == a2.id

    async def test_returns_none_for_empty_string_patient(self, engine):
        from persistence import get_latest_analysis_id
        Session = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
        result = await get_latest_analysis_id(Session, "")
        assert result is None


# ── save_all ──────────────────────────────────────────────────────────────────


class TestSaveAll:
    """save_all() returns True on success and False on any DB error.

    We mock the Session factory so these tests never touch a real DB.
    Testing the full transactional path would require a PostgreSQL-compatible
    backend (due to pg_insert ON CONFLICT); integration tests cover that.
    """

    def _make_minimal_kwargs(self):
        """Return the minimum keyword arguments needed to call save_all()."""
        return dict(
            filename="test-file.xlsx",
            patient_id="sid-save",
            doctor_speaker="Interviewer",
            patient_speaker="Patient_1",
            total_sentences=10,
            top_n=5,
            context_window=3,
            xlsx_bytes=b"fake-xlsx",
            final_results={},
            outcome_to_sheet={},
            domain_slot_map={},
            domain_short_map={},
        )

    async def test_returns_false_when_session_raises(self):
        """If the session throws during commit, save_all() returns False, never raises."""
        from persistence import save_all

        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.flush = AsyncMock(side_effect=RuntimeError("DB is down"))
        mock_session.rollback = AsyncMock()
        mock_session.commit = AsyncMock()

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_ctx)

        result = await save_all(mock_factory, **self._make_minimal_kwargs())
        assert result is False

    async def test_rollback_is_called_on_error(self):
        """On any DB error, rollback() must be called to prevent partial writes."""
        from persistence import save_all

        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.flush = AsyncMock(side_effect=Exception("flush failed"))
        mock_session.rollback = AsyncMock()
        mock_session.commit = AsyncMock()

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_ctx)

        await save_all(mock_factory, **self._make_minimal_kwargs())
        mock_session.rollback.assert_called_once()

    async def test_df_to_jsonable_none_inputs_are_skipped(self):
        """Passing None for all optional dfs does not raise — intermediate rows are just omitted."""
        from persistence import save_all

        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.flush = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        # Mock the execute calls needed for pg_insert upserts
        mock_session.execute = AsyncMock()

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_ctx)

        # None for all optional DataFrame args — should not raise
        result = await save_all(
            mock_factory,
            **self._make_minimal_kwargs(),
            df_raw=None,
            df_filtered=None,
            df_sentences=None,
            df_predicted=None,
            top_by_model=None,
        )
        # Returns True (commit path) since no exception was raised
        assert result is True

    async def test_commit_is_called_on_success(self):
        """commit() is called once when all steps succeed."""
        from persistence import save_all

        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.flush = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.execute = AsyncMock()

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_ctx)

        await save_all(mock_factory, **self._make_minimal_kwargs())
        mock_session.commit.assert_called_once()

    async def test_final_results_rows_are_added(self):
        """For each outcome + row in final_results, session.add() is called for SentencePrediction."""
        from persistence import save_all

        # One outcome, one row in the top-N DataFrame
        top_df = pd.DataFrame([{
            "index": 1, "i": 1, "i2": 1,
            "text": "test sentence",
            ".pred_1": 0.85,
            "context": "before <main>test sentence</main> after",
        }])
        kwargs = self._make_minimal_kwargs()
        kwargs["final_results"] = {"cancer_prognosis": top_df}
        kwargs["outcome_to_sheet"] = {"cancer_prognosis": "cp"}

        mock_session = AsyncMock()
        add_calls = []
        mock_session.add = MagicMock(side_effect=lambda x: add_calls.append(x))
        mock_session.flush = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.execute = AsyncMock()

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_ctx)

        result = await save_all(mock_factory, **kwargs)
        assert result is True
        # At minimum: 1 TranscriptAnalysisLog + 1 SentencePrediction
        assert len(add_calls) >= 2
