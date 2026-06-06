# Pipeline → Dashboard DB Write Architecture — Current Method and Alternatives

> **Status:** Reference document (current-state record + design-space analysis).
> Not a proposal; not a TODO. Read alongside design docs that depend on
> this architectural choice.
> **Created:** 2026-05-28
> **Related:**
> - `docs/setup/DEPLOYMENT_NATIVE.md` — the deployment topology that this design serves
> - `dev_docs/PATIENT_ID_HASH_DESIGN.md` — depends on knowing which side writes to which tables
> - `dev_docs/V37_First_Visit_Persistence_Design.md` — earlier persistence design discussion
> - `dev_docs/DB_SCHEMA_CLEANUP_TODO.md` — schema unification work that touches the same write path

---

## 1. Question this document answers

> "When the AI pipeline (in the sibling
> `AI_physician_patient_communication` repo) finishes processing a
> transcript, how do those results actually end up in the dashboard's
> PostgreSQL database? Is that a REST API call? A direct database
> write? Something else? And — given the project's constraints — is
> there a better way?"

The current answer is **direct database write via shared
SQLAlchemy async engines and cross-repo ORM model import**. There
is no HTTP API between the AI repo and the dashboard backend; both
processes connect to the same PostgreSQL instance.

The first half of this document records that current method in
detail. The second half compares it against five other realistic
alternatives and identifies when each would be the right choice.

---

## 2. Current method — Direct DB write via SQLAlchemy async

### 2.1 Architecture at a glance

```
[AI repo — pipeline process]              [Dashboard repo — backend process]
                                                    │
  main_complete_pipeline_db.py                      │
        │                                           │
        ├─ NLP container (Docker :8888)             │
        ├─ AI 5-substep via Azure OpenAI            │
        ├─ create_async_engine(DATABASE_URL) ─────┐ │
        ├─ from persistence import save_all   ◄───┼─┤ (cross-repo import via sibling sys.path)
        ├─ from models import …                ◄──┼─┤
        └─ async with Session() as db:            │ │
              INSERT … ; COMMIT                   ▼ ▼
                                          ┌───────────────────────┐
                                          │ PostgreSQL @ :5433    │
                                          │ prostatecancer_db     │
                                          │  ┌───────────────┐    │
                                          │  │ 8 pipeline   │    │
                                          │  │ tables       │    │
                                          │  └───────────────┘    │
                                          └───────────────────────┘
                                                    ▲ ▲
                                                    │ │
                                          ┌─────────┴─┴────────┐
                                          │ Dashboard backend  │
                                          │ uvicorn :18000     │
                                          │ (READ ONLY for      │
                                          │  pipeline tables)   │
                                          └────────────────────┘
```

Two independent native processes (AI pipeline + dashboard backend),
one shared database, no service-to-service network call between
the two processes.

### 2.2 Code path — concrete file:line references

**AI repo side**:

- `main_complete_pipeline_db.py:91` — module import:
  ```python
  from db import persistence_helper
  ```
- `main_complete_pipeline_db.py:212` — the single line that performs every DB write for one analysis:
  ```python
  analysis_id = asyncio.run(persistence_helper.persist_pipeline_results(...))
  ```
- `main_complete_pipeline_db.py:279, 314` — pre/post row-count snapshots for the
  `[DB] row counts (delta)` printout that operators see after every run.
- `db/persistence_helper.py:315-316` — fresh engine per call:
  ```python
  engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
  Session = async_sessionmaker(bind=engine, expire_on_commit=False)
  ```
- `db/persistence_helper.py:345` — explicit cleanup:
  ```python
  await engine.dispose()
  ```
- `db/persistence_helper.py` docstring (lines 1-30) — declares the
  cross-repo dependency:
  > "Imports are deferred inside the functions because they reach into the dashboard repo's backend (sys.path is set up by the orchestrator's bootstrap before this module is imported)."

**Dashboard repo side (reused cross-repo)**:

- `app/Backend/models.py` — every SQLAlchemy ORM class, imported by the AI repo at runtime.
- `app/Backend/persistence.py` — `save_all(...)` handles the 6 NLP-side tables in one transaction; called cross-repo from the AI repo's helper.
- `app/Backend/core/settings.py` — `get_settings()` returns a typed `Settings` object including `database_url`; the AI repo calls this so the two processes always agree on connection details.

### 2.3 What runs where

