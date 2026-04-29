# Unit Testing Guide (Backend)

This document explains how to run the Python unit tests in `Prostate_cancer_consultation_dashboard/app/Backend` directly. Integration and E2E tests are out of scope here (Docker required).

---

## 1. Prerequisites

### 1.1 Python version
- **Python 3.10 required.** Some source files (e.g. `verify_pipeline_db.py`) use PEP 604 union syntax (`int | None`), so Python 3.9 will fail at import time.
- The project already ships with a 3.10 virtualenv:
  - `/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv`

### 1.2 Activating the venv (optional)
You do not need to activate the venv if you call its Python by absolute path (recommended below). To activate it in a shell:

```bash
source /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/activate
```

### 1.3 Verifying dependencies
The expected packages should already be installed (`pydantic-settings 2.14`, `pytest 9.x`, `pytest-asyncio`, `aiosqlite`, etc.). For a fresh venv:

```bash
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/pip install -r /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/requirements.txt
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/pip install -r /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/requirements-dev.txt
```

---

## 2. Running unit tests

### 2.1 Layout
- All unit tests live under `Backend/tests/`.
- pytest config: `Backend/pytest.ini` (`asyncio_mode = auto`, `testpaths = tests`).
- Shared fixtures: `Backend/tests/conftest.py` (in-memory SQLite + httpx AsyncClient).

### 2.2 Working directory
Always run pytest from the **Backend/** directory (where `pytest.ini` lives):

```bash
cd /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend
```

### 2.3 Run the entire unit test suite

```bash
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests
```

### 2.4 Skip integration / E2E (unit only)

```bash
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests -m "not integration and not e2e and not slow"
```

### 2.5 DB unit tests only (the 5 new files)

```bash
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest \
  /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests/test_db.py \
  /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests/test_persistence.py \
  /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests/test_init_db.py \
  /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests/test_wait_for_db.py \
  /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests/test_verify_pipeline_db.py
```

### 2.6 Running a single test
By file:
```bash
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests/test_db.py -v
```

By class or function:
```bash
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests/test_db.py::TestGetDb -v
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests/test_db.py::TestGetDb::test_yields_a_session -v
```

By keyword (`-k`):
```bash
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests -k "ready_ping"
```

### 2.7 Stop on first failure / re-run failures only

```bash
# Stop on first failure
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests -x

# Re-run only the tests that failed last time
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests --lf
```

### 2.8 Coverage (pytest-cov already installed)

```bash
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests --cov=/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend --cov-report=term-missing
```

---

## 3. Test markers
Defined in `Backend/pytest.ini`:
- `integration` — integration tests
- `e2e` — Docker-dependent end-to-end tests
- `slow` — long-running tests

For a fast unit-only run, use `-m "not integration and not e2e and not slow"`.

---

## 4. Current DB unit-test inventory

| Source module | Unit tests | Notes |
|---|---|---|
| `db.py` | `tests/test_db.py` | 7 tests |
| `persistence.py` | `tests/test_persistence.py` | 19 tests, 8 skipped (PG-only) |
| `init_db.py` | `tests/test_init_db.py` | 9 tests |
| `wait_for_db.py` | `tests/test_wait_for_db.py` | 11 tests |
| `verify_pipeline_db.py` | `tests/test_verify_pipeline_db.py` | 17 tests |
| `models.py` | `tests/db_models/test_models.py` | model definitions |
| `auth/models.py` | `tests/db_models/test_auth_models.py` | auth models |

Expected outcome: **60 passed, 8 skipped** (on the Python 3.10 venv).

### Why some tests are skipped
- The `transcript_analysis_log.model_results` column uses PostgreSQL `JSONB`.
- The conftest's in-memory SQLite cannot compile `JSONB` (`UnsupportedCompilationError`).
- The same flow is exercised by `tests/integration/test_transcript_db.py` against a real Postgres.

---

## 5. Conventions for new unit tests

### 5.1 File and directory layout
- Unit tests live at `Backend/tests/test_<module>.py`.
- Domain subfolders: `tests/db_models/`, `tests/services/`, `tests/auth/`.
- Integration tests in `tests/integration/`, E2E in `tests/e2e/`.
- File names always follow the `test_*.py` pattern.

### 5.2 Async tests
- `pytest.ini` has `asyncio_mode = auto` enabled.
- Just write `async def test_*()` — no `@pytest.mark.asyncio` decorator needed.

### 5.3 Fixture reuse
- DB fixtures: `engine` (in-memory SQLite engine), `db` (session) — both from `conftest.py`.
- HTTP client: `client` (FastAPI + ASGITransport).
- Auth headers: `api_headers`, `bad_api_headers`.
- Data builders: `tests/factories.py::TestDataFactory`.

### 5.4 Mocking external dependencies
- Never hit a real DB or real network. Use `unittest.mock` (`AsyncMock`, `MagicMock`, `patch`).
- For time-sensitive code, mock `asyncio.sleep` or use `loop.time` `side_effect` to make tests deterministic.
- HTTP: use `respx` (already installed) or `httpx_mock`.

### 5.5 Determinism and independence
- Tests must not depend on execution order. Each test starts from its own fixture state.
- No randomness or wall-clock dependencies. Seed RNGs if needed.

### 5.6 What to test
- Happy path
- Empty / None inputs
- Boundary values (0, 1, very large, negative)
- Error handling (every except branch hit at least once)
- Async functions: both resolve and raise paths

### 5.7 What NOT to test
- Framework boilerplate (FastAPI itself, SQLAlchemy itself).
- Behaviour of third-party libraries.
- Trivial getters/setters.

---

## 6. Common errors and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'pydantic_settings'` | Running with system Python 3.9 | Use the venv Python: `.venv/bin/python -m pytest ...` |
| `TypeError: unsupported operand type(s) for \|: 'type' and 'NoneType'` | PEP 604 syntax under Python 3.9 | Same as above (Python 3.10 venv) |
| `sqlalchemy.exc.UnsupportedCompilationError ... JSONB` | SQLite fixture cannot compile a PG-only column type | Switch to a mocked session, or `pytest.mark.skip` and cover via integration tests |
| `RuntimeError: DB not ready within Ns: None` | `loop.time` `side_effect` too short | Provide at least three values: deadline computation + one loop body + one past-deadline check |
| One test hangs | Leaked async context, or real network call | Verify mocks for `asyncpg.connect` etc. Use `-x --timeout=10` to fail fast |
| `agen never awaited` warning | Exception inside `async for` left the generator un-cleaned | `gen = func(); try/finally: await gen.aclose()` |

---

## 7. CI / extra notes
- Never commit while local tests are red. CI may run a different venv, which makes environment differences harder to debug.
- Tests that depend on env vars must use `monkeypatch.setenv(...)` only — never mutate process env directly.
- Add new builders to `tests/factories.py` so test-data variants are managed in one place.

---

## 8. Cheatsheet

```bash
# Unit tests only (fastest feedback)
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests -m "not integration and not e2e and not slow" -q

# Re-run only the failures from the last run
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests --lf -x

# Filter by keyword
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests -k "wait_for_db"

# Coverage report
/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/.venv/bin/python -m pytest /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/tests --cov=/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend --cov-report=term-missing
```
