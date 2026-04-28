"""baseline — mark existing schema as the starting point.

Revision ID: 001_baseline
Revises: None
Create Date: 2026-04-02

The database is initialized by database_schema.sql (Docker entrypoint).
This migration exists so that Alembic's version table records the
current schema as the baseline.  Future migrations will build on this.
"""
from typing import Sequence, Union


revision: str = "001_baseline"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op: schema already created by database_schema.sql."""
    pass


def downgrade() -> None:
    """No-op: dropping all tables is not supported via migration."""
    pass
