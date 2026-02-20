# Prostate Cancer Consultation Dashboard

A dashboard for prostate cancer consultation data visualization and NLP-based risk feedback analysis.

## Project Structure

```
Prostate_cancer_consultation_dashboard/
├── app/
│   ├── Backend/    # FastAPI backend (Python) + PostgreSQL + Redis + NLP API
│   └── Webapp/     # Next.js frontend (React)
├── data/           # Data files (CSV, XLSX) and external contributions
├── docs/           # Project documentation and technical specs
├── playground/     # REDCap API test scripts
├── archive/        # Unused/deprecated code
└── README.md
```

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

### Step 2: Start All Services

```bash
cd ~/Documents/GitHub/Graciela_Lab_Collab/Prostate_cancer_consultation_dashboard/app/Backend
docker compose up -d
```

This single command starts all 6 services in the correct order. The startup sequence is:

```
1. postgres + redis + nlp-classifiers  (start in parallel)
2. backend                             (waits for all three above to be healthy)
3. webapp                              (waits for backend to be healthy)
4. nginx                               (waits for backend + webapp)
```

> **First run** takes longer because Docker needs to build the backend and webapp images. Subsequent runs use cached images and start in ~1-2 minutes.

> **NLP classifier** (amd64 image on Apple Silicon) takes ~30-60 seconds to start due to Rosetta emulation. The healthcheck has a 60-second grace period to accommodate this.

### Step 3: Verify All Services Are Running

```bash
docker ps
```

All 6 containers should show `healthy` status:

```
NAMES                     STATUS                   PORTS
prostatecancer-nginx      Up (healthy)             0.0.0.0:3000->80/tcp
prostatecancer-webapp     Up (healthy)             3000/tcp
prostatecancer-backend    Up (healthy)             0.0.0.0:8000->8000/tcp
prostatecancer-postgres   Up (healthy)             0.0.0.0:5433->5432/tcp
prostatecancer-redis      Up (healthy)             6379/tcp
r01-nlp                   Up (healthy)             0.0.0.0:8001->8000/tcp
```

## Accessing the Application

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | http://localhost:3000 | Main web application |
| Backend API Docs | http://localhost:8000/docs | FastAPI Swagger UI |
| NLP API Docs | http://localhost:8001/__docs__/ | NLP classifier RapiDoc UI |

## Services

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| nginx | prostatecancer-nginx | 3000 (host) → 80 | Reverse proxy for webapp |
| webapp | prostatecancer-webapp | 3000 (internal) | Next.js frontend |
| backend | prostatecancer-backend | 8000 | FastAPI backend |
| postgres | prostatecancer-postgres | 5433 (host) → 5432 | PostgreSQL database |
| redis | prostatecancer-redis | 6379 (internal) | Redis cache |
| nlp-classifiers | r01-nlp | 8001 (host) → 8000 | R plumber NLP classifier API |

### Service Dependencies

```
nginx ──→ webapp ──→ backend ──→ postgres
                         │──→ redis
                         └──→ nlp-classifiers
```

### Internal Network Communication

All services are on the same Docker network (`prostatecancer-network`). Inside the network, services communicate by **service name**:

| From | To | URL |
|------|----|-----|
| backend | postgres | `postgresql://...@postgres:5432/...` |
| backend | redis | `redis://redis:6379/0` |
| backend | NLP API | `http://nlp-classifiers:8000` |

The backend uses the environment variable `NLP_API_URL=http://nlp-classifiers:8000` to reach the NLP classifier.

## NLP Classifier API

5 NLP classification models that predict clinical topic relevance from prostate cancer consultation transcripts.

### Prediction Endpoints

| Method | Endpoint (from host) | Topic |
|--------|---------------------|-------|
| POST | `http://localhost:8001/predict/cp` | Cancer Prognosis |
| POST | `http://localhost:8001/predict/ed` | Erectile Dysfunction |
| POST | `http://localhost:8001/predict/inc` | Continence |
| POST | `http://localhost:8001/predict/ius` | Irritative Urinary Symptoms |
| POST | `http://localhost:8001/predict/le` | Life Expectancy |

### Example API Call

```bash
curl -X POST http://localhost:8001/predict/cp \
  -H "Content-Type: application/json" \
  -d '[{"text": "the risk of dying from prostate cancer without treatment is relatively low but not zero."}]'
```

Response:
```json
[{".pred_1": 0.9178, ".pred_0": 0.0822}]
```

For complete NLP API documentation, see the [NLP classifier README](../prostate_cancer_R01_NLP_classifiers_Michael/README.md).

## API Testing

Use the REST Client extension in VS Code to test all API endpoints:

```
app/Backend/api_call_test.rest
```

This file includes tests for:
- Backend health checks and all CRUD endpoints
- NLP classifier predictions (single, batch, all 5 models)
- Survey submission and REDCap integration

## Stopping the Application

```bash
cd ~/Documents/GitHub/Graciela_Lab_Collab/Prostate_cancer_consultation_dashboard/app/Backend

# Stop all services (preserves database data)
docker compose down

# Stop and remove all data (database, cache)
docker compose down -v
```

## Troubleshooting

### NLP classifier fails to start (unhealthy)

On Apple Silicon Macs, the NLP image (linux/amd64) runs via Rosetta emulation and takes longer to initialize. If `r01-nlp` shows `unhealthy`:

```bash
# Check logs
docker logs r01-nlp

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
lsof -i :8001   # NLP API
lsof -i :3000   # webapp
lsof -i :5433   # postgres

# Stop conflicting process or change ports in docker-compose.yml
```

### Backend can't connect to NLP API

Verify from inside the backend container:
```bash
docker exec prostatecancer-backend curl -s http://nlp-classifiers:8000/ping
# Should return: {"status":"online","time":"..."}
```
