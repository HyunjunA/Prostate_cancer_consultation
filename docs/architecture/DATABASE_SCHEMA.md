# Database Schema

PostgreSQL schema for the COMPASS. **19 application tables** in the `public` schema (plus `alembic_version` for migration tracking). Schema lives in `app/Backend/models.py` (SQLAlchemy ORM) and is bootstrapped via `app/Backend/database_schema.sql` + Alembic migrations 001–010.

Native deployment uses port `:5433`; Docker mode uses `:5432`.

---

## Table Groups

| Group | Tables | Purpose |
|---|---|---|
| Pipeline persistence | 8 | NLP + AI pipeline outputs |
| Behavior tracking | 3 | Per-page user behavior (patient first/followup, doctor) |
| Authentication | 3 | API key auth + per-patient access control |
| Other | 3 | Audio recordings, REDCap submissions, doctor rewrite log |

---

## Pipeline Persistence (8 tables)

### `transcript_analysis_log` — pipeline run header
| Column | Type | Notes |
|---|---|---|
| `id` | int (PK) | |
| `patient_id` | varchar(255) | derived from filename, e.g. `SID_10` |
| `source_filename` | varchar(500) | original transcript filename |
| `total_sentences` | int | post-segmentation count |
| `top_n` | int | sentences selected per domain |
| `context_window` | int | ±N sentences for context |
| `model_results` | jsonb | full step-3 prediction snapshot |
| `xlsx_data` | bytea | exported xlsx (for download fallback) |
| `pipeline_started_at` | timestamptz | |
| `analyzed_at` | timestamptz | NLP stage finished |
| `ai_overall_score` | float | AI-stage rollup |
| `processed` | bool | true = AI stage complete |
| `processed_at` | timestamptz | |

### `sentence_prediction` — top-N selected sentences (per analysis × model)
PK `id`, FK `analysis_id → transcript_analysis_log.id`. One row per (analysis, model, selected sentence).
Key columns: `model` (cp/le/ed/inc/ius), `sentence_index`, `pred_score`, `sentence_text`, `context`.

### `nlp_all_predictions` — every sentence × 5 model scores
PK `id`, FK `analysis_id`. Single row per sentence carries `pred_cp`, `pred_le`, `pred_ed`, `pred_inc`, `pred_ius` columns.

### `nlp_pipeline_intermediate` — step state snapshots (JSONB)
PK `id`, FK `analysis_id`. One row per pipeline step (`step` ∈ raw / filtered / sentences / top_by_model). `payload` is jsonb.

### `llm_pipeline_intermediate` — per-domain AI step state
PK `id`, FK `analysis_id`. One row per (domain × step × sentence). `step` ∈ scoring / extraction / filtering / selection / reformat. Includes `survived_filter` boolean, `ai_score` (smallint 0-5), `estimate` (text — TEXT since migration 009), `treatment` (text — TEXT since 009).

### `llm_domain_scoring_and_summary` — final patient-visible AI output
PK `id`, FK `analysis_id`. Final per-domain scoring + reformatted summary. Columns: `domain`, `ai_score`, `score_explanation`, `extracted_estimate`, `treatment`, `source_sentence`, `source_context`, `reformat_sentence` (the patient-facing summary).

### `patient_summary` — parent for patient-side data
PK `(file, speaker)`. No data columns — purely a parent row for `patient_summary_domain`.

### `patient_summary_domain` — patient-side scoring + free-response per domain
PK `(file, speaker, domain)`, FK back to `patient_summary`. Columns: `display_order`, `patient_scoring` (int), `patient_response` (text). The patient's quality rating and free-text feedback per domain.

---

## Behavior Tracking (3 tables)

Three sibling tables sharing the columns `id, session_id, file, speaker, event_type, metadata (jsonb), device_type, client_timestamp, created_at` plus per-area extras:

| Table | Extra columns | Used by |
|---|---|---|
| `patient_first_behavior` | `domain`, `rating` | First-visit page |
| `patient_followup_survey` | `survey_type`, `question_id`, `step_number` | Follow-up surveys (DCS, SDM, Risk, Sat) |
| `doctor_behavior` | `target_type`, `target_id` | Doctor dashboard |

---

## Authentication (3 tables)

### `auth_user`
PK `id`. `username`, `email`, `password_hash`, `role`, `is_superuser`, `is_active`, `auth_provider`, `created_at`, `updated_at`.

### `auth_api_key`
PK `id`, FK `user_id`. Hashed API key (`key_hash`), `label`, `is_active`, `created_at`, `expires_at`, `last_used_at`. Checked with `hmac.compare_digest` (constant-time).

### `patient_access`
PK `id`. Maps `user_id` → `patient_id` with `access_type` (read/write). Used to scope which patients a non-superuser can see.

---

## Other (3 tables)

### `session_recording`
PK `id`. Stores audio chunks (`recording_data` bytea) per session × file × area, with `event_count`. Used for raw consultation audio archive.

### `survey_submission_log`
PK `id`. One row per survey submission. `survey_type`, `answers` (jsonb), `extra_data`, `submitted_at`, plus REDCap sync fields `redcap_synced` (bool), `redcap_record_id`, `redcap_error` (text — populated on failed sync).

### `doctor_rewrite_log`
PK `(file, i, i2, speaker, time)`. Each row = one AI-assisted sentence rewrite (`original_sentence`, `revised_sentence`, `score`, `class`).

---

## Migrations

| Revision | Purpose |
|---|---|
| 001_baseline | initial schema (matches `database_schema.sql`) |
| 002_add_behavior_tracking_tables | three behavior tables (Pattern A — area split) |
| 003_drop_user_interaction_log | drop legacy unified tracking table |
| 004_add_tour_restart_event | extend `doctor_behavior.event_type` enum |
| 005_swap_tour_events | tour_restart → tour_open + tour_end |
| 006_nlp_intermediates | add `nlp_all_predictions`, `nlp_pipeline_intermediate` |
| 007_ai_intermediates | add `llm_pipeline_intermediate`, `llm_domain_scoring_and_summary` |
| 008_drop_summary_cols | drop unused `patient_summary.entire_summary`, `patient_summary_domain.summary_text` |
| 009_widen_llm_text_columns | widen `estimate`/`treatment` from VARCHAR to TEXT |

`alembic upgrade head` brings a fresh DB to revision **009**. `init-db-native.sh` does this end-to-end.

---

## See Also

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system-level overview, deployment, module layout
- [`../ml-pipeline/ML_PIPELINE.md`](../ml-pipeline/ML_PIPELINE.md) — which tables each pipeline step writes to
- `app/Backend/models.py` — canonical SQLAlchemy definitions
- `app/Backend/migrations/versions/` — migration source
