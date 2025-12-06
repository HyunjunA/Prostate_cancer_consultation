# SARS-CoV-2 Research Dashboard — Developer README

A comprehensive web application for filtering and analyzing SARS-CoV-2 research data with a **FastAPI** backend, **PostgreSQL** database, and **Redis** for response caching and request rate limiting.  
This document is for developers who will **build, run, extend, and operate** the service.

---

## Operational Quick Guide

### 1) Start the stack (and capture logs)

**Important**: Use `-f docker-compose.yml` flag to ensure proper initialization:

```bash
cd ./Backend
docker compose -f docker-compose.yml up --no-color 2>&1 | tee "logs/compose-$(date +'%Y%m%d-%H%M%S').log"
```

**Why `-f docker-compose.yml`?**

- Ensures `docker-compose.override.yml` doesn't interfere with startup scripts
- Guarantees `init_db.py` runs automatically on first start
- CSV data is loaded automatically into the database

**What happens on startup:**

```
🚀 Starting SARS-CoV-2 Dashboard Backend...
🔄 Running prestart tasks...
⏳ Waiting for database...
🗄️  Initializing database and loading CSV...
✅ Found 216 records in CSV
✅ Migration completed! Created: 216, Updated: 0, Errors: 0
✅ Prestart tasks completed successfully!
🔧 Starting in DEVELOPMENT mode...
INFO: Uvicorn running on http://0.0.0.0:8000
```

### 2) Connect to Postgres (inside the container)

```bash
docker exec -it prostatecancer-postgres psql -U sarscov_user -d sarscov_db
```

### 3) Quick DB sanity check (SQL)

```sql
SELECT COUNT(*) FROM studies;
SELECT DISTINCT age_reported FROM studies;
```

### 4) Call the API directly

Example: dynamic filter options for U.S. studies in 2023 with selected flags.

