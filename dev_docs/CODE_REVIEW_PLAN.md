# Code Review Plan — Prostate Cancer Consultation Dashboard

> Generated: 2026-04-10 | Based on full codebase analysis of Backend (22 .py files) and Webapp (212 .ts/.tsx files)

---

## Summary

| Area | Files | Issues Found | Critical | High | Medium | Low |
|------|-------|:------------:|:--------:|:----:|:------:|:---:|
| **Backend** | 22 .py | 22 | 3 | 7 | 8 | 4 |
| **Webapp** | 212 .ts/.tsx | 23 | 2 | 5 | 5 | 6 |
| **Total** | 234 | **45** | **5** | **12** | **13** | **10** |

**Estimated remediation: 60-80 hours for all P0+P1 items**

---

## Backend Review

### CRITICAL

| # | Issue | File:Line | Risk |
|---|-------|-----------|------|
| B-1 | **140+ print() statements in production** | `routes_patient.py:65-70`, `routes_surveys.py:214+` (100+ prints), `routes_doctor.py:245+` | Performance degradation, sensitive data leakage to stdout |
| B-2 | **REDCap API token partially logged** | `routes_surveys.py:814, 842, 864, 882` | Token exposure in logs |
| B-3 | **Weak password hashing (SHA-256 instead of bcrypt)** | `auth/admin_routes.py:50-66` | SHA-256 is fast hash, not password hash. Should use bcrypt/argon2 |

### HIGH

| # | Issue | File:Line | Risk |
|---|-------|-----------|------|
| B-4 | **No auth on /health endpoint** | `main.py:106-137` | Exposes internal service status (DB, Redis, NLP) to unauthenticated users |
| B-5 | **Bare `except Exception` swallowing errors** | `main.py:55`, `redis_client.py:30`, `nlp_classifier_client.py:174-185`, `auth/backends/multi_key.py:74` | Silent failures mask configuration issues |
| B-6 | **JWT default secret = "change-me"** | `auth/backends/jwt_auth.py:18-19` | JWT tokens can be forged if env var not set |
| B-7 | **No input validation on `file` parameter** | `routes_doctor.py:42`, `routes_patient.py:113` | Unvalidated string accepted in all file-based queries |
| B-8 | **Inconsistent error response format** | Throughout `routes_*.py` | Frontend error handling unreliable |
| B-9 | **No rate limiting fallback** | `routes_surveys.py:33`, `routes_tracking.py:26` | If Redis is down, rate limiting disabled entirely |
| B-10 | **No logging for failed auth attempts** | `auth/backends/api_key.py:22-31` | Cannot detect brute force attacks |

### MEDIUM

| # | Issue | File | Risk |
|---|-------|------|------|
| B-11 | Commented-out code in production | `routes_surveys.py:250-276` | Dead code confusion |
| B-12 | Pagination allows up to 5000 rows | `routes_doctor.py:378` | Memory exhaustion risk |
| B-13 | No request body size limit on survey submission | `routes_surveys.py:40-46` | OOM attack vector |
| B-14 | Inconsistent transaction management | Multiple routes | Some explicit commit, some implicit |
| B-15 | Manual session creation in auth | `auth/backends/jwt_auth.py:88` | Session leak risk |
| B-16 | Missing CORS validation | `main.py:72-84` | Invalid JSON crashes startup; wildcard not prevented |
| B-17 | Health check tests connectivity, not pool | `db.py:37-43` | Pool exhaustion not detected |
| B-18 | Connection pool validation missing | `db.py:37-43` | Pool readiness != app readiness |

### LOW

| # | Issue | File | Risk |
|---|-------|------|------|
| B-19 | Index documentation only in DDL, not models | `models.py` | Developers miss optimization info |
| B-20 | Missing docstrings on some endpoints | `routes_tracking.py:92` | OpenAPI docs incomplete |
| B-21 | Magic numbers hardcoded | `nlp_classifier_client.py:146`, `routes_tracking.py:26` | Should be in config |
| B-22 | TODO without owner/deadline | `init_db.py:49-50` | Unknown priority |

---

## Webapp Review

### CRITICAL

| # | Issue | File | Risk |
|---|-------|------|------|
| W-1 | **`ignoreBuildErrors: true`** — TypeScript errors hidden | `next.config.js:7` | Broken code silently deploys |
| W-2 | **`ignoreDuringBuilds: true`** — ESLint errors hidden | `next.config.js:10` | Code quality/security issues not caught |

### HIGH

| # | Issue | File | Risk |
|---|-------|------|------|
| W-3 | **453+ console.log in production** | `page.tsx:164+`, stores, api, components | Info leakage, performance, console spam |
| W-4 | **63 legacy versioned components** (only 4 active) | `src/components/PhysicianReportsModifiedV3-V39.tsx` (27), `PatientReportModifiedV2-V31.tsx` (23), etc. | ~100K lines dead code, maintenance nightmare |
| W-5 | **Zustand store hydration unsafe** | `stores/usePatientId.tsx`, `useDoctorId.tsx`, `useFileId.tsx` | localStorage without SSR guard, hydration mismatch |
| W-6 | **Survey components duplicated** | `surveys/` vs `surveysSecondVersion/` (5 pairs) | 300KB duplication, unclear which is active |
| W-7 | **175+ `any` type usage** | Throughout components | Type safety bypassed |

### MEDIUM

