# Native Deployment Guide

End-to-end instructions for deploying the project with **only two Docker
containers** (NLP-classifiers + frontend webapp). Everything else
(PostgreSQL, Redis, Backend FastAPI, AI Pipeline, R + stringi) runs as
native processes on the host.

The existing Docker mode (`docker compose up -d`) keeps working
unchanged — see [`DEPLOYMENT_MODES.md`](DEPLOYMENT_MODES.md).

---

## Prerequisites

| Item | Source |
|---|---|
| macOS 12+ or Ubuntu/Debian 20+ | OS |
| Homebrew (Mac) or apt (Linux) | https://brew.sh |
| Docker Desktop | https://docker.com (only for NLP + webapp containers) |
| Source code (this repo) | `git clone` |
| **NLP OCI archive** | from the external NLP team — `nlp-classifiers/r01-nlp-classifiers-docker-image/` |
| **Azure OpenAI key + endpoint** | your organisation's Azure account |
| 8 GB RAM, 15 GB disk | host hardware |

---

## One-time setup

### 1. Install native dependencies (~25 min on first run, ~10 min of which is R compile)

**macOS:**
```bash
bash scripts/setup-native-mac.sh
```

**Linux (Ubuntu/Debian):**
```bash
sudo bash scripts/setup-native-linux.sh
```

This installs and starts:
- PostgreSQL 16 (port 5432)
- Redis (port 6379)
- R 4.x with `stringi 1.8.4` compiled against ICU 74.1 (matches the
  reference pipeline exactly)
- Python 3.10 + `.venv/` with the backend's full requirements (rpy2 included)

### 2. Configure environment

```bash
cp app/Backend/.env.native.example app/Backend/.env.native
```

Edit `app/Backend/.env.native` and set at minimum:

```env
POSTGRES_PASSWORD=<choose>
DATABASE_URL=postgresql+asyncpg://postgres:<above>@localhost:5432/prostate_native
DATABASE_URL_SYNC=postgresql+psycopg2://postgres:<above>@localhost:5432/prostate_native

API_KEY=<openssl rand -hex 32>

# Required for the AI sub-pipeline:
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_KEY=<your key>
```

The same file should also have `app/Webapp/.env.native` (already created
on first run; copy from `.example` if missing).

### 3. Bootstrap the database

```bash
bash scripts/init-db-native.sh
```

This creates the role + database, sets the password from `.env.native`,
and runs `alembic upgrade head` (all 7 migrations 001–007). Verifies
that the 18 expected tables are present.

### 4. (Optional) Sanity check

```bash
bash scripts/check-deps.sh         # binaries, services, R/ICU, venv
bash scripts/check-connections.sh  # postgres, redis, NLP, Azure OpenAI
```

Both exit 0 on full pass.

---

## Daily use

### Start everything
```bash
bash scripts/run-native.sh
```

This:
1. Brings up `nlp-classifiers` + `webapp` via `docker-compose-minimal.yml`
2. Waits for NLP healthcheck
3. Runs the preflight (R/ICU, postgres auth, alembic head, redis ping)
4. Starts uvicorn against `main:app` on `0.0.0.0:8000` (foreground)

Open:
- Dashboard: http://localhost:3001
- API docs:  http://localhost:8000/docs

Stop with `Ctrl-C` (backend) and `docker compose -f docker-compose-minimal.yml down` (containers).

### Run the standalone pipeline (★ manager's primary requirement)

```bash
source .venv/bin/activate
python scripts/run-pipeline-standalone.py --file data/transcripts/SID_10.xlsx
```

The script prints every database INSERT with a `[DB]` prefix so the
manager can watch each table grow:

```
[DB]    INSERT transcript_analysis_log → id=5
[DB]    INSERT sentence_prediction: 50 rows
[DB]    INSERT nlp_all_predictions: 428 rows
[DB]    INSERT nlp_pipeline_intermediate: 4 JSONB rows
[AI]    AI pipeline: scoring + extraction + filtering + selection + reformat
[DB]    INSERT llm_pipeline_intermediate: 50 rows
[DB]    INSERT llm_domain_scoring_and_summary: 6 rows
[DB]    UPDATE transcript_analysis_log id=5: ai_overall_score=2.14, processed=true
```

Useful flags:
- `--skip-ai` — NLP only (no Azure OpenAI calls)
- `--top-n 10 --context-window 3` — pipeline tuning
- `--quiet` — only stage headers, hide chatty INFO logs

### Verify the DB

```bash
python scripts/verify_db.py                   # all analyses
python scripts/verify_db.py --analysis-id 5   # one analysis
python scripts/verify_db.py --json            # machine-readable
```

Exit code 0 = all 7 checks pass per analysis. Exit 1 on any failure.

### Inspect a specific analysis

```bash
python scripts/show.py --analysis-id 5
python scripts/show.py --patient-id SID_10
```

Dumps every NLP + AI stage with sample rows.

---

## Stopping / switching modes

```bash
# Stop native mode
Ctrl-C                                                  # backend
docker compose -f docker-compose-minimal.yml down       # NLP + webapp

# Switch to Docker mode
bash scripts/run-docker.sh up                            # full Docker stack
```

The two modes use **different Postgres ports** (native 5432 vs Docker
5433) so the data does not overlap. Other ports (8000 backend, 3001
webapp, 6379 redis) collide — bring up only one mode at a time.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `setup-native-mac.sh` fails on R compile | Xcode CLT missing | `xcode-select --install` |
| `init-db-native.sh`: peer auth fails | Mac postgres uses OS user as superuser | Script auto-detects; if it still fails, run `createdb $(whoami)` first |
| `init-db-native.sh`: CHANGE_ME error | placeholder still in `.env.native` | edit `POSTGRES_PASSWORD` |
| Backend starts but `/health` says nlp=unhealthy | NLP Docker not running | `docker compose -f docker-compose-minimal.yml up -d` |
| Webapp loads but API calls fail | webapp env still points to Docker backend | confirm `app/Webapp/.env.native` is `host.docker.internal:8000` |
| `rpy2` ImportError | `R_HOME` not set | `export R_HOME=$(R RHOME)` (`run-backend-native.sh` sets it automatically) |
| Pipeline standalone: `pred_*` columns NULL | Bug 1 regression — should be impossible after migration 006 + the persistence.py fix | open an issue with the offending analysis_id |

---

## Architecture summary

```
[Native — Mac/Linux host]
├─ postgresql@16     :5432
├─ redis             :6379
├─ Backend FastAPI   :8000  (uvicorn via run-backend-native.sh)
├─ AI Pipeline       (CLI via run-pipeline-standalone.py)
└─ R + stringi 1.8.4 (ICU 74.1, native)

[Docker — only 2]
├─ nlp-classifiers   :8001  (Michael's image, unavoidable)
└─ webapp            :3001  (Next.js, frontend kept Docker)

Webapp(Docker) ──host.docker.internal:8000──→ Backend(native)
Backend(native) ──localhost:8001──────────────→ NLP(Docker)
Backend(native) ──localhost:5432──────────────→ Postgres(native)
Pipeline(native) ──localhost:5432─────────────→ Postgres(native)
Pipeline(native) ──localhost:8001─────────────→ NLP(Docker)
```

See [`DEPLOYMENT_NATIVE_PLAN.md`](DEPLOYMENT_NATIVE_PLAN.md) for the
phased plan, [`DEPLOYMENT_MODES.md`](DEPLOYMENT_MODES.md) for choosing
between Docker and Native, and
[`PIPELINE_DB_FLOW.md`](PIPELINE_DB_FLOW.md) for the per-stage data
flow into PostgreSQL.
