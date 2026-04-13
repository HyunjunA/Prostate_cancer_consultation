# Webapp Production Readiness Audit

> Target: `app/Webapp/`  
> Date: 2026-04-13  
> Purpose: Assess current codebase against production-readiness standards and generate an improvement TODO list

---

## 1. Current Status Summary

| Area | Status | Notes |
|------|--------|-------|
| **Framework** | Next.js 13.5.6 (App Router) | Latest LTS is 15.x — two major versions behind |
| **Type Safety** | ⚠️ Partial | Strict mode ON but ignored at build time (`ignoreBuildErrors: true`) |
| **Testing** | ✅ Moderate | 27 Jest unit tests + 7 Playwright E2E tests |
| **Component Management** | 🔴 Critical | 92 files total, 57 are unused version duplicates (Patient 32 + Physician 25) |
| **Security** | 🟠 High | ~~API key exposed~~ (fixed 2026-04-13), weak encryption remains |
| **Performance** | ⚠️ Moderate | 3 chart libraries loaded simultaneously, no code splitting |
| **Deployment** | ✅ Good | Docker multi-stage build, standalone config |
| **Error Handling** | 🔴 Poor | No Error Boundaries, silent API failures |
| **Accessibility** | ⚠️ Unknown | Radix UI–based but untested |

---

## 2. Architecture Analysis

### 2.1 Routing Structure

URL parameter–based SPA routing (Next.js App Router underutilized):

```
/ (no params)                     → SelectionScreen (patient/doctor selection)
/?doctorid=xxx                    → PhysicianReportsModifiedV41Timothy (doctor view)
/?fileid=X&patid=Y&visit=first   → PatientInitialVisitReportV35 (first visit)
/?fileid=X&patid=Y&visit=followup → PatientFollowUpReportV31Re (follow-up)
```

**Issue**: All view logic is concentrated in a single `page.tsx`. File-based routing, layouts, and loading states from Next.js are not leveraged.

### 2.2 State Management

- **Zustand** with 8 stores: `usePatientId`, `useFileId`, `useDoctorId`, `useThemeStore`, etc.
- Direct localStorage read/write with no error handling
- No API data caching — full refetch on every page transition

### 2.3 Component Version Inventory

**Currently in use (imported in page.tsx):**
- `PhysicianReportsModifiedV41Timothy` (doctor view)
- `PatientInitialVisitReportV35` (first visit)
- `PatientFollowUpReportV31Re` (follow-up)

**Unused versions (57 files):**
- PatientReportModified: V1–V31 (16 files)
- PatientFollowUpReport: V31, V33, V33Re, V35, V37 (5 files)
- PatientInitialVisitReport: V29, V31, V33 (3 files)
- PhysicianReportsModified: V1–V39Timothy (24 files)
- ConsultationScoring: V3, V5, V7, V7Timothy, V7Timothy3, V7Timothy5, V7Timothy7, V8 (8 files)
- HistoryModal: V3 (1 file)

### 2.4 Data Flow

```
URL params → Zustand stores → Custom hooks (useDoctorData, usePatientData)
  → direct fetch() calls → component state → render
```

- No API client abstraction (each hook calls fetch directly)
- No retry logic
- No request deduplication

---

## 3. Security Analysis

### 🔴 CRITICAL

| # | Issue | Description |
|---|-------|-------------|
| S1 | **API key exposed to client** | `NEXT_PUBLIC_API_KEY` is embedded in the JS bundle at build time. Anyone can view it in browser DevTools |
| S2 | **Build errors ignored** | `ignoreBuildErrors: true` + `ignoreDuringBuilds: true` → code with type errors and lint violations deploys to production |

### 🟠 HIGH

| # | Issue | Description |
|---|-------|-------------|
| S3 | **717 console.log statements** | Internal state, API responses, and error details leak to browser console |
| S4 | **Weak encryption** | `cryptoUtils.tsx` encrypt/decrypt uses Base64 + string reversal — not real encryption |
| S5 | **rrweb session recording** | PHI masking relies on keyword filtering only. Medical data may be captured |
| S6 | **No CSP headers** | Content Security Policy not configured → vulnerable to XSS attacks |

