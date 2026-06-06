# Native Deployment — Running Each Phase Independently (3-Phase)

> Granular companion to **`DEPLOYMENT_NATIVE.md`**. That guide brings the whole
> dashboard up at once (`run-frontend-backend.sh` = webapp + backend bundled).
> This guide runs the **three phases as three separate scripts**, so you can
> start / stop / verify each one on its own.
>
> Covers a **fresh / reset deployment (Phase 0)** plus **running each phase on
> its own (Phases 1–3)**. The detailed one-time *machine* setup (clone,
> `setup-native-*.sh`, the two `.env` files) still lives in
> `DEPLOYMENT_NATIVE.md` and is referenced from Phase 0a.

## The three phases

| Phase | What | Command | Port |
|---|---|---|---|
| **Phase 1** | DB + Backend (FastAPI/uvicorn, native) | `init-db-native.sh` (1-a, DB) → `run-backend.sh` (1-b, backend) | `:18000` |
| **Phase 2** | Transcript processing (NLP + AI → DB) | `bash scripts/run-pipeline-watch.sh` (AI repo) | — |
| **Phase 3** | Webapp Dashboard (Docker container) | `bash app/Webapp/scripts/run-webapp.sh` | `:3001` |

These map 1:1 to the cross-reference headers inside each script.

## Dependency order

```
Phase 1 (DB + Backend) ─┬─> Phase 2  (writes results into the DB)
                        └─> Phase 3  (proxies API calls to the backend)
```

Start **Phase 1 first**. After that, **Phase 2 and Phase 3 are independent** of
each other — run either, both, or neither.
- Phase 2 only needs the **database** (it writes pipeline results there).
- Phase 3 only needs the **backend** (the webapp proxies every API call to it);
  the page loads without the backend, but shows no patient/doctor data.

---

## Environment variables (one-time, before Phase 0)

There are **five** env files. Copy each `*.example` to its live name and fill in
the values. The live files are **gitignored** — never commit real secrets.
Generate secrets with `openssl rand -hex 32` (API_KEY) / `-hex 16` (DB password).

| # | File | Holds | Key variables |
|---|---|---|---|
| 2.1 | `app/Backend/.env` | dashboard backend | `DATABASE_URL`(+`_SYNC`), `POSTGRES_PASSWORD` (!), `API_KEY` (!), `AZURE_OPENAI_*` (!) (Try & Score), `CORS_ORIGINS`, `REDCAP_*` (optional) |
| 2.2 | `app/Webapp/.env` | webapp → backend | `NEXT_PUBLIC_API_URL=http://host.docker.internal:18000`, `API_KEY` (!) **must equal 2.1** |
| 2.3 | AI repo `.env` | pipeline DB + local NLP | `DATABASE_URL`(+`_SYNC`) **same DB as 2.1**, `NLP_API_URL` (local only), `TRANSCRIPTS_DIR`, `OUTPUT_DIR` |
| 2.4 | AI repo `nlp_classifier_server/gateway/.env` | Phase 2 gateway secret | `NLP_GATEWAY_API_KEY` (!) — auto-read by `run-pipeline-watch.sh` |
| 2.5 | AI repo `ai_pipeline/.env` | Phase 2 AI substep Azure | `AZURE_OPENAI_ENDPOINT` (!), `AZURE_OPENAI_KEY` (!) — `config.yaml` loads this with `override=True` |
| (+) | AI repo `config_remote.yaml` | gateway URL (in git) | `model_uri: "http://10.226.8.205:18080"` |

**Values that must match across files**
- `API_KEY` : `app/Backend/.env` == `app/Webapp/.env` (mismatch ⇒ blank dashboard / "No patients found").
- `DATABASE_URL` (+`_SYNC`, user/pw/db) : `app/Backend/.env` == AI repo `.env`.
- `AZURE_OPENAI_*` : two **consumers** — `app/Backend/.env` (doctor Try & Score) and `ai_pipeline/.env` (Phase 2 AI substep). Each has its own file; use the same Azure resource. The AI substep reads **only** `ai_pipeline/.env` (not the AI repo root `.env`).

