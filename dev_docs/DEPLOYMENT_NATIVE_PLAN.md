# Native Deployment Plan (Option Z) — Pre-Implementation Spec

> **Goal**: Provide an **optional** native deployment that reduces the runtime to two Docker containers (NLP-classifiers + Frontend webapp), with everything else (PostgreSQL, Redis, Backend FastAPI, AI Pipeline, R + stringi, Nginx) running natively. **The existing Docker mode keeps working unchanged.**
>
> **Date**: 2026-04-25 (v2 — backward-compatible additive design)
> **Status**: 📝 Plan — awaiting user approval
> **Estimated effort**: ~1.5 days for the full Phase 1–7

---

## 0. ★ Core Principle — Additive Only

**Do not modify existing Docker assets. Native is an *additional* option layered on top.**

→ Users / ops can pick either mode freely:

| Mode | Entry point | Result |
|---|---|---|
| **Docker mode (existing)** | `docker compose up -d` | 8 containers, no behavioral change |
| **Native mode (new)** | `bash scripts/run-native.sh` | 2 containers + native processes |

**Guarantees**:
- ✅ Existing users: `docker compose up` continues to work bit-for-bit
- ✅ The manager: runs the integration test against native mode
- ✅ CI / production: free choice (Docker mode currently recommended)
- ✅ Both modes share the **same schema and the same codebase**

---

## 1. Goals & Scope

