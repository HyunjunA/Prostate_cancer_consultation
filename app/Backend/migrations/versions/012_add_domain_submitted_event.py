"""add domain_submitted to patient_first_behavior event_type check

Revision ID: 012_add_domain_submitted_event
Revises: 011_add_slider_moved_event
Create Date: 2026-05-22

Adds the `domain_submitted` first-visit event. The timeline radio and factor
multi-select questions are NOT individually tracked; only their final answers
land in patient_first_visit_responses. To capture that the patient pressed
Submit for a domain — and to capture re-submits after editing — the frontend
now emits one `domain_submitted` event per Submit click, carrying a snapshot of
that domain's answers in metadata. Each press (including re-submits) is its own
row, so the admin can show the submission history per domain.

The event_type vocabulary is enforced by a DB CHECK constraint
(`ck_pfb_event_type`), so the new value must be added there or every insert is
rejected with a CheckViolationError. Mirrors the drop/recreate pattern used by
migration 011 for slider_moved.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "012_add_domain_submitted_event"
down_revision: Union[str, Sequence[str], None] = "011_add_slider_moved_event"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_TYPES = """(
    'page_view',
    'topic_open', 'topic_close',
    'evidence_open', 'evidence_close',
    'rating_click', 'slider_moved', 'domain_submitted',
    'session_end'
)"""

_OLD_TYPES = """(
    'page_view',
    'topic_open', 'topic_close',
    'evidence_open', 'evidence_close',
    'rating_click', 'slider_moved',
    'session_end'
)"""


def upgrade() -> None:
    op.execute("ALTER TABLE patient_first_behavior DROP CONSTRAINT ck_pfb_event_type")
    op.execute(
        f"ALTER TABLE patient_first_behavior ADD CONSTRAINT ck_pfb_event_type "
        f"CHECK (event_type IN {_NEW_TYPES})"
    )


def downgrade() -> None:
    # Remove any domain_submitted rows first so the narrower CHECK can be re-added.
    op.execute("DELETE FROM patient_first_behavior WHERE event_type = 'domain_submitted'")
    op.execute("ALTER TABLE patient_first_behavior DROP CONSTRAINT ck_pfb_event_type")
    op.execute(
        f"ALTER TABLE patient_first_behavior ADD CONSTRAINT ck_pfb_event_type "
        f"CHECK (event_type IN {_OLD_TYPES})"
    )
