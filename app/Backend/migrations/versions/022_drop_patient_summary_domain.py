"""Drop patient_summary_domain.

The per-domain patient-side table is no longer needed: its patient-input columns
were dropped (migration 021), and the active patient pages (V41 first-visit,
V31Re follow-up) now build their per-domain view from the AI pipeline output
(llm_domain_scoring_and_summary) + the fixed domain order — they no longer read
patient_summary_domain. The pipeline no longer writes it either. The parent
`patient_summary` STAYS (anchor for patient_first_visit_answer + survey_submission_log).

downgrade() recreates the table (its post-021 shape) + FK so the migration is
reversible; historical rows cannot be restored (they were pipeline-derived).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "022_drop_patient_summary_domain"  # 31 chars
down_revision: Union[str, Sequence[str], None] = "021_drop_domain_scoring_resp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS patient_summary_domain")


def downgrade() -> None:
    op.execute("""
        CREATE TABLE patient_summary_domain (
            file          VARCHAR(255) NOT NULL,
            speaker       VARCHAR(100) NOT NULL,
            domain        VARCHAR(100) NOT NULL,
            display_order INTEGER      NOT NULL DEFAULT 0,
            CONSTRAINT patient_summary_domain_pkey
                PRIMARY KEY (file, speaker, domain),
            CONSTRAINT fk_domain_to_summary
                FOREIGN KEY (file, speaker)
                REFERENCES patient_summary(file, speaker)
                ON DELETE CASCADE
        )
    """)
