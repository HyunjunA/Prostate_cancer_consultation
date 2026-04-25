"""add behavior tracking tables (Pattern A — 3-area split)

Revision ID: 002_add_behavior_tracking_tables
Revises: 001_baseline
Create Date: 2026-04-24

Replaces the single user_interaction_log + session_recording duo with
three area-specific behavior tables, each with strict CHECK-enforced
event_type vocabularies.

Tables created:
  - patient_first_behavior   — patient first-visit interactions
  - patient_followup_survey  — patient follow-up survey behavior
  - doctor_behavior          — doctor consultation interactions

Also adds an `area` column to session_recording so rrweb captures can be
filtered by which interface produced them.

The legacy user_interaction_log table is left in place; it will be dropped
in a later migration once the frontend has migrated to the new endpoints.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002_add_behavior_tracking_tables"
down_revision: Union[str, Sequence[str], None] = "001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── patient_first_behavior ───────────────────────────────────────────
    op.execute("""
        CREATE TABLE patient_first_behavior (
            id               SERIAL PRIMARY KEY,
            session_id       VARCHAR(100) NOT NULL,
            file             VARCHAR(255) NOT NULL,
            speaker          VARCHAR(100) NOT NULL,
            event_type       VARCHAR(30)  NOT NULL,
            domain           VARCHAR(50),
            rating           SMALLINT,
            metadata         JSONB        NOT NULL DEFAULT '{}'::jsonb,
            device_type      VARCHAR(20),
            client_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

            CONSTRAINT ck_pfb_event_type CHECK (event_type IN (
                'page_view', 'topic_open', 'topic_close',
                'evidence_open', 'evidence_close',
                'rating_click', 'session_end'
            )),
            CONSTRAINT ck_pfb_domain_values CHECK (
                domain IS NULL OR domain IN ('cp', 'le', 'ed', 'inc', 'ius')
            ),
            CONSTRAINT ck_pfb_rating_range CHECK (
                rating IS NULL OR rating BETWEEN 1 AND 5
            ),
            CONSTRAINT ck_pfb_rating_requires_domain CHECK (
                event_type <> 'rating_click'
                OR (rating IS NOT NULL AND domain IS NOT NULL)
            ),
            CONSTRAINT ck_pfb_topic_event_requires_domain CHECK (
                event_type NOT IN ('topic_open', 'topic_close',
                                   'evidence_open', 'evidence_close')
                OR domain IS NOT NULL
            )
        )
    """)
    op.execute("CREATE INDEX idx_pfb_session ON patient_first_behavior(session_id)")
    op.execute("CREATE INDEX idx_pfb_file_event ON patient_first_behavior(file, event_type)")
    op.execute("CREATE INDEX idx_pfb_timestamp ON patient_first_behavior(client_timestamp DESC)")

    # ── patient_followup_survey ──────────────────────────────────────────
    # NOTE: answer payload is intentionally NOT stored here — the canonical
    # source is survey_submission_log. This table only tracks behavior
    # metadata (timing, ordering, step navigation).
    op.execute("""
        CREATE TABLE patient_followup_survey (
            id               SERIAL PRIMARY KEY,
            session_id       VARCHAR(100) NOT NULL,
            file             VARCHAR(255) NOT NULL,
            speaker          VARCHAR(100) NOT NULL,
            event_type       VARCHAR(30)  NOT NULL,
            survey_type      VARCHAR(30),
            question_id      VARCHAR(50),
            step_number      SMALLINT,
            metadata         JSONB        NOT NULL DEFAULT '{}'::jsonb,
            device_type      VARCHAR(20),
            client_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

            CONSTRAINT ck_pfs_event_type CHECK (event_type IN (
                'page_view', 'survey_step_view',
                'survey_answer', 'survey_complete',
                'session_end'
            )),
            CONSTRAINT ck_pfs_survey_type_values CHECK (
                survey_type IS NULL OR survey_type IN (
                    'sdm', 'dcs', 'risk_perception', 'satisfaction'
                )
            ),
            CONSTRAINT ck_pfs_survey_answer_required CHECK (
                event_type <> 'survey_answer'
                OR (survey_type IS NOT NULL AND question_id IS NOT NULL)
            ),
            CONSTRAINT ck_pfs_step_only_for_step_view CHECK (
                step_number IS NULL OR event_type = 'survey_step_view'
            )
        )
    """)
    op.execute("CREATE INDEX idx_pfs_session ON patient_followup_survey(session_id)")
    op.execute("CREATE INDEX idx_pfs_file_survey ON patient_followup_survey(file, survey_type)")
    op.execute("CREATE INDEX idx_pfs_timestamp ON patient_followup_survey(client_timestamp DESC)")

    # ── doctor_behavior ──────────────────────────────────────────────────
    # `file` is nullable because some doctor screens (e.g. dashboard list)
    # are not tied to a specific patient file.
    op.execute("""
        CREATE TABLE doctor_behavior (
            id               SERIAL PRIMARY KEY,
            session_id       VARCHAR(100) NOT NULL,
            file             VARCHAR(255),
            speaker          VARCHAR(100) NOT NULL,
            event_type       VARCHAR(30)  NOT NULL,
            target_type      VARCHAR(20),
            target_id        VARCHAR(255),
            metadata         JSONB        NOT NULL DEFAULT '{}'::jsonb,
            device_type      VARCHAR(20),
            client_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

            CONSTRAINT ck_doc_event_type CHECK (event_type IN (
                'page_view', 'view_change',
                'patient_select', 'topic_select', 'sentence_select',
                'rewrite_open', 'rewrite_input', 'rewrite_apply',
                'rubric_open', 'rubric_close', 'rubric_score_lock',
                'session_end'
            )),
            CONSTRAINT ck_doc_target_type_values CHECK (
                target_type IS NULL
                OR target_type IN ('patient', 'topic', 'sentence')
            )
        )
    """)
    op.execute("CREATE INDEX idx_doc_session ON doctor_behavior(session_id)")
    op.execute("CREATE INDEX idx_doc_speaker_event ON doctor_behavior(speaker, event_type)")
    op.execute("CREATE INDEX idx_doc_timestamp ON doctor_behavior(client_timestamp DESC)")

    # ── session_recording: add area column ───────────────────────────────
    op.execute("""
        ALTER TABLE session_recording
        ADD COLUMN area VARCHAR(20) NOT NULL DEFAULT 'unknown'
        CHECK (area IN ('patient_first', 'patient_followup', 'doctor', 'unknown'))
    """)
    op.execute("CREATE INDEX idx_sr_area_file ON session_recording(area, file)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_sr_area_file")
    op.execute("ALTER TABLE session_recording DROP COLUMN IF EXISTS area")

    op.execute("DROP TABLE IF EXISTS doctor_behavior")
    op.execute("DROP TABLE IF EXISTS patient_followup_survey")
    op.execute("DROP TABLE IF EXISTS patient_first_behavior")
