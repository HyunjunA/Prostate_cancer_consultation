# Prostate Cancer Consultation Dashboard — Integrated System Architecture

> **Version:** 2.1
> **Date:** 2026-03-27 (updated from 2026-03-16)
> **Scope:** AI_physician_patient_communication + Dashboard Backend + Dashboard Webapp
> **Audience:** Developers, researchers, reviewers
>
> **⚠️ Key Change (2026-03-27)**: All dashboard data now comes exclusively from the `AI_physician_patient_communication` pipeline output.
> Legacy fake CSV data is no longer used. Conversion script: `convert_output_to_csv.py` generates 6 CSV files from pipeline output.
>
> **⚠️ AI-Generated Summary (Temporary)**: The patient-facing AI summaries (`patient_summary.summary_class_1~5`) are currently
> a simple concatenation of the top-3 NLP-scored sentences per domain. This is a **temporary implementation** that will be
> replaced by **Guillermo's AI sub-pipeline (Step 9: AI reformat)**, which will generate patient-friendly reformulated summaries.

---

## 1. System Overview

This system analyzes physician–patient consultation transcripts using NLP models, scores communication quality across 5 clinical domains, and presents results through physician and patient dashboards.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLINICAL DATA INGESTION                             │
│                                                                             │
│   Audio Recording → TurboScribe / Keystroke Transcription → De-ID → xlsx   │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
  ┌──────────────────────────┐   ┌──────────────────────────────────────────┐
  │   CLI Pipeline            │   │   Dashboard Platform                     │
  │   (Standalone Analysis)   │   │   (Web Application)                      │
  │                           │   │                                          │
  │   AI_physician_patient_   │   │   Backend ──→ Webapp                     │
  │   communication/          │   │   (FastAPI)    (Next.js)                 │
  └──────────────────────────┘   └──────────────────────────────────────────┘
                    │                              │
                    └──────────┬───────────────────┘
                               ▼
                  ┌──────────────────────────┐
                  │   r01-nlp-classifiers    │
                  │   (NLP Docker × 3)       │
                  │   5 Random Forest Models │
                  └──────────────────────────┘
```

---

## 2. The Two Pipelines

The system has **two independent pipelines** that share the same NLP Docker service.

### 2.1 Comparison

```
┌────────────────────────────┬──────────────────────────────────────────────┐
│  CLI Pipeline              │  Backend Pipeline                            │
│  (AI_physician_patient_    │  (Prostate_cancer_consultation_dashboard/    │
│   communication/)          │   app/Backend/)                              │
├────────────────────────────┼──────────────────────────────────────────────┤
│  Form: CLI (python main_   │  Form: REST API (POST /api/transcript/      │
│        pipeline.py)        │        analyze)                              │
│                            │                                              │
│  Sentence Split: R stringi │  Sentence Split: regex tokenization          │
│  via rpy2 (50/50 match)   │                                              │
│                            │                                              │
│  Output: files only        │  Output: DB (transcript_analysis_log +       │
│  (data/output/)            │  sentence_prediction) + files (uploads/)     │
│                            │                                              │
│  Steps: 1-5 done,         │  Steps: 1-7 done (Backend variant)           │
│         6-10 TODO (AI)     │                                              │
│                            │                                              │
│  Purpose: Research,        │  Purpose: Dashboard real-time integration    │
│  batch analysis, ground    │                                              │
│  truth validation          │                                              │
└────────────────────────────┴──────────────────────────────────────────────┘
```

### 2.2 Shared NLP Service

Both pipelines call the same Docker container for sentence classification:

```
                    ┌─────────────────────────────────┐
                    │    r01-nlp-classifiers:latest    │
                    │    (R + plumber, 3 replicas)     │
                    │    Memory: 2GB each              │
                    ├─────────────────────────────────┤
                    │  POST /predict/{model}           │
                    │                                  │
                    │  Models:                         │
                    │    cp  — Cancer Prognosis        │
                    │    le  — Life Expectancy         │
                    │    ed  — Erectile Dysfunction    │
                    │    inc — Incontinence            │
                    │    ius — Irritative Urinary Sx   │
                    │                                  │
                    │  Input:  [{"text": "..."}]       │
                    │  Output: [{".pred_1": 0.95}]     │
                    │                                  │
                    │  GET /ping → "online"            │
                    └─────────────────────────────────┘
```

---

## 3. CLI Pipeline Architecture (AI_physician_patient_communication)

```
  Input: xlsx/csv (data/input/)
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  main_pipeline.py (CLI Orchestrator)                            │
│                                                                 │
│  ┌───────────┐  ┌──────────────┐  ┌────────────────┐          │
│  │  Step 1   │→│   Step 2     │→│    Step 3      │          │
│  │  Preproc  │  │  Segmentation│  │  Classification│          │
│  │           │  │              │  │                │          │
│  │ Doctor ID │  │ R stringi   │  │ NLP Docker    │          │
│  │ + Filter  │  │ via rpy2    │  │ (5 models)    │          │
│  └───────────┘  └──────────────┘  └───────┬────────┘          │
│                                            │                   │
│  ┌───────────┐  ┌──────────────┐          │                   │
│  │  Step 5   │←│   Step 4     │←─────────┘                   │
│  │  Context  │  │  Selection   │                               │
│  │           │  │              │                               │
│  │ ±3 window │  │ Top-K per   │                               │
│  │ <main>tag │  │ domain      │                               │
│  └─────┬─────┘  └──────────────┘                               │
│        │                                                        │
│        ▼                                                        │
│  data/output/{file}/final/ (5 csv files)                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Steps 6-10 (TODO — AI Sub-Pipeline)                    │   │
│  │                                                         │   │
│  │  Step 6: AI Scoring        Step 8: AI Selector         │   │
│  │  Step 7: AI Extraction     Step 9: AI Reformat         │   │
│  │                            Step 10: DB Persistence      │   │
│  │                                                         │   │
│  │  Output: 4 DataFrames (physician, rewrite,             │   │
│  │          patient, patient_scoring)                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Step-by-Step Details:**