> Full variable-by-variable walkthrough with copy-paste `cp` commands and the
> exact expected script output is in the companion **`DEPLOYMENT_3PHASE.txt`**.

---

## Phase 0 — Fresh deployment (initial install / reset)

Do this only for a **first install** or a deliberate **clean reset**. For a
normal restart, skip Phase 0 and go straight to Phase 1.

### Full fresh sequence at a glance

After a **complete teardown** (brew `postgresql@16`/`redis` stopped, `.venv` +
webapp Docker image removed, DB dropped, `data/input|output|archive` cleared),
this is the entire path from nothing to a running dashboard. Run the blocks
**top to bottom**; each is expanded in the sections below.

```bash
# ── Phase 0a — provision the native stack (postgres@16 + redis + .venv) ──
cd Prostate_cancer_consultation_dashboard
bash app/Backend/scripts/setup-native-mac.sh                  # macOS  (Linux: sudo bash app/Backend/scripts/setup-native-linux.sh)

# ── Phase 0c — stage transcripts into the AI repo's data/input/ ──
cp <your-transcripts>/*.xlsx ../AI_physician_patient_communication/data/input/

# ── Phase 1-a — create the DB + migrate to head ──
bash app/Backend/scripts/init-db-native.sh

# ── Phase 1-b — start the backend (detached uvicorn :18000) ──
nohup bash app/Backend/scripts/run-backend.sh > /tmp/backend.log 2>&1 & disown

# ── Phase 2 — process transcripts (REMOTE gateway default) -> writes to DB ──
cd ../AI_physician_patient_communication
bash scripts/run-pipeline-watch.sh --dir data/input           # one-shot, then exit

# ── Phase 3 — start the webapp (image was removed by teardown -> --build) :3001 ──
cd ../Prostate_cancer_consultation_dashboard
bash app/Webapp/scripts/run-webapp.sh --build
```

> **Phase 0b (DB drop) is omitted above** because a freshly-provisioned machine
> has no DB yet. Include it only when resetting a machine that still has data —
> see 0b below.
>
> `.env` files (`app/Backend/.env`, `app/Webapp/.env`,
> `nlp_classifier_server/gateway/.env`) are **preserved across a teardown**; on a
> brand-new machine create them first — see **`DEPLOYMENT_NATIVE.md`**.

### 0a. Provision the native stack (`setup-native-{mac,linux}.sh`)

Run on a **first install** or after a **full teardown** (brew services stopped /
`.venv` removed). The script installs + **starts** `postgresql@16` (port 5433) and
`redis` via brew, creates the Python **`.venv`** and installs all pip deps, and
installs `skopeo`. It is **idempotent** — already-installed brew packages are
skipped.

```bash
cd Prostate_cancer_consultation_dashboard
bash app/Backend/scripts/setup-native-mac.sh            # macOS
# Linux:
sudo bash app/Backend/scripts/setup-native-linux.sh
```

**Expected output** (abridged — a banner per step + a `✓` per item):
```text
=== Step 0: Detect environment
  ✓ brew present at /opt/homebrew/bin/brew
  ✓ Docker Desktop running
=== Step 1: Install brew packages
  ✓ postgresql@16 installed            (or "already installed")
  ✓ set port = 5433 in postgresql.conf
=== Step 2: Start postgresql@16 and redis services
  ✓ postgresql@16 started               (or "already running")
  ✓ redis started
=== Step 3: Python venv + backend requirements
  ✓ .venv created
  ✓ Backend requirements installed (rpy2 NOT included — segmentation uses docker exec)
  ✓ Dev requirements installed
=== Setup complete
```
A `✗` line aborts the script — read it; it names the exact thing to fix.

On a brand-new machine you also need the env files in place (preserved across a
teardown) — see **`DEPLOYMENT_NATIVE.md`**: `app/Backend/.env`, `app/Webapp/.env`,
and for gateway mode `nlp_classifier_server/gateway/.env` (`NLP_GATEWAY_API_KEY`),
`config_remote.yaml` (`model_uri`), `ai_pipeline/.env`. Creating the DB itself is
**Phase 1-a** (`init-db-native.sh`), below.

