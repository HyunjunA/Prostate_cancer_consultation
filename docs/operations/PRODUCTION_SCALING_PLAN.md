# Production Scaling Plan — Reaching ~100 Concurrent Users

**Status**: PLAN ONLY — nothing in this document has been executed.
**Target scale**: tens to ~100 concurrent users.
**Written**: 2026-08-14 · **Host measured**: `compass` (10.177.43.229)

---

## What this document is

`docs/security/PRODUCTION_READINESS.md` answers *"what is missing before this can be called production?"* across ten axes (A–J). It is an assessment. This document is the layer above it: **the order in which to close those gaps, for a specific target — a study where up to ~100 people use the dashboard at the same time.**

It does not replace the readiness assessment. Every phase below names the axis it advances, so the two documents stay in step.

### The honest headline

The repository README carries this banner, and it is accurate:

> ⛔ **NOT FOR PRODUCTION — RESEARCH & TESTING USE ONLY**

The branch named `production/official` ships a **single-host research prototype**. There is no load balancer, no TLS, no deployment automation, no metrics, and no database replication. The readiness assessment says the same thing in its own words:

> "What remains is that **there is exactly one of everything** — one server, one pipeline, one classifier."

> "**The single-host architecture.** Every component remains a single point of failure. Supervision makes failures short instead of permanent; it does not make them impossible."

Nothing below changes that architecture. The goal is narrower and achievable: **make one host serve ~100 concurrent users safely, over TLS, with enough visibility to notice when it stops.**

### Scope

**In scope**: TLS and edge, identity, capacity tuning on one host, pipeline throughput, observability, durability, CI/CD.

**Explicit non-goals**: multiple nodes, Kubernetes, autoscaling, database replication or failover, geographic redundancy. Those are a different project with a different budget. If the study grows past a few hundred users or acquires an availability commitment, revisit this decision — do not stretch this plan to cover it.

---

## Where the deployment actually is today

The existing operations documents were written for a different machine. `RUNBOOK.md` opens with "COMPASS on caire-server" and `PRODUCTION_READINESS.md` names `caire-server` (10.226.8.205) as the target host. **The system now runs on `compass`, and several details differ.** Anyone following the older documents on this host will hit each of these.

| | Documented (`caire-server`) | Actual (`compass`) |
|---|---|---|
| Container runtime | Docker | **podman** 5.8.2 + `podman-docker` shim |
| Webapp | Docker container, port 3001 | **Node standalone process**, port **18300**, systemd |
| Backend | systemd `compass-backend`, 18001 | same name, same port |
| Watcher unit name | `compass-watcher` | **`compass-pipeline-watch`** |
| NLP classifier | Docker container | podman container, unit `compass-nlp-classifier` |
| Supervised units | 3 | **5** (webapp and classifier also under systemd) |
| Python | 3.9 | **3.11** for the backend |
| SELinux | not discussed | **Enforcing** — non-standard ports need `semanage port` labels |
| Inbound network | LAN-reachable | **SSH (22) only**; AWS security group `aoplcbhr03-sg` |

Host resources: **8 vCPU, 61 GB RAM**.

Current listeners:

| Service | Bind | Port |
|---|---|---|
| Webapp (Next.js standalone) | `127.0.0.1` | 18300 |
| Backend (uvicorn, 3 workers) | **`0.0.0.0`** | 18001 |
| NLP gateway (uvicorn) | **`0.0.0.0`** | 18080 |
| NLP classifier (podman, R) | `127.0.0.1` | 8888 |
| PostgreSQL 16 | `127.0.0.1` | 5439 |
| Redis | `127.0.0.1` | 6380 |

Two of those binds are wrong for a production posture: the backend and the NLP gateway listen on every interface. Today the security group hides that; the moment inbound ports open, it stops being hidden. Phase 1 fixes it.

Host-specific deployment notes live in `DEPLOYMENT_COMPASS_KR.md` at the workspace root.

---

## The load model — what "100 concurrent users" actually means here

The three user personas do not load the system equally, and conflating them leads to solving the wrong problem.

