# 2026-08-13 — Branch synchronisation and production readiness status

**Scope**: git-level work only — no application code was changed. Records (a) the
state of the two repositories after synchronising with their remotes, (b) what
landed on `production/official` today, and (c) what remains open.

**Markers**: ✅ done · 🔄 in progress · ⬜ not started · ⚠️ caution · ⛔ blocked.

---

## 1. What was done locally

| # | Operation | Target | Result |
|---|---|---|---|
| 1 | `git fetch` + compare local against remote | `staging/caire`, both repos | AI repo level; dashboard one commit behind |
| 2 | `git pull --ff-only` | dashboard `staging/caire` | ✅ `7adb508` → `db8d81a`, fast-forward |
| 3 | `git fetch --all --prune` | both repos | ✅ `origin/production/official` appeared as a new remote branch |
| 4 | `git branch --track production/official` | both repos | ✅ local tracking branches created; checkout left on `staging/caire` |

### Branch state after synchronisation

**Prostate_cancer_consultation_dashboard**

| Branch | Commit | Versus remote |
|---|---|---|
| `staging/caire` (checked out) | `db8d81a` | level (0/0) |
| `production/official` | `f931bc1` | level (0/0) |

**AI_physician_patient_communication**

| Branch | Commit | Versus remote |
|---|---|---|
| `staging/caire` (checked out) | `cd80e0c` | level (0/0) |
| `production/official` | `9c94903` | level (0/0) |

⚠️ **In both repositories `production` is ahead of `staging`** — nine commits in
the dashboard, one in the AI repo, with zero commits unique to `staging`. The
usual direction (validate on staging, then promote to production) does not hold
right now. See §4.

---

## 2. What landed on `production/official`

### Dashboard — 9 commits, 11:08–15:17, 25 files, +2,479 / −28

| Time | Commit | Subject |
|---|---|---|
| 11:08 | `32aebf9` | docs(security): assess production readiness across ten axes |
| 11:30 | `556b2d0` | feat(ops): encrypted database backup with a rehearsed restore |
| 14:22 | `335b45e` | docs(ops): runbook and incident response procedure |
| 14:29 | `b31e8f2` | fix(security): close the schema leak, add response headers, fail closed |
| 14:35 | `ba6c8f5` | fix(auth): hash passwords with scrypt and throttle failed logins |
| 14:47 | `8676d38` | feat(audit): record PHI access, forward the caller's real address |
| 14:50 | `1fd1114` | feat(security): apply rate limiting to the expensive routes |
| 15:01 | `76efbe6` | feat(audit): stop auditing a poll, add a retention rule |
| 15:17 | `f931bc1` | docs(security): mark axis J progress in the readiness assessment |

New files of note:

- `app/Backend/auth/login_guard.py`, `phi_audit.py`, `rate_limit.py`
- `app/Backend/migrations/versions/035_add_phi_access_log.py`
- `app/Backend/scripts/backup-db.sh`, `restore-check-db.sh`, `prune-retention.py`
- `deploy/logrotate/compass`
- `docs/security/PRODUCTION_READINESS.md` (+ `.pdf`),
  `docs/operations/RUNBOOK.md`, `docs/operations/INCIDENT_RESPONSE.md`

### AI pipeline repo — 1 commit

`9c94903` — `config_remote.yaml`: `model_uri` changed from `10.226.8.205:18080`
to `127.0.0.1:18080`.

⚠️ This assumes the gateway runs on the same host. It is the only difference from
`staging/caire` in that repository, and it is the first thing to check when a
remote-gateway configuration stops working.

---

## 3. What is now done — readiness across ten axes

Per `docs/security/PRODUCTION_READINESS.md` (assessment dated 2026-08-13).

| Axis | Verdict | Progress |
|---|---|---|
| A. Release & deployment | Blocker | ✅ Largely resolved — three systemd units with automatic restart. **A real reboot has not been tested.** |
| B. CI & quality gates | Blocker | ⬜ Not started — nightly E2E has failed every run since 2026-05-28 (a real REDCap test defect) |
| C. Observability | Blocker | ⬜ Not started — no error tracking, metrics, or alerting |
| D. Reliability | Gap | ✅ Resolved via A |
| E. Data & backup | Blocker | 🔄 Partly — nightly encrypted dumps with a rehearsed restore. **Same disk**; three items open |
| F. Frontend readiness | Gap | ⬜ Not started — no error boundary; patients see the raw crash page |
| G. Testing | Gap | ⛔ Blocked on B |
| H. Docs & runbooks | Gap | ✅ Resolved — runbook, incident response, rollback written |
| I. Security | Blocker | ✅ 9 of 12 findings closed |
| J. Access logging & retention | Blocker | ✅ Mostly resolved |

### The nine security findings closed (axis I)

`/docs` and `/openapi.json` no longer exposed · security headers (nosniff,
X-Frame-Options, Referrer-Policy, CSP) · production refuses to start without
`API_KEY` / `JWT_SECRET` and rejects a `*` CORS origin · the `"change-me"` JWT
default removed · password hashing moved from single-round SHA-256 to **scrypt**,
migrated with no downtime and no password reset · login protection (8 failures
per 15 minutes → 429, counted per username and per IP) · the rate limiter
actually applied to the AI, upload, and survey-submit routes (fails open if Redis
is down) · the proxy now forwards `X-Forwarded-For` · `phi_access_log` written by
middleware.

This closes three items carried since the 2026-07-30 log: rate limiting,
password hashing, and the admin audit trail.

---

## 4. What remains

### ⛔ Needs a decision now

- **Branch direction.** `production/official` is nine commits ahead of
  `staging/caire`. Either bring staging up to production, or move the work back
  through staging so the validate-then-promote path exists again. As it stands
  there is no environment where a change is tried before it reaches the box
  serving patients.
