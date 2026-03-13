# Pipeline Implementation Status Analysis

> Last updated: 2026-02-26

---

## What Exists vs What's Missing

### 1. File Management — "fetch, prepare, archive"

| Feature | Corresponding Part | Current Status |
|---------|-------------------|----------------|
| **Fetch** | Retrieving `SID 33 (8).csv` from `prostate_cancer_R01_raw_transcripts_Ella/` | Manual (file is simply placed there) |
| **Prepare** | Converting TurboScribe format (`start,end,text,Speaker 1`) to NLP input format (`speaker,text,Interviewer`) | **No automation code** |
| **Archive** | Moving processed files to `processed/` | **Does not exist** |

`process-data-guille.R` partially handles the prepare step, but this script takes already-converted `processed_transcripts_sid-01.xlsx` as input. **There is no code to convert TurboScribe CSV to this xlsx.**

> **Warning — Unconfirmed Items (Critical Unknown)**
>
> The conversion process from TurboScribe CSV (`SID 33 (8).csv`, columns: `start,end,text,Speaker 1`) to
> NLP input xlsx (`processed_transcripts_sid-01.xlsx`, columns: `speaker,text`)
> **has not been confirmed.**
>
> - **Is it a manual process?** — Does someone manually clean up columns in Excel and map Speaker to `Interviewer`/`Patient`?
> - **Does a separate script exist?** — Is there a conversion script outside this repo?
> - **Are the conversion rules documented?** — What is the mapping logic for `Speaker 1` to `Interviewer`?
>
> **Confirmation and automation of this conversion process remain incomplete.**
> If this is not resolved, someone will have to manually convert files every time a new patient transcript comes in, which seriously undermines reproducibility and scalability.

---

### 2. Process Manager — "calls the AI modules one by one, Michael's for now"

| Feature | Corresponding Part | Current Status |
|---------|-------------------|----------------|
| **AI calls** | Backend's `nlp_service.py` → `nlp-classifiers:8000/predict/{model}` | **Fully Implemented** |
| **Sequential 5-model calls** | `/predict/all` endpoint in `routes_nlp.py` | **Fully Implemented** |
| **Preprocessing (Step 1-3)** | `transcript_service.py`: read xlsx → filter Interviewer → sentence splitting | **Fully Implemented** (replaces R pipeline) |
| **NLP Prediction (Step 4)** | `transcript_service.py` → `nlp_service.predict_batch()` → `r01-nlp-classifiers:8000` | **Fully Implemented** (5 models x batch calls) |
| **Postprocessing (Step 5-7)** | `transcript_service.py`: Top N selection → Context generation → xlsx output | **Fully Implemented** (replaces R pipeline) |
| **Single file analysis** | `routes_transcript.py` → `POST /api/transcript/analyze` | **Fully Implemented** |
| **Batch analysis** | `routes_transcript.py` → `POST /api/transcript/analyze-batch` | **Fully Implemented** |
| **Result download** | `routes_transcript.py` → `GET /download/{patient_id}`, `GET /download-batch` | **Fully Implemented** |

> **Process Manager is fully implemented.**
>
> `transcript_service.py` re-implements the entire `process-data-guille.R` pipeline (Step 1-7) in Python,
> and the results have been verified to be identical to the original R pipeline output (`.pred_1` difference < 0.00005, text/context identical).
>
> **Pipeline Flow:**
> ```
> xlsx upload → Step 1: Read → Step 2: Interviewer filter
>            → Step 3: Sentence splitting → Step 4: 5-model NLP prediction (Docker)
>            → Step 5: Top N selection → Step 6: Context generation (±window, <main> tag)
>            → Step 7: xlsx output (5 sheets: cp, inc, ed, ius, le)
> ```
>
> **Key Files:**
> | File | Role |
> |------|------|
> | `transcript_service.py` | Full pipeline orchestrator (Step 1-7) |
> | `routes_transcript.py` | API endpoints (single/batch analysis, download, history, DB storage) |
> | `nlp_service.py` | NLP Docker container calls + Redis cache + retries |
>
> **API Parameters:**
> - `top_n`: Select top N sentences per model (0 = all, default: 0)
> - `context_window`: Number of surrounding context sentences (default: 3)

---

### 3. State Manager — "insert and read from the database"

