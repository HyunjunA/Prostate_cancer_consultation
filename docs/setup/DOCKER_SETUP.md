# Docker Setup Guide

> Consolidated Docker setup for the Prostate Cancer Consultation Dashboard.  
> For local development without Docker, see [LOCAL_SETUP.md](LOCAL_SETUP.md).

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

This script handles everything:
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

### Option C: Start with log capture

**Important**: Use `-f docker-compose.yml` flag to ensure proper initialization:

```bash
cd app/Backend
docker compose -f docker-compose.yml up --no-color 2>&1 | tee "logs/compose-$(date +'%Y%m%d-%H%M%S').log"
```

**Why `-f docker-compose.yml`?**
- Ensures `docker-compose.override.yml` doesn't interfere with startup scripts
- Guarantees `init_db.py` runs automatically on first start
- CSV data is loaded automatically into the database

### Option D: Development mode (uses override file)

```bash
cd app/Backend
docker compose up --no-color 2>&1 | tee "logs/compose-$(date +'%Y%m%d-%H%M%S').log"
```

This uses both `docker-compose.yml` and `docker-compose.override.yml`.

---

## NLP Classifiers Image

`nlp-classifiers` 서비스는 `r01-nlp-classifiers:latest` 로컬 Docker 이미지를 사용한다.  
이 이미지는 Docker Hub에 없으며, 아래 경로의 OCI 이미지 디렉토리에서 로드해야 한다:

```bash
cd prostate_cancer_R01_NLP_classifiers_Michael/r01-nlp-classifiers-docker-image
tar -cf /tmp/r01-nlp-classifiers.tar .
docker load -i /tmp/r01-nlp-classifiers.tar
# → Loaded image: r01-nlp-classifiers:latest
```

원본 R 코드/모델은 별도 폴더에 위치:
```
prostate_cancer_project/prostate_cancer_R01_NLP_classifiers_Michael/
```

---

## Docker Services (10 total)

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
Compose network: `prostatecancer-network`. Named volumes: `postgres_data`, `redis_data`.

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

# Runtime
RUN_ENV=prod                   # dev or prod
WEB_CONCURRENCY=1              # Number of worker processes
DEBUG=true

# CORS
CORS_ORIGINS=["http://localhost:3000","http://localhost:5173","http://localhost:8080"]

# Redis
REDIS_URL=redis://redis:6379/0
RATE_LIMIT_NS=sarscov
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

### Frontend Environment Variables (NEXT_PUBLIC_*)

Next.js `NEXT_PUBLIC_*` variables are **build-time** injected, NOT runtime. They must be passed as `--build-arg` during `docker build`:

```yaml
# docker-compose.yml
webapp:
  build:
    args:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
      - NEXT_PUBLIC_API_KEY=${API_KEY}
```

If you change these values, you must rebuild the webapp image:

```bash
docker compose build webapp && docker compose up -d webapp
```

---

## Startup Sequence

1. **Docker Compose starts Postgres and Redis** and waits for health checks
2. **Backend container starts** and executes startup script:
   - Runs `prestart.sh` (automatically created by Dockerfile)
   - Executes `wait_for_db.py` to ensure database is ready
   - Executes `init_db.py` which creates database tables (idempotent)
   - Executes `pipeline_runner.py` which processes real transcript files:
     - Reads xlsx files from `/app/data/transcripts/`
     - Runs Steps 1-7 (NLP pipeline), Step 8 (scorer), Step 9 (rewriter)
     - Saves directly to DB (no CSV intermediate)
     - Skips files already in DB
   - Starts Uvicorn server (dev mode) or Gunicorn (prod mode)
3. **On app startup**, `main.py`:
   - Creates an async Redis client
   - Initializes fastapi-limiter with client IP as identifier
   - Prepares short-TTL cache helpers
4. **On shutdown**, closes Redis connection

**First-time startup output:**

```
🚀 Starting Prostate Cancer Dashboard Dashboard Backend...
🔄 Running prestart tasks...
⏳ Waiting for database...
🗄️  Initializing database and loading CSV...
✅ Found 216 records in CSV
✅ Migration completed! Created: 216, Updated: 0, Errors: 0
✅ Prestart tasks completed successfully!
🔧 Starting in DEVELOPMENT mode...
INFO: Uvicorn running on http://0.0.0.0:8000
```

**Key Points:**
- **No manual CSV loading needed**: `init_db.py` runs automatically on container start
- **Idempotent**: Safe to restart containers — data won't be duplicated
- **Development-friendly**: Hot reload enabled in dev mode with source code mounted

---

## Accessing the Application

| Page | URL | Description |
|------|-----|-------------|
| **Dashboard** | http://localhost:3001 | Main web application (via Nginx) |
| **Patient First Visit** | http://localhost:3001/?fileid=...&patid=...&visit=first | AI summaries + star ratings |
| **Patient Follow-Up** | http://localhost:3001/?fileid=...&patid=...&visit=followup | 4 validated surveys |
| **Doctor Demo** | http://localhost:3001/?doctorid=auto | Physician dashboard |
| **Admin Tracking** | http://localhost:3001/admin/tracking | User interaction analytics |
| **API Docs** | http://localhost:8000/docs | FastAPI Swagger UI |
| **Backend Health** | http://localhost:8000/health | DB + Redis + NLP status |

---

## Common Operations

### Connect to Postgres

```bash
docker exec -it prostatecancer-postgres psql -U prostatecancer_user -d prostatecancer_db
```

### Quick DB sanity check

```sql
SELECT COUNT(*) FROM studies;
SELECT DISTINCT age_reported FROM studies;
```

### Rebuild specific service

```bash
# Backend only
docker compose build backend && docker compose up -d backend

# Webapp only
docker compose build webapp && docker compose up -d webapp nginx

# Full rebuild (clean)
docker compose down -v --rmi local
./run_all.sh   # from prostate_cancer_project/
```

### Adding new transcripts

1. Place `.xlsx` file in `AI_physician_patient_communication/data/input/`
2. Restart backend: `docker compose restart backend`
3. `pipeline_runner.py` auto-processes new files (skips already-processed)

### Worker/Monitor Mode (continuous processing)

```yaml
# Via config.yaml
worker:
  enabled: true
  scan_interval_seconds: 3600
```

```bash
# Or via command line
docker exec prostatecancer-backend python pipeline_runner.py --watch
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

**Production tips**: don't expose Redis or Postgres publicly; enable AUTH/TLS for Redis; store database credentials in a secret manager; tighten CORS origins; use environment-specific configurations.
