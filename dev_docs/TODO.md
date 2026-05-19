# Outstanding Improvement Items (TODO)

> Consolidated list of outstanding items, organized by priority.  
> Target: **Production level**  
> Last updated: 2026-05-08

---

## HIGH-priority schema items (defer-but-must-resolve)

- [ ] **DB schema cleanup roadmap (9 items, LOW/MED/HIGH risk-tiered)** —
      comprehensive audit on 2026-05-08 produced a graded TODO list with
      per-item risk, effort, scope, mitigation, and trigger conditions.
      Includes the `sentence_text` drop below plus dead-column audit,
      auth-table limbo resolution, behavior-table consolidation, identifier
      unification, BLOB-to-object-storage migration, and others. Full plan
      at
      `/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/dev_docs/DB_SCHEMA_CLEANUP_TODO.md`.

- [ ] **Drop `llm_pipeline_intermediate.sentence_text`** — derivable from
      `context` via regex-strip of `<main>` markers; 100 % redundant
      across all rows. Defer-but-must-resolve before the next
      persistence-touching PR ships. Full investigation, impact map, and
      step-by-step action plan in
      `/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/dev_docs/SCHEMA_CLEANUP_LPI_SENTENCE_TEXT.md`.
      _Discovered 2026-05-08._

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

## P0-C — NEW: Transcript Input File Ingestion Hardening

### What is this?
Three related problems with how `pipeline_runner.py` handles xlsx/csv files dropped into the input directory (`AI_physician_patient_communication/data/input/`, mounted at `/app/data/transcripts/` inside the backend container):

1. **No content-change detection.** `persistence.file_already_processed(filename)` keys off `sentence_prediction.patient_id` only. If a user edits `Input_Keystrokes REC 001 (SID 10).xlsx` (corrects a transcription, adds context, etc.) and overwrites the file, the next pipeline run silently SKIPs it because the patient_id is already in the table. The new content never reaches the DB. The user has no signal — no warning, no error, the dashboard just keeps showing stale data.

2. **No watcher / no auto-process trigger.** Pipeline ingestion only runs via `prestart.sh` at container start. Dropping a new file into the input directory does nothing on its own. The user must `docker restart prostatecancer-backend` (which costs ~30-60s of downtime + re-runs the entire AI pipeline for any unprocessed files) or manually `docker exec` into the container to invoke `pipeline_runner.py`. There is no UI, API, or background worker that picks up new files.

3. **Silent patient_id collisions.** `pipeline_runner` extracts patient_id via regex `SID\s*(\d+)` against the filename stem. If two files in the input directory both produce `SID_10` (e.g. `Input_Keystrokes REC 001 (SID 10).xlsx` + `Input_REPLAY (SID 10).xlsx`), the iteration order picks one, processes it, and the second is silently SKIPPED on the next iteration via `file_already_processed`. Whichever file `os.listdir` returns first wins — non-deterministic across filesystems — and the user gets no indication that one of their files was ignored.

### Why is this needed?
Today the only safe workflow for "I edited a transcript, please re-process it" is:
1. SSH-equivalent into the DB
2. `DELETE FROM llm_domain_scoring_and_summary WHERE patient_id='SID_10';`
3. `DELETE FROM sentence_prediction WHERE patient_id='SID_10';`
4. `DELETE FROM transcript_analysis_log WHERE patient_id='SID_10';`
5. `DELETE FROM patient_summary_domain WHERE file LIKE '%SID 10%';`
6. `DELETE FROM patient_summary WHERE file LIKE '%SID 10%';`
7. `docker restart prostatecancer-backend`
8. Wait for the AI pipeline to re-run

That is not a workflow we can hand to a non-engineer collaborator. It also blows up the rest of the unprocessed files in the same restart. Any clinician/researcher who maintains the transcript corpus needs a one-click "this file changed, re-process just this one" path.

### Implementation Plan

#### Phase 1: Content-change detection (Item 59)
- Add `source_file_sha256 VARCHAR(64)` to `transcript_analysis_log` (migration via Alembic).
- In `pipeline_runner.py` for each file:
  - Compute sha256 of the file bytes before checking `file_already_processed`.
  - Replace the patient_id-only check with: "skip iff a row exists for this patient_id AND its `source_file_sha256` matches".
  - When hashes differ: log "content changed for {patient_id}, reprocessing" and run the full pipeline. (Decide: append a new `transcript_analysis_log` row, or delete the stale rows + insert? Cleanest is delete-cascade-then-insert so the dashboard shows one row per patient — but losing audit history. Recommend a new row with `replaces_id` FK to keep history.)
