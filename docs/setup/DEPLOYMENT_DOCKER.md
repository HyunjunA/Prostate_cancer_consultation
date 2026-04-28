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
│   ├── nlp-classifiers/                   # NLP Docker image (Git LFS) — developed by Michael
│   │   └── r01-nlp-classifiers-docker-image/
│   └── run_all.sh                         # Deployment + test script
│
└── AI_physician_patient_communication/    # Sibling repo (required)
    ├── ai_pipeline/                       # LLM scoring and summary module — developed by Guillermo
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

### 3b. Ready to Use (No Changes Required for Development)

The `.env.example` ships with **shared team keys** that work immediately. For development and testing, **no edits are needed** — just copy and run.

> **For production:** Replace the shared keys below with strong random keys unique to your deployment. These shared keys are for local development only.

### 3c. Shared Keys — Descriptions and Notes

All keys below are pre-configured in `.env.example`. They work as-is for local deployment. Replace them when deploying to a shared or production environment.

| Key | Value in `.env.example` | Description | Production Note |
|---|---|---|---|
| `POSTGRES_PASSWORD` | `secure_password_123` | PostgreSQL database password. Used only within the Docker network — not exposed externally. | Replace with a strong random password. |
| `API_KEY` | `sk_live_046b82a8...` | Backend API authentication key. All API requests must include this in the `X-API-Key` header. | Generate a new key per environment: `python3 -c "import secrets; print('sk_live_' + secrets.token_hex(24))"` |
| `SECRET_KEY` | `your-secret-key-here` | Used for JWT token signing and session security. | Replace with a cryptographically random string. |
| `REDCAP_API_URL` | `https://iredcap.csmc.edu/api/` | Cedars-Sinai iREDCap API endpoint. Survey responses are synced here. | This is the Cedars-Sinai institutional REDCap instance. Other institutions will have a different URL. |
| `REDCAP_API_TOKEN` | (empty) | REDCap API token for the prostate cancer project. Grants read/write access to the project's survey data. | **Must be configured with your own token.** |
| `AZURE_OPENAI_ENDPOINT` | (empty) | Your Azure OpenAI service endpoint URL. Used by the AI pipeline for GPT-4o scoring and patient summary generation. | Required to enable AI pipeline. Get from your Azure OpenAI resource. |
| `AZURE_OPENAI_KEY` | (empty) | Your Azure OpenAI API key. | Required to enable AI pipeline. Get from your Azure OpenAI resource → Keys and Endpoint. |
| `AZURE_OPENAI_MODEL` | `gpt-4o` | The model deployment name in Azure. | Must match the deployment name in your Azure OpenAI resource. |

> **Azure OpenAI keys:** You must configure your own Azure OpenAI credentials.
>
> **REDCap token:** You must configure your own REDCap API token.

### 3d. Summary of All `.env.example` Variables

| Variable | Pre-configured | Description |
|---|---|---|
| `POSTGRES_USER` | `prostatecancer_user` | DB username |
| `POSTGRES_PASSWORD` | `secure_password_123` | DB password |
| `POSTGRES_DB` | `prostatecancer_db` | DB name |
| `API_KEY` | `sk_live_046b82a8...` | API authentication key |
| `SECRET_KEY` | `your-secret-key-here` | JWT signing secret |
| `API_HOST` | `0.0.0.0` | Keep default |
| `API_PORT` | `8000` | Keep default |
| `DEBUG` | `True` | Set `False` for production |
| `AUTH_MODE` | `api_key` | Authentication mode |
| `CORS_ORIGINS` | `localhost:3000,5173,8080` | Adjust for your domain |
| `REDCAP_ENABLED` | `True` | REDCap survey sync |
| `REDCAP_API_URL` | `https://iredcap.csmc.edu/api/` | Cedars-Sinai iREDCap endpoint |
| `REDCAP_API_TOKEN` | (empty) | Configure with your own token |
| `AZURE_OPENAI_ENDPOINT` | (empty) | Your Azure OpenAI endpoint |
| `AZURE_OPENAI_KEY` | (empty) | Your Azure OpenAI API key |
| `AZURE_OPENAI_MODEL` | `gpt-4o` | Azure model deployment name |

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
2. `ai_pipeline/` → LLM scoring and summary module (Python package)

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
# Default dev keys work as-is — no edits needed for prototype
chmod +x run_all.sh
./run_all.sh

# Access:
# Dashboard:  http://localhost:3000
# API Docs:   http://localhost:8000/docs
```
