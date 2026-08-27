# Technical Report: April 2–3, 2026

**Project:** Prostate Cancer Consultation Dashboard
**Period:** April 2–3, 2026
**Commits:** 39 (Apr 2) + 6 (Apr 3) = 45 total
**Scope:** 101 files changed, +8,949 / −10,725 lines (net −1,776 lines)

> Collaborator names are replaced with role labels per repository convention.

---

## 1. DB schema and ORM synchronisation

Reconciled the mismatches between the DDL (`database_schema.sql`) and the ORM
(`models.py`).

- **Column names**: `sentences`→`sentence`, `original_sentences`→`original_sentence`,
  `revised_sentences`→`revised_sentence`
- **Types**: `TIMESTAMP` → `TIMESTAMP WITH TIME ZONE` (`doctor_sentence_view`,
  `doctor_rewrite_log`)
- **Dropped columns**: `doctor_rewrite_log.original_score` (recoverable by FK join),
  `doctor_rewrite_log.selected` (unused boolean)
- **TEXT → JSONB** for four columns: `model_results`, `answers`, `extra_data`,
  `event_data` — removed 4 `json.dumps()` and 7 `json.loads()` calls in favour of
  native PostgreSQL JSON handling

> Commits: `acf9aa7`, `fcc3489`, `69752e7`

---

## 2. Patient summary table normalisation

Replaced the fixed five-slot structure with normalised domain rows.

**Before (3 tables)**
```
patient_summary         → class_1~5, summary_class_1~5 (10 fixed columns)
patient_summary_scoring → class_1_score~class_5_score
patient_responses       → class_1_response~class_5_response
```

**After (2 tables)**
```
patient_summary        → file, speaker, entire_summary
patient_summary_domain → file, speaker, domain, display_order, summary_text,
                         patient_scoring, patient_response
```

- Adding an NLP domain no longer requires a DDL change — it is a row insert
- `routes_patient.py`: seven endpoints rewritten
- `usePatientData.tsx`: slot-number interface → domain-name interface

> Commit: `c1ae718`

---

## 3. Index optimisation

Redesigned indexes after analysing the dominant query patterns.

**Added (12)**

| Index | Type | Target query |
|---|---|---|
| `idx_dsv_file_speaker_class_i` | partial + composite | `scores/average` three-stage subquery |
| `idx_uil_client_ts_hour` | expression | analytics timeline GROUP BY |
| `idx_uil_client_ts_hour_of_day` | expression | hourly heatmap |
| `idx_transcript_log_patient_xlsx` | partial | download (xlsx IS NOT NULL only) |
| `idx_transcript_log_history` | covering (INCLUDE) | history index-only scan |
| `idx_survey_speaker_submitted` | composite + WHERE | survey query |
| `idx_survey_redcap_pending` | partial | unsynced rows only |
| + 5 basic indexes | B-tree | patient_id, analysis_id, client_timestamp, file, username |

**Removed (6)**

- Redundant with the PK's first column: `idx_doctor_render_file`
- Redundant with a composite index: `idx_transcript_log_patient_id`, `idx_sp_analysis_id`
- Three single-column `user_interaction_log` indexes (role, file, speaker) — low
  frequency, no advantage over a full scan

> Commits: `acf9aa7`, `99e1321`

---

## 4. Query performance

**Analytics parallelised**

- Six sequential queries → `asyncio.gather` with independent sessions
- Each query uses its own `AsyncSessionLocal`, so the execution is genuinely parallel

**Batch optimisation**

- `download-batch`: N individual queries → a single `DISTINCT ON` query
- `predictions` top_n: Python-side slice → DB-level `ROW_NUMBER()` window function

**NLP prediction parallelised**

- Five models called sequentially → concurrently via `asyncio.gather` (~5× speedup)
- Verified: 15/15 predictions identical (diff = 0.00000000)

> Commits: `b64e51a`, `e1fbe2e`

---

## 5. Pipeline restructuring — fake CSV eliminated

Removed the CSV-based seed data entirely in favour of real pipeline output.

**Removed**

- The whole `fake_csv_files/` directory (8 CSVs, 5 Python generators, 2 mapping
  docs; −958 lines)
- `generate_real_scores.py` — it misused `.pred_1` as a score

**New pipeline (`pipeline_runner.py`)**

```
Step 1  Read transcript (xlsx/csv)
Step 2  Identify the doctor speaker (dynamic — text-length rule)
Step 3  Split into sentences
Step 4  NLP five-model prediction (asyncio.gather, parallel)
Steps 5-7  Top-N selection, context generation, xlsx export
Step 8  Consultation scorer → 0-5 quality score
Step 9  Patient summary rewriter → domain summaries
Step 10 persistence.save_all() → single-transaction DB write
```

- Runs automatically from the Docker prestart hook when a transcript file is present
- All six transcript files process cleanly, including the TurboScribe format

> Commits: `6b24d6c`, `d23dcae`, `42810b1`, `4f37548`, `5eb5255`

---

## 6. Dynamic doctor-speaker identification

Replaced the hard-coded `PHYSICIAN_IDS` list with dynamic identification.

**The manager's rule**: group by speaker, sum text length, the larger one is the doctor.

- Handles the keystrokes format (`Interviewer:`), the processed format
  (`Interviewer`), and the TurboScribe format (`Speaker 1` / `Speaker 2`)