| Concern | Owner |
|---|---|
| NLP container lifecycle | AI repo (`main_complete_pipeline_db.py` brings it up + tears down) |
| AI 5-substep (Azure OpenAI) | AI repo (`ai_pipeline/` modules + AI repo's `db/persistence_helper.py:_save_ai_results`) |
| NLP 6-table persistence | Dashboard repo (`persistence.save_all`, called cross-repo) |
| AI 2-table persistence | AI repo (`db/persistence_helper._save_ai_results`) |
| Final `transcript_analysis_log` UPDATE (`ai_overall_score`, `processed=True`) | AI repo (in the same transaction) |
| ORM schema definitions | Dashboard repo (`app/Backend/models.py` — single source of truth) |
| Database itself | Native PostgreSQL on host, not owned by either repo |

### 2.4 Why this was chosen

The decisive constraint is documented in `docs/setup/DEPLOYMENT_NATIVE.md`:
**Phase 1 (dashboard) and Phase 2 (pipeline) must be independently
restartable**, and Phase 2 must work even when Phase 1 is down.

The earlier architecture (pre-May 2026) routed pipeline writes
through dashboard backend code that was conceptually mounted in
Docker alongside the pipeline. When the dashboard backend was
later carved out into its own native process at `:18000`, two
choices were on the table:

1. Expose dashboard backend endpoints (HTTP) that the pipeline
   posts to. **Rejected** because it would re-couple the
   lifecycles: every Phase 2 run would require Phase 1 to be
   running.
2. Let the pipeline open its own connection to the same DB and
   reuse the dashboard's ORM models via cross-repo import.
   **Chosen** because it preserves Phase 1/Phase 2 independence and
   keeps the schema source of truth in one place
   (`models.py`).

The `.env` duplication that `DEPLOYMENT_NATIVE.md` calls out
("`DATABASE_URL` and `AZURE_OPENAI_*` are duplicated in both files
by design") is the visible artefact of this decision: each side
owns its copy of every connection detail it consumes, so neither
process has to reach into the other repo at runtime to learn how
to connect.

### 2.5 Performance characteristics

Observed on the May 22 / May 28 fresh-deploy runs (three transcripts):

| Metric | Measured value |
|---|---|
| Per-file pipeline run (NLP + AI + DB persist) | ~2–3 minutes with `--skip-ai`, ~5–8 minutes including AI |
| DB persist step alone | ~0.5–1.5 seconds per file (8 tables, ~500–900 rows total) |
| Inserts per second under one engine | ~300–800 rows/s (dominated by ORM overhead, not network) |
| Transaction duration | Single transaction wraps all 8 tables per file |
| Connection overhead | One engine creation + one dispose per file (~50 ms total) |

Throughput is more than adequate for the target dataset (single-
machine, batch processing, ~50 patients), but two characteristics
matter for any future architectural change:

- **One transaction per file** keeps the entire write atomic — a
  failure halfway through one file rolls back cleanly without
  partial state on disk.
- **No connection pooling across files** is fine because pipeline
  runs are sequential; if parallelism becomes a goal, the engine
  lifetime would need to be extended across files.

### 2.6 Strengths

1. **Phase independence preserved.** Phase 2 pipeline runs do not
   require the Phase 1 uvicorn process to be up; they only require
   PostgreSQL itself. This was the entire point of the May 2026
   refactor and the current method honours it.
2. **Schema source of truth is unambiguous.** Only one repo holds
   the ORM classes; the other imports them. No risk of schema
   drift between two parallel definitions.
3. **Atomic per-file writes.** All eight tables are written within
   one transaction; failures are clean.
4. **No new infrastructure components.** Reuses the PostgreSQL the
   dashboard already requires.
5. **Low latency.** No HTTP round-trip, no serialisation across
   process boundaries, no queue hop.
6. **Operationally simple to debug.** A `[DB] INSERT …` line per
   table appears in the pipeline's own stdout; if a write fails,
   the SQLAlchemy exception surfaces directly in the pipeline
   process.
7. **Idempotency is straightforward.** The pipeline already
   consults `persistence.file_already_processed(...)` to skip
   re-processing; that lives at the same layer as the writes.

### 2.7 Weaknesses and risks

1. **Cross-repo coupling at import time.** The AI repo's
   `db/persistence_helper.py` assumes the dashboard repo is cloned
   as a sibling and that `sys.path` has been adjusted before
   import. If a teammate clones one repo without the other, every
   pipeline run fails with `ModuleNotFoundError`. This is
   documented but easy to trip over.
2. **AI-pipeline process holds DB write credentials.** The
   pipeline process can write to every table on the database via
   the `prostatecancer_user` role. There is no schema-level
   privilege separation between "pipeline writes" and "dashboard
   reads". A compromised pipeline process is a compromise of the
   entire dataset.
3. **Schema changes need both repos updated in lockstep.** Adding
   a column requires changing `models.py` (dashboard) and any
   pipeline code that builds rows (AI repo). Forgetting one side
   surfaces only at runtime as a SQLAlchemy error.
4. **No retry / dead-letter on transient DB failures.** A
   transient connection failure during the persist step aborts the
   pipeline run for that file; the operator must re-run manually.
   There is no queue or outbox that could replay the write.
5. **No write audit trail beyond Postgres' own logs.** Every write
   is anonymous from the application's perspective — there is no
   `created_by_pipeline_run_id` or similar metadata that would let
   a security audit trace "which pipeline invocation produced this
   row?".
6. **Asymmetric ownership.** Half the persistence
   (`save_all`, the 6 NLP tables) lives in the dashboard repo;
   half (`_save_ai_results`, the 2 LLM tables + the final UPDATE)
   lives in the AI repo. A reader has to understand both files to
   follow the write path. This is a maintenance papercut, not a
   correctness risk.
7. **Hard to scale to multi-machine.** If the pipeline ever needs
   to run on a different machine from the database (e.g. GPU
   server for NLP), the direct-DB connection has to traverse a
   network at write time, and the cross-repo import does not work
   without a copy of the dashboard repo on the pipeline machine.

---

## 3. Comparison framework — what to evaluate alternatives against

Before reviewing alternatives, fix the criteria. Each alternative
in §4–§9 is scored against these on a `+ / 0 / -` scale.

| Criterion | What it means here |
|---|---|
| **Phase 1/Phase 2 decoupling** | Can the pipeline run when the dashboard backend is down? (Today: yes.) |
| **Atomic per-file write** | Does a partial-write failure leave the DB in a half-written state? (Today: never.) |
| **PHI exposure surface** | How many places see plaintext patient data in motion? (Today: just the pipeline process and the DB.) |
| **Throughput / latency** | Time from "pipeline finishes computing one file" to "rows are queryable". (Today: ~1 second.) |
| **Operational complexity** | How many components need to be running / monitored? (Today: just PostgreSQL on top of what's already required.) |
| **Schema drift management** | How is the ORM/schema kept consistent across two codebases? (Today: cross-repo import.) |
| **Failure recovery** | What happens when the write fails halfway? Retry semantics? (Today: manual re-run.) |
| **Audit trail** | Can you reconstruct "which pipeline run wrote this row"? (Today: no per-row provenance.) |
| **Multi-machine readiness** | Will this work if pipeline and DB live on different hosts? (Today: works but increasingly awkward.) |
| **Schema-level privilege isolation** | Can the pipeline be restricted to its own write surface? (Today: no — full write access to all tables.) |

---

## 4. Alternative A — HTTP REST API

### 4.1 How it would work

The dashboard backend exposes one or more authenticated write
endpoints (e.g. `POST /api/admin/pipeline/persist`). The pipeline,
after computing one file's worth of NLP + AI results, POSTs the
results as JSON; the backend validates them against a Pydantic
schema and writes them to the database using its own existing
SQLAlchemy session.

```python
# AI repo
result = run_pipeline(filepath)
async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:18000/api/admin/pipeline/persist",
        json=result.to_dict(),
        headers={"X-API-Key": API_KEY},
        timeout=60.0,
    )
    response.raise_for_status()
```

### 4.2 Scoring against §3

| Criterion | Score | Why |
|---|---|---|
| Phase 1/Phase 2 decoupling | **-** | Phase 2 now requires Phase 1 to be running; the very property the current architecture was built to preserve is lost |
| Atomic per-file write | 0 | Still one transaction (backend can wrap it), but now the HTTP failure mode adds another way for it to fail mid-flight |
| PHI exposure surface | **-** | PHI now traverses an HTTP request/response, hits backend access logs, possibly reverse-proxy logs, possibly any APM agent — more surfaces to mask |
| Throughput / latency | **-** | HTTP serialisation, network round-trip per file, larger JSON payload (sentence_prediction with `<main>` context can be hundreds of KB per file) |
| Operational complexity | 0 | One more authenticated endpoint to maintain, but no new infrastructure |
| Schema drift management | **+** | Schema becomes the API contract; pipeline does not import dashboard code at all. Stronger decoupling at code level |
| Failure recovery | 0 | Same as today: a failed POST aborts the run; HTTP retries are possible but distributed-transaction semantics are tricky |
| Audit trail | **+** | Backend can stamp every write with `pipeline_run_id` derived from request metadata |
| Multi-machine readiness | **+** | Pipeline can live anywhere it can reach the backend over HTTP |
| Privilege isolation | **+** | Pipeline holds an API key, not DB credentials |

### 4.3 Fit for this project

Trades the current Phase 1/Phase 2 decoupling — the property `DEPLOYMENT_NATIVE.md`
explicitly calls out as the deciding factor — for cleaner privilege
isolation and a stronger code-level decoupling. **Not a good fit
today**: the project explicitly values operator workflows where
Phase 2 is run independently (e.g. after a fresh redeploy, before
the backend has been started). The architectural goal is the
opposite of what this alternative provides.

**When this would become a better fit**: if the pipeline ever
needs to run on a different host from the database, or if multiple
independent pipeline runners need to coordinate, an HTTP-API-with-
authentication pattern starts to dominate.

---

## 5. Alternative B — Message queue (durable broker)

### 5.1 How it would work

A durable message broker (Redis Streams, RabbitMQ, or
PostgreSQL's own `LISTEN/NOTIFY` via a queue table) sits between
the pipeline and the database writes. The pipeline publishes one
message per file containing the computed results. A subscriber
process (could be the dashboard backend, could be a dedicated
worker) consumes the message and writes to the database.

```python
# AI repo
result = run_pipeline(filepath)
await broker.publish("pipeline.results", result.to_msgpack())
# pipeline is done; the write may happen later
```

### 5.2 Scoring against §3

| Criterion | Score | Why |
|---|---|---|
| Phase 1/Phase 2 decoupling | **+** | Pipeline never directly contacts the database; it just publishes to the broker. The consumer (backend or worker) can be down without losing data |
| Atomic per-file write | **+** | The consumer wraps each message's write in one DB transaction; if it fails, the message is requeued |
| PHI exposure surface | **-** | PHI now sits in the broker's storage (Redis disk, RabbitMQ disk) until consumed — one more system to protect |
| Throughput / latency | **-** | Eventual consistency: "pipeline finished" no longer implies "row is queryable" |
| Operational complexity | **--** | A whole new component (broker) needs to be installed, monitored, backed up, secured |
| Schema drift | **+** | Message schema becomes the contract; can version with `schema_v` field |
| Failure recovery | **++** | Built-in retry, dead-letter queue, replay-from-offset — the strongest profile of any alternative |
| Audit trail | **+** | Every message is durably stored with timestamp; can be inspected after the fact |
| Multi-machine readiness | **+** | Producer and consumer can live anywhere |
| Privilege isolation | **+** | Pipeline has broker publish credentials only, never DB credentials |

### 5.3 Fit for this project

A heavyweight choice for what is currently a single-machine,
batch, sequential workload of ~50 files. The retry and durability
benefits are real but address failure modes that the project does
not actually experience. **Not a good fit today**: the
operational overhead (running a broker, monitoring dead-letter
queues) is disproportionate to the throughput and reliability the
project needs.

**When this would become a better fit**: if the dashboard ever
needs to handle a high rate of submissions, if multiple pipeline
runners need to coordinate, or if "the write failed and now what?"
becomes a recurring operational question.

---

## 6. Alternative C — File-based handoff (CSV / JSON / Parquet drop folder)

### 6.1 How it would work

The pipeline writes results to a known directory in a structured
format (one folder per file, with one file per table or a single
multi-sheet xlsx). A separate importer process (either
on-demand or scheduled) reads the directory and inserts into the
database.

This is approximately how the pipeline used to work before the
2026-04 / 2026-05 persistence refactor — the `convert_output_to_csv.py`
helper mentioned in the AI repo's commit history is an artefact of
that earlier era.

```python
# AI repo
result = run_pipeline(filepath)
result.to_csv_directory("data/output/<file_token>/")
# Done. An importer process picks it up.
```

### 6.2 Scoring against §3

| Criterion | Score | Why |
|---|---|---|
| Phase 1/Phase 2 decoupling | **+** | Pipeline never contacts the backend or DB directly |
| Atomic per-file write | 0 | Atomicity now belongs to the importer, not the pipeline; partial-write races are a known failure mode of file-based handoff |
| PHI exposure surface | **-** | PHI now sits in plaintext on disk awaiting import; backup pipelines, file watchers, and disk-encryption assumptions all get drawn in |
| Throughput / latency | **-** | Eventual consistency; importer either polls (latency) or watches (complexity) |
| Operational complexity | **-** | Needs an importer process, file-watching infrastructure, atomic-rename conventions ( `.tmp` → final), retry logic for partial writes |
| Schema drift | 0 | File format becomes contract; column drift is annoying to debug |
| Failure recovery | 0 | Failed imports leave files in the directory; replayable but requires manual intervention |
| Audit trail | **+** | Files persist as their own record; can be archived, inspected, replayed |
| Multi-machine readiness | 0 | Works only if the drop folder is on shared storage (NFS, S3) — adds complexity |
| Privilege isolation | **+** | Pipeline only needs filesystem write access |

### 6.3 Fit for this project

This is what the project moved away from in the 2026-05 refactor.
Moving back is moving backwards. **Not a good fit today**: the
direct-DB approach already gives stronger atomicity and lower
latency, and the "PHI plaintext on disk" property is the opposite
of the direction the patient_id hashing design (§
`PATIENT_ID_HASH_DESIGN.md`) takes.

**When this would become a better fit**: if the project ever
needed to ship results to a different team or a different
environment for import, file-based handoff is the lingua franca
of inter-organisational data exchange.

---

## 7. Alternative D — Background job queue (Celery / RQ / Postgres SKIP LOCKED)

### 7.1 How it would work

A job queue (Celery with Redis broker, RQ with Redis, or a hand-
rolled `SELECT ... FOR UPDATE SKIP LOCKED` pattern on PostgreSQL)
holds "persist this result" jobs. The pipeline enqueues; one or
more worker processes dequeue and write to the database.

```python
# AI repo
result = run_pipeline(filepath)
persist_pipeline_results.delay(result.to_dict())  # Celery-style
```

### 7.2 Scoring against §3

Essentially identical to **§5 (message queue)** with the same
trade-offs: durability and retry come for free, but at the cost of
running a new piece of infrastructure (a worker, a broker, a
monitoring story) for a workload that today fits comfortably in
one synchronous transaction.

The PostgreSQL `SKIP LOCKED` variant deserves a separate note:
it avoids the broker entirely by using a queue table inside the
same PostgreSQL the data is written to. Lower operational overhead
than Celery/RQ but inherits all the dependency on PostgreSQL being
up — which was the very property the current direct-DB approach
already gives you.

### 7.3 Fit for this project

**Not a good fit today** for the same reason as §5: the project's
failure modes do not justify the infrastructure. The PostgreSQL-
native `SKIP LOCKED` variant is the most defensible if a queue
ever does become necessary.

**When this would become a better fit**: if pipeline runs ever
need to be triggered from a web UI or from a long-running watch
loop, a job-queue mental model is the natural fit.

---

## 8. Alternative E — gRPC (strongly-typed RPC)

### 8.1 How it would work

The dashboard backend exposes a gRPC service with proto-defined
schemas for every write. The pipeline depends on the generated
gRPC client and calls the service over HTTP/2.

Mechanically similar to §4 (HTTP REST), with stronger schema
guarantees and a binary wire format.

### 8.2 Fit for this project

**Not a good fit today**: gRPC requires proto definitions, code
generation, an HTTP/2 stack, and a development workflow that few
research-scale teams sustain. The schema guarantees it offers are
already approximated by the cross-repo ORM import in the current
method.

**When this would become a better fit**: only if the project ever
joins a broader services architecture where gRPC is already the
standard. Unlikely.

---

## 9. Alternative F — Outbox pattern / Change Data Capture (CDC)

### 9.1 How it would work

The pipeline writes to its own local database (or an outbox table
in a local PostgreSQL); a CDC tool (Debezium, Postgres logical
replication) streams those changes to the dashboard's PostgreSQL.

### 9.2 Fit for this project

**Not a good fit today**: this is enterprise-data-platform pattern.
Two PostgreSQL instances, a Kafka cluster for the CDC stream, and
a Debezium connector to maintain — for a single-machine research
deployment, the operational cost is two orders of magnitude over
the problem being solved.

**When this would become a better fit**: if the AI pipeline ever
moves to a separate organisation, separate cloud account, or
separate legal jurisdiction from the dashboard, CDC starts to be
the only honest answer.

---

## 10. Side-by-side comparison

Symbols: `++` strong fit, `+` fits, `0` neutral, `-` poor fit, `--` bad fit.

| Criterion | **Current** (direct DB) | A (HTTP) | B (queue) | C (files) | D (jobs) | E (gRPC) | F (CDC) |
|---|---|---|---|---|---|---|---|
| Phase 1/Phase 2 decoupling | + | -- | + | + | + | -- | + |
| Atomic per-file write | + | 0 | + | 0 | + | 0 | 0 |
| PHI exposure surface | + | - | - | -- | - | - | - |
| Throughput / latency | + | - | - | - | - | 0 | - |
| Operational complexity | + | 0 | -- | - | - | -- | -- |
| Schema drift management | 0 | + | + | 0 | + | ++ | + |
| Failure recovery | - | 0 | ++ | 0 | ++ | 0 | + |
| Audit trail | - | + | + | + | + | + | ++ |
| Multi-machine readiness | 0 | + | + | 0 | + | + | ++ |
| Privilege isolation | - | + | + | + | + | + | + |
| **Total fit for this project today** | **Strong** | Weak | Weak | Bad | Weak | Bad | Bad |

---

## 11. Recommendation

**Keep the current method.** It optimises for the specific
constraints this project actually has:

1. **Operator-driven Phase 2**, often run before or independently
   of Phase 1. The whole point of the May 2026 refactor was to
   protect this property; the current direct-DB approach is the
   only alternative in this list that preserves it without
   introducing a queue.
2. **~50-patient target scale.** Throughput pressures are well
   below the point where eventual consistency, retry queues, or
   horizontal scaling earn their operational cost.
3. **Single-machine deployment.** All the alternatives that earn
   their complexity (B / D / F) only do so when there is more than
   one machine in play.
4. **Single-team development.** Schema drift, code-level
   decoupling, and the privilege-isolation arguments for HTTP/gRPC
   only land when there is a different team owning the producer
   from the consumer; here it is the same person owning both.

### 11.1 Two specific weaknesses worth addressing without changing the architecture

The Weaknesses in §2.7 list two issues that the current method
genuinely has and that should be addressed without abandoning the
overall approach:

1. **Privilege isolation (§2.7 #2).** The pipeline process today
   holds full write access to every table including the new
   `phi.patient_identity` after the patient-id hashing work
   lands (see `dev_docs/PATIENT_ID_HASH_DESIGN.md`). A dedicated
   DB role with `INSERT`-only privilege on the pipeline-writeable
   tables — and no access at all to behaviour-tracking or doctor-
   rewrite tables — would address this without changing the
   write mechanism.
2. **Audit trail (§2.7 #5).** Adding a `pipeline_run_id UUID`
   column to `transcript_analysis_log` (and stamping it through
   to every row written in the same call) gives per-row
   provenance without changing how the writes are issued. Cheap
   and a free win for the eventual audit story under
   `docs/security/PHI_COMPLIANCE.md`.

### 11.2 When to revisit this decision

Trigger conditions that would justify reopening this document:

- The pipeline needs to run on a separate machine from the
  dashboard database (e.g. GPU host for NLP). At that point,
  alternative A (HTTP) or alternative B (queue) become
  proportionate.
- Multiple pipeline runners need to run in parallel. The single-
  transaction-per-engine pattern of the current method does not
  contend with parallel runs gracefully; a job queue (D) or a
  message queue (B) would.
- A second team takes ownership of either the pipeline or the
  dashboard. Cross-repo ORM imports are tolerable inside one
  team's working memory but become a deployment-coordination
  hazard across teams.
- The project ever needs to deliver results to an external
  organisation. File-based handoff (C) is the lingua franca for
  cross-organisation data exchange.

Until one of those triggers fires, the current method is the
right answer.

---

## 12. Hybrid / coexistence patterns

The §3–§10 analysis treated each alternative as a wholesale
replacement for the direct-DB write. In practice the more useful
question is often: **can any of these alternatives sit alongside
the current method without disturbing it, and would that be
worth doing?**

This section identifies four coexistence patterns that genuinely
add value when layered on top of the current direct-DB write, and
three that don't earn their cost even as add-ons.

### 12.1 Already in place — HTTP API for read paths

The dashboard backend's `/api/patient/*`, `/api/doctor/*`,
`/api/admin/*`, and `/api/track/*` endpoints **already** form an
HTTP API on top of the same database the pipeline writes into.
That is not a new pattern under consideration; it is the present
architecture. The webapp, ad-hoc curl calls, and any future
external consumer all read through this surface today.

**Why this matters for the rest of the section:** HTTP-API and
direct-DB writes are not mutually exclusive. They serve different
audiences (pipeline writers vs. dashboard / webapp readers). The
remaining sub-sections ask whether **additional audiences** justify
additional patterns layered on top.

| Verdict | Already in production. No change recommended. |
|---|---|

### 12.2 Useful — file-based audit dump alongside DB write

The pipeline already writes structured artefacts under
`data/output/<source_filename>/`:

- `step2_segmentation/segmented_sentences.csv`
- `step3_classification/predictions_long.csv`
- `step4_selection/top10_by_outcome.xlsx`
- `step5_context/top10_with_context.xlsx`
- per-domain `cp.xlsx`, `le.xlsx`, `ed.xlsx`, `inc.xlsx`, `ius.xlsx`

These are intermediate / debug outputs today, but functionally
they are a **file-based audit trail running in parallel** with the
DB write. The project therefore already has a coexistence pattern
between Alternative C (file handoff) and the direct-DB write —
they just are not formally framed that way.

**What "formalising" would look like (small, optional):**

1. Write the file artefacts **only after** the DB transaction
   commits, not before — so a failed DB write does not leave
   orphan files. (Currently the order is "write files, then DB";
   reversing it costs nothing.)
2. Add a `manifest.json` per `<file_token>/` directory containing
   the `analysis_id`, the pipeline version, the input hash, and
   the row counts written to each table. This makes the
   directory self-describing for disaster recovery and audit.
3. Once the patient-id hashing design lands, the directory name
   becomes the `file_token`, which makes the file-side trail
   PHI-free by default (per §11.9 of
   `dev_docs/PATIENT_ID_HASH_DESIGN.md`).

**What this buys:**

- Disaster-recovery story: if the DB ever has to be restored to a
  point in time and the operational rows are lost, the file
  artefacts can rebuild most of the dataset via a re-import
  script.
- Audit trail: matches `docs/security/PHI_COMPLIANCE.md`'s
  HIPAA §164.312(b) audit-trail expectation without depending on
  Postgres' own log retention.
- Inter-team data exchange: if an analyst ever needs a snapshot
  of "what one pipeline run produced", the manifest + the per-
  domain xlsx files are a self-contained export.

| Verdict | **Recommended.** Light touch; the directory already exists. Formalising the manifest and the write order is a one-PR change. |
|---|---|

### 12.3 Useful — outbox table inside the same transaction

A small table — say `pipeline_event_outbox` — written to in the
**same** SQLAlchemy transaction as the eight pipeline tables.
Each row records a single "event" like
`{analysis_id, event_type: "analysis_persisted", payload: {...}, claimed_at: NULL}`.

A separate consumer process (or a periodic worker) reads
unclaimed rows, performs whatever downstream action is needed,
and marks them claimed. Because the outbox row was written in
the same transaction as the data, the consumer never observes
events for data that does not exist, and a crashed consumer
can be restarted without losing events.

**What this buys (and only this):**

- An extension point for future downstream consumers — analytics
  warehouse loaders, dashboard cache invalidation, REDCap
  re-sync after the patient-id hashing migration, "notify the
  operator that an analysis is done" hooks, etc.
- Per-row audit trail with timestamps, replayable after the fact.

**What this does NOT buy:**

- It does **not** decouple Phase 2 from Phase 1. The pipeline
  still writes the eight data tables directly; the outbox is an
  add-on, not a substitute.
- It does **not** replace the missing retry-on-DB-failure story
  (§2.7 #4), because the outbox row's own write is in the same
  failed transaction.

| Verdict | **Useful only if a concrete downstream consumer is in the near roadmap.** Not worth introducing speculatively. The patient-id hashing work might introduce one (e.g. "notify the dashboard cache that a new analysis exists"), at which point this pattern becomes the right shape. |
|---|---|

### 12.4 Useful — HTTP API endpoints for *management* operations

Distinct from the pipeline write itself: a small set of authenticated
endpoints for **operations on already-written data** that today
have to be done with `psql` or ad-hoc Python scripts. Examples:

- `POST /api/admin/pipeline/reprocess/{analysis_id}` — re-run the
  AI substep against an existing NLP-only analysis (useful after
  the AI prompt is changed).
- `DELETE /api/admin/pipeline/{analysis_id}` — delete one analysis
  and every dependent row (today this is four manual `DELETE`
  statements, listed verbatim in `dev_docs/TODO.md` item #3).
- `GET /api/admin/pipeline/{analysis_id}/manifest` — return the
  exact write provenance for one analysis.

These do not replace the pipeline write path; they sit on top of
the existing read-side API surface (§12.1) and add the small set
of authenticated mutating operations that operators currently
perform out-of-band.

**Why this is a coexistence win:** the management surface is
*authenticated, audited, and HTTP*, while the pipeline write
remains *direct, unauthenticated-at-app-layer, and atomic*. The
two surfaces serve different audiences (operator from a browser
vs. pipeline from CLI). Adding the management surface does not
disturb the pipeline write path at all.

| Verdict | **Recommended whenever a recurring operator task becomes painful.** Targets the highest-leverage missing pieces (delete cascade, reprocess) without touching the pipeline write. |
|---|---|

### 12.5 Useful — async webhook for downstream notification

After every successful pipeline write, the pipeline (or a small
hook in `persistence_helper.py`) fires a `POST` to a configured
URL with `{analysis_id, patient_token, file_token, ai_overall_score}`.
The dashboard backend, or any other system, can subscribe.

This is essentially a poor-man's outbox (§12.3) over HTTP. The
trade-off: simpler to set up (no consumer process, no SQL queue
table), but lossy on subscriber outage (no replay buffer unless
the subscriber implements one).

| Verdict | **Useful for soft notifications**, e.g. "tell the dashboard to refresh its file-list cache". **Not useful** if the downstream consumer must never miss an event — for that, use the outbox (§12.3) or a real queue. |
|---|---|

### 12.6 Not useful — message queue layered on top

Adding Redis Streams / RabbitMQ alongside the direct-DB write to
buffer or audit pipeline runs imports the operational complexity
of §5 without solving a problem the project actually has. The
file-based audit trail (§12.2) gives the same durability story
at zero infrastructure cost; the outbox (§12.3) gives the same
extensibility at one table's worth of cost.

| Verdict | Skip. Re-evaluate only if §11.2 trigger conditions fire. |
|---|---|

### 12.7 Not useful — gRPC alongside HTTP / direct DB

The §12.4 HTTP management API already provides the strongly-
typed, authenticated mutation surface. Adding gRPC on top would
duplicate that surface in a second wire format that nobody on the
team is set up to maintain.

| Verdict | Skip. |
|---|---|

### 12.8 Not useful — CDC replica for analytics

For a ~50-patient dataset, all analytics queries run comfortably
against the operational database. Standing up a second PostgreSQL
instance and a Debezium connector to replicate to it costs
operational time daily for benefits that do not exist at this
scale.

| Verdict | Skip. |
|---|---|

### 12.9 Summary — coexistence recommendation

A minimal, valuable coexistence stack on top of the current
direct-DB write:

```
[AI repo pipeline] ─direct DB write─► [Postgres operational tables]
                  │                          │
                  ├─audit dump─► data/output/<file_token>/  (§12.2)
                  │                          │
                  ├─outbox row ─► pipeline_event_outbox    (§12.3, when first consumer arrives)
                  │                          │
                  └─webhook────► dashboard /api/admin/notify (§12.5, optional soft signal)
                                             │
                  ┌──────────────────────────┘
                  │
[Operator/browser] ─HTTP─► [Dashboard backend management endpoints] (§12.4)
                                             │
                                             ▼
                                  Same direct-DB writes,
                                  but authenticated, audited,
                                  and HTTP-callable
```

None of these patterns replaces the current method. They sit
alongside it, each addressing a specific concrete need:

| Pattern | Need it addresses | Cost |
|---|---|---|
| §12.2 file audit | Disaster recovery, audit trail, snapshots | Already partly exists; formalise with manifest |
| §12.3 outbox | Future downstream subscribers (cache, analytics, notification) | 1 table + 1 worker — only when first consumer appears |
| §12.4 management HTTP API | Operator tasks (delete, reprocess) currently done by hand | A handful of authenticated endpoints |
| §12.5 webhook | Soft notification to dashboard cache | Optional, lossy by design |

The **recommendation in §11 stands** — don't change the primary
write method — but the coexistence patterns above are how this
architecture can evolve incrementally without ever needing the
disruption of §4–§9 wholesale replacements.

---

## 13. References

- `docs/setup/DEPLOYMENT_NATIVE.md` — Phase 1 / Phase 2 independence requirement
- `dev_docs/PATIENT_ID_HASH_DESIGN.md` — depends on this architecture for §11 inventory
- `dev_docs/V37_First_Visit_Persistence_Design.md` — earlier persistence design notes
- `dev_docs/DB_SCHEMA_CLEANUP_TODO.md` — schema-side work that intersects this layer
- AI repo: `main_complete_pipeline_db.py`, `db/persistence_helper.py`
- Dashboard repo: `app/Backend/persistence.py`, `app/Backend/models.py`, `app/Backend/core/settings.py`

---

## 14. Change log

| Date | Author | Change |
|---|---|---|
| 2026-05-28 | (initial) | Initial reference document recording the direct-DB write architecture, scoring it and five alternatives (HTTP REST, message queue, file handoff, background jobs, gRPC, CDC) against ten criteria, and recommending the current approach for the project's present constraints with two concrete improvements (privilege isolation, audit trail) that fit within the current architecture. Added §12 covering coexistence: four patterns that genuinely layer on top of the current write without disturbing it (file audit, outbox, management HTTP API, webhook) and three that do not earn their cost even as add-ons (message queue, gRPC, CDC). |
