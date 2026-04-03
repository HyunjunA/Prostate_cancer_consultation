# Prostate Cancer Consultation Dashboard

A medical research dashboard that analyzes prostate cancer consultation transcripts using NLP, provides physician feedback on communication quality, and generates patient-friendly summaries.

> **Updated:** 2026-04-02 | **Python:** 3.10+ | **Node.js:** 18+ | **Docker Compose:** 3.8

---

## Architecture Overview

```
Browser → Nginx (:3001) → Webapp (Next.js :3000) + Backend (FastAPI :8000)
                                                        ↓
                              ┌──────────────────────────┼──────────────────────────┐
                              ↓                          ↓                          ↓
                    NLP Classifiers (R ×3)    Consultation Scorer     Patient Summary Rewriter
                    5 Random Forest models    Step 8 (0-5 scores)    Step 9 (summaries)
                              ↓                          ↓                          ↓
                         PostgreSQL 13 ←─────────────────┴──────────────────────────┘
                              ↑
                           Redis 7 (cache + rate limit)
```

**10 Docker services** | **12 DB tables** | **75 API endpoints** | **5 NLP models**

---

## Prerequisites

- **Docker Desktop** (Docker Engine 20.10+ and Compose v2.10+)
- ~8 GB disk space (NLP image 1.4GB + other images + data)
- ~10 GB RAM recommended (NLP classifiers: 2GB × 3 replicas)
- macOS, Linux, or Windows

---

## Quick Start

### Option A: Automated (recommended)

```bash
cd prostate_cancer_project
./run_all.sh
```

This single script handles everything:
1. Loads the NLP Docker image (if not already loaded)
2. Builds and starts all 10 containers
3. Waits for all healthchecks to pass
4. Processes real transcripts through the full pipeline (Steps 1-10)
5. Runs NLP 5-model verification test
6. Runs 1000-request stress test
7. Reports final status

**First run:** ~5-8 minutes (image builds + NLP startup + pipeline processing)  
**Subsequent runs:** ~3-4 minutes (cached builds)

### Option B: Manual

```bash
# 1. Load NLP image (first time only)
cd prostate_cancer_R01_NLP_classifiers_Michael/r01-nlp-classifiers-docker-image
tar -cf /tmp/r01-nlp.tar -C . .
docker load -i /tmp/r01-nlp.tar

# 2. Configure environment
cd ../../Prostate_cancer_consultation_dashboard/app/Backend
cp .env.example .env
# Edit .env with your values

# 3. Start all services
docker compose up -d --build

# 4. Verify
docker ps   # All 10 containers should show "healthy"
```

---

## Environment Configuration

### `.env` file (`app/Backend/.env`)

```bash
# Database (required)
POSTGRES_USER=prostatecancer_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=prostatecancer_db

# Authentication (required)
API_KEY=your_api_key_here
AUTH_MODE=api_key              # api_key | multi_key | jwt | oauth2

# REDCap Integration (optional)
REDCAP_ENABLED=false
REDCAP_API_URL=https://redcap.example.edu/api/
REDCAP_API_TOKEN=your_token

# PostHog Analytics (optional)
POSTHOG_KEY=
POSTHOG_HOST=
```

### `config.yaml` (`app/Backend/config.yaml`)

