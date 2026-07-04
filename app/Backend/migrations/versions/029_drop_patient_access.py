"""Drop patient_access.

The per-user × per-patient access-control table is unused: the deployment has
admin-only login, and admin/API-key users are superusers that bypass the ACL, so
no rows are ever written or read. Access control is now a plain superuser gate in
auth/access_control.check_patient_access(). auth_user + auth_api_key stay.

downgrade() recreates the table (shape + FKs/constraints) so the migration is
reversible; rows are not restored.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "029_drop_patient_access"  # 23 chars
down_revision: Union[str, Sequence[str], None] = "028_rename_followup_behavior"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS patient_access")


def downgrade() -> None:
    op.execute("""
        CREATE TABLE patient_access (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER      NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
            patient_id  VARCHAR(255) NOT NULL,
            access_type VARCHAR(20)  NOT NULL DEFAULT 'read',
            granted_at  TIMESTAMPTZ  DEFAULT NOW(),
            granted_by  INTEGER      REFERENCES auth_user(id),
            CONSTRAINT uq_user_patient UNIQUE (user_id, patient_id),
            CONSTRAINT ck_patient_access_type CHECK (access_type IN ('read','write','admin'))
        )
    """)