| Persona | What they do | Cost per action | Concurrency risk |
|---|---|---|---|
| **Patient (survey)** | Submits DCS / SDM / Risk / Satisfaction forms, optional REDCap sync | One or a few DB writes; synchronous REDCap calls (30 s lookup + 5 s each for project/event/import) | **This is the real ~100-concurrent path** |
| **Patient (report)** | Reads AI-generated summaries | DB reads, page render | Moderate; grows with table size |
| **Doctor** | Reviews rewrites and score trajectories | DB reads + behavior-tracking writes | Low count, heavier pages |
| **Admin** | Uploads transcripts | Triggers a 2–3 min pipeline run | **Never concurrent — one person, one file at a time** |

One thing to be explicit about: the architecture documents deliberately decline horizontal scaling **below roughly 50 patients**. A ~100-user target sits just past that line. That does not make the target wrong — it means the choice to stay on one host is now a decision being made with open eyes rather than an assumption inherited from a smaller design.

The consequence matters: **the AI pipeline does not need to serve 100 concurrent users.** Transcript upload is an administrative action. What must hold up under 100 concurrent users is survey submission and report rendering — both ordinary web request paths. Do not spend the budget building a distributed pipeline for a load that will never arrive there.

---

## Phase 1 — Edge and transport

**Advances axis I (Security).** Prerequisite for everything else — do not open the service to more people before this lands.

Today the deployment is plain HTTP. The code says so explicitly: `app/Backend/main.py:184` deliberately withholds HSTS because "the deployment is plain HTTP today", and the admin session cookie's `secure` flag in `app/Webapp/src/app/api/admin-auth/login/route.ts` is conditional on observed HTTPS — so it currently evaluates false. **Session tokens for a system holding patient data are travelling unencrypted.**

Work:

1. **Introduce nginx as a TLS terminator.** A config already exists at `app/Webapp/nginx_setup/default.conf`, but it is legacy Docker-mode and its useful parts — rate limiting, security headers, proxy timeouts, `server_tokens off` — sit in commented-out blocks. Treat it as a starting reference, not a drop-in.
2. **Move every service to loopback.** Backend (18001) and NLP gateway (18080) currently bind `0.0.0.0`. After nginx fronts them, only nginx should be reachable.
3. **Certificate procurement is the real constraint, and it needs a decision before any config is written.** This host accepts inbound connections on SSH (22) only. That makes **Let's Encrypt HTTP-01 impossible** — the challenge requires inbound 80. Two viable paths:
   - a certificate issued by the institution's internal CA (likely the right answer on a hospital network), or
   - ACME **DNS-01**, which needs API access to the DNS zone.

   Outbound 443 works, so ACME clients can reach the CA; the problem is purely the challenge direction. **Raise this with the network administrators at the same time as the firewall request** — the certificate has a longer lead time than the port.
4. **Open inbound 443** on AWS security group `aoplcbhr03-sg`, scoped to the institutional network range rather than `0.0.0.0/0`.
5. **Set `secure` and HSTS** once TLS terminates, and re-test the admin login end to end.

**Risk.** The readiness assessment flags this as the single most fragile step: *"The nginx cutover is the most fragile step in this document."* Do it during a window with nobody using the system, keep the current direct-port path intact until the proxied path is verified, and write the rollback (revert binds, stop nginx) before starting.

**Until this phase completes, SSH tunnelling remains the only correct way to reach the dashboard:**

```
ssh -L 18300:127.0.0.1:18300 <user>@10.177.43.229
```

---

## Phase 2 — Identity and secrets

**Advances axes I and J.**

1. **The shared API key grants superuser.** One `X-API-Key`, injected server-side by the Next.js proxy, maps to `is_superuser=True`. This is why the readiness assessment observes that *every* audit row reads `actor=system`. With 100 users, an audit log that cannot distinguish them is not an audit log — HIPAA §164.312(b) expects per-user attribution.

   **The code for this already exists**: `AUTH_MODE=multi_key` is implemented. What is missing is not engineering but a decision — **how keys are distributed and how they are revoked**. Settle that first; the switch itself is small.