- Backfill existing rows with their current file hash on first run after migration.

#### Phase 2: Auto-process trigger (Item 60)
Two interchangeable approaches — pick one:

- **(a) Background watcher** — `pipeline_runner.py` already has a `--watch` flag (currently unused). Wire it via `worker.enabled=true` in `config.yaml`, run as a sidecar `command` in `docker-compose.yml`. Inside the script, use `watchdog` (Python lib) on `/app/data/transcripts/` and call `process_one(file)` per FS event. Pros: zero UI work. Cons: extra always-on process.

- **(b) On-demand HTTP trigger** — add `POST /api/transcript/process` (admin-only) that accepts a filename or "all unprocessed", invokes the same code path, returns a job ID. Wire a small button into the admin tracking dashboard. Pros: explicit, auditable, no idle process. Cons: someone has to push the button.

  Default recommendation: ship (b) first (small, controllable), add (a) later if it becomes annoying.

#### Phase 3: Collision detection (Item 61)
- At the top of `pipeline_runner.run_pipeline`, before the per-file loop:
  - Build `patient_id -> [filenames]` map by running the existing `extract_patient_id` over every candidate file.
  - For any group with `len(filenames) > 1`: log `WARNING patient_id={pid} matched by {N} files: {sorted(filenames)}` and either (i) refuse to process any of them until the user removes duplicates, or (ii) deterministically pick the lexicographically-latest filename and warn that the others are being ignored. Recommend (i) — silent fail-on-ambiguity caused this entire ticket.

### Files to Create/Modify

```
app/Backend/pipeline_runner.py          (all 3 phases)
app/Backend/persistence.py              (Phase 1: hash check)
app/Backend/models.py                   (Phase 1: source_file_sha256)
app/Backend/migrations/versions/        (Phase 1: new alembic revision)
app/Backend/config.yaml                 (Phase 2a: worker.enabled)
app/Backend/docker-compose.yml          (Phase 2a: sidecar service if chosen)
app/Backend/routes_transcript.py        (Phase 2b: POST /api/transcript/process)
app/Backend/auth/access_control.py      (Phase 2b: admin-only check)
app/Webapp/src/components/AdminTrackingDashboard.tsx  (Phase 2b: trigger button, optional)
```

### Risk & Considerations
- Phase 1 requires deciding the semantics of "reprocess": replace vs append. Replace is simpler for the UI but loses history; append plus a `replaces_id` FK is more correct but needs every "latest analysis" query to JOIN/window.
- Phase 2a (watcher) on macOS Docker uses polling, not native FS events — has ~2s latency and burns CPU. On Linux deployments it uses inotify and is instant. Acceptable trade-off if the watcher is the chosen path.
- Phase 3 is the cheapest of the three (under 30 LOC) and should ship even if 1 and 2 are deferred — silent collisions are the most insidious failure mode of the current system.
- All three phases are non-breaking for existing data; they only change ingestion behavior.

### Items

| # | Item | Phase |
|---|------|-------|
| 59 | Detect content changes in re-uploaded transcript files (sha256 on `transcript_analysis_log`) | 1 |
| 60 | Auto-process new transcripts without backend restart (watcher OR on-demand endpoint) | 2 |
| 61 | Warn on `patient_id` collisions across input files | 3 |

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

## P0-D — NEW: E2E test infrastructure & coverage gaps

**Status:** Planning | **Priority:** High | **Added:** 2026-05-01

### What is this?

The Webapp Playwright e2e suite landed with three deep specs that drive the actual user journeys (`patient-first-visit-deep`, `patient-followup-complete-flow`, `doctor-view-deep`). Running them surfaced three blocking gaps that are tracked here so the next person can pick them up without re-deriving the analysis.

### D-1. CI fixture-seed step