| # | Issue | File | Risk |
|---|-------|------|------|
| W-8 | No error boundaries | Components | Unhandled errors crash entire app |
| W-9 | Manual fetch without caching | `page.tsx:291-303` | No retry, no dedup, no cache |
| W-10 | Components >1000 lines (15+) | `ReportDownload.tsx` (8,178), `StackedBarChart.tsx` (4,759), `V41Timothy.tsx` (4,100) | Hard to test and maintain |
| W-11 | Next.js 13.5.6 (2+ years old) | `package.json` | Missing security patches, perf improvements |
| W-12 | WindowSizeStore SSR flash | `stores/useWindowSizeStore.tsx` | width=0, height=0 on initial render |

### LOW

| # | Issue | File | Risk |
|---|-------|------|------|
| W-13 | Unused dependencies (plotly, react-joyride) | `package.json` | Bundle bloat |
| W-14 | Missing TypeScript strict mode | `tsconfig.json` | Loose type checking |
| W-15 | No pre-commit hooks | — | Errors pushed without checks |
| W-16 | 125 components in flat directory | `src/components/` | No feature-based organization |
| W-17 | Unused exports in legacy components | `PatientReportModified.tsx` etc. | Dead code |
| W-18 | Duplicate postcss.config | `postcss.config.js` + `postcss.config.mjs` | Only .js loaded |

---

## Review Priority & Schedule

### P0 — Fix Before Next Release (Week 1)

| # | Item | Effort | Owner |
|---|------|--------|-------|
| B-1 | Replace 140+ print() → logger.debug/info | 4h | |
| B-2 | Remove REDCap token from logs | 1h | |
| B-3 | Replace SHA-256 → bcrypt for passwords | 2h | |
| B-6 | Remove JWT default secret fallback | 30m | |
| W-1 | Remove `ignoreBuildErrors`, fix TS errors | 4-8h | |
| W-2 | Remove `ignoreDuringBuilds`, fix ESLint | 2-4h | |
| W-4 | Delete 63 legacy versioned components | 2h | |
| W-6 | Merge survey duplicates into single directory | 1h | |

### P1 — Next Sprint (Week 2-3)

| # | Item | Effort | Owner |
|---|------|--------|-------|
| B-4 | Add auth to /health endpoint | 30m | |
| B-5 | Replace bare except with specific handlers | 3h | |
| B-7 | Add file parameter validation | 2h | |
| B-8 | Standardize error response format | 4h | |
| B-10 | Add auth failure logging | 1h | |
| W-3 | Strip console.log from production | 2h | |
| W-5 | Fix Zustand hydration with persist middleware | 3h | |
| W-7 | Add TypeScript types for API responses | 4h | |
| W-8 | Add React error boundaries | 2h | |

### P2 — Backlog (Month 1-2)

| # | Item | Effort | Owner |
|---|------|--------|-------|
| B-9 | Rate limiting fallback (in-memory) | 4h | |
| B-12 | Lower pagination limits | 1h | |
| B-16 | CORS validation | 1h | |
| W-9 | Replace fetch with React Query | 8h | |
| W-10 | Break up large components | 16h | |
| W-11 | Upgrade Next.js 13 → 15 | 8-16h | |
| W-14 | Enable TypeScript strict mode | 8h | |

---

## Code Review Checklist (for ongoing PRs)

### Backend Checklist
- [ ] No print() statements — use logger
- [ ] No hardcoded secrets/keys
- [ ] Specific exception handling (not bare except)
- [ ] Auth dependency on all endpoints
- [ ] Input validation on path/query parameters
- [ ] Explicit `await db.commit()` after writes
- [ ] Rate limiting on public-facing endpoints
- [ ] Type hints on function signatures
- [ ] Failed auth attempts logged

### Frontend Checklist
- [ ] No console.log in production code
- [ ] No `any` type — use concrete types
- [ ] Component < 300 lines (or justified)
- [ ] No inline styles for repeated patterns
- [ ] Error handling on all fetch calls
- [ ] Loading states for async operations
- [ ] SSR-safe localStorage access (useEffect guard)
- [ ] Accessibility (aria labels, keyboard navigation)
- [ ] Tailwind dark mode classes (not inline isDarkMode ternary)

### Security Checklist
- [ ] No PHI in logs, console, or error messages
- [ ] API key not exposed in client bundle
- [ ] File path parameters validated
- [ ] Request body size limits
- [ ] CORS origins whitelisted (no wildcard)
- [ ] JWT secrets rotated, no defaults
- [ ] Password hashing uses bcrypt/argon2

---

## Files to Review (by risk)

### Backend — High Risk (review first)
```
routes_surveys.py      (1,757 lines — 100+ prints, REDCap token logging)
auth/admin_routes.py   (140 lines — weak password hashing)
auth/backends/jwt_auth.py (94 lines — default secret)
main.py                (143 lines — unauthenticated /health)
routes_patient.py      (586 lines — 20+ prints)
```

### Backend — Medium Risk
```
routes_doctor.py       (1,382 lines)
routes_tracking.py     (807 lines)
routes_transcript.py   (761 lines)
nlp_classifier_client.py (297 lines)
```

### Webapp — High Risk (review first)
```
next.config.js         (33 lines — build errors ignored)
src/app/page.tsx       (530 lines — 15 commented imports, monolithic)
src/components/AdminTrackingDashboard.tsx (1,200+ lines)
src/stores/usePatientId.tsx (hydration unsafe)
```

### Webapp — Cleanup (bulk delete)
```
src/components/PhysicianReportsModifiedV3-V39*.tsx  (27 files — DELETE)
src/components/PatientReportModifiedV2-V31*.tsx     (23 files — DELETE)
src/components/PatientFollowUpReportV33-V37*.tsx    (5 files — DELETE)
src/components/PatientInitialVisitReportV29-V33*.tsx (3 files — DELETE)
src/components/surveys/                             (5 files — DELETE, keep surveysSecondVersion)
```
