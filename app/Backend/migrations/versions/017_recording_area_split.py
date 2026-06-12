"""widen session_recording.area + allow split first-visit and physician areas

Revision ID: 017_recording_area_split
Revises: 016_add_patient_first_mode
Create Date: 2026-06-12

The rrweb recording `area` taxonomy is expanded from 3 to the interface-level
set the admin recordings UI now filters by:

  - patient_first_report   (?visit=first)
  - patient_first_survey   (?visit=first&mode=survey)
  - patient_followup
  - physician              (was 'doctor')

This mirrors the report/survey split already recorded in patient_first_behavior
(migration 016). Legacy values ('patient_first', 'doctor', 'unknown') are kept
in the CHECK so existing recordings are untouched — no data is remapped. The
column is widened to VARCHAR(40) since the new keys are longer.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "017_recording_area_split"
down_revision: Union[str, Sequence[str], None] = "016_add_patient_first_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE session_recording "
        "DROP CONSTRAINT IF EXISTS session_recording_area_check"
    )
    op.execute("ALTER TABLE session_recording ALTER COLUMN area TYPE VARCHAR(40)")
    op.execute(
        """
        ALTER TABLE session_recording
        ADD CONSTRAINT session_recording_area_check
        CHECK (area IN (
            'patient_first',
            'patient_first_report',
            'patient_first_survey',
            'patient_followup',
            'doctor',
            'physician',
            'unknown'
        ))
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE session_recording "
        "DROP CONSTRAINT IF EXISTS session_recording_area_check"
    )
    op.execute("ALTER TABLE session_recording ALTER COLUMN area TYPE VARCHAR(20)")
    op.execute(
        """
        ALTER TABLE session_recording
        ADD CONSTRAINT session_recording_area_check
        CHECK (area IN ('patient_first', 'patient_followup', 'doctor', 'unknown'))
        """
    )