**Symptom.** On a freshly bootstrapped CI Postgres (alembic + database_schema.sql, no pipeline run) every spec that depends on patient data calls `requireFirstFixture` and self-skips with "no patient data in backend". Nightly stays green but verifies infrastructure only — the substantive flow checks never actually run.

**Fix.** Add a step in `nightly-e2e.yml` (both `e2e` and `playwright-e2e` jobs) between `Initialise schema` and `Start uvicorn in background`:

```yaml
- name: Seed fixture data via pipeline
  working-directory: ../AI_physician_patient_communication
  env:
    AZURE_OPENAI_ENDPOINT: ${{ secrets.AZURE_OPENAI_ENDPOINT }}
    AZURE_OPENAI_KEY: ${{ secrets.AZURE_OPENAI_KEY }}
  run: |
    ../Prostate_cancer_consultation_dashboard/.venv/bin/python \
      main_complete_pipeline_db.py \
      --file ../Prostate_cancer_consultation_dashboard/app/Backend/tests/fixtures/sample_transcript.xlsx
```

**Open decisions.**

| Component | Choice |
|---|---|
| Sample transcript .xlsx | Must contain ZERO PHI — synthetic conversation only (~10–20 patient + interviewer turns) committed at `app/Backend/tests/fixtures/sample_transcript.xlsx`. Naming determines fixture id: `Patient_<filename without .xlsx>`. |
| NLP classifier in CI | Three options: (A) publish OCI to GHCR + `services:` container (~632 MB pull, strongest fidelity); (B) mock the `/classify` endpoint with an `httpx`/`uvicorn` shim returning canned responses; (C) ship a JSON sidecar with classifier output and skip the NLP call in fixture mode. Decide based on cost vs fidelity. |
| Pipeline cost | One transcript ≈ 30–90 s + 5 Azure GPT-4o calls per nightly run (≈ $0.10 order). Acceptable. |

**Acceptance.** After this lands, the next nightly run reports 33 passed / 0 skipped; `requireFirstFixture` returns the seeded file's identifiers; specs target real data instead of skipping.

### D-2. V37 patient experimental questions persistence — ✅ DONE 2026-05-07

**Status.** Closed by `feat/v37-first-visit-persistence` (migration 010 + new `PUT/GET /api/patient/first-visit-responses` + `useFirstVisitResponses` hook + per-domain Submit button on V37). Patients' 14 cognition inputs now round-trip through `patient_first_visit_responses`. See `dev_docs/V37_First_Visit_Persistence_Design.md` for the design rationale and `daily_control_logs/2026-05-07_TASKS.md` for the implementation log. The Playwright assertion sketched in this entry's original "Fix outline" remains pending — D-1's CI fixture seed needs to land first.

---

**Original entry (preserved for context).**

**Symptom.** `PatientInitialVisitReportV37.tsx` exposes VAS sliders, "select all that apply" checkboxes, and single-select radios on the first-visit page. They render and accept input, but live in **local React state only** (`useState`). They never POST anywhere. Concrete code references:

- `PatientInitialVisitReportV37.tsx:871` — `setCpRiskWithoutTreatment` etc., pure `useState`
- `PatientInitialVisitReportV37.tsx:1149,1235,1592,1854,2120` — `onValueChange={(v) => setX(v[0])}` for each Radix Slider, no fetch
- The 1–5 NIH PROMIS rating IS persisted via `handleRatingChange` → `updateSingleClassScore` → PUT `/api/patient/scoring`, but the rating UI itself is currently commented out at V37:2317-2360.

**Why this blocks e2e.** `patient-first-visit-deep.spec.ts` walks the full flow — opens every domain card, drags every VAS slider, ticks every checkbox, picks every radio — and the test passes. But the assertion at the end can ONLY check tracking events in `patient_first_behavior` (`page_view`, `topic_open`, `topic_close`). The patient's actual answers never reach the backend, so we cannot verify "the patient's risk perception score was saved" or "the patient's selected concerns were stored". `patient-followup-complete-flow` and `doctor-view-deep` both have proper round-trip checks; patient first-visit is the odd-one-out.

**Fix outline.**

1. Schema decision — three reasonable options:
   - Extend `patient_summary_domain` with a JSONB column for free-form per-domain answers (lightest)
   - New table `patient_experimental_response` with FK to `patient_summary_domain` (cleanest if many fields)
   - Reuse `patient_summary_domain.patient_response` (currently single text — could become structured JSONB)
