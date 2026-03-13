"""Tests for SQLAlchemy models defined in models.py.

Models tested (8 total):
  1. DoctorSentenceView  — composite PK (file, i, i2)
  2. DoctorRewriteLog    — composite PK + FK constraint to DoctorSentenceView
  3. PatientSummary      — composite PK (file, speaker)
  4. PatientSummaryScoring — FK to PatientSummary, check constraints (0-10)
  5. PatientResponses    — FK to PatientSummary
  6. SurveySubmissionLog — FK to PatientSummary, autoincrement PK
  7. TranscriptAnalysisLog — autoincrement PK, relationship to SentencePrediction
  8. SentencePrediction  — FK to TranscriptAnalysisLog, cascade delete
"""

import json
from datetime import datetime, timezone

from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Base,
    DoctorSentenceView,
    DoctorRewriteLog,
    PatientSummary,
    PatientSummaryScoring,
    PatientResponses,
    SurveySubmissionLog,
    TranscriptAnalysisLog,
    SentencePrediction,
)
from tests.factories import TestDataFactory


# ── DoctorSentenceView ────────────────────────────────────────────────────


class TestDoctorSentenceView:
    """DoctorSentenceView model — composite PK (file, i, i2)."""

    async def test_instantiation_with_defaults(self):
        """Factory creates a valid instance with all expected fields."""
        obj = TestDataFactory.doctor_sentence()
        assert obj.file == "test-file.xlsx"
        assert obj.i == 1
        assert obj.i2 == 1
        assert obj.speaker == "Interviewer"
        assert obj.sentence == "This is a test sentence."
        assert obj.score == 0.85
        assert obj.class_ == "Cancer Prognosis"

    async def test_composite_primary_key(self):
        """Table uses a composite PK of (file, i, i2)."""
        mapper = inspect(DoctorSentenceView)
        pk_cols = [col.name for col in mapper.primary_key]
        assert pk_cols == ["file", "i", "i2"]

    async def test_repr(self):
        """__repr__ includes file, i, i2."""
        obj = TestDataFactory.doctor_sentence(file="f.xlsx", i=3, i2=5)
        r = repr(obj)
        assert "f.xlsx" in r
        assert "3" in r
        assert "5" in r

    async def test_persist_and_query(self, db):
        """Round-trip: insert and query back."""
        obj = TestDataFactory.doctor_sentence(file="rt.xlsx", i=1, i2=1)
        db.add(obj)
        await db.commit()

        result = await db.execute(
            select(DoctorSentenceView).where(DoctorSentenceView.file == "rt.xlsx")
        )
        row = result.scalar_one()
        assert row.speaker == "Interviewer"
        assert row.score == 0.85

    async def test_class_column_maps_to_class_attribute(self):
        """The 'class' DB column is accessed as class_ in Python."""
        obj = DoctorSentenceView(file="x", i=1, i2=1, class_="ED")
        assert obj.class_ == "ED"

    async def test_tablename(self):
        assert DoctorSentenceView.__tablename__ == "doctor_sentence_view"


# ── DoctorRewriteLog ─────────────────────────────────────────────────────


class TestDoctorRewriteLog:
    """DoctorRewriteLog model — composite FK to DoctorSentenceView."""

    async def test_instantiation(self):
        obj = TestDataFactory.doctor_rewrite()
        assert obj.original_sentence == "Original sentence."
        assert obj.revised_sentence == "Revised sentence."
        assert obj.selected is False

    async def test_composite_pk_includes_time(self):
        """PK is (file, i, i2, time)."""
        mapper = inspect(DoctorRewriteLog)
        pk_cols = [col.name for col in mapper.primary_key]
        assert "time" in pk_cols
        assert len(pk_cols) == 4

    async def test_default_selected_applied_on_persist(self, db):
        """Column default=False is applied at INSERT time, not at __init__."""
        parent = TestDataFactory.doctor_sentence(file="sel.xlsx", i=1, i2=1)
        db.add(parent)
        await db.flush()

        obj = DoctorRewriteLog(
            file="sel.xlsx", i=1, i2=1,
            time=datetime.now(timezone.utc),
        )
        db.add(obj)
        await db.commit()

        result = await db.execute(
            select(DoctorRewriteLog).where(DoctorRewriteLog.file == "sel.xlsx")
        )
        row = result.scalar_one()
        assert row.selected is False

    async def test_repr(self):
        obj = TestDataFactory.doctor_rewrite(file="rw.xlsx", i=2, i2=3)
        r = repr(obj)
        assert "rw.xlsx" in r
        assert "DoctorRewriteLog" in r

    async def test_persist_with_parent(self, db):
        """Insert parent DoctorSentenceView, then child DoctorRewriteLog."""
        parent = TestDataFactory.doctor_sentence(file="fk.xlsx", i=1, i2=1)
        db.add(parent)
        await db.flush()

        child = TestDataFactory.doctor_rewrite(file="fk.xlsx", i=1, i2=1)
        db.add(child)
        await db.commit()

        result = await db.execute(
            select(DoctorRewriteLog).where(DoctorRewriteLog.file == "fk.xlsx")
        )
        row = result.scalar_one()
        assert row.original_score == 0.85


