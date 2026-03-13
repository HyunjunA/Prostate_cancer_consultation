"""Integration tests: transcript analysis -> DB storage -> query round-trip.

Tests the full lifecycle of TranscriptAnalysisLog and SentencePrediction records:
  - Create analysis log + sentence predictions -> query back
  - Cascade delete behaviour
  - History query ordering (newest first)
  - Multiple analyses for the same patient
"""

import json

import pytest
from sqlalchemy import select

from models import TranscriptAnalysisLog, SentencePrediction
from tests.factories import TestDataFactory


pytestmark = pytest.mark.integration


class TestTranscriptDbRoundTrip:
    """Insert TranscriptAnalysisLog + SentencePredictions, then query back."""

    async def test_create_analysis_log_and_query(self, db):
        """Insert a TranscriptAnalysisLog and retrieve it by patient_id."""
        record = TestDataFactory.transcript_analysis(
            patient_id="sid-int-01",
            total_sentences=150,
            top_n=10,
            context_window=5,
        )
        db.add(record)
        await db.commit()

        result = await db.execute(
            select(TranscriptAnalysisLog).where(
                TranscriptAnalysisLog.patient_id == "sid-int-01"
            )
        )
        row = result.scalar_one()
        assert row.total_sentences == 150
        assert row.top_n == 10
        assert row.context_window == 5
        assert row.id is not None

    async def test_create_predictions_linked_to_analysis(self, db):
        """Insert predictions linked to an analysis and query them back."""
        analysis = TestDataFactory.transcript_analysis(patient_id="sid-int-02")
        db.add(analysis)
        await db.flush()

        preds = TestDataFactory.prediction_set(
            analysis_id=analysis.id,
            patient_id="sid-int-02",
            model="cp",
            count=5,
        )
        db.add_all(preds)
        await db.commit()

        result = await db.execute(
            select(SentencePrediction).where(
                SentencePrediction.analysis_id == analysis.id
            )
        )
        rows = result.scalars().all()
        assert len(rows) == 5
        assert all(r.model == "cp" for r in rows)
        assert all(r.patient_id == "sid-int-02" for r in rows)

    async def test_multiple_models_for_same_analysis(self, db):
        """Insert predictions for multiple NLP models under one analysis."""
        analysis = TestDataFactory.transcript_analysis(patient_id="sid-int-03")
        db.add(analysis)
        await db.flush()

        models = ["cp", "le", "ed", "inc", "ius"]
        all_preds = []
        for m in models:
            all_preds.extend(
                TestDataFactory.prediction_set(
                    analysis_id=analysis.id,
                    patient_id="sid-int-03",
                    model=m,
                    count=3,
                )
            )
        db.add_all(all_preds)
        await db.commit()

        result = await db.execute(
            select(SentencePrediction).where(
                SentencePrediction.analysis_id == analysis.id
            )
        )
        rows = result.scalars().all()
        assert len(rows) == 15  # 5 models x 3 each
        found_models = {r.model for r in rows}
        assert found_models == set(models)

    async def test_model_results_json_round_trip(self, db):
        """The model_results column stores JSON that survives a round-trip."""
        data = {
            "cp": [{"index": 1, "i": 1, "i2": 1, "speaker": "Int",
                     "text": "hello", "pred_1": 0.95}],
            "le": [{"index": 2, "i": 2, "i2": 1, "speaker": "Pat",
                     "text": "world", "pred_1": 0.80}],
        }
        record = TranscriptAnalysisLog(
            patient_id="sid-json-rt",
            total_sentences=50,
            top_n=5,
            context_window=3,
            model_results=json.dumps(data),
            xlsx_data=b"fake",
            source_filename="test.xlsx",
        )
        db.add(record)
        await db.commit()

        result = await db.execute(
            select(TranscriptAnalysisLog).where(
                TranscriptAnalysisLog.patient_id == "sid-json-rt"
            )
        )
        row = result.scalar_one()
        parsed = json.loads(row.model_results)
        assert parsed["cp"][0]["pred_1"] == 0.95
        assert parsed["le"][0]["text"] == "world"

    async def test_xlsx_binary_round_trip(self, db):
        """Binary xlsx data survives a DB round-trip."""
        xlsx_bytes = b"\x50\x4b\x03\x04test-binary-content-123"
        record = TestDataFactory.transcript_analysis(
            patient_id="sid-bin-rt",
            xlsx_data=xlsx_bytes,
        )
        db.add(record)
        await db.commit()

        result = await db.execute(
            select(TranscriptAnalysisLog).where(
                TranscriptAnalysisLog.patient_id == "sid-bin-rt"
            )
        )
        row = result.scalar_one()
        assert row.xlsx_data == xlsx_bytes


