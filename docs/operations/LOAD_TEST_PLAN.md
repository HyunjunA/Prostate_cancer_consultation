# Load Test Plan — Verifying Behaviour Under Concurrent Users

**Status**: PLAN ONLY — no harness has been written and no run has been performed.
**Answers**: does the system actually work correctly at ~100 concurrent users, and where is the real ceiling?
**Written**: 2026-08-14 · **Host measured**: `compass` (8 vCPU, 61 GB)

---

## Why this document exists

[`PRODUCTION_SCALING_PLAN.md`](PRODUCTION_SCALING_PLAN.md) sets a target of ~100 concurrent users. **Nothing measured supports that number.** The readiness assessment's verdict on load testing is `1 file · Never run at scale`. Nobody knows whether the ceiling is 100 users or 1,000.

This document is the procedure that closes that gap. It is the concrete form of the scaling plan's *"Measure before tuning"* section: guessing worker counts and pool sizes produces a configuration nobody can defend, so the numbers have to come from a run.

### The situation is worse than the records suggest

The repository is documented as having two load-test harnesses. **Neither one runs today.**

| File | State |
|---|---|
| `app/Backend/load_tests/test_100_doctors.py` (291 lines) | Imports `aiohttp`, which appears in **no requirements file and is not installed** — `ModuleNotFoundError` at import. Beyond that, its phases 2 and 3 call `/api/track/doctor/speakers` and `/actions`, which now require an admin JWT, so they would 401 even if it started. |
| `scripts/load_test.py` (333 lines) | Half its endpoints **no longer exist**. `/api/track/patient-first`, `/api/patient/first-visit-responses`, and `/api/patient/summaries` were removed in migrations 008/020 and return 404. Only `/api/patient/files`, `/api/patient/ai-summary/{file}`, and `/api/doctor/score-sentence` still resolve. |

So the true count of working harnesses is **zero**. Worse, their presence has been read as coverage: the readiness assessment cites "two load-test harnesses exist" as though capacity were partly addressed. A harness that cannot run is not partial coverage — it is a false negative waiting to happen.

---

## Three constraints that shape the whole design

### 1. This database holds real patient data

`POST /api/surveys/submit` writes a row to `patient_survey_submission_log`. That is not a side effect to work around — it *is* the path that must be tested, because survey submission is the genuine 100-concurrent path.

The suite's existing safeguard does not help here. `app/Backend/tests/conftest.py` refuses to start unless the database name ends in `_test`, and its comment records why:

> "This is not hypothetical. An ad-hoc script that overrode only the drop folder — and left DATABASE_URL pointing at the live database — wrote four junk rows into the production admin_upload_log."

That guard runs **in-process, at pytest import time**. A load test drives a running HTTP server over the network; the server has its own `DATABASE_URL` and is completely unaffected. **An HTTP load harness inherits no database protection whatsoever.** Neither existing script has any teardown, and `test_100_doctors.py`'s `LOAD_TEST_CLEANUP=true` is a misnomer — it only *prints* the SQL a human should run.

### 2. The rate limiter keys on IP, which will corrupt the measurement

`fastapi-limiter`'s default identifier is the first address in `X-Forwarded-For` (falling back to `request.client.host`) plus the request path. `POST /api/surveys/submit` carries `limit(30, 60)` (`routes_surveys.py:524`).

A load generator on one machine is one IP. Simulating 100 patients from it means **the 31st submission in any 60-second window gets a 429** — measuring the generator's address, not the system's capacity. Each virtual user must carry a distinct synthetic `X-Forwarded-For`.

