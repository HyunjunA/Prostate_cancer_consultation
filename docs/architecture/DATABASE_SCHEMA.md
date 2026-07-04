# Database Schema — Data Dictionary

Complete reference for the COMPASS PostgreSQL database: **16 application tables** (plus
`alembic_version`) in the `public` schema. Every table and every column is documented below.
Canonical definitions live in `app/Backend/models.py`.

Native deployment: port `:5433`, database `prostatecancer_db_native`. Docker mode: `:5432`.

**How to read the column tables:** `Key` column — **PK** primary key, **FK→t** foreign key to
table `t`, **U** part of a unique constraint. `Null` — whether the column may be empty.

---

## The parent–child (anchor) pattern
Two tables hold **identity only** and act as anchors that other tables reference by foreign key:
- **`transcript_analysis_log`** (PK `id`) — one row per pipeline run; every NLP/AI result row points
  back to it via `analysis_id`. Deleting a run cascade-deletes all its results.
- **`patient_summary`** (PK `file, speaker`) — one row per patient; the patient's survey submissions
  reference it. This gives referential integrity, cascade delete, and survival across re-processing.

---

# Group 1 — Pipeline persistence (7 tables)
The NLP + AI pipeline output. All are tied to one run via `analysis_id → transcript_analysis_log.id`.

## `transcript_analysis_log` — pipeline run header · **anchor**
One row per analysis run of one transcript file. Parent of every pipeline result table.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment run id. Used as `analysis_id` by all child tables. |
| `patient_id` | varchar(255) | no | | Patient identifier (hashed) parsed from the file name. |
| `total_sentences` | integer | no | | Number of sentences the transcript segmented into. |
| `top_n` | integer | no | | How many top sentences per model were selected (e.g. 10). |
| `context_window` | integer | no | | How many neighboring sentences of context were attached (default 3). |
| `model_results` | jsonb | yes | | Per-model NLP result payload (validated JSON) kept for reference. |
| `xlsx_data` | bytea | yes | | The exported results xlsx stored inline, so downloads work without a filesystem. |
| `source_filename` | varchar(500) | yes | | Original uploaded file name. |
| `pipeline_started_at` | timestamptz | yes | | When the pipeline orchestrator began this file. |
| `analyzed_at` | timestamptz | yes | | When NLP results were saved (default now()). |
| `ai_overall_score` | double | yes | | Mean AI score across domains, written when the AI stage finishes. |
| `processed` | boolean | yes | | True once the full AI pipeline completed for this run. |
| `processed_at` | timestamptz | yes | | When the AI stage completed. |
| `doctor_id` | varchar(255) | yes | | Doctor identifier (hashed) parsed from the file name. |

## `nlp_all_predictions` — every sentence × 5 model scores
One row per sentence, carrying all five model probabilities. The full raw NLP output.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `analysis_id` | integer | no | **FK→transcript_analysis_log** | The run this sentence belongs to. |
| `patient_id` | varchar(255) | no | | Patient identifier (denormalized for fast filtering). |
| `sentence_index` | integer | no | | Global sentence position in the transcript. |
| `utterance_index` | integer | no | | Utterance (turn) number the sentence came from. |
| `sentence_in_utterance` | integer | no | | Position of the sentence within its utterance. |
| `speaker` | varchar(255) | yes | | Speaker label (doctor/patient) of the sentence. |
| `sentence_text` | text | yes | | The sentence text. |
| `pred_cp` | double | yes | | Probability the sentence is about Cancer Prognosis. |
| `pred_le` | double | yes | | Probability — Life Expectancy. |
| `pred_ed` | double | yes | | Probability — Erectile Dysfunction. |
| `pred_inc` | double | yes | | Probability — Urinary Incontinence. |
| `pred_ius` | double | yes | | Probability — Irritative Urinary Symptoms. |
| `created_at` | timestamptz | no | | Row insert time (default now()). |

*(`pred_*` are NLP probabilities in [0,1], not scores.)*

## `sentence_prediction` — top-N selected sentences (per model)
The per-domain representative sentences shown to the doctor. One row per (sentence × model) that made a model's top-N.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `analysis_id` | integer | no | **FK→transcript_analysis_log** | The run. |
| `patient_id` | varchar(255) | no | | Patient identifier (denormalized). |
| `model` | varchar(10) | no | | Domain/model this row is for: `cp`/`le`/`ed`/`inc`/`ius`. |
| `sentence_index` | integer | no | | Global sentence position. |
| `utterance_index` | integer | no | | Utterance number. |
| `sentence_in_utterance` | integer | no | | Position within the utterance. |
| `speaker` | varchar(100) | yes | | Speaker label. |
| `sentence_text` | text | yes | | The selected sentence text. |
| `pred_score` | double | no | | This model's probability for the sentence (the ranking value). |
| `context` | text | yes | | Neighboring sentences; the focus sentence wrapped in `<main>…</main>`. |

