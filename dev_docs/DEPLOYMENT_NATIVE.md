# Native Deployment Guide

End-to-end instructions for deploying the project with **only two Docker
containers** (NLP-classifiers + frontend webapp). Everything else
(PostgreSQL, Redis, Backend FastAPI, AI Pipeline) runs as native
processes on the host.

The existing Docker mode (`docker compose up -d`) keeps working
unchanged — see [`DEPLOYMENT_MODES.md`](DEPLOYMENT_MODES.md).

---

## Prerequisites

| Item | Source |
|---|---|
| macOS 12+ or Ubuntu/Debian 20+ | OS |
| Homebrew (Mac) or apt (Linux) | https://brew.sh |
| Docker Desktop | https://docker.com (only for NLP + webapp containers) |
| Source code (this repo + sibling `AI_physician_patient_communication`) | `git clone` |
| **NLP OCI archive** | from the external NLP team — `nlp-classifiers/r01-nlp-classifiers-docker-image/` (kept inside the AI repo, gitignored) |
| **Azure OpenAI key + endpoint** | your organisation's Azure account (skip with `--skip-ai` for NLP-only runs) |
| 8 GB RAM, 15 GB disk | host hardware |

> **Layout assumed**: both repos cloned under the same parent directory
> as siblings:
> ```
> <parent>/
> ├─ Prostate_cancer_consultation_dashboard/
> └─ AI_physician_patient_communication/
> ```

---

## One-time setup

### 1. Install native dependencies (~3 min)

**macOS:**
```bash
bash scripts/setup-native-mac.sh
```

**Linux (Ubuntu/Debian):**
```bash
sudo bash scripts/setup-native-linux.sh
```

Installs and starts:
- PostgreSQL 16 (default port 5432; this project uses **5433** to avoid
  collisions with EDB-style installations)
- Redis (port 6379)
- Python 3.10 + `.venv/` with the backend's full requirements

**Note:** R/`stringi` is **not** installed natively. Sentence segmentation
calls `stringi` inside the NLP-classifiers Docker container via
`docker exec`, which gives a 100% match with the reference pipeline
(R 4.5.1 + stringi 1.8.7 + ICU 74.2).

### 2. Configure environment

```bash
cp app/Backend/.env.native.example app/Backend/.env.native
cp app/Webapp/.env.native.example  app/Webapp/.env.native
```

Edit `app/Backend/.env.native` and set at minimum:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=prostatecancer_user
POSTGRES_PASSWORD=<openssl rand -hex 16>
POSTGRES_DB=prostatecancer_db_native
DATABASE_URL=postgresql+asyncpg://prostatecancer_user:<above>@localhost:5433/prostatecancer_db_native
DATABASE_URL_SYNC=postgresql+psycopg2://prostatecancer_user:<above>@localhost:5433/prostatecancer_db_native

# NLP container is bound to 8888 in docker-compose-minimal.yml
NLP_API_URL=http://localhost:8888

API_KEY=<openssl rand -hex 32>

# Required for the AI sub-pipeline (omit / use --skip-ai for NLP only):
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_KEY=<your key>

# Pipeline I/O — relative paths, resolved against this repo's root by
# config.py. Defaults point to the sibling AI repo so a fresh clone
# needs no editing.
TRANSCRIPTS_DIR=../AI_physician_patient_communication/data/input
OUTPUT_DIR=../AI_physician_patient_communication/data/output

# CORS — single-quote the JSON so `set -a; source` does not strip it
CORS_ORIGINS='["http://localhost:3001","http://127.0.0.1:3001","http://host.docker.internal:3001"]'
```

`app/Webapp/.env.native` defaults are usable as-is
(`NEXT_PUBLIC_API_URL=http://host.docker.internal:8000`).

### 3. Bootstrap the database

```bash
bash scripts/init-db-native.sh
```

Creates the role + database, applies `app/Backend/database_schema.sql`,
then runs `alembic upgrade head` (migrations 001–007). Verifies the 18
expected tables are present.

### 4. (Optional) Sanity check

```bash
bash scripts/check-deps.sh         # binaries, services, venv
bash scripts/check-connections.sh  # postgres, redis, NLP, Azure OpenAI
```

Both exit 0 on full pass.

---

## Daily use

### Start everything

```bash
# If your NLP OCI archive is not at the default sibling path, point to it:
export NLP_IMAGE_DIR=/abs/path/to/r01-nlp-classifiers-docker-image

bash scripts/run-native.sh
```

This:
1. Loads the NLP image into the local Docker daemon (skipped if already
   present)
2. Brings up `nlp-classifiers` + `webapp` via `docker-compose-minimal.yml`
3. Waits for NLP healthcheck
4. Runs the preflight (postgres auth, NLP container `docker exec`
   stringi probe, alembic head, redis ping)
5. Starts uvicorn against `main:app` on `0.0.0.0:8000` (foreground)

Open:
- Dashboard: http://localhost:3001
- API docs:  http://localhost:8000/docs

Stop with `Ctrl-C` (backend) and `docker compose -f docker-compose-minimal.yml down`
(containers).

### Run the standalone pipeline (★ manager's primary requirement)

Single transcript:

```bash
.venv/bin/python scripts/run-pipeline-standalone.py \
    --file "../AI_physician_patient_communication/data/input/Input_Keystrokes REC 001 (SID 10).xlsx"
```

Whole folder (every `.xlsx`/`.csv` inside, processed in sorted order):

