# Outstanding Improvement Items (TODO)

> Consolidated list of outstanding items, organized by priority.  
> Target: **Production level**  
> Last updated: 2026-04-10

---

## P0-A — NEW: Integrate AI Pipeline (Scoring + Reformat) into Backend

**Status:** Planning | **Priority:** Highest | **Added:** 2026-04-10

### What is this?

Guille's `ai_pipeline/` module uses GPT-4o to take the NLP-classified sentences and:
1. **Score** each sentence (0-5 relevance to domain)
2. **Extract** the actual risk numbers (e.g., "12% at 15 years")
3. **Select** the best sentence per domain
4. **Reformat** into plain language for patients (e.g., "Your doctor noted that your risk of dying of cancer is 24-25%")

This is currently a standalone Python module. We need to integrate it into the Backend so the dashboard can use these AI-generated patient summaries.

### Why is this needed?

Currently the Backend uses `patient-summary-rewriter` (a simple Docker service) to generate patient summaries. The new AI pipeline produces **much higher quality** summaries because:
- It extracts actual risk numbers from the consultation (not just top sentences)
- It scores relevance with chain-of-thought reasoning
- It reformats medical language into patient-friendly sentences
- It handles treatment-specific side effects (surgery vs radiation)

### Current Backend Pipeline (Steps 1-10)

```
Step 1-3: Read transcript → Filter doctor → Split sentences
Step 4:   NLP classification (R Random Forest, 5 models, Docker)
Step 5:   Top-N selection per domain
Step 6:   Context extraction
Step 7:   Export xlsx
Step 8:   Score sentences (consultation-scorer Docker)        ← quality score 0-5
Step 9:   Rewrite summaries (patient-summary-rewriter Docker) ← current AI summary
Step 10:  Save to DB
```

### Proposed New Pipeline (Steps 1-10 + 11-14)

```
Step 1-7:  [unchanged]
Step 8:    [unchanged] consultation-scorer
Step 9:    [unchanged] patient-summary-rewriter (keep as fallback)
Step 10:   [unchanged] Save to DB

NEW:
Step 11:   AI Scoring — GPT-4o scores each top sentence (0-5 relevance)
Step 12:   AI Extraction — GPT-4o extracts risk numbers
Step 13:   AI Selection — GPT-4o picks best estimate per domain
Step 14:   AI Reformat — GPT-4o converts to patient-facing sentence
Step 15:   Save AI results to DB (new table)
```

### Implementation Plan

#### Phase 1: DB Schema

New table `llm_domain_scoring_and_summary`:

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | auto-increment |
| analysis_id | INT FK | → transcript_analysis_log.id |
| patient_id | VARCHAR | e.g., SID_10 |
| domain | VARCHAR | cp/le/ed/inc/ius |
| ai_score | INT | 0-5 relevance score from GPT-4o |
| score_explanation | TEXT | chain-of-thought reasoning |
| extracted_estimate | TEXT | e.g., "24-25%" |
| treatment | VARCHAR | surgery/radiation/null (side-effect domains) |
| source_sentence | TEXT | original sentence used |
| reformat_sentence | TEXT | patient-facing sentence |
| source_filename | VARCHAR | transcript filename |
| created_at | TIMESTAMPTZ | |

#### Phase 2: Backend Service

New `ai_pipeline_service.py`:
- Import `run_ai_pipeline()` from `ai_pipeline.pipeline`
- Configure Azure OpenAI client from `.env`
- Accept `top_dfs_with_context` (Step 6 output) as input
- Return structured results for DB storage

#### Phase 3: Pipeline Integration

Modify `pipeline_runner.py`:
- After Step 7 (export xlsx), call `ai_pipeline_service.run()`
- Pass the same `final_results` dict that already has top sentences + context
- Save AI results to new `llm_domain_scoring_and_summary` table in Step 15

#### Phase 4: API Endpoint

New endpoint `GET /api/patient/ai-summary/{file}`:
- Returns AI-generated reformat sentences per domain
- Falls back to existing `patient-summary-rewriter` output if AI result not available

#### Phase 5: Frontend Integration

Update patient pages to display AI-generated summaries:
- Replace or supplement `summary_text` in `patient_summary_domain` with `reformat_sentence`
- Show extracted risk numbers alongside

