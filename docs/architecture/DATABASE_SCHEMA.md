# Database Schema

PostgreSQL schema for COMPASS. **16 application tables** in the `public` schema (plus `alembic_version` for migration tracking → **17 tables total**). Schema lives in `app/Backend/models.py` (SQLAlchemy ORM) and is bootstrapped via `app/Backend/database_schema.sql` + Alembic migrations **001–028** (current head `028_rename_followup_behavior`).

Native deployment uses port `:5433`; Docker mode uses `:5432`.

> **Recent consolidation / cleanup:** `patient_first_visit_responses` (mig 020),
> `patient_summary_domain.patient_scoring`/`patient_response` (mig 021), and
> `patient_summary_domain` (mig 022) were dropped. `survey_submission_log` was
> renamed to `patient_survey_submission_log` (mig 023). First-visit Risk answers
> were consolidated into `patient_survey_submission_log` as
> `survey_type='risk_perception_2'` and the `patient_first_visit_answer` table was
> dropped (mig 024 backfill + 025 drop). `patient_first_behavior` became report-only
> (mig 026 dropped its `mode` column + moved survey behavior to the follow-up table)
> and was renamed to `patient_report_page_behavior` (mig 027); `patient_followup_survey`
> was renamed to `patient_followup_survey_page_behavior` (mig 028). See the Migrations table.

---

## First, understand the "parent–child (anchor)" pattern

Some tables here hold **no data of their own** — they look empty at first ("why a table with only key columns?"). They are **anchor tables**: each defines a subject (one patient, or one pipeline run) **exactly once**, and the real detail lives in the many **child tables** that reference the anchor via a foreign key (FK).

### Concrete example (`patient_summary`)

**Parent `patient_summary`** — one row per patient, just the identity `(file, speaker)`:

| file | speaker |
|---|---|
| 13475_..._07022026.csv | Patient_13475_..._07022026 |

→ no data columns — just "this patient exists".

**Child `patient_survey_submission_log`** — that patient's actual survey submissions, **many rows** (one per `survey_type`: risk_perception_2, sdm, dcs, satisfaction, …):

| file | speaker | survey_type | answers (JSONB) |
|---|---|---|---|
| 13475_… | Patient_13475_… | risk_perception_2 | `{cp:{cp_timeline:…}, le:{…}, …}` |
| 13475_… | Patient_13475_… | sdm | `{…}` |
| … | … | … | … |

Every child row points at the **same** patient, so the patient is **defined once** in the parent.

### Why split into anchor + children — 3 payoffs
1. **Referential integrity** — a child row can only exist for a real subject; the DB blocks data attaching to a non-existent patient/run.
2. **Cascade delete** — deleting one anchor row removes **all** its child data at once.
3. **Survives re-processing (UPSERT)** — re-running the same file UPSERTs the anchor row so existing referrers (survey submissions) stay valid.

The two anchors in this schema:
- **`patient_summary`** `(file, speaker)` → anchor for patient-side children: `patient_survey_submission_log` (all patient survey answers, first-visit + follow-up).
- **`transcript_analysis_log`** `id` → anchor for pipeline-output children (sentence predictions, NLP/AI intermediate + final).

---

## Table Groups

| Group | Tables | Purpose |
|---|---|---|
| Pipeline persistence | 7 | NLP + AI pipeline outputs |
| Behavior tracking | 3 | Per-page user behavior (patient first/followup, doctor) |
| Authentication | 3 | API key auth + per-patient access control |
| Other | 3 | Audio recordings, survey submissions, doctor rewrite log |

> Each table below lists its **purpose** and **why it exists** (what breaks without it).

---

## Pipeline Persistence (7 tables)

### `transcript_analysis_log` — pipeline run header · **pipeline anchor**
PK `id`. Run metadata: `patient_id`, `source_filename`, `total_sentences`, `top_n`, `context_window`, `model_results` (jsonb), `xlsx_data` (bytea, download fallback), timestamps, `ai_overall_score`, `processed`.
**Why it exists:** every pipeline output references this `id` — the anchor tying all results of one run to one patient, and the basis for download / history / re-processing.

### `sentence_prediction` — top-N selected sentences (per analysis × model)
PK `id`, FK `analysis_id`. `model` (cp/le/ed/inc/ius), `sentence_index`, `pred_score`, `sentence_text`, `context`.
**Why it exists:** the evidence sentences shown in the patient summary / doctor view; the per-domain representatives, read quickly instead of re-selected each time.

### `nlp_all_predictions` — every sentence × 5 model scores
PK `id`, FK `analysis_id`. One row per sentence carries `pred_cp…pred_ius`.
**Why it exists:** the full raw probabilities, so a threshold change / re-analysis re-selects from here without re-running the pipeline. Reproducibility backbone.

### `nlp_pipeline_intermediate` — NLP step-state snapshots (JSONB)
PK `id`, FK `analysis_id`. One row per step; `payload` jsonb.
**Why it exists:** each NLP step's I/O for debugging / reproduction / verification.

### `llm_pipeline_intermediate` — per-domain AI step state
PK `id`, FK `analysis_id`. One row per (domain × step × sentence). `survived_filter`, `ai_score` (0-5), `estimate`/`treatment` (TEXT since mig 009).
**Why it exists:** records how the AI summary was produced, step by step — verification / debugging / quality audit.

### `llm_domain_scoring_and_summary` — final patient-visible AI output
PK `id`, FK `analysis_id`. Per-domain `ai_score`, `score_explanation`, `extracted_estimate`, `treatment`, `source_sentence`, `source_context`, `reformat_sentence` (patient-facing summary).
**Why it exists:** caches the final summary shown to the patient (fast, cheaper, reproducible) and drives the domain view on the active patient pages (V41 / V31Re).

