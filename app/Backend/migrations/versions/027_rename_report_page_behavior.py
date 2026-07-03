"""Rename patient_first_behavior -> patient_report_page_behavior.

The table now holds only the patient REPORT-page behavior (survey behavior moved
to patient_followup_survey in migration 026), so the name is updated to match.
Pure rename — no columns/data/FK change (0 incoming FKs).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "027_rename_report_page_behavior"  # 31 chars
down_revision: Union[str, Sequence[str], None] = "026_first_behavior_report_only"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE patient_first_behavior RENAME TO patient_report_page_behavior")


def downgrade() -> None:
    op.execute("ALTER TABLE patient_report_page_behavior RENAME TO patient_first_behavior")
