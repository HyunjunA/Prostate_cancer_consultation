"""SQLAlchemy ORM models for every Backend table.

Tables are grouped by feature area:
  1. Doctor interface       : DoctorRewriteLog
  2. Patient interface      : PatientSummary
  3. Surveys                : SurveySubmissionLog
  4. Transcript analysis    : TranscriptAnalysisLog, SentencePrediction
  5. Behaviour tracking     : SessionRecording, PatientFirstBehavior,
                              PatientFollowupSurvey, DoctorBehavior
  6. AI pipeline outputs    : LLMDomainScoringAndSummary

Auth tables (AuthUser, AuthAPIKey, PatientAccess) are defined in
auth/models.py but reuse the same `Base` declared here so every table
shares one metadata registry — required for create_all() and Alembic.

Schema changes go through Alembic migrations in migrations/versions/;
edits to this file alone do not migrate the live database.

Conventions used throughout:
    - Composite PKs are declared with multiple `primary_key=True` columns
      (DoctorRewriteLog, PatientSummary).
    - `ondelete='CASCADE'` on FKs means "if the parent row goes, this
      row goes too" — used on transcript_analysis_log children so a
      manual analysis cleanup leaves no orphans.
    - JSONB (PostgreSQL-specific) is used for variable-shape payloads
      that we want to query (event_metadata, model_results) rather than
      treat as opaque blobs.
    - LargeBinary stores raw xlsx bytes directly in postgres so the
      backend can serve downloads without depending on a filesystem.
    - server_default=func.now() lets postgres set timestamps even if a
      caller forgets — defence against missing-timestamp bugs.
"""

