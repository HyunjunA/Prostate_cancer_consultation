# Database Schema Cleanup — TODO

> **Source:** Comprehensive 19-table review on 2026-05-08 (strengths/weaknesses,
> redundancy mapping, identifier consistency audit, BLOB/storage assessment).
> **Overall grade at time of audit:** B+ ("production-aware research code").
> **Goal of this list:** lift the schema from B+ to A− by addressing accumulated
> design debt without introducing regressions.

Each item below carries a risk tag, a rough effort estimate, the exact scope
(files/tables touched), and the trigger condition under which it should be
picked up. **Do NOT bundle items with different risk tags into the same PR.**

---

## Standing safety rules — apply to every cleanup PR

- One concern per PR. Never mix redundancy cleanup with identifier-rename in
  the same PR.
- Every Alembic migration must implement a working `downgrade()`, verified
  by running `alembic downgrade -1 && alembic upgrade head` once before
  merge.
- Run `pytest -m "not e2e"` to a clean pass before opening the PR. Add new
  tests for any behaviour that was previously only covered implicitly.
- Manual smoke test before merge: pipeline run → patient first-visit page →
  patient follow-up survey submit → REDCap mirror confirmed → doctor view
  loads.
- For HIGH-risk items (G/H/I): take a `pg_dump` of the native postgres
  database before applying the migration. Document the exact rollback
  commands in the PR description.
- Confirm no real-collaborator names (per repo CLAUDE.md) leak into new
  files.

---

## 🟢 LOW RISK — pickable in a single sprint

### A. Drop `llm_pipeline_intermediate.sentence_text`

- **Risk:** Negligible (1 writer, 1 diagnostic-only reader).
- **Effort:** ~30 minutes.
- **Scope:** New Alembic migration · `app/Backend/ai_pipeline_service.py:212`
  · `app/Backend/inspect_pipeline_run.py:259` · ORM column at
  `app/Backend/models.py:576`.
- **Reference:** Full investigation, impact map, and step-by-step action
  plan in
  `/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/dev_docs/SCHEMA_CLEANUP_LPI_SENTENCE_TEXT.md`.
- **Why:** 100 % of rows derive `sentence_text` from `context` by stripping
  `<main>` markers. Drift hazard, and a misleading column for future readers.
- **Trigger:** First persistence-touching PR after this list is published.

- [ ] Schedule and ship.

### B. Audit and drop dead columns

Three columns are suspected unused. Verify with repo-wide grep for
non-comment, non-migration references. Drop each whose grep returns zero.

- `transcript_analysis_log.model_results` (jsonb, all rows NULL today)
- `patient_summary_domain.patient_scoring` (int, no apparent writer)
- `patient_summary_domain.patient_response` (text, no apparent writer)

- **Risk:** Low **after** verification; HIGH if dropped without verification.
- **Effort:** 1–2 hours total (most of it is verification).
- **Scope:** New Alembic migration · ORM columns in `app/Backend/models.py`.
- **Verification command:**
  ```bash
  grep -rEn "model_results|patient_scoring|patient_response" \
       app/Backend app/Webapp/src --include='*.py' --include='*.ts' \
       --include='*.tsx' \
    | grep -v __pycache__ | grep -v '#' | grep -v '//'
  ```
  For each column: grep result must be **empty** (or confined to the ORM
  definition itself) before dropping.
- **Why:** Misleading data model; future contributors waste time wondering
  what these mean.
- **Trigger:** Any schema-cleanup PR. Can be split per column if convenient.

- [ ] Verify `model_results` unused; if yes, drop.
- [ ] Verify `patient_scoring` unused; if yes, drop.
- [ ] Verify `patient_response` unused; if yes, drop.

### C. Resolve `llm_pipeline_intermediate.step` enum half-implementation

The `step` column has a CHECK constraint allowing only `'extraction'`. NLP's
sibling table allows four values. Decide:

- Option 1 (recommended if we never plan to persist scoring/filtering/select
  /reformat snapshots separately): drop the column.
- Option 2 (if future steps will be persisted): expand the CHECK to allow
  the full step list and update the writer to emit them.

- **Risk:** Negligible.
- **Effort:** ~30 minutes.
- **Scope:** New Alembic migration · `app/Backend/ai_pipeline_service.py`
  (writer) · `app/Backend/models.py:574` (ORM column).
