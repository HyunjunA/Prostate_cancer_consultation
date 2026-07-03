"""Make patient_first_behavior report-only: delete legacy survey rows + drop mode.

The first-visit survey behavior now lives in patient_followup_survey (the Risk
survey always runs as the combined Total Survey step, whose events redirect there
as survey_type='risk_perception'). The standalone first-visit survey flow that
produced patient_first_behavior.mode='survey' is no longer reachable, so those
rows are legacy. patient_first_behavior is now purely the first-visit REPORT
behavior, and the `mode` column is redundant.

upgrade: delete the legacy mode='survey' rows, then drop the `mode` column.
downgrade: re-add a nullable `mode` column (rows are not restored).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "026_first_behavior_report_only"  # 30 chars
down_revision: Union[str, Sequence[str], None] = "025_drop_first_visit_answer"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM patient_first_behavior WHERE mode = 'survey'")
    op.drop_column("patient_first_behavior", "mode")


def downgrade() -> None:
    op.add_column(
        "patient_first_behavior",
        sa.Column("mode", sa.String(length=10), nullable=True),
    )
