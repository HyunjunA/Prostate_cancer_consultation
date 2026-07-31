# COMPASS

> **COM**munication of **P**rostate c**A**ncer **S**hared deci**S**ions

A research platform that analyzes physician-patient prostate cancer consultations to improve risk communication and shared decision-making.

Developed at Cedars-Sinai Medical Center as part of the R01 Prostate Cancer Communication Study.

---

## ⛔ NOT FOR PRODUCTION — RESEARCH & TESTING USE ONLY

> **THIS IS A RESEARCH PROTOTYPE, NOT A PRODUCTION-GRADE APPLICATION.**
>
> This software is built and maintained **solely for internal testing and academic research** within the R01 Prostate Cancer Communication Study at Cedars-Sinai Medical Center. It is provided **as-is, for evaluation purposes only.**
>
> **⛔ DO NOT deploy or use this software in any production, clinical, diagnostic, or patient-facing care setting — under any circumstances.**
>
> It has **not** undergone the security hardening, data-privacy review, clinical validation, or regulatory clearance (e.g., HIPAA, FDA, IRB-approved clinical deployment) that production or clinical use would require. All outputs — NLP probabilities, AI-generated summaries, risk-communication text, and scores — are **experimental and unvalidated**, and **MUST NOT be used to inform, guide, or replace any real clinical decision, diagnosis, treatment, or patient care.**
>
> Use is restricted to **authorized research-team members operating in a controlled, non-clinical test environment.** Any other use is unauthorized and at the user's sole risk.

---

## Native Deployment

> ⚠️ **All deployment instructions live in [`docs/setup/DEPLOYMENT_NATIVE.md`](docs/setup/DEPLOYMENT_NATIVE.md).** That document is the canonical, step-by-step procedure: full prerequisites (Docker Desktop, Git LFS, NLP image archive, Azure OpenAI credentials), per-step env-file edits for both repos, Phase 1 startup, Phase 2 pipeline invocation, and a troubleshooting table. **Always defer to that document.** Inline command snippets in older copies of this README, in screenshots, or in chat transcripts drift from reality and have misled deployers in the past — they have been removed from this README on purpose.

The deployment is split into two **independent phases** that mirror the real data flow:

```
Phase 1 — Dashboard & Database (infrastructure)  :  Browser ← Webapp ← Backend ← PostgreSQL DB
                                                                                  (no NLP container needed)
Phase 2 — Transcript Processing (NLP + AI → DB)  :  transcript → Pipeline → NLP Container → PostgreSQL DB
```

Phase 1 must come first: it stands up the infrastructure (PostgreSQL, Redis, the FastAPI backend, and the webapp container) that Phase 2 writes into. The dashboard's deployment artefacts (this repo) manage **Phase 1 only**. The **NLP classifier container is owned by the sibling AI pipeline repo** and is only required during Phase 2 — bundling it into the dashboard's startup would couple two unrelated lifecycles. The two repos must already be cloned as siblings before deployment begins.

---

## Documentation

All detailed documentation lives under [`docs/`](docs/).

| Area | Folder |
|---|---|
| Setup / deployment | [`docs/setup/`](docs/setup/) |
| Architecture, ERD, DB schema | [`docs/architecture/`](docs/architecture/) |
| Feature specs (patient, doctor, REDCap) | [`docs/features/`](docs/features/) |
| ML / NLP pipeline | [`docs/ml-pipeline/`](docs/ml-pipeline/) |
| Security & PHI compliance | [`docs/security/`](docs/security/) |
| Top-level index | [`docs/INDEX.md`](docs/INDEX.md) |

---

## Backend Code Map

The backend lives at [`app/Backend/`](app/Backend/). Each concern has its own file or directory — no monolithic god-files.

### API endpoints (`routes_*.py`)

| Router | URL prefix | Concern |
|---|---|---|
| [`routes_patient.py`](app/Backend/routes_patient.py) | `/api/patient/...` | Patient first-visit + follow-up read paths, V37 cognition response upsert |
| [`routes_doctor.py`](app/Backend/routes_doctor.py) | `/api/doctor/...` | Doctor dashboard reads, sentence rewrites, score trajectory |
| [`routes_surveys.py`](app/Backend/routes_surveys.py) | `/api/surveys/...` | SDM / DCS / Risk / Satisfaction submissions + REDCap sync |
| [`routes_admin_pipeline.py`](app/Backend/routes_admin_pipeline.py) | `/api/admin/...` | Pipeline DB-storage verification (HTTP mirror of `verify_pipeline_db.py`) |
| [`routes_system.py`](app/Backend/routes_system.py) | `/health`, `/ready` | Health checks (unauthenticated) |
| [`routes_track_patient_report.py`](app/Backend/routes_track_patient_report.py) | `/api/track/patient-report` | First-visit page behaviour events |
| [`routes_track_patient_followup.py`](app/Backend/routes_track_patient_followup.py) | `/api/track/patient-followup` | Follow-up survey behaviour events |
| [`routes_track_doctor.py`](app/Backend/routes_track_doctor.py) | `/api/track/doctor` | Doctor view behaviour events |
| [`routes_track_recordings.py`](app/Backend/routes_track_recordings.py) | `/api/track/recordings` | rrweb-style session recording chunks |