- **Trigger:** Same PR as A (both touch `llm_pipeline_intermediate`).

- [ ] Decide between Option 1 and Option 2.
- [ ] Apply.

### D. Add column-level docstrings to non-obvious columns

The repo has 15 ORM classes and ~151 columns; only ~27 % of columns carry
any inline comment. SQLAlchemy supports `Column(..., comment="…")` which
PostgreSQL stores as a real `COMMENT ON COLUMN` and which schema-inspection
tools surface automatically.

- **Risk:** Zero (no functional change).
- **Effort:** 2–3 hours, distributable across multiple PRs.
- **Scope:** `app/Backend/models.py` only (and a single Alembic migration to
  emit `op.execute("COMMENT ON COLUMN …")` for the columns receiving new
  comments).
- **Priority targets** — columns whose meaning is non-obvious:
  - `transcript_analysis_log.processed`, `.processed_at`, `.ai_overall_score`
  - `patient_summary` (the entire `(file, speaker)` PK rationale)
  - `patient_summary_domain.display_order`
  - `survey_submission_log.redcap_synced`, `.redcap_record_id`,
    `.redcap_error`
  - `nlp_pipeline_intermediate.step`, `.payload`
  - `llm_domain_scoring_and_summary.reformat_sentence`
- **Why:** New contributors and analysts read the schema before the code.
  Cheap, lasting payoff.
- **Trigger:** Any time. Excellent low-context background work.

- [ ] Cover the priority targets above.
- [ ] Sweep remaining columns whose name does not stand alone.

---

## 🟡 MEDIUM RISK — separate PR, careful scoping

### E. Cleanup `llm_domain_scoring_and_summary` denormalization (R3)

Five columns on this table are copies of fields already on
`llm_pipeline_intermediate` for the row that survived filter and was
selected:

- `source_sentence` ← can be derived from `llm_pipeline_intermediate.context`
  (via the same join used for the rest)
- `source_context` ← redundant with `llm_pipeline_intermediate.context`
- `score_explanation` ← redundant with `llm_pipeline_intermediate.score_explanation`
- `extracted_estimate` ← redundant with `llm_pipeline_intermediate.estimate`
- `treatment` ← redundant with `llm_pipeline_intermediate.treatment`

The unique value on this table is `reformat_sentence` (AI step 5 output —
nowhere else).

- **Risk:** Medium — the doctor-view query path reads several of these
  columns; replacing them with a JOIN changes query plans.
- **Effort:** 3–5 hours including test additions and EXPLAIN ANALYZE
  measurement for the doctor view query.
- **Scope:** Alembic migration to drop columns · ORM column removal in
  `app/Backend/models.py` · query rewrites in `app/Backend/routes_doctor.py`
  (5 references to `LLMDomainScoringAndSummary` per audit).
- **Mitigation:** Before-and-after EXPLAIN ANALYZE on the doctor patient
  query. If the new JOIN is materially slower, keep `reformat_sentence` and
  one or two hot fields, drop the rest.
- **Trigger:** Schedule after A, B, C, D land and the team is comfortable
  with the cleanup cadence.

- [ ] EXPLAIN ANALYZE the current doctor view query.
- [ ] Implement migration + ORM + query rewrites.
- [ ] EXPLAIN ANALYZE the new query path.
- [ ] If acceptable, ship. Otherwise revert to partial cleanup.

### F. Resolve auth-table limbo

Three tables exist with zero rows but the access-control code still calls
`check_patient_access()` from ten route handlers (with a superuser bypass
that always fires today). Per project memory the login feature was dropped
on 2026-05-07. Two clean end-states:

- **Removal path** (recommended given the dropped decision):
  - Drop `auth_user`, `auth_api_key`, `patient_access`.
  - Remove `check_patient_access()` calls from `routes_patient.py`,
    `routes_doctor.py`, `routes_transcript.py`.
  - Delete `app/Backend/auth/` module if no other dependents.
- **Activation path** (only if the dropped decision is reversed):
  - Audit the superuser bypass and the API key validation flow.
  - Document the multi-key auth mode end-to-end.

- **Risk:** Medium — touches every patient-facing endpoint.
- **Effort:** 2–4 hours for removal · ~1 week for activation.
- **Scope (removal):** Alembic migration · `app/Backend/auth/` deletion ·
  `routes_patient.py` (5 call sites) · `routes_doctor.py` (1) ·
  `routes_transcript.py` (4) · `init_db.py` (auth import).
