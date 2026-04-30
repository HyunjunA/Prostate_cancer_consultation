"""widen llm estimate/treatment columns to TEXT

Some LLM responses for the `estimate` and `treatment` fields exceed the
hard VARCHAR limits we initially picked, which caused the entire AI
write-back to roll back (e.g. SID 18 in our test set hit a 256+ char
estimate during the cp-domain extraction step).

Both source columns are already free-form LLM output, so the right type
is TEXT. Postgres treats TEXT and VARCHAR identically for performance,
so the only effect is removing the artificial cap.

Affected columns:
  - llm_pipeline_intermediate.estimate    VARCHAR(255) → TEXT
  - llm_pipeline_intermediate.treatment   VARCHAR(255) → TEXT
  - llm_domain_scoring_and_summary.treatment VARCHAR(50) → TEXT

Revision ID: 009_widen_llm_text_columns
Revises: 008_drop_summary_cols
"""

from alembic import op
import sqlalchemy as sa


revision = "009_widen_llm_text_columns"
down_revision = "008_drop_summary_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # llm_pipeline_intermediate
    op.alter_column(
        "llm_pipeline_intermediate", "estimate",
        type_=sa.Text(),
        existing_type=sa.String(length=255),
        existing_nullable=True,
    )
    op.alter_column(
        "llm_pipeline_intermediate", "treatment",
        type_=sa.Text(),
        existing_type=sa.String(length=255),
        existing_nullable=True,
    )

    # llm_domain_scoring_and_summary
    op.alter_column(
        "llm_domain_scoring_and_summary", "treatment",
        type_=sa.Text(),
        existing_type=sa.String(length=50),
        existing_nullable=True,
    )


def downgrade() -> None:
    # Truncate to fit the old caps if any rows now exceed them.
    op.alter_column(
        "llm_pipeline_intermediate", "estimate",
        type_=sa.String(length=255),
        existing_type=sa.Text(),
        existing_nullable=True,
        postgresql_using="LEFT(estimate, 255)",
    )
    op.alter_column(
        "llm_pipeline_intermediate", "treatment",
        type_=sa.String(length=255),
        existing_type=sa.Text(),
        existing_nullable=True,
        postgresql_using="LEFT(treatment, 255)",
    )
    op.alter_column(
        "llm_domain_scoring_and_summary", "treatment",
        type_=sa.String(length=50),
        existing_type=sa.Text(),
        existing_nullable=True,
        postgresql_using="LEFT(treatment, 50)",
    )