## `nlp_pipeline_intermediate` — NLP step-state snapshots
One JSONB snapshot per NLP step for debugging / reproduction.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `analysis_id` | integer | no | **FK→transcript_analysis_log** | The run. |
| `patient_id` | varchar(255) | no | | Patient identifier. |
| `step` | varchar(20) | no | | NLP step name: `raw`/`filtered`/`sentences`/`top_by_model` (CHECK-constrained). |
| `payload` | jsonb | no | | The step's input/output data. |
| `row_count` | integer | yes | | Number of rows in the payload (quick size indicator). |
| `created_at` | timestamptz | no | | Insert time. |

## `llm_pipeline_intermediate` — per-domain AI intermediate state
One row per AI candidate (domain × sentence) recording how the AI scored/filtered it.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `analysis_id` | integer | no | **FK→transcript_analysis_log** | The run. |
| `patient_id` | varchar(255) | no | | Patient identifier. |
| `domain` | varchar(10) | no | | Domain: `cp`/`le`/`ed`/`inc`/`ius` (CHECK). |
| `step` | varchar(20) | no | | AI step; currently always `extraction` (CHECK). |
| `sentence_index` | integer | no | | Global sentence position of the candidate. |
| `sentence_text` | text | yes | | Candidate sentence text. |
| `context` | text | yes | | Surrounding context. |
| `pred_score` | double | yes | | Upstream NLP probability of the candidate. |
| `ai_score` | smallint | yes | | GPT-4o score 0–5 for the candidate. |
| `score_explanation` | text | yes | | The model's reasoning for the score. |
| `estimate` | text | yes | | Extracted numeric estimate (long text; TEXT to avoid overflow). |
| `treatment` | text | yes | | Extracted treatment context. |
| `survived_filter` | boolean | no | | Whether this candidate passed the filter step (default false). |
| `created_at` | timestamptz | no | | Insert time. |

## `llm_domain_scoring_and_summary` — final patient-visible AI output
One row per domain (a domain may have several rows when the treatment branches). This is what the patient/doctor screens display.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `analysis_id` | integer | no | **FK→transcript_analysis_log** | The run. |
| `patient_id` | varchar(255) | no | | Patient identifier. |
| `domain` | varchar(10) | no | | Domain: `cp`/`le`/`ed`/`inc`/`ius`. |
| `ai_score` | integer | yes | | Final 0–5 AI score for the domain. |
| `score_explanation` | text | yes | | Reasoning behind the score. |
| `extracted_estimate` | text | yes | | The final extracted numeric estimate. |
| `treatment` | text | yes | | Treatment this row pertains to (for treatment-branched domains). |
| `source_sentence` | text | yes | | The consultation sentence the AI chose as the source. |
| `source_context` | text | yes | | Context with `<main>` markers; the screen's "From your consultation". |
| `reformat_sentence` | text | yes | | The patient-friendly rewrite shown in the report. |
| `source_filename` | varchar(500) | yes | | Original file name (denormalized). |
| `created_at` | timestamptz | yes | | Insert time. |

## `patient_summary` — patient parent key · **anchor**
One row per patient. Holds only the identity; patient survey submissions FK to it.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `file` | varchar(255) | no | **PK** | The patient's file name (patient+doctor+date key). |
| `speaker` | varchar(100) | no | **PK** | The patient speaker label inside that file. |

---

# Group 2 — Behavior tracking (3 tables)
UI-interaction events (how the user navigated), not answer values. All three share
`session_id, file, speaker, event_type, metadata, device_type, client_timestamp, created_at`
plus per-area extras. `event_type` is CHECK-constrained to each area's vocabulary.

