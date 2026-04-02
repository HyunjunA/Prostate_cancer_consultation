"""
Test data factories — generate mock data for tests.

Provides helper functions and a TestDataFactory class that creates
SQLAlchemy model instances ready for insertion into the test DB.
"""

from datetime import datetime, timezone
from typing import Optional

from models import (
    DoctorSentenceView,
    DoctorRewriteLog,
    PatientSummary,
    PatientSummaryScoring,
    PatientResponses,
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
    def doctor_sentence(
        file: str = "test-file.xlsx",
        i: int = 1,
        i2: int = 1,
        speaker: str = "Interviewer",
        sentence: str = "This is a test sentence.",
        score: float = 0.85,
        class_: str = "Cancer Prognosis",
    ) -> DoctorSentenceView:
        return DoctorSentenceView(
            file=file,
            i=i,
            i2=i2,
            speaker=speaker,
            sentence=sentence,
            score=score,
            class_=class_,
            time=datetime.now(timezone.utc),
        )

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
        selected: bool = False,
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
            selected=selected,
            time=datetime.now(timezone.utc),
        )

    # ── Patient Interface ─────────────────────────────────────────────

    @staticmethod
    def patient_summary(
        file: str = "test-file.xlsx",
        speaker: str = "Patient_1",
        entire_summary: str = "Overall summary text.",
    ) -> PatientSummary:
        return PatientSummary(
            file=file,
            speaker=speaker,
            entire_summary=entire_summary,
            class_1="Cancer Prognosis",
            summary_class_1="CP summary text.",
            class_2="Life Expectancy",
            summary_class_2="LE summary text.",
            class_3="Erectile Dysfunction",
            summary_class_3="ED summary text.",
            class_4="Incontinence",
            summary_class_4="INC summary text.",
            class_5="Irritative Urinary Symptoms",
            summary_class_5="IUS summary text.",
        )

    @staticmethod
    def patient_scoring(
        file: str = "test-file.xlsx",
        speaker: str = "Patient_1",
    ) -> PatientSummaryScoring:
        return PatientSummaryScoring(
            file=file,
            speaker=speaker,
            class_1_patient_scoring=5,
            class_2_patient_scoring=6,
            class_3_patient_scoring=7,
            class_4_patient_scoring=8,
            class_5_patient_scoring=9,
        )

    @staticmethod
    def patient_responses(
        file: str = "test-file.xlsx",
        speaker: str = "Patient_1",
    ) -> PatientResponses:
        return PatientResponses(
            file=file,
            speaker=speaker,
            answer_1="Answer to question 1",
            answer_2="Answer to question 2",
            answer_3="Answer to question 3",
            answer_4="Answer to question 4",
            answer_5="Answer to question 5",
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
    def doctor_sentence_set(
        cls,
        file: str = "test-file.xlsx",
        count: int = 5,
        speaker: str = "Interviewer",
        class_: str = "Cancer Prognosis",
    ) -> list[DoctorSentenceView]:
        """Create multiple distinct doctor sentences."""
        return [
            cls.doctor_sentence(
                file=file,
                i=idx,
                i2=1,
                speaker=speaker,
                sentence=f"Sentence number {idx}.",
                score=round(0.5 + idx * 0.05, 2),
                class_=class_,
            )
            for idx in range(1, count + 1)
        ]

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
