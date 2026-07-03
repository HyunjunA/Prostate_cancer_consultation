"""Backfill first-visit Risk answers into patient_survey_submission_log.

Consolidation: the per-question rows in patient_first_visit_answer become one
patient_survey_submission_log row per patient with survey_type='risk_perception_2'
and an `answers` JSONB nested domain -> question_id -> {question_id, field, value,
submitted_at}. Only inserts when the patient has no risk_perception_2 row yet, so
it is safe to re-run. The source table is dropped in migration 025.

downgrade() removes the risk_perception_2 rows this backfill could have created.
"""
import json
from collections import defaultdict
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "024_backfill_risk_answers"  # 25 chars
down_revision: Union[str, Sequence[str], None] = "023_rename_survey_submission_log"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SURVEY_TYPE = "risk_perception_2"


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT file, speaker, domain, question_id, field, value, submitted_at "
        "FROM patient_first_visit_answer"
    )).mappings().all()

    # group by (file, speaker) -> {domain: {question_id: {...}}}
    grouped: dict = defaultdict(lambda: defaultdict(dict))
    for r in rows:
        submitted = r["submitted_at"]
        grouped[(r["file"], r["speaker"])][r["domain"]][r["question_id"]] = {
            "question_id": r["question_id"],
            "field": r["field"],
            "value": r["value"],  # JSONB column -> already a Python value
            "submitted_at": submitted.isoformat() if submitted is not None else None,
        }

    for (file, speaker), answers in grouped.items():
        exists = conn.execute(sa.text(
            "SELECT 1 FROM patient_survey_submission_log "
            "WHERE file = :f AND speaker = :s AND survey_type = :t"
        ), {"f": file, "s": speaker, "t": _SURVEY_TYPE}).first()
        if exists:
            continue
        conn.execute(sa.text(
            "INSERT INTO patient_survey_submission_log "
            "(file, speaker, survey_type, answers, submitted_at) "
            "VALUES (:f, :s, :t, CAST(:a AS jsonb), NOW())"
        ), {"f": file, "s": speaker, "t": _SURVEY_TYPE, "a": json.dumps(answers)})


def downgrade() -> None:
    op.execute(
        "DELETE FROM patient_survey_submission_log "
        "WHERE survey_type = 'risk_perception_2'"
    )
