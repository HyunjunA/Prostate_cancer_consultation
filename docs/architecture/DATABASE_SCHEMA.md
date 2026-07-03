# Database Schema

PostgreSQL schema for COMPASS. **19 application tables** in the `public` schema (plus `alembic_version` for migration tracking → **20 tables total**). Schema lives in `app/Backend/models.py` (SQLAlchemy ORM) and is bootstrapped via `app/Backend/database_schema.sql` + Alembic migrations **001–019** (current head `019_followup_risk_expand`).

Native deployment uses port `:5433`; Docker mode uses `:5432`.

---

## First, understand the "parent–child (anchor)" pattern

Two tables here hold **no data of their own** — they look empty and confusing at first ("why is there a table with only key columns?"). They are **anchor tables**: each defines a subject (one patient, or one pipeline run) **exactly once**, and the real detail lives in the many **child tables** that reference the anchor via a foreign key (FK).

### Concrete example (`patient_summary`)

**Parent `patient_summary`** — one row per patient, just the identity `(file, speaker)`:

| file | speaker |
|---|---|
| 13475_..._07022026.csv | Patient_13475_..._07022026 |

→ no scores, no answers — just "this patient exists".

**Child `patient_summary_domain`** — the same patient's actual data, **5 rows** (one per domain):

| file | speaker | domain | patient_scoring | patient_response |
|---|---|---|---|---|
| 13475_… | Patient_13475_… | cancer_prognosis | 4 | "…" |
| 13475_… | Patient_13475_… | continence | 3 | "…" |
| 13475_… | Patient_13475_… | erectile_dysfunction… | 5 | "…" |
| 13475_… | Patient_13475_… | life_expectancy | … | … |
| 13475_… | Patient_13475_… | irritative_urinary… | … | … |

All 5 child rows point at the **same** patient, so the patient is **defined once** in the parent.

### Why split into anchor + children — 3 concrete payoffs
1. **Referential integrity** — a child row can only exist for a real subject; the DB blocks data attaching to a non-existent patient/run.
2. **Cascade delete** — deleting one anchor row removes **all** its child data at once (clean removal of one patient / one run).
3. **Survives re-processing (UPSERT)** — re-running the same file UPSERTs the anchor row so existing referrers (e.g. survey submissions) stay valid.

The two anchors in this schema:
- **`patient_summary`** `(file, speaker)` → anchor for patient-side children (domain scoring, first-visit answers, survey submissions).
- **`transcript_analysis_log`** `id` → anchor for pipeline-output children (sentence predictions, NLP/AI intermediate + final).

---

## Table Groups

| Group | Tables | Purpose |
|---|---|---|
| Pipeline persistence | 8 | NLP + AI pipeline outputs |
| First-visit survey answers | 2 | Patient's per-domain first-visit cognition answers |
| Behavior tracking | 3 | Per-page user behavior (patient first/followup, doctor) |
| Authentication | 3 | API key auth + per-patient access control |
| Other | 3 | Audio recordings, REDCap submissions, doctor rewrite log |

> Each table below lists its **purpose** and **why it exists** (what breaks without it).

---

## Pipeline Persistence (8 tables)

### `transcript_analysis_log` — pipeline run header · **pipeline anchor**
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
| `ai_overall_score` | float | AI-stage rollup |
| `processed` | bool | true = AI stage complete |

**Why it exists:** every pipeline output (predictions, NLP/AI intermediate + final) references this `id` — it is the **anchor** that ties all results of one run to one patient, and the basis for download / history / re-processing. Without it, outputs have no run to belong to.

### `sentence_prediction` — top-N selected sentences (per analysis × model)
PK `id`, FK `analysis_id → transcript_analysis_log`. One row per (analysis, model, selected sentence): `model` (cp/le/ed/inc/ius), `sentence_index`, `pred_score`, `sentence_text`, `context`.
**Why it exists:** the **evidence sentences** shown in the patient summary / doctor view. Stores just the per-domain representative sentences so they can be read quickly instead of re-selected from all predictions each time.

### `nlp_all_predictions` — every sentence × 5 model scores
PK `id`, FK `analysis_id`. One row per sentence carries `pred_cp`, `pred_le`, `pred_ed`, `pred_inc`, `pred_ius`.
**Why it exists:** keeps the **full raw probabilities**, so a threshold change or re-analysis can re-select from here without re-running the pipeline. The reproducibility backbone.

