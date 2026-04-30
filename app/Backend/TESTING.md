# Backend Testing Guide

This document explains how to run, write, and extend the Backend test suite.

It assumes you are working inside
`app/Backend/`
unless stated otherwise. All commands below are executed from that directory.

---

## 1. Overview

The Backend ships with a multi-layer test suite:

| Layer            | Location                                                                                                                                                  | Purpose                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Unit             | `app/Backend/tests/test_*.py`           | Endpoint-level tests against an in-memory FastAPI app (httpx + ASGITransport).         |
| Auth             | `app/Backend/tests/auth/`               | API key, multi-key, JWT, OAuth2, RBAC access control.                                  |
| DB models        | `app/Backend/tests/db_models/`          | SQLAlchemy model invariants (constraints, defaults, relations).                        |
| Services         | `app/Backend/tests/services/`           | Service-layer logic in isolation (NLP client, transcript service).                     |
| Integration      | `app/Backend/tests/integration/`        | Cross-module flows (auth-mode switching, batch flow, transcript-DB persistence).       |
| E2E              | `app/Backend/tests/e2e/`                | End-to-end flows that exercise the whole stack.                                        |
| Load             | `app/Backend/load_tests/`               | Concurrent multi-client load against a running server (`test_100_doctors.py`).         |

Approximate test count today: ~700 test functions across the suite (excluding load tests).

The suite is built on:

- `pytest 9.x` with `pytest-asyncio` (asyncio_mode = auto)
- `httpx.AsyncClient` + `ASGITransport` to call FastAPI in-process
- `aiosqlite` to give every test an isolated in-memory SQLite database
- `respx` for HTTP mocking of the NLP classifier service
- `monkeypatch` to disable Redis caching and stub the NLP health check

The default fast suite does NOT require Docker, Postgres, Redis, or the NLP container. See section 9 for tests that do.

---

## 2. Prerequisites

- Python 3.10 (see `app/Backend/.python-version`)
- A virtual environment (recommended)
- For load tests, a reachable Backend server (Docker Compose stack or local `uvicorn`)

Install runtime + test dependencies:

```bash
cd app/Backend

python3.10 -m venv .venv
source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt -r requirements-dev.txt
```

Files involved:

- `app/Backend/requirements.txt` — runtime
- `app/Backend/requirements-dev.txt` — pytest, pytest-asyncio, pytest-cov, httpx, aiosqlite, respx
- `app/Backend/requirements.lock` — pinned snapshot used by CI

---

## 3. Quick Start

Run the entire (fast) test suite from the Backend directory:

```bash
cd app/Backend
pytest
```

This runs every test under `tests/` with the in-memory SQLite + mocked dependencies setup. No external services are required.

Common variants:

```bash
# Stop on the first failure
pytest -x

# Run a single file
pytest tests/test_health.py

# Run a single test by node id
pytest tests/test_doctor_endpoints.py::test_doctor_rewrite_log_create

# Match by name substring
pytest -k "rewrite and not redcap"

# Show stdout (helpful for debugging)
pytest -s

# Reduced verbosity
pytest -q
```

The default options come from `app/Backend/pytest.ini`:

```
asyncio_mode = auto
testpaths    = tests
addopts      = -v --tb=short
markers      = e2e, integration, slow
```

---

## 4. Test Suite Structure

