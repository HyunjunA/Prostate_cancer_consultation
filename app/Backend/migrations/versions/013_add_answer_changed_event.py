"""add answer_changed to patient_first_behavior event_type check

Revision ID: 013_add_answer_changed_event
Revises: 012_add_domain_submitted_event
Create Date: 2026-05-22

Adds the `answer_changed` first-visit event. Sliders (`slider_moved`) and the
helpfulness rating (`rating_click`) already record each interaction, but the
timeline radio and factor multi-select questions were only captured at Submit
(`domain_submitted`). This event makes those two question types record every
selection too, so all four question kinds now have per-interaction history and
the admin can see the trajectory (e.g. timeline A -> B, factors [x] -> [x, y]).

The event_type vocabulary is enforced by a DB CHECK constraint
(`ck_pfb_event_type`), so the new value must be added there or every insert is
rejected with a CheckViolationError. Mirrors the drop/recreate pattern used by
migrations 011 / 012.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "013_add_answer_changed_event"
down_revision: Union[str, Sequence[str], None] = "012_add_domain_submitted_event"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_TYPES = """(
    'page_view',
    'topic_open', 'topic_close',
    'evidence_open', 'evidence_close',
    'rating_click', 'slider_moved', 'answer_changed', 'domain_submitted',
    'session_end'
)"""

_OLD_TYPES = """(
    'page_view',
    'topic_open', 'topic_close',
    'evidence_open', 'evidence_close',
    'rating_click', 'slider_moved', 'domain_submitted',
    'session_end'
)"""


def upgrade() -> None:
    op.execute("ALTER TABLE patient_first_behavior DROP CONSTRAINT ck_pfb_event_type")
    op.execute(
        f"ALTER TABLE patient_first_behavior ADD CONSTRAINT ck_pfb_event_type "
        f"CHECK (event_type IN {_NEW_TYPES})"
    )


def downgrade() -> None:
    # Remove any answer_changed rows first so the narrower CHECK can be re-added.
    op.execute("DELETE FROM patient_first_behavior WHERE event_type = 'answer_changed'")
    op.execute("ALTER TABLE patient_first_behavior DROP CONSTRAINT ck_pfb_event_type")
    op.execute(
        f"ALTER TABLE patient_first_behavior ADD CONSTRAINT ck_pfb_event_type "
        f"CHECK (event_type IN {_OLD_TYPES})"
    )