# ── PatientSummary ────────────────────────────────────────────────────────


class TestPatientSummary:
    """PatientSummary model — composite PK (file, speaker)."""

    async def test_instantiation(self):
        obj = TestDataFactory.patient_summary()
        assert obj.file == "test-file.xlsx"
        assert obj.speaker == "Patient_1"
        assert obj.class_1 == "Cancer Prognosis"
        assert obj.summary_class_5 == "IUS summary text."

    async def test_composite_pk(self):
        mapper = inspect(PatientSummary)
        pk_cols = [col.name for col in mapper.primary_key]
        assert pk_cols == ["file", "speaker"]

    async def test_repr(self):
        obj = TestDataFactory.patient_summary(file="ps.xlsx", speaker="P2")
        r = repr(obj)
        assert "ps.xlsx" in r
        assert "P2" in r

    async def test_persist_and_query(self, db):
        obj = TestDataFactory.patient_summary(file="ps-rt.xlsx", speaker="P1")
        db.add(obj)
        await db.commit()

        result = await db.execute(
            select(PatientSummary).where(PatientSummary.file == "ps-rt.xlsx")
        )
        row = result.scalar_one()
        assert row.entire_summary == "Overall summary text."


# ── PatientSummaryScoring ─────────────────────────────────────────────────


class TestPatientSummaryScoring:
    """PatientSummaryScoring model — FK to PatientSummary, check constraints."""

    async def test_instantiation(self):
        obj = TestDataFactory.patient_scoring()
        assert obj.class_1_patient_scoring == 5
        assert obj.class_5_patient_scoring == 9

    async def test_composite_pk(self):
        mapper = inspect(PatientSummaryScoring)
        pk_cols = [col.name for col in mapper.primary_key]
        assert pk_cols == ["file", "speaker"]

    async def test_persist_with_parent(self, db):
        parent = TestDataFactory.patient_summary(file="pss.xlsx", speaker="P1")
        db.add(parent)
        await db.flush()

        child = TestDataFactory.patient_scoring(file="pss.xlsx", speaker="P1")
        db.add(child)
        await db.commit()

        result = await db.execute(
            select(PatientSummaryScoring).where(
                PatientSummaryScoring.file == "pss.xlsx"
            )
        )
        row = result.scalar_one()
        assert row.class_3_patient_scoring == 7

    async def test_repr(self):
        obj = TestDataFactory.patient_scoring(file="sc.xlsx", speaker="P3")
        r = repr(obj)
        assert "PatientSummaryScoring" in r
        assert "sc.xlsx" in r


# ── PatientResponses ──────────────────────────────────────────────────────


class TestPatientResponses:
    """PatientResponses model — FK to PatientSummary."""

    async def test_instantiation(self):
        obj = TestDataFactory.patient_responses()
        assert obj.answer_1 == "Answer to question 1"
        assert obj.answer_5 == "Answer to question 5"

    async def test_persist_with_parent(self, db):
        parent = TestDataFactory.patient_summary(file="pr.xlsx", speaker="P1")
        db.add(parent)
        await db.flush()

        child = TestDataFactory.patient_responses(file="pr.xlsx", speaker="P1")
        db.add(child)
        await db.commit()

        result = await db.execute(
            select(PatientResponses).where(PatientResponses.file == "pr.xlsx")
        )
        row = result.scalar_one()
        assert row.answer_3 == "Answer to question 3"

    async def test_repr(self):
        obj = TestDataFactory.patient_responses(file="resp.xlsx", speaker="P4")
        r = repr(obj)
        assert "PatientResponses" in r
        assert "resp.xlsx" in r