```
app/Backend/
├── pytest.ini                    pytest configuration (markers, addopts)
├── pyproject.toml                ruff, mypy, coverage config
├── conftest.py                   (none at Backend root by design)
├── tests/
│   ├── conftest.py               in-memory SQLite engine, AsyncClient, Redis/NLP mocks
│   ├── factories.py              TestDataFactory — model instance helpers
│   ├── test_health.py            /, /health, /ready
│   ├── test_doctor_endpoints.py  doctor rewrites, summaries, REDCap export
│   ├── test_patient_endpoints.py patient summary read/write, domains
│   ├── test_surveys.py           baseline / followup / FACT-G survey routes
│   ├── test_transcript.py        upload, analyze, download, list, delete
│   ├── test_nlp_proxy.py         /api/nlp/* proxy behavior
│   ├── test_redcap.py            REDCap config + export integration
│   ├── auth/
│   │   ├── test_api_key.py
│   │   ├── test_multi_key.py
│   │   ├── test_jwt.py
│   │   ├── test_oauth2.py
│   │   ├── test_access_control.py    role-based permission matrix
│   │   └── test_admin_routes.py      /api/auth/admin/* CRUD for keys/users
│   ├── db_models/
│   │   ├── test_models.py            domain models, constraints, defaults
│   │   └── test_auth_models.py       AuthUser, ApiKey, AuthSession
│   ├── services/
│   │   ├── test_nlp_classifier_client.py
│   │   └── test_transcript_service.py
│   ├── integration/
│   │   ├── test_auth_mode_switch.py
│   │   ├── test_batch_flow.py
│   │   └── test_transcript_db.py
│   └── e2e/
│       └── test_full_flow.py     full upload -> analyze -> persist flow
└── load_tests/
    └── test_100_doctors.py       100 concurrent doctors against /api/track/doctor
```

Discovery rules (from `pytest.ini`):

- Files: `test_*.py`
- Classes: `Test*`
- Functions: `test_*`

---

## 5. Test Environment and Fixtures

### 5.1 What `tests/conftest.py` does for you

Before any application module is imported, `tests/conftest.py` patches a small set of environment variables so that `db.py`, `redis_client.py`, and the auth registry do not raise at import time:

| Variable        | Test default                                    |
| --------------- | ----------------------------------------------- |
| `DATABASE_URL`  | `postgresql+asyncpg://test:test@localhost/test` (placeholder; the real engine is replaced) |
| `API_KEY`       | `test-api-key`                                  |
| `AUTH_MODE`     | `api_key`                                       |
| `REDIS_URL`     | `redis://localhost:6379/0` (Redis is mocked to `None`)                                     |
| `NLP_API_URL`   | `http://nlp-classifiers:8000` (HTTP calls are mocked via respx)                            |

It also adds `app/Backend/` to `sys.path`, so test files can import application modules with bare names (`from db import ...`, `from main import app`, etc.).

### 5.2 Provided fixtures

Defined in `app/Backend/tests/conftest.py`:

| Fixture          | Scope    | What it gives you                                                          |
| ---------------- | -------- | -------------------------------------------------------------------------- |
| `engine`         | function | Async SQLAlchemy engine on `sqlite+aiosqlite://` with all tables created.  |
| `db`             | function | An `AsyncSession` bound to that engine; rolls back on teardown.            |
| `client`         | function | `httpx.AsyncClient` wired to the FastAPI app with `get_db` overridden.     |
| `api_headers`    | function | `{"X-API-Key": "test-api-key"}`                                            |
| `bad_api_headers`| function | `{"X-API-Key": "wrong-key"}` (for negative auth tests)                     |

Inside the `client` fixture:

- The auth registry cache is cleared so a previous test's backend cannot leak.
- `AUTH_MODE` is forced to `api_key` and `API_KEY` to `test-api-key` via `monkeypatch`.
- `redis_client._redis` is set to `None`, so caching is disabled and any code path that tolerates a missing Redis is exercised.
- The NLP health check (`nlp_classifier_client.nlp_health_check` and the local reference in `main`) is replaced with a stub that returns `{"status": "healthy"}`.
- `app.dependency_overrides[get_db]` is wired to the in-memory session.

### 5.3 Test data factory

`app/Backend/tests/factories.py` exposes `TestDataFactory` with helpers for the most common models — `doctor_rewrite()`, `patient_summary()`, `patient_summary_domain()`, `survey_submission()`, `transcript_analysis()`, `sentence_prediction()`, plus a `prediction_set()` bulk helper. Use these instead of constructing model instances by hand so changes to defaults are picked up suite-wide.