### Files to Create/Modify

| File | Action |
|------|--------|
| `Backend/models.py` | Add `AIDomainResult` model |
| `Backend/database_schema.sql` | Add `llm_domain_scoring_and_summary` table DDL |
| `Backend/ai_pipeline_service.py` | NEW — wraps ai_pipeline for Backend use |
| `Backend/pipeline_runner.py` | Add Steps 11-15 |
| `Backend/routes_patient.py` | Add `GET /api/patient/ai-summary/{file}` |
| `Backend/.env` | Add `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY` |
| `Backend/Dockerfile` | Add `openai` package to requirements |
| `Backend/requirements.txt` | Add `openai` dependency |

### Dependencies

- Azure OpenAI API access (CBM account — verified working)
- `ai_pipeline/` module code (currently in AI_physician_patient_communication repo — need to copy or reference)
- Existing NLP pipeline output (Step 1-7 must complete first)

### Risk & Considerations

- **API cost:** GPT-4o calls per patient (~50 API calls per 5 domains). Estimate ~$0.50/patient
- **Latency:** ~3-4 minutes per patient (can run async after Step 7)
- **Fallback:** Keep existing rewriter as fallback if Azure API is unavailable
- **Secrets:** Azure API key must be in `.env`, never in code or git

---

## P0-B — BLOCKING: User Behavior Tracking & Session Recording

**Status:** Critical issues across all 3 patient-facing pages. Admin Tracking Dashboard cannot reliably display user behavior data.

**Impact:** Research team cannot analyze how patients and physicians interact with the consultation dashboard. Session recordings are incomplete. All behavior analytics in the Admin page are unreliable.

### Problem Summary

The User Interaction Tracking system — which records how users interact with the Patient First Visit, Patient Follow-up, and Physician Dashboard pages — has fundamental architecture issues that prevent most interaction events from being stored in the database. The Admin Tracking Dashboard (`/admin/tracking`) displays incomplete and inaccurate data as a result.

### Affected Pages

**Patient First Visit** (`PatientInitialVisitReportV35.tsx`):
- Domain panel open/close (topic_expand/collapse) — rarely reaches DB
- Helpfulness rating 1-5 (rating_click) — not reaching DB
- Evidence sentence open/close (evidence_expand/collapse) — rarely reaches DB
- Scroll depth, cursor proximity, page view — works (via separate system)
- Page dwell time — partially works

**Patient Follow-up** (`PatientFollowUpReportV31Re.tsx`):
- Survey answers: DCS 16 items, SDM 4 items, Risk Perception 5 items (survey_answer) — not reaching DB
- Satisfaction feedback (feedback_text_input) — not reaching DB
- Summary toggle per domain (summary_toggle) — not reaching DB
- Survey step navigation (survey_step_view) — not reaching DB
- Submit button clicks — not reaching DB

**Physician Dashboard** (`PhysicianReportsModifiedV41Timothy.tsx`):
- Patient selection (patient_select) — not reaching DB
- Score band filtering (score_band_filter) — not reaching DB
- Topic/sentence selection — not reaching DB
- AI rewrite workflow (generate, score, result) — not reaching DB
- View transitions (dashboard → grid → detail) — not reaching DB

### Root Cause

Two independent tracking systems exist with incompatible flush mechanisms:

- **System A (component-level):** Each page component has its own `TrackingEventManager` that records domain-specific events (topic_expand, rating_click, survey_answer, etc.) in memory. Events are flushed via `sendTrackingEvents()` on a 10-second `setInterval` timer. However, React re-renders reset the timer before it fires, and `useEffect` cleanup/re-setup on prop changes causes event loss.

- **System B (global hooks):** `useTracking()` hook captures page-level events (scroll, cursor, page_view) via `captureEvent()` in posthog.ts, which buffers and flushes to the same Backend API every 10 seconds. This system works correctly.

Result: System B events reach the DB (~95% of stored events are cursor/scroll/page_view). System A events (the research-critical ones: domain interactions, ratings, survey answers) are mostly lost.

### Additional Issues

