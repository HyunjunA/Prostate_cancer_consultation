# # models.py - SQLAlchemy model definitions
# from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, UUID
# from sqlalchemy.ext.declarative import declarative_base
# from sqlalchemy.sql import func
# from uuid import uuid4, UUID as PythonUUID
# from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
# from pydantic import BaseModel, Field, ConfigDict, field_serializer
# from typing import Optional, List
# from datetime import datetime

# Base = declarative_base()

# from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
# from sqlalchemy.sql import func
# from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
# from sqlalchemy import UniqueConstraint

# class Study(Base):
#     __tablename__ = "studies"
#     __table_args__ = (UniqueConstraint('covidence_id', name='uq_studies_covidence_id'),)

#     id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid4)

#     # ---- String lengths: keep consistent with DDL ----
#     covidence_id = Column(String(50))
#     pmid = Column(String(50))
#     study_id = Column(String(200))
#     repository = Column(String(200))

#     title = Column(Text)
#     publication_year = Column(Integer)

#     study_location_1 = Column(String(100))
#     study_location_2 = Column(String(100))

#     # ---- Integer defaults: keep consistent with DB ----
#     number_of_samples_sequenced = Column(Integer, server_default="0", default=0)

#     sequence_ids_reported = Column(Boolean, server_default="false", default=False)
#     sequence_id_article_location = Column(Text)

#     # ---- All boolean flags use unified defaults ----
#     age_reported = Column(Boolean, server_default="false", default=False)
#     gender_reported = Column(Boolean, server_default="false", default=False)
#     race_ethnicity_nationality_reported = Column(Boolean, server_default="false", default=False)
#     demographic_article_location = Column(Text)

#     comorbidities_reported = Column(Boolean, server_default="false", default=False)
#     inpatient_outpatient_reported = Column(Boolean, server_default="false", default=False)
#     outcomes_reported = Column(Boolean, server_default="false", default=False)
#     severity_reported = Column(Boolean, server_default="false", default=False)
#     signs_symptoms_reported = Column(Boolean, server_default="false", default=False)
#     treatment_reported = Column(Boolean, server_default="false", default=False)
#     vaccination_status_reported = Column(Boolean, server_default="false", default=False)
#     clinical_article_location = Column(Text)

#     # ---- Timestamps: timezone-aware with server defaults ----
#     created_at = Column(DateTime(timezone=True), server_default=func.now())
#     updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

# # Pydantic models (for API responses) - fix UUID serialization
# class StudyResponse(BaseModel):
#     model_config = ConfigDict(
#         from_attributes=True,
#         str_strip_whitespace=True
#     )
    
#     id: str
#     covidence_id: Optional[str] = None
#     pmid: Optional[str] = None
#     study_id: Optional[str] = None
#     title: Optional[str] = None
#     publication_year: Optional[int] = None
#     study_location_1: Optional[str] = None
#     study_location_2: Optional[str] = None
#     number_of_samples_sequenced: Optional[int] = None
#     repository: Optional[str] = None
#     sequence_ids_reported: Optional[bool] = None
#     sequence_id_article_location: Optional[str] = None
    
#     # Demographic data
#     age_reported: Optional[bool] = None
#     gender_reported: Optional[bool] = None
#     race_ethnicity_nationality_reported: Optional[bool] = None
#     demographic_article_location: Optional[str] = None
    
#     # Clinical data
#     comorbidities_reported: Optional[bool] = None
#     inpatient_outpatient_reported: Optional[bool] = None
#     outcomes_reported: Optional[bool] = None
#     severity_reported: Optional[bool] = None
#     signs_symptoms_reported: Optional[bool] = None
#     treatment_reported: Optional[bool] = None
#     vaccination_status_reported: Optional[bool] = None
#     clinical_article_location: Optional[str] = None
    
#     created_at: Optional[str] = None
#     updated_at: Optional[str] = None
    
#     # Convert UUID to string
#     @field_serializer('id')
#     def serialize_id(self, value):
#         if isinstance(value, PythonUUID):
#             return str(value)
#         return value
    
#     # Convert datetime to ISO string
#     @field_serializer('created_at', 'updated_at')
#     def serialize_datetime(self, value):
#         if isinstance(value, datetime):
#             return value.isoformat()
#         return value

# # Filter request model - add pmid field
# class StudyFilter(BaseModel):
#     countries: Optional[List[str]] = Field(default=None, description="Selected countries")
#     repositories: Optional[List[str]] = Field(default=None, description="Selected repositories")
#     # year: Optional[int] = Field(default=None, description="Specific year")
#     # year_range: Optional[tuple[int, int]] = Field(default=None, description="Year range")
#     year_list: Optional[List[int]] = Field(default=None, description="Non-contiguous list of years")
    
#     # PMID filter added (this was missing)
#     pmid: Optional[str] = Field(default=None, description="Filter by PMID")
    
