# Native deployment — three-phase runbook (2026-06-05)

> Base document: `docs/setup/DEPLOYMENT_NATIVE.md`
> Assumes the NLP classifier is reached through the **external gateway API**
> (`http://<gateway-host>:18080`).

## Background and purpose

`DEPLOYMENT_NATIVE.md` describes **two phases**:

- Phase 1 = dashboard and DB (`run-frontend-backend.sh` starts **webapp and backend
  together**)
- Phase 2 = transcript processing (NLP + AI → DB)

This runbook splits that into **three phases** so each step can be started and
verified independently:

| Phase | Contents | Key command |
|---|---|---|
| **Phase 1** | **DB + backend** | `bash app/Backend/scripts/run-backend.sh` |
| **Phase 2** | **Transcript processing (external NLP gateway)** | `bash scripts/run-pipeline-watch.sh` |
| **Phase 3** | **Webapp dashboard** | `bash app/Webapp/scripts/run-webapp.sh` |

The essential separation: `run-frontend-backend.sh` (webapp + backend bundled)
splits into **backend (`run-backend.sh`)** and **webapp
(`docker compose … up -d webapp`)**, so the backend, the pipeline, and the webapp can
each be started, restarted, and verified on their own.

## Dependency order

```
Phase 1 (DB + backend) ─┬─> Phase 2 (writes to the DB)      [needs the DB]
                        └─> Phase 3 (proxies to the backend) [needs the backend]
```

Bring up Phase 1 first; Phases 2 and 3 are then independent of each other.

---

## Phase 0 — one-time setup (gateway mode)

In gateway mode the **local NLP image (`nlp-classifiers/…tar`) is not needed.**

- `bash scripts/setup-native-mac.sh` — postgres@16, redis, `.venv`
- Two `.env` files:
  - Dashboard `app/Backend/.env` — `DATABASE_URL`, Azure credentials (for Try & Score)
  - AI repo — `config_remote.yaml` with `model_uri: "http://<gateway-host>:18080"`,
    `nlp_classifier_server/gateway/.env` with `NLP_GATEWAY_API_KEY=<key>`,
    `ai_pipeline/.env` with Azure credentials
- `bash scripts/init-db-native.sh` — create the DB and run `alembic upgrade head`
- (optional) `bash scripts/check-connections.sh` — reachability of postgres, redis,
  the gateway, and Azure

---

## Phase 1 — DB + backend

With native PostgreSQL (:5433) already running, start only the backend.
`run-backend.sh` touches neither docker nor the webapp — it runs **preflight
(DB, redis, alembic head) plus uvicorn on :18000**.

```bash
cd Prostate_cancer_consultation_dashboard

# only for a fresh or re-initialised database
bash scripts/init-db-native.sh

# start the backend in the foreground (Ctrl-C to stop)
bash app/Backend/scripts/run-backend.sh

# for long-running use, detach to avoid an idle SIGTERM
nohup bash app/Backend/scripts/run-backend.sh > /tmp/backend.log 2>&1 & disown
```

**Verify**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:18000/docs   # expect 200
```

Phase 1 never calls the NLP classifier — the backend only reads the DB — so the
gateway-versus-local distinction is irrelevant here.

---

## Phase 2 — transcript processing (external NLP gateway)

```bash
# 1) stage input: put the transcript (.xlsx/.csv) in data/input/
#    e.g. cp "data/archive/SID 21 NO PHI.xlsx" data/input/

# 2) run (REMOTE, i.e. gateway, is the default)
cd ../AI_physician_patient_communication
bash scripts/run-pipeline-watch.sh          # watch mode: process existing input, then watch for drops
#   process a folder once and exit: bash scripts/run-pipeline-watch.sh --dir data/input

# detach for long runs
nohup bash scripts/run-pipeline-watch.sh --dir data/input > /tmp/phase2.log 2>&1 & disown
```

What runs underneath:

```
main_complete_pipeline_db_api.py --config config_remote.yaml --skip-nlp-startup
```

- `--skip-nlp-startup` → **no local NLP container is started**
- NLP segmentation (`/segment`) and classification (`/predict/{model}`) go over HTTP
  to the **gateway at `<gateway-host>:18080`** (`X-API-Key=NLP_GATEWAY_API_KEY`)
- AI scoring (GPT-4o) always goes to Azure OpenAI (`ai_pipeline/.env`), regardless of
  mode

**Preconditions (gateway mode only)**

- `NLP_GATEWAY_API_KEY` is set (otherwise 401)
- The gateway host on :18080 is reachable (firewall/VPN)
- `model_uri` in `config_remote.yaml` points at that gateway

**Verify**

```bash
# the log should show the gateway being used:
#   ✓ NLP gateway: http://<gateway-host>:18080
#   Tokenizer: remote HTTP → http://<gateway-host>:18080/segment
cd ../Prostate_cancer_consultation_dashboard
.venv/bin/python scripts/verify_db.py
```

⚠️ **Do not leak back to local**: running `main_complete_pipeline_db.py` (without the
`_api` suffix) directly with `--dir`/`--file` goes to the **local container on 8888**
and bypasses the gateway. Always use `run-pipeline-watch.sh`, which defaults to
REMOTE.

---

## Phase 3 — webapp dashboard

The webapp runs as a single Docker container (`prostatecancer-webapp-native`, :3001).
Patient and physician screens fetch data through the **Phase 1 backend**
(`/api/backend/...` proxy), so **Phase 1 must be up.**

```bash
cd Prostate_cancer_consultation_dashboard

bash app/Webapp/scripts/run-webapp.sh            # start the container and wait for health (:3001)
bash app/Webapp/scripts/run-webapp.sh --build    # rebuild the image first, after code changes
```

> `run-webapp.sh` (new, 2026-06-05) is the counterpart to `run-backend.sh` (Phase 1).
> It sources `app/Backend/.env` so compose can interpolate `${API_KEY}` — without
> that the webapp starts without a key and shows "No patients found". The existing
> `run-frontend-backend.sh` (webapp + backend bundled) is left in place.

**Verify**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/   # expect 200
# browser: http://localhost:3001  (patient list / physician dashboard)
```

---

## Stopping (each phase independently)

```bash
# Phase 3 webapp
docker compose -f docker-compose-frontend.yml stop webapp
# Phase 1 backend
pkill -f "uvicorn main:app --host 0.0.0.0 --port 18000"      # or Ctrl-C in the foreground
# Phase 2 pipeline (watch mode)
pkill -f "run-pipeline-watch.sh"                              # or Ctrl-C
```

---

## Actual run on 2026-06-05 (this runbook, verified)

A **fresh native deployment** was performed following exactly this flow:

1. DB drop → `init-db-native.sh` (fresh, alembic head = `016_add_patient_first_mode`)
2. Five canonical inputs in `data/input` (SID 10/14/21/22/24)
3. **Phase 1** backend (:18000) and **Phase 3** webapp (:3001) started
4. **Phase 2** `run-pipeline-watch.sh` (REMOTE) run

**Gateway use proven by the log**

```
✓ NLP gateway:  http://<gateway-host>:18080
Tokenizer: remote HTTP → http://<gateway-host>:18080/segment
```

**Result**: reloaded the DB with analysis = 5, llm = 34, sentence_prediction = 250,
nlp_all_predictions = 1,749, zero errors. All five patients displayed correctly in
the dashboard. (A DB backup was written to a scratch path before the run.)

> Optional next step: fold this three-phase split into `DEPLOYMENT_NATIVE.md` itself,
> and consider dedicated scripts for starting Phases 1 and 3 separately (the
> `run-webapp.sh` pattern).