## `patient_report_page_behavior` — first-visit report page behavior
Events on the first-visit **report** page (reading AI summaries). Report-only.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `session_id` | varchar(100) | no | | One id per page mount; groups a visit's events. |
| `file` | varchar(255) | no | | Patient file. |
| `speaker` | varchar(100) | no | | Patient speaker. |
| `event_type` | varchar(30) | no | | Interaction type: `page_view`/`topic_open`/`topic_close`/`evidence_open`/`evidence_close`/`summary_open`/`summary_close`/`rating_click`/`slider_moved`/`answer_changed`/`domain_submitted`/`session_end` (CHECK). |
| `domain` | varchar(50) | yes | | Domain the event is about (`cp`/`le`/`ed`/`inc`/`ius`); required for topic/evidence/rating events. |
| `rating` | smallint | yes | | 1–5 rating (for `rating_click`; CHECK 1–5). |
| `metadata` | jsonb | no | | Free-form event details (timing, screen, etc.); default `{}`. |
| `device_type` | varchar(20) | yes | | `mobile`/`tablet`/`desktop`. |
| `client_timestamp` | timestamptz | no | | When the event happened on the client. |
| `created_at` | timestamptz | no | | Server insert time. |

## `patient_followup_survey_page_behavior` — survey page behavior
Events on the survey pages: follow-up (SDM/DCS/Risk/Satisfaction) **and** the first-visit Risk survey.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `session_id` | varchar(100) | no | | Session grouping id. |
| `file` | varchar(255) | no | | Patient file. |
| `speaker` | varchar(100) | no | | Patient speaker. |
| `event_type` | varchar(30) | no | | `page_view`/`survey_step_view`/`survey_answer`/`survey_complete`/`session_end` (+ the report-page vocabulary for the embedded Risk step); CHECK. |
| `survey_type` | varchar(30) | yes | | Which survey: `sdm`/`dcs`/`risk_perception`/`satisfaction` (CHECK). Required for `survey_answer`. |
| `question_id` | varchar(50) | yes | | Question the event refers to. Required for `survey_answer`. |
| `step_number` | smallint | yes | | Survey step index (only for `survey_step_view`). |
| `metadata` | jsonb | no | | Free-form details; default `{}`. |
| `device_type` | varchar(20) | yes | | Device type. |
| `client_timestamp` | timestamptz | no | | Client event time. |
| `created_at` | timestamptz | no | | Server insert time. |
| `domain` | varchar(50) | yes | | Domain (used by the embedded first-visit Risk step). |
| `rating` | smallint | yes | | Rating (used by the embedded Risk step). |

## `doctor_behavior` — doctor dashboard behavior
Events on the doctor consultation dashboard.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `session_id` | varchar(100) | no | | Session grouping id. |
| `file` | varchar(255) | yes | | Patient file (null on the dashboard list view). |
| `speaker` | varchar(100) | no | | Doctor identifier. |
| `event_type` | varchar(30) | no | | `page_view`/`view_change`/`patient_select`/`topic_select`/`sentence_select`/`rewrite_open`/`rewrite_input`/`rewrite_apply`/`rubric_open`/`rubric_close`/`rubric_score_lock`/`tour_open`/`tour_end`/`session_end` (CHECK). |
| `target_type` | varchar(20) | yes | | What the event targets: `patient`/`topic`/`sentence` (CHECK). |
| `target_id` | varchar(255) | yes | | Identifier of the target (patient/topic/sentence). |
| `metadata` | jsonb | no | | Free-form details; default `{}`. |
| `device_type` | varchar(20) | yes | | Device type. |
| `client_timestamp` | timestamptz | no | | Client event time. |
| `created_at` | timestamptz | no | | Server insert time. |

---

# Group 3 — Authentication (3 tables)

## `auth_user` — accounts
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment user id. |
| `username` | varchar(150) | no | | Login name. |
| `email` | varchar(255) | yes | **U** | Email (unique). |
| `password_hash` | varchar(255) | yes | | Hashed password (null for external auth providers). |
| `role` | varchar(20) | no | | `admin`/`user`/`readonly` (CHECK); default `user`. |
| `is_superuser` | boolean | no | | Superuser flag; default false. |
| `is_active` | boolean | no | | Whether the account is enabled; default true. |
| `auth_provider` | varchar(50) | no | | `local` or an external provider; default `local`. |
| `created_at` | timestamptz | yes | | Creation time. |
| `updated_at` | timestamptz | yes | | Last update time. |

## `auth_api_key` — API keys
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment key id. |
| `user_id` | integer | no | **FK→auth_user** | Owner (cascade delete). |
| `key_hash` | varchar(255) | no | | Hashed API key (raw key never stored); compared with `hmac.compare_digest`. |
| `label` | varchar(100) | yes | | Human label for the key. |
| `is_active` | boolean | no | | Whether the key is enabled; default true. |
| `created_at` | timestamptz | yes | | Creation time. |
| `expires_at` | timestamptz | yes | | Optional expiry. |
| `last_used_at` | timestamptz | yes | | Last time the key authenticated. |

