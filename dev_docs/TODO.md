# Outstanding Improvement Items (TODO)

> Consolidated list of outstanding items, organized by priority.  
> Target: **Production level**  
> Last updated: 2026-04-03

---

## Recently Completed

| Item | Date | Commit |
|------|------|--------|
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
| 2 | Webapp Docker | **Use standalone output** | Configured in `next.config.js` but ignored by Dockerfile. Copy standalone output instead of reinstalling node_modules. Image size 1.25GB -> ~250MB (80% reduction) |

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
| 13 | **Convert `doctor_sentence_view` to Materialized View** | Same data in `sentence_prediction` and `doctor_sentence_view`. Convert to View to eliminate duplication. Blocked by: class abbreviation mapping (cp vs cancer_prognosis) |
| 14 | **Introduce `patient` master table** | Unify patient identity — `file` (full filename) vs `patient_id` (clean ID). Blocked by: large migration scope across all tables + frontend |
| 15 | **Fix `doctor_rewrite_log.score` hardcoded to 5** | `/score-sentence` always returns 5. Call consultation-scorer for actual score |

### Webapp — Code & Bundle

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 16 | Remove unused packages | plotly(112MB), maplibre(41MB), mapbox(31MB), timelinejs(26MB), etc. | ~210MB saved in node_modules |
| 17 | **Clean up legacy components (60+ files)** | 85 .tsx files total, only ~10 active. Versioned files: PhysicianReports V3-V41 (23), PatientReport V2-V31 (17), ConsultationScoring V3-V8 (8), PatientFollowUp V31-V37 (6), PatientInitialVisit V29-V35 (4). Keep only V41Timothy, V35, V31Re, V7Timothy7, FilterSidebarV3, HistoryModalV3 | ~100K lines removed, 6.9MB freed |
| 18 | Dynamic imports | Static imports in page.tsx -> `next/dynamic` lazy loading | First Load JS 272KB -> ~150KB |
| 19 | Consolidate chart libraries | Remove plotly + chart.js (keep d3 + recharts only) | ~120MB saved |
| 20 | **Delete `dist/` folders inside `src/` (8 locations)** | `src/components/dist/`, `src/components/dist/dist/` (nested!), `src/components/charts/plotly/dist/`, `src/tracking/*/dist/` (4), `src/app/providers/dist/`. Build artifacts in source tree | 595KB freed, prevent accidental import |
| 21 | **Delete `notused/` folders (4 locations)** | Root `Webapp/notused/` (5.3MB), `src/components/notused/` (19 files), `src/components/charts/d3js/notused/`, `src/hooks/notused/`. Dead code should be in git history, not working tree | 5.5MB+ freed |
| 22 | **Merge duplicate survey components** | `src/components/surveys/` and `src/components/surveysSecondVersion/` have 6 identical components (BaselineQuestions, DCS, Satisfaction, RiskPerception, SDM). Minimal differences → merge into single directory with props-based switching | ~300KB duplication removed |
| 23 | **Clean page.tsx commented imports** | 15 commented-out import lines (V33, V35, V37, V39, etc.). Git history preserves all versions | Code clarity |

### Webapp — Config & Security

| # | Item | Details | Expected Impact |
|---|------|---------|-----------------|
| 24 | **Remove `ignoreBuildErrors: true`** | `next.config.js` — TypeScript errors silenced during build. Type safety completely disabled for production | Runtime errors caught at build time |
| 25 | **Remove `ignoreDuringBuilds: true`** | `next.config.js` — ESLint disabled during build. Code quality/security issues not caught | Build-time lint enforcement |
| 26 | **Fix Next.js version mismatch** | `next: 13.5.6` but `eslint-config-next: 15.0.3` — 2 major versions apart. Lint rules may not match runtime behavior | Consistent tooling |
| 27 | **Fix `.dockerignore` completeness** | Missing: `src/__tests__/`, `src/__mocks__/`, `*.md`, `notused/`, `dist/` inside src, `.git/`. Currently bloating Docker image | Image ~1.25GB → ~250MB (with standalone) |

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
| 55 | Webapp | **Clean up .dockerignore** | node_modules declared twice, missing exclusions |
| 56 | Webapp | **Remove duplicate postcss.config** | Both `postcss.config.js` and `postcss.config.mjs` exist — only .js is loaded |
| 57 | Webapp | **Clean commented code in components** | ConsultationScoringV7Timothy7.tsx has 73 lines commented out (~10.8% of file) |
| 58 | Webapp | **Remove unused test mocks** | jest.config mocks plotly.js-dist, react-plotly.js, posthog-js — none are actually used |

---

## Priority Summary

| Priority | Count | Key Focus |
|----------|-------|-----------|
| **CRITICAL** | 2 | Backend folder structure, Webapp Docker standalone |
| **HIGH** | 19 | TurboScribe conversion, PHI encryption, Materialized View, patient master table, **legacy 60+ component cleanup, dist/ removal, survey duplication, TS/ESLint enforcement** |
| **MEDIUM** | 22 | REDCap retry, JWT, cache, **Next.js upgrade, design system, Zustand hydration, PostHog cleanup** |
| **LOW** | 9 | CHECK constraints, expression indexes, ONNX, **build warnings, postcss duplicate, dead test mocks** |
| **Total** | **58** | |