#     # Boolean filters
#     age_reported: Optional[bool] = Field(default=None)
#     gender_reported: Optional[bool] = Field(default=None)
#     race_ethnicity_nationality_reported: Optional[bool] = Field(default=None)
#     comorbidities_reported: Optional[bool] = Field(default=None)
#     inpatient_outpatient_reported: Optional[bool] = Field(default=None)
#     outcomes_reported: Optional[bool] = Field(default=None)
#     severity_reported: Optional[bool] = Field(default=None)
#     signs_symptoms_reported: Optional[bool] = Field(default=None)
#     treatment_reported: Optional[bool] = Field(default=None)
#     vaccination_status_reported: Optional[bool] = Field(default=None)
#     sequence_ids_reported: Optional[bool] = Field(default=None)
    
#     # Search
#     search_title: Optional[str] = Field(default=None, description="Search by title")
#     search_pmid: Optional[str] = Field(default=None, description="Search by PMID")

# # Pagination response model
# class PaginatedStudyResponse(BaseModel):
#     data: List[StudyResponse]
#     total: int
#     page: int
#     size: int
#     pages: int
#     has_next: bool
#     has_prev: bool

# # Aggregation response model
# class StudyAggregation(BaseModel):
#     field: str
#     values: List[dict]  # [{"value": "Ethiopia", "count": 15}, ...]

# class DashboardStats(BaseModel):
#     total_studies: int
#     unique_countries: int
#     unique_repositories: int
#     total_samples: int
#     studies_with_sequence_ids: int
#     earliest_year: Optional[int] = None
#     latest_year: Optional[int] = None
    
# # CSV upload response model
# class CSVUploadResponse(BaseModel):
#     success: bool
#     message: str
#     records_processed: int
#     records_created: int
#     records_updated: int


"""
SQLAlchemy Models for Doctor and Patient Interface Database
"""
from datetime import datetime
from sqlalchemy import (
    Column, ForeignKey, ForeignKeyConstraint, LargeBinary, String, Integer, Float,
    Boolean, Text, TIMESTAMP, CheckConstraint, func
)
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

# =====================================================
# 1. Doctor Interface Tables
# =====================================================

class DoctorSentenceView(Base):
    """Doctor interface render table - displays sentences with scores"""
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
    """Doctor rewriting history - tracks AI-powered sentence revisions"""
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
    original_score = Column(Float)
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
    """Patient class summary - categorized summaries for patients"""
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
    """Patient scoring for each class summary (0-10 scale)"""
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
    """Patient responses to questions"""
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
    """Survey submission log - stores all survey responses"""
    __tablename__ = 'survey_submission_log'
    __table_args__ = (
        ForeignKeyConstraint(
            ['file', 'speaker'],
            ['patient_summary.file', 'patient_summary.speaker'],
            ondelete='CASCADE'
        ),
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    file = Column(String(255), nullable=False, index=True)
    speaker = Column(String(100), nullable=False, index=True)
    survey_type = Column(String(50), nullable=False, index=True)
    answers = Column(Text, nullable=False)
    extra_data = Column(Text)
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
    patient_id = Column(String(255), nullable=False, index=True)
    total_sentences = Column(Integer, nullable=False, default=0)
    top_n = Column(Integer, nullable=False, default=0)
    context_window = Column(Integer, nullable=False, default=3)
    model_results = Column(Text)            # JSON string of per-model scores
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
    """Individual sentence-level NLP prediction, linked to an analysis run.

    Each row corresponds to one row in one sheet of the output xlsx file.
    The 5 xlsx sheets (cp, inc, ed, ius, le) are distinguished by the `model` column.

    Column mapping (xlsx → DB):
        xlsx column    DB column               Description
        -----------    ---------               -----------
        (sheet name)   model                   NLP model: cp, inc, ed, ius, le
        name           patient_id              Patient identifier (e.g. "sid-01")
        index          sentence_index          Global sentence sequence number (1-based)
        i              utterance_index         Original utterance number from transcript
        i2             sentence_in_utterance   Sentence position within the utterance (1-based)
        speaker        speaker                 Speaker label (e.g. "Interviewer")
        text           sentence_text           The sentence text (lowercased)
        .pred_1        pred_score              NLP prediction probability (0.0–1.0)
        context        context                 Surrounding sentences with <main>target</main> tags

    DB-only columns (not in xlsx):
        id             Auto-increment primary key
        analysis_id    FK → transcript_analysis_log.id (which analysis run produced this row)
    """
    __tablename__ = 'sentence_prediction'

    id = Column(Integer, primary_key=True, autoincrement=True)
    analysis_id = Column(Integer, ForeignKey('transcript_analysis_log.id', ondelete='CASCADE'), nullable=False, index=True)
    patient_id = Column(String(255), nullable=False)          # xlsx 'name'
    model = Column(String(10), nullable=False)                # xlsx sheet name (cp/inc/ed/ius/le)
    sentence_index = Column(Integer, nullable=False)          # xlsx 'index'
    utterance_index = Column(Integer, nullable=False)         # xlsx 'i'
    sentence_in_utterance = Column(Integer, nullable=False)   # xlsx 'i2'
    speaker = Column(String(100))                             # xlsx 'speaker'
    sentence_text = Column(Text)                              # xlsx 'text'
    pred_score = Column(Float, nullable=False)                # xlsx '.pred_1'
    context = Column(Text)                                    # xlsx 'context'

    analysis = relationship("TranscriptAnalysisLog", back_populates="predictions")

    def __repr__(self):
        return f"<SentencePrediction(id={self.id}, model={self.model}, pred_score={self.pred_score})>"