# Prostate Cancer Consultation Dashboard

A dashboard for prostate cancer consultation data visualization and NLP-based risk feedback analysis.

## Project Structure

```
Prostate_cancer_consultation_dashboard/
├── app/
│   ├── Backend/          # FastAPI backend (Python) + PostgreSQL + Redis + NLP API
│   └── Webapp/           # Next.js frontend (React)
├── data/                 # Data files (CSV, XLSX) and external contributions
├── docs/                 # Project documentation and technical specs
├── dev_docs/             # Developer documentation (backend + ML pipeline)
├── daily_control_logs/   # Daily work logs (EN/KR, detail/summary)
├── playground/           # REDCap API test scripts
├── archive/              # Unused/deprecated code
└── README.md
```

### Folder Details

#### `daily_control_logs/`

Daily work logs following the [Collaboration Principles](../../Collaboration_Principles.md) Section 6 standard. Each date produces 4 files:

| File | Language | Detail Level |
|------|----------|-------------|
| `YYYY-MM-DD_control.txt` | English | Technical Detail (file names, functions, line numbers) |
| `YYYY-MM-DD_control_summary.txt` | English | Summary (high-level overview) |
| `YYYY-MM-DD_control_kr.txt` | Korean | Technical Detail |
| `YYYY-MM-DD_control_kr_summary.txt` | Korean | Summary |

All four files cover the same work items with consistent numbering.

#### `dev_docs/`

Developer documentation organized by area:

- **`backend_dev_docs/`** — Backend improvement TODO list, security audit items
- **`ml_pipeline_dev_docs/`** — ML pipeline architecture, development status, Michael's NLP classifier analysis, comparison documents (all in EN/KR pairs)

#### `docs/`

Project documentation and technical specifications:

- **`md/`** — REDCap field mapping, API access management, data persistence checklists, PHI compliance notes
- Presentation files (PDF/PPTX): visualization plans, system integration, manual scoring references

#### `app/Backend/`

FastAPI backend with:
- `main.py` — Main application with all doctor/patient/score endpoints
- `routes_surveys.py` — Survey submission + REDCap integration
- `routes_transcript.py` — Transcript analysis pipeline (NLP predictions)
- `routes_nlp.py` — NLP model proxy endpoints
- `auth/` — Modular authentication system (4 backends: api_key, multi_key, jwt, oauth2)
- `database_schema.sql` — Full PostgreSQL schema
- `docker-compose.yml` — All service definitions
- `api_call_test.rest` — Comprehensive API test file (60+ endpoints)

#### `app/Webapp/`

Next.js (React) frontend with doctor interface, patient interface, survey forms, and risk feedback visualization.

#### `playground/`

REDCap API test scripts for development and debugging (`Redcap_api_playground/`).

#### `archive/`

Deprecated code and earlier development iterations. Not used in the current application.

## Prerequisites

- **Docker Desktop** (includes Docker Engine 20.10+ and Compose v2.10+)
- ~4 GB disk space (for all Docker images)
- macOS, Linux, or Windows

## Quick Start

### Step 1: Load the NLP Classifier Image (first time only)

The NLP classifier Docker image is stored as an OCI directory in a separate repository. You need to load it into Docker before running the application.

```bash
cd ~/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_R01_NLP_classifiers_Michael
tar -cf /tmp/r01-nlp.tar -C r01-nlp-classifiers-docker-image .
docker load -i /tmp/r01-nlp.tar
```

Verify the image is loaded:
```bash
docker images r01-nlp-classifiers
# Should show: r01-nlp-classifiers   latest   ...   1.41GB
```

> **Note:** This step is only needed once. The image persists in Docker until you manually remove it (`docker rmi r01-nlp-classifiers:latest`) or reset Docker.

### Step 2: Configure Environment Variables

```bash
cd ~/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend
cp .env.example .env
```

