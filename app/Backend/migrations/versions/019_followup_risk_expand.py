"""Expand patient_followup_survey to hold the combined-flow Risk step (V41).

Widens the event_type CHECK (ck_pfs_event_type) to also allow the 1st-survey
(V41) event types and adds nullable domain/rating columns, so the embedded Risk
step of the Total Survey flow can record its behavior here as
survey_type='risk_perception' — showing uniformly in the admin follow-up
dashboard alongside SDM / DCS / Satisfaction.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "019_followup_risk_expand"
down_revision: Union[str, Sequence[str], None] = "018_add_doctor_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "patient_followup_survey"
_CONSTRAINT = "ck_pfs_event_type"

_OLD_EVENTS = [
    "page_view", "survey_step_view", "survey_answer",
    "survey_complete", "session_end",
]
# 1st-survey (V41) event types appended for the combined Risk step.
_NEW_EVENTS = _OLD_EVENTS + [
    "topic_open", "topic_close", "evidence_open", "evidence_close",
    "summary_open", "summary_close", "rating_click", "slider_moved",
    "answer_changed", "domain_submitted",
]


def _check_sql(events: Sequence[str]) -> str:
    joined = ", ".join(f"'{e}'" for e in events)
    return f"event_type IN ({joined})"


def upgrade() -> None:
    op.add_column(_TABLE, sa.Column("domain", sa.String(length=50), nullable=True))
    op.add_column(_TABLE, sa.Column("rating", sa.SmallInteger(), nullable=True))
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(_CONSTRAINT, _TABLE, _check_sql(_NEW_EVENTS))


def downgrade() -> None:
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(_CONSTRAINT, _TABLE, _check_sql(_OLD_EVENTS))
    op.drop_column(_TABLE, "rating")
    op.drop_column(_TABLE, "domain")