### `patient_summary` — parent for patient-side data · **patient anchor**
PK `(file, speaker)`. No data columns.
**Why it exists:** defines one patient exactly once as the anchor for `patient_survey_submission_log` (integrity, cascade delete, UPSERT survival). See the parent–child section. *(Its former child `patient_summary_domain` was dropped in migration 022.)*

---

## Behavior Tracking (3 tables)

Three sibling tables sharing `id, session_id, file, speaker, event_type, metadata (jsonb), device_type, client_timestamp, created_at` plus per-area extras.
**Why behavior tracking exists:** which areas a patient opens first/most is a **secondary outcome** — a proxy for what matters most to this patient. These store interaction *events* (how the patient interacted); the *answers* live in `patient_survey_submission_log`.

| Table | Extra columns | Used by |
|---|---|---|
| `patient_report_page_behavior` | `domain`, `rating` | First-visit **report** page (report-only; renamed from `patient_first_behavior`, mig 026 dropped `mode` + moved survey behavior out, mig 027 renamed) |
| `patient_followup_survey_page_behavior` | `survey_type`, `question_id`, `step_number`, `domain`, `rating` | Follow-up survey pages (DCS/SDM/Sat) **+ the first-visit Risk survey** (`survey_type='risk_perception'`, redirected from the report page); `domain`/`rating` from mig 019; renamed from `patient_followup_survey` (mig 028) |
| `doctor_behavior` | `target_type`, `target_id` | Doctor dashboard |

---

## Authentication (3 tables)

### `auth_user`
PK `id`. `username`, `email`, `password_hash`, `role`, `is_superuser`, `is_active`, `auth_provider`.
**Why it exists:** the source of who can log in and with what role. Without it there is no access control or audit.

### `auth_api_key`
PK `id`, FK `user_id`. Hashed key (`key_hash`), `label`, `is_active`, `expires_at`, `last_used_at`. Checked with `hmac.compare_digest`.
**Why it exists:** the credential the frontend/pipeline present. The hash avoids exposing the raw key if the DB leaks; allows per-key revocation/expiry.

### `patient_access`
PK `id`. Maps `user_id` → `patient_id` with `access_type`.
**Why it exists:** restricts a user to their assigned patients (least-privilege ACL) — central to trial PHI protection.

---

## Other (3 tables)

### `session_recording`
PK `id`. Audio chunks (`recording_data` bytea) per session × file × area, with `event_count`.
**Why it exists:** archives the raw consultation audio for re-analysis, verification, compliance.

### `patient_survey_submission_log` — all patient survey answers
PK `id`. One row per submission: `survey_type`, `answers` (jsonb), `extra_data`, `submitted_at`, plus REDCap fields `redcap_synced`, `redcap_record_id`, `redcap_error`. FK `(file, speaker) → patient_summary`.
**Why it exists:** the single source of truth for **every patient survey answer** — follow-up surveys (`sdm`, `dcs`, `satisfaction`) *and* the first-visit Risk cognition answers (`survey_type='risk_perception_2'`, nested `answers` domain→question_id, written per-domain by `PUT /api/patient/first-visit-answers`, mirrored to REDCap `post_risk_perception_2`). `redcap_error` records failures for retry. *(The dedicated `patient_first_visit_answer` table was consolidated in here — mig 024/025.)*

### `doctor_rewrite_log`
PK `(file, i, i2, speaker, time)`. One row = one AI-assisted sentence rewrite (`original_sentence`, `revised_sentence`, `score`, `class`).
**Why it exists:** records how the doctor rewrote a sentence — intervention/learning data + audit trail.

---

## System (1 table)

### `alembic_version`
Migration-tracking table; single column `version_num` (VARCHAR(32); current head `028_rename_followup_behavior`).
**Why it exists:** records which migration the DB is at, so the next can be applied/rolled back safely. (Used by Alembic, not the app.)

---

## Migrations

| Revision | Purpose |
|---|---|
| 001–009 | baseline + behavior tracking + NLP/AI intermediates + widen LLM text (see git history) |
| 010–019 | first-visit responses/answers, behavior `event_type` extensions, recording split, doctor scoping, follow-up Risk expand |
| **020_drop_first_visit_responses** | drop `patient_first_visit_responses` (superseded by `_answer`) |
| **021_drop_domain_scoring_resp** | drop `patient_summary_domain.patient_scoring`/`patient_response` |
| **022_drop_patient_summary_domain** | drop `patient_summary_domain` (per-domain view now from the AI tables) |
| **023_rename_survey_submission_log** | rename `survey_submission_log` → `patient_survey_submission_log` |
| **024_backfill_risk_answers** | backfill first-visit answers into `patient_survey_submission_log` (`risk_perception_2`) |
| **025_drop_first_visit_answer** | drop `patient_first_visit_answer` (consolidated into the survey log) |
| **026_first_behavior_report_only** | drop `patient_first_behavior.mode` + delete legacy survey rows (survey behavior → follow-up table) |
| **027_rename_report_page_behavior** | rename `patient_first_behavior` → `patient_report_page_behavior` |
| **028_rename_followup_behavior** | rename `patient_followup_survey` → `patient_followup_survey_page_behavior` |

`alembic upgrade head` brings a fresh DB to revision **028** (`028_rename_followup_behavior`). `init-db-native.sh` does this end-to-end.

---

## See Also

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system-level overview, deployment, module layout
- [`../ml-pipeline/ML_PIPELINE.md`](../ml-pipeline/ML_PIPELINE.md) — which tables each pipeline step writes to
- `app/Backend/models.py` — canonical SQLAlchemy definitions
- `app/Backend/migrations/versions/` — migration source
