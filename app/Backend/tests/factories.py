"""
Test data factories — generate mock data for tests.

Provides helper functions and a TestDataFactory class that creates
SQLAlchemy model instances ready for insertion into the test DB.
"""

from datetime import datetime, timezone
from typing import Optional

from models import (
    DoctorRewriteLog,
    PatientSummary,
    PatientSummaryDomain,
    SurveySubmissionLog,
    TranscriptAnalysisLog,
    SentencePrediction,
)


class TestDataFactory:
    """Factory for creating test model instances with sensible defaults."""

    _counter: int = 0

    @classmethod
    def _next_id(cls) -> int:
        cls._counter += 1
        return cls._counter

    @classmethod
    def reset(cls) -> None:
        cls._counter = 0

    # ── Doctor Interface ──────────────────────────────────────────────

    @staticmethod
    def doctor_rewrite(
        file: str = "test-file.xlsx",
        i: int = 1,
        i2: int = 1,
        speaker: str = "Interviewer",
        original_sentence: str = "Original sentence.",
        revised_sentence: str = "Revised sentence.",
        score: float = 0.45,
        class_: str = "Cancer Prognosis",
    ) -> DoctorRewriteLog:
        return DoctorRewriteLog(
            file=file,
            i=i,
            i2=i2,
            speaker=speaker,
            original_sentence=original_sentence,
            revised_sentence=revised_sentence,
            score=score,
            class_=class_,
            time=datetime.now(timezone.utc),
        )

    # ── Patient Interface ─────────────────────────────────────────────

    @staticmethod
    def patient_summary(
        file: str = "test-file.xlsx",
        speaker: str = "Patient_1",
    ) -> PatientSummary:
        # Schema migrated 2026-04-25 (migration 008): the per-class fields
        # (class_1/summary_class_1/...) and the entire_summary column were
        # dropped. PatientSummary now only carries the (file, speaker) PK; the
        # per-domain rows live in PatientSummaryDomain.
        return PatientSummary(file=file, speaker=speaker)

    @staticmethod
    def patient_summary_domain(
        file: str = "test-file.xlsx",
        speaker: str = "Patient_1",
        domain: str = "cancer_prognosis",
        display_order: int = 1,
        patient_scoring: int = 5,
        patient_response: str = "test response",
    ) -> PatientSummaryDomain:
        return PatientSummaryDomain(
            file=file,
            speaker=speaker,
            domain=domain,
            display_order=display_order,
            patient_scoring=patient_scoring,
            patient_response=patient_response,
        )

    # ── Survey ────────────────────────────────────────────────────────

    @staticmethod
    def survey_submission(
        file: str = "test-file.xlsx",
        speaker: str = "Patient_1",
        survey_type: str = "baseline",
        answers: str = '{"q1": "a"}',
    ) -> SurveySubmissionLog:
        return SurveySubmissionLog(
            file=file,
            speaker=speaker,
            survey_type=survey_type,
            answers=answers,
        )

    # ── Transcript Analysis ───────────────────────────────────────────

    @staticmethod
    def transcript_analysis(
        patient_id: str = "sid-01",
        total_sentences: int = 100,
        top_n: int = 5,
        context_window: int = 3,
        model_results: Optional[str] = None,
        xlsx_data: Optional[bytes] = None,
        source_filename: str = "test-transcript.xlsx",
    ) -> TranscriptAnalysisLog:
        if model_results is None:
            model_results = '{"cp": {"count": 5}, "le": {"count": 5}}'
        return TranscriptAnalysisLog(
            patient_id=patient_id,
            total_sentences=total_sentences,
            top_n=top_n,
            context_window=context_window,
            model_results=model_results,
            xlsx_data=xlsx_data or b"fake-xlsx-data",
            source_filename=source_filename,
        )

    @staticmethod
    def sentence_prediction(
        analysis_id: int = 1,
        patient_id: str = "sid-01",
        model: str = "cp",
        sentence_index: int = 1,
        utterance_index: int = 1,
        sentence_in_utterance: int = 1,
        speaker: str = "Interviewer",
        sentence_text: str = "test sentence",
        pred_score: float = 0.95,
        context: str = "before. <main>test sentence</main> after.",
    ) -> SentencePrediction:
        return SentencePrediction(
            analysis_id=analysis_id,
            patient_id=patient_id,
            model=model,
            sentence_index=sentence_index,
            utterance_index=utterance_index,
            sentence_in_utterance=sentence_in_utterance,
            speaker=speaker,
            sentence_text=sentence_text,
            pred_score=pred_score,
            context=context,
        )

    # ── Bulk helpers ──────────────────────────────────────────────────

    @classmethod
    def prediction_set(
        cls,
        analysis_id: int,
        patient_id: str = "sid-01",
        model: str = "cp",
        count: int = 5,
    ) -> list[SentencePrediction]:
        """Create multiple sentence predictions for one model."""
        return [
            cls.sentence_prediction(
                analysis_id=analysis_id,
                patient_id=patient_id,
                model=model,
                sentence_index=idx,
                utterance_index=idx,
                sentence_text=f"prediction sentence {idx}",
                pred_score=round(0.9 - idx * 0.05, 2),
            )
            for idx in range(1, count + 1)
        ]

    # ── Legacy aliases ─────────────────────────────────────────────────
    # The doctor-side endpoint tests still call these names, which were
    # in the factory before two unrelated refactors:
    #   * the SentencePrediction-on-DoctorSentence rename (a single
    #     `sentence_prediction` row IS the doctor-side sentence record)
    #   * migration 008, which folded PatientSummaryScoring and
    #     PatientResponses into PatientSummaryDomain.
    # Each alias just dispatches to the modern factory so the call sites
    # keep working without rewriting every test.

    @staticmethod
    def _translate_doctor_sentence_kwargs(kwargs: dict) -> dict:
        """Translate the legacy doctor_sentence kwargs (file/i/i2/class_/score)
        into the SentencePrediction column names used by the new schema."""
        if "file" in kwargs:
            kwargs["patient_id"] = kwargs.pop("file")
        if "i" in kwargs:
            kwargs["utterance_index"] = kwargs.pop("i")
        if "i2" in kwargs:
            kwargs["sentence_in_utterance"] = kwargs.pop("i2")
        if "class_" in kwargs:
            kwargs["model"] = kwargs.pop("class_")
        if "score" in kwargs:
            kwargs["pred_score"] = kwargs.pop("score")
        return kwargs

    @classmethod
    def doctor_sentence(cls, **kwargs):
        return cls.sentence_prediction(**cls._translate_doctor_sentence_kwargs(kwargs))

    @classmethod
    def doctor_sentence_set(cls, analysis_id: int = 1, speaker: str = "Interviewer", **kwargs):
        # `prediction_set` takes positional analysis_id; the legacy
        # doctor_sentence_set was always called by keyword and didn't
        # carry a speaker (the underlying SentencePrediction table does).
        # Translate, default, and forward.
        kwargs = cls._translate_doctor_sentence_kwargs(kwargs)
        rows = cls.prediction_set(analysis_id=analysis_id, **kwargs)
        for row in rows:
            row.speaker = speaker
        return rows

    @classmethod
    def patient_scoring(
        cls,
        file: str = "test-file.xlsx",
        speaker: str = "Patient_1",
        domain: str = "cancer_prognosis",
        patient_scoring: int = 5,
        **kwargs,
    ) -> PatientSummaryDomain:
        return cls.patient_summary_domain(
            file=file, speaker=speaker, domain=domain,
            patient_scoring=patient_scoring, **kwargs,
        )

    @classmethod
    def patient_responses(
        cls,
        file: str = "test-file.xlsx",
        speaker: str = "Patient_1",
        domain: str = "cancer_prognosis",
        patient_response: str = "test response",
        **kwargs,
    ) -> PatientSummaryDomain:
        return cls.patient_summary_domain(
            file=file, speaker=speaker, domain=domain,
            patient_response=patient_response, **kwargs,
        )
