# COMPASS Architecture Docs — Consolidated Overview (one page)

> A single at-a-glance index of every doc in `docs/architecture` + a current DB summary.
> Korean mirror: `INDEX_KR.md`. See each doc / `models.py` for detail. (Current schema: **16 app tables**
> + `alembic_version`, alembic head **028**.)

---

## 1. Docs in this folder (what each covers)
| Doc | Lang | What it explains |
|---|---|---|
| `DATABASE_SCHEMA.md` / `_KR` | EN/KR | **Table catalog** — each of the 16 tables: purpose · why it exists · the anchor (parent–child) pattern · migration history |
| `DB_TABLES_ROLES.md` / `_KR` | EN/KR | **One file's journey** — transcript→NLP→AI→screen, told as a story of which drawer (table) gets what at each step |
| `AI_PIPELINE_NLP_DB_TABLES.md` / `_KR` | EN/KR | **Pipeline detail** — NLP 7 steps · AI 5 steps → table-fill matrix · ERD · per-table detail |
| `SAME_PATIENT_DIFF_DOCTOR.md` / `_KR` | EN/KR | Why **same-patient/different-doctor** data never mixes (file = patient+doctor+date is the key) |
| `ARCHITECTURE.md` | EN | System overview · deployment · module layout |

---

## 2. Current DB — 16 app tables (by group)
### Pipeline persistence (7)
`transcript_analysis_log` (run header · anchor) · `sentence_prediction` (top-N sentences) · `nlp_all_predictions` (all sentences × 5 models) · `nlp_pipeline_intermediate` (NLP snapshots) · `llm_pipeline_intermediate` (AI intermediate) · `llm_domain_scoring_and_summary` (final, patient-facing) · `patient_summary` (patient parent anchor)

### Behavior tracking (3) — UI interaction events (not values)
`patient_report_page_behavior` (first-visit report page) · `patient_followup_survey_page_behavior` (survey pages: follow-up + first-visit Risk) · `doctor_behavior` (doctor dashboard)

### Auth (3)
`auth_user` · `auth_api_key` · `patient_access`

### Other (3)
`session_recording` · `patient_survey_submission_log` (**all patient survey answers** — first-visit Risk = risk_perception_2 + follow-up sdm/dcs/satisfaction) · `doctor_rewrite_log` (doctor sentence rewrites)

### System (1)
`alembic_version` (migration version)

---

## 3. Three core concepts
1. **Anchor (parent–child)**: `transcript_analysis_log` (id) and `patient_summary` (file, speaker) hold identity only; children FK to them → integrity · cascade · re-processing survival.
2. **Data flow**: file → NLP (sentences·probs ②③) → AI (scores·patient summaries ④⑤) → screens read ③⑤. Human input (surveys·rewrites) and behavior logs pile up separately.
3. **File = key**: records are distinguished by file (patient+doctor+date), not patient id → same-patient/different-doctor never mixes.

---

**One-liner:** all patient survey answers live in one place (`patient_survey_submission_log`), behavior logs in `*_page_behavior`/`doctor_behavior`, pipeline outputs under `transcript_analysis_log`'s children — 16 app tables total.
