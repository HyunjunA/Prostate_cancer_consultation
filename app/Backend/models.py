"""models.py - SQLAlchemy ORM model definitions for the Backend."""

from sqlalchemy import (
    Column, ForeignKey, ForeignKeyConstraint, Index, LargeBinary, String, Integer, Float,
    Boolean, Text, TIMESTAMP, CheckConstraint, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


# =====================================================
# 1. Doctor Interface Tables
# =====================================================

class DoctorSentenceView(Base):
    """Doctor interface render table - displays sentences with scores."""
    __tablename__ = 'doctor_sentence_view'

    file = Column(String(255), primary_key=True, nullable=False)
    i = Column(Integer, primary_key=True, nullable=False)
    i2 = Column(Integer, primary_key=True, nullable=False)
    speaker = Column(String(100))
    sentence = Column(Text)
    score = Column(Float)
    class_ = Column('class', String(100))
    time = Column(TIMESTAMP(timezone=True))

    def __repr__(self):
        return f"<DoctorSentenceView(file={self.file}, i={self.i}, i2={self.i2})>"


class DoctorRewriteLog(Base):
    """Doctor rewriting history - tracks AI-powered sentence revisions."""
    __tablename__ = 'doctor_rewrite_log'
    __table_args__ = (
        ForeignKeyConstraint(
            ['file', 'i', 'i2'],
            ['doctor_sentence_view.file', 'doctor_sentence_view.i', 'doctor_sentence_view.i2'],
            ondelete='CASCADE'
        ),
    )

    file = Column(String(255), primary_key=True, nullable=False)
    i = Column(Integer, primary_key=True, nullable=False)
    i2 = Column(Integer, primary_key=True, nullable=False)
    time = Column(TIMESTAMP(timezone=True), primary_key=True, default=func.now())
    speaker = Column(String(100))
    original_sentence = Column(Text)
    revised_sentence = Column(Text)
    score = Column(Float)
    class_ = Column('class', String(100))
    selected = Column(Boolean, default=False)

    def __repr__(self):
        return f"<DoctorRewriteLog(file={self.file}, i={self.i}, i2={self.i2}, time={self.time})>"


# =====================================================
# 2. Patient Interface Tables
# =====================================================

class PatientSummary(Base):
    """Patient class summary - categorized summaries for patients."""
    __tablename__ = 'patient_summary'

    file = Column(String(255), primary_key=True, nullable=False)
    speaker = Column(String(100), primary_key=True)
    entire_summary = Column(Text)

    class_1 = Column(String(100))
    summary_class_1 = Column(Text)
    class_2 = Column(String(100))
    summary_class_2 = Column(Text)
    class_3 = Column(String(100))
    summary_class_3 = Column(Text)
    class_4 = Column(String(100))
    summary_class_4 = Column(Text)
    class_5 = Column(String(100))
    summary_class_5 = Column(Text)

    def __repr__(self):
        return f"<PatientSummary(file={self.file}, speaker={self.speaker})>"


class PatientSummaryScoring(Base):
    """Patient scoring for each class summary (0-10 scale)."""
    __tablename__ = 'patient_summary_scoring'
    __table_args__ = (
        ForeignKeyConstraint(
            ['file', 'speaker'],
            ['patient_summary.file', 'patient_summary.speaker'],
            ondelete='CASCADE'
        ),
    )

    file = Column(String(255), primary_key=True, nullable=False)
    speaker = Column(String(100), primary_key=True)

    class_1_patient_scoring = Column(Integer, CheckConstraint('class_1_patient_scoring BETWEEN 0 AND 10'))
    class_2_patient_scoring = Column(Integer, CheckConstraint('class_2_patient_scoring BETWEEN 0 AND 10'))
    class_3_patient_scoring = Column(Integer, CheckConstraint('class_3_patient_scoring BETWEEN 0 AND 10'))
    class_4_patient_scoring = Column(Integer, CheckConstraint('class_4_patient_scoring BETWEEN 0 AND 10'))
    class_5_patient_scoring = Column(Integer, CheckConstraint('class_5_patient_scoring BETWEEN 0 AND 10'))

    def __repr__(self):
        return f"<PatientSummaryScoring(file={self.file}, speaker={self.speaker})>"


class PatientResponses(Base):
    """Patient responses to questions."""
    __tablename__ = 'patient_responses'
    __table_args__ = (
        ForeignKeyConstraint(
            ['file', 'speaker'],
            ['patient_summary.file', 'patient_summary.speaker'],
            ondelete='CASCADE'
        ),
    )

    file = Column(String(255), primary_key=True, nullable=False)
    speaker = Column(String(100), primary_key=True)

    answer_1 = Column(Text)
    answer_2 = Column(Text)
    answer_3 = Column(Text)
    answer_4 = Column(Text)
    answer_5 = Column(Text)

    def __repr__(self):
        return f"<PatientResponses(file={self.file}, speaker={self.speaker})>"


# =====================================================
# 3. Survey Submission Tables
# =====================================================

class SurveySubmissionLog(Base):
    """Survey submission log - stores all survey responses."""
    __tablename__ = 'survey_submission_log'
    __table_args__ = (
        ForeignKeyConstraint(
            ['file', 'speaker'],
            ['patient_summary.file', 'patient_summary.speaker'],
            ondelete='CASCADE'
        ),
        # Note: composite indexes (speaker, submitted_at DESC) and (file, submitted_at DESC)
        # are defined in database_schema.sql DDL. DESC ordering requires DDL-level definition.
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    file = Column(String(255), nullable=False, index=True)
    speaker = Column(String(100), nullable=False, index=True)
    survey_type = Column(String(50), nullable=False, index=True)
    answers = Column(JSONB, nullable=False)
    extra_data = Column(JSONB)
    submitted_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    redcap_synced = Column(Boolean, default=False)
    redcap_record_id = Column(String(255))
    redcap_error = Column(Text)

    def __repr__(self):
        return f"<SurveySubmissionLog(id={self.id}, survey_type={self.survey_type})>"


# =====================================================
# 4. Transcript Analysis Log (ML Pipeline Results)
# =====================================================

class TranscriptAnalysisLog(Base):
    """Stores each transcript analysis run: metadata, JSON results, and xlsx binary."""
    __tablename__ = 'transcript_analysis_log'

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(255), nullable=False)  # indexed via composite idx_transcript_log_patient_analyzed
    total_sentences = Column(Integer, nullable=False, default=0)
    top_n = Column(Integer, nullable=False, default=0)
    context_window = Column(Integer, nullable=False, default=3)
    model_results = Column(JSONB)            # per-model scores (auto dict↔JSON)
    xlsx_data = Column(LargeBinary)         # binary xlsx for DB-backed download
    source_filename = Column(String(500))
    analyzed_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), index=True)

    predictions = relationship("SentencePrediction", back_populates="analysis", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<TranscriptAnalysisLog(id={self.id}, patient_id={self.patient_id})>"


# =====================================================
# 5. Sentence-Level Predictions (per-row NLP scores)
# =====================================================

class SentencePrediction(Base):
    """Individual sentence-level NLP prediction, linked to an analysis run."""
    __tablename__ = 'sentence_prediction'
    __table_args__ = (
        Index('idx_sp_analysis_model', 'analysis_id', 'model'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    analysis_id = Column(Integer, ForeignKey('transcript_analysis_log.id', ondelete='CASCADE'), nullable=False)  # indexed via composite idx_sp_analysis_model
    patient_id = Column(String(255), nullable=False)
    model = Column(String(10), nullable=False)
    sentence_index = Column(Integer, nullable=False)
    utterance_index = Column(Integer, nullable=False)
    sentence_in_utterance = Column(Integer, nullable=False)
    speaker = Column(String(100))
    sentence_text = Column(Text)
    pred_score = Column(Float, nullable=False)
    context = Column(Text)

    analysis = relationship("TranscriptAnalysisLog", back_populates="predictions")

    def __repr__(self):
        return f"<SentencePrediction(id={self.id}, model={self.model}, pred_score={self.pred_score})>"


# =====================================================
# 6. User Interaction Tracking
# =====================================================

class UserInteractionLog(Base):
    """Tracks user interaction events from patient/physician UI."""
    __tablename__ = 'user_interaction_log'
    __table_args__ = (
        Index('idx_uil_file_event_type', 'file', 'event_type'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False, index=True)
    role = Column(String(20), nullable=False, server_default="patient", index=True)
    file = Column(String(255), nullable=False, index=True)
    speaker = Column(String(100), nullable=False, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    element_id = Column(String(255))
    event_data = Column(JSONB)
    device_type = Column(String(20))
    client_timestamp = Column(TIMESTAMP(timezone=True), index=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<UserInteractionLog(id={self.id}, session_id={self.session_id}, event_type={self.event_type})>"
