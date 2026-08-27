"""Add phi_access_log — the HIPAA 164.312(b) audit trail.

Nothing recorded who accessed which patient record. That gap could not be
closed retroactively: browser traffic reached the backend through the webapp
proxy, which did not forward the client address, so 93% of access-log lines
named the container rather than a person.

Indexes are on occurred_at and patient_ref because the two questions this
table exists to answer are "what happened during this window?" and "who
touched this patient?".

Revision ID: 035_add_phi_access_log
Revises: 034_widen_speaker_columns
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "035_add_phi_access_log"
down_revision: Union[str, Sequence[str], None] = "034_widen_speaker_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "phi_access_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "occurred_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("actor", sa.String(length=255), nullable=True),
        sa.Column("source_ip", sa.String(length=64), nullable=True),
        sa.Column("method", sa.String(length=10), nullable=False),
        sa.Column("path", sa.String(length=500), nullable=False),
        sa.Column("patient_ref", sa.String(length=500), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_phi_access_log_occurred_at", "phi_access_log", ["occurred_at"]
    )
    op.create_index(
        "ix_phi_access_log_patient_ref", "phi_access_log", ["patient_ref"]
    )


def downgrade() -> None:
    # Deliberately destructive and deliberately reversible: an audit table has
    # no foreign keys into it, so dropping it loses history but breaks nothing.
    # Export before downgrading if the rows are still needed for a review.
    op.drop_index("ix_phi_access_log_patient_ref", table_name="phi_access_log")
    op.drop_index("ix_phi_access_log_occurred_at", table_name="phi_access_log")
    op.drop_table("phi_access_log")
