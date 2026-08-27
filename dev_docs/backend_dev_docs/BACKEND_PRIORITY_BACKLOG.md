# Backend Priority Backlog — single entry point

> Consolidates the scattered backend backlog (this session's findings + the
> security audit + `dev_docs/archive/BACKEND_IMPROVEMENTS_TODO_KR.md`) into one
> ranked list. Each item links its source. **Re-verify against current code
> before acting** — some sources (esp. the security audit) reference modules that
> have since been archived.

Legend — source: 🆕 found this session · 📋 BACKEND_IMPROVEMENTS_TODO_KR · 🔒 docs/security/SECURITY_AUDIT.md

---

## ⭐ P0 — TOP PRIORITY: make the Backend code readable / maintainable  🆕

The single highest-priority engineering task. Current state makes everything else
harder to do safely. Evidence (measured 2026-06-06):

| Signal | Measurement | Problem |
|---|---|---|
| Oversized route files | `routes_surveys.py` **1851**, `routes_doctor.py` **1561**, `routes_patient.py` **1358** lines | one file mixes 14–18 endpoints + helpers + constants; hard to read/review/test |
| `print()` in request paths | `routes_surveys.py` **251**, `routes_patient.py` **40**, `routes_doctor.py` **35** | violates backend rule #1 ("No raw print() in request paths — use logging"); noisy, unstructured |
| Mixed concerns | mapping tables, transforms, Pydantic models, routes all inline in one file | no `services/` / `utils/` separation (repo standard) |

**Subtasks (incremental, one file at a time — keep behavior identical):**
1. **Replace `print()` with `structlog`/`logging`** in the route files (start with
   `routes_surveys.py`'s 251). Behavior-preserving, immediately improves readability.
2. **Split the 3 oversized routers** into focused modules — move inline constants,
   transforms and Pydantic models into `services/` / `schemas/` / `utils/`, leaving
   each router file = routes only. Concrete extraction targets:
   - `routes_surveys.py` → `FRONTEND_TO_REDCAP_MAPPING` (:144), `transform_value`
     (:255), `REDCapImportData` (:1420), the `import_to_redcap*` helpers.
   - `routes_patient.py` → `_FV_QUESTION_TO_REDCAP_FIELD` / `_FV_*_CODES` /
     `_fv_answer_to_redcap` (:1135–1244).
3. **Docstrings + type hints** on public functions (Google-style, per repository convention).
4. **Consistent error handling** — specific exceptions + structured logging, no bare `except`.
5. After each step: `pytest -m "not e2e"` + `ruff check .` + native boot must stay green.

> Do this FIRST and incrementally; it de-risks every item below.

---

## 🔴 P1 — HIGH (data integrity / pipeline reliability / HIPAA)

1. **REDCap factors multi-select — deploy-blocked** 🆕
   Code committed (`e0ae563`) but the REDCap target fields are still `radio`, so it
   cannot deploy (radio holds one value). Convert `le_2_rp_v2`/`ed_3_rp_v2`/
   `ui_3_rp_v2`/`il_3_rp_v2` to **checkbox** (or add dedicated checkbox fields), then
   re-verify. Until then only the first selected factor reaches REDCap.
   → `docs/features/REDCap_Factors_MultiSelect_Issue.md`

2. **Azure content_filter (jailbreak) aborts Phase 2 files — unmitigated** 🆕
   Deterministic (`seed=0`) false-positive 401 on IUS extraction aborts the whole
   file. The retry/skip mitigation was reverted → no defense in place. Add
   retry/graceful-skip (and/or the extraction-prompt safety preamble).
   → `dev_docs/backend_dev_docs/` ... (RCA lives in the AI repo: `AZURE_JAILBREAK_CONTENT_FILTER_RCA.md`)

3. **PHI encryption at rest (HIPAA) — unresolved** 📋🔒 (#19, #20)

4. **Per-patient access-control (ACL) — audit coverage** 🔒 (#3)
   **Verified 2026-06-06:** the survey router *is* authenticated
   (`routes_surveys.py:77` → `dependencies=[Depends(get_current_user)]`), so the
   audit's "/surveys/submit has no auth" finding is **stale/false**. Auth is
   per-router via `get_current_user` (no global middleware). Real remaining work:
   confirm `check_patient_access` is applied to **every** patient-data route
   (today: `routes_patient.py` ×9, `routes_doctor.py` ×2) — sweep for any
   patient/doctor route that reads PHI without it; don't assume full coverage.

---

## 🟡 P2 — MEDIUM (security hardening / operations)

5. **Auth hardening** 📋🔒 (#15, #17, #18) — full JWT, rate limiting, **audit log**, XSS sanitization (timing-attack #16 already fixed).
6. **DB SSL + log PII masking** 📋 (#21, #22) — unresolved.
7. **State-management APIs** 📋 (§2) — delete-analysis API, `/history` score summary, all-patients list API, ground-truth linkage.
8. **TurboScribe CSV → xlsx auto-conversion** 📋 (§1.1) — main file-management gap.

---

## 🟢 P3 — LOW (cleanup / maintenance)

9. **Backend dead-code cleanup** 🆕 — remove tracked `archive/` files, fix the
   `.env.example` `.env.native` instructions, decide on retiring Docker-legacy
   files (`init_db.py`/`wait_for_db.py`/`Dockerfile`).
   → `dev_docs/backend_dev_docs/BACKEND_DEAD_CODE_CLEANUP.md`
10. **File-upload validation hardening** 📋 (#23).

---

## ⚠️ Cross-cutting note — refresh the security audit first
`docs/security/SECURITY_AUDIT.md` is partly **stale**. Verified examples:
- cites already-archived `routes_transcript.py` / `routes_nlp.py` as "active",
- claims "main.py is entirely commented out" (it is not),
- lists "/surveys/submit has no auth" — but that router is auth-protected
  (`routes_surveys.py:77`).

So **re-audit against the current codebase and refresh the severity table** as a
prerequisite for P1#4 / P2#5 — several listed findings may already be resolved
(like the survey-auth one), while new ones may be unlisted.
