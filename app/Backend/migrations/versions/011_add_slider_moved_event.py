"""add slider_moved to patient_first_behavior event_type check

Revision ID: 011_add_slider_moved_event
Revises: 010_first_visit_responses
Create Date: 2026-05-21

Adds the `slider_moved` first-visit event. VAS sliders default to 50, so the
submitted value alone cannot distinguish "the patient chose 50" from "the
patient never touched it". The frontend now emits one `slider_moved` event the
first time a given slider is moved; its presence is the "answered" signal.

The event_type vocabulary is enforced by a DB CHECK constraint
(`ck_pfb_event_type`), so the new value must be added there or every insert is
rejected with a CheckViolationError. Mirrors the drop/recreate pattern used by
migration 005 for the doctor_behavior table.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "011_add_slider_moved_event"
down_revision: Union[str, Sequence[str], None] = "010_first_visit_responses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_TYPES = """(
    'page_view',
    'topic_open', 'topic_close',
    'evidence_open', 'evidence_close',
    'rating_click', 'slider_moved',
    'session_end'
)"""

_OLD_TYPES = """(
    'page_view',
    'topic_open', 'topic_close',
    'evidence_open', 'evidence_close',
    'rating_click',
    'session_end'
)"""


def upgrade() -> None:
    op.execute("ALTER TABLE patient_first_behavior DROP CONSTRAINT ck_pfb_event_type")
    op.execute(
        f"ALTER TABLE patient_first_behavior ADD CONSTRAINT ck_pfb_event_type "
        f"CHECK (event_type IN {_NEW_TYPES})"
    )


def downgrade() -> None:
    # Remove any slider_moved rows first so the narrower CHECK can be re-added.
    op.execute("DELETE FROM patient_first_behavior WHERE event_type = 'slider_moved'")
    op.execute("ALTER TABLE patient_first_behavior DROP CONSTRAINT ck_pfb_event_type")
    op.execute(
        f"ALTER TABLE patient_first_behavior ADD CONSTRAINT ck_pfb_event_type "
        f"CHECK (event_type IN {_OLD_TYPES})"
    )
