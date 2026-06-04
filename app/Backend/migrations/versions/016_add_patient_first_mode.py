"""add mode column to patient_first_behavior (report vs survey)

Revision ID: 016_add_patient_first_mode
Revises: 015_add_summary_toggle
Create Date: 2026-06-04

The patient first-visit page was split into two entry modes that share the
same component and the same tracking table:
  - report  (1st visit) : ?visit=first
  - survey  (2nd visit) : ?visit=first&mode=survey

Both flows write to patient_first_behavior, so without a discriminator their
events are indistinguishable. This adds a session-level `mode` column so the
research analysis (and the admin tracking UI) can separate the two.

Existing rows predate the split and have no known mode, so they stay NULL
("pre-split"). New events always set 'report' or 'survey'. A CHECK constraint
mirrors the typed-vocabulary approach used for event_type (ck_pfb_event_type);
NULL passes a CHECK, so legacy rows are unaffected.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "016_add_patient_first_mode"
down_revision: Union[str, Sequence[str], None] = "015_add_summary_toggle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "patient_first_behavior",
        sa.Column("mode", sa.String(length=10), nullable=True),
    )
    op.execute(
        "ALTER TABLE patient_first_behavior ADD CONSTRAINT ck_pfb_mode "
        "CHECK (mode IN ('report', 'survey'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE patient_first_behavior DROP CONSTRAINT ck_pfb_mode")
    op.drop_column("patient_first_behavior", "mode")