- **Session fragmentation:** Same patient visit creates 4-6 separate sessions instead of 1, making per-session analysis unreliable
- **Patient data mixing:** When switching between patients, events from one patient can be attributed to another
- **Survey progress miscounting:** Admin dashboard shows incorrect survey completion counts due to duplicate event types and missing events
- **Domain name inconsistency:** "Continence" vs "Urinary Incontinence" mismatch between systems
- **rrweb session recording:** Records are stored but replay functionality not fully verified

### Recommended Fix

Unify System A and System B into a single tracking pipeline:
1. Replace component-level `TrackingEventManager` + `sendTrackingEvents()` with calls to the global `captureEvent()` from posthog.ts
2. This eliminates the dual-system problem — one buffer, one flush timer, one delivery path
3. All events (domain interactions + page-level metrics) flow through the same pipeline that is already proven to work

### Files Requiring Changes

| File | Change |
|------|--------|
| `Webapp/src/components/PatientInitialVisitReportV35.tsx` | Replace TrackingEventManager with captureEvent() |
| `Webapp/src/components/PatientFollowUpReportV31Re.tsx` | Replace TrackingEventManager with captureEvent() |
| `Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx` | Replace TrackingEventManager with captureEvent() |
| `Webapp/src/tracking/lib/posthog.ts` | Ensure context (file, visit_type) passed with each event |
| `Webapp/src/tracking/hooks/index.ts` | Stabilize context updates to prevent session fragmentation |
| `Backend/routes_tracking.py` | patient-behavior API domain matching fixes (partially done) |

---

## Recently Completed

