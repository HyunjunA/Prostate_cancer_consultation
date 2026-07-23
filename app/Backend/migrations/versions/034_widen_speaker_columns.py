"""Widen every `speaker` column from VARCHAR(100) to VARCHAR(255).

The de-id pipeline now hashes the visit date into the filename, so the speaker
string ``Patient_<hashedPatient>_<hashedDoctor>_<hashedDate>`` is ~106 chars —
longer than the old plaintext-date form (~74). At VARCHAR(100) the parent
``patient_summary`` INSERT raised StringDataRightTruncationError, rolling back the
whole persistence transaction so nothing landed in the DB. Widen all speaker
columns to 255 (the ``file`` columns are already 255).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "034_widen_speaker_columns"
down_revision: Union[str, Sequence[str], None] = "033_add_admin_upload_log"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Every table that stores the de-id speaker label.
TABLES = (
    "doctor_rewrite_log",
    "patient_summary",
    "patient_survey_submission_log",
    "sentence_prediction",
    "patient_report_page_behavior",
    "patient_followup_survey_page_behavior",
    "doctor_behavior",
)


def upgrade() -> None:
    for table in TABLES:
        op.alter_column(
            table, "speaker",
            existing_type=sa.String(length=100),
            type_=sa.String(length=255),
        )


def downgrade() -> None:
    # NOTE: narrowing back to 100 fails if any hashed-date speaker (~106 chars)
    # is already stored — that data no longer fits. Kept for symmetry.
    for table in TABLES:
        op.alter_column(
            table, "speaker",
            existing_type=sa.String(length=255),
            type_=sa.String(length=100),
        )
