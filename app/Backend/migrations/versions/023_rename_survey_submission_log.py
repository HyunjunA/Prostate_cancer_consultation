"""Rename survey_submission_log -> patient_survey_submission_log.

Naming clarity: the table holds the patient's survey submissions, so the
`patient_` prefix matches the other patient tables. Pure rename — no columns,
data, or FKs change (nothing references this table with a foreign key).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "023_rename_survey_submission_log"  # 31 chars
down_revision: Union[str, Sequence[str], None] = "022_drop_patient_summary_domain"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE survey_submission_log RENAME TO patient_survey_submission_log")


def downgrade() -> None:
    op.execute("ALTER TABLE patient_survey_submission_log RENAME TO survey_submission_log")