- **Two stashes in the dashboard repo**, neither applied nor discarded:
  `stash@{0}` "KR banner edit (pre-staging-pull)" and `stash@{1}` a WIP
  server-side API-key proxy on `main`.

### ⛔ Blockers not started

- **Axis B (CI).** Fix `test_redcap_import_sample` and get the nightly run green;
  remove `ignoreBuildErrors` / `ignoreDuringBuilds` so type errors can fail a
  build.
- **Axis C (observability).** Nothing exists. Start with alerting on the two
  systemd units and on the nightly CI result. The runbook currently says the
  quiet part out loud: *"If you are reading this, you are the monitoring."*

### 🔴 Axis I — three items, each blocked outside the codebase

- **No TLS.** Webapp `3001` and backend `18001` are plain HTTP. Waiting on an
  institutional CA certificate; the host is a private address, so Let's Encrypt
  is not an option. Needs nginx termination on 443.
- **Shared API key grants superuser.** One key, and any caller presenting it gets
  `is_superuser=True` — which is why every audit row reads `actor=system`.
  `AUTH_MODE=multi_key` is already implemented; what is missing is a decision on
  key distribution and revocation.
- **The admin password is unchanged.** scrypt plus the lockout make it far harder
  to exploit, but the string itself was never rotated. It is a shared credential,
  so rotating it without telling its users breaks their access.
- Related: the backend still binds `0.0.0.0` (`scripts/run-backend.sh:60`).
  Moving it to loopback has to land together with the nginx work, or the webapp
  container loses its API.

### 🔴 Axis J — two items

- **Log rotation not installed.** `deploy/logrotate/compass` is written and
  syntax-checked but not in place; installing it needs sudo on a shared host, so
  it belongs to whoever administers the machine.
- **`session_recording` is not classified as PHI.** It replays the patient's
  screen pixel for pixel. A 90-day expiry now bounds it, but it is stored
  unencrypted in an ordinary column and is not covered by the PHI handling
  policy. A classification decision is owed.
- `prune-retention.py` defaults to a dry run and is **not scheduled** — adding a
  cron entry changes the server.

### 🔴 Axis E

- Backups sit on the **same disk** as the database; they need to go off-host.
- Never exercised at production volume — no load test has been run.
- ⚠️ **`deid_mapping.csv` line 2 is corrupt and unrepaired** — the
  re-identification key is broken.
- The re-identification key is still plaintext; only its permissions were
  tightened to `600`.

### 🟡 Serving capacity — recorded here because it is not tracked anywhere else

Checked directly against `production/official` today:

- **No load balancer.** No `upstream {}` block, no replicas, no `deploy:` scaling.
  The only nginx config lives in the unused legacy compose file and is a path
  router, not a balancer.
- **Single instance of everything** — one backend (`uvicorn --workers 3`), one
  Postgres, one Redis, one NLP container, one watcher.
- **Horizontal scaling is structurally blocked**, not merely unconfigured: the
  upload queue is a local drop folder that the API globs by mtime and gates to
  one file at a time, and the pipeline watcher deduplicates in process. A second
  instance of either would double-process or diverge.
- **No automated deploy** — three test-only workflows, zero git tags, no
  release artefact to roll back to.
- **No capacity evidence.** Two load-test harnesses exist; neither has a recorded
  run. The readiness document is explicit: query plans, pool sizing, and page
  render times are all unvalidated at realistic scale.
- ⚠️ The connection pool is **per process**: 3 workers × (10 + 20 overflow) = up
  to 90 connections against a stock Postgres limit of 100. No pgbouncer.

None of this is a defect at the current research scale — the architecture
documents deliberately decline horizontal scaling below roughly 50 patients. It
is recorded so the limit is a known one rather than a surprise.

### 🟡 Frontend and housekeeping

- Add `error.tsx` / `global-error.tsx` / `not-found.tsx` (about a day).
- Prune the 62 stale component versions among 99 component files.
- Rename the file that still carries a personal name.
- Accessibility audit.

### 🟡 Compliance, running throughout

- Confirm the IRB-approved scope covers PHI on a shared host with more than ten
  accounts, where root and every sudo user can reach the data.
- Confirm the BAA with institutional IT.
- Document the §164.308(a)(1) risk analysis.
- Retire or rewrite `SECURITY_AUDIT.md` — it assumes nginx plus a Dockerised
  backend, which is not the current deployment.
- ⚠️ `README.md` still carries a "NOT FOR PRODUCTION — RESEARCH & TESTING USE
  ONLY" banner while `PRODUCTION_READINESS.md` describes the same host as
  promoted to production. One of the two has to change.

---

## 5. Next actions, in priority order

1. ⛔ Decide the staging/production branch direction (§4).
2. ⛔ Resolve the two stashes.
3. 🔴 Send the TLS certificate request to institutional IT — the longest lead
   time in the plan, so it should go out before anything that depends on it.
4. 🔴 Rotate the admin password, together with a way to tell its users.
5. 🔴 Ask the machine's administrator to install log rotation (needs sudo).
6. 🔴 Repair the nightly E2E run (axis B), which unblocks axis G.
7. 🟡 Repair `deid_mapping.csv`.
8. 🟡 Decide the PHI classification of `session_recording`.

---

## References

- `docs/security/PRODUCTION_READINESS.md` — ten-axis assessment and the
  five-phase remediation plan (added today)
- `docs/operations/RUNBOOK.md`, `docs/operations/INCIDENT_RESPONSE.md`
  (added today)
- `daily_control_logs/2026-07-30_prod_deploy_db_admin_KR.md` — where the items
  closed today were first recorded
