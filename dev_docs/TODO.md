# Outstanding Improvement Items (TODO)

> Consolidated list of outstanding items extracted from 5 analysis reports, organized by priority.  
> Sources: BACKEND_IMPROVEMENTS_TODO_KR, DB_ISSUES_ANALYSIS, ML_MODEL_DEPLOYMENT_OPTIMIZATION, WEBAPP_OPTIMIZATION_ANALYSIS  
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

### Webapp

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 13 | Remove unused packages | plotly(112MB), maplibre(41MB), mapbox(31MB), timelinejs(26MB), etc. | ~210MB saved in node_modules |
| 14 | Clean up legacy components | 76 files, 64,112 lines -- only 10 of 160 components are active | Reduced build time + image size |
| 15 | Dynamic imports | Static imports in page.tsx -> `next/dynamic` lazy loading | First Load JS 272KB -> ~150KB |
| 16 | Consolidate chart libraries | Remove plotly + chart.js (keep d3 + recharts only) | ~120MB saved |

---

## MEDIUM

### Backend

| # | Item | Details |
|---|------|---------|
| 17 | JWT authentication | Single API key -> per-user JWT + expiration |
| 18 | Audit log | Table to record who accessed which data |
| 19 | batch_id tracking | Add column for querying batch analysis groups |
| 20 | Aggregate statistics API | Analysis count, per-model stats, patient count, etc. for dashboard use |
| 21 | Ground truth DB integration | nlp-pilot-manual-scores(cp).csv -> DB table + prediction vs. manual comparison API |
| 22 | DB SSL enforcement | Add `?sslmode=require` |
| 23 | Log PII masking | Prevent plaintext logging of patient_id, etc. |
| 24 | File versioning on patient_id re-analysis | Silent overwrite -> warning or version management |
| 25 | Upload directory size management | Implement old file cleanup policy or monitoring |

### ML Deployment

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 26 | Adaptive timeout | Fixed 30s -> payload-size-based 5/10/15s | Eliminate unnecessary waiting |
| 27 | Cache strategy improvement | TTL 1h->30m, text normalization, hit/miss statistics | +25-40% hit rate |
| 28 | Enhanced error classification | Single NLPServiceError -> split into Transient/Permanent | Eliminate unnecessary retries |

### Webapp

| # | Item | Details |
|---|------|---------|
| 29 | Move @types to devDependencies | d3, papaparse, plotly.js types are in production deps |
| 30 | Remove posthog-js, openai | Both are commented out (~32MB) |
| 31 | Upgrade Next.js 13 -> 14+ | App Router stabilization, Turbopack, etc. (breaking change risk) |
| 32 | API key layer exposure in build | NEXT_PUBLIC_API_KEY persists in Docker image layers |

---

## LOW

| # | Area | Item | Details |
|---|------|------|---------|
| 33 | Backend | Strengthen file upload validation | `.xlsx` extension check only -> add Content-Type + size limit |
| 34 | ML Deployment | ONNX conversion (long-term) | R Docker 1.41GB -> Python ~200MB. Not necessary at research scale |
| 35 | Webapp | Fix build warnings | surveysSecondVersion/index.tsx has 4 missing exports |
| 36 | Webapp | Clean up .dockerignore duplicates | node_modules declared twice |
| 37 | Webapp | Enable ESLint/TypeScript checks | Remove `ignoreBuildErrors: true` |

---

## Priority Summary

| Priority | Count | Key Focus |
|----------|-------|-----------|
| **CRITICAL** | 2 | NLP parallelization, Webapp Docker 80% size reduction |
| **HIGH** | 14 | TurboScribe conversion, PHI encryption, API improvements, package cleanup, legacy removal |
| **MEDIUM** | 16 | JWT, audit log, cache, timeout, Next.js upgrade |
| **LOW** | 5 | File validation, ONNX, build warnings |
| **Total** | **37** | |