### 5.4 Markers

Registered in `pytest.ini` and `tests/conftest.py`:

| Marker         | Use it for                                                       |
| -------------- | ---------------------------------------------------------------- |
| `e2e`          | End-to-end tests requiring the full Docker stack.                |
| `integration`  | Cross-module tests that may need extra setup but no Docker.      |
| `slow`         | Tests that take noticeably longer (load-style, large fixtures).  |

Run a marker subset:

```bash
pytest -m integration
pytest -m "not e2e and not slow"
```

---

## 6. Running Tests by Category

### Unit and endpoint tests (default fast path)

```bash
cd app/Backend
pytest tests/test_health.py \
       tests/test_doctor_endpoints.py \
       tests/test_patient_endpoints.py \
       tests/test_surveys.py \
       tests/test_transcript.py \
       tests/test_nlp_proxy.py \
       tests/test_redcap.py
```

### Auth tests

```bash
pytest tests/auth/
```

These cover the four `AUTH_MODE` backends (`api_key`, `multi_key`, `jwt`, `oauth2`), the access-control matrix, and the admin CRUD routes for keys/users.

### DB model tests

```bash
pytest tests/db_models/
```

Important note: a subset of `tests/db_models/test_models.py` references tables that were dropped in migration 008. Those tests are intentionally skipped at runtime via `pytest.mark.skip`. Ruff is told to ignore `F821` for that file in `pyproject.toml`. Do not delete the skip marker without first updating the tests for the new `PatientSummary` schema.

### Service tests

```bash
pytest tests/services/
```

### Integration tests

```bash
pytest tests/integration/
# or
pytest -m integration
```

### E2E tests

```bash
pytest tests/e2e/
# or
pytest -m e2e
```

The default E2E test (`test_full_flow.py`) runs against the in-memory app; if you add a true Docker-bound test, gate it behind `pytest.mark.e2e` plus a `pytest.mark.skipif(not os.getenv("E2E_DOCKER"), reason="...")` so it does not run in the fast CI path.

---

## 7. Coverage

`pyproject.toml` already configures `[tool.coverage.run]` with sensible omits (`.venv`, `archive`, `migrations/versions`, `tests`, `load_tests`). Run coverage like:

```bash
cd app/Backend

pytest --cov=. --cov-report=term-missing
```

For a browsable HTML report:

```bash
pytest --cov=. --cov-report=html
open htmlcov/index.html
```

Treat coverage as a feedback signal, not a target. There is no enforced coverage threshold yet (see Phase 2 in `.github/workflows/backend-ci.yml`).

---

## 8. Writing New Tests

### 8.1 Conventions

- Use the `client` fixture for any test that hits an endpoint. Do NOT instantiate `TestClient` or `AsyncClient` yourself in a new file — the conftest fixture sets up DB / Redis / NLP / auth in the order the application expects.
- Use `api_headers` for authenticated requests. Use `bad_api_headers` for the negative case.
- Never call `print()` in test code; use `caplog` if you need to inspect log output.
- Prefer `TestDataFactory` helpers over hand-rolled model construction.
- Keep tests deterministic: do not rely on wall-clock time, real Redis, real NLP, or external network. If you must, mark the test `@pytest.mark.slow` (or `@pytest.mark.e2e`) and gate on an env flag.
- Type-hint helper functions (project-wide rule).

### 8.2 Minimal endpoint-test template

```python
# tests/test_my_feature.py

import pytest


async def test_my_endpoint_happy_path(client, api_headers):
    response = await client.post(
        "/api/my-feature",
        headers=api_headers,
        json={"foo": "bar"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_my_endpoint_rejects_bad_key(client, bad_api_headers):
    response = await client.post(
        "/api/my-feature",
        headers=bad_api_headers,
        json={"foo": "bar"},
    )
    assert response.status_code == 401
```