- Backend `/api/doctor/files` now returns per-file speaker information
- Frontend maps speakers per file through `fileSpeakerMap` and supports `doctorid=auto`

> Commits: `fed885a`, `1b769ab`, `0fac8e4`, `65102c9`

---

## 7. Doctor demo — placeholders removed, API direct

- `getPlaceholderScore()` removed → the `scores/summary` response is used directly
- `overallScore`: frontend average → API `overall.score`
- Representative sentence: last-row/sort heuristic → the `(i, i2)` coordinates the
  API returns
- Patient first visit: quality-score top-7 → `pred_score` top-10, plus an
  `is_in_summary` flag

> Commits: `59f3f2c`, `527ffdd`

---

## 8. Security and stability

- **Error-message hardening**: `HTTPException(detail=str(e))` replaced with fixed
  messages, so SQLAlchemy internals (table names, query shape) no longer reach the
  client
- **Rate limiting**: 30 req/min on `POST /api/tracking/events` (Redis-backed,
  gracefully disabled when Redis is unavailable)
- **Batch transaction isolation**: `analyze-batch` uses an independent
  `AsyncSessionLocal` per file, so one file's rollback cannot affect another

> Commit: `b64e51a`

---

## 9. Backend architecture cleanup

**`main.py` split**

- 3,421 lines → 143 lines (−96%)
- Extracted `routes_doctor.py` (1,382 lines) and `routes_patient.py` (586 lines)

**Legacy code removed** (−2,002 lines total)

- `main.py` −1,247 (code from an unrelated earlier project)
- `routes_surveys.py` −380 · `init_db.py` −201 (fake-CSV seed logic) · `models.py` −174

**Code-review standards applied** (per the manager's review criteria)

- Thin main: every step is a single function call, no inline logic
- Config-driven: all service URLs and timeouts load from `config.yaml`
  (`os.getenv()` → `config.get()`)
- Readable imports: `from nlp_service import X` → `import nlp_classifier_client`
  (module.function() style)
- `nlp_service.py` renamed to `nlp_classifier_client.py` to match its role

**Alembic configuration**

- `alembic.ini`: hard-coded DB URL → environment variable
- `migrations/env.py`: rewritten for an async project
- `001_baseline.py`: records the current schema as the baseline
- Dockerfile prestart: `alembic stamp head` + `alembic upgrade head` enabled

> Commits: `d617b89`, `ff5cf97`, `5d4045c`, `527ffdd`, `99e1321`

---

## 10. Docker optimisation

| Component | Before | After | Change |
|---|---|---|---|
| Backend image | 522 MB | 428 MB | −18% (multi-stage build) |
| Webapp image | 1.25 GB | 860 MB | −31% (17 unused npm packages removed) |
| Webapp build warnings | 4 | 0 | fixed a bad export |
| Container resource limits | none | set | backend 1G/2CPU, postgres 512M, redis 256M |

- Added a backend `.dockerignore`; cleaned up the webapp one (removed duplicates,
  excluded tests and docs)
- Pagination safety: `limit` parameter (default 500) on `/api/doctor/files` and
  `/api/patient/files`

> Commits: `54b0b52`, `c210e0b`

---

## 11. DB persistence layer

Built to the structure the manager specified.

**`Backend/persistence.py`**

- `save_all()` handles four use cases in a single transaction:
  1. `transcript_analysis_log` — analysis run metadata
  2. `sentence_prediction` — per-sentence NLP predictions
  3. `doctor_sentence_view` — sentences plus quality score for the doctor dashboard
  4. `patient_summary` + `patient_summary_domain` — summaries for the patient dashboard
- `file_already_processed()` prevents duplicate processing
- Non-blocking: the pipeline completes normally even if the DB is unavailable

**Configuration split**

- DB connection: `DATABASE_URL` in `.env`
- Pipeline parameters: `Backend/config.yaml`
- Nothing hard-coded in the scripts

> Commits: `5d4045c`, `6b24d6c`

---

## 12. Validation

`run_all.sh`, April 3:

- All 10 containers healthy
- Five-model NLP analysis correct (8 sentences × 5 models)
- 1,000-request stress test: **1000/1000 succeeded (100.0%), 0 failures**
- Throughput 11.4 req/s, median latency 4 ms
- Dashboard `http://localhost:3000`, API docs `http://localhost:8000/docs`

---

## Summary

| Metric | Before | After |
|---|---|---|
| Backend `main.py` | 3,421 lines | 143 lines |
| Legacy commented-out code | ~2,000 lines | 0 |
| Backend Docker image | 522 MB | 428 MB |
| Webapp Docker image | 1.25 GB | 860 MB |
| Fake CSV files | 15 | 0 |
| DB indexes | basic only | +12 optimised, −6 redundant |
| `json.dumps` / `loads` | 11 calls | 0 |
| NLP prediction | sequential | parallel (`asyncio.gather`) |
| Doctor identification | hard-coded IDs | dynamic (text length) |
| `patient_summary` tables | 3 (fixed 5-slot) | 2 (normalised) |
| Pipeline data flow | CSV intermediate | direct DB write |
| Docker services | 8 | 10 (+scorer, +rewriter) |
| Transcript files processed | 1 | 6 (all) |
| Total lines | +8,949 / −10,725 | net −1,776 |