Pipeline parameters — **no hardcoded values in code** (Ivan's rule):

```yaml
pipeline:
  top_n: 10                    # Top-N sentences per domain
  context_window: 3            # ±N surrounding sentences
  batch_size: 50               # NLP API batch size

paths:
  transcript_dir: "/app/data/transcripts"
  output_dir: "/app/data/output"

worker:
  enabled: false               # true = continuous monitoring mode
  scan_interval_seconds: 3600  # Sleep between scans

scoring:
  scorer_url: "http://consultation-scorer:8001"
  rewriter_url: "http://patient-summary-rewriter:8002"
  summary_top_k: 3
```

All values can be overridden via environment variables (e.g., `PIPELINE_TOP_N=20`).

---

## Docker Services

| Service | Container | Port | Image Size | Memory | Purpose |
|---------|-----------|------|-----------|--------|---------|
| nginx | prostatecancer-nginx | 127.0.0.1:**3001** | 43MB | — | Reverse proxy |
| webapp | prostatecancer-webapp | 3000 (internal) | 860MB | — | Next.js frontend |
| backend | prostatecancer-backend | 127.0.0.1:**8000** | 428MB | 1G | FastAPI API server |
| postgres | prostatecancer-postgres | 127.0.0.1:**5433** | 374MB | 512M | PostgreSQL 13 |
| redis | prostatecancer-redis | 6379 (internal) | 138MB | 256M | Cache + rate limit |
| nlp-classifiers ×3 | backend-nlp-classifiers-{1,2,3} | 8000 (internal) | 1.4GB | 2G each | R plumber NLP models |
| consultation-scorer | prostatecancer-scorer | 8001 (internal) | 188MB | 256M | Step 8: quality scores (0-5) |
| patient-summary-rewriter | prostatecancer-rewriter | 8002 (internal) | 188MB | 256M | Step 9: patient summaries |

All external ports bound to `127.0.0.1` (localhost only).

---

## Accessing the Application

| Page | URL | Description |
|------|-----|-------------|
| **Dashboard** | http://localhost:3001 | Main web application (via Nginx) |
| **Patient First Visit** | http://localhost:3001/?fileid=...&patid=...&visit=first | AI summaries + star ratings |
| **Patient Follow-Up** | http://localhost:3001/?fileid=...&patid=...&visit=followup | 4 validated surveys |
| **Doctor Demo** | http://localhost:3001/?doctorid=auto | Physician dashboard (auto-detect speaker) |
| **Admin Tracking** | http://localhost:3001/admin/tracking | User interaction analytics |
| **API Docs** | http://localhost:8000/docs | FastAPI Swagger UI |
| **Backend Health** | http://localhost:8000/health | DB + Redis + NLP status |

---

## Data Pipeline

Real transcript files are processed automatically at Docker startup:

```
Input: AI_physician_patient_communication/data/input/*.xlsx
  ↓ (mounted as /app/data/transcripts/ in Docker)

pipeline_runner.py (Thin Main — each Step = one function call):
  Step 1:  Read transcript (.xlsx or .csv)
  Step 2:  Identify doctor (speaker with most text — Ivan's dynamic rule)
  Step 3:  Split into sentences (regex tokenizer)
  Step 4:  NLP prediction (5 models × asyncio.gather — parallel)
  Step 5:  Select top-N per domain (from config.yaml)
  Step 6:  Generate context (±N surrounding sentences)
  Step 7:  Export xlsx (5 sheets)
  Step 8:  Score sentences (consultation-scorer → 0-5 quality)
  Step 9:  Rewrite summaries (patient-summary-rewriter → patient-friendly text)
  Step 10: Save to PostgreSQL (persistence.py — separate module)

Output: /app/data/output/{filename_stem}/predictions.xlsx
        + 6 DB tables populated directly
```

### Adding New Transcripts

1. Place `.xlsx` file in `AI_physician_patient_communication/data/input/`
2. Restart backend: `docker compose restart backend`
3. `pipeline_runner.py` auto-processes new files (skips already-processed)

### Worker/Monitor Mode

For continuous processing (production):

```bash
# Via config.yaml
worker:
  enabled: true
  scan_interval_seconds: 3600

# Or via command line
docker exec prostatecancer-backend python pipeline_runner.py --watch
```

---

## Database

12 tables across 5 groups. Schema managed by Alembic migrations.

| Group | Tables | Purpose |
|-------|--------|---------|
| Physician Interface | `doctor_sentence_view`, `doctor_rewrite_log` | NLP sentences + rewrite practice |
| Patient Interface | `patient_summary`, `patient_summary_scoring`, `patient_responses` | AI summaries + patient feedback |
| Survey System | `survey_submission_log` | SDM, DCS, Risk Perception, Satisfaction |
| ML Pipeline | `transcript_analysis_log`, `sentence_prediction` | Pipeline run records + predictions |
| Infrastructure | `user_interaction_log`, `auth_user`, `auth_api_key`, `patient_access` | Tracking + access control |

### Schema Changes

```bash
# 1. Edit models.py
# 2. Generate migration
docker exec prostatecancer-backend alembic revision --autogenerate -m "description"
# 3. Apply
docker exec prostatecancer-backend alembic upgrade head
```

### Direct DB Access

```bash
docker exec -it prostatecancer-postgres psql -U prostatecancer_user -d prostatecancer_db
```

---

## API Endpoints (75 total)

| Group | Count | Prefix | Router File |
|-------|-------|--------|-------------|
| System | 3 | `/`, `/health`, `/ready` | `main.py` |
| Doctor Interface | 17 | `/api/doctor/*` | `routes_doctor.py` |
| Patient Interface | 10 | `/api/patient/*`, `/api/stats/*` | `routes_patient.py` |
| Transcript Analysis | 6 | `/api/transcript/*` | `routes_transcript.py` |
| NLP Proxy | 6 | `/api/nlp/*` | `routes_nlp.py` |
| Surveys | 14 | `/api/surveys/*` | `routes_surveys.py` |
| User Tracking | 5 | `/api/tracking/*` | `routes_tracking.py` |
| Auth Admin | 14 | `/api/auth/*` | `auth/admin_routes.py` |

All endpoints require `X-API-Key` header (except `/health` and `/ready`).

### Example API Calls

```bash
API_KEY="your_api_key"

# Health check
curl http://localhost:8000/health

# List patient files
curl -H "X-API-Key: $API_KEY" http://localhost:8000/api/doctor/files

# Get sentences for a patient
curl -H "X-API-Key: $API_KEY" \
  "http://localhost:8000/api/doctor/sentences/INPUT_FILE.xlsx/SPEAKER"

# NLP prediction
curl -X POST -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"text": "the risk of cancer is 12 percent", "model": "cp"}' \
  http://localhost:8000/api/nlp/predict
```

---

## Development

### Project Structure

```
app/Backend/
├── main.py              # FastAPI app (143 lines — thin main)
├── config.yaml          # All pipeline parameters
├── config.py            # Config loader with env var overrides
├── pipeline_runner.py   # Full pipeline (Steps 1-10, thin main)
├── persistence.py       # DB persistence module (Step 10)
├── transcript_service.py # Steps 1-7 (NLP pipeline)
├── scorer_service.py    # Step 8 client (consultation-scorer)
├── rewriter_service.py  # Step 9 client (patient-summary-rewriter)
├── nlp_service.py       # NLP Docker client (cache + retry)
├── routes_doctor.py     # Doctor API (17 endpoints)
├── routes_patient.py    # Patient API (10 endpoints)
├── routes_transcript.py # Transcript API (6 endpoints)
├── routes_surveys.py    # Survey API (14 endpoints)
├── routes_tracking.py   # Tracking API (5 endpoints)
├── routes_nlp.py        # NLP proxy API (6 endpoints)
├── models.py            # SQLAlchemy ORM (12 tables)
├── db.py                # Async DB engine
├── redis_client.py      # Redis client
├── auth/                # Authentication (4 backends)
├── migrations/          # Alembic migrations
├── tests/               # pytest (23 test files)
├── Dockerfile           # Multi-stage build (428MB)
├── docker-compose.yml   # 10 services
├── requirements.txt     # Python deps (pinned versions)
└── requirements-dev.txt # Test deps (not in Docker)

app/Webapp/
├── src/app/page.tsx     # Main page (URL param routing)
├── src/components/      # React components (160 files, ~10 active)
├── src/hooks/           # Data hooks (useDoctorData, usePatientData)
├── src/stores/          # Zustand state (8 stores)
├── src/tracking/        # User behavior tracking system
├── server.js            # Custom Express server
├── next.config.js       # standalone output mode
└── Dockerfile           # Multi-stage build (860MB)
```

### Running Tests

```bash
# Backend tests
docker exec prostatecancer-backend pytest tests/ -v

# Or locally (requires test DB)
cd app/Backend
pip install -r requirements.txt -r requirements-dev.txt
pytest tests/ -v
```

### Rebuilding

```bash
# Backend only
docker compose build backend && docker compose up -d backend

# Webapp only
docker compose build webapp && docker compose up -d webapp nginx

# Full rebuild (clean)
docker compose down -v --rmi local
./run_all.sh   # from prostate_cancer_project/
```

---

## Stopping / Cleanup

```bash
cd app/Backend

# Stop services (preserves DB data)
docker compose down

# Stop + delete all data (DB, cache, volumes)
docker compose down -v

# Full cleanup (remove images too)
docker compose down -v --rmi local
```

---

## Documentation

**Full index:** [`docs/INDEX.md`](docs/INDEX.md)

| Document | Path | Description |
|----------|------|-------------|
| Documentation Index | `docs/INDEX.md` | Central navigation for all documentation |
| System Architecture | `docs/architecture/SYSTEM_ARCHITECTURE.md` | Integrated system overview (EN + KR) |
| Architecture Diagrams | `docs/architecture/ARCHITECTURE_DIAGRAMS.md` | 12 Mermaid diagrams |
| DB Schema Guide | `docs/architecture/DATABASE_SCHEMA.md` | 12 tables detailed (EN + KR) |
| Pipeline Guide | `docs/architecture/FULL_PIPELINE_GUIDE.md` | Steps 1-10 detailed |
| Docker Setup | `docs/setup/DOCKER_SETUP.md` | Consolidated Docker setup guide |
| Local Setup | `docs/setup/LOCAL_SETUP.md` | Running without Docker |
| ML Pipeline | `docs/ml-pipeline/` | 7 pipeline documents |
| Security Audit | `docs/security/SECURITY_AUDIT.md` | OWASP vulnerability audit |
| Ivan's Standards | `../../IVAN_CODE_REVIEW_STANDARDS.md` | Code review principles |

---

## Troubleshooting

### NLP classifier fails to start

On Apple Silicon Macs, the NLP image (linux/amd64) runs via Rosetta. Wait ~60-90 seconds.

```bash
docker logs backend-nlp-classifiers-1  # Check for "Running plumber API" message
```

### Backend unhealthy after startup

Pipeline processing (5 transcript files) takes ~3-4 minutes. Backend healthcheck may fail during this time but recovers after pipeline completion.

```bash
docker logs prostatecancer-backend 2>&1 | grep "Pipeline Complete"
```

### "No sentence available" in Doctor Demo

Verify the pipeline processed files successfully:

```bash
docker exec prostatecancer-postgres psql -U prostatecancer_user -d prostatecancer_db \
  -c "SELECT file, speaker, COUNT(*) FROM doctor_sentence_view GROUP BY file, speaker;"
```

### Port conflict

```bash
lsof -i :3001   # nginx
lsof -i :8000   # backend
lsof -i :5433   # postgres
```

### Webapp/Nginx not starting

If `docker compose up -d` only starts some services, explicitly start the missing ones:

```bash
docker compose up -d webapp nginx
```

Or use `run_all.sh` which handles startup ordering automatically.
