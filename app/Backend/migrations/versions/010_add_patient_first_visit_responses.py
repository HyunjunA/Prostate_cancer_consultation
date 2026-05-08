"""add patient_first_visit_responses table for V37 experimental arm

Revision ID: 010_first_visit_responses
Revises: 009_widen_llm_text_columns
Create Date: 2026-05-07

PatientInitialVisitReportV37.tsx (experimental arm) collects 14 cognition
inputs across the five clinical domains (cp/le/ed/inc/ius). Until now those
inputs lived in React.useState only — a page reload erased every answer.

This migration adds a per-(file, speaker, domain) table that the new
PUT /api/patient/first-visit-responses endpoint upserts into when the
patient clicks the per-domain Submit button. See
`dev_docs/V37_First_Visit_Persistence_Design.md` for the full rationale.

Schema shape (one row per domain submission):
  - id              SERIAL PRIMARY KEY
  - file, speaker   identify the patient (FK to patient_summary, CASCADE)
  - domain          discriminator: cp / le / ed / inc / ius
  - vas_primary     0-100; cp = without-treatment, ed/inc/ius single VAS,
                    le NULL (le has no VAS)
  - vas_secondary   0-100; cp only (with-treatment); NULL elsewhere
  - timeline        VARCHAR(50); single-select radio value
  - factors         JSONB; multi-select checkbox values; cp always NULL
  - submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()

Constraints intentionally enforced at the DB level:
  - UNIQUE (file, speaker, domain) collapses re-submits to a single row
  - CHECK on domain enum + VAS ranges as defence in depth alongside Pydantic
  - FK targets patient_summary (not patient_summary_domain) because the
    domain row may not exist yet for new patients

Columns intentionally omitted (see design doc §3.3.1):
  - visit_version : every row would currently be 'v37' — informationless
  - updated_at    : system has no edit-history tracking anywhere; adding
                    only here would be inconsistent
"""
from typing import Sequence, Union

from alembic import op


revision: str = "010_first_visit_responses"
down_revision: Union[str, Sequence[str], None] = "009_widen_llm_text_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE patient_first_visit_responses (
            id              SERIAL       PRIMARY KEY,
            file            VARCHAR(255) NOT NULL,
            speaker         VARCHAR(100) NOT NULL,
            domain          VARCHAR(100) NOT NULL,

            vas_primary     INTEGER,
            vas_secondary   INTEGER,
            timeline        VARCHAR(50),
            factors         JSONB,

            submitted_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

            CONSTRAINT uq_first_visit
                UNIQUE (file, speaker, domain),
            CONSTRAINT ck_first_visit_domain
                CHECK (domain IN ('cp','le','ed','inc','ius')),
            CONSTRAINT ck_first_visit_vas_primary
                CHECK (vas_primary IS NULL OR vas_primary BETWEEN 0 AND 100),
            CONSTRAINT ck_first_visit_vas_secondary
                CHECK (vas_secondary IS NULL OR vas_secondary BETWEEN 0 AND 100),
            CONSTRAINT fk_first_visit_to_patient_summary
                FOREIGN KEY (file, speaker)
                REFERENCES patient_summary(file, speaker)
                ON DELETE CASCADE
        )
    """)
    op.execute(
        "CREATE INDEX idx_pfvr_file_speaker "
        "ON patient_first_visit_responses(file, speaker)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_pfvr_file_speaker")
    op.execute("DROP TABLE IF EXISTS patient_first_visit_responses")
