"""Drop patient_summary_domain.patient_scoring / patient_response.

The per-domain patient rating (patient_scoring) + free-text response
(patient_response) are no longer collected by the frontend (the rating UI was
removed). Both columns were always NULL, and their read/write endpoints
(/api/patient/scoring, /api/patient/responses) are removed in the same change.
downgrade() re-adds the columns (nullable) so the migration is reversible;
historical NULL data cannot be restored (there was none).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "021_drop_domain_scoring_resp"  # <= 32 chars
down_revision: Union[str, Sequence[str], None] = "020_drop_first_visit_responses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dropping the columns also drops their inline CHECK constraint.
    op.drop_column("patient_summary_domain", "patient_scoring")
    op.drop_column("patient_summary_domain", "patient_response")


def downgrade() -> None:
    op.add_column(
        "patient_summary_domain",
        sa.Column("patient_scoring", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_patient_summary_domain_scoring",
        "patient_summary_domain",
        "patient_scoring BETWEEN 0 AND 10",
    )
    op.add_column(
        "patient_summary_domain",
        sa.Column("patient_response", sa.Text(), nullable=True),
    )
