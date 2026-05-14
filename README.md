# COMPASS

> **COM**munication of **P**rostate c**A**ncer **S**hared deci**S**ions

A research platform that analyzes physician-patient prostate cancer consultations to improve risk communication and shared decision-making.

Developed at Cedars-Sinai Medical Center as part of the R01 Prostate Cancer Communication Study.

---

## Quick Start — Native Deployment (recommended)

The deployment is split into two **independent phases** that mirror the real data flow:

```
Phase A   :  transcript → Pipeline → NLP Container → PostgreSQL DB
Phase B   :  Browser ← Webapp ← Backend ← PostgreSQL DB
                                              (no NLP container needed)
```

The dashboard's deployment artefacts (this repo) manage **Phase B only**: PostgreSQL, Redis, the FastAPI backend, and the webapp container. The **NLP classifier container is owned by the sibling AI pipeline repo** and is only required during Phase A — bundling it into the dashboard's startup would couple two unrelated lifecycles. (The two repos must already be cloned as siblings; see [`docs/setup/DEPLOYMENT_NATIVE.md`](docs/setup/DEPLOYMENT_NATIVE.md) for the clone commands.)

### One-time setup

Run these once on a fresh machine.

```bash
# 1. Install native dependencies (Postgres 16, Redis, R, Python venv, Node)
bash scripts/setup-native-mac.sh

# 2. Copy the .env templates
cp app/Backend/.env.example app/Backend/.env
cp app/Webapp/.env.example  app/Webapp/.env

# 3. Edit app/Backend/.env and fill in at least:
#      POSTGRES_PASSWORD, API_KEY, AZURE_OPENAI_API_KEY
#    REDCAP_API_TOKEN is optional (without it, REDCap mirroring is skipped silently)
nano app/Backend/.env

# 4. Bootstrap the database (Postgres user + schema + alembic upgrade head)
bash scripts/init-db-native.sh
```

### Phase A — Process transcripts (run from the AI repo)

Runs the NLP + AI pipelines on consultation `.xlsx` transcripts and persists the results to PostgreSQL. The NLP Docker container is required **only during this phase** — its lifecycle is owned by the pipeline command (in the AI repo), not by the dashboard.

```bash
# 5. Switch to the sibling AI repo and drop transcripts into its input dir
cd ../AI_physician_patient_communication
mkdir -p data/input
cp <your-transcript>.xlsx data/input/

# 6. Run the pipeline — manages the NLP container lifecycle itself
../Prostate_cancer_consultation_dashboard/.venv/bin/python \
    main_complete_pipeline_db.py --dir data/input
```

The pipeline entry point lives at the AI repo's root (`main_complete_pipeline_db.py`) alongside `docker-compose-ai-nlp-pipeline.yml` for the NLP container — both are write-time concerns of the AI/NLP pipeline. It depends on this dashboard repo as a sibling clone for the persistence layer (DB models + `core/settings.get_settings()` for the database URL) and reuses the dashboard's Python venv.

After Phase A finishes, the NLP container can be left running for repeat runs (default) or stopped explicitly with `--stop-nlp-after`. Phase B proceeds against the persisted DB rows regardless.

### Phase B — Run the dashboard (NLP container NOT needed)

Serves the pre-computed Phase A results to doctors and patients. The dashboard backend reads from PostgreSQL only; it never calls the NLP container at request time.

```bash
# 7. Back in this repo — start the dashboard (webapp container + native FastAPI backend)
cd ../Prostate_cancer_consultation_dashboard
bash scripts/run-frontend-backend.sh

# 8. Verify in the browser
#    http://localhost:3001       — Dashboard
#    http://localhost:8000/docs  — API docs (Swagger)
```