from sqlalchemy import (
    JSON, Column, ForeignKey, ForeignKeyConstraint, Index, LargeBinary, String, Integer, Float,
    Boolean, Text, TIMESTAMP, CheckConstraint, UniqueConstraint, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, declarative_base

# JSONB type that transparently falls back to plain JSON when running
# under SQLite. Production uses Postgres (full JSONB with binary storage
# and GIN indexes); the unit-test fixtures in tests/conftest.py use an
# in-memory SQLite engine, where JSONB does not exist. SQLite's JSON
# preserves the dict shape the tests need; the binary/index features
# don't matter for tests. This avoids the
#     UnsupportedCompilationError: ... can't render element of type JSONB
# error during Base.metadata.create_all() at test setup.
JSONB_COMPAT = JSONB().with_variant(JSON(), "sqlite")

# Single Base instance shared with auth/models.py so create_all() and
# Alembic see every table from one metadata registry. DO NOT create a
# second Base elsewhere — it would silently make the auth tables
# invisible to migrations.
Base = declarative_base()


# =====================================================
# 1. Doctor Interface Tables
# =====================================================

class DoctorRewriteLog(Base):
    """Doctor rewriting history - tracks AI-powered sentence revisions.

    The composite PK includes `time` so multiple revisions of the same
    sentence on the same day are kept as separate rows (audit trail);
    a unique constraint on (file, i, i2) without `time` would force
    UPSERT and lose the previous revision.
    """
    __tablename__ = 'doctor_rewrite_log'

    file = Column(String(255), primary_key=True, nullable=False)
    i = Column(Integer, primary_key=True, nullable=False)
    i2 = Column(Integer, primary_key=True, nullable=False)
    # `time` in the PK makes every revision a distinct row.
    time = Column(TIMESTAMP(timezone=True), primary_key=True, default=func.now())
    speaker = Column(String(100))
    original_sentence = Column(Text)
    revised_sentence = Column(Text)
    score = Column(Float)
    # `class` is a Python keyword, so the attribute is `class_` and we
    # tell SQLAlchemy the actual column name via Column('class', ...).
    class_ = Column('class', String(100))

    def __repr__(self):
        return f"<DoctorRewriteLog(file={self.file}, i={self.i}, i2={self.i2}, time={self.time})>"


# =====================================================
# 2. Patient Interface Tables
# =====================================================

class PatientSummary(Base):
    """Patient summary — one row per patient.

    Composite PK (file, speaker) pairs each xlsx with the patient
    speaker label inside it. Survives re-processing of the same file
    via UPSERT in persistence.save_all() so survey_submission_log
    referrers stay valid.
    """
    __tablename__ = 'patient_summary'

    file = Column(String(255), primary_key=True, nullable=False)
    speaker = Column(String(100), primary_key=True, nullable=False)

    def __repr__(self):
        return f"<PatientSummary(file={self.file}, speaker={self.speaker})>"






class PatientFirstVisitAnswer(Base):
    """Row-per-question first-visit answers — the question_id-keyed successor
    to the former fixed-4-column responses table.

    One row per (file, speaker, domain, question_id). This long format keeps
    multiple questions of the same type in one domain apart (the old table's
    fixed vas_primary/vas_secondary/timeline/factors columns could not), maps
    cleanly to REDCap's field-based export, and removes the cp-only
    vas_secondary special case (it is just another question_id now).

    `value` is JSONB so one column holds every answer shape: a VAS integer, a
    timeline string, or a factors string-array. `field` records which kind it
    is ("vas" / "timeline" / "factors") for display and light validation.

    Written by PUT /api/patient/first-visit-answers on each per-domain Submit;
    read by GET /api/patient/first-visit-answers/{file}/{speaker} to prefill.
    Backfilled from the former patient_first_visit_responses table by
    migration 014; that table was dropped in migration 020.
    """
    __tablename__ = 'patient_first_visit_answer'
    __table_args__ = (
        ForeignKeyConstraint(
            ['file', 'speaker'],
            ['patient_summary.file', 'patient_summary.speaker'],
            ondelete='CASCADE',
            name='fk_first_visit_answer_to_patient_summary',
        ),
        # One row per question — re-Submits overwrite this row in place.
        UniqueConstraint(
            'file', 'speaker', 'domain', 'question_id',
            name='uq_first_visit_answer',
        ),
        CheckConstraint(
            "domain IN ('cp','le','ed','inc','ius')",
            name='ck_first_visit_answer_domain',
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    file = Column(String(255), nullable=False)
    speaker = Column(String(100), nullable=False)
    domain = Column(String(100), nullable=False)
    # Stable per-question identifier, shared with the behavior log so the two
    # can be joined (e.g. "cp_risk_without_treatment", "ed_timeline").
    question_id = Column(String(100), nullable=False)
    # Answer kind: "vas" | "timeline" | "factors". Drives interpretation of value.
    field = Column(String(20), nullable=False)
    # The answer itself — integer / string / list, stored as JSONB.
    value = Column(JSONB_COMPAT, nullable=False)
    # Reset on every Submit (re-Submit overwrites).
    submitted_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self):
        return (
            f"<PatientFirstVisitAnswer(file={self.file}, "
            f"speaker={self.speaker}, domain={self.domain}, "
            f"question_id={self.question_id})>"
        )


# =====================================================
# 3. Survey Submission Tables
# =====================================================

class SurveySubmissionLog(Base):
    """Survey submission log - stores all survey responses.

    The actual answer payload lives in `answers` (JSONB) — different
    survey types ship different question shapes, so a fixed column
    schema would be too rigid.

    REDCap sync state is tracked inline:
      - redcap_synced=True   means the row was successfully pushed.
      - redcap_record_id     stores the REDCap-side row id for later
                             delete/refresh operations.
      - redcap_error         records the last failure reason (if any)
                             so the admin UI can show "retry sync".
    """
    __tablename__ = 'survey_submission_log'
    __table_args__ = (
        # FK to the patient summary so deleting a patient also deletes
        # their submitted surveys (no orphaned answer rows).
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
    answers = Column(JSONB_COMPAT, nullable=False)
    extra_data = Column(JSONB_COMPAT)
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
      - pipeline_started_at: when the pipeline orchestrator began
        processing this file (the AI repo's main_complete_pipeline_db.py)
      - analyzed_at: when NLP results were saved to DB (Step 8)
      - processed_at: when AI pipeline (GPT-4o) completed (Step 9)
      - processed: True if full pipeline (NLP + AI) completed successfully

    Why xlsx_data is stored in the row (LargeBinary):
        Lets the backend serve "download original transcript" purely
        from postgres, no shared filesystem required. Important for
        horizontally scaled deploys where each replica has its own
        ephemeral disk.
    """
    __tablename__ = 'transcript_analysis_log'

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(255), nullable=False)  # indexed via composite idx_transcript_log_patient_analyzed
    # Parsed from a 3-part de-id filename "<patient>_<doctor>_<MMDDYYYY>"; NULL for
    # 2-part / non-doctor inputs. Doctor-scoped endpoints filter on this column.
    doctor_id = Column(String(255), nullable=True, index=True)
    total_sentences = Column(Integer, nullable=False, default=0)
    top_n = Column(Integer, nullable=False, default=0)
    context_window = Column(Integer, nullable=False, default=3)
    model_results = Column(JSONB_COMPAT)     # per-model scores (auto dict↔JSON)
    xlsx_data = Column(LargeBinary)         # binary xlsx for DB-backed download
    source_filename = Column(String(500))
    pipeline_started_at = Column(TIMESTAMP(timezone=True))  # when processing began
    analyzed_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), index=True)  # when NLP saved to DB
    ai_overall_score = Column(Float)  # GPT-4o average score across all domains (0-5)
    processed = Column(Boolean, default=False)  # True when full pipeline (NLP + AI) completed
    processed_at = Column(TIMESTAMP(timezone=True))  # when AI pipeline completed

    # back_populates pairs with SentencePrediction.analysis below.
    # cascade="all, delete-orphan" so removing the parent log also
    # removes every SentencePrediction row pointing at it.
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
        # Composite index for the most common query path:
        # "all sentences for analysis X under model Y, ordered by score".
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
    """Stores rrweb session recording chunks for replay.

    `recording_data` is gzipped JSON — see routes_track_recordings.py
    for the compress/decompress logic. `area` (patient_first / followup
    / doctor) lets the admin UI filter recordings by which interface
    produced them.
    """
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
# Pattern A: each tracking area (patient_first / patient_followup /
# doctor) has its OWN table with its OWN narrow event_type vocabulary.
# The legacy single-table design produced false-positive "still open"
# bugs where events from one area leaked into another's aggregation.

class PatientFirstBehavior(Base):
    """Patient first-visit interaction events (Pattern A)."""
    __tablename__ = 'patient_first_behavior'

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False)
    file = Column(String(255), nullable=False)
    speaker = Column(String(100), nullable=False)
    event_type = Column(String(30), nullable=False)
    # Session-level entry mode: 'report' (1st visit) or 'survey' (2nd visit).
    # NULL = pre-split legacy rows, recorded before the two modes existed.
    mode = Column(String(10))
    domain = Column(String(50))
    rating = Column(Integer)  # SMALLINT in DB; SQLAlchemy Integer is fine for read/write
    # `metadata` is reserved by SQLAlchemy on the Base class itself,
    # so we name the Python attribute `event_metadata` and tell it the
    # actual column name via Column('metadata', ...).
    event_metadata = Column('metadata', JSONB_COMPAT, nullable=False, server_default='{}')
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
    # domain/rating: only populated when the embedded 1st survey (V41) tracks the
    # combined-flow Risk step here as survey_type='risk_perception' (migration 019).
    domain = Column(String(50))
    rating = Column(Integer)  # SMALLINT in DB
    event_metadata = Column('metadata', JSONB_COMPAT, nullable=False, server_default='{}')
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
    event_metadata = Column('metadata', JSONB_COMPAT, nullable=False, server_default='{}')
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
    treatment = Column(Text)                                 # "surgery", "radiation", "surgery, radiation, ablation therapy", NULL — TEXT for safety vs LLM verbosity
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
    # Five separate score columns (vs. one JSONB column) so SQL can
    # filter / sort / aggregate on a single domain's score directly.
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
    payload = Column(JSONB_COMPAT, nullable=False)
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
    estimate = Column(Text)                                  # LLM extracted estimate — verbose responses possible
    treatment = Column(Text)                                 # LLM extracted treatment — verbose responses possible
    survived_filter = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