### 🟡 MEDIUM

| # | Issue | Description |
|---|-------|-------------|
| S7 | **No localStorage expiration** | Patient IDs persist indefinitely; PHI exposure risk on shared computers |
| S8 | **PostHog incompletely disabled** | Code exists but is commented out — could be accidentally re-enabled |

---

## 4. Code Quality Analysis

### 4.1 Oversized Components (need refactoring)

| File | LOC | Issue |
|------|-----|-------|
| `ReportDownload.tsx` | ~8,178 | All PDF generation logic in a single component |
| `PhysicianReportsModifiedV41Timothy.tsx` | ~4,145 | 20+ useState hooks, 3 view modes in one file |
| `PatientFollowUpReportV35.tsx` | ~3,030 | Survey + report + navigation mixed together |
| `StackedBarChart (D3)` | ~4,759 | ~5,000 lines for a single chart |

### 4.2 Type Safety

- `any` or `@ts-ignore` usage: ~501 instances
- Key hook return types are `any[]`
- Build-time type checking disabled, so no real protection

### 4.3 Duplicate Code

- `surveys/` vs `surveysSecondVersion/`: identical survey components maintained in two copies
- Chart components: similar charts implemented across D3, Plotly, and Recharts
- `BetaConsentModal.jsx` vs `BetaConsentModalNonAIAPI.jsx`

### 4.4 Unused Code & Assets

- `/public/flu_json_data/` (26 JSON files — flu data, unrelated to prostate cancer)
- `/public/not_used/` directory
- `/public/json_nuspar_related/` with duplicate variant files
- Multiple commented-out imports (top 15 lines of `page.tsx` are commented imports)

---

## 5. Performance Analysis

| Area | Current State | Improvement |
|------|---------------|-------------|
| **Bundle size** | D3 (140KB) + Recharts + Plotly loaded together | Dynamic import only the charts in use |
| **Code splitting** | None (all views loaded from page.tsx) | Next.js dynamic import or route splitting |
| **API caching** | None | Introduce React Query or SWR |
| **Re-renders** | Many components lack useCallback/useMemo | Optimize starting from large components |
| **Docker image** | ~1.25GB (estimated) | Use standalone output properly → ~250MB |

---

## 6. Dependency Analysis

### Updates Needed

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `next` | 13.5.6 | 15.x | 🟠 Missing security patches |
| `react` | 18.2.0 | 19.x | 🟡 Prepare for React 19 migration |
| `express` | 5.1.0 | 5.x | 🟡 Very new major version, production stability unproven |
| `rrweb` | 2.0.0-alpha.4 | alpha | 🟠 Alpha version in production |
| `eslint-config-next` | 15.0.3 | - | ⚠️ Version mismatch with Next.js 13 |

### Candidates for Removal

| Package | Reason |
|---------|--------|
| `plotly.js` (react-plotly.js) | Fully mocked in tests; unclear if actively used |
| `posthog-js` | Currently disabled |
| `rrweb` / `rrweb-player` | Alpha version + PHI risk |

---

## 7. Testing Status

| Type | Files | Coverage |
|------|-------|----------|
| Jest unit tests | 27 | Stores, API functions, utilities |
| Playwright E2E | 7 | Key user flows |

**Gaps:**
- No component tests for doctor view (V41Timothy)
- No error state testing
- No accessibility testing
- No performance testing

---

## 8. TODO List (by Priority)

### 🔴 CRITICAL (Immediate)

- [x] **[S1] Move API key to server side** — ✅ Done (2026-04-13). Created `/api/backend/[...path]` catch-all proxy route. `NEXT_PUBLIC_API_KEY` → `API_KEY` (server-only). Updated 7 frontend files, Dockerfile, docker-compose.yml, and Nginx config (`/api/backend/` → webapp, `/api/` → backend)
- [ ] **[S2] Enable build error checking** — Remove `ignoreBuildErrors` and `ignoreDuringBuilds` from `next.config.js`, then fix all build errors
- [ ] **[S3] Clean up console.log statements** — Remove 717 console output calls from production. Introduce a debug library or environment-aware logger

