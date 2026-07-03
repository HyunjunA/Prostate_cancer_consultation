"""Drop patient_first_visit_answer.

The first-visit Risk answers were consolidated into patient_survey_submission_log
(survey_type='risk_perception_2') by migration 024 + the repointed
/api/patient/first-visit-answers handlers, so this per-question table is no longer
read or written. The parent patient_summary + the REDCap post_risk_perception_2
sync (which reads the request answers, not this table) are unaffected.

downgrade() recreates the table (its post-020 shape) so the migration is
reversible; it does NOT restore rows (they now live in the survey log).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "025_drop_first_visit_answer"  # 27 chars
down_revision: Union[str, Sequence[str], None] = "024_backfill_risk_answers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS patient_first_visit_answer")


def downgrade() -> None:
    op.execute("""
        CREATE TABLE patient_first_visit_answer (
            id           SERIAL PRIMARY KEY,
            file         VARCHAR(255) NOT NULL,
            speaker      VARCHAR(100) NOT NULL,
            domain       VARCHAR(20)  NOT NULL,
            question_id  VARCHAR(100) NOT NULL,
            field        VARCHAR(50)  NOT NULL,
            value        JSONB        NOT NULL,
            submitted_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            CONSTRAINT ck_first_visit_answer_domain
                CHECK (domain IN ('cp', 'le', 'ed', 'inc', 'ius')),
            CONSTRAINT uq_first_visit_answer
                UNIQUE (file, speaker, domain, question_id),
            CONSTRAINT fk_first_visit_answer_to_patient_summary
                FOREIGN KEY (file, speaker)
                REFERENCES patient_summary(file, speaker)
                ON DELETE CASCADE
        )
    """)
    op.execute(
        "CREATE INDEX ix_first_visit_answer_file_speaker "
        "ON patient_first_visit_answer (file, speaker)"
    )