2. **Rotate the weak admin password.** The readiness assessment records `admin1234567` verbatim. scrypt hashing and login throttling (8 failures / 15 min, `app/Backend/auth/login_guard.py`) make it much harder to exploit, but the string itself has never been rotated. Note it is a **shared** credential: rotating it without telling its users locks them out, so the rotation and the notification are one task, not two.
3. **Rotate two exposed credentials.** During the 2026-08-13/14 deployment work, the Azure OpenAI key and a REDCap API token were printed to a terminal. Both should be rotated regardless of who saw them.
4. **The re-identification key is still plaintext.** `data/deid_mapping.csv` is `600` but unencrypted, and line 2 is structurally corrupt (21 fields — an `SID_1` record with an `SID_3` record glued onto it), so the mapping does not currently round-trip for most files. **Repair before encrypting**, or the corruption gets locked in.

---

## Phase 3 — Capacity on one host

**Advances axes D and F.** This is the phase that actually delivers the 100-user target.

### The connection-pool ceiling — fix this first

Measured on the host:

| Setting | Value | Source |
|---|---|---|
| Backend workers | 3 | `app/Backend/scripts/run-backend.sh:58` |
| `database_pool_size` | 10 | `app/Backend/core/settings.py:82` |
| `database_max_overflow` | 20 | `app/Backend/core/settings.py:83` |
| PostgreSQL `max_connections` | **100** | `postgresql.conf` |
| PostgreSQL `shared_buffers` | **128 MB** | `postgresql.conf` (stock default, on a 61 GB machine) |

Each uvicorn worker is a separate process with its own SQLAlchemy engine, so the pool multiplies: **3 × (10 + 20) = 90 possible connections against a limit of 100.** Under a burst that exhausts the overflow, the database refuses connections before the application ever reports being busy — and the failure surfaces as an opaque 500, not as backpressure.

Raising the worker count *without* changing this makes it strictly worse. Adjust three things together: workers, per-worker pool, and `max_connections`. Also raise `shared_buffers` — 128 MB on a 61 GB host is the installer's default, not a decision anyone made.

### Worker sizing

8 vCPU. The workload is I/O-bound (database, Azure OpenAI, REDCap), so the classic `2×cores+1` rule overshoots for memory and undershoots for concurrency. Size from measurement, not from the formula — see below.

### Rate limiting exists — but its identity model does not survive 100 users

`app/Backend/auth/rate_limit.py` wraps `fastapi-limiter` in a fail-open `limit(times, seconds)` dependency, and it *is* applied to the expensive routes:

| Route | Limit | Source |
|---|---|---|
| `POST /api/surveys/submit` | 30 / 60 s | `routes_surveys.py:524` |
| `POST /api/doctor/score-sentence` | 20 / 60 s | `routes_doctor.py:1102` |
| `POST /api/doctor/ai-rewrite` | 20 / 60 s | `routes_doctor.py:1402` |
| `POST /api/admin/upload-transcript` | 10 / 60 s | `routes_admin_upload.py:141` |

Read-only dashboard routes are deliberately unthrottled — a documented decision, and the right one.

**The problem at this scale is the key, not the numbers.** The module's own docstring states it: *"fastapi-limiter keys on client IP."* If 100 study patients submit surveys from inside the institutional network, they very likely share one NAT egress address — so they share **one bucket of 30 requests per minute**. The 31st legitimate patient gets a 429, and the failure looks like a broken survey, not like rate limiting.

Before opening the system to 100 users, decide one of:

- key the survey limiter on the patient's URL token rather than the IP, or
- keep IP keying and raise the survey limit enough to cover the largest plausible NAT group.

The first is correct; the second is cheap. Either is fine — silently keeping 30/60 s per IP is not.

Related: `limit()` fails open by design, so at this scale Redis availability quietly becomes load-bearing for throttling. That is the right trade-off (a Redis outage should not break patient-facing pages), but it belongs in the monitoring set from Phase 5.

### Webapp instances

