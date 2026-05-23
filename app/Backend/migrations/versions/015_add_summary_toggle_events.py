"""add summary_open/summary_close to patient_first_behavior event_type check

Revision ID: 015_add_summary_toggle
Revises: 014_first_visit_answers
Create Date: 2026-05-22

Adds the `summary_open` / `summary_close` first-visit events. The "View
AI-Generated Summary" panel toggle was not tracked at all (only the "View
relevant sentences" panel emitted evidence_open/close). These mirror the
evidence events so the AI-summary panel's open/close behavior is captured.

Combined with the new metadata.screen field (which page the toggle happened
on — Overview vs the domain detail), each panel toggle is now distinguishable
by event_type (summary vs evidence) x domain (category) x screen (page).

The event_type vocabulary is enforced by a DB CHECK constraint
(`ck_pfb_event_type`), so the new values must be added there or every insert is
rejected. Mirrors the drop/recreate pattern of migrations 011-013.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "015_add_summary_toggle"
down_revision: Union[str, Sequence[str], None] = "014_first_visit_answers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_TYPES = """(
    'page_view',
    'topic_open', 'topic_close',
    'evidence_open', 'evidence_close',
    'summary_open', 'summary_close',
    'rating_click', 'slider_moved', 'answer_changed', 'domain_submitted',
    'session_end'
)"""

_OLD_TYPES = """(
    'page_view',
    'topic_open', 'topic_close',
    'evidence_open', 'evidence_close',
    'rating_click', 'slider_moved', 'answer_changed', 'domain_submitted',
    'session_end'
)"""


def upgrade() -> None:
    op.execute("ALTER TABLE patient_first_behavior DROP CONSTRAINT ck_pfb_event_type")
    op.execute(
        f"ALTER TABLE patient_first_behavior ADD CONSTRAINT ck_pfb_event_type "
        f"CHECK (event_type IN {_NEW_TYPES})"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM patient_first_behavior "
        "WHERE event_type IN ('summary_open', 'summary_close')"
    )
    op.execute("ALTER TABLE patient_first_behavior DROP CONSTRAINT ck_pfb_event_type")
    op.execute(
        f"ALTER TABLE patient_first_behavior ADD CONSTRAINT ck_pfb_event_type "
        f"CHECK (event_type IN {_OLD_TYPES})"
    )
