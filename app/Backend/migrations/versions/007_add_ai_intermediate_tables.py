"""add AI pipeline intermediate table

Revision ID: 007_ai_intermediates
Revises: 006_nlp_intermediates
Create Date: 2026-04-25

Adds `llm_pipeline_intermediate` to persist the AI sub-pipeline steps that
are currently discarded (scoring, extraction, filtering). Each row is one
candidate sentence in one domain at a specific step:

  - step='extraction' : 10 rows per domain (every candidate sentence after
                        scoring + extraction; survived_filter flags those
                        that pass filtering)

We collapse scoring + extraction into one snapshot (`step='extraction'`)
because the AI pipeline author's `pipeline.py` adds those columns to the same DataFrame
and only snapshots once via `df_extraction = df.copy()` after extraction.
The `survived_filter` boolean derives from `df_filtering` which is the
filtered subset.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "007_ai_intermediates"
down_revision: Union[str, Sequence[str], None] = "006_nlp_intermediates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE llm_pipeline_intermediate (
            id                SERIAL PRIMARY KEY,
            analysis_id       INT NOT NULL REFERENCES transcript_analysis_log(id) ON DELETE CASCADE,
            patient_id        VARCHAR(255) NOT NULL,
            domain            VARCHAR(10) NOT NULL,
            step              VARCHAR(20) NOT NULL,
            sentence_index    INT NOT NULL,
            sentence_text     TEXT,
            context           TEXT,
            pred_score        FLOAT,                -- NLP .pred_1
            ai_score          SMALLINT,             -- GPT-4o 0-5 (scoring sub-step)
            score_explanation TEXT,
            estimate          VARCHAR(255),         -- extraction sub-step
            treatment         VARCHAR(255),
            survived_filter   BOOLEAN NOT NULL DEFAULT FALSE,
            created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT ck_lpi_domain CHECK (domain IN ('cp','le','ed','inc','ius')),
            CONSTRAINT ck_lpi_step CHECK (step IN ('extraction'))
        )
    """)
    op.execute("CREATE INDEX idx_lpi_analysis ON llm_pipeline_intermediate(analysis_id)")
    op.execute("CREATE INDEX idx_lpi_patient_domain ON llm_pipeline_intermediate(patient_id, domain)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS llm_pipeline_intermediate")