| Feature | Corresponding Part | Current Status |
|---------|-------------------|----------------|
| **DB infrastructure** | PostgreSQL in Docker Compose (`prostatecancer-postgres`) | **Fully Implemented** |
| **Result storage (file)** | `routes_transcript.py` → `/app/uploads/{patient_id}_predictions.xlsx` | **Fully Implemented** (existing file system storage maintained) |
| **Result storage (DB)** | `routes_transcript.py` → `_save_to_db()` → `transcript_analysis_log` table | **Fully Implemented** (metadata + JSON results + xlsx binary) |
| **Analysis history tracking** | `GET /api/transcript/history/{patient_id}` → paginated query | **Fully Implemented** |
| **DB fallback download** | `GET /download/{patient_id}`: serves from DB when file missing from disk | **Fully Implemented** (container restart resilience) |
| **Sentence-level predictions (DB)** | `routes_transcript.py` → `_save_to_db()` → `sentence_prediction` table | **Fully Implemented** (per-sentence per-model SQL-queryable rows) |
| **Predictions query** | `GET /api/transcript/predictions/{patient_id}` → filter by model, score, analysis run | **Fully Implemented** |
| **Legacy backfill** | `_backfill_predictions()`: auto-rebuilds `sentence_prediction` rows from `model_results` JSON for pre-existing analysis runs | **Fully Implemented** |

> **State Manager is fully implemented.**
>
> **Two DB tables** permanently store analysis results:
>
> **Table 1: `transcript_analysis_log`** — one row per analysis run:
> - Metadata (patient_id, total_sentences, top_n, context_window, source_filename, analyzed_at)
> - JSON results (model_results TEXT — full scores for all 5 models)
> - xlsx binary (xlsx_data BYTEA — for download fallback)
>
> **Table 2: `sentence_prediction`** — one row per sentence per model:
> - Links to parent analysis via `analysis_id` FK (CASCADE delete)
> - Columns: patient_id, model, sentence_index, utterance_index, sentence_in_utterance, speaker, sentence_text, pred_score, context
> - Enables SQL-level filtering/aggregation (e.g., "all sentences with pred_score >= 0.8 for model cp")
> - Bulk-inserted during `_save_to_db()` after `flush()` to obtain `analysis_id`
> - Legacy backfill: `_backfill_predictions()` auto-rebuilds rows from `model_results` JSON for analysis runs created before this feature
>
> **Design Decisions:**
> - DB failure does not block the existing response (`try/except` + `rollback`)
> - Re-analyzing the same patient_id inserts a new row (history preservation, not upsert)
> - Download serves from DB when file missing from disk (container restart resilience)
> - `init_db.py` auto-creates tables on fresh deployment via `database_schema.sql`
>
> **Related files:**
> | File | Role |
> |------|------|
> | `models.py` | `TranscriptAnalysisLog` + `SentencePrediction` SQLAlchemy models |
> | `database_schema.sql` | DDL: `transcript_analysis_log` + `sentence_prediction` tables + indexes |
> | `routes_transcript.py` | `_save_to_db()` helper + DB fallback + `/history` + `/predictions` endpoints |
> | `patient_doctor_interface_erd.mmd` | ERD diagram reflecting the tables |

---

### 4. Main Pipeline — "calling these modules"

| Feature | Corresponding Part | Current Status |
|---------|-------------------|----------------|
| **Orchestration** | `run_all.sh` (Docker start + tests) | Infrastructure execution only, not a data processing pipeline |
| **End-to-end automation** | `process-data-guille.R` (everything mixed in one script) | No module separation |

---

## Gap Analysis Summary

```
                        Exists                      Missing
                        ──────                      ───────
File Management:                                 x TurboScribe CSV → NLP input conversion
                                                 x Automatic file discovery (fetch)
                                                 x Post-processing archive

Process Manager:        Fully Implemented
                        - Backend NLP calls
                        - 5-model prediction
                        - Top N selection + Context
                        - Single/batch API

State Manager:          Fully Implemented
                        - PostgreSQL infrastructure
                        - NLP results → DB storage (transcript_analysis_log)
                        - Sentence-level predictions → DB (sentence_prediction)
                        - Analysis history tracking (/history)
                        - Predictions query (/predictions) with filters
                        - Legacy backfill (auto-rebuild from JSON)
                        - DB fallback download

Main Pipeline:                                   x End-to-end orchestrator
                                                 (Process Manager + State Manager are
                                                  each complete, but integrated
                                                  orchestration is not implemented)

Testing:                Comprehensive test suite implemented (2026-02-26)
                        - Backend unit/integration: 559 tests (pytest)
                        - Backend E2E: 24 tests (Docker live)
                        - Frontend unit/integration: 279 tests (Jest)
                        - Frontend E2E: 32 tests (Playwright)
                        - test_transcript_pipeline.sh: 10/10
                        - Total: 894 tests — all passing
```

**Conclusion:** Both the Process Manager (`transcript_service.py` + `routes_transcript.py`) and State Manager (`transcript_analysis_log` table + DB storage/query/fallback) are **fully implemented**. The entire functionality of `process-data-guille.R` has been migrated to the Backend API, and analysis results are dual-stored in both the file system and DB. **The only remaining major gap is File Management** (automating the conversion from TurboScribe CSV to NLP input format).

---

