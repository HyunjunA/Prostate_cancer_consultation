# ML Pipeline Development Status
> This document contains both English and Korean versions.
> 이 문서에는 영어와 한국어 버전이 모두 포함되어 있습니다.

---

## English


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

---

## 한국어


> Last updated: 2026-02-26

---

## 현재 존재하는 것 vs 아직 없는 것

### 1. File Management — "fetch, prepare, archive"

| 기능 | 해당하는 부분 | 현재 상태 |
|------|-------------|----------|
| **Fetch** | `prostate_cancer_R01_raw_transcripts_Ella/`에서 `SID 33 (8).csv` 가져오기 | 수동 (파일이 그냥 놓여있음) |
| **Prepare** | TurboScribe 형식 (`start,end,text,Speaker 1`) → NLP 입력 형식 (`speaker,text,Interviewer`) 변환 | **자동화 코드 없음** |
| **Archive** | 처리 완료 파일을 `processed/`로 이동 | **없음** |

`process-data-guille.R`이 부분적으로 prepare를 하지만, 이 스크립트는 이미 변환된 `processed_transcripts_sid-01.xlsx`를 입력으로 받습니다. **TurboScribe CSV → 이 xlsx로 변환하는 코드가 없습니다.**

> **⚠️ 중요 — 미확인 사항 (Critical Unknown)**
>
> TurboScribe CSV (`SID 33 (8).csv`, 컬럼: `start,end,text,Speaker 1`) →
> NLP 입력 xlsx (`processed_transcripts_sid-01.xlsx`, 컬럼: `speaker,text`) 변환 과정이
> **현재 어떻게 수행되는지 확인되지 않았습니다.**
>
> - **수동 작업인가?** — 누군가 Excel에서 직접 컬럼을 정리하고, Speaker를 `Interviewer`/`Patient`로 매핑하는가?
> - **별도 스크립트가 존재하는가?** — 이 레포 외부에 변환 스크립트가 있는가?
> - **변환 규칙이 문서화되어 있는가?** — `Speaker 1` → `Interviewer` 매핑 기준은 무엇인가?
>
> **이 변환 과정의 확인 및 자동화는 아직 미완성 상태입니다.**
> 이 부분이 해결되지 않으면, 새로운 환자 녹취록이 들어올 때마다 누군가가 수동으로 파일을 변환해야 하며, 이는 재현성과 확장성을 심각하게 저해합니다.

---

### 2. Process Manager — "calls the AI modules one by one, Michael's for now"

| 기능 | 해당하는 부분 | 현재 상태 |
|------|-------------|----------|
| **AI 호출** | Backend의 `nlp_service.py` → `nlp-classifiers:8000/predict/{model}` | **✅ 구현 완료** |
| **5모델 순차 호출** | `routes_nlp.py`의 `/predict/all` 엔드포인트 | **✅ 구현 완료** |
| **전처리 (Step 1-3)** | `transcript_service.py`: xlsx 읽기 → Interviewer 필터링 → 문장 분리 | **✅ 구현 완료** (R 파이프라인 대체) |
| **NLP 예측 (Step 4)** | `transcript_service.py` → `nlp_service.predict_batch()` → `r01-nlp-classifiers:8000` | **✅ 구현 완료** (5모델 × 배치 호출) |
| **후처리 (Step 5-7)** | `transcript_service.py`: Top N 선별 → Context 생성 → xlsx 출력 | **✅ 구현 완료** (R 파이프라인 대체) |
| **단일 파일 분석** | `routes_transcript.py` → `POST /api/transcript/analyze` | **✅ 구현 완료** |
| **배치 분석** | `routes_transcript.py` → `POST /api/transcript/analyze-batch` | **✅ 구현 완료** |
| **결과 다운로드** | `routes_transcript.py` → `GET /download/{patient_id}`, `GET /download-batch` | **✅ 구현 완료** |

> **✅ Process Manager는 완전히 구현되었습니다.**
>
> `transcript_service.py`가 `process-data-guille.R`의 전체 파이프라인(Step 1~7)을 Python으로 재구현하였으며,
> 결과가 원본 R 파이프라인 출력과 동일함을 검증 완료했습니다 (`.pred_1` 차이 < 0.00005, text/context 동일).
>
> **파이프라인 흐름:**
> ```
> xlsx 업로드 → Step 1: 읽기 → Step 2: Interviewer 필터
>             → Step 3: 문장 분리 → Step 4: 5모델 NLP 예측 (Docker)
>             → Step 5: Top N 선별 → Step 6: Context 생성 (±window, <main>태그)
>             → Step 7: xlsx 출력 (5시트: cp, inc, ed, ius, le)
> ```
>
> **핵심 파일:**
> | 파일 | 역할 |
> |------|------|
> | `transcript_service.py` | 전체 파이프라인 오케스트레이터 (Step 1~7) |
> | `routes_transcript.py` | API 엔드포인트 (단일/배치 분석, 다운로드, 이력 조회, DB 저장) |
> | `nlp_service.py` | NLP Docker 컨테이너 호출 + Redis 캐시 + 재시도 |
>
> **API 파라미터:**
> - `top_n`: 모델별 상위 N개 문장 선택 (0 = 전체, 기본값: 0)
> - `context_window`: 전후 문맥 문장 수 (기본값: 3)

