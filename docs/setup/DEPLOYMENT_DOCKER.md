# Docker Deployment (legacy)

> **Native deployment is the recommended path** — see [`DEPLOYMENT_NATIVE.md`](DEPLOYMENT_NATIVE.md). This document describes the all-in-Docker mode kept as a fallback.

In Docker mode the entire stack — Postgres, Redis, NLP-classifiers, Backend, Webapp — runs as Docker containers via `docker-compose.yml`.

---

## Prerequisites

- Docker Desktop installed and running
- Source code: this repo + sibling `AI_physician_patient_communication` repo (NLP OCI archive lives in the AI repo)
- Azure OpenAI endpoint + key (or skip the AI step — see `--skip-ai` in [`DEPLOYMENT_NATIVE.md`](DEPLOYMENT_NATIVE.md))

---

## Quick start

```bash
# 1. Sibling repo layout
git clone https://github.com/HyunjunA/Prostate_cancer_consultation.git \
    Prostate_cancer_consultation_dashboard
git clone https://github.com/jifa83/AI_physician_patient_communication.git \
    AI_physician_patient_communication
cd Prostate_cancer_consultation_dashboard

# 2. NLP OCI archive — see DEPLOYMENT_NATIVE.md §0.5
#    (same archive, same path: AI_physician_patient_communication/nlp-classifiers/...)

# 3. Configure secrets
cp app/Backend/.env.example app/Backend/.env
$EDITOR app/Backend/.env       # set POSTGRES_PASSWORD, AZURE_OPENAI_*, API_KEY

# 4. Build and start the full stack
bash scripts/run_all.sh
```

After `run_all.sh` finishes:

| Service | URL |
|---|---|
| Dashboard (Webapp) | http://localhost:3001 |
| Backend API docs | http://localhost:8000/docs |
| Postgres | `localhost:5432` (bound to 127.0.0.1) |

Stop with `docker compose down`. Add `-v` to also drop the Postgres volume (data loss).

---

## Containers (`docker-compose.yml`)

| Service | Image source | Port |
|---|---|---|
| `postgres` | `postgres:16` | 5432 |
| `redis` | `redis:7-alpine` | 6379 |
| `nlp-classifiers` | OCI archive (loaded on first run) | 8001 |
| `backend` | built from `app/Backend/Dockerfile` | 8000 |
| `webapp` | built from `app/Webapp/Dockerfile` | 3001 |

The Postgres data lives in the `postgres_data` named volume — it survives `docker compose down` (without `-v`).

---

## Switching between modes

Native and Docker modes use **different Postgres ports** (`5433` vs `5432`) so data does not overlap. Other ports collide (`8000`, `3001`, `6379`) — bring up only one mode at a time.

---

## When to prefer native mode

- You want the Backend to hot-reload code changes without rebuilding a container
- You want the DB to survive Docker recycles (native Postgres is independent)
- You want to run the standalone pipeline (`scripts/run-pipeline-standalone.py`) against a stable DB

When to prefer this Docker mode:
- You want a one-command bring-up with no host-level dependency installs
- You want the same image set on every developer machine for reproducibility
