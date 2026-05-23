"""row-per-question first-visit answers table + backfill

Revision ID: 014_first_visit_answers
Revises: 013_add_answer_changed_event
Create Date: 2026-05-22

Creates patient_first_visit_answer (one row per file/speaker/domain/question_id)
and backfills it from the legacy fixed-column patient_first_visit_responses.
The legacy table is left in place (frozen) as a backup and to keep the dead
V37 page working; the active V38 page uses the new table.

Backfill maps the four legacy columns onto canonical question_ids that match
the behavior-log ids:
    vas_primary  -> cp_risk_without_treatment / ed_baseline_return /
                    inc_risk / ius_risk        (field "vas")
    vas_secondary-> cp_risk_with_treatment     (cp only, field "vas")
    timeline     -> {domain}_timeline          (field "timeline")
    factors      -> {domain}_factors           (field "factors")
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "014_first_visit_answers"
down_revision: Union[str, Sequence[str], None] = "013_add_answer_changed_event"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "patient_first_visit_answer",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("file", sa.String(length=255), nullable=False),
        sa.Column("speaker", sa.String(length=100), nullable=False),
        sa.Column("domain", sa.String(length=100), nullable=False),
        sa.Column("question_id", sa.String(length=100), nullable=False),
        sa.Column("field", sa.String(length=20), nullable=False),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column(
            "submitted_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["file", "speaker"],
            ["patient_summary.file", "patient_summary.speaker"],
            ondelete="CASCADE",
            name="fk_first_visit_answer_to_patient_summary",
        ),
        sa.UniqueConstraint(
            "file", "speaker", "domain", "question_id",
            name="uq_first_visit_answer",
        ),
        sa.CheckConstraint(
            "domain IN ('cp','le','ed','inc','ius')",
            name="ck_first_visit_answer_domain",
        ),
    )
    op.create_index(
        "ix_first_visit_answer_file_speaker",
        "patient_first_visit_answer",
        ["file", "speaker"],
    )

    # ── Backfill from the legacy fixed-column table ──────────────────────────
    # vas_primary -> per-domain slider question_id
    op.execute("""
        INSERT INTO patient_first_visit_answer
            (file, speaker, domain, question_id, field, value, submitted_at)
        SELECT file, speaker, domain,
            CASE domain
                WHEN 'cp'  THEN 'cp_risk_without_treatment'
                WHEN 'ed'  THEN 'ed_baseline_return'
                WHEN 'inc' THEN 'inc_risk'
                WHEN 'ius' THEN 'ius_risk'
            END,
            'vas', to_jsonb(vas_primary), submitted_at
        FROM patient_first_visit_responses
        WHERE vas_primary IS NOT NULL AND domain IN ('cp','ed','inc','ius')
    """)
    # vas_secondary -> cp's second slider only
    op.execute("""
        INSERT INTO patient_first_visit_answer
            (file, speaker, domain, question_id, field, value, submitted_at)
        SELECT file, speaker, domain,
            'cp_risk_with_treatment', 'vas', to_jsonb(vas_secondary), submitted_at
        FROM patient_first_visit_responses
        WHERE vas_secondary IS NOT NULL AND domain = 'cp'
    """)
    # timeline -> {domain}_timeline
    op.execute("""
        INSERT INTO patient_first_visit_answer
            (file, speaker, domain, question_id, field, value, submitted_at)
        SELECT file, speaker, domain,
            domain || '_timeline', 'timeline', to_jsonb(timeline), submitted_at
        FROM patient_first_visit_responses
        WHERE timeline IS NOT NULL
    """)
    # factors (already JSONB) -> {domain}_factors
    op.execute("""
        INSERT INTO patient_first_visit_answer
            (file, speaker, domain, question_id, field, value, submitted_at)
        SELECT file, speaker, domain,
            domain || '_factors', 'factors', factors, submitted_at
        FROM patient_first_visit_responses
        WHERE factors IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_index("ix_first_visit_answer_file_speaker", table_name="patient_first_visit_answer")
    op.drop_table("patient_first_visit_answer")
