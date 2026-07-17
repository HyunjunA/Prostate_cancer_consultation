"""Add admin_upload_log so the /admin/upload page keeps its history across refresh.

The upload list was React-state only and vanished on reload. This table records one
row per upload attempt (de-identified queued filename, status, message, uploader,
time) so the page can rebuild the list on mount. It stores only the hashed queued
name — never the real study id or the real->hash mapping.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "033_add_admin_upload_log"
down_revision: Union[str, Sequence[str], None] = "032_drop_followup_domain_rating"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "admin_upload_log"


def upgrade() -> None:
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("queued_filename", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=255), nullable=True),
        sa.Column("uploaded_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.func.now(), nullable=True),
    )
    op.create_index("idx_admin_upload_log_uploaded_at", TABLE, ["uploaded_at"])


def downgrade() -> None:
    op.drop_index("idx_admin_upload_log_uploaded_at", table_name=TABLE)
    op.drop_table(TABLE)