This cuts both ways, and both are worth measuring. See [Rate-limit identity](#rate-limit-identity-two-modes-both-required).

### 3. Survey submission calls REDCap synchronously, inside the request

When `REDCAP_ENABLED` is true, `import_to_redcap` runs in the request path. Load testing with it on means **load testing the institution's REDCap server** — wrong, and discourteous. Every run in this plan has REDCap disabled; its latency is characterised separately, one request at a time.

Worth correcting while here: `PRODUCTION_SCALING_PLAN.md` states "REDCap call up to 60 s timeout". The code disagrees — `redcap_mapping.py:33` sets `_LOOKUP_TIMEOUT_SEC = 30`, and the import calls in `routes_surveys.py` pass no timeout at all, taking httpx's 5 s default. Worst-case sequential accumulation is roughly 45 s. That line should be fixed when this plan is executed.

---

## What the test must answer

Three questions, in order:

1. **Does 100 concurrent users work?** Pass or fail against stated thresholds.
2. **Where is the ceiling, and what breaks first?** Connection pool, CPU, the Node proxy, or the rate limiter. This is the question behind "is a few hundred users all this can do?"
3. **Is the data still correct under load?** See [Correctness verification](#correctness-verification--the-part-that-matters-most).

The third is what separates this from a benchmark. A system that stays fast while silently losing one submission in a thousand has failed, and latency percentiles will never show it.

---

## Test environment — an isolated instance

**Recommended default.** Everything runs on `compass`, but the target is a separate stack sharing nothing writable with production.

| Component | Production | Load-test |
|---|---|---|
| PostgreSQL | `prostatecancer_db_native` @ 5439 | **`prostatecancer_loadtest`** @ 5439 (same server, separate database) |
| Backend | :18001 (systemd) | **:18101** — same code, same worker count |
| Webapp | :18300 (systemd) | **:18400** — for testing the proxy hop |
| Redis | db 0 @ 6380 | **db 15** @ 6380 — isolates rate-limit keys |
| REDCap | enabled | **disabled** (`REDCAP_API_TOKEN` unset) |

Why this shape:

- Not one row is written to the production database.
- Yet the **write path is fully exercised**. A read-only test against production would leave the actual 100-concurrent path unverified, which defeats the purpose.
- Worker count and pool settings match production, so results transfer.
- Tuning experiments (6 workers, wider pool, different `max_connections`) can be repeated without touching the live system.

**The generator shares the host.** Load generator, target stack, and production stack all draw on the same 8 vCPU. Therefore: run when production traffic is idle, and record the generator's own CPU. **If the generator exceeds ~2 cores, discard the result** — it has become the bottleneck.

### Seed data

`resolve_patient_summary_file()` (`patient_lookup.py`) returns 404 when no `patient_summary` parent exists for a speaker, so every submission would fail without seeding.

- N rows in `patient_summary`, speakers named `LOADTEST_P0001` … `LOADTEST_P{N}`. The prefix must not resemble a real hashed SID, so cleanup can never match live data.
- One full chain per speaker: `transcript_analysis_log` → `sentence_prediction` → `llm_domain_scoring_and_summary`. Without it the report endpoints return empty payloads and the test measures an unrealistically light system.
- Reuse `TestDataFactory` from `app/Backend/tests/factories.py`. Respect FK ordering: `TranscriptAnalysisLog` before `SentencePrediction`, `PatientSummary` before `PatientSurveySubmissionLog`. `LLMDomainScoringAndSummary` has no factory method — build it by hand.
- **Seed to realistic volume, not current volume.** The largest table holds 874 rows today; a running study produces tens to hundreds of thousands. Inflate `nlp_all_predictions` to 50k–100k rows so missing indexes and unpaginated queries surface during the run. This is the only way to actually check the readiness assessment's open question — *"nobody has checked whether pages stay fast at that size."*

---

## User journeys to simulate

Weighted by the load model in the scaling plan: patient survey submission is the real concurrent path; transcript upload is administrative and never concurrent.

| Persona | Share | Journey |
|---|---|---|
| **Patient — survey** | 70% | Read report → open survey → 3–5 autosaves (`PUT /api/patient/first-visit-answers`, `partial=true`) → final `POST /api/surveys/submit` → tracking event |
| **Patient — report** | 20% | `GET /api/patient/files` → `/ai-summary/{file}` → `/sentences/{file}` → tracking event |
| **Doctor — dashboard** | 10% | `GET /api/doctor/files` → `/sentences/{file}/{speaker}` → `/scores/trajectory` → `/rewrites` → `POST /api/track/doctor` |

Think time of 0.3–2.0 s between steps. A run with no think time is not realistic traffic — it is a different test, and it has its own profile below.

### Deliberately excluded

- **AI routes** (`/api/doctor/ai-rewrite`, `/api/doctor/score-sentence`) — each call reaches Azure OpenAI and costs real money; at load the test measures Azure, not us. Available behind `--include-ai`, off by default.
- **Synchronous REDCap** — see constraint 3.
- **Deleted routes** — `/api/patient/summaries`, `/first-visit-responses`, `/track/patient-first`. The existing scripts hit these and collect 404s. **The new harness smoke-checks every endpoint before starting and aborts on any non-2xx**, so counting a 404 as coverage becomes structurally impossible rather than merely discouraged.

---

## Harness design

Built on **`httpx` + `asyncio`**. `httpx==0.28.1` is pinned in `requirements.txt:38` and installed; `aiohttp` is neither. Locust and k6 are avoided deliberately — this host reaches the network only through outbound 443, and adding a load-testing dependency to a machine holding patient data needs a better reason than convenience.

### Files to create

| Path | Role |
|---|---|
| `app/Backend/load_tests/harness.py` | Shared core — `Stats`, percentile with linear interpolation, timed request wrapper, report rendering. **Port this from `scripts/load_test.py`**, whose percentile maths is correct (`test_100_doctors.py` truncates the index instead of interpolating). |
| `app/Backend/load_tests/personas.py` | The three journeys as async functions |
| `app/Backend/load_tests/seed.py` | Seed and teardown, reusing `TestDataFactory` |
| `app/Backend/load_tests/verify.py` | Post-run correctness checks |
| `app/Backend/load_tests/run.py` | CLI entry point, ramp orchestration, JSON output |
| `app/Backend/load_tests/README.md` | How to run, safety rules, how to read results |
| `scripts/loadtest-env-up.sh` / `-down.sh` | Bring the isolated stack up and tear it down |

### Files to remove

- `app/Backend/load_tests/test_100_doctors.py` — port its 12-step doctor workflow into `personas.py`, then delete. Its `test_*` name also falsely implies pytest collects it; `pytest.ini` sets `testpaths = tests`, so `load_tests/` is outside collection entirely.
- `scripts/load_test.py` — port the stats core, then delete.

**Both must go.** A harness that cannot run, left in place, reads as coverage — which is precisely how the current documentation came to overstate capacity testing.

### Safety mechanisms, built into the harness

1. **Database-name guard** — confirm the target's database name ends in `loadtest` or `_test` before sending any load; refuse otherwise. Override only via an explicit `--i-know-what-im-doing` flag. If `/health` does not expose the database name, either add it or have the harness verify a marker row the seeder planted.
2. **Speaker prefix enforcement** — every synthetic user is `LOADTEST_*`, and cleanup deletes only by that prefix. Real data cannot be matched.
3. **REDCap check** — verify REDCap is disabled on the target before starting; abort if it is on.
4. **`--dry-run`** — run each journey exactly once, assert every endpoint returns 2xx, and stop. Always run this first.

### Rate-limit identity — two modes, both required

Virtual user *i* sends `X-Forwarded-For: 10.99.{i//256}.{i%256}`.

| Mode | Simulates | Expected result |
|---|---|---|
| `--distinct-ip` (default) | 100 patients on 100 different addresses | No 429s. Any throttling here is a genuine defect. |
| `--shared-ip` | 100 patients behind one institutional NAT | **429s are the expected outcome.** Record which request number first trips it. |

The gap between these two runs is the evidence for the scaling plan's claim that the survey limiter must key on the patient identifier rather than the IP. Without it that claim is an assertion; with it, it is a measurement.

---

## Run profiles

### A. Verification at 100 (pass/fail)

100 concurrent users, think time on, 10 minutes, 30-second ramp-up. Run against **both** the backend directly (:18101) and through the webapp proxy (:18400) — the Node proxy hop buffers request and response bodies in full and has never been measured under load.

| Threshold | Value |
|---|---|
| Error rate | < 0.5% |
| p95 latency, patient-facing reads | < 1.5 s |
| p95 latency, survey submit | < 2.0 s |
| p99 latency, any endpoint | < 5.0 s |
| Correctness checks | **all must pass** |

### B. Ceiling discovery (ramp)

50 → 100 → 200 → 400 → 800 concurrent users. Five minutes per step, one minute idle between.

**Stop at the first step that trips any of these**, and record it as the ceiling:

- error rate > 1%
- p95 > 3 s
- connection refusal (`FATAL: sorry, too many clients already`)
- backend OOM or restart

For each step, record **what the limiting factor was** — not just that it failed. That attribution is the primary deliverable of this plan.

### C. Burst (survey deadline)

100 users, no think time, all submitting simultaneously. This is a real shape — the last day of a study window — and it aims straight at the connection-pool ceiling: 3 workers × (pool 10 + overflow 20) = 90 possible connections against `max_connections = 100`.

### D. Soak (leak detection)

30 users, 2 hours. Watch for RSS growth, connection leakage, and latency drift. Short runs cannot detect any of these, and a study runs for months.

---

## Correctness verification — the part that matters most

After each run, `verify.py` queries the database directly. Latency numbers are meaningless if the data is wrong.

| Check | What it proves |
|---|---|
| **Count match** | 2xx submissions recorded by the harness == `LOADTEST_%` rows in `patient_survey_submission_log`. A mismatch is lost writes or phantom writes. |
| **No duplicates** | Exactly one final submission per `(file, speaker, survey_type)`. Catches double-insert from retries. |
| **Payload integrity** | Each row's `answers` JSONB matches byte-for-byte what the harness sent for that user. **This is the cross-contamination check** — patient A's answers appearing in patient B's row would be a reportable incident, and no latency metric would ever reveal it. |
| **FK integrity** | Every submission's `file` resolves to a real `patient_summary` parent. |
| **Event ordering** | `doctor_behavior` events remain chronological within each session (inheriting the deep-verify idea from `test_100_doctors.py`). |
| **Audit completeness** | `phi_access_log` holds one row per PHI-touching request. If the audit middleware drops rows under load, per-user attribution fails exactly when it matters — a HIPAA §164.312(b) problem, not a performance one. |

**Every check must pass.** A profile with excellent latency and one failed correctness check is a failed profile.

---

## Server-side instrumentation

Sampled every 5 seconds during each run, written to CSV. Client-side latency alone shows *that* something slowed down, never *why*.

| Metric | Source |
|---|---|
| Connection count by state | `SELECT count(*), state FROM pg_stat_activity GROUP BY state` — **behaviour as this approaches 90 is the single most important observation in the whole plan** |
| Deadlocks, conflicts, rollbacks | `pg_stat_database` |
| Slow queries | `log_min_duration_statement = 500`, set on the test instance only |
| Backend CPU / RSS | per worker PID, from `/proc` |
| Webapp CPU / RSS | Node process |
| Host load average, free memory | `/proc/loadavg`, `/proc/meminfo` |
| **Generator CPU** | discard the run if it exceeds ~2 cores |
| Redis | `INFO stats`, rate-limit key growth |

The system has no observability (axis C, not started), so this collector is both a prerequisite for the test and **the natural starting point for the scaling plan's Phase 5** — the metrics worth sampling here are the metrics worth exposing later.

---

## Deliverables when this plan is executed

1. `docs/operations/LOAD_TEST_RESULTS.md` — date, environment, per-profile results, **the ceiling and its cause**, and recommended values for worker count, pool size, `max_connections`, and `shared_buffers`.
2. Raw data under `load_tests/results/<timestamp>/` — JSON latency distributions, CSV server metrics.
3. Updates to `PRODUCTION_SCALING_PLAN.md` — real numbers in the Phase 3 capacity section, an explicit statement of whether 100 concurrent users is verified, and the REDCap timeout correction.
4. **A re-runnable harness.** After changing a setting, the same command must reproduce the measurement. Writing another single-use script is the failure mode this repository has already experienced twice.

---

## Decisions taken, and their alternatives

| Decision | Default | Alternative |
|---|---|---|
| Target | **Isolated instance** (dedicated DB, :18101 / :18400) | Production stack read-only; or production with writes plus cleanup |
| Scope | **Profile A, then profile B** | Verification at 100 only |
| Ramp limit | Stop at 800 | Push further |
| AI routes | Excluded (Azure cost) | `--include-ai` for one characterisation run |
| Soak (D) | Included | Skip if time is short |

---

## What this plan does not cover

- **The AI pipeline's throughput.** It is a polled drop folder processing one file at a time at 2–3 minutes each, driven by administrative uploads that are never concurrent. Loading it would measure a queue nobody stands in. Its real risk is silence, not throughput — see the scaling plan's Phase 4.
- **Failover and availability.** There is one of everything; a load test cannot measure the behaviour of redundancy that does not exist.
- **Whether the system *should* serve more users.** The de-identification pipeline is still marked `TEST BUILD — not yet approved for real data`. Capacity findings do not bear on that, and a good result here must not be read as clearance to widen access.

---

## References

| Document | Covers |
|---|---|
| [`PRODUCTION_SCALING_PLAN.md`](PRODUCTION_SCALING_PLAN.md) | The seven-phase roadmap this test serves; Phase 3 holds the capacity targets |
| [`../security/PRODUCTION_READINESS.md`](../security/PRODUCTION_READINESS.md) | Ten-axis assessment; axis D (reliability) and axis C (observability) |
| [`RUNBOOK.md`](RUNBOOK.md) | What to do if a run destabilises the host |
| [`../../app/Backend/TESTING.md`](../../app/Backend/TESTING.md) | Test suite layout and why `load_tests/` sits outside pytest collection |