---

### 3. State Manager — "insert and read from the database"

| 기능 | 해당하는 부분 | 현재 상태 |
|------|-------------|----------|
| **DB 인프라** | Docker Compose의 PostgreSQL (`prostatecancer-postgres`) | **✅ 구현 완료** |
| **결과 저장 (파일)** | `routes_transcript.py` → `/app/uploads/{patient_id}_predictions.xlsx` | **✅ 구현 완료** (기존 파일 시스템 저장 유지) |
| **결과 저장 (DB)** | `routes_transcript.py` → `_save_to_db()` → `transcript_analysis_log` 테이블 | **✅ 구현 완료** (메타데이터 + JSON 결과 + xlsx 바이너리) |
| **분석 이력 추적** | `GET /api/transcript/history/{patient_id}` → 페이지네이션 조회 | **✅ 구현 완료** |
| **DB fallback 다운로드** | `GET /download/{patient_id}`: 디스크에 파일 없으면 DB에서 서빙 | **✅ 구현 완료** (컨테이너 재시작 복원력) |
| **문장별 예측 저장 (DB)** | `routes_transcript.py` → `_save_to_db()` → `sentence_prediction` 테이블 | **✅ 구현 완료** (문장별·모델별 SQL 쿼리 가능) |
| **예측 쿼리** | `GET /api/transcript/predictions/{patient_id}` → 모델, 점수, 분석 run별 필터 | **✅ 구현 완료** |
| **Legacy backfill** | `_backfill_predictions()`: 기존 분석 run의 `model_results` JSON에서 `sentence_prediction` 행 자동 복원 | **✅ 구현 완료** |

> **✅ State Manager는 완전히 구현되었습니다.**
>
> **2개의 DB 테이블**이 분석 결과를 영구 저장합니다:
>
> **테이블 1: `transcript_analysis_log`** — 분석 run당 1행:
> - 메타데이터 (patient_id, total_sentences, top_n, context_window, source_filename, analyzed_at)
> - JSON 결과 (model_results TEXT — 5모델 전체 점수)
> - xlsx 바이너리 (xlsx_data BYTEA — 다운로드 fallback용)
>
> **테이블 2: `sentence_prediction`** — 문장당·모델당 1행:
> - 부모 분석에 `analysis_id` FK로 연결 (CASCADE 삭제)
> - 컬럼: patient_id, model, sentence_index, utterance_index, sentence_in_utterance, speaker, sentence_text, pred_score, context
> - SQL 수준 필터링/집계 가능 (예: "cp 모델에서 pred_score >= 0.8인 모든 문장")
> - `_save_to_db()`에서 `flush()`로 `analysis_id` 확보 후 bulk insert
> - Legacy backfill: `_backfill_predictions()`가 이 기능 이전에 생성된 분석 run의 `model_results` JSON에서 행을 자동 복원
>
> **설계 결정:**
> - DB 실패 시에도 기존 응답 차단 없음 (`try/except` + `rollback`)
> - 동일 patient_id 재분석 시 새 row 삽입 (upsert 아닌 이력 보존)
> - 다운로드 시 디스크에 파일 없으면 DB에서 서빙 (컨테이너 재시작 복원력)
> - `init_db.py`가 `database_schema.sql`로 신규 배포 시 자동 테이블 생성
>
> **관련 파일:**
> | 파일 | 역할 |
> |------|------|
> | `models.py` | `TranscriptAnalysisLog` + `SentencePrediction` SQLAlchemy 모델 |
> | `database_schema.sql` | DDL: `transcript_analysis_log` + `sentence_prediction` 테이블 + 인덱스 |
> | `routes_transcript.py` | `_save_to_db()` 헬퍼 + DB fallback + `/history` + `/predictions` 엔드포인트 |
> | `patient_doctor_interface_erd.mmd` | ERD 다이어그램에 테이블 반영 |

---

### 4. Main Pipeline — "calling these modules"