Edit `.env` and set the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_USER` | Yes | Database username |
| `POSTGRES_PASSWORD` | Yes | Database password (change from default) |
| `POSTGRES_DB` | Yes | Database name |
| `API_KEY` | Yes | API key for backend authentication |
| `AUTH_MODE` | No | Authentication mode: `api_key` (default), `multi_key`, `jwt`, `oauth2` |
| `REDCAP_API_URL` | No | REDCap API endpoint (if using REDCap integration) |
| `REDCAP_API_TOKEN` | No | REDCap API token (if using REDCap integration) |

> **Important:** Never commit `.env` to git. It is already in `.gitignore`.

### Step 3: Start All Services

```bash
docker compose up -d
```

This single command starts all services in the correct order:

```
1. postgres + redis + nlp-classifiers (x3)   (start in parallel)
2. backend                                    (waits for all three above to be healthy)
3. webapp                                     (waits for backend to be healthy)
4. nginx                                      (waits for backend + webapp)
```

> **First run** takes longer because Docker needs to build the backend and webapp images. Subsequent runs use cached images and start in ~1-2 minutes.

> **NLP classifier** (amd64 image on Apple Silicon) takes ~30-60 seconds to start due to Rosetta emulation. The healthcheck has a 90-second grace period to accommodate this.

### Step 4: Verify All Services Are Running

```bash
docker ps
```

All containers should show `healthy` status:

```
NAMES                       STATUS              PORTS
prostatecancer-nginx        Up (healthy)        127.0.0.1:3000->80/tcp
prostatecancer-webapp       Up (healthy)        3000/tcp
prostatecancer-backend      Up (healthy)        127.0.0.1:8000->8000/tcp
prostatecancer-postgres     Up (healthy)        5432/tcp
prostatecancer-redis        Up (healthy)        6379/tcp
backend-nlp-classifiers-1   Up (healthy)        8000/tcp
backend-nlp-classifiers-2   Up (healthy)        8000/tcp
backend-nlp-classifiers-3   Up (healthy)        8000/tcp
```

## Accessing the Application

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | http://localhost:3000 | Main web application |
| Backend API Docs | http://localhost:8000/docs | FastAPI Swagger UI |

> **Security note:** All ports are bound to `127.0.0.1` (localhost only). They are not accessible from other machines on the network.

## Services

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| nginx | prostatecancer-nginx | 127.0.0.1:3000 → 80 | Reverse proxy for webapp + backend |
| webapp | prostatecancer-webapp | 3000 (internal) | Next.js frontend |
| backend | prostatecancer-backend | 127.0.0.1:8000 | FastAPI backend |
| postgres | prostatecancer-postgres | 5432 (internal) | PostgreSQL 13 database |
| redis | prostatecancer-redis | 6379 (internal) | Redis 7 cache |
| nlp-classifiers | backend-nlp-classifiers-{1,2,3} | 8000 (internal) | R plumber NLP classifier API (3 replicas) |

### Service Dependencies

```
nginx ──→ webapp ──→ backend ──→ postgres
                        │──→ redis
                        └──→ nlp-classifiers (x3, load-balanced)
```

### Internal Network Communication

All services are on the same Docker network (`prostatecancer-network`). Inside the network, services communicate by service name:

| From | To | URL |
|------|----|-----|
| backend | postgres | `postgresql://...@postgres:5432/...` |
| backend | redis | `redis://redis:6379/0` |
| backend | NLP API | `http://nlp-classifiers:8000` |

## NLP Classifier API

5 NLP classification models that predict clinical topic relevance from prostate cancer consultation transcripts. The NLP classifiers run as 3 replicas for load balancing and are accessible only through the backend proxy.