### 0b. Wipe the database (clean reset)

> ⚠️ **Destructive.** This deletes ALL data (analyses, scores, tracking).
> `init-db-native.sh` does **not** drop an existing database — drop it first.

```bash
cd Prostate_cancer_consultation_dashboard
export PATH="$(brew --prefix postgresql@16)/bin:$PATH"   # macOS: psql on PATH

# (safety net) back up first
PGPASSWORD="<pw>" pg_dump -h localhost -p 5433 -U prostatecancer_user \
    -d prostatecancer_db_native > /tmp/db_backup_$(date +%Y%m%d_%H%M%S).sql

# stop the backend so it releases its DB connections (webapp may stay up)
pkill -f "uvicorn main:app --host 0.0.0.0 --port 18000" || true

# terminate remaining connections, then drop + recreate fresh
psql -h localhost -p 5433 -U "$(whoami)" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='prostatecancer_db_native' AND pid<>pg_backend_pid();"
psql -h localhost -p 5433 -U "$(whoami)" -d postgres -c "DROP DATABASE IF EXISTS prostatecancer_db_native;"
bash app/Backend/scripts/init-db-native.sh        # recreates the DB + runs alembic to head
```

### 0c. Stage transcripts for Phase 2

Phase 2 only processes what is in the AI repo's `data/input/`. After a wipe the
DB is empty, so the dashboard shows no patients until Phase 2 repopulates it —
put the transcripts you want in `data/input/` first.

```bash
cd ../AI_physician_patient_communication
# example: copy the canonical patient transcripts from the archive
cp "data/archive/SID 21 NO PHI.xlsx" data/input/
ls data/input/
```

After Phase 0, continue with **Phase 1 → Phase 2 → Phase 3** below.

---

## Phase 1 — DB + Backend

Phase 1 has two parts — **(1-a) prepare the DB**, then **(1-b) start the
backend**. Both scripts live in `app/Backend/scripts/`.

### 1-a. DB — bootstrap & migrate (`init-db-native.sh`)

Creates the role / database (if absent), applies `database_schema.sql`, then runs
`alembic upgrade head`. Run it on a **first install** or after a **reset**
(Phase 0b). On a normal restart where the DB already exists and is at head this
is a no-op — skip straight to 1-b.

```bash
cd Prostate_cancer_consultation_dashboard
bash app/Backend/scripts/init-db-native.sh    # -> empty DB + full schema (alembic head)
```

**Expected output** (abridged — 6 steps, each a banner + `✓`):
```text
=== Step 0: Sanity checks
  ✓ env loaded: db=prostatecancer_db_native user=prostatecancer_user host=localhost:5433
=== Step 1: postgres reachability
  ✓ postgres listening on localhost:5433
=== Step 2: Pick bootstrap superuser
  ✓ Using superuser: <your-os-user>
=== Step 3: Create role + database
  ✓ role 'prostatecancer_user' created        (or "already exists")
  ✓ database 'prostatecancer_db_native' created
=== Step 4: Confirm app-user connection
  ✓ app credentials work
=== Step 5a: Apply database_schema.sql
  ✓ database_schema.sql applied
=== Step 5b: alembic upgrade head
  ✓ alembic upgrade head complete
  ▸ Current alembic revision (after):  016 (head)
=== Step 6: Verify schema
  ✓ Schema has 19 tables (>= 19 expected)
```

> For a truly fresh DB, DROP it first — see Phase 0b. `init-db-native.sh` does
> NOT drop an existing database.

### 1-b. Backend — start uvicorn (`run-backend.sh`)

`run-backend.sh` starts ONLY the native backend (uvicorn). It does not touch
Docker, the webapp, or the NLP classifier. Postgres + Redis are assumed to be
running already (native brew services). It runs `preflight-native.sh` first
(Postgres auth, alembic at head, redis ping), then `exec`s uvicorn.