## Backend NLP Call Architecture (Current Implementation)

How the Backend currently calls NLP:

```
Client (curl/Frontend)
    |
    |  POST /api/nlp/predict  +  X-API-Key header
    v
Backend (FastAPI - routes_nlp.py)
    |  API Key validation → model name validation
    v
nlp_service.py
    |  1) Check Redis cache (key = model + text SHA256)
    |  2) Cache miss → call NLP container (up to 3 retries)
    v
nlp-classifiers:8000 (Docker internal network)
    |  POST /predict/{model}  →  [{"text": "..."}]
    |  Response: [{".pred_1": 0.87, ".pred_0": 0.13}]
    v
Backend normalizes response → stores in Redis cache (TTL 1 hour) → returns to client
```

### NLP Low-Level API — 6 Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/nlp/health` | NLP service health check |
| `GET /api/nlp/models` | List of 5 models |
| `POST /api/nlp/predict` | Single sentence + single model |
| `POST /api/nlp/predict/batch` | Multiple sentences + single model (max 50) |
| `POST /api/nlp/predict/all` | Single sentence + all 5 models |
| `POST /api/nlp/predict/by-class` | Single sentence + class number (1-5) |

### Transcript Analysis API — 6 Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/transcript/analyze` | Single xlsx file → run full pipeline (Step 1-7) → dual storage (file + DB) |
| `POST /api/transcript/analyze-batch` | Multiple xlsx files → independent analysis per file → dual storage (file + DB) |
| `GET /api/transcript/download/{patient_id}` | Download analysis result xlsx (disk first, DB fallback) |
| `GET /api/transcript/download-batch` | Download multiple patient_id results as zip |
| `GET /api/transcript/history/{patient_id}` | Query analysis history (paginated, from DB) |
| `GET /api/transcript/predictions/{patient_id}` | Query sentence-level predictions (filter by model, min_score, top_n, analysis_id) |

### 8 Key Files

| File | Role |
|------|------|
| `routes_nlp.py` | NLP low-level API endpoint definitions + request validation |
| `routes_transcript.py` | Transcript Analysis API (single/batch analysis + download + history + DB storage) |
| `transcript_service.py` | Full pipeline orchestrator (Step 1-7, replaces R script) |
| `nlp_service.py` | NLP container HTTP calls + retry logic |
| `redis_client.py` | Cache management (text SHA256 key, 1-hour TTL) |
| `models.py` | SQLAlchemy models (`TranscriptAnalysisLog` + `SentencePrediction`) |
| `database_schema.sql` | DDL: all table definitions (`transcript_analysis_log` + `sentence_prediction`) |
| `test_transcript_pipeline.sh` | Full pipeline automated test (includes DB storage + fallback, 10/10 passed) |

### Model Mapping

```
Class 1 → cp  (Cancer Prognosis)
Class 2 → le  (Life Expectancy)
Class 3 → ed  (Erectile Dysfunction)
Class 4 → inc (Incontinence)
Class 5 → ius (Irritative Urinary Symptoms)
```

---

## File Input/Output Relationships

### 1. Raw Input (Ella's Original Transcripts)

**`prostate_cancer_R01_raw_transcripts_Ella/SID 33 (8).csv`**

- Original consultation recording CSV generated by TurboScribe
- Columns: `start`, `end`, `text`, `speaker`
- Speaker: `Speaker 1`, `Speaker 2` (no role distinction)
- Includes timestamps (milliseconds)

### 2. Preprocessed Input (Michael's NLP Input Format)

**`prediction_pipeline_and_results/processed_transcripts_sid-01.xlsx`**

- Columns: `speaker`, `text` (only 2)
- Speaker: `Interviewer`, `Patient` (roles specified)
- Timestamps removed
- 192 rows

### 3. R Pipeline (`process-data-guille.R`)

```
Input: processed_transcripts_sid-01.xlsx
  |
  +- Filter Interviewer sentences only
  +- Split into individual sentences (unnest_tokens)
  +- 5 NLP model predictions (cp, le, ed, inc, ius)
  +- Select Top 5 sentences per model
  +- Generate surrounding 3-sentence Context (<main> tag)
  |
  Output: original-study-physician-predictions-top-context.xlsx
```

### 4. Final Output

**`prediction_pipeline_and_results/original-study-physician-predictions-top-context.xlsx`**

- 5 sheets: `cp`, `inc`, `ed`, `ius`, `le`
- Columns per sheet: `name`, `index`, `i`, `i2`, `speaker`, `text`, `.pred_1`, `context`
- `.pred_1`: model prediction probability (0-1)
- `context`: target sentence marked with `<main>...</main>` tag alongside surrounding context

### 5. Ground Truth (Manual Scoring)

**`manual_scoring_ground_truth/nlp-pilot-manual-scores(cp).csv`**

