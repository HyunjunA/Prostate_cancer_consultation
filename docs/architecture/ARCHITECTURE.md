# System Architecture

High-level architecture of the COMPASS. For pipeline-step detail see [`../ml-pipeline/ML_PIPELINE.md`](../ml-pipeline/ML_PIPELINE.md); for table-level detail see [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md).

---

## Deployment topology (native, recommended)

```
[Native — host (this repo)]                  [Docker — Phase 1 containers]
├── PostgreSQL 16    :5433  ───────────┐     └── prostatecancer-webapp-native :3001
├── Redis (brew)     :6379             │           (Next.js 13 webapp)
└── Backend FastAPI  :18000            │
    (uvicorn, native Python venv)      │     [Docker — Phase 2 only]
                                       │     └── prostatecancer-nlp-native    :8888
[Sibling AI repo — Phase 2 CLI]        │           (R + 5 RF classifiers, third-party image,
└── main_complete_pipeline_db.py       │            owned by the AI pipeline's compose file)
    (in ../AI_physician_patient_communication, run only
     when ingesting new transcripts)

Webapp (Docker)  ──host.docker.internal:18000─→  Backend (native)
Backend (native) ──localhost:5433────────────→   Postgres (native)
Pipeline CLI     ──localhost:5433────────────→   Postgres (native)
Pipeline CLI     ──localhost:8888 + docker exec→ NLP (Docker, Phase 2 only)
```

Three components are **independently restartable** (per the 2026-04-24 architecture review):
- DB lives outside any compose project → `docker compose down` never wipes data.
- Pipeline runs as CLI in the sibling AI repo → does not need uvicorn, and the NLP container only has to be up during a Phase 2 run.
- Dashboard (uvicorn + webapp) runs without the pipeline → reads what Phase 2 already wrote to DB; never calls the NLP container at request time.

---

## Repo layout

| Path | Contents |
|---|---|
| `app/Backend/` | FastAPI app, SQLAlchemy models, persistence modules, migrations |
| `app/Webapp/` | Next.js 13 frontend (App Router) |
| `scripts/` | `run-frontend-backend.sh`, `run-backend.sh`, `init-db-native.sh`, `setup-native-{mac,linux}.sh`, etc. (no in-repo pipeline runner — the Phase 2 entry point lives in the sibling AI repo) |
| `docs/` | This documentation |
| `dev_docs/` | Internal development notes (mostly Korean) |
| `meeting_notes/` | Meeting records (parent folder, project-wide) |
| `../AI_physician_patient_communication/` | Sibling repo: NLP + AI pipeline modules + reference data |

The Backend imports the AI repo via `sys.path` insertion — both repos must be cloned as siblings.

---

## Backend module map (`app/Backend/`)

| Module | Role |
|---|---|
| `main.py` | FastAPI app, middleware, CORS, lifespan |
| `db.py` | Async + sync engines, session factories |
| `models.py` | SQLAlchemy ORM (19 tables) |
| `persistence.py` | Persists NLP results to 6 tables in one transaction (`save_all`). Called cross-repo by the AI repo's Phase 2 pipeline |
| `routes_*.py` | API routes — patient, doctor, surveys, admin, system, track_* |
| `auth/` | API-key auth backend, password hashing |
| `core/` | Settings (typed env), structured logging |
| `migrations/versions/` | Alembic 001–010 |

---

## Request flow (consultation → dashboard)

```
[Phase 1 — read side, this repo's dashboard]

1. Webapp loads patient page
        │   → Next.js calls Backend at /api/patient/files, /api/patient/ai-summary, …
        │   → Backend reads from llm_domain_scoring_and_summary, patient_summary_domain
        │   → JSON returned, rendered as the patient-facing summary
        │
2. Patient submits survey
        │   → /api/surveys/* persists to survey_submission_log + behavior tables
        │   → optional REDCap sync (if REDCAP_API_TOKEN configured)
        │
3. Doctor uses Try & Score on the doctor dashboard
        │   → /api/doctor/score-sentence or /api/doctor/ai-rewrite
        │   → Backend imports ai_pipeline.llm cross-repo and calls Azure OpenAI
        │     directly (request-time, no DB write)
        │
[Phase 2 — write side, run from the sibling AI repo]

4. Transcript (.xlsx) drops into AI_repo/data/input/
        │
5. ../AI_physician_patient_communication/main_complete_pipeline_db.py picks it up
        │   → run_pipeline_for_file()
        │       ├─ NLP Steps 0-5  (sentence_classification + nlp container)
        │       ├─ AI  Steps 6-9  (ai_pipeline.pipeline, Azure OpenAI)
        │       └─ Step 10        db/persistence_helper.persist_pipeline_results()
        │              ├─ _save_nlp_results() → calls this repo's
        │              │   persistence.save_all() cross-repo → 6 NLP tables
        │              └─ _save_ai_results() → 2 LLM tables
        │                  + UPDATE transcript_analysis_log.processed = true
        │                  + UPDATE transcript_analysis_log.ai_overall_score
```

Doctor dashboard follows the same shape — reads from `llm_domain_scoring_and_summary` + `nlp_all_predictions`, writes to `doctor_behavior` + `doctor_rewrite_log`.

---

## Five clinical domains

| Code | Domain |
|---|---|
| `cp` | Cancer Prognosis |
| `le` | Life Expectancy |
| `ed` | Erectile Dysfunction / Potency |
| `inc` | Urinary Incontinence |
| `ius` | Irritative Urinary Symptoms / Frequency / Urgency / Nocturia |

Each domain has its own RF classifier (in NLP container) and its own LLM extraction prompt (in `ai_pipeline`).

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 13 App Router, React, TypeScript, Tailwind, shadcn/ui |
| Backend | FastAPI, SQLAlchemy (async + sync), Alembic, httpx |
| NLP | R `plumber` API, 5 Random Forest classifiers (third-party Docker image) |
| Sentence segmentation | R `stringi` 1.8.7 + ICU 74.2 (called via `docker exec`) |
| LLM | Azure OpenAI GPT-4o |
| DB | PostgreSQL 16 (native :5433) / 13 (Docker :5432) |
| Cache | Redis (rate limiting + caching, optional) |
| Auth | API-key + per-patient ACL |

---

## Environment configuration

All secrets in `app/Backend/.env` (or `.env` for Docker mode). Pipeline I/O paths default to the sibling AI repo:

```
DATABASE_URL=postgresql+asyncpg://prostatecancer_user:***@localhost:5433/prostatecancer_db_native
NLP_API_URL=http://localhost:8888
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=...
TRANSCRIPTS_DIR=../AI_physician_patient_communication/data/input
OUTPUT_DIR=../AI_physician_patient_communication/data/output
REDCAP_API_URL=https://iredcap.csmc.edu/api/   # optional
REDCAP_API_TOKEN=...                           # optional
```

`.env.example` ships the full template.

---

## See Also

- [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) — table-level detail
- [`../ml-pipeline/ML_PIPELINE.md`](../ml-pipeline/ML_PIPELINE.md) — pipeline step detail
- [`../setup/DEPLOYMENT_NATIVE.md`](../setup/DEPLOYMENT_NATIVE.md) — full deploy walkthrough
- [`../security/SECURITY_AUDIT.md`](../security/SECURITY_AUDIT.md) — known security posture
