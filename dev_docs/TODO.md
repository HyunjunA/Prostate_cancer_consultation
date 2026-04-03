# Outstanding Improvement Items (TODO)

> Consolidated list of outstanding items, organized by priority.  
> Target: **Production level**  
> Sources: BACKEND_IMPROVEMENTS_TODO_KR, DB_ISSUES_ANALYSIS, ML_MODEL_DEPLOYMENT_OPTIMIZATION, WEBAPP_OPTIMIZATION_ANALYSIS, DB schema analysis (2026-04-03)  
> Last consolidated: 2026-04-03

---

## CRITICAL

| # | Area | Item | Details | Expected Impact |
|---|------|------|---------|-----------------|
| 1 | ML Deployment | **Parallelize NLP model predictions** | 5 models called sequentially -> concurrent calls via `asyncio.gather()` | ~5x pipeline speed improvement |
| 2 | Webapp Docker | **Use standalone output** | Configured in `next.config.js` but ignored by Dockerfile. Copy standalone output instead of reinstalling node_modules | Image size 1.25GB -> ~250MB (80% reduction) |

---

## HIGH

### Backend -- Features

| # | Item | Details |
|---|------|---------|
| 3 | **TurboScribe CSV -> xlsx auto-conversion** | No automation code to convert Ella's TurboScribe CSV into NLP input format (only major gap) |
| 4 | Analysis result deletion API | `DELETE /api/transcript/analysis/{id}` -- transcript_analysis_log + sentence_prediction CASCADE |
| 5 | All patients list API | `GET /api/transcript/patients` -- full list of analyzed patients + analysis count |
| 6 | `/history` score summary | Include per-model average/max scores in history response |

### Backend -- Security

| # | Item | Details |
|---|------|---------|
| 7 | **Patient data encryption (PHI)** | sentence_text, context, etc. stored in plaintext. Requires pgcrypto or app-level encryption (HIPAA) |
| 8 | xlsx file encryption | Stored on disk without encryption |
| 9 | Frontend API key exposure | Exposed to client via `NEXT_PUBLIC_API_KEY`. Switch to proxy pattern or session-based auth |

### ML Deployment

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 10 | Adjust NLP replica count | After parallelization, scale from 3 to 5 replicas + add CPU limits | 67% increase in concurrent processing capacity |
| 11 | Connection pool optimization | httpx max=20->30, keepalive=10->20 | +15-20% throughput |
| 12 | Retry logic improvement | Add jitter + classify 4xx/5xx errors (permanent/transient) | Prevent thundering herd |

### DB Schema — Production Readiness (verified 2026-04-03, all confirmed in code)

| # | Item | Details | Evidence |
|---|------|---------|----------|
| 13 | **Normalize `patient_summary` (3 tables → 2)** | `patient_summary`, `patient_summary_scoring`, `patient_responses` all use hardcoded class_1~class_5 columns. Adding a 6th domain requires ALTER TABLE on 3 tables + code changes in 7 places. Normalize to `patient_summary` + `patient_summary_domain` (1 row per domain). Also removes unused `patient_responses` table. | `database_schema.sql:47-93`, `persistence.py:100-103`, `pipeline_runner.py:158-164` |
| 14 | **Introduce `patient` master table** | No patient master table exists. `doctor_sentence_view` uses `file` (full filename) as patient identifier, while `sentence_prediction` uses `patient_id` (clean ID). Two identity systems coexist. Need unified patient table with clean ID, all tables reference it. | `database_schema.sql:21` (PK is file), `sentence_prediction` has separate `patient_id`, frontend uses `fileid` URL param |
| 15 | **Convert `doctor_sentence_view` to View** | Same NLP data stored in both `sentence_prediction` (50 rows/patient) and `doctor_sentence_view` (45 rows/patient). `persistence.py` INSERTs into both. Convert `doctor_sentence_view` to a Materialized View over `sentence_prediction` to eliminate duplication and inconsistency risk. Requires changing `doctor_rewrite_log` FK. | `persistence.py:69-96` (dual INSERT) |
| 16 | **Add missing CHECK constraints (5 columns)** | `sentence_prediction.model` (no check, should be cp/inc/ed/ius/le), `doctor_sentence_view.score` (no check, should be 0-5), `sentence_prediction.pred_score` (no check, should be 0.0-1.0), `survey_submission_log.survey_type` (no check), `user_interaction_log.role` (no check). Pattern exists in `auth_user.role` and `patient_summary_scoring` but not applied consistently. | `database_schema.sql:197,18,203,118,264` |
| 17 | **Remove redundant indexes on `user_interaction_log`** | 9 indexes on the highest-INSERT table. `idx_uil_file` redundant with composite `idx_uil_file_event_type`, `idx_uil_role` low-cardinality (2 values), `idx_uil_speaker` rarely queried alone. Remove 3, keep 6. | `database_schema.sql:275-288` |
| 18 | **Fix `doctor_rewrite_log.score` hardcoded to 5** | `/score-sentence` endpoint always returns 5 ("placeholder until scoring pipeline implemented"). Rewrite feedback has no real value. Call consultation-scorer for actual score. | `routes_doctor.py:796-801` |