The Next.js webapp is a single Node process (`node server.js` on an `output: "standalone"` build), no cluster mode. **Horizontal scaling is not blocked by session state** — admin auth is a stateless JWT in an `httpOnly` cookie, verified per request, and login/rate-limit counters live in Redis. So the webapp can be run as 2–4 processes behind an nginx `upstream` block once Phase 1 exists. `app/Backend/models.py` even stores uploaded xlsx as `LargeBinary` in Postgres specifically to avoid shared-filesystem assumptions.

**The backend is a different matter.** Running a second backend instance is **structurally blocked, not merely unconfigured**: `routes_admin_upload.py` writes uploads to a node-local drop directory that the API globs by mtime and gates to one file at a time, and the pipeline watcher deduplicates *in process*. A second instance of either would double-process or diverge. Fixing that means replacing the drop folder with a real queue — see Phase 4 — which is out of scope for the 100-user target.

So the shape to aim for is: **N webapp processes, one backend, one of everything else.** That is enough for this target, and it is honest about where the wall is.

### Measure before tuning

The readiness assessment's own verdict on load testing is *"1 file · Never run at scale"*. Two harnesses exist:

- `app/Backend/load_tests/test_100_doctors.py` — 100 simulated doctors, `CONCURRENCY = 100`, burst mode. But it hits only `/api/track/doctor` — behavior tracking, the cheapest endpoint in the system.
- `scripts/load_test.py` — concurrent-session latency percentiles.

Neither covers **survey submission**, which is the actual 100-concurrent path. Worse, **neither one runs**: `test_100_doctors.py` imports `aiohttp`, which is in no requirements file and is not installed, and half of `scripts/load_test.py`'s endpoints were deleted in migrations 008/020 and now return 404. The working count is zero.

The replacement is specified in [`LOAD_TEST_PLAN.md`](LOAD_TEST_PLAN.md) — isolated test stack, realistic journeys, ramp to find the ceiling, and correctness checks under load. Run it, and let the numbers set the worker/pool values. Guessing here produces a configuration nobody can defend.

### Data growth

The largest table holds **874 rows** today. The readiness assessment notes a running study will produce "tens or hundreds of thousands", and that "nobody has checked whether pages stay fast at that size". Before that happens: check index coverage on the tracking and prediction tables, and confirm the admin listing pages paginate rather than fetching everything.

---

## Phase 4 — Pipeline throughput

**Advances axis D.**

The AI pipeline is a **polled drop folder**, not a queue: the watcher scans `data/incoming` every 5 seconds, processes one file, moves it to `data/archive`. Full pipeline is ~2–3 minutes per transcript (~30 s with `--skip-ai`). There is one watcher process and no worker pool.

Two failure modes, with very different weights:

1. **Throughput.** Serial processing means *n* simultaneous uploads take *n* × 2–3 minutes. Per the load model above, uploads are administrative and never concurrent — **so this is not urgent.** A real job queue (RQ or Celery on the Redis already deployed) is the correct eventual answer, but it buys little at this scale. Set the expectation in the UI instead: uploads are batch work, not interactive.

2. **Silence.** This one *is* urgent. If the watcher dies, uploads land in the folder and are never processed, with no error and no alert — the admin sees "processing…" forever. systemd `Restart=always` covers a crash; it does not cover a hung process that is still running but no longer working. Phase 5 addresses it.

Worth recording: the pipeline serialises domain classification per transcript, so parallelism inside a single file buys nothing. The `docker-compose-ai-nlp-pipeline.yml` comment in the sibling repo says exactly this. Any parallelism must be **across** transcripts.

---

## Phase 5 — Observability

**Advances axis C (assessed `Blocker`, `Not started`).** With one user, "someone notices" is a monitoring strategy. With 100, it is not.

There is currently no Prometheus, Sentry, OpenTelemetry, statsd, or log aggregation. Logging is a single `logging.basicConfig` in `app/Backend/core/logging.py` producing plain text.