| 기능 | 해당하는 부분 | 현재 상태 |
|------|-------------|----------|
| **오케스트레이션** | `run_all.sh` (Docker 시작 + 테스트) | 인프라 실행만, 데이터 처리 파이프라인 아님 |
| **전체 흐름 자동화** | `process-data-guille.R` (한 스크립트에 모두 섞여있음) | 모듈 분리 안 됨 |

---

## Gap 분석 요약

```
                        존재함                    없음
                        ──────                    ────
File Management:                                 ✗ TurboScribe CSV → NLP 입력 변환
                                                 ✗ 파일 자동 검색 (fetch)
                                                 ✗ 처리 후 archive

Process Manager:        ✅ 전체 구현 완료
                        ✓ Backend NLP 호출
                        ✓ 5모델 예측
                        ✓ Top N 선별 + Context
                        ✓ 단일/배치 API

State Manager:          ✅ 전체 구현 완료
                        ✓ PostgreSQL 인프라
                        ✓ NLP 결과 → DB 저장 (transcript_analysis_log)
                        ✓ 문장별 예측 → DB 저장 (sentence_prediction)
                        ✓ 분석 이력 추적 (/history)
                        ✓ 예측 쿼리 (/predictions) + 필터
                        ✓ Legacy backfill (JSON에서 자동 복원)
                        ✓ DB fallback 다운로드

Main Pipeline:                                   ✗ 전체 오케스트레이터
                                                 (Process Manager + State Manager는
                                                  각각 완료, 통합 오케스트레이션 미구현)

Testing:                ✅ 종합 테스트 스위트 구현 완료 (2026-02-26)
                        ✓ Backend unit/integration: 559 tests (pytest)
                        ✓ Backend E2E: 24 tests (Docker 라이브)
                        ✓ Frontend unit/integration: 279 tests (Jest)
                        ✓ Frontend E2E: 32 tests (Playwright)
                        ✓ test_transcript_pipeline.sh: 10/10
                        ✓ 총 894 tests — 전체 통과
```

**결론:** Process Manager(`transcript_service.py` + `routes_transcript.py`)와 State Manager(`transcript_analysis_log` 테이블 + DB 저장/조회/fallback)가 **모두 구현 완료**되었습니다. `process-data-guille.R`의 전체 기능이 Backend API로 이관되었으며, 분석 결과는 파일 시스템과 DB에 이중 저장됩니다. **남은 유일한 주요 gap은 File Management** (TurboScribe CSV → NLP 입력 형식 변환 자동화)입니다.

---

## Backend NLP 호출 구조 (현재 구현)

현재 Backend가 NLP를 호출하는 방식:

```
클라이언트 (curl/Frontend)
    │
    │  POST /api/nlp/predict  +  X-API-Key 헤더
    ▼
Backend (FastAPI - routes_nlp.py)
    │  API Key 검증 → 모델명 검증
    ▼
nlp_service.py
    │  1) Redis 캐시 확인 (key = model + text SHA256)
    │  2) 캐시 miss → NLP 컨테이너 호출 (최대 3회 재시도)
    ▼
nlp-classifiers:8000 (Docker 내부 네트워크)
    │  POST /predict/{model}  →  [{"text": "..."}]
    │  응답: [{".pred_1": 0.87, ".pred_0": 0.13}]
    ▼
Backend가 응답 정규화 → Redis 캐시 저장 (TTL 1시간) → 클라이언트에 반환
```

### NLP 저수준 API — 6개 엔드포인트

| 엔드포인트 | 용도 |
|-----------|------|
| `GET /api/nlp/health` | NLP 서비스 상태 확인 |
| `GET /api/nlp/models` | 5개 모델 목록 |
| `POST /api/nlp/predict` | 단일 문장 + 단일 모델 |
| `POST /api/nlp/predict/batch` | 다중 문장 + 단일 모델 (최대 50개) |
| `POST /api/nlp/predict/all` | 단일 문장 + 전체 5모델 |
| `POST /api/nlp/predict/by-class` | 단일 문장 + 클래스번호(1-5) |

### Transcript Analysis API — 6개 엔드포인트

| 엔드포인트 | 용도 |
|-----------|------|
| `POST /api/transcript/analyze` | 단일 xlsx 파일 → 전체 파이프라인 (Step 1~7) 실행 → 파일 + DB 이중 저장 |
| `POST /api/transcript/analyze-batch` | 다중 xlsx 파일 → 각 파일별 독립 분석 → 파일 + DB 이중 저장 |
| `GET /api/transcript/download/{patient_id}` | 분석 결과 xlsx 다운로드 (디스크 우선, DB fallback) |
| `GET /api/transcript/download-batch` | 다중 patient_id 결과를 zip으로 다운로드 |
| `GET /api/transcript/history/{patient_id}` | 분석 이력 조회 (페이지네이션, DB에서 조회) |
| `GET /api/transcript/predictions/{patient_id}` | 문장별 예측 쿼리 (모델, min_score, top_n, analysis_id별 필터) |

