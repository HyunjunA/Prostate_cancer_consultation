"""add tour_restart to doctor_behavior event_type CHECK

Revision ID: 004_add_tour_restart_event
Revises: 003_drop_user_interaction_log
Create Date: 2026-04-24

The Onboarding tour's "Restart Tour" button is a meaningful behavior
signal (doctors who replay the guide vs those who never do). It does not
fit any existing event_type, so we extend the doctor_behavior CHECK to
allow `tour_restart`.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "004_add_tour_restart_event"
down_revision: Union[str, Sequence[str], None] = "003_drop_user_interaction_log"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_TYPES = """(
    'page_view', 'view_change',
    'patient_select', 'topic_select', 'sentence_select',
    'rewrite_open', 'rewrite_input', 'rewrite_apply',
    'rubric_open', 'rubric_close', 'rubric_score_lock',
    'tour_restart',
    'session_end'
)"""

_OLD_TYPES = """(
    'page_view', 'view_change',
    'patient_select', 'topic_select', 'sentence_select',
    'rewrite_open', 'rewrite_input', 'rewrite_apply',
    'rubric_open', 'rubric_close', 'rubric_score_lock',
    'session_end'
)"""


def upgrade() -> None:
    op.execute("ALTER TABLE doctor_behavior DROP CONSTRAINT ck_doc_event_type")
    op.execute(
        f"ALTER TABLE doctor_behavior ADD CONSTRAINT ck_doc_event_type "
        f"CHECK (event_type IN {_NEW_TYPES})"
    )


def downgrade() -> None:
    # Drop any rows that would violate the old constraint before re-adding it.
    op.execute("DELETE FROM doctor_behavior WHERE event_type = 'tour_restart'")
    op.execute("ALTER TABLE doctor_behavior DROP CONSTRAINT ck_doc_event_type")
    op.execute(
        f"ALTER TABLE doctor_behavior ADD CONSTRAINT ck_doc_event_type "
        f"CHECK (event_type IN {_OLD_TYPES})"
    )
