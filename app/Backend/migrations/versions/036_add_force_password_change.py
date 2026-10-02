"""add force_password_change to auth_user

Revision ID: 036
Revises: 035
Create Date: 2026-10-02
"""

from alembic import op
import sqlalchemy as sa

revision = "036_add_force_password_change"
down_revision = "035_add_phi_access_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "auth_user",
        sa.Column(
            "force_password_change",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("auth_user", "force_password_change")
