# Backend Dead-Code / No-Longer-Needed Inventory — `app/Backend/`

> **PRIORITY: HIGH.** Cleanup backlog for the Backend. Every item below has been
> checked to be removable **without changing current functionality** (native
> deployment + the wired FastAPI app). Nothing here is auto-deleted — this is the
> investigation + recommended action, to be executed deliberately.

**Method:** router wiring read from `main.py`; per-module reference counts via
import/usage grep across `*.py`; git-tracked vs gitignored status; cross-checked
against the documented conventions (Docker mode = legacy; native is canonical).

---

## A. Safe to remove now — no functional impact (HIGH confidence)

### A-1. `archive/` — retired code committed to git (5 tracked files)
The `archive/` directory is an explicit graveyard. These 5 are **tracked in git**
and not imported by the running app:

| File | What it was | Why it's dead |
|---|---|---|
| `archive/transcript_service.py` | the old in-dashboard transcript pipeline | orchestration moved to the AI repo (`main_complete_pipeline_db*.py`); see the backend developer notes, "archive/decoupled_pipeline" |
| `archive/Test/load_test.py` | locust/load harness | one-off load testing, not part of the suite |
| `archive/Test/locustfile.py` | locust config | same |
| `archive/Test/cleanup_redcap_load_test.py` | load-test teardown | same |
| `archive/Test/debug_redcap_project.py` | ad-hoc REDCap debug script | superseded by `tests/test_redcap.py` + live smoke |

**Action:** `git rm` the 5 tracked files (or the whole tracked `archive/` subset).
**Verify first:** `grep -rE "archive\." --include="*.py" app/Backend | grep -v "/archive/"` → expect no hits (nothing outside archive imports it).

### A-2. `archive/` — untracked local cruft (gitignored)
Not in git, safe to delete from disk: `environment.yml`, `spec-file.txt`,
`test_redis.sh`, `test_data_proc_vis_v5.py`, `csv_db_preprocessor.py`, `start.sh`,
`check_ports.sh`, `routers/studies.py`, `Test/readme*.md`,
`archive/notused/Processed_Data_DB.csv` (a stale data CSV — confirm it carries no
PHI before deleting, then remove).

### A-3. Runtime artifacts (gitignored — clear, don't commit)
- `logs/` — **32 MB / 104 files** of accumulated run logs. Safe to truncate/clear.
- `__pycache__/`, `.pytest_cache/`, `.ruff_cache/` — build/test caches, regenerated.
- `.DS_Store` — macOS cruft; delete and ensure it is gitignored.

---

## B. Outdated content inside files still in use — fix, don't delete (HIGH confidence)

### B-1. `.env.example` references a `.env.native` flow that no longer exists
`app/Backend/.env.example` (lines ~4-7, ~114) instructs:
```
#   cp app/Backend/.env.native.example app/Backend/.env.native
#   .env.native is gitignored (... *.native pattern)
```
But **neither `.env.native.example` nor `.env.native` exists**, and the real
deployment reads plain **`.env`** (`init-db-native.sh`, `run-backend.sh`,
`preflight-native.sh` all source `app/Backend/.env`). The `.env.native`
instructions are dead/misleading.
**Action:** update those comment lines to the actual `cp .env.example .env` flow.

---

## C. Review required — depends on the "retire Docker mode" decision (MEDIUM)

The developer notes state native is canonical and **Docker mode is legacy** (still listed
as `scripts/run-docker.sh up`). The following exist **only to support Docker mode**
and are NOT used by native deployment:

| Item | Used by | Native equivalent |
|---|---|---|
| `init_db.py` | `Dockerfile`, `tests/test_init_db.py` | `app/Backend/scripts/init-db-native.sh` |
| `wait_for_db.py` | Docker entrypoint, `tests/test_wait_for_db.py` | n/a (preflight handles it) |
| `Dockerfile` | Docker build | native uvicorn, no image |
| `scripts/run-docker.sh` + docker-compose (Docker mode) | Docker deploy | `run-frontend-backend.sh` / phase scripts |

**Action:** remove as a group **only if** the team formally retires Docker-mode
deployment. Until then they are required for the legacy path — do NOT remove
piecemeal (removing `init_db.py` alone breaks the Docker image build + its tests).

---

## D. Verified KEEP — in active use (do NOT remove)

All confirmed wired/imported; listed to prevent accidental removal:
- **Routers (all registered in `main.py`)**: `routes_admin_pipeline`, `routes_doctor`,
  `routes_patient`, `routes_surveys`, `routes_system`, `routes_track_doctor`,
  `routes_track_patient_first`, `routes_track_patient_followup`, `routes_track_recordings`.
- **Core**: `main.py`, `app_lifespan.py`, `db.py`, `models.py`, `persistence.py`,
  `core/`, `auth/`, `migrations/`.
- **Ops/CLI (referenced)**: `verify_pipeline_db.py` (used by `routes_admin_pipeline`,
  `inspect_pipeline_run`, `scripts/verify_db.py`, tests), `inspect_pipeline_run.py`,
  `redcap_config.py`, `redis_client.py`, `scripts/` (init-db / preflight / run-backend /
  setup-native / verify_db / show).

---

## Suggested order of execution
1. **B-1** (doc fix — zero risk, prevents future confusion). 
2. **A-3 / A-2** (clear gitignored cruft + logs — zero git impact).
3. **A-1** (`git rm` tracked archive files — commit on a branch; CI/tests unaffected).
4. **C** — only after an explicit decision to drop Docker mode; remove the whole
   group together and update the developer notes / `docs/setup`.

**Post-removal verification (every step):**
`cd app/Backend && pytest -m "not e2e"` (collection + unit), `ruff check .`, and a
native boot (`bash app/Backend/scripts/run-backend.sh` → `:18000/docs` = 200).