### 1-1. Manager requirements
1. Run the AI Pipeline → Database integration **standalone**, with verification
2. **AI Pipeline / Database / Dashboard** must be **fully separate**
3. Drop Docker for everything except **NLP-classifiers** (Michael's third-party image) and **Frontend webapp**
4. The manager personally drives the end-to-end integration test

### 1-2. Locked scope decisions
| Component | Deployment | Reason |
|---|---|---|
| PostgreSQL | **Native** (`brew install postgresql@16`) | Manager request |
| Redis | **Native** (`brew install redis`) or skip | Manager request |
| Backend FastAPI | **Native** (`uvicorn` direct) | Manager request |
| AI Pipeline | **Native** (Python direct) | Manager request (★ critical) |
| R + stringi 1.8.4 | **Native** (`brew install r` + compile) | Manager request |
| Nginx | **Native** (`brew install nginx`) or skip | Manager request |
| **NLP-classifiers** | **Docker (kept)** | Michael's OCI image, no source available |
| **Frontend webapp** | **Docker (kept)** | Explicitly excluded by user |

---

## 2. Current vs Target State

### 2-1. Current (8 Docker containers)
```
prostatecancer-postgres        :5433  → 5432 host mapping
prostatecancer-redis           :6379
prostatecancer-backend         :8000
prostatecancer-webapp          :3001
prostatecancer-nginx           :80
backend-nlp-classifiers-1/2/3  :8000 (internal)
```

### 2-2. Target (2 Docker containers — 75% reduction)
```
[Native processes]
├─ postgresql                           :5432
├─ redis                                :6379
├─ Backend FastAPI (uvicorn)            :8000
├─ AI Pipeline (python)                  (CLI on demand)
└─ R 4.x + stringi 1.8.4 (ICU 74.1)

[Docker — only 2]
├─ nlp-classifiers                      :8001 (Michael)
└─ webapp (Next.js)                     :3001 (frontend)

[Network topology]
Webapp(Docker) ──host.docker.internal:8000──→ Backend(native)
Backend(native) ──localhost:8001──────────────→ NLP(Docker)
Backend(native) ──localhost:5432──────────────→ Postgres(native)
Backend(native) ──localhost:6379──────────────→ Redis(native)
Pipeline(native) ──localhost:5432─────────────→ Postgres(native)
Pipeline(native) ──localhost:8001─────────────→ NLP(Docker)
```

---

## 3. Per-Repo Impact

### 3-1. `Prostate_cancer_consultation_dashboard/` (Backend + Webapp + Docker infra)

#### New files (all additive — existing assets unaffected)
| File | Purpose | Phase |
|---|---|---|
| `scripts/setup-native-mac.sh` | Install all native deps via brew + R + Python venv | 1 |
| `scripts/init-db-native.sh` | Bootstrap native postgres + run alembic upgrade | 2 |
| `scripts/preflight-native.sh` | Native-mode preflight (ICU, DB ready, alembic) | 3 |
| `scripts/run-backend-native.sh` | Native uvicorn launcher | 3 |
| `scripts/run-pipeline-standalone.py` | AI Pipeline standalone CLI | 4 |
| `scripts/check-connections.sh` | Verify postgres / redis / nlp / openai reachability | 5 |
| `scripts/verify_db.py` | 12-stage PASS/FAIL (standalone port of verify_pipeline_db.py) | 5 |
| `scripts/show.py` | One-analysis 12-stage dump (standalone port of inspect_pipeline_run.py) | 5 |
| `scripts/run-native.sh` | Native-mode unified entry (NLP+webapp Docker + native backend) | 6 |
| `scripts/run-docker.sh` | Docker-mode convenience wrapper (optional) | 6 |
| `docker-compose-minimal.yml` | NLP + webapp only (native-mode compose) | 6 |
| `app/Backend/.env.native.example` | Native-mode env template | 2 |
| `app/Webapp/.env.native` | Native-mode webapp config (`NEXT_PUBLIC_API_URL=http://host.docker.internal:8000`) | 6 |
| `dev_docs/DEPLOYMENT_NATIVE.md` | Step-by-step native deployment guide (English) | 7 |
| `dev_docs/DEPLOYMENT_NATIVE_KR.md` | Same, Korean (gitignored) | 7 |
| `dev_docs/DEPLOYMENT_MODES.md` | Two-mode comparison guide — when to use which | 7 |
| `dev_docs/DEPLOYMENT_MODES_KR.md` | Same, Korean (gitignored) | 7 |
| `dev_docs/PIPELINE_DB_FLOW.md` | Pipeline → DB save flow + diagrams | 7 |
| `dev_docs/PIPELINE_DB_FLOW_KR.md` | Same, Korean (gitignored) | 7 |
| `dev_docs/queries/RUNBOOK_PIPELINE.md` | Manager-facing run manual | 7 |
| `dev_docs/queries/RUNBOOK_PIPELINE_KR.md` | Same, Korean (gitignored) | 7 |

#### Modified files (minimised — Docker mode must keep working)
| File | Change | Docker-mode impact | Phase |
|---|---|---|---|
| `app/Backend/.env.example` | Add a single comment: `# Native mode? See .env.native.example` | ✅ none (comment only) | 3 |
| `app/Backend/main.py` | No change — env-only switch | ✅ none | — |
| `app/Backend/db.py` | No change — `DATABASE_URL` env reused | ✅ none | — |
| `docker-compose.yml` | **Untouched.** Native mode uses the new `docker-compose-minimal.yml` | ✅ none | — |
| `prestart.sh` | **Untouched.** Native mode uses the new `scripts/preflight-native.sh` | ✅ none | — |
| `app/Webapp/.env` | **Untouched.** Native mode uses the new `app/Webapp/.env.native` | ✅ none | — |
| `.gitignore` | Add `*.native` pattern (excludes native env files from git) | ✅ none | 7 |

#### Untouched (intentional)
- `app/Backend/persistence.py`
- `app/Backend/ai_pipeline_service.py`
- `app/Backend/pipeline_runner.py`
- `app/Backend/routes_*.py`
- `app/Backend/models.py`
- `app/Backend/migrations/versions/*.py`
- `app/Backend/inspect_pipeline_run.py`
- `app/Backend/verify_pipeline_db.py`
- `app/Backend/routes_admin_pipeline.py`

→ Backend code itself works as-is; only the env switches.

### 3-2. `AI_physician_patient_communication/` (pipeline library)

**Headline**: the library (`sentence_classification/`, `ai_pipeline/`) is **not modified**.

#### Optional consideration
| File | Decision |
|---|---|
| `requirements.txt` | Add `psycopg2-binary`? — or share Backend's venv |
| `main_complete_pipeline.py` | Add a DB hook? — or stick with the standalone runner from Phase 4 |

→ **Decision**: leave the pipeline repo untouched; have `Prostate_cancer_consultation_dashboard/scripts/run-pipeline-standalone.py` import the modules. Keeps separation clean.

---

## 4. Phase Breakdown

### Phase 1: System dependency setup (1h)
**Goal**: One script installs every native dep on the manager's Mac.

**Work**:
1. `scripts/setup-native-mac.sh`
   - brew packages: `postgresql@16`, `redis`, `r`, `python@3.10`, `nginx` (optional)
   - R stringi 1.8.4 source compile (~10 min)
   - Python venv + `pip install -r app/Backend/requirements.txt`
2. `scripts/setup-native-linux.sh` (optional — only if requested)
3. Sanity check: `scripts/check-deps.sh`

**Done when**: `brew services list` shows postgresql/redis registered

### Phase 2: PostgreSQL bootstrap (1h)
**Goal**: Native postgres carries all 12 tables, ready for the pipeline.

**Work**:
1. Create role + database
2. Author `app/Backend/.env.native.example`
3. `scripts/init-db-native.sh`:
   - `createdb prostate` + role/password
   - `cd app/Backend && alembic upgrade head`

**Done when**: `psql -c "\dt" | wc -l` ≥ 19 (18 tables + alembic_version)

### Phase 3: Backend FastAPI native (1h)
**Goal**: Backend runs natively against native DB.

**Work**:
1. `scripts/run-backend-native.sh` with uvicorn
2. Split out `prestart.sh` essentials into `scripts/preflight.sh` (ICU check, wait_for_db, alembic)
3. Pick NLP URL: `NLP_API_URL=http://localhost:8001` (Docker NLP exposed)

**Done when**: `curl http://localhost:8000/health` returns 200, `/docs` loads

### Phase 4: ★ AI Pipeline standalone runner (1.5h)
**Goal**: Manager can run the pipeline without the Backend, watch every DB save in the console.

**Work**:
1. `scripts/run-pipeline-standalone.py`
   - import the pipeline library (sys.path/PYTHONPATH)
   - read DB creds from `.env.native`
   - process one transcript end-to-end (NLP 7 + AI 5)
   - log every INSERT explicitly
2. Add `--verbose / --dry-run / --skip-ai`
3. Confirm with SID_10 → DB row counts increase

**Sample output**:
```
[ENV] DATABASE_URL=postgresql://localhost:5432/postgres
[ENV] NLP_API_URL=http://localhost:8001
[ENV] AZURE_OPENAI_KEY=*** (loaded)
[DB] connected: postgres@localhost:5432

[Step 0] read transcript "data/input/SID_10.xlsx": 344 utterances
[Step 1] filter doctor "Interviewer:": 161 utterances
[Step 2] segment sentences (R stringi via rpy2): 428 sentences
[Step 3] NLP predict via http://localhost:8001
  - cp:  428 done in 2.9s
  - le:  428 done in 2.0s
  - ed:  428 done in 5.0s
  - inc: 428 done in 4.0s
  - ius: 428 done in 8.7s
[Step 4] top-10 selected per domain (50 total)
[Step 5] context window ±3 added
[Step 6] xlsx export: 18,355 bytes

[DB BEGIN TRANSACTION]
[DB INSERT] transcript_analysis_log → id=5
[DB INSERT] sentence_prediction: 50 rows
[DB INSERT] nlp_all_predictions: 428 rows
[DB INSERT] nlp_pipeline_intermediate: 4 JSONB rows
[DB UPSERT] patient_summary: 1 row
[DB UPSERT] patient_summary_domain: 5 rows
[DB COMMIT]

[AI] starting Azure OpenAI pipeline...
[AI Sub 1] scoring 50 sentences (5 domains × 10) ... done in 85s
[AI Sub 2] extraction ... done in 50s
[AI Sub 3] filtering (Python) ... done
[AI Sub 4] selection ... done in 12s
[AI Sub 5] reformat ... done in 8s

[DB BEGIN TRANSACTION]
[DB INSERT] llm_pipeline_intermediate: 50 rows
[DB INSERT] llm_domain_scoring_and_summary: 6 rows
[DB UPDATE] transcript_analysis_log id=5: ai_overall_score=2.14, processed=true
[DB COMMIT]

✅ Pipeline complete in 3m 12s. analysis_id=5
   Verify: python scripts/verify_db.py --analysis-id 5
   Inspect: python scripts/show.py SID_10
```

**Done when**: one transcript processed end-to-end with explicit per-table row counts in the log.

### Phase 5: Verification + inspection tooling (1h)
**Goal**: One command to PASS/FAIL the entire DB layer.

**Work**:
1. `scripts/check-connections.sh`
   - postgres ping, redis ping, NLP `/ping`, Azure OpenAI test call
2. `scripts/verify_db.py` — standalone port of the existing `verify_pipeline_db.py`
3. `scripts/show.py` — standalone port of the existing `inspect_pipeline_run.py`

**Done when**: `python scripts/verify_db.py` prints `PASS 14/14`.

### Phase 6: Docker-compose simplification (30 min)
**Goal**: New compose file launches only NLP + webapp.

**Work**:
1. `docker-compose-minimal.yml` — nlp-classifiers + webapp only
2. Keep the original `docker-compose.yml` for the Docker-mode users
3. Helper: `scripts/run-docker-minimal.sh`
4. Update webapp env: `NEXT_PUBLIC_API_URL=http://host.docker.internal:8000`

**Done when**: `docker ps` shows 4 containers (NLP×3 + webapp×1), no postgres/backend/redis/nginx

### Phase 7: Documentation (2h)
**Goal**: A reader can reproduce the deployment from the docs alone.

**Outputs (English + Korean)**:
1. `dev_docs/DEPLOYMENT_NATIVE.md` (+ `_KR`)
   - Prerequisites, step-by-step commands, troubleshooting, architecture diagram
2. `dev_docs/PIPELINE_DB_FLOW.md` (+ `_KR`)
   - 12-stage data flow, which DB table holds what
3. `dev_docs/queries/RUNBOOK_PIPELINE.md` (+ `_KR`)
   - Manager-facing manual: DB credentials, run command, verification, output interpretation

---

## 5. Decisions Locked vs Open

### Locked
| Item | Decision |
|---|---|
| Docker containers kept | NLP-classifiers + Webapp |
| PostgreSQL | Native install |
| Redis | Native install |
| Backend FastAPI | Native uvicorn |
| AI Pipeline | Native python (standalone CLI) |
| R/stringi | Native install (accuracy-first, ~10 min compile) |
| Frontend | Docker kept |

### Locked decisions (2026-04-25)
| Item | Decision | Impact |
|---|---|---|
| Target OS | **C) Mac + Linux** | Both `setup-native-mac.sh` and `setup-native-linux.sh` (+1h) |
| Nginx | **B) skip** (Backend exposed directly) | No nginx install code; Backend listens on :8000 |
| Webapp → native backend | **A) `host.docker.internal:8000`** | Webapp stays Docker; env file points to host URL |
| Existing Docker DB data | **A) start fresh on native DB** | No `pg_dump` needed; standalone runner fills it |
| Multi-user | **A) each engineer self-installs native** | No shared infra; setup script is the core |