2. Backend endpoint — likely `PUT /api/patient/experimental-responses` or extend the existing `PUT /api/patient/responses` shape.
3. Frontend wire-up — replace local `useState` for VAS / checkbox / radio with a `usePatientData` variant that PUTs on change (or on a "Save" button if we want fewer round-trips).
4. Migration — Alembic revision adding the column or table. Reversible (`down()`).
5. Update `patient-first-visit-deep.spec.ts` — once the backend persists, add a "backend persisted patient responses" assertion block GETing the new endpoint and comparing every dragged slider value, every ticked checkbox, every selected radio.

**Out of scope.** Doctor "Try & Score" rewrites are intentionally NOT persisted (V41Timothy.tsx:2800 — "Score-only handler: no DB save, just instant feedback"). Don't accidentally extend this task to that flow.

### D-3. Backend e2e coverage gaps

**Symptom.** `app/Backend/tests/e2e/test_full_flow.py` (24 tests) is endpoint-smoke-level — each test calls one route and asserts status 200 + a couple of response keys. Twelve substantive areas remain unverified, grouped by tier so the work can be tackled in priority order.

#### Tier 1 — Security & data-integrity (do first)

1. **Per-patient ACL.** `patient_access` grants per-user × per-patient read access. No e2e verifies user A is denied user B's data — silent regression risk. Cover: A reads own (200), A reads B's (403), ACL row added → access mid-session, doctor role bypass behavior.
2. **Concurrent submission.** `survey_submission_log`, `doctor_rewrite_log`, `patient_first_behavior` all accept POSTs the frontend can fire near-simultaneously. Use `asyncio.gather` to submit N concurrent identical-key writes; assert exactly one survives (or N if duplicates allowed by design — confirm intent).
3. **Error paths.** None of the 24 tests check 4xx behavior. Add: malformed JSON, missing required fields, FK violation, expired JWT, malformed API key, missing X-API-Key on protected route, body-too-large boundary.

#### Tier 2 — Coverage expansion (medium-term)

4. **Pipeline upstream e2e.** Suite reads pipeline OUTPUT but never drives it. Upload sample transcript → poll status → wait for AI scoring → assert all 17 tables populated correctly. Mark with `@pytest.mark.pipeline_e2e` so it can be opted in (~30–90 s per run).
5. **Migration round-trip.** `alembic upgrade head` on empty DB → `downgrade base` (no orphan FKs) → `upgrade head` again (idempotent). Verify each direction for migrations 001–010.
6. **Behavior tracking aggregate correctness.** `GET /api/track/<area>/aggregate` — verify counts match POSTed events, per-domain breakdown correct, time-bucket aggregates handle TZ correctly, empty session returns sensible empty (not 500).

#### Tier 3 — Operational quality (longer-term)

7. **Pagination.** Doctor/patient list endpoints' skip / limit / sort. Boundary: skip=0, skip=N, limit=1, limit=max, sort stable across pages, `total` count accurate.
8. **Redis cache.** First call → NLP hit + Redis store with TTL. Second call → cache hit, no NLP container call. After TTL → cache miss + fresh fetch. Cache invalidation on transcript update.
9. **REDCap field mapping depth.** Current `test_redcap_import_sample` only asserts HTTP 200. Strengthen: POST a survey, GET the actual REDCap record, verify each field mapped per `Frontend_REDCap_Field_Mapping.md`. Boundary cases: long text, special chars, missing optional fields.
10. **Auth mode switching under load.** N requests under `AUTH_MODE=api_key` → all pass. Live-switch to `jwt` → API key requests now 401, JWT pass. Switch back → original key works again. Verifies the auth registry's reload path.
11. **Pipeline partial failure.** When NLP succeeds but AI fails, `transcript_analysis_log.processed` should reflect "partial" or "ai_failed", not the success state. Mock Azure to 500 and assert the row state.
12. **Schema drift detection.** Diff `pg_dump --schema-only` between (a) database_schema.sql baseline + alembic upgrade head, and (b) alembic upgrade head from empty DB. These should be identical; fail if anything differs.