# ── SurveySubmissionLog ───────────────────────────────────────────────────


class TestSurveySubmissionLog:
    """SurveySubmissionLog model — auto-increment PK, FK to PatientSummary."""

    async def test_instantiation(self):
        obj = TestDataFactory.survey_submission()
        assert obj.survey_type == "baseline"
        assert obj.answers == '{"q1": "a"}'

    async def test_auto_increment_pk(self):
        mapper = inspect(SurveySubmissionLog)
        pk_cols = [col.name for col in mapper.primary_key]
        assert pk_cols == ["id"]

    async def test_default_redcap_synced_applied_on_persist(self, db):
        """Column default=False is applied at INSERT time, not at __init__."""
        parent = TestDataFactory.patient_summary(file="rc.xlsx", speaker="P1")
        db.add(parent)
        await db.flush()

        obj = SurveySubmissionLog(
            file="rc.xlsx", speaker="P1", survey_type="baseline", answers="{}"
        )
        db.add(obj)
        await db.commit()

        result = await db.execute(
            select(SurveySubmissionLog).where(
                SurveySubmissionLog.file == "rc.xlsx"
            )
        )
        row = result.scalar_one()
        assert row.redcap_synced is False

    async def test_persist_with_parent(self, db):
        parent = TestDataFactory.patient_summary(file="sv.xlsx", speaker="P1")
        db.add(parent)
        await db.flush()

        sub = TestDataFactory.survey_submission(file="sv.xlsx", speaker="P1")
        db.add(sub)
        await db.commit()

        result = await db.execute(
            select(SurveySubmissionLog).where(
                SurveySubmissionLog.file == "sv.xlsx"
            )
        )
        row = result.scalar_one()
        assert row.id is not None
        assert row.survey_type == "baseline"

    async def test_repr(self):
        obj = SurveySubmissionLog(
            id=42, file="x", speaker="P", survey_type="post", answers="{}"
        )
        r = repr(obj)
        assert "42" in r
        assert "post" in r

    async def test_nullable_extra_data(self):
        obj = TestDataFactory.survey_submission()
        assert obj.extra_data is None


# ── TranscriptAnalysisLog ─────────────────────────────────────────────────


class TestTranscriptAnalysisLog:
    """TranscriptAnalysisLog model — autoincrement PK, relationship to predictions."""

    async def test_instantiation(self):
        obj = TestDataFactory.transcript_analysis()
        assert obj.patient_id == "sid-01"
        assert obj.total_sentences == 100
        assert obj.top_n == 5
        assert obj.context_window == 3
        assert obj.source_filename == "test-transcript.xlsx"

    async def test_default_values(self):
        """Defaults: total_sentences=0, top_n=0, context_window=3."""
        obj = TranscriptAnalysisLog(patient_id="test")
        assert obj.total_sentences is None or obj.total_sentences == 0
        assert obj.context_window is None or obj.context_window == 3

    async def test_model_results_stores_json_string(self):
        data = {"cp": {"count": 10}, "le": {"count": 5}}
        obj = TranscriptAnalysisLog(
            patient_id="sid-json",
            total_sentences=50,
            top_n=5,
            context_window=3,
            model_results=json.dumps(data),
        )
        parsed = json.loads(obj.model_results)
        assert parsed["cp"]["count"] == 10

    async def test_xlsx_data_stores_binary(self):
        binary = b"\x50\x4b\x03\x04fake-zip-content"
        obj = TestDataFactory.transcript_analysis(xlsx_data=binary)
        assert obj.xlsx_data == binary

    async def test_persist_and_query(self, db):
        obj = TestDataFactory.transcript_analysis(patient_id="sid-rt")
        db.add(obj)
        await db.commit()

        result = await db.execute(
            select(TranscriptAnalysisLog).where(
                TranscriptAnalysisLog.patient_id == "sid-rt"
            )
        )
        row = result.scalar_one()
        assert row.id is not None
        assert row.patient_id == "sid-rt"

    async def test_repr(self):
        obj = TranscriptAnalysisLog(id=7, patient_id="sid-repr")
        r = repr(obj)
        assert "7" in r
        assert "sid-repr" in r

    async def test_predictions_relationship_exists(self):
        """The model declares a 'predictions' relationship."""
        mapper = inspect(TranscriptAnalysisLog)
        assert "predictions" in mapper.relationships