```bash
bash app/Backend/scripts/run-backend.sh                 # foreground (Ctrl-C to stop)

# detached (avoids idle SIGTERM in some shells / agents):
nohup bash app/Backend/scripts/run-backend.sh > /tmp/backend.log 2>&1 & disown
```

**Expected output** (abridged — preflight runs first, then the uvicorn banner):
```text
=== PostgreSQL reachability + auth
  ✓ postgres listening on localhost:5433
  ✓ postgres auth OK (prostatecancer_user@prostatecancer_db_native)
=== Redis reachability
  ✓ redis responds PONG
=== NLP-classifiers container (Phase 2 only — soft check)
  ⚠ NLP container 'prostatecancer-nlp-native' not running — dashboard will
    start fine; Phase 2 runs need it.        <-- THIS WARNING IS NORMAL in
                                                 REMOTE mode (no local container)
=== Alembic migration check
  ✓ alembic at head: 016...
  ✓ preflight passed
===============================================================
  Backend FastAPI (native) starting
===============================================================
  host:     0.0.0.0
  port:     18000
  workers:  3
  app:      main:app
  Open: http://localhost:18000/docs
INFO:     Uvicorn running on http://0.0.0.0:18000 (Press CTRL+C to quit)
INFO:     Application startup complete.      <-- backend is ready
```
In detached mode the banner goes to `/tmp/backend.log` — watch it with `tail -f /tmp/backend.log`.

**Verify**
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:18000/docs   # expect 200
```

**Stop**
```bash
# foreground: Ctrl-C
pkill -f "uvicorn main:app --host 0.0.0.0 --port 18000"
```

---

## Phase 2 — Transcript Processing (NLP + AI → DB)

`run-pipeline-watch.sh` runs the NLP + AI pipeline. By default it is **REMOTE
mode**: the NLP classifier (segmentation + 5-model classification) is called
over HTTP at the **server gateway** in `config_remote.yaml`'s `model_uri`
(e.g. `http://10.226.8.205:18080`), so **no local 1.3 GB NLP image / container
is needed**. The AI scoring step (GPT-4o) always calls Azure OpenAI.

```bash
# 1) Place transcripts (.xlsx/.csv) into the AI repo's data/input/
cd ../AI_physician_patient_communication

# 2) Run (REMOTE = gateway, the default)
bash scripts/run-pipeline-watch.sh                  # WATCH mode: process input/, then watch for new drops (Ctrl-C to stop)
bash scripts/run-pipeline-watch.sh --dir data/input # batch the current folder once, then exit

# LOCAL container instead of the gateway:
PIPELINE_REMOTE=0 bash scripts/run-pipeline-watch.sh
```

**Expected output** (abridged — the wrapper prints its mode, then the pipeline runs):
```text
▸ Starting drop-folder WATCH mode (Ctrl-C to stop).
  Drop .xlsx/.csv into data/input/ — each is processed and archived automatically.
  Mode: REMOTE — config_remote.yaml (NLP via the server gateway; no local container).
✓ NLP gateway:  http://10.226.8.205:18080
Tokenizer: remote HTTP → http://10.226.8.205:18080/segment
... per-file logs: segmentation -> classification -> AI scoring -> DB write ...
```
The `WATCH mode` banner prints even with `--dir`; with `--dir` it still processes
`data/input` once and then exits rather than watching.

**Prerequisites (REMOTE / gateway mode)**
- `NLP_GATEWAY_API_KEY` set (auto-read from `nlp_classifier_server/gateway/.env`); otherwise the gateway returns 401.
- The gateway server (`model_uri`, e.g. `10.226.8.205:18080`) is reachable (firewall / VPN).
- `ai_pipeline/.env` has the Azure OpenAI credentials for the AI step.

**Verify** — the log should show the gateway being used:
```
✓ NLP gateway:  http://10.226.8.205:18080
Tokenizer: remote HTTP → http://10.226.8.205:18080/segment
```
```bash
cd ../Prostate_cancer_consultation_dashboard
.venv/bin/python app/Backend/scripts/verify_db.py
```