### 핵심 파일 8개

| 파일 | 역할 |
|------|------|
| `routes_nlp.py` | NLP 저수준 API 엔드포인트 정의 + 요청 검증 |
| `routes_transcript.py` | Transcript Analysis API (단일/배치 분석 + 다운로드 + 이력 조회 + DB 저장) |
| `transcript_service.py` | 전체 파이프라인 오케스트레이터 (Step 1~7, R 스크립트 대체) |
| `nlp_service.py` | NLP 컨테이너 HTTP 호출 + 재시도 로직 |
| `redis_client.py` | 캐시 관리 (text SHA256 키, 1시간 TTL) |
| `models.py` | SQLAlchemy 모델 (`TranscriptAnalysisLog` + `SentencePrediction`) |
| `database_schema.sql` | DDL: 모든 테이블 정의 (`transcript_analysis_log` + `sentence_prediction`) |
| `test_transcript_pipeline.sh` | 전체 파이프라인 자동화 테스트 (DB 저장 + fallback 포함, 10/10 통과) |

### 모델 매핑

```
Class 1 → cp  (Cancer Prognosis)
Class 2 → le  (Life Expectancy)
Class 3 → ed  (Erectile Dysfunction)
Class 4 → inc (Incontinence)
Class 5 → ius (Irritative Urinary Symptoms)
```

---

## 파일 Input/Output 관계

### 1. Raw Input (Ella의 원본 녹취록)

**`prostate_cancer_R01_raw_transcripts_Ella/SID 33 (8).csv`**

- TurboScribe에서 생성된 원본 상담 녹음 CSV
- 컬럼: `start`, `end`, `text`, `speaker`
- Speaker: `Speaker 1`, `Speaker 2` (역할 구분 없음)
- 타임스탬프 포함 (밀리초)

### 2. 전처리된 Input (Michael의 NLP 입력 형식)

**`prediction_pipeline_and_results/processed_transcripts_sid-01.xlsx`**

- 컬럼: `speaker`, `text` (2개만)
- Speaker: `Interviewer`, `Patient` (역할 명시됨)
- 타임스탬프 제거됨
- 192행

### 3. R 파이프라인 (`process-data-guille.R`)

```
입력: processed_transcripts_sid-01.xlsx
  │
  ├─ Interviewer 문장만 필터링
  ├─ 문장 단위로 분리 (unnest_tokens)
  ├─ 5개 NLP 모델 예측 (cp, le, ed, inc, ius)
  ├─ 모델별 Top 5 문장 선별
  ├─ 전후 3문장 Context 생성 (<main>태그)
  │
  출력: original-study-physician-predictions-top-context.xlsx
```

### 4. 최종 Output

**`prediction_pipeline_and_results/original-study-physician-predictions-top-context.xlsx`**

- 5개 시트: `cp`, `inc`, `ed`, `ius`, `le`
- 각 시트 컬럼: `name`, `index`, `i`, `i2`, `speaker`, `text`, `.pred_1`, `context`
- `.pred_1`: 모델 예측 확률 (0~1)
- `context`: 전후 문맥과 함께 `<main>...</main>` 태그로 대상 문장 표시

### 5. Ground Truth (수동 채점)

**`manual_scoring_ground_truth/nlp-pilot-manual-scores(cp).csv`**

- 컬럼: `file`, `i`, `i2`, `speaker`, `sentences`, `score`
- 사람이 수동으로 매긴 점수 (`score`: 0 또는 1)
- 현재 `cp` (Cancer Prognosis) 모델 하나만 있음

### 데이터 흐름 요약