### `nlp_pipeline_intermediate` — NLP step-state snapshots (JSONB)
PK `id`, FK `analysis_id`. One row per step (`step` ∈ raw / filtered / sentences / top_by_model); `payload` is jsonb.
**Why it exists:** records each NLP step's I/O for **debugging / reproduction / verification** ("why was this sentence selected or dropped?").

### `llm_pipeline_intermediate` — per-domain AI step state
PK `id`, FK `analysis_id`. One row per (domain × step × sentence). `step` ∈ scoring / extraction / filtering / selection / reformat; `survived_filter` bool; `ai_score` (0-5); `estimate` / `treatment` (TEXT since migration 009).
**Why it exists:** records **how the AI summary was produced**, step by step — for verification, debugging, and quality audit of the GPT output.

### `llm_domain_scoring_and_summary` — final patient-visible AI output
PK `id`, FK `analysis_id`. Per-domain `ai_score`, `score_explanation`, `extracted_estimate`, `treatment`, `source_sentence`, `source_context`, `reformat_sentence` (patient-facing summary).
**Why it exists:** **caches the final summary** shown to the patient — no GPT re-call per view (fast, cheaper) and the final artifact for research. Without it, display is slow/costly and not reproducible.

### `patient_summary` — parent for patient-side data · **patient anchor**
PK `(file, speaker)`. No data columns.
**Why it exists:** defines one patient (a specific file × speaker) **exactly once** as the anchor for its children (domain scoring, first-visit answers, survey submissions): guarantees they reference a real patient (integrity), enables cascade delete, and survives re-processing via UPSERT. See the parent–child section above.

### `patient_summary_domain` — patient-side scoring + free-response per domain
PK `(file, speaker, domain)`, FK → `patient_summary`. `display_order`, `patient_scoring` (1-5), `patient_response` (text).
**Why it exists:** stores, **per domain**, how useful the patient found the AI summary (rating) plus free-text feedback — core study data (part of the primary outcome).

---

## First-visit survey answers (2 tables)

The patient's **answers** to the first-visit cognition questions (kept separate from the click-tracking tables and from the control arm — the 14 questions exist only on the experimental arm). Both FK `(file, speaker) → patient_summary`.

### `patient_first_visit_answer` — ACTIVE, row-per-question (migration 014)
PK `id`; one row per `(file, speaker, domain, question_id)`. `field` = vas/timeline/factors; `value` JSONB (any answer shape). Written by `PUT /api/patient/first-visit-answers`; read back to prefill. Feeds the REDCap `post_risk_perception_2` sync.
**Why it exists:** stores the experimental arm's **cognition/understanding measurements** after seeing the AI summary (a core study metric). Row-per-question keeps several same-type questions apart and maps 1:1 to the REDCap field export. Without it, the arm's key responses can't be persisted / analyzed / synced.

### `patient_first_visit_responses` — ⚠️ DEPRECATED (migration 010)
**Not used in production.** Superseded by `patient_first_visit_answer`; no rendered page reads or writes it (its only consumers — the V37/V38/V39 components and the `useFirstVisitResponses` hook — are dead; the active V41 uses first-visit-ANSWERS). The backend `GET`/`PUT /api/patient/first-visit-responses` endpoints are marked `deprecated`. Kept as a **zero-row backup**; a future migration may drop it.

- **Non-destructive:** it is *deprecated*, not dropped — the active V41 first-visit / Total-Survey Risk flow is unaffected (it uses first-visit-**answers**), and the empty table remains as a backup.
- **Drop path (later):** a `020_drop_patient_first_visit_responses` migration is out of scope for now; it can be added once the backup is no longer wanted.

PK `id`; one row per `(file, speaker, domain)`. V37's fixed columns: `vas_primary`, `vas_secondary` (cp only), `timeline`, `factors` (JSONB).
**Why it (still) exists:** an untouched **backup** of the pre-migration-014 data, safe to keep for verifying the backfill was correct.

---

## Behavior Tracking (3 tables)

Three sibling tables sharing `id, session_id, file, speaker, event_type, metadata (jsonb), device_type, client_timestamp, created_at` plus per-area extras.
**Why behavior tracking exists:** which areas a patient opens first/most is a **secondary outcome** — a proxy for "what matters most to this patient" — and the basis for engagement / intervention analysis.

