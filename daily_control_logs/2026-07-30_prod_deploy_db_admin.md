# 2026-07-30 (Thu) — Production deployment: DB and admin work (security and scalability)

## Today's request

> Write a daily log covering everything that has to be done for the DB and admin side
> of a production-level deployment — in particular security and scalability.

**Scope of this document**: a single-page starting plan (a snapshot) that gathers the
**DB + admin** work for production, prioritised by **security and scalability**. No code
changes.

**Out of scope (delegated)**: backend readability and router splitting and other P0
refactors are already covered by
`dev_docs/backend_dev_docs/BACKEND_PRIORITY_BACKLOG.md` — referenced here, not restated.

**Markers**: ✅ done / 🔄 in progress / ⬜ not started / ⚠️ caution / ⛔ blocked.
Priorities: P0 (required before deployment) → P1 (required during early operation) →
P2 (stabilisation).

---

## 1. Already in place (production-ready) — a status check to avoid duplicate work

**Admin / security** ✅

- Admin JWT login re-reads the user from the DB on every request
  (`auth/admin_session.py:48-111`), with a double gate at the middleware and backend
- Cookies are httpOnly with SameSite=strict; `secure` follows the upstream proxy protocol
- Server-side API key proxy — zero key exposure in the browser (`NEXT_PUBLIC_API_KEY`
  removed)
- Timing-safe key comparison (`hmac.compare_digest`, `auth/backends/api_key.py:28`)
- Upload defences: path-traversal validation, a 25 MB streaming cap, and a
  de-identified-filename allowlist (`routes_admin_upload.py`)
- Docker ports bound to loopback, the Redis host port removed, DB credentials moved to
  env vars, `/docs` disabled in production, and an upload audit log (`AdminUploadLog`)

**DB / infrastructure** ✅

- The async connection pool is tunable through env vars (`db.py:56-67`,
  `core/settings.py:82-90`), with `pool_pre_ping=True`
- Hot-path indexes exist (`sentence_prediction`, `transcript_analysis_log`,
  `llm_domain_scoring_and_summary`, and others, per `database_schema.sql`)
- Multi-worker deployment (native `uvicorn --workers 3` / Docker `gunicorn` with
  `WEB_CONCURRENCY`)
- All 34 migrations are reversible (excluding the baseline)

---

## 2. Security — required for production

### ⛔ P0-SEC-1 — remove the `JWT_SECRET` default `"change-me"`

- **Current**: `auth/backends/jwt_auth.py:18` —
  `os.getenv("JWT_SECRET", os.getenv("SECRET_KEY","change-me"))`. Unset, it signs with a
  weak default, so tokens can be forged. If the backend and webapp hold **different**
  values, admin JWT fails silently (the cause of an earlier login loop).
- **To do**: generate a strong random secret and inject the **same value** into the
  backend `.env` and the webapp `.env`. Document a generation and rotation procedure for
  operators. (The actual value never goes into this document or a commit.)
- **Reference**: `docs/security/ADMIN_LOGIN_GUIDE.md`.

### ⛔ P0-SEC-2 — no per-patient access control (the biggest hole)

- **Current**: `check_patient_access()` returns immediately for a superuser
  (`auth/access_control.py:43`). Because a shared-API-key caller is **always** a
  superuser, that guard blocks nothing. The survey read endpoints
  (`routes_surveys.py:670/701/739/772`) have no access check at all, so **knowing an id,
  speaker, and file is enough to read any patient's data**.
- **To do**: (a) introduce real id scoping on the survey and patient reads (token-to-patient
  binding, or signed access links); (b) revisit the unconditional superuser pass in
  `check_patient_access` for production mode. Start with the minimum effective control
  that fits a research pilot.