### 🟠 HIGH (1–2 weeks)

- [ ] **[H1] Delete unused components** — Remove 57 version files not imported anywhere. Verify against `page.tsx` imports before deletion
- [ ] **[H2] Add Error Boundaries** — Wrap at minimum each view (doctor/first-visit/follow-up) with an error boundary
- [ ] **[H3] Replace encryption** — Swap `cryptoUtils.tsx` Base64 approach with Web Crypto API `SubtleCrypto`
- [ ] **[H4] Consolidate duplicate survey components** — Merge `surveys/` and `surveysSecondVersion/` into one
- [ ] **[H5] Reduce `any` types** — Start with key hook return types (useDoctorData, usePatientData)
- [ ] **[H6] Configure CSP headers** — Add Content-Security-Policy via `next.config.js` headers or middleware

### 🟡 MEDIUM (2–4 weeks)

- [ ] **[M1] Refactor to Next.js file-based routing** — URL param SPA → file-based routes (`/doctor/[id]`, `/patient/[id]/first`, `/patient/[id]/followup`)
- [ ] **[M2] Unified API layer** — Create a shared API client with error handling, retries, and automatic auth headers
- [ ] **[M3] Consolidate chart libraries** — Pick one primary library (D3/Plotly/Recharts), remove or dynamically import the rest
- [ ] **[M4] Split oversized components** — PhysicianReportsV41 (4,145 LOC) → separate DashboardView, GridView, DetailView
- [ ] **[M5] Remove unused static files** — Delete `/public/flu_json_data/`, `/public/not_used/`
- [ ] **[M6] Harden localStorage usage** — Add try/catch wrappers, session expiration logic, schema migration strategy
- [ ] **[M7] Optimize Docker image** — Properly leverage standalone output in Dockerfile (1.25GB → ~250MB)

### 🟢 LOW (Backlog)

- [ ] **[L1] Upgrade Next.js** — 13.5.6 → 14.x (incremental). 15.x has many breaking changes, plan separately
- [ ] **[L2] Introduce React Query/SWR** — API caching, request deduplication, optimistic updates
- [ ] **[L3] Remove or replace rrweb** — Alpha version is a production risk; wait for GA or remove
- [ ] **[L4] Remove or fully integrate PostHog** — Code exists but is disabled
- [ ] **[L5] Add accessibility testing** — Automated tests with axe-core
- [ ] **[L6] Clean up page.tsx commented imports** — Remove 15 lines of commented-out import statements
- [ ] **[L7] Implement code splitting** — Dynamic imports per view to optimize initial load
- [ ] **[L8] Review Express 5.x stability** — Express 5 released in 2025, limited production track record

---

## 9. Recommended Execution Order

```
Phase 1 (this week): S1 → S2 → S3
  └─ Eliminate security vulnerabilities, ensure build safety

Phase 2 (next week): H1 → H4 → H5
  └─ Codebase cleanup (delete 57 files, merge duplicates, improve types)

Phase 3 (week 3): H2 → H6 → M2
  └─ Improve stability (error boundaries, CSP, API layer)

Phase 4 (week 4+): M1 → M3 → M4
  └─ Structural refactoring (routing, charts, component decomposition)
```

---

## 10. Conclusion

The current Webapp is at a **prototype/research-tool level** and requires immediate improvements in security (S1–S2) and code management (H1) before production deployment. Key concerns:

1. ~~**API key exposure**~~ — **Fixed (2026-04-13)**: server-side proxy route now handles API key injection
2. **57 unused components** are the primary driver of maintenance cost
3. **Build error suppression** nullifies the protection of the type system

On the positive side, the Docker deployment setup, Zustand state management, Radix UI usage, and testing foundation (Jest + Playwright) are well-established — providing a solid base for improvement work.