### 8.3 Minimal DB-only test template

```python
# tests/db_models/test_my_model.py

import pytest
from tests.factories import TestDataFactory


async def test_doctor_rewrite_persists(db):
    row = TestDataFactory.doctor_rewrite(file="case-001.xlsx")
    db.add(row)
    await db.commit()

    fetched = (await db.execute(
        # ... select(...).where(...)
    )).scalar_one()
    assert fetched.file == "case-001.xlsx"
```

### 8.4 Mocking the NLP service

The NLP classifier is reached over HTTP. Use `respx` to stub responses:

```python
import respx
from httpx import Response


async def test_nlp_proxy(client, api_headers):
    with respx.mock(base_url="http://nlp-classifiers:8000") as router:
        router.post("/predict").mock(
            return_value=Response(200, json={"score": 0.9})
        )
        r = await client.post("/api/nlp/predict",
                              headers=api_headers,
                              json={"text": "..."})
        assert r.status_code == 200
```

### 8.5 Switching auth modes inside a test

The default `client` fixture forces `AUTH_MODE=api_key`. To test a different mode in one test:

```python
async def test_jwt_mode(monkeypatch, client):
    from auth.registry import _get_backend
    monkeypatch.setenv("AUTH_MODE", "jwt")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    _get_backend.cache_clear()
    # ... call client with Authorization: Bearer <token>
```

See `app/Backend/tests/integration/test_auth_mode_switch.py` for full examples.

---

## 9. Tests That Need a Real Stack

A handful of scenarios cannot be fully exercised by the in-memory fixture:

- True Postgres-only behaviors (e.g. JSONB operators, `pg_trgm`, advisory locks)
- Real Redis caching paths
- Real NLP classifier responses
- Container-level health checks
- Load tests

To bring up the full stack:

```bash
cd app/Backend

# Copy the example env if you have not already
cp .env.example .env

# Start postgres + redis + nlp-classifiers + backend
docker compose up -d
docker compose ps   # verify everything is healthy
```

Then either:

- Run the suite from inside the backend container: `docker exec prostatecancer-backend pytest`
- Or run from the host with `DATABASE_URL` pointing at the published `127.0.0.1:5433` port.

When you tear down: `docker compose down -v` (the `-v` removes the postgres + redis volumes).

---

## 10. Load Tests

Load tests live separately at
`app/Backend/load_tests/` and are NOT collected by `pytest`. They are standalone Python scripts that drive a running server.

### 10.1 100-doctor concurrent load test

The current load test (`test_100_doctors.py`) simulates 100 distinct doctors hitting `/api/track/doctor` concurrently, then verifies `/speakers` and `/actions` admin endpoints for cross-contamination, ordering, and session integrity.

Prerequisites:

- The Backend is reachable (default `http://localhost:8000`).
- An `API_KEY` is available either as an environment variable or in `.env`.

Run from repo root:

```bash
python3 app/Backend/load_tests/test_100_doctors.py
```

Or inside the running container:

```bash
docker exec prostatecancer-backend python3 /app/load_tests/test_100_doctors.py
```

Tunable environment variables:

| Variable                  | Default                  | Meaning                                              |
| ------------------------- | ------------------------ | ---------------------------------------------------- |
| `LOAD_TEST_BASE_URL`      | `http://localhost:8000`  | Where to send requests.                              |
| `LOAD_TEST_DOCTORS`       | `100`                    | Number of distinct simulated doctors.                |
| `LOAD_TEST_CONCURRENCY`   | `100`                    | Max concurrent in-flight requests.                   |
| `LOAD_TEST_GAP_MS`        | `0`                      | Delay between actions (0 = burst, 50 = realistic).   |
| `LOAD_TEST_CLEANUP`       | `true`                   | Whether to delete the synthetic rows when finished.  |
| `API_KEY`                 | (read from env or `.env`)| Required for the `X-API-Key` header.                 |

