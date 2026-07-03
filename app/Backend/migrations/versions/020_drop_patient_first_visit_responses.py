"""Drop patient_first_visit_responses (superseded by patient_first_visit_answer).

The V37 fixed-4-column responses table (migration 010) was superseded by the
row-per-question patient_first_visit_answer table (migration 014). No rendered
page reads or writes it anymore (the V37/V38/V39 components + useFirstVisitResponses
hook are removed in the same change), so it is dropped. downgrade() recreates the
exact table + index from migration 010 so the migration is fully reversible.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "020_drop_first_visit_responses"  # <= 32 chars (version_num width)
down_revision: Union[str, Sequence[str], None] = "019_followup_risk_expand"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_pfvr_file_speaker")
    op.execute("DROP TABLE IF EXISTS patient_first_visit_responses")


def downgrade() -> None:
    # Recreate the table exactly as migration 010 created it.
    op.execute("""
        CREATE TABLE patient_first_visit_responses (
            id              SERIAL       PRIMARY KEY,
            file            VARCHAR(255) NOT NULL,
            speaker         VARCHAR(100) NOT NULL,
            domain          VARCHAR(100) NOT NULL,

            vas_primary     INTEGER,
            vas_secondary   INTEGER,
            timeline        VARCHAR(50),
            factors         JSONB,

            submitted_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

            CONSTRAINT uq_first_visit
                UNIQUE (file, speaker, domain),
            CONSTRAINT ck_first_visit_domain
                CHECK (domain IN ('cp','le','ed','inc','ius')),
            CONSTRAINT ck_first_visit_vas_primary
                CHECK (vas_primary IS NULL OR vas_primary BETWEEN 0 AND 100),
            CONSTRAINT ck_first_visit_vas_secondary
                CHECK (vas_secondary IS NULL OR vas_secondary BETWEEN 0 AND 100),
            CONSTRAINT fk_first_visit_to_patient_summary
                FOREIGN KEY (file, speaker)
                REFERENCES patient_summary(file, speaker)
                ON DELETE CASCADE
        )
    """)
    op.execute(
        "CREATE INDEX idx_pfvr_file_speaker "
        "ON patient_first_visit_responses(file, speaker)"
    )