---

## 6. Risks + Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| R stringi 1.8.4 compile fails (ICU mismatch) | 🔴 Pipeline broken | Reuse the Dockerfile's vetted command + check `R -e "stri_info()"` upfront |
| Backend → NLP via host.docker.internal flakey on Mac | 🟡 NLP calls fail | Bind NLP Docker to `127.0.0.1:8001` |
| Webapp ↔ native backend CORS | 🟡 frontend broken | Add `http://localhost:3001` to CORS_ORIGINS |
| Migration order error | 🟡 schema corrupt | Verify with `alembic current` |
| Native postgres ↔ Docker postgres port clash | 🟡 one fails to start | Disable Docker postgres or move ports |
| brew/Python version drift across machines | 🟢 install fails | Pin versions (`python@3.10`, `postgresql@16`) |
| Azure OpenAI key leak | 🔴 security | Placeholder in `.env.native.example`; real key in gitignored `.env.native` |

---

## 7. Verification Plan

### 7-1. Per-phase
- Phase 1: `which postgres redis r psql python` → all paths printed
- Phase 2: `psql -c "\dt" | wc -l` → ≥ 19
- Phase 3: `curl http://localhost:8000/health` → 200 OK
- Phase 4: `python scripts/run-pipeline-standalone.py --file ...` → prints analysis_id
- Phase 5: `python scripts/verify_db.py --analysis-id <id>` → `PASS 14/14`
- Phase 6: `docker ps | wc -l` → 4 (NLP×3 + webapp×1)
- Phase 7: Following the doc end-to-end works