- **Trigger:** Once the dropped-feature decision is confirmed durable.

- [ ] Confirm the dropped-feature decision is final.
- [ ] If yes, take the removal path.

---

## 🔴 HIGH RISK — separate sprint, with backups

### G. Consolidate three behavior-tracking tables (R4)

`patient_first_behavior`, `patient_followup_survey`, and `doctor_behavior`
share near-identical structure (session_id, file, speaker, event_type,
metadata, client_timestamp, device_type). The `session_recording.area` enum
already classifies records as `patient_first | patient_followup | doctor |
unknown`, suggesting the original design intended consolidation.

- **Risk:** High — every tracking writer + every admin-tracking reader is
  affected.
- **Effort:** 1–2 days including data migration.
- **Scope:**
  - New `behavior_tracking` table with `area` enum.
  - Data migration from the three legacy tables (preserves history).
  - Writer rewrites: `routes_track_patient_first.py`,
    `routes_track_patient_followup.py`, `routes_track_doctor.py`.
  - Reader rewrites: `AdminTrackingPatientFollowup.tsx` plus any other
    admin views.
  - Drop the three legacy tables (after migration validated).
- **Mitigation:** Phase 1 — write to both old and new tables with a feature
  flag. Phase 2 — flip readers to new table. Phase 3 — stop writing to old
  tables and drop after a quiet period.
- **Trigger:** After E and F. Not before the next stable release window.

- [ ] Design `behavior_tracking` schema (event_type union).
- [ ] Phase 1: dual-write.
- [ ] Phase 2: readers cut over.
- [ ] Phase 3: drop legacy tables.

### H. Unify patient identifier scheme

Pipeline tables key on `patient_id varchar(255)` (free-form string). Response
tables key on the composite `(file, speaker)` referenced into
`patient_summary`. The two schemes are semantically tied (the patient_id
string is built from the file/speaker pair) but never reconciled in DB FKs.

- **Risk:** High — touches almost every read path.
- **Effort:** 2–3 days.
- **Scope:** Decide on the canonical scheme, then update every table and
  every query. Most likely outcome: `patient_summary.id` (synthetic int PK)
  added as the canonical anchor, with both `(file, speaker)` and
  `patient_id` becoming non-PK identifiers.
- **Mitigation:** Schema-cleanup trade-off — the safest approach is to keep
  both, add the new int PK, and migrate FKs gradually. The naming-only
  cleanup (rename `patient_id` everywhere to a single canonical) is simpler
  but more invasive.
- **Trigger:** Only after the codebase is otherwise in a steady state.

- [ ] Architecture decision: synthetic int PK vs alias.
- [ ] Implement the chosen path with phased migration.

### I. Move large BLOBs to object storage

`transcript_analysis_log.xlsx_data` (raw input file binary) and
`session_recording.recording_data` (rrweb event stream) are stored as
PostgreSQL `bytea`. Current footprint is small (105 KB / 1.5 MB respectively),
but each new patient adds blobs that bloat backups and replication.

- **Risk:** Highest of the cleanup items because it requires new
  infrastructure (MinIO / S3 bucket, IAM, network policy) plus PHI handling
  review.
- **Effort:** ~1 week including infra setup.
- **Scope:** Object-storage provisioning · Alembic migration to add
  `xlsx_url`, `recording_url` columns and (later) drop bytea columns ·
  Backend write path changes in `routes_transcript.py` and the session
  recorder · Backend read path changes wherever the blobs are loaded.
- **Mitigation:** Dual-write phase (file goes to both bytea AND object
  storage), then read-from-object-storage phase, then bytea drop. Same
  three-phase pattern as G.
- **Trigger:** Hard deadline = before patient count reaches 50. Soft
  deadline = next quarterly infrastructure window.

- [ ] Provision object storage (MinIO local, S3 staging).
- [ ] Phase 1: dual-write.
- [ ] Phase 2: cut reads to object storage.
- [ ] Phase 3: drop bytea columns.

---

## Tracking

When picking up an item, add a one-line note here with the PR / branch name
so future audits can see what landed. Example:
- `[2026-05-15] A landed in PR #14 (cleanup/lpi-sentence-text)`.

(empty so far)