**Acceptance criteria.** Each area lands as a separate test class or file under `app/Backend/tests/e2e/`. New pytest markers: `pipeline_e2e`, `auth_acl`, `redcap_deep`, `migration_roundtrip` so suites can run subsets. Tier 1 tests run in the regular `pytest -m e2e` nightly. Tier 2 + 3 in their own scheduled jobs (e.g. weekly) so per-night cost stays bounded.

**Out of scope.** Webapp Playwright e2e (covered by D-1). This task is strictly backend HTTP/DB layer.

---

## P0-E — NEW: ML backend hardening (clinical AI pipeline)

**Status:** Planning | **Priority:** High | **Added:** 2026-05-01

### What is this?

The AI pipeline (`AI_physician_patient_communication/ai_pipeline/`) and its backend integration (`app/Backend/ai_pipeline_service.py`) drive every patient-visible summary and every doctor-visible score. A wrong AI output here is not a UX glitch — it's a clinical safety problem. Today's pipeline ships without the observability, validation, and audit machinery that a production-grade clinical ML system needs. Eight areas to harden, grouped by risk tier.

### Tier 1 — Clinical safety (do first)

#### E-1. Output schema validation
The pipeline calls Azure GPT-4o and parses responses by string extraction. A malformed response doesn't fail closed. **Fix:** wrap every Azure call's response in a Pydantic model that asserts the shape; on parse failure, log + skip persistence rather than write garbage to `llm_domain_scoring_and_summary`.

#### E-2. Hallucination detection
GPT-4o extracts risk numbers (e.g. "12% at 15 years") in the extraction step. Nothing currently verifies those numbers actually appear in the source transcript. **Fix:** post-extraction step that checks every numeric value in the AI output against a regex over the source — flag any AI-extracted number that doesn't match anything in the input.

#### E-3. PHI protection at the Azure boundary
Patient transcripts go to Azure GPT-4o. Need to verify (a) the Azure deployment has a signed BAA, (b) the data residency is acceptable, (c) audit logs at the Azure side are retained per HIPAA. **Fix:** documentation + automated check that `AZURE_OPENAI_ENDPOINT` points at the BAA-covered tenant.

### Tier 2 — Observability & audit (medium-term)

#### E-4. Per-call audit logging
Every Azure call should log: prompt id + version, input transcript id, response, latency, token counts, cost, timestamp, user/role. **Fix:** new table `ai_pipeline_call_log` written by a wrapper around the Azure client. Append-only. Retained per compliance policy.

#### E-5. Cost & latency observability
Azure spend per consultation is currently invisible. **Fix:** the audit table from E-4 already has the data; add a daily summary endpoint + dashboard widget showing per-domain p50/p95/p99 latency and rolling-30d spend. Alert when a single consultation costs >2× the median.

#### E-6. Prompt versioning + golden test set
Prompts at `ai_pipeline/prompts/` can change at any time, with no regression signal. **Fix:** every prompt gets a version string baked in; commit a `tests/golden/` directory with N input transcripts and their expected AI outputs; CI runs the pipeline against these and fails if outputs drift beyond a tolerance.

### Tier 3 — Operational resilience (longer-term)

#### E-7. Fallback strategy
When Azure is unreachable or the NLP container is down, the user sees an unhelpful error. **Fix:** documented and tested behavior — degrade gracefully (e.g. show "AI summary temporarily unavailable, retry later"), never block the patient view from rendering.

#### E-8. NLP classifier model versioning + drift detection
The R + RandomForest classifier at `nlp-classifiers/` has no version tracking and no monitoring of production prediction distribution vs training. **Fix:** every classification response includes a `model_version` field; periodic job compares production class probabilities against training-set baseline and flags drift > N%.

### Acceptance criteria

- Tier 1 items land before any new clinical-facing feature ships.
- Pydantic schema for every Azure response in `ai_pipeline_service.py`.
- `ai_pipeline_call_log` migration deployed; every Azure call written to it.
- Golden test set with ≥ 5 transcripts in CI; prompt change → diff visible in PR.
- Fallback behavior documented in `docs/operations/AI_PIPELINE_OUTAGE.md`.

### Out of scope

- AI Pipeline backend integration itself (covered by P0-A).
- E2E test coverage of these areas (covered by P0-D / D-3 backend e2e tier 2 + 3 items).

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