- Columns: `file`, `i`, `i2`, `speaker`, `sentences`, `score`
- Manually assigned scores (`score`: 0 or 1)
- Currently only available for the `cp` (Cancer Prognosis) model

### Data Flow Summary

```
Ella (TurboScribe)          Michael (NLP)              Ground Truth
──────────────────          ─────────────              ────────────
SID 33 (8).csv     ──>    processed_transcripts       manual_scores(cp).csv
[start,end,text,        _sid-01.xlsx               [file,i,i2,speaker,
 speaker]               [speaker, text]              sentences, score]
      No conversion            |                            |
      automation               |                            |
                    +----------+-----------+                |
                    v                      v                v
           [R path — legacy]     [Backend path — current]  For model
           process-data-        POST /api/transcript/      performance
           guille.R             analyze (or analyze-batch) validation
                    |                      |
                    v                      +──> File system: /app/uploads/
                    |                      |    {patient_id}_predictions.xlsx
                    |                      |
                    |                      +──> PostgreSQL DB:
                    |                           transcript_analysis_log
                    |                           (metadata + JSON + xlsx BYTEA)
                    |                           |
                    v                           v
           original-study-      GET /download/{patient_id}
           physician-             (disk first, DB fallback)
           predictions-         GET /history/{patient_id}
           top-context.xlsx       (paginated analysis history query)
           [5 sheets: cp,inc,
            ed,ius,le]
```

> **The R path and Backend path outputs have been verified to be identical** (`.pred_1` difference < 0.00005, text/indices/context identical).
> Going forward, new transcript analyses should use the Backend API.

**Currently missing:** There is no automation code to convert Ella's TurboScribe CSV (`SID 33 (8).csv`) to Michael's input format (`processed_transcripts_sid-01.xlsx`). This is exactly what the **File Management** module in the Pipeline Architecture is supposed to handle.

---

## Test Infrastructure (Implemented 2026-02-26)

### Comprehensive Test Summary

| Area | Framework | Tests | Docker Required |
|------|-----------|-------|----------------|
| Backend Unit/Integration | pytest + pytest-asyncio + aiosqlite | 559 | No (in-memory SQLite) |
| Backend E2E | pytest + httpx | 24 | Yes |
| Frontend Unit/Integration | Jest + React Testing Library + MSW | 279 | No |
| Frontend E2E | Playwright | 32 | Yes |
| Pipeline Shell | test_transcript_pipeline.sh | 10 | Yes |
| **Total** | | **894** | |

### Running Tests

```bash
# Backend (no Docker required)
cd app/Backend
python -m pytest tests/ -v --tb=short --ignore=tests/e2e

# Frontend (no Docker required)
cd app/Webapp
npm test

# E2E (requires Docker — all 8 containers running)
python -m pytest tests/e2e/ -v -m e2e
npx playwright test --config=e2e/playwright.config.ts
```

### Manual API Testing (curl commands)

When Docker containers are running, you can test the NLP pipeline directly:

#### 1) NLP Service Health Check

```bash
curl -s http://localhost:8000/api/nlp/health \
  -H "X-API-Key: YOUR_API_KEY" | python3 -m json.tool
```

#### 2) Single Sentence — All 5 Models

```bash
curl -s -X POST http://localhost:8000/api/nlp/predict/all \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "You have a low risk of cancer progression."}' | python3 -m json.tool
```

#### 3) Full Pipeline Analysis (xlsx file)

```bash
# Run analysis with the example file
curl -s -X POST http://localhost:8000/api/transcript/analyze \
  -H "X-API-Key: YOUR_API_KEY" \
  -F "file=@prediction_pipeline_and_results/processed_transcripts_sid-01.xlsx" \
  -F "top_n=5" \
  -F "context_window=3" | python3 -m json.tool

# Download result xlsx
curl -s http://localhost:8000/api/transcript/download/sid-01 \
  -H "X-API-Key: YOUR_API_KEY" \
  -o sid-01_predictions.xlsx
```

#### 4) Analysis History Query

```bash
curl -s http://localhost:8000/api/transcript/history/sid-01 \
  -H "X-API-Key: YOUR_API_KEY" | python3 -m json.tool
```

---

## Related Documents

- [ML_PIPELINE_ARCHITECTURE.md](./ML_PIPELINE_ARCHITECTURE.md) — ML pipeline architecture design document
- [ML_PIPELINE_OVERVIEW.md](./ML_PIPELINE_OVERVIEW.md) — Data file relationships and detailed stage-by-stage description
- [COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker.md](./COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker.md) — Comparison of R script vs Docker image + Backend implementation plan
- [ML_PIPELINE_DEVELOPMENT_STATUS.md](./ML_PIPELINE_DEVELOPMENT_STATUS.md) — Original Korean version of this document