### Database

| File | Role |
|---|---|
| [`models.py`](app/Backend/models.py) | Single source of truth — all 19 SQLAlchemy ORM classes |
| [`db.py`](app/Backend/db.py) | Async + sync engines, `get_db()` dependency |
| [`persistence.py`](app/Backend/persistence.py) | NLP pipeline → 5 tables in one transaction (`save_all`) |
| [`init_db.py`](app/Backend/init_db.py) | Schema bootstrap (used by Docker entrypoint) |
| [`inspect_pipeline_run.py`](app/Backend/inspect_pipeline_run.py) | CLI: dump pipeline outputs for one analysis |
| [`migrations/versions/`](app/Backend/migrations/versions/) | Alembic 001–015 (15 migrations, all reversible) |

#### Inspecting the database with DBeaver

For a visual look at the live data — e.g. the `llm_domain_scoring_and_summary`
rows behind the patient first-visit summaries — connect with
[DBeaver](https://dbeaver.io/) (free, cross-platform). Create a new
**PostgreSQL** connection:

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5433` |
| Database | `prostatecancer_db_native` |
| Username | `prostatecancer_user` |
| Password | from `app/Backend/.env` (`DATABASE_URL`) — never commit it |

Then expand **Tables** and browse e.g. `transcript_analysis_log`,
`sentence_prediction`, `llm_domain_scoring_and_summary`, or run SQL such as:

```sql
SELECT domain, treatment, ai_score, reformat_sentence
FROM llm_domain_scoring_and_summary
WHERE patient_id = 'SID_21'
ORDER BY domain;
```

Native mode binds PostgreSQL to `127.0.0.1:5433` (localhost only), so DBeaver
must run on the same machine as the database. The CLI alternative is
[`inspect_pipeline_run.py`](app/Backend/inspect_pipeline_run.py) above.

### Pipeline write-side — DB persistence only

NLP/AI pipeline orchestration lives in the AI repo's
`main_complete_pipeline_db.py`. The dashboard owns the **NLP-side**
of the DB-write surface:

| File | Role |
|---|---|
| [`persistence.py`](app/Backend/persistence.py) | `save_all()` writes the NLP-side rows (5 tables) in one transaction — called cross-repo by the AI repo's pipeline entry point |
| [`models.py`](app/Backend/models.py) | SQLAlchemy ORM definitions for every pipeline table — the schema source of truth |

The **AI/LLM-side** writes (2 tables: `llm_pipeline_intermediate`,
`llm_domain_scoring_and_summary`, plus the
`transcript_analysis_log.processed=True` update) live in the AI
repo's `db/persistence_helper.py` (`_save_ai_results` helper, called
from `main_complete_pipeline_db.py`).

### App lifecycle and configuration

| File | Role |
|---|---|
| [`main.py`](app/Backend/main.py) | FastAPI app factory, middleware, router mounting |
| [`app_lifespan.py`](app/Backend/app_lifespan.py) | Startup / shutdown hooks (`init_db`, redis) |
| [`core/settings.py`](app/Backend/core/settings.py) | pydantic-settings (env vars → typed `Settings`) |
| [`core/logging.py`](app/Backend/core/logging.py) | structlog configuration |

### External integrations

| File | Role |
|---|---|
| [`redcap_config.py`](app/Backend/redcap_config.py) | REDCap URL / token / enabled (re-export from settings) |
| [`redis_client.py`](app/Backend/redis_client.py) | Redis cache + rate-limit client |

### Authentication (currently inactive)

The `auth/` module is wired in but the login feature was dropped on 2026-05-07; tables are empty and route guards no-op via superuser bypass. Cleanup is tracked in the Roadmap above.

| File | Role |
|---|---|
| [`auth/models.py`](app/Backend/auth/models.py) | `AuthUser`, `AuthAPIKey`, `PatientAccess` ORM |
| [`auth/access_control.py`](app/Backend/auth/access_control.py) | Per-patient ACL check (`check_patient_access`) |
| [`auth/admin_routes.py`](app/Backend/auth/admin_routes.py) | User / API key / access management endpoints |

### Tests

| Folder | Coverage |
|---|---|
| [`tests/db_models/`](app/Backend/tests/db_models/) | ORM unit tests for every class |
| [`tests/integration/`](app/Backend/tests/integration/) | End-to-end DB + route paths |
| [`tests/factories.py`](app/Backend/tests/factories.py) | `TestDataFactory` for seeding |

`pytest --collect-only` reports **562 tests**. Default run for local dev: `pytest -m "not e2e"` (skips load + e2e specs).

**The suite needs a PostgreSQL** — the same engine production runs on. Point it at one with `TEST_DATABASE_URL`; the default is a `prostatecancer_test` database beside the app's own, created on first run. The database name must end in `_test` or the suite refuses to start, so a stray run cannot write into live data. Each test runs in a transaction that is rolled back, so the schema is created once per session and every test still starts from an empty database.

It used to run on in-memory SQLite, which needed no database but silently ignored foreign keys and column lengths — routes using PostgreSQL-only SQL could not be tested at all, and a green run did not prove production behaviour.

---

## Roadmap

Active development is tracked here at a high level. Detailed plans, audits, and historical decisions live under [`dev_docs/`](dev_docs/); ongoing daily work logs are in [`daily_control_logs/`](daily_control_logs/).

### Just shipped (May 2026)

- **NLP container decoupled from dashboard deployment** — `nlp-classifiers` removed from `docker-compose-frontend.yml`; its lifecycle now lives with the pipeline command (Phase 2 only) in the AI repo. `run-frontend-backend.sh` shrank to webapp + backend (Phase 1 only) so the dashboard never touches the NLP container at request time.
- **Env config split + `.env.native` → `.env` rename** — Phase 2 reads its runtime config from the AI repo's own `.env`; the dashboard's `.env` keeps only what Phase 1 actually consumes. `DATABASE_URL` and `AZURE_OPENAI_*` are duplicated by design (each side owns its copy). The legacy `.env.native` filename was retired across all 27 scripts/tests/docs in favour of plain `.env`.
- **`/health` no longer probes NLP** — the dashboard backend's liveness probe reports only the components it actually depends on (DB + Redis). NLP health is no longer exposed by the dashboard at all — callers that need it should hit the NLP container directly (the AI repo's pipeline runner manages the container lifecycle).
- **V37 first-visit page** — slider state initialised at the slider's visible default so untouched sliders persist their displayed value (silent NULL bug fixed); per-section required-answer popup blocks Submit when the timeline radio is unanswered.
- **Follow-up survey popups** — Next/Submit click on an unanswered question now opens a clear inline modal across all four sections (SDM / DCS / Risk Perception / Satisfaction). Duplicate inner section headers removed for a single source of truth.
- **Three-patient deterministic end-to-end coverage** — Playwright walks every seeded patient (SID 10/14/15) in fixed order with backend round-trip assertions per patient.
- **Repository hygiene** — redundant `AI_physician_patient_communication` submodule unregistered in favour of the sibling clone (scripts already pointed at the sibling); the COMPASS title rendered consistently in uppercase across all four pages.
- **19-table DB audit** — full schema review with strengths/weaknesses, redundancy mapping, and a nine-item refactoring roadmap. See [`dev_docs/DB_SCHEMA_CLEANUP_TODO.md`](dev_docs/DB_SCHEMA_CLEANUP_TODO.md).

### Now (this sprint)

- **Drop `llm_pipeline_intermediate.sentence_text`** — fully derivable from `context` (regex-strip `<main>` markers, 100% redundant across all rows). Plan and impact map in [`dev_docs/SCHEMA_CLEANUP_LPI_SENTENCE_TEXT.md`](dev_docs/SCHEMA_CLEANUP_LPI_SENTENCE_TEXT.md).
- **Manual smoke test** — verify the recent UI changes against the three patient fixtures end-to-end.
- **REDCap mirror verification** — confirm follow-up survey submissions reach the active REDCap project with the correct field-level mapping.

### Next (this month)

- **Resolve authentication limbo** — the login feature was dropped on 2026-05-07; finish removing the unused `auth_user / auth_api_key / patient_access` tables and the route-level `check_patient_access()` guards that currently no-op via superuser bypass.
- **Audit and drop suspected dead columns** — `transcript_analysis_log.model_results`, and the half-implemented `llm_pipeline_intermediate.step` enum.
- **Column-level docstrings** — add SQLAlchemy `Column(..., comment=...)` on non-obvious schema columns so PostgreSQL inspection tools surface the meaning automatically.
- **Integrate the AI scoring + reformat pipeline** into the backend (existing P0-A in [`dev_docs/TODO.md`](dev_docs/TODO.md)).

### Later (Q2 onward)

- **Cleanup denormalised columns on `llm_domain_scoring_and_summary`** — five `source_*` / `extracted_*` / `score_explanation` columns are copies of fields already on `llm_pipeline_intermediate` for the row that survived filtering.
- **Consolidate three behaviour-tracking tables** into a single `behavior_tracking` table with an `area` enum. Phase the migration through dual-write → reader cutover → drop.
- **Unify the patient identifier scheme** — pipeline tables key on a free-form `patient_id` string while response tables key on a `(file, speaker)` composite; resolve the inconsistency.
- **Move large BLOBs** (`transcript_analysis_log.xlsx_data`, `session_recording.recording_data`) from PostgreSQL `bytea` to object storage. Hard deadline: before the patient count reaches 50 (backup/replication grows linearly with blob size).

This roadmap is a database refactoring effort following Ambler & Sadalage's evolutionary database design — every change preserves functional behaviour while improving schema integrity, and ships behind a reversible Alembic migration plus automated and manual regression tests.

---

## License

Part of an active research study at Cedars-Sinai Medical Center. Contact the research team for access and usage terms.