```bash
.venv/bin/python scripts/run-pipeline-standalone.py \
    --dir ../AI_physician_patient_communication/data/input
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

NLP step0–step5 intermediate xlsx/csv files land under
`OUTPUT_DIR/<source_filename>/` — by default
`AI_physician_patient_communication/data/output/Input_Keystrokes REC 001 (SID 10)/...`.

Useful flags:
- `--skip-ai` — run **only** the NLP 7-step pipeline; skip the
  Azure OpenAI 5-substep AI pipeline. No Azure key needed, no token
  cost, ~30s/file instead of ~2–3 min/file. DB still gets all NLP
  rows; AI rows (`ai_overall_score`, `llm_*`, `patient_summary`)
  are not written.
- `--top-n 10 --context-window 3` — pipeline tuning
- `--quiet` — only stage headers, hide chatty INFO logs

### Verify the DB

```bash
.venv/bin/python scripts/verify_db.py                   # all analyses
.venv/bin/python scripts/verify_db.py --analysis-id 5   # one analysis
.venv/bin/python scripts/verify_db.py --json            # machine-readable
```

Exit code 0 = all 7 checks pass per analysis. Exit 1 on any failure.

### Inspect a specific analysis

```bash
.venv/bin/python scripts/show.py --analysis-id 5
.venv/bin/python scripts/show.py --patient-id SID_10
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

Native and Docker modes use **different Postgres ports** (native 5433
vs Docker 5432) so the data does not overlap. Other ports
(8000 backend, 3001 webapp, 6379 redis) collide — bring up only one
mode at a time.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `setup-native-mac.sh` fails on `Bootstrap failed: 5: Input/output error` for postgres or redis | Stale launchd service slot from a previous failed bootstrap | `launchctl bootout gui/$(id -u)/homebrew.mxcl.<service>; rm ~/Library/LaunchAgents/homebrew.mxcl.<service>.plist`, then re-run setup |
| Redis fails to bind :6379 | Some VS Code / Cursor extension is squatting on :6379 | `lsof -nP -iTCP:6379 -sTCP:LISTEN` to find the PID, `kill <pid>`, redis will pick up the port on next bootstrap |
| `init-db-native.sh`: peer auth fails | Mac postgres uses OS user as superuser | Script auto-detects; if it still fails, run `createdb $(whoami)` first |
| `init-db-native.sh`: CHANGE_ME error | placeholder still in `.env.native` | edit `POSTGRES_PASSWORD` |
| Backend starts but `/health` says nlp=unhealthy | NLP Docker not running | `docker compose -f docker-compose-minimal.yml up -d` |
| Webapp loads but UI shows "No patients found" | webapp container booted with empty `API_KEY` (compose interpolated `${API_KEY}` to empty) | confirm `.env.native` is sourced before `docker compose up`; `run-native.sh` does this automatically |
| Standalone script: `No module named 'greenlet'` | sqlalchemy async lazy-imports greenlet | `.venv/bin/pip install greenlet` (already pinned in requirements.txt as of `1e3de47`) |
| Webapp UI shows "No patients found" AND `curl /health` returns 500 AND `curl /docs` returns 200 | uvicorn workers have a stale module cache — sqlalchemy registered `_not_implemented` for greenlet at module-load time (before `pip install greenlet`). The pip install only helps brand-new Python processes; running workers keep the failed resolution. | **Restart uvicorn** (Ctrl-C the foreground process, then `bash scripts/run-backend-native.sh` again). General rule: after **any** `pip install` / `pip upgrade` against a venv whose uvicorn is already running, restart all workers. Pinning deps in `requirements.txt` prevents this scenario for fresh setups. |
| `kill <pid>` does not terminate a uvicorn process | The process is uninterruptible (stuck in a C extension or ignoring SIGTERM — observed for orphaned `--workers 1` instances) | `kill -9 <pid>` (SIGKILL). Confirm with `ps aux \| grep uvicorn` afterwards. |
| Pipeline standalone: `pred_*` columns NULL | should be impossible after migration 006 + the persistence.py fix | open an issue with the offending analysis_id |

---

## Architecture summary

```
[Native — Mac/Linux host]
├─ postgresql@16     :5433
├─ redis             :6379
├─ Backend FastAPI   :8000  (uvicorn via run-backend-native.sh)
└─ AI Pipeline       (CLI via run-pipeline-standalone.py)

[Docker — only 2]
├─ nlp-classifiers   :8888  (external NLP team's image, unavoidable)
└─ webapp            :3001  (Next.js, frontend kept Docker)

Webapp(Docker)   ──host.docker.internal:8000──→ Backend(native)
Backend(native)  ──localhost:8888──────────────→ NLP(Docker)
Backend(native)  ──localhost:5433──────────────→ Postgres(native)
Pipeline(native) ──localhost:5433──────────────→ Postgres(native)
Pipeline(native) ──localhost:8888──────────────→ NLP(Docker)
Pipeline(native) ──docker exec────────────────→ NLP(Docker)  [stringi]
```

See [`DEPLOYMENT_NATIVE_PLAN.md`](DEPLOYMENT_NATIVE_PLAN.md) for the
phased plan, [`DEPLOYMENT_MODES.md`](DEPLOYMENT_MODES.md) for choosing
between Docker and Native, and
[`PIPELINE_DB_FLOW.md`](PIPELINE_DB_FLOW.md) for the per-stage data
flow into PostgreSQL.