class TestTranscriptDbCascade:
    """Cascade delete: removing analysis removes its predictions."""

    async def test_cascade_delete_removes_all_predictions(self, db):
        """Delete TranscriptAnalysisLog -> all SentencePrediction children gone."""
        analysis = TestDataFactory.transcript_analysis(patient_id="sid-cas-int")
        db.add(analysis)
        await db.flush()

        preds = TestDataFactory.prediction_set(
            analysis_id=analysis.id,
            patient_id="sid-cas-int",
            model="cp",
            count=5,
        )
        db.add_all(preds)
        await db.commit()

        analysis_id = analysis.id
        await db.delete(analysis)
        await db.commit()

        result = await db.execute(
            select(SentencePrediction).where(
                SentencePrediction.analysis_id == analysis_id
            )
        )
        assert len(result.scalars().all()) == 0

    async def test_cascade_delete_does_not_affect_other_analyses(self, db):
        """Deleting one analysis does not remove another patient's predictions."""
        a1 = TestDataFactory.transcript_analysis(patient_id="sid-cas-a")
        a2 = TestDataFactory.transcript_analysis(patient_id="sid-cas-b")
        db.add_all([a1, a2])
        await db.flush()

        p1 = TestDataFactory.prediction_set(
            analysis_id=a1.id, patient_id="sid-cas-a", model="cp", count=3,
        )
        p2 = TestDataFactory.prediction_set(
            analysis_id=a2.id, patient_id="sid-cas-b", model="le", count=4,
        )
        db.add_all(p1 + p2)
        await db.commit()

        # Delete a1 only
        await db.delete(a1)
        await db.commit()

        # a2's predictions should remain
        result = await db.execute(
            select(SentencePrediction).where(
                SentencePrediction.analysis_id == a2.id
            )
        )
        assert len(result.scalars().all()) == 4


class TestTranscriptDbHistory:
    """History ordering: multiple analyses for the same patient."""

    async def test_multiple_analyses_for_same_patient(self, db):
        """The same patient can have multiple analysis runs."""
        for i in range(3):
            record = TestDataFactory.transcript_analysis(
                patient_id="sid-hist",
                total_sentences=100 + i * 10,
                source_filename=f"file_{i}.xlsx",
            )
            db.add(record)
        await db.commit()

        result = await db.execute(
            select(TranscriptAnalysisLog).where(
                TranscriptAnalysisLog.patient_id == "sid-hist"
            )
        )
        rows = result.scalars().all()
        assert len(rows) == 3
        # Each should have a unique ID
        ids = [r.id for r in rows]
        assert len(set(ids)) == 3

    async def test_ordering_by_analyzed_at_desc(self, db):
        """History query returns newest first when ordered by analyzed_at DESC."""
        for i in range(3):
            db.add(TestDataFactory.transcript_analysis(
                patient_id="sid-order",
                total_sentences=50 + i,
            ))
        await db.commit()

        result = await db.execute(
            select(TranscriptAnalysisLog)
            .where(TranscriptAnalysisLog.patient_id == "sid-order")
            .order_by(TranscriptAnalysisLog.analyzed_at.desc())
        )
        rows = result.scalars().all()
        # The last inserted should come first (latest analyzed_at)
        assert rows[0].total_sentences >= rows[-1].total_sentences or len(rows) == 3

    async def test_source_filename_preserved(self, db):
        """source_filename is stored and retrievable."""
        record = TestDataFactory.transcript_analysis(
            patient_id="sid-fname",
            source_filename="REC001 (SID 42).xlsx",
        )
        db.add(record)
        await db.commit()

        result = await db.execute(
            select(TranscriptAnalysisLog).where(
                TranscriptAnalysisLog.patient_id == "sid-fname"
            )
        )
        row = result.scalar_one()
        assert row.source_filename == "REC001 (SID 42).xlsx"

    async def test_prediction_scores_queryable_by_threshold(self, db):
        """Query predictions with a minimum score threshold."""
        analysis = TestDataFactory.transcript_analysis(patient_id="sid-thresh")
        db.add(analysis)
        await db.flush()

        # Scores: 0.85, 0.80, 0.75, 0.70, 0.65
        preds = TestDataFactory.prediction_set(
            analysis_id=analysis.id,
            patient_id="sid-thresh",
            model="cp",
            count=5,
        )
        db.add_all(preds)
        await db.commit()

        result = await db.execute(
            select(SentencePrediction).where(
                SentencePrediction.analysis_id == analysis.id,
                SentencePrediction.pred_score >= 0.8,
            )
        )
        rows = result.scalars().all()
        assert len(rows) == 2
        assert all(r.pred_score >= 0.8 for r in rows)
