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

class DoctorRewriteLog(Base):
    """Doctor rewriting history - tracks AI-powered sentence revisions."""
    __tablename__ = 'doctor_rewrite_log'

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
# 6. (removed) UserInteractionLog — replaced by Pattern A behavior tables
# =====================================================
# The legacy single user_interaction_log table has been split into
# patient_first_behavior, patient_followup_survey, and doctor_behavior
# (see section 7b below). The DROP TABLE migration is in Alembic
# revision 003_drop_user_interaction_log.


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
    area = Column(String(20), nullable=False, server_default="unknown")  # patient_first | patient_followup | doctor | unknown

    def __repr__(self):
        return f"<SessionRecording(id={self.id}, session_id={self.session_id}, chunk={self.chunk_index})>"


# =====================================================
# 7b. Behavior Tracking (Pattern A — 3-area split)
# =====================================================

class PatientFirstBehavior(Base):
    """Patient first-visit interaction events (Pattern A)."""
    __tablename__ = 'patient_first_behavior'

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False)
    file = Column(String(255), nullable=False)
    speaker = Column(String(100), nullable=False)
    event_type = Column(String(30), nullable=False)
    domain = Column(String(50))
    rating = Column(Integer)  # SMALLINT in DB; SQLAlchemy Integer is fine for read/write
    event_metadata = Column('metadata', JSONB, nullable=False, server_default='{}')
    device_type = Column(String(20))
    client_timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class PatientFollowupSurvey(Base):
    """Patient follow-up survey behavior events (Pattern A).

    Stores behavior metadata (timing, ordering, step navigation) only.
    Canonical answer payloads live in survey_submission_log.
    """
    __tablename__ = 'patient_followup_survey'

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False)
    file = Column(String(255), nullable=False)
    speaker = Column(String(100), nullable=False)
    event_type = Column(String(30), nullable=False)
    survey_type = Column(String(30))
    question_id = Column(String(50))
    step_number = Column(Integer)  # SMALLINT in DB
    event_metadata = Column('metadata', JSONB, nullable=False, server_default='{}')
    device_type = Column(String(20))
    client_timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class DoctorBehavior(Base):
    """Doctor consultation interaction events (Pattern A)."""
    __tablename__ = 'doctor_behavior'

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False)
    file = Column(String(255))  # nullable: doctor dashboard not tied to a specific patient file
    speaker = Column(String(100), nullable=False)
    event_type = Column(String(30), nullable=False)
    target_type = Column(String(20))  # patient | topic | sentence
    target_id = Column(String(255))
    event_metadata = Column('metadata', JSONB, nullable=False, server_default='{}')
    device_type = Column(String(20))
    client_timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


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


# =====================================================
# 9. NLP Pipeline Intermediates (steps 0-4)
# =====================================================
# Persists every NLP intermediate alongside the existing top-N rows in
# `sentence_prediction`. Step 3 (all sentences x 5 model scores) is
# normalized for SQL queries; the lighter steps go into a JSONB blob.

class NLPAllPredictions(Base):
    """All NLP predictions (step 3) — every sentence x 5 model scores.

    `sentence_prediction` already keeps the per-domain top-N. This table
    keeps the FULL set so analysts can ask cross-domain questions like
    "which sentences scored high on multiple domains?".
    """
    __tablename__ = 'nlp_all_predictions'

    id = Column(Integer, primary_key=True, autoincrement=True)
    analysis_id = Column(Integer, ForeignKey('transcript_analysis_log.id', ondelete='CASCADE'), nullable=False)
    patient_id = Column(String(255), nullable=False)
    sentence_index = Column(Integer, nullable=False)
    utterance_index = Column(Integer, nullable=False)
    sentence_in_utterance = Column(Integer, nullable=False)
    speaker = Column(String(255))
    sentence_text = Column(Text)
    pred_cp = Column(Float)
    pred_le = Column(Float)
    pred_ed = Column(Float)
    pred_inc = Column(Float)
    pred_ius = Column(Float)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class NLPPipelineIntermediate(Base):
    """NLP pipeline intermediate snapshots for steps 0/1/2/4 as JSONB.

    These steps are useful for traceability/debugging but rarely queried
    row-by-row, so they are stored as compact JSON payloads (one row per
    step per analysis = 4 rows total).
    """
    __tablename__ = 'nlp_pipeline_intermediate'

    id = Column(Integer, primary_key=True, autoincrement=True)
    analysis_id = Column(Integer, ForeignKey('transcript_analysis_log.id', ondelete='CASCADE'), nullable=False)
    patient_id = Column(String(255), nullable=False)
    step = Column(String(20), nullable=False)            # raw / filtered / sentences / top_by_model
    payload = Column(JSONB, nullable=False)
    row_count = Column(Integer)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


# =====================================================
# 10. AI Pipeline Intermediates (Guillermo's sub-steps)
# =====================================================

class LLMPipelineIntermediate(Base):
    """AI pipeline intermediate per-candidate-sentence rows.

    Captures Guillermo's `df_extraction` (every candidate after scoring +
    extraction) plus a `survived_filter` flag derived from `df_filtering`.
    Lets analysts answer "what scores did the rejected sentences get?",
    "estimate-missing rate per domain?", etc.
    """
    __tablename__ = 'llm_pipeline_intermediate'

    id = Column(Integer, primary_key=True, autoincrement=True)
    analysis_id = Column(Integer, ForeignKey('transcript_analysis_log.id', ondelete='CASCADE'), nullable=False)
    patient_id = Column(String(255), nullable=False)
    domain = Column(String(10), nullable=False)          # cp, le, ed, inc, ius
    step = Column(String(20), nullable=False)            # 'extraction' (snapshot after scoring + extraction)
    sentence_index = Column(Integer, nullable=False)
    sentence_text = Column(Text)
    context = Column(Text)
    pred_score = Column(Float)                           # NLP .pred_1
    ai_score = Column(Integer)                           # GPT-4o 0-5
    score_explanation = Column(Text)
    estimate = Column(String(255))
    treatment = Column(String(255))
    survived_filter = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
