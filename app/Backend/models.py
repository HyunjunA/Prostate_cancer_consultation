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

    def __repr__(self):
        return f"<DoctorRewriteLog(file={self.file}, i={self.i}, i2={self.i2}, time={self.time})>"


# =====================================================
# 2. Patient Interface Tables
# =====================================================

class PatientSummary(Base):
    """Patient summary — one row per patient."""
    __tablename__ = 'patient_summary'

    file = Column(String(255), primary_key=True, nullable=False)
    speaker = Column(String(100), primary_key=True, nullable=False)
    entire_summary = Column(Text)

    domains = relationship("PatientSummaryDomain", back_populates="summary",
                           cascade="all, delete-orphan", order_by="PatientSummaryDomain.display_order")

    def __repr__(self):
        return f"<PatientSummary(file={self.file}, speaker={self.speaker})>"


class PatientSummaryDomain(Base):
    """Per-domain summary, scoring, and response — one row per patient per domain.

    Frontend usage:
      - patient_scoring (0-10) → PATIENT page: star rating entered by the patient
                                  on the follow-up visit ("How well did your doctor
                                  explain this topic?"). Saved via PUT /api/patient/scoring.
                                  Initially NULL — populated when patient submits rating.
      - patient_response       → PATIENT page: free-text response entered by the patient.
                                  Saved via PUT /api/patient/responses.
      - summary_text           → PATIENT page: domain summary text (populated by pipeline).

    NOTE: patient_scoring is NOT the same as llm_domain_scoring_and_summary.ai_score.
      - patient_scoring = patient's subjective rating of doctor communication (PATIENT page)
      - ai_score = GPT-4o's objective scoring of sentence relevance (DOCTOR page)
    """
    __tablename__ = 'patient_summary_domain'
    __table_args__ = (
        ForeignKeyConstraint(
            ['file', 'speaker'],
            ['patient_summary.file', 'patient_summary.speaker'],
            ondelete='CASCADE'
        ),
    )

    file = Column(String(255), primary_key=True, nullable=False)
    speaker = Column(String(100), primary_key=True, nullable=False)
    domain = Column(String(100), primary_key=True, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    summary_text = Column(Text)
    patient_scoring = Column(Integer, CheckConstraint('patient_scoring BETWEEN 0 AND 10'))  # PATIENT enters this
    patient_response = Column(Text)  # PATIENT enters this

    summary = relationship("PatientSummary", back_populates="domains")

    def __repr__(self):
        return f"<PatientSummaryDomain(file={self.file}, domain={self.domain})>"


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
    """Stores each transcript analysis run: metadata, JSON results, and xlsx binary.

    Pipeline timing:
      - pipeline_started_at: when pipeline_runner began processing this file
      - analyzed_at: when NLP results were saved to DB (Step 8)
      - processed_at: when AI pipeline (GPT-4o) completed (Step 9)
      - processed: True if full pipeline (NLP + AI) completed successfully
    """
    __tablename__ = 'transcript_analysis_log'

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(255), nullable=False)  # indexed via composite idx_transcript_log_patient_analyzed
    total_sentences = Column(Integer, nullable=False, default=0)
    top_n = Column(Integer, nullable=False, default=0)
    context_window = Column(Integer, nullable=False, default=3)
    model_results = Column(JSONB)            # per-model scores (auto dict↔JSON)
    xlsx_data = Column(LargeBinary)         # binary xlsx for DB-backed download
    source_filename = Column(String(500))
    pipeline_started_at = Column(TIMESTAMP(timezone=True))  # when processing began
    analyzed_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), index=True)  # when NLP saved to DB
    ai_overall_score = Column(Float)  # GPT-4o average score across all domains (0-5)
    processed = Column(Boolean, default=False)  # True when full pipeline (NLP + AI) completed
    processed_at = Column(TIMESTAMP(timezone=True))  # when AI pipeline completed

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
    role = Column(String(20), nullable=False, server_default="patient")  # low cardinality, no index
    visit_type = Column(String(20))  # "first" | "followup" | null (physician/legacy)
    file = Column(String(255), nullable=False)  # covered by composite idx_uil_file_event_type
    speaker = Column(String(100), nullable=False)  # rarely queried alone
    event_type = Column(String(50), nullable=False, index=True)
    element_id = Column(String(255))
    event_data = Column(JSONB)
    device_type = Column(String(20))
    client_timestamp = Column(TIMESTAMP(timezone=True), index=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<UserInteractionLog(id={self.id}, session_id={self.session_id}, event_type={self.event_type})>"


# =====================================================
# 7. Session Recording (rrweb)
# =====================================================

class SessionRecording(Base):
    """Stores rrweb session recording chunks for replay."""
    __tablename__ = 'session_recording'

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False, default=0)
    file = Column(String(255))
    visit_type = Column(String(20))
    recording_data = Column(LargeBinary)  # gzipped rrweb events JSON
    event_count = Column(Integer, nullable=False, default=0)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<SessionRecording(id={self.id}, session_id={self.session_id}, chunk={self.chunk_index})>"


# =====================================================
# 8. LLM Domain Scoring & Summary (GPT-4o AI Pipeline)
# =====================================================

class LLMDomainScoringAndSummary(Base):
    """GPT-4o AI pipeline results per domain per analysis run.

    Each row = one domain's final result from the AI pipeline
    (Guillermo's ai_pipeline module: scoring → extraction → filtering → selection → reformat).

    Frontend usage:
      - ai_score (0-5)        → DOCTOR page: displayed as consultation quality score
                                 via /api/doctor/scores/average, /scores/summary, /scores/trajectory
      - reformat_sentence     → PATIENT page: displayed as AI-generated risk summary card
                                 via /api/patient/ai-summary/{file}
      - extracted_estimate    → DOCTOR page: raw risk estimate for review
      - score_explanation     → Internal: chain-of-thought reasoning (not displayed)
    """
    __tablename__ = 'llm_domain_scoring_and_summary'

    id = Column(Integer, primary_key=True, autoincrement=True)
    analysis_id = Column(Integer, ForeignKey('transcript_analysis_log.id', ondelete='CASCADE'), nullable=False)
    patient_id = Column(String(255), nullable=False)
    domain = Column(String(10), nullable=False)              # cp, le, ed, inc, ius
    ai_score = Column(Integer)                               # 0-5 GPT-4o score → DOCTOR page (quality metric)
    score_explanation = Column(Text)                         # GPT-4o reasoning for the ai_score (from ai_pipeline/scoring.py)
    extracted_estimate = Column(Text)                        # "24-25%", "13 years", "<missing>"
    treatment = Column(String(50))                           # "surgery", "radiation", NULL
    source_sentence = Column(Text)                           # original single sentence (input to reformat)
    source_context = Column(Text)                            # surrounding context sentences
    reformat_sentence = Column(Text)                         # patient-facing summary → PATIENT page
    source_filename = Column(String(500))
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    analysis = relationship("TranscriptAnalysisLog")

    def __repr__(self):
        return f"<LLMDomainScoringAndSummary(id={self.id}, domain={self.domain}, ai_score={self.ai_score})>"
