"""Add sid + doctor columns to patient_survey_submission_log.

Survey data is stored (and pushed to REDCap) keyed by the opaque hashed composite
``Patient_<hashedPatient>_<hashedDoctor>_<date>``. These columns carry the real
subject attribution recovered by un-hashing that composite (see deid.py):
  - sid    : the un-hashed subject id, e.g. "SID_22" — also used as the REDCap record_id.
  - doctor : the un-hashed doctor number, e.g. "doc2" — carried as state.

Both are nullable (un-hash may not resolve for non-affine ids); a data backfill of
existing rows is done separately.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "030_add_sid_to_survey_log"  # 25 chars
down_revision: Union[str, Sequence[str], None] = "029_drop_patient_access"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "patient_survey_submission_log"


def upgrade() -> None:
    op.add_column(TABLE, sa.Column("sid", sa.String(length=50), nullable=True))
    op.add_column(TABLE, sa.Column("doctor", sa.String(length=50), nullable=True))
    op.create_index("idx_survey_submission_sid", TABLE, ["sid"])


def downgrade() -> None:
    op.drop_index("idx_survey_submission_sid", table_name=TABLE)
    op.drop_column(TABLE, "doctor")
    op.drop_column(TABLE, "sid")
