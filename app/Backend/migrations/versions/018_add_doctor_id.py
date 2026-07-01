"""add doctor_id to transcript_analysis_log

Revision ID: 018_add_doctor_id
Revises: 017_recording_area_split
Create Date: 2026-07-01

Multi-doctor support: a de-identified transcript filename may carry a doctor id
as "<patient>_<doctor>_<MMDDYYYY>". The pipeline parses that middle token and
stores it on the run header so the doctor/patient endpoints can scope data per
physician (?doctor_id=...).

Nullable + indexed: legacy 2-part / non-doctor files stay NULL (still visible
when no doctor filter is applied — backward compatible), and the per-doctor
filter uses the index. The index name matches SQLAlchemy's default for the
`index=True` column on TranscriptAnalysisLog.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "018_add_doctor_id"
down_revision: Union[str, Sequence[str], None] = "017_recording_area_split"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transcript_analysis_log",
        sa.Column("doctor_id", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_transcript_analysis_log_doctor_id",
        "transcript_analysis_log",
        ["doctor_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_transcript_analysis_log_doctor_id",
        table_name="transcript_analysis_log",
    )
    op.drop_column("transcript_analysis_log", "doctor_id")
