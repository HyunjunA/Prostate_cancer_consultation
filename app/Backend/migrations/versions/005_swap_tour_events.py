"""replace tour_restart with tour_open + tour_end

Revision ID: 005_replace_tour_restart_with_open_end
Revises: 004_add_tour_restart_event
Create Date: 2026-04-24

Drops the imprecise `tour_restart` event_type and replaces it with two
explicit lifecycle events:
  - tour_open : the guided tour starts (auto on first visit, or via the
                Restart button — distinguished in metadata.trigger)
  - tour_end  : the tour finishes (metadata.status = "finished" | "skipped")

Existing tour_restart rows are migrated to tour_open with
metadata.trigger="restart_button" so historical clicks remain attributable.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005_swap_tour_events"
down_revision: Union[str, Sequence[str], None] = "004_add_tour_restart_event"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_TYPES = """(
    'page_view', 'view_change',
    'patient_select', 'topic_select', 'sentence_select',
    'rewrite_open', 'rewrite_input', 'rewrite_apply',
    'rubric_open', 'rubric_close', 'rubric_score_lock',
    'tour_open', 'tour_end',
    'session_end'
)"""

_OLD_TYPES = """(
    'page_view', 'view_change',
    'patient_select', 'topic_select', 'sentence_select',
    'rewrite_open', 'rewrite_input', 'rewrite_apply',
    'rubric_open', 'rubric_close', 'rubric_score_lock',
    'tour_restart',
    'session_end'
)"""


def upgrade() -> None:
    # Drop the old CHECK first so the UPDATE can change values to ones that
    # only the new vocabulary allows.
    op.execute("ALTER TABLE doctor_behavior DROP CONSTRAINT ck_doc_event_type")
    op.execute("""
        UPDATE doctor_behavior
        SET event_type = 'tour_open',
            metadata = COALESCE(metadata, '{}'::jsonb) || '{"trigger":"restart_button"}'::jsonb
        WHERE event_type = 'tour_restart'
    """)
    op.execute(
        f"ALTER TABLE doctor_behavior ADD CONSTRAINT ck_doc_event_type "
        f"CHECK (event_type IN {_NEW_TYPES})"
    )


def downgrade() -> None:
    # Reverse-migrate tour_open back to tour_restart for rollback.
    op.execute("""
        UPDATE doctor_behavior
        SET event_type = 'tour_restart'
        WHERE event_type = 'tour_open'
    """)
    op.execute("DELETE FROM doctor_behavior WHERE event_type = 'tour_end'")
    op.execute("ALTER TABLE doctor_behavior DROP CONSTRAINT ck_doc_event_type")
    op.execute(
        f"ALTER TABLE doctor_behavior ADD CONSTRAINT ck_doc_event_type "
        f"CHECK (event_type IN {_OLD_TYPES})"
    )