```bash
curl -X POST http://localhost:8000/api/studies/filter-options-dynamic \
  -H "Content-Type: application/json" \
  -d '{
    "countries": ["United States"],
    "year_list": [2023],
    "age_reported": true,
    "gender_reported": true,
    "race_ethnicity_nationality_reported": true
  }'
```

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Available Services](#available-services)
- [Project Structure](#project-structure)
- [Quick Start with Docker](#quick-start-with-docker)
- [Configuration](#configuration)
- [Runtime Lifecycle](#runtime-lifecycle)
- [API Endpoints](#api-endpoints)
- [Caching & Rate Limiting](#caching--rate-limiting)
- [Testing & Verification](#testing--verification)
- [Security Considerations](#security-considerations)
- [Observability & Ops](#observability--ops)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)
- [Contributing](#contributing)
- [Support](#support)

## Overview

The SARS-CoV-2 Research Dashboard exposes endpoints to filter, aggregate, and analyze a curated dataset of study metadata.
It uses PostgreSQL as the system of record and Redis for short-TTL caching and per-client rate limiting.

### Highlights

- **Automatic database initialization**: CSV data is loaded automatically on first startup
- Rich filtering (years, countries, repositories, PMIDs, many booleans, text search)
- Aggregations for charts (counts + percentages)
- Static & dynamic filter options
- Redis-backed short-TTL response cache with one-line global invalidation
- Request rate limiting per IP

## Architecture

```bash
┌──────────────────────────┐      ┌──────────────────┐
│  Frontend / Clients      │─────▶│  FastAPI (app)   │
└──────────────────────────┘      │  - main.py       │
                                  │  - cache_json()  │
                                  │  - RateLimiter   │
                                  └───────┬──────────┘
                                          │ SQLAlchemy (async)
                                   ┌──────▼─────┐
                                   │ Postgres   │
                                   │ (studies)  │
                                   └──────┬─────┘
                                          │ Redis (async)
                                  ┌───────▼────────┐
                                  │ Redis          │
                                  │ - cache:*      │
                                  │ - sarscov:rl:* │
                                  └────────────────┘
```

## Available Services

| Service  | Image / Build        | Host→Container | Purpose                  |
| -------- | -------------------- | -------------- | ------------------------ |
| postgres | postgres:13          | 5433 → 5432    | Primary database         |
| backend  | Dockerfile (FastAPI) | 8000 → 8000    | API server (Uvicorn)     |
| redis    | redis:7              | 6379 → 6379    | Cache & rate-limit store |

Compose network: `prostatecancer-network`. Named volumes: `postgres_data`, `redis_data`.

## Project Structure

```
sars-cov-2-dashboard/
├── docker-compose.yml            # Main Compose services & healthchecks
├── docker-compose.override.yml   # Development overrides (auto-loaded)
├── Dockerfile                    # Backend container image
├── requirements.txt              # Python deps (redis, fastapi-limiter, ...)
├── .dockerignore                 # Docker build exclusions
├── .env.example                  # Environment template
├── main.py                       # FastAPI app, routes, Redis init, cache & RL
├── models.py                     # SQLAlchemy models + Pydantic schemas
├── db.py                         # DB engine/session + dependency
├── init_db.py                    # Automatic CSV import + table creation (runs on startup)
├── wait_for_db.py                # DB readiness check (runs before init_db.py)
├── database_schema.sql           # Initial DDL mounted into Postgres init
├── test_redis.sh                 # Redis/cache/rate-limit end-to-end verifier
├── logs/                         # Collected logs
├── uploads/                      # Uploaded files (future)
├── data/                         # Data files
└── Processed_Data_DB.csv  # Initial data (auto-loaded on first start)
```

## Quick Start with Docker

### Prerequisites

- Docker ≥ 20.10
- Docker Compose ≥ 1.29 (or docker compose plugin)
- Git

### 1) Clone and Setup

```bash
git clone <repository-url>
cd backend  # Navigate to backend directory

# Ensure logs directory exists
mkdir -p logs

# Place your CSV in the backend directory (exact name):
# Processed_Data_DB.csv (should already be present)
```

### 2) Start the Application

**Method 1: Using the explicit flag (Recommended)**

```bash
# Start all services and capture logs with timestamp
docker compose -f docker-compose.yml up --no-color 2>&1 | tee "logs/compose-$(date +'%Y%m%d-%H%M%S').log"
```

**Method 2: For development (uses override file)**

```bash
# This will use both docker-compose.yml and docker-compose.override.yml
# The override file removes the command to let Dockerfile CMD run properly
docker compose up --no-color 2>&1 | tee "logs/compose-$(date +'%Y%m%d-%H%M%S').log"
```

**Method 3: Background mode**

```bash
docker compose -f docker-compose.yml up -d

# View logs
docker compose logs -f backend
```

### 3) First-Time Startup

On the **first run**, you'll see automatic initialization:

```
🚀 Starting SARS-CoV-2 Dashboard Backend...
🔄 Running prestart tasks...
========================================
⏳ Waiting for database...
✅ Database connection successful!

🗄️  Initializing database and loading CSV...
----------------------------------------
🚀 Starting database initialization...
Connecting to database: postgresql+asyncpg://sarscov_user@***
✅ Database connection successful!
Creating database tables...
✅ Database tables created successfully!
Reading CSV file: Processed_Data_DB.csv
✅ Found 216 records in CSV
CSV columns:
  - CovidenceID
  - PMID
  - Study ID
  - Title
  - publication.year
  ...
Created 50 records...
Created 100 records...
Created 150 records...
Created 200 records...
✅ Migration completed! Created: 216, Updated: 0, Errors: 0
----------------------------------------
========================================
✅ Prestart tasks completed successfully!

🔧 Starting in DEVELOPMENT mode...
INFO: Uvicorn running on http://0.0.0.0:8000
```

**Subsequent restarts** will skip data loading if data already exists.

### 4) Access the Application

- **API Docs**: http://localhost:8000/docs
- **API Health**: http://localhost:8000/health
- **API Root**: http://localhost:8000/

### 5) Stop the Application

```bash
# Stop all services
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

## Configuration

### Environment Variables (app & compose)

```yaml
# Database
DATABASE_URL: postgresql+asyncpg://sarscov_user:secure_password_123@postgres:5432/sarscov_db
DB_HOST: postgres
DB_PORT: 5432
DB_NAME: sarscov_db
DB_USER: sarscov_user
DB_PASSWORD: secure_password_123

# API
API_HOST: 0.0.0.0
API_PORT: 8000
DEBUG: true

# CORS
CORS_ORIGINS:
  ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"]

# Redis
REDIS_URL: redis://redis:6379/0
RATE_LIMIT_NS: sarscov

# Runtime
RUN_ENV: prod # dev or prod (Dockerfile will choose uvicorn --reload or gunicorn)
WEB_CONCURRENCY: 1 # Number of worker processes
```

**Production tips**: don't expose Redis or Postgres publicly; enable AUTH/TLS for Redis; store database credentials in a secret manager; tighten CORS origins; use environment-specific configurations.

## Runtime Lifecycle

### Startup Sequence

1. **Docker Compose starts Postgres and Redis** and waits for health checks
2. **Backend container starts** and executes startup script:
   - ✅ Runs `prestart.sh` (automatically created by Dockerfile)
   - ✅ Executes `wait_for_db.py` to ensure database is ready
   - ✅ Executes `init_db.py` which:
     - Creates database tables if they don't exist
     - Checks if data exists in the database
     - Loads CSV data if database is empty (first run only)
     - Skips data loading if records already exist (subsequent runs)
   - ✅ Starts Uvicorn server (dev mode) or Gunicorn (prod mode)
3. **On app startup**, `main.py`:
   - Creates an async Redis client
   - Initializes fastapi-limiter with client IP as identifier
   - Prepares short-TTL cache helpers (`cache_json`)
4. **On shutdown**, closes Redis connection

### Key Points

- **No manual CSV loading needed**: `init_db.py` runs automatically on container start
- **Idempotent**: Safe to restart containers - data won't be duplicated
- **Development-friendly**: Hot reload enabled in dev mode with source code mounted

## API Endpoints

### Core

- `GET /` — API banner
- `GET /health` — `{ "status": "healthy" }` or 503
- `GET /ready` — Readiness check for container orchestration
- `GET /docs` — Swagger UI (OpenAPI)

### Read-only (cached + rate-limited)

- `GET /api/studies?limit=&offset=` — List studies
- `POST /api/studies/filter?page=&size=` — Paginated filter
  - Filters: `year_list`, `countries`, `repositories`, `pmid`, many booleans, `search_title`, `search_pmid`.
- `POST /api/studies/aggregation/{field}` — Aggregations for charts (`study_location_1`, `repository`, `publication_year`, `age_reported`, `gender_reported`, `sequence_ids_reported`)
- `GET /api/studies/distinct?field=` — DISTINCT values for safelisted columns
- `GET /api/studies/boolean-stats?field=` — Yes/No/NULL distribution
- `GET /api/studies/filter-options` — Static dropdown options
- `POST /api/studies/filter-options-dynamic` — Studies matching current filters
- `GET /api/dashboard/stats` — Totals & year range

### Example API Usage

```bash
# Health
curl -s http://localhost:8000/health

# Dashboard statistics
curl -s http://localhost:8000/api/dashboard/stats | jq

# Filter options
curl -s http://localhost:8000/api/studies/filter-options | jq

# Filter (POST with pagination in query string)
curl -s -X POST "http://localhost:8000/api/studies/filter?page=1&size=10" \
  -H "Content-Type: application/json" \
  -d '{
    "countries": ["Ethiopia", "South Africa"],
    "age_reported": true
  }' | jq
```

## Caching & Rate Limiting

### Response Caching (`cache_json()`)

- **Key format**: `cache:{namespace}:{sha256(path+query+body+version)}`
- **Version key**: `cache:studies:version` (default 1)
- **Typical TTLs**:
  - list/filter: 120s
  - aggregations: 180s
  - filter-options: 600s
  - distinct: 300s
  - dashboard: 180s
- **Global invalidation** (after any data update):
  ```python
  if redis:
      await redis.incr("cache:studies:version")
  ```

### Rate Limiting (fastapi-limiter)

- **Identifier**: Client IP address
- **Key prefix**: `${RATE_LIMIT_NS}:rl:*` (e.g., `sarscov:rl:*`)
- **Defaults**: GET 120/60s, heavier POST 60/60s

## Testing & Verification

### Quick Verification After Startup

```bash
# 1. Check backend health
curl -s http://localhost:8000/health

# 2. Verify data was loaded
docker exec -it prostatecancer-postgres psql -U sarscov_user -d sarscov_db -c "SELECT COUNT(*) FROM studies;"

# Expected output: 216 (or your CSV row count)
```

### Redis end-to-end script

Verifies PING → cache create → TTL → global invalidation → 429s → RL keys:

```bash
chmod +x test_redis.sh
./test_redis.sh
```

### DB sanity check

```bash
docker exec -it prostatecancer-postgres psql -U sarscov_user -d sarscov_db
```

```sql
-- Check total records
SELECT COUNT(*) FROM studies;

-- Check distinct values
SELECT DISTINCT age_reported FROM studies;

-- View sample data
SELECT covidence_id, title, publication_year FROM studies LIMIT 5;
```

### Direct API call

```bash
curl -X POST http://localhost:8000/api/studies/filter-options-dynamic \
  -H "Content-Type: application/json" \
  -d '{
    "countries": ["United States"],
    "year_list": [2023],
    "age_reported": true,
    "gender_reported": true,
    "race_ethnicity_nationality_reported": true
  }'
```

## Security Considerations

### Current Implementation

- **Rate limiting**: IP-based request throttling to prevent abuse
- **CORS**: Configurable origin restrictions
- **Database**: Connection pooling with configurable limits
- **Redis**: Used for ephemeral cache data only (no sensitive information stored)

### Production Recommendations

- **Network isolation**: Don't expose Redis or Postgres ports publicly
- **Redis security**: Enable Redis AUTH and use TLS for production
- **Database credentials**: Use a secret manager (e.g., AWS Secrets Manager, HashiCorp Vault)
- **CORS**: Restrict to specific frontend origins only
- **HTTPS**: Deploy behind a reverse proxy with TLS termination (e.g., nginx, Traefik)
- **Environment separation**: Use separate configurations for dev/staging/prod
- **Database backups**: Implement regular automated backups
- **Monitoring**: Set up alerts for unusual traffic patterns or errors

## Observability & Ops

### Logging

- **Structured logs**: All startup and initialization steps are logged with emojis for easy scanning
- **Request logs**: Access and error logs from Uvicorn/Gunicorn
- **Log persistence**: Logs can be captured to files using the provided command

### Monitoring Recommendations

- **Error capture**: Consider integrating Sentry for error tracking
- **Metrics**: Prometheus exporter for latency, error rate, cache hit ratio, Redis connectivity, 429 counts
- **Tracing**: Optional OpenTelemetry → Jaeger/Tempo for distributed tracing
- **Health checks**: Use `/health` and `/ready` endpoints for orchestration

### Operational Tips

- **View backend logs**: `docker compose logs -f backend`
- **Inspect Redis**:
  ```bash
  docker exec -it prostatecancer-redis redis-cli
  SCAN 0 MATCH "cache:*"
  TTL <key>
  GET cache:studies:version
  SCAN 0 MATCH "sarscov:rl*"
  ```
- **DB shell**: `docker exec -it prostatecancer-postgres psql -U sarscov_user -d sarscov_db`
- **Check container status**: `docker compose ps`
- **View resource usage**: `docker stats`

## Troubleshooting

### Common Issues

**CSV data not loading**

```bash
# Check backend logs for initialization
docker compose logs backend | grep -i "init\|csv\|migration"

# Manually run init_db.py if needed
docker exec -it prostatecancer-backend python /app/init_db.py
```

**"docker-compose.override.yml interfering with startup"**

→ Use explicit `-f docker-compose.yml` flag to bypass override file:

```bash
docker compose -f docker-compose.yml up
```

**Container starts but data is empty**

→ Check if CSV file exists in the backend directory:

```bash
ls -la backend/Processed_Data_DB.csv
docker exec -it prostatecancer-backend ls -la /app/*.csv
```

**Rate-limit error `TypeError: object str can't be used in 'await' expression`**

→ The limiter identifier must be async and passed as a function object. Rebuild with `--no-cache`.

**`ModuleNotFoundError: No module named 'redis'`**

→ Add `redis>=5` to `requirements.txt`. Rebuild:

```bash
docker compose build --no-cache backend
```

**No 429s under burst load**

→ Ensure decorators exist, Redis is healthy, and the identifier returns a stable key.

**Cache not invalidating after data changes**

→ Call `await redis.incr("cache:studies:version")` after successful DB commit.

**CORS blocked**

→ Include your frontend origin(s) in `CORS_ORIGINS` environment variable.

**Port conflicts**

→ Change host ports in `docker-compose.yml` (e.g., `5434:5432`, `8001:8000`).

**Backend keeps restarting**

→ Check logs: `docker compose logs backend`
→ Ensure `WEB_CONCURRENCY` environment variable is set (not empty string)

**Database connection refused**

→ Wait for Postgres to be fully ready (healthcheck should handle this)
→ Check DATABASE_URL is correct
→ Verify network connectivity: `docker compose exec backend ping postgres`

## Development

### Development Mode

The application automatically runs in development mode when using `docker-compose.override.yml` (which is loaded automatically):

- ✅ Source code mounted as volume for hot reload
- ✅ Uvicorn with `--reload` flag
- ✅ All initialization scripts still run
- ✅ Changes to Python files trigger automatic restart

### Local Development (without Docker)

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+asyncpg://sarscov_user:secure_password_123@localhost:5433/sarscov_db
export REDIS_URL=redis://localhost:6379/0
export RUN_ENV=dev

# Run database initialization if needed
python init_db.py

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Using Docker for DB only

```bash
docker compose up -d postgres redis
python main.py
```

### Rebuilding After Code Changes

```bash
# Rebuild backend image
docker compose build backend

# Or rebuild without cache
docker compose build --no-cache backend

# Then restart
docker compose up -d
```

### Adding New Dependencies

```bash
# Add to requirements.txt
echo "new-package>=1.0.0" >> requirements.txt

# Rebuild
docker compose build --no-cache backend
docker compose up -d
```
