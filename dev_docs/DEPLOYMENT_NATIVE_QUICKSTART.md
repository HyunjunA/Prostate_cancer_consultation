# Native Deployment — Quickstart

Condensed deploy reference. For rationale, troubleshooting, and architecture
diagrams see [`DEPLOYMENT_NATIVE.md`](DEPLOYMENT_NATIVE.md).

## Have on hand

- macOS 12+ / Ubuntu 20+ with Homebrew or apt, Docker Desktop running
- NLP OCI archive (~632 MB) from your team's secure storage
- Azure OpenAI endpoint + API key
- (optional) REDCap API token, input transcripts (.xlsx)

---

## One-time setup

```bash
# 0. Clone both repos as siblings
mkdir -p ~/your-workspace && cd ~/your-workspace
git clone -b feat/native-deployment \
    https://github.com/HyunjunA/Prostate_cancer_consultation.git \
    Prostate_cancer_consultation_dashboard
git clone -b feat/native-deploy-docker-exec-stringi \
    https://github.com/jifa83/AI_physician_patient_communication.git \
    AI_physician_patient_communication
cd Prostate_cancer_consultation_dashboard

# 0.5 Place NLP OCI archive
#     copy r01-nlp-classifiers-docker-image/ into:
#     ../AI_physician_patient_communication/nlp-classifiers/

# 1. Install native deps (~3 min)
bash scripts/setup-native-mac.sh        # macOS
# sudo bash scripts/setup-native-linux.sh  # Linux

# 2. Configure env
cp app/Backend/.env.native.example app/Backend/.env.native
cp app/Webapp/.env.native.example  app/Webapp/.env.native
# Edit app/Backend/.env.native — set:
#   POSTGRES_PASSWORD = `openssl rand -hex 16`
#   API_KEY           = `openssl rand -hex 32`
#   AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY  (your Azure resource)
#   REDCAP_API_TOKEN  (optional)
# Update password in DATABASE_URL and DATABASE_URL_SYNC to match.

# 3. Bootstrap DB
bash scripts/init-db-native.sh
```

---

## Daily use

```bash
# A. Stage input transcripts
cp /path/to/Input_*.xlsx ../AI_physician_patient_communication/data/input/

# B. Start full stack (foreground — Ctrl-C to stop)
bash scripts/run-native.sh

# C. (separate terminal) Run pipeline
.venv/bin/python scripts/run-pipeline-standalone.py \
    --dir ../AI_physician_patient_communication/data/input
# add --skip-ai for NLP-only (no Azure cost)

# D. Verify
.venv/bin/python scripts/verify_db.py     # all 7 checks per analysis
.venv/bin/python scripts/show.py --analysis-id N   # inspect one

# Open dashboard
open http://localhost:3001
```

---

## Stop

```bash
# Ctrl-C in the run-native.sh terminal, then:
docker compose -f docker-compose-minimal.yml down
```

---

## Quick reference — ports

- `5433` native postgres
- `6379` native redis
- `8000` native uvicorn (backend)
- `8888` Docker NLP classifiers
- `3001` Docker webapp

---

## Common issues

| Symptom | One-line fix |
|---|---|
| `pg_isready` fails on 5432 | postgres is on 5433 (this project's default); ignore or use `-p 5433` |
| `No module named 'sentence_classification'` | re-pull this repo (commit `b0878ab` adds sibling AI repo to sys.path automatically) |
| `Try & Score` returns 503 | restart uvicorn (PYTHONPATH set on next launch) and check `AZURE_OPENAI_KEY` |
| Backend `/health` 500 on every endpoint | uvicorn workers cached failed import — restart uvicorn after any `pip install` |
| Webapp shows "No patients found" | `.env.native` not sourced before `docker compose up`; `run-native.sh` does this automatically |

For full troubleshooting see `DEPLOYMENT_NATIVE.md`.