## `patient_access` — per-user × per-patient ACL
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `user_id` | integer | no | **FK→auth_user, U** | The user granted access (cascade delete). |
| `patient_id` | varchar(255) | no | **U** | The patient they may access. Unique together with `user_id`. |
| `access_type` | varchar(20) | no | | `read`/`write`/`admin` (CHECK); default `read`. |
| `granted_at` | timestamptz | yes | | When access was granted. |
| `granted_by` | integer | yes | **FK→auth_user** | Which admin granted it. |

---

# Group 4 — Other (3 tables)

## `patient_survey_submission_log` — all patient survey answers
One row per submission. The single source of truth for **every** patient survey answer:
follow-up surveys (`sdm`/`dcs`/`satisfaction`) and the first-visit Risk cognition survey
(`risk_perception_2`). FK to `patient_summary`.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `file` | varchar(255) | no | **FK→patient_summary** | Patient file. |
| `speaker` | varchar(100) | no | **FK→patient_summary** | Patient speaker. |
| `survey_type` | varchar(50) | no | | `risk_perception_2` (first-visit Risk), `sdm`, `dcs`, `satisfaction`, … |
| `answers` | jsonb | no | | The submitted answers (shape depends on survey_type; risk_perception_2 nests domain→question_id). |
| `extra_data` | jsonb | yes | | Optional extra payload. |
| `submitted_at` | timestamptz | yes | | Submission time (default now()). |
| `redcap_synced` | boolean | yes | | Whether the row was pushed to REDCap; default false. |
| `redcap_record_id` | varchar(255) | yes | | REDCap-side record id after sync. |
| `redcap_error` | text | yes | | Last REDCap sync error (for retry), if any. |

## `session_recording` — consultation audio/replay chunks
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `id` | integer | no | **PK** | Auto-increment row id. |
| `session_id` | varchar(100) | no | | Recording session id. |
| `chunk_index` | integer | no | | Ordering index of this chunk; default 0. |
| `file` | varchar(255) | yes | | Patient file the recording belongs to. |
| `visit_type` | varchar(20) | yes | | Which visit produced it. |
| `recording_data` | bytea | yes | | The raw recorded bytes. |
| `event_count` | integer | no | | Number of captured events in the chunk; default 0. |
| `created_at` | timestamptz | yes | | Insert time. |
| `area` | varchar(40) | no | | Capture area: `patient_first`/`patient_first_report`/`patient_first_survey`/`patient_followup`/`doctor`/`physician`/`unknown` (CHECK). |

## `doctor_rewrite_log` — AI-assisted sentence rewrites
One row per rewrite. Composite PK `(file, i, i2, time)` keeps every revision as a separate audit row.

| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `file` | varchar(255) | no | **PK** | Patient file. |
| `i` | integer | no | **PK** | Utterance index of the sentence. |
| `i2` | integer | no | **PK** | In-utterance index of the sentence. |
| `time` | timestamptz | no | **PK** | Rewrite time — part of the PK so revisions don't overwrite each other. |
| `speaker` | varchar(100) | yes | | Speaker label of the sentence. |
| `original_sentence` | text | yes | | The sentence before the rewrite. |
| `revised_sentence` | text | yes | | The doctor's rewritten sentence. |
| `score` | double | yes | | Score associated with the rewrite. |
| `class` | varchar(100) | yes | | Domain/class of the sentence. |

---

# Group 5 — System (1 table)

## `alembic_version`
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| `version_num` | varchar(32) | no | **PK** | The migration revision the DB is currently at. Managed by Alembic, not the app. |

---

## Key indexes (beyond primary keys)
- Pipeline: `analysis_id` and `(patient_id, …)` indexes on the child tables for fast per-run / per-patient reads.
- Behavior: `(session_id)`, `(file, event/survey)`, `(client_timestamp)` on each behavior table.
- Surveys: `(file, submitted_at)`, `(survey_type)`, `(speaker)` on `patient_survey_submission_log`.
- Auth: `(user_id)`, `(key_hash)` on api keys; `(username)` on users; `(user_id)`, `(patient_id)` on access.

## See Also
- `ARCHITECTURE.md` — system overview · `DB_TABLES_ROLES.md` — the story of one file's journey ·
  `AI_PIPELINE_NLP_DB_TABLES.md` — pipeline→table mapping · `INDEX.md` — one-page overview.
- `app/Backend/models.py` — canonical SQLAlchemy definitions.