1. **Activate structlog.** `structlog==25.5.0` is already pinned in `app/Backend/requirements.txt:48`, and the developer notes state that `core/logging.py` configures it — **but it is imported nowhere in the backend.** The dependency is dead weight today. Wiring it up is a small change that makes every later step easier.
2. **Expose metrics.** Request rate, latency percentiles, error rate, DB pool utilisation — pool utilisation especially, given the ceiling identified in Phase 3.
3. **Alert on the watcher.** A liveness signal the watcher updates each poll, plus an alert when it goes stale. This is the highest-value single alert in the system.
4. **Install log rotation.** `deploy/logrotate/compass` is written and syntax-checked, and its own header states it is **"NOT INSTALLED BY ANY SCRIPT IN THIS REPOSITORY"**. It needs one `sudo cp` into `/etc/logrotate.d/`. At 100 users the access and audit logs grow fast enough that this stops being cosmetic.

---

## Phase 6 — Durability

**Advances axes E and J.**

1. **Get backups off the host.** `app/Backend/scripts/backup-db.sh` does `pg_dump` + GPG symmetric encryption, keeps 14 nightlies — but writes to `$HOME/compass-backups`, **the same disk as the database**. Its header is candid that this does not cover disk failure and that `OFFHOST_DEST` (line 51) is empty because unattended SSH key auth "is not set up yet". Set up the key, set `OFFHOST_DEST`. An on-disk backup of a single-host system protects against exactly one failure mode: someone dropping a table.
2. **Schedule it.** No cron entry installs the backup. The script exists; nothing runs it.
3. **Rehearse restores.** `restore-check-db.sh` restores into a scratch database and diffs per-table row counts. Run it on a schedule — an unrehearsed backup is a hypothesis.
4. **Schedule retention.** `prune-retention.py` exists and is unscheduled (the readiness assessment marks it "RESOLVED (unscheduled)").
5. **Classify `session_recording`.** Still unclassified as PHI. 148 rows / 2.9 MB over 13 days scales linearly with users — at 100 users this is both a storage and a compliance question.

---

## Phase 7 — CI/CD and quality gates

**Advances axes B and G (both `Blocker` / `Not started` / `Blocked on B`).**

Three GitHub workflows exist — `backend-ci.yml` (Ruff + `pytest --collect-only`), `webapp-ci.yml` (`next lint` + jest), `nightly-e2e.yml` (real Postgres and Redis service containers). **None of them deploy anything.** There is no image build-and-push, no release job, no tagging.

Deployment today is manual: SSH in, `git pull`, rebuild, restart units. At one user that is a Saturday afternoon. At 100 it is an outage with no rollback path — there is no release artefact to roll back *to*.

Three specific items:

1. **The nightly E2E run has failed every night since 2026-05-28**, on `test_redcap_import_sample` — a real defect, not a flaky test. A red pipeline nobody expects to be green provides no signal at all. Fix this first; **axis G is explicitly blocked on it.**
2. **Remove `ignoreBuildErrors` / `ignoreDuringBuilds`** from the Next.js config, so type and lint errors can actually fail a build.
3. **Enable what the workflows deferred**: full `pytest` (not just collection), `mypy`, coverage.

### Frontend readiness (axis F)

Small but patient-facing, and cheap — roughly a day's work: there is **no error boundary**, so when a page throws, patients see the raw Next.js crash page. Add `error.tsx`, `global-error.tsx`, `not-found.tsx`. At 100 users, the probability that somebody hits an error stops being hypothetical.

---

## Suggested order

Phases 1 and 2 are prerequisites — do not put more users in front of the system before TLS and per-user identity exist. After that, 3 and 5 together (tuning without visibility is guesswork), then 6, then 4 and 7 as capacity allows.

| Order | Phase | Why here |
|---|---|---|
| 1 | Edge and transport | Nothing else is safe without it; certificate lead time is the long pole |
| 2 | Identity and secrets | Per-user attribution must exist before per-user load |
| 3 | Capacity + Observability | Tune and measure together, never separately |
| 4 | Durability | More users, more data, more to lose |
| 5 | Pipeline + CI/CD | Real improvements, but not gating the 100-user target |

---

## What this plan does not solve

