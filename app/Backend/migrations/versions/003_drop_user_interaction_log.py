"""drop user_interaction_log (legacy single tracking table)

Revision ID: 003_drop_user_interaction_log
Revises: 002_add_behavior_tracking_tables
Create Date: 2026-04-24

The legacy single tracking table has been replaced by three area-specific
behavior tables (patient_first_behavior, patient_followup_survey,
doctor_behavior) added in revision 002. The frontend has been migrated
to the new endpoints, the legacy backend route is removed, and the table
contents were cleared earlier in this branch — so the table is now safe
to drop.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003_drop_user_interaction_log"
down_revision: Union[str, Sequence[str], None] = "002_add_behavior_tracking_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_uil_session")
    op.execute("DROP INDEX IF EXISTS idx_uil_event_type")
    op.execute("DROP INDEX IF EXISTS idx_uil_client_timestamp")
    op.execute("DROP INDEX IF EXISTS idx_uil_file_event_type")
    op.execute("DROP TABLE IF EXISTS user_interaction_log")


def downgrade() -> None:
    # Recreate the legacy table shape for rollback only. Data is NOT restored;
    # this is a structural rollback to keep alembic downgrade head working.
    op.execute("""
        CREATE TABLE user_interaction_log (
            id SERIAL PRIMARY KEY,
            session_id VARCHAR(100) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'patient',
            visit_type VARCHAR(20),
            file VARCHAR(255) NOT NULL,
            speaker VARCHAR(100) NOT NULL,
            event_type VARCHAR(50) NOT NULL,
            element_id VARCHAR(255),
            event_data JSONB,
            device_type VARCHAR(20),
            client_timestamp TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX idx_uil_session ON user_interaction_log(session_id)")
    op.execute("CREATE INDEX idx_uil_event_type ON user_interaction_log(event_type)")
    op.execute("CREATE INDEX idx_uil_client_timestamp ON user_interaction_log(client_timestamp)")
    op.execute("CREATE INDEX idx_uil_file_event_type ON user_interaction_log(file, event_type)")
