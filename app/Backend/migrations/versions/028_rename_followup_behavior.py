"""Rename patient_followup_survey -> patient_followup_survey_page_behavior.

The table holds the follow-up survey PAGE behavior (interaction events, not the
answers — those live in patient_survey_submission_log), so the name is updated to
match the patient_report_page_behavior convention. Pure rename (0 incoming FKs).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "028_rename_followup_behavior"  # 28 chars
down_revision: Union[str, Sequence[str], None] = "027_rename_report_page_behavior"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE patient_followup_survey RENAME TO patient_followup_survey_page_behavior")


def downgrade() -> None:
    op.execute("ALTER TABLE patient_followup_survey_page_behavior RENAME TO patient_followup_survey")
