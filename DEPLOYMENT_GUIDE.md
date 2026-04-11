# Deployment Guide — Prostate Cancer Consultation Dashboard

> This guide walks through every step required to deploy the system from a fresh `git clone`. Tested on macOS (Apple Silicon) with Docker Desktop.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone Repositories](#2-clone-repositories)
3. [Configure Environment Variables](#3-configure-environment-variables)
4. [Prepare Patient Transcript Data](#4-prepare-patient-transcript-data)
5. [Verify Docker Volume Paths](#5-verify-docker-volume-paths)
6. [Run the Deployment Script](#6-run-the-deployment-script)
7. [Verify the Deployment](#7-verify-the-deployment)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

| Requirement | Version | Check Command |
|---|---|---|
| **Docker Desktop** | 4.x+ | `docker --version` |
| **Docker Compose** | v2+ (included in Docker Desktop) | `docker compose version` |
| **Git** | 2.x+ | `git --version` |
| **Git LFS** | 3.x+ | `git lfs version` |
| **Python 3** | 3.9+ | `python3 --version` |

### Install Git LFS (if not already installed)

```bash
# macOS
brew install git-lfs
git lfs install

# Ubuntu/Debian
sudo apt-get install git-lfs
git lfs install
```

Git LFS is required because the NLP classifier Docker image (632MB) is stored via Git LFS. Without it, you will get small pointer files instead of the actual image data.

---

## 2. Clone Repositories

Two repositories are needed. They must be siblings in the same parent directory:

```bash
mkdir prostate-cancer-deploy && cd prostate-cancer-deploy

# Main application (Backend + Webapp + NLP classifiers via LFS)
git clone https://github.com/HyunjunA/Prostate_cancer_consultation.git

# AI pipeline + patient transcript data
git clone -b dev/jun https://github.com/jifa83/AI_physician_patient_communication.git
```

After cloning, verify Git LFS files were downloaded:

```bash
cd Prostate_cancer_consultation
git lfs ls-files
# Should list ~19 files (NLP classifier Docker image blobs)

du -sh nlp-classifiers/r01-nlp-classifiers-docker-image/
# Should show ~632MB (NOT a few KB — if it's small, LFS didn't download)
```

If LFS files are missing:
```bash
git lfs pull
```

### Expected Directory Structure

```
prostate-cancer-deploy/
├── Prostate_cancer_consultation/          # This repo
│   ├── app/
│   │   ├── Backend/                       # FastAPI + Docker Compose
│   │   └── Webapp/                        # Next.js frontend
│   ├── nlp-classifiers/                   # NLP Docker image (Git LFS)
│   │   └── r01-nlp-classifiers-docker-image/
│   └── run_all.sh                         # Deployment + test script
│
└── AI_physician_patient_communication/    # Sibling repo (required)
    ├── ai_pipeline/                       # LLM scoring module
    └── data/
        └── input/                         # Patient transcript xlsx files
```

---

## 3. Configure Environment Variables

### 3a. Create `.env` from template

```bash
cd Prostate_cancer_consultation/app/Backend
cp .env.example .env
```

### 3b. Edit `.env` — Required Changes

Open `.env` in a text editor and replace the following `CHANGE_ME` values:

| Variable | Description | Example |
|---|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL database password | `my_secure_db_password_123` |
| `API_KEY` | Backend API authentication key | `sk_live_your_random_key_here` |
| `SECRET_KEY` | JWT signing secret | `your_random_secret_key_here` |

Generate random keys:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 3c. Edit `.env` — Optional: Azure OpenAI (AI Pipeline)

To enable AI pipeline (GPT-4o scoring + patient-facing summary generation), add these lines to `.env`:

```env
# --- Azure OpenAI (AI Pipeline) ---
AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com/
AZURE_OPENAI_KEY=your-azure-openai-key
AZURE_OPENAI_API_VERSION=2024-08-01-preview
AZURE_OPENAI_MODEL=gpt-4o
```

> **Without these variables:** The system will work normally — NLP classification, patient summaries, and the physician dashboard will all function. The AI pipeline (GPT-4o scoring and patient-facing rewriting) will be silently skipped, and `ai_score` / `reformat_sentence` fields will remain empty.

### 3d. Edit `.env` — Optional: REDCap Integration

If you don't use REDCap, set:
```env
REDCAP_ENABLED=False
```

If you do use REDCap:
```env
REDCAP_ENABLED=True
REDCAP_API_URL=https://your-redcap-instance.example.com/api/
REDCAP_API_TOKEN=your_redcap_api_token
```

### Summary of `.env.example` Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_USER` | Yes | `prostatecancer_user` | DB username (default is fine) |
| `POSTGRES_PASSWORD` | **Yes — CHANGE** | `CHANGE_ME` | DB password |
| `POSTGRES_DB` | Yes | `prostatecancer_db` | DB name (default is fine) |
| `API_KEY` | **Yes — CHANGE** | `CHANGE_ME` | API authentication key |
| `SECRET_KEY` | **Yes — CHANGE** | `CHANGE_ME` | JWT signing secret |
| `API_HOST` | Yes | `0.0.0.0` | Keep default |
| `API_PORT` | Yes | `8000` | Keep default |
| `DEBUG` | Yes | `True` | Set `False` for production |
| `AUTH_MODE` | Yes | `api_key` | Authentication mode |
| `CORS_ORIGINS` | Yes | `localhost:3000,5173,8080` | Adjust for your domain |
| `REDCAP_ENABLED` | Yes | `True` | Set `False` if not using REDCap |
| `AZURE_OPENAI_ENDPOINT` | No | (empty) | Azure OpenAI endpoint |
| `AZURE_OPENAI_KEY` | No | (empty) | Azure OpenAI API key |

---

## 4. Prepare Patient Transcript Data

The Backend processes patient consultation transcripts on startup. These files are **not included in the git repo** (PHI data — excluded by `.gitignore`).

### Where to place transcript files

```bash
# Transcripts go in the AI_physician_patient_communication repo:
AI_physician_patient_communication/data/input/

# This directory is mounted into the Backend container as:
# /app/data/transcripts/ (read-only)
```

### Expected file format

- **Format:** `.xlsx` files
- **Naming convention:** `Input_Keystrokes REC 001 (SID 10).xlsx`
  - `SID 10` = patient identifier
- **Content:** Consultation transcript with speaker labels and utterance text

> **Without transcript files:** The system will start normally, but the NLP pipeline will have no data to process. The dashboard will show no patients. You can still use the REST API to upload transcripts later via `POST /api/transcript/analyze`.

---

## 5. Verify Docker Volume Paths

The `docker-compose.yml` (at `app/Backend/docker-compose.yml`) mounts two directories from the `AI_physician_patient_communication` sibling repo:

```yaml
# Patient transcript data
- ../../../AI_physician_patient_communication/data/input:/app/data/transcripts:ro

# AI pipeline module
- ../../../AI_physician_patient_communication/ai_pipeline:/app/ai_pipeline:ro
```

These paths assume the following relative structure from `app/Backend/`:
```
app/Backend/docker-compose.yml
  → ../../../  = 3 levels up = parent of Prostate_cancer_consultation/
  → AI_physician_patient_communication/ = sibling repo
```

### Verify the paths resolve correctly

```bash
# From the repo root:
cd Prostate_cancer_consultation/app/Backend

# Check transcript data path
ls ../../../AI_physician_patient_communication/data/input/
# Should list .xlsx files (or be empty if no transcripts yet)

# Check AI pipeline path
ls ../../../AI_physician_patient_communication/ai_pipeline/
# Should list: __init__.py, pipeline.py, config.yaml, prompts/, utils/, etc.
```

### If paths don't resolve

If your directory structure is different, update the volume mount paths in `docker-compose.yml` to point to the correct locations. The two critical mounts are:

1. `data/input/` → patient transcript xlsx files
2. `ai_pipeline/` → LLM scoring module (Python package)

---

## 6. Run the Deployment Script

```bash
cd Prostate_cancer_consultation
chmod +x run_all.sh
./run_all.sh
```

### What `run_all.sh` does (6 steps)

| Step | Description | Duration |
|---|---|---|
| 1 | Load NLP classifier Docker image from `nlp-classifiers/` (OCI archive) | ~30s |
| 2 | `docker compose up -d --build` — build and start all 10 containers | ~2-5 min |
| 3 | Wait for all containers to pass health checks | ~2-10 min* |
| 4 | Run 5-model NLP analysis test (8 sentences × 5 models) | ~30s |
| 5 | Run 1000-request stress test | ~1-2 min |
| 6 | Print final container status | instant |

> *Step 3 may take up to 10 minutes if AI pipeline is enabled — it processes all patient transcripts through GPT-4o on first startup (5 domains × ~2 min per patient).

### Containers started

| Container | Service | Port |
|---|---|---|
| `prostatecancer-postgres` | PostgreSQL 13 | 127.0.0.1:5433 |
| `prostatecancer-redis` | Redis 7 | internal only |
| `backend-nlp-classifiers-1,2,3` | NLP classifier (3 replicas) | internal only |
| `prostatecancer-scorer` | Consultation scorer | internal only |
| `prostatecancer-rewriter` | Patient summary rewriter | internal only |
| `prostatecancer-backend` | FastAPI Backend | 127.0.0.1:8000 |
| `prostatecancer-webapp` | Next.js Frontend | internal only |
| `prostatecancer-nginx` | Nginx reverse proxy | 127.0.0.1:3001 |

### Log output

All output is saved to `logs/run_all_YYYY-MM-DD_HHMMSS.log`.

---

## 7. Verify the Deployment

After `run_all.sh` completes successfully:

| Service | URL | Description |
|---|---|---|
| **Dashboard** | http://localhost:3000 | Patient/Physician web interface |
| **Backend API** | http://localhost:8000 | FastAPI server |
| **API Docs** | http://localhost:8000/docs | Swagger/OpenAPI documentation |

### Quick API test

```bash
# Replace YOUR_API_KEY with the API_KEY from your .env
curl -s http://localhost:8000/api/doctor/files \
  -H "X-API-Key: YOUR_API_KEY" | python3 -m json.tool
```

### Check container health

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
# All containers should show "healthy"
```

---

## 8. Troubleshooting

### NLP image not loading (Step 1 fails)

```
✗ NLP image directory not found
```

**Cause:** Git LFS files not downloaded.
**Fix:**
```bash
git lfs install
git lfs pull
```

### Backend stuck at "health: starting"

**Cause:** AI pipeline processing transcripts via GPT-4o (normal on first startup).
**Check:** `docker logs prostatecancer-backend --tail 20`
- If you see Azure OpenAI HTTP requests → it's processing, just wait
- If you see connection errors → check `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_KEY` in `.env`

**Timeout:** The healthcheck allows up to 600 seconds (10 minutes). If it exceeds this, the AI pipeline may have an issue. The system will still work without it.

### Azure content filter error

```
content_filter: sexual: filtered=True
```

**Cause:** Azure OpenAI content filter blocks certain medical terms (e.g., erectile dysfunction domain).
**Impact:** That specific domain's AI score will be empty; all other domains process normally.
**Fix:** No action needed — the system handles this gracefully.

### Port conflicts

```
Error: port 8000 already in use
```

**Fix:** Stop the conflicting service, or change ports in `docker-compose.yml`.

### Volume mount errors

```
Error: path not found: ../../../AI_physician_patient_communication
```

**Cause:** The `AI_physician_patient_communication` repo is not cloned as a sibling directory.
**Fix:** Ensure both repos are in the same parent directory (see [Section 2](#2-clone-repositories)).

### Disk space issues

The full deployment requires approximately:
- NLP classifier image: ~632MB
- Docker images (built): ~3-4GB
- PostgreSQL data: ~100MB
- Total: **~5GB minimum free space recommended**

Check available space: `df -h /`

### Stopping the system

```bash
cd app/Backend
docker compose down          # Stop and remove containers
docker compose down -v       # Also remove database volumes (data loss!)
```

### Restarting after changes

```bash
cd app/Backend
docker compose build backend && docker compose up -d backend
# Backend takes ~10-15 seconds to become ready after restart
```

---

## Quick Reference

```bash
# Full deployment from scratch:
git clone https://github.com/HyunjunA/Prostate_cancer_consultation.git
git clone -b dev/jun https://github.com/jifa83/AI_physician_patient_communication.git
cd Prostate_cancer_consultation
cp app/Backend/.env.example app/Backend/.env
# Edit app/Backend/.env (set POSTGRES_PASSWORD, API_KEY, SECRET_KEY)
chmod +x run_all.sh
./run_all.sh

# Access:
# Dashboard:  http://localhost:3000
# API Docs:   http://localhost:8000/docs
```
