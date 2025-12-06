# models.py - SQLAlchemy model definitions
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from uuid import uuid4, UUID as PythonUUID
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from pydantic import BaseModel, Field, ConfigDict, field_serializer
from typing import Optional, List
from datetime import datetime

Base = declarative_base()

from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from sqlalchemy import UniqueConstraint

class Study(Base):
    __tablename__ = "studies"
    __table_args__ = (UniqueConstraint('covidence_id', name='uq_studies_covidence_id'),)

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid4)

    # ---- String lengths: keep consistent with DDL ----
    covidence_id = Column(String(50))
    pmid = Column(String(50))
    study_id = Column(String(200))
    repository = Column(String(200))

    title = Column(Text)
    publication_year = Column(Integer)

    study_location_1 = Column(String(100))
    study_location_2 = Column(String(100))

    # ---- Integer defaults: keep consistent with DB ----
    number_of_samples_sequenced = Column(Integer, server_default="0", default=0)

    sequence_ids_reported = Column(Boolean, server_default="false", default=False)
    sequence_id_article_location = Column(Text)

    # ---- All boolean flags use unified defaults ----
    age_reported = Column(Boolean, server_default="false", default=False)
    gender_reported = Column(Boolean, server_default="false", default=False)
    race_ethnicity_nationality_reported = Column(Boolean, server_default="false", default=False)
    demographic_article_location = Column(Text)

    comorbidities_reported = Column(Boolean, server_default="false", default=False)
    inpatient_outpatient_reported = Column(Boolean, server_default="false", default=False)
    outcomes_reported = Column(Boolean, server_default="false", default=False)
    severity_reported = Column(Boolean, server_default="false", default=False)
    signs_symptoms_reported = Column(Boolean, server_default="false", default=False)
    treatment_reported = Column(Boolean, server_default="false", default=False)
    vaccination_status_reported = Column(Boolean, server_default="false", default=False)
    clinical_article_location = Column(Text)

    # ---- Timestamps: timezone-aware with server defaults ----
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

# Pydantic models (for API responses) - fix UUID serialization
class StudyResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True
    )
    
    id: str
    covidence_id: Optional[str] = None
    pmid: Optional[str] = None
    study_id: Optional[str] = None
    title: Optional[str] = None
    publication_year: Optional[int] = None
    study_location_1: Optional[str] = None
    study_location_2: Optional[str] = None
    number_of_samples_sequenced: Optional[int] = None
    repository: Optional[str] = None
    sequence_ids_reported: Optional[bool] = None
    sequence_id_article_location: Optional[str] = None
    
    # Demographic data
    age_reported: Optional[bool] = None
    gender_reported: Optional[bool] = None
    race_ethnicity_nationality_reported: Optional[bool] = None
    demographic_article_location: Optional[str] = None
    
    # Clinical data
    comorbidities_reported: Optional[bool] = None
    inpatient_outpatient_reported: Optional[bool] = None
    outcomes_reported: Optional[bool] = None
    severity_reported: Optional[bool] = None
    signs_symptoms_reported: Optional[bool] = None
    treatment_reported: Optional[bool] = None
    vaccination_status_reported: Optional[bool] = None
    clinical_article_location: Optional[str] = None
    
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    
    # Convert UUID to string
    @field_serializer('id')
    def serialize_id(self, value):
        if isinstance(value, PythonUUID):
            return str(value)
        return value
    
    # Convert datetime to ISO string
    @field_serializer('created_at', 'updated_at')
    def serialize_datetime(self, value):
        if isinstance(value, datetime):
            return value.isoformat()
        return value

# Filter request model - add pmid field
class StudyFilter(BaseModel):
    countries: Optional[List[str]] = Field(default=None, description="Selected countries")
    repositories: Optional[List[str]] = Field(default=None, description="Selected repositories")
    # year: Optional[int] = Field(default=None, description="Specific year")
    # year_range: Optional[tuple[int, int]] = Field(default=None, description="Year range")
    year_list: Optional[List[int]] = Field(default=None, description="Non-contiguous list of years")
    
    # PMID filter added (this was missing)
    pmid: Optional[str] = Field(default=None, description="Filter by PMID")
    
    # Boolean filters
    age_reported: Optional[bool] = Field(default=None)
    gender_reported: Optional[bool] = Field(default=None)
    race_ethnicity_nationality_reported: Optional[bool] = Field(default=None)
    comorbidities_reported: Optional[bool] = Field(default=None)
    inpatient_outpatient_reported: Optional[bool] = Field(default=None)
    outcomes_reported: Optional[bool] = Field(default=None)
    severity_reported: Optional[bool] = Field(default=None)
    signs_symptoms_reported: Optional[bool] = Field(default=None)
    treatment_reported: Optional[bool] = Field(default=None)
    vaccination_status_reported: Optional[bool] = Field(default=None)
    sequence_ids_reported: Optional[bool] = Field(default=None)
    
    # Search
    search_title: Optional[str] = Field(default=None, description="Search by title")
    search_pmid: Optional[str] = Field(default=None, description="Search by PMID")

# Pagination response model
class PaginatedStudyResponse(BaseModel):
    data: List[StudyResponse]
    total: int
    page: int
    size: int
    pages: int
    has_next: bool
    has_prev: bool

# Aggregation response model
class StudyAggregation(BaseModel):
    field: str
    values: List[dict]  # [{"value": "Ethiopia", "count": 15}, ...]

class DashboardStats(BaseModel):
    total_studies: int
    unique_countries: int
    unique_repositories: int
    total_samples: int
    studies_with_sequence_ids: int
    earliest_year: Optional[int] = None
    latest_year: Optional[int] = None
    
# CSV upload response model
class CSVUploadResponse(BaseModel):
    success: bool
    message: str
    records_processed: int
    records_created: int
    records_updated: int