### 7-2. End-to-end demo (for the manager)
```bash
# 1. Bring everything up
brew services start postgresql@16 redis
docker compose -f docker-compose-minimal.yml up -d
bash scripts/run-backend-native.sh &

# 2. Run the pipeline
python scripts/run-pipeline-standalone.py --file data/transcripts/SID_10.xlsx

# 3. Verify the DB
python scripts/verify_db.py
psql -c "SELECT id, patient_id, ai_overall_score, processed FROM transcript_analysis_log"

# 4. Open the dashboard
open http://localhost:3001
```

---

## 8. Hand-off Checklist (when delivering to the manager)

- [ ] `dev_docs/DEPLOYMENT_NATIVE.md` (English) finalized
- [ ] `scripts/setup-native-mac.sh` installs every native dep in one run
- [ ] `.env.native.example` documents every required env var
- [ ] DB connection (host/port/user/password) explicitly documented
- [ ] `scripts/run-pipeline-standalone.py` works one-shot
- [ ] Console output shows every DB INSERT
- [ ] `scripts/verify_db.py` summarises PASS/FAIL
- [ ] `dev_docs/PIPELINE_DB_FLOW.md` includes the diagram
- [ ] `docker-compose-minimal.yml` only defines NLP + webapp
- [ ] Webapp ↔ native backend traffic verified