```
Ella (TurboScribe)          Michael (NLP)              Ground Truth
─────────────────          ──────────────              ────────────
SID 33 (8).csv     ──→    processed_transcripts       manual_scores(cp).csv
[start,end,text,        _sid-01.xlsx               [file,i,i2,speaker,
 speaker]               [speaker, text]              sentences, score]
      ⚠️ 변환 자동화 없음       │                            │
                    ┌─────────┼─────────┐                  │
                    ▼                   ▼                   ▼
           [R 경로 — 레거시]     [Backend 경로 — 현재]     모델 성능 검증용
           process-data-        POST /api/transcript/
           guille.R             analyze (또는 analyze-batch)
                    │                   │
                    ▼                   ├──→ 파일 시스템: /app/uploads/
                    │                   │    {patient_id}_predictions.xlsx
                    │                   │
                    │                   └──→ PostgreSQL DB:
                    │                        transcript_analysis_log
                    │                        (메타데이터 + JSON + xlsx BYTEA)
                    │                        │
                    ▼                        ▼
           original-study-      GET /download/{patient_id}
           physician-             (디스크 우선, DB fallback)
           predictions-         GET /history/{patient_id}
           top-context.xlsx       (분석 이력 페이지네이션 조회)
           [5시트: cp,inc,
            ed,ius,le]
```

> **R 경로와 Backend 경로의 출력이 동일함을 검증 완료** (`.pred_1` 차이 < 0.00005, text/indices/context 동일).
> 향후 새로운 transcript 분석은 Backend API를 사용하면 됩니다.

**현재 빠져있는 부분:** Ella의 TurboScribe CSV (`SID 33 (8).csv`) → Michael의 입력 형식 (`processed_transcripts_sid-01.xlsx`)으로 변환하는 자동화 코드가 아직 없습니다. 이것이 바로 Pipeline Architecture의 **File Management** 모듈이 해야 할 일입니다.

---

## 테스트 인프라 (2026-02-26 구현 완료)

### 종합 테스트 현황

| 영역 | 프레임워크 | 테스트 수 | Docker 필요 |
|------|-----------|----------|------------|
| Backend Unit/Integration | pytest + pytest-asyncio + aiosqlite | 559 | 아니오 (in-memory SQLite) |
| Backend E2E | pytest + httpx | 24 | 예 |
| Frontend Unit/Integration | Jest + React Testing Library + MSW | 279 | 아니오 |
| Frontend E2E | Playwright | 32 | 예 |
| Pipeline Shell | test_transcript_pipeline.sh | 10 | 예 |
| **합계** | | **894** | |

### 테스트 실행 방법

```bash
# Backend (Docker 불필요)
cd app/Backend
python -m pytest tests/ -v --tb=short --ignore=tests/e2e

# Frontend (Docker 불필요)
cd app/Webapp
npm test

# E2E (Docker 필요 — 8개 컨테이너 모두 실행 상태에서)
python -m pytest tests/e2e/ -v -m e2e
npx playwright test --config=e2e/playwright.config.ts
```

### API 수동 테스트 (curl 커맨드)

Docker 컨테이너가 실행 중일 때 아래 커맨드로 NLP 파이프라인을 직접 테스트할 수 있습니다.

#### 1) NLP 서비스 상태 확인

```bash
curl -s http://localhost:8000/api/nlp/health \
  -H "X-API-Key: YOUR_API_KEY" | python3 -m json.tool
```

#### 2) 단일 문장 전체 모델 예측

```bash
curl -s -X POST http://localhost:8000/api/nlp/predict/all \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "You have a low risk of cancer progression."}' | python3 -m json.tool
```

#### 3) 전체 파이프라인 분석 (xlsx 파일)

```bash
# 예제 파일로 분석 실행
curl -s -X POST http://localhost:8000/api/transcript/analyze \
  -H "X-API-Key: YOUR_API_KEY" \
  -F "file=@prediction_pipeline_and_results/processed_transcripts_sid-01.xlsx" \
  -F "top_n=5" \
  -F "context_window=3" | python3 -m json.tool

# 결과 xlsx 다운로드
curl -s http://localhost:8000/api/transcript/download/sid-01 \
  -H "X-API-Key: YOUR_API_KEY" \
  -o sid-01_predictions.xlsx
```

#### 4) 분석 이력 조회

```bash
curl -s http://localhost:8000/api/transcript/history/sid-01 \
  -H "X-API-Key: YOUR_API_KEY" | python3 -m json.tool
```

---

## 관련 문서

- [ML_PIPELINE_ARCHITECTURE_KR.md](./ML_PIPELINE_ARCHITECTURE_KR.md) / [EN](./ML_PIPELINE_ARCHITECTURE_EN.md) — ML 파이프라인 아키텍처 설계 문서
- [ML_PIPELINE_OVERVIEW_KR.md](./ML_PIPELINE_OVERVIEW_KR.md) / [EN](./ML_PIPELINE_OVERVIEW_EN.md) — 데이터 파일 간 관계 및 Stage별 상세 설명
- [COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_KR.md](./COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_KR.md) / [EN](./COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_EN.md) — R 스크립트와 Docker 이미지 비교 + Backend 구현 계획