`run-frontend-backend.sh` is deliberately narrow: it boots the webapp container and the native backend without touching the NLP container, so a missing or broken NLP image (e.g., a platform mismatch on a teammate's machine) does not block dashboard usage when Phase A has already populated the database.

**Full walkthrough**: [`docs/setup/DEPLOYMENT_NATIVE.md`](docs/setup/DEPLOYMENT_NATIVE.md) — covers prerequisites, the NLP OCI archive, the standalone pipeline runner, DB verification helpers, and troubleshooting.

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
| [`routes_admin_pipeline.py`](app/Backend/routes_admin_pipeline.py) | `/api/admin/...` | Manual pipeline operations |
| [`routes_system.py`](app/Backend/routes_system.py) | `/health`, `/ready` | Health checks (unauthenticated) |
| [`routes_track_patient_first.py`](app/Backend/routes_track_patient_first.py) | `/api/track/patient-first` | First-visit page behaviour events |
| [`routes_track_patient_followup.py`](app/Backend/routes_track_patient_followup.py) | `/api/track/patient-followup` | Follow-up survey behaviour events |
| [`routes_track_doctor.py`](app/Backend/routes_track_doctor.py) | `/api/track/doctor` | Doctor view behaviour events |
| [`routes_track_recordings.py`](app/Backend/routes_track_recordings.py) | `/api/track/recordings` | rrweb-style session recording chunks |

### Database

| File | Role |
|---|---|
| [`models.py`](app/Backend/models.py) | Single source of truth — all 19 SQLAlchemy ORM classes |
| [`db.py`](app/Backend/db.py) | Async + sync engines, `get_db()` dependency |
| [`persistence.py`](app/Backend/persistence.py) | NLP pipeline → 6 tables in one transaction (`save_all`) |
| [`init_db.py`](app/Backend/init_db.py) | Schema bootstrap (used by Docker entrypoint) |
| [`inspect_pipeline_run.py`](app/Backend/inspect_pipeline_run.py) | CLI: dump pipeline outputs for one analysis |
| [`migrations/versions/`](app/Backend/migrations/versions/) | Alembic 001–010 (10 migrations, all reversible) |

### Pipeline write-side — DB persistence only

The dashboard backend no longer orchestrates the NLP/AI pipeline; that
moved to the AI repo's `main_complete_pipeline_db.py`. The dashboard
just owns the **NLP-side** of the DB-write surface:

| File | Role |
|---|---|
| [`persistence.py`](app/Backend/persistence.py) | `save_all()` writes the NLP-side rows (6 tables) in one transaction — called cross-repo by the AI repo's pipeline entry point |
| [`models.py`](app/Backend/models.py) | SQLAlchemy ORM definitions for every pipeline table — the schema source of truth |

The **AI/LLM-side** writes (2 tables: `llm_pipeline_intermediate`,
`llm_domain_scoring_and_summary`, plus the
`transcript_analysis_log.processed=True` update) now live in the AI
repo's `main_complete_pipeline_db.py` (`_save_ai_to_db` helper). The
previous in-dashboard implementation (`pipeline_runner.py`,
`ai_pipeline_service.py`, `nlp_classifier_client.py`,
`sentence_classification_loader.py`, `routes_transcript.py`,
`routes_nlp.py`) has been moved to
`app/Backend/archive/decoupled_pipeline_2026-05/` — kept for reference
but no longer wired into the running app.

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

`pytest --collect-only` reports **630 tests**. Default run for local dev: `pytest -m "not e2e"` (skips load + e2e specs).

---

## Roadmap

Active development is tracked here at a high level. Detailed plans, audits, and historical decisions live under [`dev_docs/`](dev_docs/); ongoing daily work logs are in [`daily_control_logs/`](daily_control_logs/).

### Just shipped (May 2026)

- **NLP container decoupled from dashboard deployment** — `nlp-classifiers` removed from `docker-compose-frontend.yml`; its lifecycle now lives with the pipeline command (Phase A only) in the AI repo. `run-frontend-backend.sh` shrank to webapp + backend (Phase B only) so the dashboard never touches the NLP container at request time.
- **Env config split + `.env.native` → `.env` rename** — Phase A reads its runtime config from the AI repo's own `.env`; the dashboard's `.env` keeps only what Phase B actually consumes. `DATABASE_URL` and `AZURE_OPENAI_*` are duplicated by design (each side owns its copy). The legacy `.env.native` filename was retired across all 27 scripts/tests/docs in favour of plain `.env`.
- **`/health` no longer probes NLP** — the dashboard backend's liveness probe reports only the components it actually depends on (DB + Redis); NLP is owned by Phase A and exposed separately at `/api/nlp/health` for callers that need it.
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
- **Audit and drop suspected dead columns** — `patient_summary_domain.patient_scoring / patient_response`, `transcript_analysis_log.model_results`, and the half-implemented `llm_pipeline_intermediate.step` enum.
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