### Prediction via Backend Proxy

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/nlp/predict` | Single model prediction |
| POST | `/api/nlp/predict/batch` | Batch prediction (multiple texts) |
| POST | `/api/nlp/predict/all` | Predict with all 5 models |
| POST | `/api/nlp/predict/by-class` | Predict by class number |
| GET | `/api/nlp/models` | List available models |
| GET | `/api/nlp/health` | NLP service health status |

### Available Models

| Model | Topic |
|-------|-------|
| `cp` | Cancer Prognosis |
| `ed` | Erectile Dysfunction |
| `inc` | Continence |
| `ius` | Irritative Urinary Symptoms |
| `le` | Life Expectancy |

### Example API Call

```bash
curl -X POST http://localhost:8000/api/nlp/predict \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "the risk of dying from prostate cancer without treatment is relatively low.", "model": "cp"}'
```

All API calls require the `X-API-Key` header for authentication.

## Authentication

The backend supports 4 authentication modes, configurable via the `AUTH_MODE` environment variable:

| Mode | AUTH_MODE | Description |
|------|-----------|-------------|
| Single API Key | `api_key` (default) | Single shared API key via `X-API-Key` header. Backward compatible. |
| Multi-Key | `multi_key` | Per-user API keys stored in DB. Supports patient-level access control. |
| JWT | `jwt` | Login with username/password, authenticate with Bearer token. |
| OAuth2 | `oauth2` | External Identity Provider (Google, Okta, Azure AD). |

For `multi_key` mode, an admin user and API key must be registered in the database after first startup. See `dev_docs/backend_dev_docs/` for setup instructions.

## API Testing

Use the REST Client extension in VS Code to test all API endpoints:

```
app/Backend/api_call_test.rest
```

This file includes tests for:
- Backend health checks and all CRUD endpoints
- Doctor interface (sentences, rewrites, scores, class distribution)
- Patient interface (summaries, scoring, responses)
- NLP classifier predictions (single, batch, all 5 models)
- Survey submission and REDCap integration
- Authentication and error handling

## Stopping the Application

```bash
cd ~/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend

# Stop all services (preserves database data)
docker compose down

# Stop and remove all data (database, cache)
docker compose down -v
```

## Rebuilding After Code Changes

```bash
# Rebuild backend only
docker compose build backend && docker compose up -d backend

# Rebuild webapp only
docker compose build webapp && docker compose up -d webapp

# Rebuild everything
docker compose build && docker compose up -d
```

> The backend server takes ~10-15 seconds to become ready after restart.

## Troubleshooting

### NLP classifier fails to start (unhealthy)

On Apple Silicon Macs, the NLP image (linux/amd64) runs via Rosetta emulation and takes longer to initialize. If `backend-nlp-classifiers-*` shows `unhealthy`:

```bash
# Check logs
docker logs backend-nlp-classifiers-1

# Wait for "Running plumber API at http://0.0.0.0:8000" message
# If it never appears, restart:
docker compose restart nlp-classifiers
```

### "r01-nlp-classifiers:latest not found" error

The NLP image needs to be loaded first (Step 1):

```bash
cd ~/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_R01_NLP_classifiers_Michael
tar -cf /tmp/r01-nlp.tar -C r01-nlp-classifiers-docker-image .
docker load -i /tmp/r01-nlp.tar
```

### Port already in use

```bash
# Check what's using the port
lsof -i :8000   # backend
lsof -i :3000   # webapp/nginx

# Stop conflicting process or change ports in docker-compose.yml
```

### Backend can't connect to NLP API

Verify from inside the backend container:
```bash
docker exec prostatecancer-backend curl -s http://nlp-classifiers:8000/ping
# Should return: {"status":"online","time":"..."}
```

### Database connection issues

```bash
# Check postgres logs
docker logs prostatecancer-postgres

# Verify database is accessible from backend
docker exec prostatecancer-backend python -c "from db import db_ready_ping; import asyncio; print(asyncio.run(db_ready_ping()))"
```

### Environment variable issues

```bash
# Verify .env is loaded correctly
docker exec prostatecancer-backend env | grep -E "DATABASE_URL|API_KEY|AUTH_MODE|REDCAP"
```
