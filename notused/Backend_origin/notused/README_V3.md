# SARS-CoV-2 Research Dashboard — Developer README

A comprehensive web application for filtering and analyzing SARS-CoV-2 research data with a **FastAPI** backend, **PostgreSQL** database, and **Redis** for response caching and request rate limiting.  
This document is for developers who will **build, run, extend, and operate** the service.

---

## Operational Quick Guide

### 1) Pre-run CSV fix

If your CSV's first row causes import issues, clean it **before** bringing the stack up:

```bash
python csv_db_preprocessor.py
```

### 2) Start the stack (and capture logs)

```bash
docker compose up --no-color 2>&1 | tee "logs/compose-$(date +'%Y%m%d-%H%M%S').log"
```

### 3) Connect to Postgres (inside the container)

```bash
docker exec -it prostatecancer-postgres psql -U sarscov_user -d sarscov_db
```

### 4) Quick DB sanity check (SQL)

```sql
SELECT DISTINCT age_reported
FROM studies;
```

### 5) Call the API directly (no container shell)

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
- [Security Notes (Planned)](#security-notes-planned)
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

- Rich filtering (years, countries, repositories, PMIDs, many booleans, text search)
- Aggregations for charts (counts + percentages)
- Static & dynamic filter options
- Redis-backed short-TTL response cache with one-line global invalidation
- Request rate limiting per IP or per user (when JWT is enabled)

## Architecture

```bash
┌──────────────────────────┐      ┌──────────────────┐
│  Frontend / Clients      │─────▶│  FastAPI (app)   │
└──────────────────────────┘      │  - main.py       │
                                  │  - cache_json()  │
                                  │  - RateLimiter   │
                                  └───────┬──────────┘
                                          │ SQLAlchemy (sync)
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

| Service  | Image / Build         | Host→Container | Purpose                  |
| -------- | --------------------- | -------------- | ------------------------ |
| postgres | postgres:13           | 5433 → 5432    | Primary database         |
| backend  | Dockerfile (FastAPI)  | 8000 → 8000    | API server (Uvicorn)     |
| redis    | redis:7               | 6379 → 6379    | Cache & rate-limit store |
| pgadmin  | dpage/pgadmin4:latest | 5050 → 80      | DB management UI         |

Compose network: `prostatecancer-network`. Named volumes: `postgres_data`, `pgadmin_data`, `redis_data`.

## Project Structure

```
sars-cov-2-dashboard/
├── docker-compose.yml            # Compose services & healthchecks
├── Dockerfile                    # Backend container image
├── requirements.txt              # Python deps (redis, fastapi-limiter, PyJWT, ...)
├── start.sh                      # Helper script for up/stop/restart/logs
├── .dockerignore                 # Docker build exclusions
├── .env.example                  # Environment template
├── main.py                       # FastAPI app, routes, Redis init, cache & RL
├── models.py                     # SQLAlchemy models + Pydantic schemas
├── db.py                         # DB engine/session + dependency
├── init_db.py                    # Initial CSV import + table creation
├── wait_for_db.py                # DB readiness (if used)
├── database_schema.sql           # Initial DDL mounted into Postgres init
├── test_redis.sh                 # Redis/cache/rate-limit end-to-end verifier
├── csv_db_preprocessor.py        # CSV first-row cleaner (optional)
├── logs/                         # Collected logs
├── uploads/                      # Uploaded files (future)
├── data/                         # Data files
└── Processed_Data_DB.csv  # Initial data (optional)
```

## Quick Start with Docker

### Prerequisites

- Docker ≥ 20.10
- Docker Compose ≥ 1.29 (or docker compose plugin)

### 0) (Optional) Pre-process the CSV

```bash
python csv_db_preprocessor.py
```

### 1) Clone and Setup

```bash
git clone <repository-url>
cd sars-cov-2-dashboard
chmod +x start.sh

# (Optional) Place your CSV in the repo root (exact name):
# Processed_Data_DB.csv
```

### 2) Start the Application

```bash
# Start all services and capture logs with timestamp
docker compose up --no-color 2>&1 | tee "logs/compose-$(date +'%Y%m%d-%H%M%S').log"

# Or use the helper script
./start.sh

# Or classic compose
docker-compose up --build -d
```

### 3) Access the Application

- **API Docs**: http://localhost:8000/docs
- **API Health**: http://localhost:8000/health
- **pgAdmin**: http://localhost:5050 (default: admin@sarscov.com / admin123)

## Configuration

### Environment Variables (app & compose)

```yaml
# Database
DATABASE_URL: postgresql://sarscov_user:secure_password_123@postgres:5432/sarscov_db
DB_HOST: postgres
DB_PORT: 5432
DB_NAME: sarscov_db
DB_USER: sarscov_user
DB_PASSWORD: secure_password_123

# API
API_HOST: 0.0.0.0
API_PORT: 8000
DEBUG: true

# Security
SECRET_KEY: please-change-in-prod
JWT_SECRET: change_me
JWT_ALG: HS256

# CORS
CORS_ORIGINS:
  ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"]

# Redis
REDIS_URL: redis://redis:6379/0
RATE_LIMIT_NS: sarscov
```

**Production tips**: don't expose Redis publicly; enable AUTH/TLS; store secrets in a secret manager; tighten CORS; rotate keys.

## Runtime Lifecycle

1. Compose starts Postgres and waits for health.
2. Backend runs `init_db.py` (creates tables and imports CSV) then starts Uvicorn.
3. On startup, `main.py`:
   - Creates an async Redis client
   - Initializes fastapi-limiter with an async identifier (JWT sub if present, else client IP)
   - Prepares short-TTL cache helpers (`cache_json`)
4. On shutdown, closes Redis.

## API Endpoints

### Core

- `GET /` — API banner
- `GET /health` — `{ "status": "healthy" }` or 503
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

### Write (planned / disabled by default)

- `POST /api/studies/upload` — CSV upload (commented out; will be protected by JWT + RBAC and will invalidate cache)

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
- **Global invalidation** (after any write/CSV upload):
  ```python
  if redis:
      await redis.incr("cache:studies:version")
  ```

### Rate Limiting (fastapi-limiter)

- **Identifier**: async function — JWT sub if present, else client IP
- **Key prefix**: `${RATE_LIMIT_NS}:rl:*` (e.g., `sarscov:rl:*`)
- **Defaults**: GET 120/60s, heavier POST 60/60s

## Testing & Verification

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
SELECT DISTINCT age_reported FROM studies;
```

### Direct API call (no container shell)

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

## Security Notes (Planned)

- JWT login (`/auth/login`) with `users(email, password_hash, role)`
- RBAC: protect write/admin endpoints (e.g., `/api/studies/upload`, future `/api/admin/*`)
- Brute-force protection: rate-limit `/auth/login` via Redis
- Secrets: rotate `SECRET_KEY`/`JWT_SECRET`, use a secret manager; tighten CORS for prod

## Observability & Ops

- **Logging**: consider structlog JSON logs + request IDs
- **Error capture**: Sentry
- **Metrics**: Prometheus exporter (latency, error rate, cache hit ratio, Redis connectivity, 429 counts)
- **Tracing**: optional OpenTelemetry → Jaeger/Tempo

### Operational tips

- **Inspect Redis**: `SCAN 0 MATCH "cache:*"`, `TTL <key>`, `GET cache:studies:version`, `SCAN 0 MATCH "sarscov:rl*"`
- **Tail logs**: `docker compose logs -f backend`
- **DB shell**: `docker compose exec postgres psql -U sarscov_user -d sarscov_db`

## Troubleshooting

**Rate-limit error `TypeError: object str can't be used in 'await' expression`**
→ The limiter identifier must be async and passed as a function object (no parentheses). Rebuild with `--no-cache`.

**`ModuleNotFoundError: No module named 'redis'`**
→ Add `redis>=5` to `requirements.txt` (remove legacy aioredis). Rebuild.

**`ModuleNotFoundError: No module named 'jwt'`**
→ Add `PyJWT>=2.8.0` to `requirements.txt`. Rebuild.

**No 429s under burst load**
→ Ensure decorators exist, Redis is healthy, and the identifier returns a stable key.

**Cache not changing after write**
→ Call `await redis.incr("cache:studies:version")` after successful DB commit.

**CORS blocked**
→ Include your frontend origin(s) in `CORS_ORIGINS`.

**Port conflicts**
→ Change host ports in `docker-compose.yml` (e.g., `5434:5432`, `8001:8000`).

## Development

### Local Development (without Docker)

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
export REDIS_URL=redis://localhost:6379/0
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Using Docker for DB only

```bash
docker compose up -d postgres
python main.py
```

### Testing basics

```bash
./start.sh start
curl -s http://localhost:8000/health | jq
curl -s http://localhost:8000/api/dashboard/stats | jq
```

## License

[Add your license information here]

## Contributing

[Add contribution guidelines here]

## Support

- Check the [Troubleshooting](#troubleshooting) section
- Review application logs
- Open an issue in the repository
