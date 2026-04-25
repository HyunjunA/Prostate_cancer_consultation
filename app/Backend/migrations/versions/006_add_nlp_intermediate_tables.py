"""add NLP intermediate tables (steps 0-4)

Revision ID: 006_nlp_intermediates
Revises: 005_swap_tour_events
Create Date: 2026-04-25

Adds two tables to persist all NLP pipeline intermediate data alongside
the existing top-N rows in `sentence_prediction`:

  - nlp_all_predictions       — step 3 fully normalized (all sentences x 5 NLP scores)
                                Most analytically valuable; supports SQL queries on
                                per-sentence scores across all domains.
  - nlp_pipeline_intermediate — steps 0/1/2/4 as JSONB payloads.
                                Steps that are useful for traceability but rarely
                                queried row-by-row — stored as compact blobs.

The existing on-disk traceability (`pipeline_runner._save_output_files` writes
step0_raw.csv .. step5_top10_context.xlsx) is kept untouched; this migration
only adds DB persistence.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006_nlp_intermediates"
down_revision: Union[str, Sequence[str], None] = "005_swap_tour_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── nlp_all_predictions: all sentences x 5 NLP model scores ────────────
    op.execute("""
        CREATE TABLE nlp_all_predictions (
            id                    SERIAL PRIMARY KEY,
            analysis_id           INT NOT NULL REFERENCES transcript_analysis_log(id) ON DELETE CASCADE,
            patient_id            VARCHAR(255) NOT NULL,
            sentence_index        INT NOT NULL,
            utterance_index       INT NOT NULL,
            sentence_in_utterance INT NOT NULL,
            speaker               VARCHAR(255),
            sentence_text         TEXT,
            pred_cp               FLOAT,
            pred_le               FLOAT,
            pred_ed               FLOAT,
            pred_inc              FLOAT,
            pred_ius              FLOAT,
            created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX idx_nap_analysis ON nlp_all_predictions(analysis_id)")
    op.execute("CREATE INDEX idx_nap_patient ON nlp_all_predictions(patient_id)")

    # ── nlp_pipeline_intermediate: steps 0/1/2/4 as JSONB ──────────────────
    op.execute("""
        CREATE TABLE nlp_pipeline_intermediate (
            id            SERIAL PRIMARY KEY,
            analysis_id   INT NOT NULL REFERENCES transcript_analysis_log(id) ON DELETE CASCADE,
            patient_id    VARCHAR(255) NOT NULL,
            step          VARCHAR(20) NOT NULL,
            payload       JSONB NOT NULL,
            row_count     INT,
            created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT ck_npi_step CHECK (step IN ('raw', 'filtered', 'sentences', 'top_by_model'))
        )
    """)
    op.execute("CREATE INDEX idx_npi_analysis_step ON nlp_pipeline_intermediate(analysis_id, step)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS nlp_pipeline_intermediate")
    op.execute("DROP TABLE IF EXISTS nlp_all_predictions")