- **Reference**: `dev_docs/DB_SCHEMA_CLEANUP_TODO.md` (F: auth-table limbo),
  `SECURITY_AUDIT.md` (RBAC #16).

### 🔴 P1-PHI-3 — PHI is not encrypted at rest (directly HIPAA-relevant)

- **Current**: `sentence_text` and `context` are stored in plaintext, and uploaded xlsx
  files are plaintext both on disk and in `bytea` (audit #19/#20,
  `BACKEND_PRIORITY_BACKLOG.md` P1).
- **To do**: design pgcrypto or application-level encryption with key management
  (KMS/env). Even with a de-identification pipeline, residual identifiers are possible →
  encryption at rest as defence in depth.
- **Reference**: `docs/security/PHI_COMPLIANCE.md`.

### 🔴 P1-SEC-4 — the rate limiter is not applied

- **Current**: `fastapi-limiter` is initialised at `app_lifespan.py:58-61` but **no route
  declares the dependency** → admin login brute force and the expensive GPT-4o paths are
  unprotected.
- **To do**: per-key/IP limits on admin login and the costly endpoints (the Redis backend
  already exists).

### 🔴 P1-SEC-5 — admin change auditing is partial

- **Current**: only uploads are recorded (`AdminUploadLog`). User and API-key creation and
  deletion, and pipeline/integrity access, are unrecorded.
- **To do**: a common audit table for admin changes (who, when, what). Audit #17.

### 🔴 P1-SEC-6 — password hashing is salted SHA-256 ⬜ not started (implementation plan agreed 2026-07-30, awaiting start)

- **Current**: `auth/admin_routes.py:48-64` — the code itself says it is a stopgap.
- **To do**: replace with bcrypt/argon2 plus a rehash migration for existing accounts
  (lazy rehash on login).
- **Reference**: implementation plan `dev_docs/CREDENTIAL_SECURITY_PLAN.md` (part A).
  ⚠️ **Not started today, by instruction.**

### 🔴 P1-SEC-7 — no HTTPS/TLS or security headers ⬜ not started (approach agreed 2026-07-30 — nginx, awaiting start)

- **Current**: HTTP today. The cookie `secure` flag depends on the upstream proxy's
  `x-forwarded-proto: https`. The nginx security headers and CSP are commented out
  (audit H-1/H-3).
- **To do**: TLS termination (**settled: an nginx reverse proxy**) plus HSTS, nosniff,
  X-Frame-Options, and CSP.
- **Reference**: implementation plan `dev_docs/CREDENTIAL_SECURITY_PLAN.md` (part B),
  `docs/setup/NETWORK_EXPOSURE.md`, `SECURITY_AUDIT.md` (phase 2: 6, 7).
  ⚠️ **Not started today, by instruction.**

### 🟡 P2-SEC-8 — other hardening

- ⬜ Redis authentication (`--requirepass`) — mitigated today only by not exposing the host
- ⬜ CSRF defence in depth (SameSite=strict only today) — tokens or re-validation on
  mutating routes
- ⬜ DB SSL (`sslmode=require`, #21) and PII masking in logs (`patient_id` logged in
  plaintext, #22)

---

## 3. DB and scalability — required for production

### ⛔ P0-DR-1 — no automatic backup

- **Current**: the only backup is a manual `pg_dump` to a scratch directory before a
  destructive reset (`docs/setup/DEPLOYMENT_3PHASE.md:187`). No cron, no off-site copy,
  no restore rehearsal.
- **To do**: scheduled `pg_dump` or pgBackRest, off-site retention, and a
  **documented restore rehearsal**. The minimum bar before deployment.

### ⛔ P0-DR-2 — no PITR, WAL archiving, or replication

- **Current**: a single local postgres@16 (`:5433`) is a single point of failure, with a
  data-loss window since the last dump.
- **To do**: WAL archiving plus a standby, or **move to managed Postgres** (tied to the
  infrastructure decision in §4).

### 🔴 P1-DR-3 — the DB binds to 127.0.0.1

- **Current**: rules out a separate DB tier or a failover host.
- **To do**: when moving to a managed or dedicated DB host, reconfigure alongside access
  control and SSL.

### 🔴 P1-SCALE-4 — move large BLOBs to object storage (hard deadline)

- **Current**: `transcript_analysis_log.xlsx_data` (`models.py:205`) and
  `session_recording.recording_data` (`models.py:281`) are `bytea`, inflating backups and
  replicas linearly. Cleanup item I, with a **"before the patient count reaches 50"
  deadline**, not started.
- **To do**: move to MinIO/S3 (or Azure Blob) and keep only a reference key in the DB.
  Adjust the download-path fallback.
- **Reference**: `dev_docs/DB_SCHEMA_CLEANUP_TODO.md` (I).

### 🔴 P1-SCALE-5 — no retention, partitioning, or archiving policy

- **Current**: fast-growing append-only tables (`session_recording`, the three behaviour
  tables, `nlp_all_predictions` / `sentence_prediction`) grow without bound, degrading
  backups and queries linearly.
- **To do**: a TTL/retention policy plus time partitioning or a cold archive.

### 🔴 P1-SCALE-6 — missing indexes on the behaviour-tracking tables

- **Current**: the three pattern-A tables (`patient_report_page_behavior`,
  `patient_followup_survey_page_behavior`, `doctor_behavior`, `models.py:298-356`) have no
  indexes on `session_id` / `file` / `event_type` / `client_timestamp` → the admin
  analytics queries full-scan.
- **To do**: add a reversible migration with indexes matching the query patterns.

### 🔴 P1-SCALE-7 — uploads write to local disk (a horizontal-scaling blocker)

- **Current**: the admin upload streams to the local `pipeline_drop_dir`
  (`routes_admin_upload.py:83-94`) and the pipeline watch polls it. With a multi-replica
  backend, the file lands on a disk the watcher cannot see.
- **To do**: shared storage (object storage/NFS) or a message queue to decouple upload
  from pipeline.

### 🟡 P2-SCALE-8 — caching and a connection pooler

- ⬜ No Redis read cache — every read hits Postgres directly (doctor, patient, survey).
  Cache the hot reads.
- ⬜ No PgBouncer — introduce a pooler once workers × pool approaches Postgres's
  `max_connections=100`.

---

## 4. Risks and contradictions to settle before starting

- ⚠️ **Documentation drift**: migrations are actually at **034**, but `README.md` says 015,
  `CLAUDE.md` says 029, and `init-db-native.sh` says 030. `db.py` is async-only while the
  docs say "async + sync". **Correct these before handing operations over** — they cause
  operator error during recovery.
- ⚠️ **PHI-off-server policy contradiction**: the server-side de-identification path in
  `/admin/upload` conflicts with the "no PHI on the server" policy
  (`docs/setup/DEPLOYMENT_3PHASE.md:121`). Decide whether uploads must accept only
  already-de-identified files.
- ⚠️ **`SECURITY_AUDIT.md` is partly stale**: it points at archived modules as current, and
  its "`/surveys/submit` is unauthenticated" finding is a false positive (it is protected
  at `routes_surveys.py:77`). **Re-audit before acting on it.**
- ⚠️ **The README auth section is stale**: `PatientAccess` was dropped in migration 029,
  and `auth_user` / `auth_api_key` are in active use for admin login. README lines
  153–155 need updating.
- ⚠️ **The infrastructure target is undecided**: managed (e.g. Azure Database for
  PostgreSQL plus Blob/S3) versus on-premises (pgBackRest plus a standby). **The DR and
  scalability approach forks here** → decide this first.

---

## 5. Open items and suggested order of work

- ⬜ **(0) Refresh the audit** — bring `SECURITY_AUDIT.md` up to date with the current code
  first, removing false positives and stale claims.
- ⬜ **(1) Decide the infrastructure target** — managed versus on-premises (§4). The DR,
  encryption, and network designs follow from it.
- ⬜ **(2) P0 in parallel** — security: JWT secret (SEC-1) and patient ACL (SEC-2);
  DR: automatic backup (DR-1) and PITR/replication or managed (DR-2).
- ⬜ **(3) P1** — PHI encryption at rest, rate limiting, audit logging, password hashing,
  TLS and headers; BLOBs to object storage, retention and partitioning, behaviour
  indexes, upload decoupling.
- ⬜ **(4) P2** — Redis authentication and caching, CSRF, DB SSL, log masking, PgBouncer.

### Deferred (plan agreed, not started today)

- ⬜ **[deferred] admin credential security** — (A) **Argon2** with lazy rehash and
  (B) **nginx TLS** termination. The implementation plan was agreed and approved on
  2026-07-30. ⚠️ **Not started today, by instruction.** Detail:
  `dev_docs/CREDENTIAL_SECURITY_PLAN.md`. When started, use a separate branch
  (e.g. `feat/admin-credential-security`).

**References (linked, not restated)**:
`dev_docs/backend_dev_docs/BACKEND_PRIORITY_BACKLOG.md` ·
`dev_docs/DB_SCHEMA_CLEANUP_TODO.md` (H, I) ·
`docs/security/SECURITY_AUDIT.md` (phases 2–4) ·
`dev_docs/ADMIN_SIMPLIFICATION_PLAN.md` ·
`docs/setup/DEPLOYMENT_3PHASE.md` · `docs/security/PHI_COMPLIANCE.md`.

**Note**: this document contains no secrets, passwords, or real names.