| Step | Module | Algorithm | Key Parameters |
|------|--------|-----------|----------------|
| **Step 1** | `preprocessing.py` | Speaker with longest total text = doctor (dynamic identification). Filters out empty values (`""`, `nan`, `None`), extracts doctor-only utterances | No hardcoded IDs (text-length based) |
| **Step 2** | `segmentation.py` | R `stringi::stri_split_boundaries(text, type="sentence")` via `rpy2`. Exact match with NLP model training tokenizer. Lowercase applied | No NLTK fallback (rpy2 required). 3-level indexing: `index` (global), `i` (utterance#), `i2` (sentence within utterance), all 1-based |
| **Step 3** | `classification.py` | Sends all sentences as batch to each of 5 models. `POST /predict/{model}` | Timeout: **30s**, Retries: **3** (exponential backoff 1s→2s) |
| **Step 4** | `selection.py` | Sort by `.pred_1` DESC, then `index/i/i2` ASC (stable sort for ties). **Includes ties** — all sentences with same score as Nth position included (R `slice_max` behavior) | **K = 10** (default). K=0 returns all sentences (sorted only) |
| **Step 5** | `context.py` | Extract ±W sentences around target. Wrap target in `<main>{text}</main>` tags, join with `"."` delimiter | **Window = ±3** (default) |

**Output Format:**

```
data/output/{filename}/
├── step2_segmentation/segmented_sentences.csv
├── step3_classification/predictions_long.csv
├── step4_selection/top10_by_outcome.xlsx    (5 sheets)
├── step5_context/top10_with_context.xlsx    (5 sheets)
└── final/
    ├── cp.csv    (Cancer Prognosis)
    ├── inc.csv   (Incontinence)
    ├── ed.csv    (Erectile Dysfunction)
    ├── ius.csv   (Irritative Urinary Symptoms)
    └── le.csv    (Life Expectancy)

Final CSV columns (7):
  index, i, i2, speaker, text, .pred_1, context
```

**Excel sheet order:** `cp` → `inc` → `ed` → `ius` → `le`

**Full Configuration (`config.yaml`):**

```yaml
input_path: ./data/input          # Input file path
output_path: ./data/output        # Output results path
archive_path: ./data/archive      # Processed files moved here
error_path: ./data/error          # Failed files moved here
text_column_name: text            # Text column name
speaker_column_name: speaker      # Speaker column name
sid_column_name: ""               # SID column (empty = extract from filename)
file_patterns: ["*.xlsx", "*.csv"] # Input file patterns
poll_interval_sec: 5              # Folder watch interval (seconds)
model_uri: "http://nlp-classifiers:8000"  # NLP Docker URL
outcomes: ["cp", "le", "ed", "inc", "ius"] # Classification domains
top_k: 10                         # Top sentences per domain
context_window: 3                 # Context window size (±)
```

**Key Files:**

| File | Purpose |
|------|---------|
| `main_pipeline.py` | CLI entry point (single file / folder watch) |
| `config.yaml` | 14 configurable keys |
| `config.py` | Config loader + constants (MODEL_TO_FULL, SHEET_ORDER, etc.) |
| `sentence_classification/preprocessing.py` | Step 1: Doctor identification + filtering |
| `sentence_classification/segmentation.py` | Step 2: R stringi sentence tokenization |
| `sentence_classification/classification.py` | Step 3: NLP Docker API calls |
| `sentence_classification/selection.py` | Step 4: Top-K sentence selection |
| `sentence_classification/context.py` | Step 5: Context window extraction |
| `sentence_classification/export.py` | Intermediate + final file export |
| `utils/file_manager.py` | File watch, archive/error movement, patient ID extraction |

**Dependencies:** `pandas`, `openpyxl`, `httpx`, `rpy2`, `pyyaml`

---

## 4. Dashboard Platform Architecture

### 4.1 Docker Compose Services

```
                         localhost:3000
                              │
                    ┌─────────▼──────────┐
                    │      Nginx         │
                    │   (Reverse Proxy)  │
                    │   nginx:alpine     │
                    └────┬──────────┬────┘
                         │          │
              /api/*     │          │     /*
                         ▼          ▼
               ┌──────────┐  ┌──────────┐
               │ Backend  │  │ Webapp   │
               │ FastAPI  │  │ Next.js  │
               │ :8000    │  │ :3000    │
               └──┬───┬───┘  └──────────┘
                  │   │
         ┌────────┘   └────────┐
         ▼                     ▼
  ┌────────────┐     ┌──────────────┐     ┌──────────────────┐
  │ PostgreSQL │     │    Redis     │     │ nlp-classifiers  │
  │   :5432    │     │   :6379     │     │    :8000 (×3)    │
  │ (13)       │     │   (7)       │     │  (R + plumber)   │
  └────────────┘     └──────────────┘     └──────────────────┘

  Network: prostatecancer-network (bridge)
  All ports bound to 127.0.0.1 (localhost only)
```

### 4.2 Service Details

| Service | Image | Port | Health Check | Purpose |
|---------|-------|------|-------------|---------|
| **nginx** | nginx:alpine | 127.0.0.1:3000→80 | curl /nginx-health | Reverse proxy, routes `/api/*` → backend, `/*` → webapp |
| **backend** | Dockerfile (Python 3.10) | 127.0.0.1:8000 | curl /health | FastAPI app, all business logic |
| **webapp** | Dockerfile (Node 18) | internal:3000 | wget :3000 | Next.js frontend |
| **postgres** | postgres:13 | internal:5432 | pg_isready | Primary database |
| **redis** | redis:7 | internal:6379 | redis-cli PING | Cache + rate limiting |
| **nlp-classifiers** | r01-nlp-classifiers | internal:8000 | Rscript health | 5 NLP models (×3 replicas, 2GB each) |

### 4.3 Startup Sequence

```
  postgres ─────► (healthy)
  redis ─────────► (healthy)     ──► backend ─► (healthy) ──► webapp ──► nginx
  nlp-classifiers ► (healthy)
                    (90s start)
```

---

## 5. Backend Architecture (FastAPI)

### 5.1 API Route Structure

```
  /api/
  ├── /health                          GET   Health check
  │
  ├── /doctor/                         Doctor Dashboard Endpoints
  │   ├── /files                       GET   List patient files
  │   ├── /sentences                   GET   Scored sentences
  │   ├── /scores/average              GET   Last-sentence scores per domain
  │   ├── /scores/summary              GET   Score summary per class
  │   ├── /scores/distribution         GET   Class distribution
  │   ├── /score-sentence              POST  Score a single sentence (NLP)
  │   ├── /ai-rewrite                  POST  AI rewrite generation
  │   └── /rewrites                    PUT   Save rewrite
  │
  ├── /patient/                        Patient Dashboard Endpoints
  │   ├── /files                       GET   Patient files
  │   ├── /summaries                   GET   AI summaries per class
  │   ├── /summaries/:file/:speaker    GET   Detailed summary
  │   ├── /scoring                     GET/PUT  Patient scores
  │   └── /responses                   GET/PUT  Patient responses
  │
  ├── /surveys/                        Survey & REDCap Endpoints
  │   └── /submit                      POST  Submit survey (→ REDCap sync)
  │
  ├── /transcript/                     Transcript Analysis (ML Pipeline)
  │   ├── /analyze                     POST  Single file analysis
  │   ├── /analyze-batch               POST  Batch file analysis
  │   ├── /download/:patient_id        GET   Download xlsx (disk → DB fallback)
  │   ├── /download-batch              GET   Zip download (multiple patients)
  │   ├── /history/:patient_id         GET   Analysis history (paginated)
  │   └── /predictions/:patient_id     GET   Sentence-level predictions
  │
  └── /nlp/                            NLP Classifier Proxy
      ├── /predict                     POST  Single sentence → one model
      ├── /predict-batch               POST  Multiple sentences → one model
      ├── /predict-all-models          POST  One sentence → all 5 models
      ├── /predict-by-class            POST  Predict using class number
      └── /health                      GET   NLP service health
```

### 5.2 Backend Pipeline Details (transcript_service.py)

The embedded Backend pipeline is similar to the CLI pipeline but has differences:

**Doctor Identification (CLI vs Backend):**

```
CLI Pipeline:  Dynamic identification by text length (no hardcoded IDs)
Backend:       Hardcoded speaker ID list (8 entries):
                "INTERVIEWER", "INTERVIEWER 1", "INTERVIEWER 2",
                "Interviewer", "Q", "Q1", "Q2", "Q:"
```

**Pipeline Parameters:**

| Parameter | CLI Pipeline | Backend Pipeline |
|-----------|-------------|------------------|
| Sentence split | R `stringi` via `rpy2` | Regex `(?<=[.!?])\s+` |
| Top-N default | **10** | **0** (all sentences; API accepts 0-1000) |
| Context window | **±3** | **±3** (API accepts 0-10) |
| NLP batch size | All at once | **50 sentences** per API call |
| Timeout | 30s | 30s (env: `NLP_TIMEOUT`) |
| Retries | 3 | 3 (env: `NLP_RETRIES`) |
| Result cache | None | Redis **1 hour** TTL (`NLP_CACHE_TTL=3600`) |
| Output | Files only (csv/xlsx) | DB + files (xlsx) |

**NLP Service (nlp_service.py) Details:**

```
HTTP Connection Pool:
  max_connections: 20
  max_keepalive_connections: 10

Cache key format: "nlp:{model}:{SHA256(payload)[:32]}"

Retry backoff: 2^attempt seconds (1s → 2s)
```

**Class Number ↔ Model Mapping:**

```
  Class 1 ↔ cp  (Cancer Prognosis)
  Class 2 ↔ le  (Life Expectancy)
  Class 3 ↔ ed  (Erectile Dysfunction)
  Class 4 ↔ inc (Incontinence)
  Class 5 ↔ ius (Irritative Urinary Symptoms)
```

**Last Sentence Score Query (scores/average API):**

```sql
-- Step 1: Find last utterance per file/speaker/class (max i)
-- Step 2: Find last sentence within that utterance (max i2)
-- Step 3: Return actual score of that sentence
-- → Uses "last sentence score", NOT average
```

### 5.3 Key Backend Files

| File | Lines | Purpose |
|------|-------|---------|
| `main.py` | ~3,500 | FastAPI app definition, middleware, CORS |
| `routes_surveys.py` | ~2,500 | Doctor/Patient/Survey/REDCap endpoints |
| `routes_transcript.py` | ~800 | Transcript analysis API |
| `routes_nlp.py` | ~240 | NLP classifier proxy |
| `transcript_service.py` | ~80 | 7-step pipeline logic |
| `nlp_service.py` | ~80 | NLP Docker HTTP client (httpx, retry, cache) |
| `models.py` | ~410 | SQLAlchemy models + Pydantic schemas |
| `db.py` | ~44 | Database engine, session factory, pooling |
| `auth/` | 12 files | Modular auth (api_key, multi_key, jwt, oauth2) |

### 5.3 Authentication

```
  .env: AUTH_MODE = api_key | multi_key | jwt | oauth2
                       │
            ┌──────────┼──────────┬──────────┐
            ▼          ▼          ▼          ▼
       ┌─────────┐ ┌────────┐ ┌──────┐ ┌────────┐
       │ API Key │ │ Multi  │ │ JWT  │ │ OAuth2 │
       │ (static)│ │ Key    │ │      │ │        │
       │ X-API-  │ │(per-   │ │Bearer│ │External│
       │ Key hdr │ │ user)  │ │token │ │IdP     │
       └─────────┘ └────────┘ └──────┘ └────────┘

  Access Control:
    auth_user (role: admin|user|readonly)
      └── auth_api_key (per user, rotation)
      └── patient_access (read|write|admin per patient)
```

---

## 6. Database Schema

### 6.1 Entity Relationship Diagram

```
  ┌─────────────────────────┐        ┌─────────────────────────────┐
  │   doctor_sentence_view  │        │  transcript_analysis_log    │
  │─────────────────────────│        │─────────────────────────────│
  │ PK: file, i, i2        │        │ PK: id (SERIAL)             │
  │    speaker              │        │    patient_id               │
  │    class_               │        │    total_sentences          │
  │    sentence             │        │    model_results (JSON)     │
  │    score                │        │    xlsx_data (BYTEA)        │
  │    context              │        │    analyzed_at              │
  └────────┬────────────────┘        └────────────┬────────────────┘
           │ FK (file, i, i2)                     │ FK (analysis_id)
           ▼                                      ▼
  ┌─────────────────────────┐        ┌─────────────────────────────┐
  │   doctor_rewrite_log    │        │    sentence_prediction      │
  │─────────────────────────│        │─────────────────────────────│
  │ PK: file, i, i2, time  │        │ PK: id (SERIAL)             │
  │    original_sentence    │        │    analysis_id (FK)         │
  │    revised_sentence     │        │    patient_id, model        │
  │    score                │        │    sentence_text            │
  │    selected             │        │    pred_score, context      │
  └─────────────────────────┘        └─────────────────────────────┘


  ┌─────────────────────────┐
  │    patient_summary      │
  │─────────────────────────│
  │ PK: file, speaker       │
  │    class_ (1-5)         │
  │    summary_text         │
  └────────┬────────────────┘
           │ FK (file, speaker)
           ├──────────────────────────┐──────────────────────┐
           ▼                          ▼                      ▼
  ┌──────────────────┐  ┌──────────────────────┐  ┌───────────────────────┐
  │ patient_summary_ │  │  patient_responses   │  │ survey_submission_log │
  │ scoring          │  │──────────────────────│  │───────────────────────│
  │──────────────────│  │ PK: file, speaker    │  │ PK: id (SERIAL)       │
  │ PK: file, speaker│  │    question_id       │  │    file, speaker      │
  │    score (0-10)  │  │    response_text     │  │    survey_type        │
  │    per class     │  └──────────────────────┘  │    answers (JSON)     │
  └──────────────────┘                             │    redcap_synced      │
                                                   └───────────────────────┘

  ┌─────────────────────────┐
  │      auth_user          │
  │─────────────────────────│
  │ PK: id (SERIAL)         │
  │    username, role        │
  │    is_superuser          │
  └────────┬────────────────┘
           ├─────────────────────┐
           ▼                     ▼
  ┌──────────────────┐  ┌──────────────────────┐
  │  auth_api_key    │  │   patient_access     │
  │──────────────────│  │──────────────────────│
  │ PK: id           │  │ PK: id               │
  │    user_id (FK)  │  │    user_id (FK)      │
  │    key_hash      │  │    patient_id        │
  │    expires_at    │  │    access_type       │
  └──────────────────┘  └──────────────────────┘
```

### 6.2 Key Table Column Details

**doctor_sentence_view** (Physician dashboard core table):

```
  PK: (file, i, i2) — file + utterance# + sentence within utterance
  ┌───────────┬────────────┬──────────────────────────────┐
  │ Column    │ Type       │ Description                  │
  ├───────────┼────────────┼──────────────────────────────┤
  │ file      │ VARCHAR    │ Patient/file identifier      │
  │ i         │ INT        │ Original utterance row (1+)  │
  │ i2        │ INT        │ Sentence within utterance(1+)│
  │ speaker   │ VARCHAR    │ Speaker label                │
  │ class_    │ VARCHAR    │ Domain (1-5, -1=none)        │
  │ sentence  │ TEXT       │ Lowercased sentence text     │
  │ score     │ FLOAT      │ NLP prediction (0.0-1.0)     │
  │ context   │ TEXT       │ ±3 context (<main> tags)     │
  │ time      │ TIMESTAMP  │ Record timestamp             │
  └───────────┴────────────┴──────────────────────────────┘
```

**sentence_prediction** (ML pipeline results):

```
  PK: id (SERIAL), FK: analysis_id → transcript_analysis_log
  ┌──────────────────────┬────────────┬──────────────────────────┐
  │ Column               │ Type       │ Description              │
  ├──────────────────────┼────────────┼──────────────────────────┤
  │ analysis_id          │ INT (FK)   │ Analysis run ID          │
  │ patient_id           │ VARCHAR    │ Patient ID               │
  │ model                │ VARCHAR(10)│ Model (cp,le,ed,inc,ius) │
  │ sentence_index       │ INT        │ Global sentence # (1+)   │
  │ utterance_index      │ INT        │ Original utterance #     │
  │ sentence_in_utterance│ INT        │ Position within utterance│
  │ speaker              │ VARCHAR    │ Speaker                  │
  │ sentence_text        │ TEXT       │ Sentence text            │
  │ pred_score           │ FLOAT      │ Prediction (0.0-1.0)     │
  │ context              │ TEXT       │ Context text             │
  └──────────────────────┴────────────┴──────────────────────────┘
  Indexes: analysis_id, (patient_id, model), pred_score DESC
```

**transcript_analysis_log** (Analysis history):

```
  PK: id (SERIAL)
  ┌──────────────────┬──────────────┬──────────────────────────────┐
  │ Column           │ Type         │ Description                  │
  ├──────────────────┼──────────────┼──────────────────────────────┤
  │ patient_id       │ VARCHAR(255) │ Patient ID (NOT NULL)        │
  │ total_sentences  │ INT          │ Total sentences (default 0)  │
  │ top_n            │ INT          │ Top-N selected (default 0)   │
  │ context_window   │ INT          │ Context window size (def 3)  │
  │ model_results    │ TEXT         │ Per-model results (JSON)     │
  │ xlsx_data        │ BYTEA        │ Result xlsx binary           │
  │ source_filename  │ VARCHAR(500) │ Original filename            │
  │ analyzed_at      │ TIMESTAMPTZ  │ Analysis time (default NOW())│
  └──────────────────┴──────────────┴──────────────────────────────┘
```

**patient_summary_scoring** (Patient self-assessment):

```
  PK: (file, speaker), FK: → patient_summary
  ┌──────────────────────────┬──────┬────────────────────────────┐
  │ Column                   │ Type │ Constraint                 │
  ├──────────────────────────┼──────┼────────────────────────────┤
  │ class_1_patient_scoring  │ INT  │ CHECK (0 ≤ val ≤ 10)      │
  │ class_2_patient_scoring  │ INT  │ CHECK (0 ≤ val ≤ 10)      │
  │ class_3_patient_scoring  │ INT  │ CHECK (0 ≤ val ≤ 10)      │
  │ class_4_patient_scoring  │ INT  │ CHECK (0 ≤ val ≤ 10)      │
  │ class_5_patient_scoring  │ INT  │ CHECK (0 ≤ val ≤ 10)      │
  └──────────────────────────┴──────┴────────────────────────────┘
```

### 6.3 Table Groups

| Group | Tables | Purpose |
|-------|--------|---------|
| **Doctor Interface** | `doctor_sentence_view`, `doctor_rewrite_log` | NLP scored sentences + rewrite history |
| **Patient Interface** | `patient_summary`, `patient_summary_scoring`, `patient_responses` | AI summaries + patient ratings + Q&A |
| **Survey** | `survey_submission_log` | Survey answers + REDCap sync status |
| **ML Pipeline** | `transcript_analysis_log`, `sentence_prediction` | Pipeline results + per-sentence scores |
| **Auth** | `auth_user`, `auth_api_key`, `patient_access` | Users, API keys, patient-level RBAC |

---

## 7. Webapp Architecture (Next.js)

### 7.1 View Routing

```
  URL: localhost:3000
    │
    ├── ?doctorid=X&fileid=Y
    │   └──► PhysicianReportsModifiedV41Timothy
    │        (Doctor Dashboard)
    │
    ├── ?patid=X&fileid=Y&visit=first
    │   └──► PatientInitialVisitReportV33
    │        (Patient First Visit — summary only)
    │
    ├── ?patid=X&fileid=Y&visit=followup
    │   └──► PatientFollowUpReportV31Re
    │        (Patient Follow-Up — with surveys)
    │
    └── (no params)
        └──► Selection Screen
```

### 7.2 Component & Data Flow

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  page.tsx (Main Entry)                                          │
  │  URL params → view routing                                      │
  └──────┬──────────────────────────┬───────────────────────────────┘
         │                          │
         ▼                          ▼
  ┌──────────────────┐     ┌──────────────────────────┐
  │  Doctor View     │     │  Patient View             │
  │  (V41Timothy)    │     │  (V33 / V31Re)            │
  └──────┬───────────┘     └──────┬───────────────────┘
         │                        │
         ▼                        ▼
  ┌──────────────────┐     ┌──────────────────────────┐
  │ useDoctorData()  │     │  usePatientData()         │
  │ (Custom Hook)    │     │  (Custom Hook)            │
  │                  │     │                           │
  │ State:           │     │  State:                   │
  │  patients        │     │   files, summaries        │
  │  selectedTopic   │     │   scoring, responses      │
  │  scoreSummary    │     │                           │
  │  trajectoryData  │     │  API Calls:               │
  │                  │     │   GET /api/patient/*       │
  │ API Calls:       │     │   PUT /api/patient/*       │
  │  GET /api/doctor/*│    └──────────────────────────┘
  │  POST /api/doctor/*│
  └──────┬───────────┘
         │
         ▼
  ┌──────────────────────────────────────────────┐
  │  ConsultationScoringV7Timothy7               │
  │  (Shared scoring visualization component)    │
  │                                              │
  │  Features:                                   │
  │   • 1-5 scale bar with arrow indicator       │
  │   • Score bubble (centered, last sentence)   │
  │   • Hover tooltip (rubric guidance)          │
  │   • Re-write Practice (stateless feedback)   │
  └──────────────────────────────────────────────┘


  Zustand Global Stores (9):
  ┌───────────┬───────────┬────────────┬──────────────┐
  │ patientId │  fileId   │  doctorId  │  themeStore  │
  ├───────────┼───────────┼────────────┼──────────────┤
  │ filterStr │ circleIdx │ xAxisSel   │ xAxisDragSel │
  ├───────────┴───────────┴────────────┴──────────────┤
  │ windowSizeStore (memory only, no localStorage)    │
  └───────────────────────────────────────────────────┘
  All persisted to localStorage (except windowSize)
```

### 7.3 Key Dependencies

| Category | Packages |
|----------|----------|
| **Framework** | Next.js 13.5, React 18, TypeScript 5 |
| **State** | Zustand 5.0 |
| **Styling** | Tailwind CSS 3.4, Radix-UI |
| **Charts** | D3.js 7.9, Recharts 2.13, Plotly.js 2.35 |
| **Analytics** | PostHog 1.288 (HIPAA-compliant, manual events only) |
| **File I/O** | xlsx 0.18, PapaParse 5.5, jsPDF 2.5 |
| **Icons** | Lucide React, Heroicons |

---

## 8. End-to-End Data Flow

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  1. DATA INGESTION                                                   │
  │                                                                      │
  │  Consultation Recording                                              │
  │       │                                                              │
  │       ▼                                                              │
  │  TurboScribe (csv) or Keystroke Logger (xlsx)                        │
  │       │                                                              │
  │       ▼                                                              │
  │  De-identified Transcript File                                       │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              ▼                                      ▼
  ┌────────────────────────┐           ┌────────────────────────────────┐
  │  2a. CLI ANALYSIS      │           │  2b. API ANALYSIS              │
  │                        │           │                                │
  │  python main_pipeline  │           │  POST /api/transcript/analyze  │
  │  --file transcript.xlsx│           │  (upload xlsx)                 │
  │                        │           │                                │
  │  Steps 1→5:            │           │  Steps 1→7:                    │
  │   Preprocess           │           │   Preprocess                   │
  │   Segment (R stringi)  │           │   Segment (regex)              │
  │   Classify (NLP Docker)│           │   Classify (NLP Docker)        │
  │   Select Top-K         │           │   Select Top-N                 │
  │   Context Window       │           │   Context Window               │
  │                        │           │   Export xlsx                   │
  │  Output:               │           │   Save to DB                   │
  │   data/output/final/   │           │                                │
  │   (5 csv files)        │           │  Output:                       │
  └────────────────────────┘           │   uploads/{id}_predictions.xlsx│
                                       │   transcript_analysis_log (DB) │
                                       │   sentence_prediction (DB)     │
                                       └───────────────┬────────────────┘
                                                       │
                                                       ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │  3. DATABASE POPULATION                                            │
  │                                                                    │
  │  doctor_sentence_view ← NLP scores per sentence (file, i, i2)     │
  │  patient_summary ← AI-generated class summaries                    │
  └───────────────────────────────┬────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
  ┌──────────────────────────┐   ┌──────────────────────────────────┐
  │  4a. PHYSICIAN DASHBOARD │   │  4b. PATIENT DASHBOARD            │
  │                          │   │                                   │
  │  Landing Page:           │   │  First Visit:                     │
  │   • Patient list grid    │   │   • Consultation summary          │
  │   • Overall trajectory   │   │   • 5-domain example sentences    │
  │                          │   │   • Topic dropdowns               │
  │  Detail View:            │   │                                   │
  │   • Last-sentence score  │   │  Follow-Up:                       │
  │   • 1-5 scale + arrow    │   │   • Summary + scores              │
  │   • Trajectory chart     │   │   • Surveys:                      │
  │   • Re-write Practice    │   │     - SDM (Shared Decision Making)│
  │     (stateless feedback) │   │     - DCS (Decisional Conflict)   │
  │   • Rubric hover tooltip │   │     - Risk Perception             │
  │                          │   │     - Satisfaction                │
  │  Score = last sentence   │   │                                   │
  │  per domain (max i,      │   │  Survey → REDCap sync             │
  │  then max i2)            │   │                                   │
  └──────────────────────────┘   └──────────────────────────────────┘
```

---

## 9. The 5 NLP Domains

All scoring, visualization, and analysis is organized around these 5 clinical communication domains:

```
  ┌─────┬────────────────────────────┬─────────────────────────────────┐
  │ Abbr│ Full Name                  │ What It Measures                │
  ├─────┼────────────────────────────┼─────────────────────────────────┤
  │ cp  │ Cancer Prognosis           │ How well the doctor communicated│
  │     │                            │ cancer stage, grade, prognosis  │
  ├─────┼────────────────────────────┼─────────────────────────────────┤
  │ le  │ Life Expectancy            │ Discussion of life expectancy   │
  │     │                            │ and survival statistics         │
  ├─────┼────────────────────────────┼─────────────────────────────────┤
  │ ed  │ Erectile Dysfunction       │ Discussion of ED as treatment   │
  │     │                            │ side effect                     │
  ├─────┼────────────────────────────┼─────────────────────────────────┤
  │ inc │ Incontinence               │ Discussion of urinary           │
  │     │                            │ incontinence risks              │
  ├─────┼────────────────────────────┼─────────────────────────────────┤
  │ ius │ Irritative Urinary Sx      │ Discussion of irritative        │
  │     │                            │ urinary symptoms                │
  └─────┴────────────────────────────┴─────────────────────────────────┘

  NLP Model Output: .pred_1 (probability 0.0–1.0)
  Score Display:    0–5 integer scale (stored values used directly)
```

### 9.2 Score Scale (0-5)

Communication quality scale used in the dashboard:

```
  Score│ Label                       │ Meaning                           │ Color
  ─────┼────────────────────────────┼───────────────────────────────────┼──────────
   0   │ No mention                 │ Topic not mentioned at all        │ slate
   1   │ Name Only                  │ Only named the topic              │ red
   2   │ Generalization ("High/Low")│ General expressions (high/low)    │ pink
   3   │ Imprecise Quantification   │ Vague numbers ("quite a lot")     │ yellow
   4   │ Specific Quantification    │ Specific numbers ("90%")          │ green
   5   │ Patient-centered Estimate  │ Patient-specific explanation      │ emerald
```

### 9.3 Naming Conventions (by Module)

```
  ┌──────────┬────────────────────────┬──────────────────────────────┐
  │ Location │ Name Format            │ Example                      │
  ├──────────┼────────────────────────┼──────────────────────────────┤
  │ NLP Model│ Abbreviation (2-3 ch)  │ cp, le, ed, inc, ius         │
  │ Backend  │ Abbreviation + class # │ "1"↔cp, "2"↔le, ...         │
  │ DB Sheet │ Full outcome name      │ cancer_prognosis,            │
  │          │                        │ life_expectancy, ...         │
  │ Patient  │ User-friendly full name│ Cancer Prognosis,            │
  │ UI       │                        │ Urinary Incontinence, ...    │
  │ Doctor   │ Slightly shortened     │ Irritative Symptoms          │
  │ UI       │                        │ (= Irritative Urinary Sx)    │
  └──────────┴────────────────────────┴──────────────────────────────┘
```

### 9.4 Patient Self-Rating (Separate)

Patient ratings on the dashboard are **separate** from NLP scores:

```
  Star Rating (patient self-assessment):
    1: "Confusing"
    2: "Not helpful"
    3: "Neutral"
    4: "Helpful"
    5: "Very helpful"

  Patient Scoring (patient_summary_scoring table):
    Range: 0–10 (integer, DB CHECK constraint)
    Stored per class (class_1 through class_5)
```

---

## 10. External Integrations

```
  ┌──────────────────────────────────────────────────────┐
  │  REDCap (Research Data Capture)                      │
  │                                                      │
  │  Dashboard ──POST /api/surveys/submit──► Backend     │
  │                                            │         │
  │                          survey_submission_log (DB)   │
  │                                            │         │
  │                              ┌─────────────▼───────┐ │
  │                              │ REDCap API Sync     │ │
  │                              │ (redcap_synced flag) │ │
  │                              └─────────────────────┘ │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │  PostHog (Analytics — HIPAA-compliant)               │
  │                                                      │
  │  Webapp ──custom events──► PostHog Cloud             │
  │                                                      │
  │  Events: page_view, component_view, button_click,   │
  │          scroll_depth, time_on_component,            │
  │          cursor_proximity, session_start/end         │
  │                                                      │
  │  Privacy: autocapture OFF, session recording OFF,    │
  │           input masking ON, .sensitive class masked   │
  └──────────────────────────────────────────────────────┘
```

---

## 11. Security Architecture

```
  ┌───────────────────── Security Boundary ─────────────────────────┐
  │                                                                  │
  │  Internet / User Browser                                         │
  │       │                                                          │
  │       ▼                                                          │
  │  ┌─────────────────────────────────────────┐                    │
  │  │  Nginx (localhost:3000)                  │                    │
  │  │  • Reverse proxy                        │                    │
  │  │  • (TODO) Security headers              │                    │
  │  │  • (TODO) Rate limiting                 │                    │
  │  └────────────────┬────────────────────────┘                    │
  │                   │                                              │
  │  ┌────────────────▼────────────────────────┐                    │
  │  │  Backend (FastAPI)                       │                    │
  │  │  • Auth: X-API-Key / JWT / OAuth2       │                    │
  │  │  • CORS whitelist                       │                    │
  │  │  • Path traversal protection            │                    │
  │  │  • Timing-attack safe comparison        │                    │
  │  │  • (TODO) Rate limiting middleware      │                    │
  │  └─────────────────────────────────────────┘                    │
  │                                                                  │
  │  Internal Network (prostatecancer-network):                      │
  │    PostgreSQL, Redis, NLP — NO external ports                    │
  │    All Docker ports bound to 127.0.0.1                          │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘

  Security Status (as of 2026-02-20):
    ✅ 6 fixes applied (timing attack, default key, port exposure,
       localhost binding, path traversal, .gitignore)
    ⚠️  14 active vulnerabilities (see SECURITY_AUDIT_REPORT.md)
```

---

## 12. Directory Structure (Project-Wide)

```
prostate_cancer_project/
│
├── SYSTEM_ARCHITECTURE.md                 ← THIS FILE
├── README.md / README_KR.md              Overview
├── Clinical_AI_Document_Intelligence_*    High-level design doc (v1.2)
│
├── AI_physician_patient_communication/    ─── CLI PIPELINE ───
│   ├── main_pipeline.py                   Entry point
│   ├── config.yaml                        Configuration
│   ├── sentence_classification/           Steps 1-5 modules
│   ├── utils/                             File management, helpers
│   ├── tests/                             49 tests
│   ├── data/                              input/ output/ archive/ reference/
│   ├── docs/                              Architecture docs (EN/KR)
│   └── meeting_notes/                     Requirements, AI scoring plan
│
├── Prostate_cancer_consultation_dashboard/ ─── DASHBOARD PLATFORM ───
│   ├── README.md                          Project overview
│   ├── app/
│   │   ├── Backend/                       ─── FASTAPI BACKEND ───
│   │   │   ├── main.py                    FastAPI app
│   │   │   ├── routes_surveys.py          Doctor/Patient/Survey API
│   │   │   ├── routes_transcript.py       Transcript analysis API
│   │   │   ├── routes_nlp.py              NLP proxy API
│   │   │   ├── models.py                  SQLAlchemy + Pydantic
│   │   │   ├── auth/                      Authentication (4 backends)
│   │   │   ├── docker-compose.yml         6 services
│   │   │   ├── database_schema.sql        11 tables
│   │   │   ├── tests/                     559+ tests
│   │   │   └── README_V5.md              Developer guide (27KB)
│   │   │
│   │   ├── Webapp/                        ─── NEXT.JS FRONTEND ───
│   │   │   ├── src/app/page.tsx           Main entry (view routing)
│   │   │   ├── src/components/            82+ components (versioned)
│   │   │   ├── src/hooks/                 useDoctorData, usePatientData
│   │   │   ├── src/stores/               9 Zustand stores
│   │   │   ├── src/api/                   API clients
│   │   │   ├── src/tracking/             PostHog analytics
│   │   │   └── COMPONENT_STATE_MAP.md    Component documentation
│   │   │
│   │   └── Pipeline/                      Backend-integrated pipeline
│   │
│   ├── dev_docs/
│   │   ├── ml_pipeline_dev_docs/          12 pipeline docs (EN/KR)
│   │   └── backend_dev_docs/              Backend improvements TODO
│   │
│   └── docs/md/                           REDCap, compliance specs
│
├── prostate_cancer_R01_Guille/            Guille's R pipeline (reference)
├── prostate_cancer_R01_NLP_classifiers_Michael/  Michael's NLP models
└── prostate_cancer_R01_raw_transcripts_Ella/     Raw transcript data
```

---

## 13. Existing Documentation Index

| Document | Location | Content |
|----------|----------|---------|
| **This File** | `SYSTEM_ARCHITECTURE.md` | Integrated system architecture |
| **High-Level Design** | `Clinical_AI_Document_Intelligence_Platform_Architecture_with_Image_v1.2.md` | Conceptual architecture (layers, roles, security boundary) |
| **CLI Pipeline Architecture** | `AI_physician_patient_communication/docs/PIPELINE_ARCHITECTURE_EN.md` | 5-step pipeline + Mermaid diagrams |
| **CLI Pipeline Steps Detail** | `AI_physician_patient_communication/docs/PIPELINE_STEPS_DETAIL_EN.md` | Algorithms, data examples, validation |
| **CLI Execution Guide** | `AI_physician_patient_communication/docs/PIPELINE_EXECUTION_GUIDE_EN.md` | Setup and run instructions |
| **AI Scoring Plan** | `AI_physician_patient_communication/meeting_notes/MEETING_FEEDBACK_2026-03-05_AI_SCORING_PLAN.md` | Steps 6-10 design (superset mock strategy) |
| **Backend Developer Guide** | `Prostate_cancer_consultation_dashboard/app/Backend/README_V5.md` | Operations, API, testing, security |
| **Backend Security Audit** | `Prostate_cancer_consultation_dashboard/app/Backend/SECURITY_AUDIT_REPORT.md` | 20 vulnerabilities, 6 fixes applied |
| **Webapp Component Map** | `Prostate_cancer_consultation_dashboard/app/Webapp/COMPONENT_STATE_MAP.md` | Active components, state, routing |
| **DB Schema** | `Prostate_cancer_consultation_dashboard/app/Backend/database_schema.sql` | All 11 tables DDL |
| **ML Pipeline Spec** | `dev_docs/ml_pipeline_dev_docs/NLP_PIPELINE_SPEC_FINAL.md` | Detailed technical specification (45KB) |
| **R vs Python Comparison** | `dev_docs/ml_pipeline_dev_docs/COMPARISON_AND_PLAN_*.md` | Line-by-line pipeline comparison |

---

## 14. Technology Stack Summary

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  FRONTEND          │  BACKEND            │  CLI PIPELINE        │
  ├─────────────────────────────────────────────────────────────────┤
  │  Next.js 13.5      │  FastAPI             │  Python 3.9+        │
  │  React 18          │  SQLAlchemy 2.0      │  pandas, openpyxl   │
  │  TypeScript 5      │  PostgreSQL 13       │  httpx              │
  │  Zustand 5.0       │  Redis 7             │  rpy2 (R stringi)   │
  │  Tailwind CSS 3.4  │  asyncpg             │  PyYAML             │
  │  D3.js / Recharts  │  httpx               │                     │
  │  PostHog           │  Alembic             │                     │
  │  Radix-UI          │  PyJWT               │                     │
  ├─────────────────────────────────────────────────────────────────┤
  │  INFRASTRUCTURE                                                 │
  ├─────────────────────────────────────────────────────────────────┤
  │  Docker Compose (6 services)                                    │
  │  Nginx (reverse proxy)                                          │
  │  r01-nlp-classifiers (R + plumber, ×3 replicas)                │
  │  REDCap (external, API sync)                                    │
  │  PostHog (external, HIPAA analytics)                            │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 15. Known Gaps & Future Work

| Area | Status | Description |
|------|--------|-------------|
| AI Sub-Pipeline (Steps 6-10) | TODO | AI scoring, extraction, selection, reformatting, DB persistence |
| Patient Dashboard ↔ Pipeline | TODO | Example sentences shown; real pipeline connection needed |
| Full HTTPS | TODO | Currently HTTP only (localhost development) |
| Rate Limiting | TODO | Nginx config commented out, FastAPI middleware not active |
| Survey Auth | TODO | Survey endpoints lack per-user authentication |
| NLP Docker Image | RISK | Locally built only, no registry — `docker system prune` deletes it |
| Guille's Departure | RISK | ~2026-03-20, AI module handoff needed |

---

**Document Version:** 1.0
**Last Updated:** 2026-03-16