| Table | Extra columns | Used by · why |
|---|---|---|
| `patient_first_behavior` | `domain`, `rating` | First-visit page: per-domain open/rate interactions |
| `patient_followup_survey` | `survey_type`, `question_id`, `step_number`, `domain`, `rating` | Follow-up surveys (DCS/SDM/Risk/Sat): per-question progress + response behavior (response rate, time-on-step). `domain`/`rating` added by migration 019 for the embedded Total-Survey Risk step |
| `doctor_behavior` | `target_type`, `target_id` | Doctor dashboard: how the doctor explores scores/sentences |

---

## Authentication (3 tables)

### `auth_user`
PK `id`. `username`, `email`, `password_hash`, `role`, `is_superuser`, `is_active`, `auth_provider`.
**Why it exists:** the source of who can log in and with what role (admin / researcher). Without it there is no access control or audit.

### `auth_api_key`
PK `id`, FK `user_id`. Hashed API key (`key_hash`), `label`, `is_active`, `expires_at`, `last_used_at`. Checked with `hmac.compare_digest` (constant-time).
**Why it exists:** the credential the frontend/pipeline present to call the API. Storing the **hash** avoids exposing the raw key if the DB leaks, and allows per-key revocation/expiry.

### `patient_access`
PK `id`. Maps `user_id` → `patient_id` with `access_type` (read/write).
**Why it exists:** restricts a user to only their **assigned patients** (least-privilege ACL) — central to trial PHI protection. Without it one account could see every patient.

---

## Other (3 tables)

### `session_recording`
PK `id`. Audio chunks (`recording_data` bytea) per session × file × area, with `event_count`.
**Why it exists:** archives the **raw consultation audio** for re-analysis, verification, and compliance — the evidence behind the pipeline input.

### `survey_submission_log`
PK `id`. One row per survey submission: `survey_type`, `answers` (jsonb), `extra_data`, `submitted_at`, plus REDCap fields `redcap_synced` (bool), `redcap_record_id`, `redcap_error`.
**Why it exists:** the **source of truth** for follow-up survey answers plus REDCap sync status; `redcap_error` records failures so a sync can be retried. Without it, the raw responses / sync state are lost.

### `doctor_rewrite_log`
PK `(file, i, i2, speaker, time)`. One row = one AI-assisted sentence rewrite (`original_sentence`, `revised_sentence`, `score`, `class`).
**Why it exists:** records **how the doctor rewrote a sentence** — intervention/learning data plus an audit trail — the basis for the doctor-communication-improvement study.

---

## System (1 table)

### `alembic_version`
Migration-tracking table; single column `version_num` (current head `019`).
**Why it exists:** records **which migration the DB is at**, so the next migration can be applied/rolled back safely. Without it the schema version is unknown and migrations can't be managed. (Used by the Alembic tool, not the app.)

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
| 010_add_patient_first_visit_responses | add `patient_first_visit_responses` (fixed 4-column) |
| 011_add_slider_moved_event | extend first-behavior `event_type` (slider_moved) |
| 012_add_domain_submitted_event | extend first-behavior `event_type` (domain_submitted) |
| 013_add_answer_changed_event | extend first-behavior `event_type` (answer_changed) |
| 014_first_visit_answers_row_per_question | add `patient_first_visit_answer`; backfill from responses |
| 015_add_summary_toggle_events | extend `event_type` (summary/evidence open+close) |
| 016_add_patient_first_mode | add first-behavior `mode` (report vs survey) |
| 017_recording_area_split | split `session_recording` by area |
| 018_add_doctor_id | add `doctor_id` scoping |
| 019_followup_risk_expand | widen `patient_followup_survey` CHECK + add `domain`/`rating` (embedded Risk step) |

`alembic upgrade head` brings a fresh DB to revision **019** (`019_followup_risk_expand`). `init-db-native.sh` does this end-to-end.

---

## See Also

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system-level overview, deployment, module layout
- [`../ml-pipeline/ML_PIPELINE.md`](../ml-pipeline/ML_PIPELINE.md) — which tables each pipeline step writes to
- `app/Backend/models.py` — canonical SQLAlchemy definitions
- `app/Backend/migrations/versions/` — migration source