| Item | Date | Commit |
|------|------|--------|
| Webapp Docker standalone output (861MB → 154MB, 82% reduction) | 2026-04-09 | cfd2095 |
| Improve Webapp .dockerignore (add __tests__, __mocks__, dist/, notused/, .git/) | 2026-04-09 | e92df9b |
| Delete 8 dist/ folders inside Webapp src/ (595KB build artifacts) | 2026-04-09 | b96e44b |
| Delete notused/ folders (4 locations, 5.5MB dead code) | 2026-04-09 | b96e44b |
| Redesign Selection Screen + Admin Tracking Dashboard (production UI) | 2026-04-09 | b96e44b |
| Add ERD v3 EN/KR with detailed table descriptions + API mapping | 2026-04-09 | 4e7cd31 |
| Remove hardcoded API key from all source files + git history rewrite | 2026-04-09 | b980f63 |
| API key rotation (old key revoked, new key deployed) | 2026-04-09 | 31af834 |
| patient_summary normalization (3 tables -> 2) | 2026-04-03 | b0f4fd4 |
| Remove AI_physician/db/ duplicate module | 2026-04-03 | 1e5d363 |
| Thin Main (Ivan Standard #1) — move inline logic to service modules | 2026-04-03 | 527ffdd |
| Readable Imports (Ivan Standard #4) — import module, not functions | 2026-04-03 | 527ffdd |
| Rename nlp_service -> nlp_classifier_client | 2026-04-03 | 527ffdd |
| Config-Driven (Ivan Standard #8) — services read from config.yaml | 2026-04-03 | 99e1321 |
| Remove 3 redundant indexes on user_interaction_log | 2026-04-03 | 99e1321 |
| Remove emojis from all Python code | 2026-04-03 | 99e1321 |
| NLP model predictions parallelized (asyncio.gather) | 2026-04-02 | e1fbe2e |
| Doctor Demo scoring — use API data directly, remove placeholder | 2026-04-03 | 4bca61e |
| Patient First Visit — pred_score top-10 sentences with is_in_summary | 2026-04-03 | 4bca61e |
| Patient selection screen (no URL params needed) | 2026-04-03 | 4bca61e |

---

## CRITICAL

| # | Area | Item | Details |
|---|------|------|---------|
| 1 | **Backend** | **Organize Backend folder structure** | 21 .py files in root — need clear separation: `services/` (transcript, scorer, rewriter, nlp_classifier_client), `routes/` (doctor, patient, surveys, tracking, transcript, nlp), `db/` (models, persistence, db, init_db), `core/` (config, redis_client, main). Remove stale files (csv_db_preprocessor.py, test_data_proc_vis_v5.py, wait_for_db.py if unused) |

---

## HIGH

### Backend — Features

| # | Item | Details |
|---|------|---------|
| 3 | **TurboScribe CSV -> xlsx auto-conversion** | No automation code to convert Ella's TurboScribe CSV into NLP input format (only major gap) |
| 4 | Analysis result deletion API | `DELETE /api/transcript/analysis/{id}` — transcript_analysis_log + sentence_prediction CASCADE |
| 5 | All patients list API | `GET /api/transcript/patients` — full list of analyzed patients + analysis count |
| 6 | `/history` score summary | Include per-model average/max scores in history response |

### Backend — Security

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

### DB Schema

| # | Item | Details |
|---|------|---------|
| ~~13~~ | ~~**Convert `doctor_sentence_view` to Materialized View**~~ | ~~Removed: `doctor_sentence_view` table eliminated. All queries now go directly to `sentence_prediction`.~~ |
| 14 | **Introduce `patient` master table** | Unify patient identity — `file` (full filename) vs `patient_id` (clean ID). Blocked by: large migration scope across all tables + frontend |
| 15 | **Fix `doctor_rewrite_log.score` hardcoded to 5** | `/score-sentence` always returns 5. Call consultation-scorer for actual score |

### Webapp — Code & Bundle

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 16 | Remove unused packages | plotly(112MB), maplibre(41MB), mapbox(31MB), timelinejs(26MB), etc. | ~210MB saved in node_modules |
| 17 | **Clean up legacy components (60+ files)** | 85 .tsx files total, only ~10 active. Versioned files: PhysicianReports V3-V41 (23), PatientReport V2-V31 (17), ConsultationScoring V3-V8 (8), PatientFollowUp V31-V37 (6), PatientInitialVisit V29-V35 (4). Keep only V41Timothy, V35, V31Re, V7Timothy7, FilterSidebarV3, HistoryModalV3 | ~100K lines removed, 6.9MB freed |
| 18 | Dynamic imports | Static imports in page.tsx -> `next/dynamic` lazy loading | First Load JS 272KB -> ~150KB |
| 19 | Consolidate chart libraries | Remove plotly + chart.js (keep d3 + recharts only) | ~120MB saved |
| ~~20~~ | ~~Delete `dist/` folders inside `src/`~~ | ~~Completed 2026-04-09 (b96e44b)~~ | ✅ |
| ~~21~~ | ~~Delete `notused/` folders~~ | ~~Completed 2026-04-09 (b96e44b)~~ | ✅ |
| 22 | **Merge duplicate survey components** | `src/components/surveys/` and `src/components/surveysSecondVersion/` have 6 identical components (BaselineQuestions, DCS, Satisfaction, RiskPerception, SDM). Minimal differences → merge into single directory with props-based switching | ~300KB duplication removed |
| 23 | **Clean page.tsx commented imports** | 15 commented-out import lines (V33, V35, V37, V39, etc.). Git history preserves all versions | Code clarity |

### Webapp — Config & Security

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 24 | **Remove `ignoreBuildErrors: true`** | `next.config.js` — TypeScript errors silenced during build. Type safety completely disabled for production | Runtime errors caught at build time |
| 25 | **Remove `ignoreDuringBuilds: true`** | `next.config.js` — ESLint disabled during build. Code quality/security issues not caught | Build-time lint enforcement |
| 26 | **Fix Next.js version mismatch** | `next: 13.5.6` but `eslint-config-next: 15.0.3` — 2 major versions apart. Lint rules may not match runtime behavior | Consistent tooling |
| ~~27~~ | ~~Fix `.dockerignore` completeness~~ | ~~Completed 2026-04-09 (e92df9b)~~ | ✅ |

---

## MEDIUM

### Backend

| # | Item | Details |
|---|------|---------|
| 28 | **REDCap sync retry mechanism** | Currently fire-and-forget (1 attempt, no retry). Need: auto-retry worker, exponential backoff, resync API endpoint |
| 29 | JWT authentication | Single API key -> per-user JWT + expiration |
| 30 | Audit log | Table to record who accessed which data |
| 31 | batch_id tracking | Add column for querying batch analysis groups |
| 32 | Aggregate statistics API | Analysis count, per-model stats, patient count for dashboard |
| 33 | Ground truth DB integration | nlp-pilot-manual-scores(cp).csv -> DB table + comparison API |
| 34 | DB SSL enforcement | Add `?sslmode=require` |
| 35 | Log PII masking | Prevent plaintext logging of patient_id |
| 36 | File versioning on re-analysis | Silent overwrite -> warning or version management |
| 37 | Upload directory size management | Old file cleanup policy or monitoring |
| 38 | Docker healthcheck timeout | Backend `start_period: 30s` -> `300s` (pipeline takes 3-4 min) |

### ML Deployment

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 39 | Adaptive timeout | Fixed 30s -> payload-size-based 5/10/15s | Eliminate unnecessary waiting |
| 40 | Cache strategy improvement | TTL 1h->30m, text normalization, hit/miss statistics | +25-40% hit rate |
| 41 | Enhanced error classification | Single NLPServiceError -> split into Transient/Permanent | Eliminate unnecessary retries |

### Webapp — Dependencies & Modernization

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 42 | Move @types to devDependencies | d3, papaparse, plotly.js types are in production deps | Cleaner dependency tree |
| 43 | Remove posthog-js, openai | Both are commented out (~32MB) | 32MB saved |
| 44 | **Upgrade Next.js 13.5.6 → 15.x** | App Router stabilization, Turbopack, performance improvements (breaking change risk) | Better performance, security patches |
| 45 | API key layer exposure in build | NEXT_PUBLIC_API_KEY persists in Docker image layers | Security improvement |
| 46 | **Remove unused d3-dsv dependency** | Only imported in `src/hooks/notused/useSARSCOVData.tsx` (dead code) | Bundle size reduction |
| 47 | **Expand Tailwind design system** | Only 4 custom colors defined, no spacing/typography tokens. Inline classes scattered across 85 components | Visual consistency |
| 48 | **Fix Zustand store hydration** | Stores use localStorage without SSR hydration safety. No `useEffect` guard for client-only reads | Prevent SSR/hydration mismatch |
| 49 | **Enable/remove PostHog** | `PostHogProvider.tsx` exists but PostHog initialization is commented out. Dead dependency | Clean up or activate analytics |

---

## LOW

| # | Area | Item | Details |
|---|------|------|---------|
| 50 | Backend DB | Add CHECK constraints (5 columns) | model, score, pred_score, survey_type, role — verify actual values first |
| 51 | Backend DB | Create expression indexes | date_trunc + extract hour — requires IMMUTABLE wrapper for TIMESTAMP WITH TIME ZONE |
| 52 | Backend | Strengthen file upload validation | `.xlsx` extension only -> add Content-Type + size limit |
| 53 | ML Deployment | ONNX conversion (long-term) | R Docker 1.41GB -> Python ~200MB |
| 54 | Webapp | **Fix build warnings** | surveysSecondVersion/index.tsx has 4 missing exports |
| ~~55~~ | ~~Webapp~~ | ~~Clean up .dockerignore~~ | ~~Completed 2026-04-09 (e92df9b) — merged into #27~~ |
| 56 | Webapp | **Remove duplicate postcss.config** | Both `postcss.config.js` and `postcss.config.mjs` exist — only .js is loaded |
| 57 | Webapp | **Clean commented code in components** | ConsultationScoringV7Timothy7.tsx has 73 lines commented out (~10.8% of file) |
| 58 | Webapp | **Remove unused test mocks** | jest.config mocks plotly.js-dist, react-plotly.js, posthog-js — none are actually used |

---

## Priority Summary

| Priority | Count | Key Focus |
|----------|-------|-----------|
| **CRITICAL** | 1 | Backend folder structure |
| **HIGH** | 15 | TurboScribe conversion, PHI encryption, Materialized View, patient master table, **legacy 60+ component cleanup, survey duplication, TS/ESLint enforcement** |
| **MEDIUM** | 22 | REDCap retry, JWT, cache, **Next.js upgrade, design system, Zustand hydration, PostHog cleanup** |
| **LOW** | 7 | CHECK constraints, expression indexes, ONNX, **postcss duplicate, dead test mocks** |
| **Completed** | **13** | Standalone Docker, dist/ cleanup, notused/ cleanup, .dockerignore, UI redesign, ERD v3, API key rotation, + 6 prior items |
| **Total remaining** | **45** | |
