"""Drop patient_followup_survey_page_behavior.domain / .rating.

Migration 019 added these so the Total Survey's embedded Risk step (V41) could
record a per-domain helpfulness rating next to SDM / DCS / Satisfaction. That
never happened: the frontend's follow-up translation layer (tracking/track.ts)
discards the events that would carry them —

    // Dropped: slider_moved / answer_changed / rating_click (answer-input noise;
    // the answers are captured per-question above on domain submit).

— and for the panel-toggle events it puts the domain in `question_id`, not in
`domain`. Both columns are NULL on every row, and nothing reads them: no query,
no admin endpoint, no webapp component, no test.

They also weakened the API boundary. The sibling report route constrains
`domain` to the five domain codes and `rating` to 1..5, and requires both on a
`rating_click`; the follow-up route accepted any string and any integer, with no
DB CHECK behind it.

The report table keeps its own `domain` / `rating` — those are live (`domain` is
populated and validated; `rating` is exercised by
tests/test_track_patient_report_slider.py).

The `event_type` CHECK is deliberately left as-is; narrowing it is a separate
change.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "032_drop_followup_domain_rating"
down_revision: Union[str, Sequence[str], None] = "031_drop_survived_filter"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "patient_followup_survey_page_behavior"


def upgrade() -> None:
    op.drop_column(TABLE, "rating")
    op.drop_column(TABLE, "domain")


def downgrade() -> None:
    op.add_column(TABLE, sa.Column("domain", sa.String(length=50), nullable=True))
    op.add_column(TABLE, sa.Column("rating", sa.SmallInteger(), nullable=True))