### Webapp

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 19 | Remove unused packages | plotly(112MB), maplibre(41MB), mapbox(31MB), timelinejs(26MB), etc. | ~210MB saved in node_modules |
| 20 | Clean up legacy components | 76 files, 64,112 lines -- only 10 of 160 components are active | Reduced build time + image size |
| 21 | Dynamic imports | Static imports in page.tsx -> `next/dynamic` lazy loading | First Load JS 272KB -> ~150KB |
| 22 | Consolidate chart libraries | Remove plotly + chart.js (keep d3 + recharts only) | ~120MB saved |

---

## MEDIUM

### Backend

| # | Item | Details |
|---|------|---------|
| 23 | **REDCap sync retry mechanism** | Currently fire-and-forget (1 attempt, no retry). Need: auto-retry worker for `redcap_synced=FALSE` records, exponential backoff, resync API endpoint, admin failure alerts |
| 24 | JWT authentication | Single API key -> per-user JWT + expiration |
| 25 | Audit log | Table to record who accessed which data |
| 26 | batch_id tracking | Add column for querying batch analysis groups |
| 27 | Aggregate statistics API | Analysis count, per-model stats, patient count, etc. for dashboard use |
| 28 | Ground truth DB integration | nlp-pilot-manual-scores(cp).csv -> DB table + prediction vs. manual comparison API |
| 29 | DB SSL enforcement | Add `?sslmode=require` |
| 30 | Log PII masking | Prevent plaintext logging of patient_id, etc. |
| 31 | File versioning on patient_id re-analysis | Silent overwrite -> warning or version management |
| 32 | Upload directory size management | Implement old file cleanup policy or monitoring |

### ML Deployment

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 33 | Adaptive timeout | Fixed 30s -> payload-size-based 5/10/15s | Eliminate unnecessary waiting |
| 34 | Cache strategy improvement | TTL 1h->30m, text normalization, hit/miss statistics | +25-40% hit rate |
| 35 | Enhanced error classification | Single NLPServiceError -> split into Transient/Permanent | Eliminate unnecessary retries |

### Webapp

| # | Item | Details |
|---|------|---------|
| 36 | Move @types to devDependencies | d3, papaparse, plotly.js types are in production deps |
| 37 | Remove posthog-js, openai | Both are commented out (~32MB) |
| 38 | Upgrade Next.js 13 -> 14+ | App Router stabilization, Turbopack, etc. (breaking change risk) |
| 39 | API key layer exposure in build | NEXT_PUBLIC_API_KEY persists in Docker image layers |

---

## LOW

| # | Area | Item | Details |
|---|------|------|---------|
| 40 | Backend | Strengthen file upload validation | `.xlsx` extension check only -> add Content-Type + size limit |
| 41 | ML Deployment | ONNX conversion (long-term) | R Docker 1.41GB -> Python ~200MB |
| 42 | Webapp | Fix build warnings | surveysSecondVersion/index.tsx has 4 missing exports |
| 43 | Webapp | Clean up .dockerignore duplicates | node_modules declared twice |
| 44 | Webapp | Enable ESLint/TypeScript checks | Remove `ignoreBuildErrors: true` |

---

## Priority Summary

| Priority | Count | Key Focus |
|----------|-------|-----------|
| **CRITICAL** | 2 | NLP parallelization, Webapp Docker 80% size reduction |
| **HIGH** | 22 | DB schema normalization, patient master table, View conversion, CHECK constraints, index cleanup, TurboScribe conversion, PHI encryption, package/legacy cleanup |
| **MEDIUM** | 17 | REDCap retry, JWT, audit log, cache, timeout, Next.js upgrade |
| **LOW** | 5 | File validation, ONNX, build warnings |
| **Total** | **44** | |