- **The single-host architecture.** Every component remains a single point of failure. Disk failure is total loss until Phase 6 lands, and outage-level failure remains possible after it.
- **HIPAA as a claim.** As the readiness assessment puts it: *"This plan can satisfy the technical safeguards; it cannot make 'HIPAA compliant' a claim this server asserts alone."* That requires institutional review, a BAA, and a signed risk assessment — organisational work, not engineering work.
- **The de-identification pipeline's validity.** `docs/setup/DEPLOYMENT_3PHASE.md` still carries: *"⚠️ TEST BUILD — not yet approved for real data."* PHI removal was validated against a model not deployed on the Azure resource, so layer 1 falls back to `gpt-4o`; on 2026-07-16 that fallback both **missed PHI** and **over-redacted** clinical text. **No amount of scaling work changes this, and it is the most serious open item in the project.** Scaling a system that may not reliably de-identify simply exposes the flaw to more people.
- **Clinical validation.** Every model output remains experimental and unvalidated.

---

## Open items carried over

Not part of any phase, but unresolved and worth keeping visible.

**Needs a decision before more work lands:**

- **Branch direction is inverted.** `production/official` is nine commits ahead of `staging/caire` in this repository (one commit ahead in the AI repository), with **zero** commits unique to staging. Validate-then-promote does not currently exist: there is no environment where a change is tried before it reaches the box serving patients. Either fast-forward staging to production, or route future work back through staging.
- **Two unresolved stashes** in this repository — `stash@{0}` (KR banner edit) and `stash@{1}` (WIP server-side API-key proxy on `main`) — neither applied nor discarded.
- **`README.md` and `PRODUCTION_READINESS.md` contradict each other.** The README says NOT FOR PRODUCTION; the readiness assessment describes the same host as "promoted to production". One of the two has to change, and which one is a project decision, not an editing decision.

**Compliance, owed to people outside the codebase:**

- Confirm the IRB-approved scope covers PHI on a **shared host with more than ten accounts**, where root and every sudo user can reach the data.
- Confirm the BAA with institutional IT.
- Document the §164.308(a)(1) risk analysis.
- Retire or rewrite `docs/security/SECURITY_AUDIT.md` — it assumes nginx plus a Dockerised backend, which is not this deployment.

**Technical:**

- **The reboot has never been tested.** Axis A is "largely resolved" — five systemd user units with `Restart=always`, and `enable-linger` set so they survive logout. But **no actual reboot has been performed**, so "survives a reboot" is a claim, not an observation. Test it before it is tested for you.
- **PHI files on this host** — `data/deid_mapping.csv` (the re-identification key) and 14 `SID *.xlsx` transcripts. The deployment runbook's own policy is that these are never transferred to a deployment host. Disposition undecided.
- **Corrupt mapping line 2** — see Phase 2, item 4. Only 4 of 31 de-identified CSVs currently map back; the 3 files in `data/input_deid` have zero coverage.
- **Operational files are not version-controlled** — `ops/{status,start-all,stop-all}.sh`, the five `compass-*.service` units, and `DEPLOYMENT_COMPASS_KR.md` exist only on the host. The repo already has a `deploy/` directory. The three shell scripts also still use `nohup`, which systemd has superseded.
- **Admin index links** — `/admin/tracking` links 4 of the ~8 existing sub-pages; `redcap-sync` and others are reachable only by typing the URL.

---

## References

| Document | Covers |
|---|---|
| [`../security/PRODUCTION_READINESS.md`](../security/PRODUCTION_READINESS.md) | The ten-axis assessment this plan sequences |
| `daily_control_logs/2026-08-13_branch_sync_production_readiness.md` | Branch state, what landed on `production/official`, and the capacity limits recorded there. **Lives on `staging/caire`, not on `production/official`** |
| [`RUNBOOK.md`](RUNBOOK.md) | Diagnosis and recovery (written for `caire-server`) |
| [`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) | Suspected patient-data exposure |
| [`../setup/DEPLOYMENT_NATIVE.md`](../setup/DEPLOYMENT_NATIVE.md) | Standing the system up |
| [`../setup/NETWORK_EXPOSURE.md`](../setup/NETWORK_EXPOSURE.md) | LAN exposure and its risks |
| `DEPLOYMENT_COMPASS_KR.md` (workspace root) | This host's actual deployment |
