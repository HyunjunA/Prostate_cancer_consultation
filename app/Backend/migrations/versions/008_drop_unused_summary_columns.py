"""drop unused patient_summary.entire_summary and patient_summary_domain.summary_text

Revision ID: 008_drop_summary_cols
Revises: 007_ai_intermediates
Create Date: 2026-04-25

The active patient UI (PatientInitialVisitReportV35,
PatientFollowUpReportV31Re) reads its per-domain "AI-generated"
summary text from `llm_domain_scoring_and_summary.reformat_sentence`
via `GET /api/patient/ai-summary/{file}`. The legacy fields
`patient_summary.entire_summary` and
`patient_summary_domain.summary_text` were never wired up to any
producer (they were left as empty placeholders by `persistence.py`
with the comment "populated by AI pipeline (reformat_sentence)" —
that wiring never happened).

We drop just the two unused columns. The rest of the parent /
child rows (file, speaker, domain, display_order, patient_scoring,
patient_response) and the FK from `survey_submission_log` remain
untouched — the patient-scoring + survey workflows depend on them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "008_drop_summary_cols"
down_revision: Union[str, Sequence[str], None] = "007_ai_intermediates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("patient_summary", "entire_summary")
    op.drop_column("patient_summary_domain", "summary_text")


def downgrade() -> None:
    op.add_column(
        "patient_summary",
        sa.Column("entire_summary", sa.Text(), nullable=True),
    )
    op.add_column(
        "patient_summary_domain",
        sa.Column("summary_text", sa.Text(), nullable=True),
    )
