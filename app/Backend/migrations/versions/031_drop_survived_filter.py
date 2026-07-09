"""Drop llm_pipeline_intermediate.survived_filter.

The flag was meant to record whether an extraction candidate survived the AI
pipeline's filtering step. It never did so correctly for the treatment-aware
domains (ed / inc / ius): the writer derived the survivor set from
``df_filtering.index``, but ``ai_pipeline.filtering`` rebuilds and re-indexes
that frame for those domains, so the positional range it returns has no relation
to the extraction frame's labels. The flag therefore landed on unrelated
sentences (cp / le, which take the label-preserving path, were correct).

Nothing user-facing reads it: no patient, physician or admin page touches
llm_pipeline_intermediate. The only consumers were an unwired admin endpoint,
two CLI verifiers and two CLI dump tools. The "the LLM did not reject
everything" signal those verifiers derived from it is already covered by the
llm_domain_scoring_and_summary row-count check on the same analysis.

Rather than repair a flag no one reads, remove it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "031_drop_survived_filter"  # 24 chars
down_revision: Union[str, Sequence[str], None] = "030_add_sid_to_survey_log"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "llm_pipeline_intermediate"
COLUMN = "survived_filter"


def upgrade() -> None:
    op.drop_column(TABLE, COLUMN)


def downgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column(COLUMN, sa.Boolean(), nullable=False, server_default=sa.false()),
    )