### 10.2 Historical Locust setup

The previous Locust + asyncio guide is preserved at
`app/Backend/archive/Test/readme.md`.
It is archived because the active load test is now `test_100_doctors.py`. If you choose to bring Locust back, follow that older guide for scenario design and bottleneck diagnosis.

---

## 11. Linting and Static Analysis

Lint must pass for a PR to land. Run locally before pushing:

```bash
cd app/Backend

ruff check . --config pyproject.toml
```

Type checking is configured (loose) but not yet enforced by CI:

```bash
mypy .
```

See `app/Backend/pyproject.toml` for the active rule set and per-file ignores.

---

## 12. CI Pipeline

The Backend CI workflow lives at
`.github/workflows/backend-ci.yml`.

It runs on every PR that touches `app/Backend/**`. The current (Phase 1) gate is intentionally conservative:

1. `ruff check .` — must pass.
2. `pytest --collect-only` — must pass. This proves every test file imports cleanly without actually executing the suite.

Full test execution, mypy, and a coverage threshold are explicitly deferred to Phase 2 — see the comments at the top of the workflow file. The blocker is that several SQLite-based test fixtures stub the Postgres-only JSONB columns; once those fixtures translate cleanly, full pytest can be enabled in CI.

To reproduce the CI gate locally:

```bash
cd app/Backend

ruff check . --config pyproject.toml
DATABASE_URL="postgresql+asyncpg://stub:stub@localhost:5432/stub" pytest --collect-only -q
```

---

## 13. Troubleshooting

### `ImportError: cannot import name 'app' from 'main'`
You are running `pytest` from the wrong directory. Run from the Backend directory so `tests/conftest.py` can prepend it to `sys.path`.

### `sqlalchemy.exc.ArgumentError: Could not parse SQLAlchemy URL ... +asyncpg`
`DATABASE_URL` was not set before importing `db.py`. The conftest sets a default, but if you import application modules in a `conftest.py` that loads earlier, set the env var first or move the import inside the fixture.

### `RuntimeError: Event loop is closed` between tests
You are likely sharing an engine across tests. Use the `engine` and `db` fixtures with their default function scope; do not promote them to session scope.

### Tests pass locally but fail in CI with `ModuleNotFoundError`
Verify `requirements.lock` is up to date. CI installs from the lock file, not from `requirements.txt`. Regenerate the lock file when adding dependencies.

### Auth tests fail with `401` after switching `AUTH_MODE`
You forgot to call `auth.registry._get_backend.cache_clear()`. The registry caches the resolved backend per-process; the `client` fixture clears it once at startup, but a test that flips `AUTH_MODE` mid-test must clear it again.

### Load test fails with `ERROR: API_KEY not found`
Either export `API_KEY` in your shell, or copy it into `.env`. The script reads from env first and falls back to `.env`.

### `respx.MockNotCalledError`
A test stubbed an NLP call but the production code never hit it. Confirm the URL and method match the route the stub expects.

---

## 14. Quick Command Reference

```bash
# Setup
cd app/Backend
python3.10 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# Fast suite
pytest

# Single file or test
pytest tests/test_health.py
pytest tests/test_doctor_endpoints.py::test_doctor_rewrite_log_create

# By marker
pytest -m integration
pytest -m "not e2e and not slow"

# Coverage
pytest --cov=. --cov-report=term-missing
pytest --cov=. --cov-report=html && open htmlcov/index.html

# Lint
ruff check . --config pyproject.toml

# CI gate locally
ruff check . --config pyproject.toml
DATABASE_URL="postgresql+asyncpg://stub:stub@localhost:5432/stub" pytest --collect-only -q

# Full stack via Docker
docker compose up -d
docker compose ps
docker compose down -v

# Load test
python3 app/Backend/load_tests/test_100_doctors.py
```