> ⚠️ Do not call `main_complete_pipeline_db.py` (no `_api`) directly with
> `--dir`/`--file` if you want the gateway — that path runs the **local**
> container (`localhost:8888`) and bypasses the gateway. The gateway is the
> default only via `run-pipeline-watch.sh`.

**Stop**
```bash
pkill -f "run-pipeline-watch.sh"            # or Ctrl-C (WATCH mode)
```

---

## Phase 3 — Webapp Dashboard

`run-webapp.sh` starts ONLY the webapp Docker container
(`docker-compose-frontend.yml`, container `prostatecancer-webapp-native`). It
sources `app/Backend/.env` first so Compose can interpolate `${API_KEY}` — without
that the webapp boots without an API key and the UI shows "No patients found".

```bash
cd Prostate_cancer_consultation_dashboard
bash app/Webapp/scripts/run-webapp.sh                  # start the container (waits for healthy)
bash app/Webapp/scripts/run-webapp.sh --build          # rebuild the image first (after code changes,
                                                       #   or the first run after a teardown removed it)
```

**Expected output** (abridged):
```text
=== Building webapp image ===              (only with --build; ~5-10 min)
=== Starting Docker (webapp only) ===
  Waiting for webapp healthcheck (up to 60s) ...
  ✓ webapp healthy
  Webapp up:  http://localhost:3001
  (Patient/doctor data needs the backend — Phase 1: bash app/Backend/scripts/run-backend.sh)
```
If you see `⚠ webapp not healthy yet` it usually still works — check
`docker logs prostatecancer-webapp-native`.

> After a full teardown the webapp Docker image is gone, so the **first** Phase 3
> run must use `--build`. Subsequent runs can drop it (the image is reused).

**Verify**
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/   # expect 200
# browser: http://localhost:3001
```

**Stop**
```bash
docker compose -f docker-compose-frontend.yml stop webapp
```

---

## Relationship to `run-frontend-backend.sh`

`run-frontend-backend.sh` is the **bundle** (Phase 1 + Phase 3 in one): it starts
the webapp container, runs preflight, then `exec`s the backend. It is kept as a
convenience. The three scripts above are the granular alternative — use them
when you want to manage backend and webapp separately (e.g., restart only the
webapp after a UI change, or run the backend with `--reload`).

```
run-frontend-backend.sh  ==  run-webapp.sh (Phase 3)  +  run-backend.sh (Phase 1)
```

## Troubleshooting (quick)

| Symptom | Cause → Fix |
|---|---|
| "No patients found" / blank dashboard | `app/Webapp/.env` `API_KEY` ≠ `app/Backend/.env` `API_KEY`. Make them equal, restart Phase 3. |
| Backend won't start: "Python venv missing" | Run Phase 0a (`setup-native-*.sh`) — it creates `.venv`. |
| `init-db-native.sh`: "CHANGE_ME" error | `POSTGRES_PASSWORD` still a placeholder in `app/Backend/.env`. |
| Preflight `⚠ NLP container not running` | **Normal** in REMOTE mode — the dashboard does not need it. |
| Phase 2 gateway returns 401 | `NLP_GATEWAY_API_KEY` missing/wrong in `nlp_classifier_server/gateway/.env`. |
| Phase 2 ran but dashboard still empty | Transcripts not staged into AI repo `data/input/`, or the LOCAL container path was used. Re-stage and run via `run-pipeline-watch.sh`. |
| Phase 2 finishes NLP but AI scores are null | `AZURE_OPENAI_*` not set in `ai_pipeline/.env` (the AI substep reads that file, **not** the AI repo root `.env`). |
| Doctor "Try & Score" returns 503 | `AZURE_OPENAI_*` placeholders not replaced in `app/Backend/.env`. |

## See also
- `docs/setup/DEPLOYMENT_3PHASE.txt` — the copy-paste runbook twin of this guide (same phases, with per-variable env setup + expected script output inline).
- `docs/setup/DEPLOYMENT_NATIVE.md` — full one-time setup + the bundled flow.
- AI repo `nlp_classifier_server/README.md`, `DEPLOY.md` — operating the gateway server itself.