---

## 9. Priority / Milestones

| Milestone | Phases | Effort | Manager value |
|---|---|---|---|
| **M1: Base environment** | 1, 2 | 2 h | brew install + DB ready |
| **M2: Pipeline standalone** ★ | 3, 4 | 2.5 h | **Manager's primary requirement** — demo-ready |
| **M3: Verification suite** | 5 | 1 h | Automated PASS/FAIL |
| **M4: Docker minimised** | 6 | 30 min | 8 → 2 containers |
| **M5: Hand-off** | 7 | 2 h | Docs complete |

→ M2 is the manager's immediate ask; everything past M2 is incremental.

---

## 10. Next Steps

1. **User reviews + approves this plan**
2. **Answers the open decisions in §5**
3. **Kick off Phase 1** as soon as decisions land
4. Report + verify after each phase

---

## Appendix A — Files NOT touched (reassurance)

The native conversion is almost entirely infrastructure / scripts / docs:
- `app/Backend/persistence.py` ✅ unchanged
- `app/Backend/ai_pipeline_service.py` ✅ unchanged
- `app/Backend/pipeline_runner.py` ✅ unchanged
- `app/Backend/routes_*.py` ✅ unchanged
- `app/Backend/models.py` ✅ unchanged
- `app/Backend/migrations/versions/*.py` ✅ unchanged
- `AI_physician_patient_communication/sentence_classification/*` ✅ unchanged
- `AI_physician_patient_communication/ai_pipeline/*` ✅ unchanged
- `app/Webapp/src/**/*` ✅ unchanged (one env line aside)

→ Zero business-logic change → low regression risk.

---

## Appendix B — Likely traps

1. **PostgreSQL 16 vs 16**: brew's default drifts; pin `postgresql@16`.
2. **R 4.x vs 3.x**: brew's `r` is 4.x — fine.
3. **Apple Silicon vs Intel Mac**: brew prefix differs (`/opt/homebrew` vs `/usr/local`); auto-detect in scripts.
4. **Docker Desktop must be running** for NLP/webapp; show a clear error message.
5. **rpy2 ↔ R**: `R_HOME` is fragile on Apple Silicon.
6. **Postgres "peer authentication"**: native macOS postgres defaults to OS user; explicit password auth needed.

---

**End of document**.