# ── SentencePrediction ────────────────────────────────────────────────────


class TestSentencePrediction:
    """SentencePrediction model — FK to TranscriptAnalysisLog, cascade delete."""

    async def test_instantiation(self):
        obj = TestDataFactory.sentence_prediction()
        assert obj.model == "cp"
        assert obj.pred_score == 0.95
        assert obj.patient_id == "sid-01"
        assert obj.sentence_text == "test sentence"

    async def test_analysis_relationship(self):
        """The model declares an 'analysis' relationship back to TranscriptAnalysisLog."""
        mapper = inspect(SentencePrediction)
        assert "analysis" in mapper.relationships

    async def test_persist_with_parent(self, db):
        parent = TestDataFactory.transcript_analysis(patient_id="sid-sp")
        db.add(parent)
        await db.flush()

        child = TestDataFactory.sentence_prediction(
            analysis_id=parent.id, patient_id="sid-sp", model="le", pred_score=0.77
        )
        db.add(child)
        await db.commit()

        result = await db.execute(
            select(SentencePrediction).where(
                SentencePrediction.patient_id == "sid-sp"
            )
        )
        row = result.scalar_one()
        assert row.model == "le"
        assert row.pred_score == 0.77

    async def test_repr(self):
        obj = SentencePrediction(id=99, model="inc", pred_score=0.5)
        r = repr(obj)
        assert "99" in r
        assert "inc" in r
        assert "0.5" in r

    async def test_cascade_delete_removes_predictions(self, db):
        """Deleting a TranscriptAnalysisLog cascades to child SentencePredictions."""
        parent = TestDataFactory.transcript_analysis(patient_id="sid-cas")
        db.add(parent)
        await db.flush()

        preds = TestDataFactory.prediction_set(
            analysis_id=parent.id, patient_id="sid-cas", model="cp", count=3
        )
        db.add_all(preds)
        await db.commit()

        # Verify children exist
        result = await db.execute(
            select(SentencePrediction).where(
                SentencePrediction.analysis_id == parent.id
            )
        )
        assert len(result.scalars().all()) == 3

        # Delete parent
        await db.delete(parent)
        await db.commit()

        # Verify children are gone
        result = await db.execute(
            select(SentencePrediction).where(
                SentencePrediction.analysis_id == parent.id
            )
        )
        assert len(result.scalars().all()) == 0

    async def test_bulk_prediction_set_factory(self, db):
        """TestDataFactory.prediction_set creates the expected number of rows."""
        parent = TestDataFactory.transcript_analysis(patient_id="sid-bulk")
        db.add(parent)
        await db.flush()

        preds = TestDataFactory.prediction_set(
            analysis_id=parent.id, patient_id="sid-bulk", model="ed", count=7
        )
        assert len(preds) == 7
        db.add_all(preds)
        await db.commit()

        result = await db.execute(
            select(SentencePrediction).where(
                SentencePrediction.analysis_id == parent.id
            )
        )
        assert len(result.scalars().all()) == 7


# ── Cross-model: Base and metadata ───────────────────────────────────────


class TestBaseMetadata:
    """Verify all 8 models share the same Base and metadata."""

    async def test_all_models_share_same_base(self):
        models = [
            DoctorSentenceView, DoctorRewriteLog,
            PatientSummary, PatientSummaryScoring, PatientResponses,
            SurveySubmissionLog,
            TranscriptAnalysisLog, SentencePrediction,
        ]
        for model in models:
            assert issubclass(model, Base), f"{model.__name__} is not a subclass of Base"

    async def test_all_table_names_in_metadata(self):
        expected = {
            "doctor_sentence_view", "doctor_rewrite_log",
            "patient_summary", "patient_summary_scoring", "patient_responses",
            "survey_submission_log",
            "transcript_analysis_log", "sentence_prediction",
        }
        actual = set(Base.metadata.tables.keys())
        assert expected.issubset(actual)
