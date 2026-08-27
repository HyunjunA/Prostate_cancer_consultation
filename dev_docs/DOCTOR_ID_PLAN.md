# Plan: Introduce Doctor ID (`<patient_id>_<doctor_id>_<date>.csv`)

Status: **approved, not yet implemented.** Implementation proceeds in phases A → B → C.

## Context

Today the dashboard assumes **all patients belong to one doctor** — no doctor concept exists in the DB, and every doctor/patient endpoint returns *all* patients globally. We need to support **multiple doctors**: each transcript now arrives named `<patient_id>_<doctor_id>_<date>.csv` (assumed given — the de-id step upstream already produces this), and the dashboard must scope data per doctor.

**Assumption:** input files are already `<patient_id>_<doctor_id>_<date>.csv`. This plan makes the **pipeline parse `doctor_id` from the filename, store it, and scope the dashboard by it**. It does NOT assign doctors or generate the filename.

**Scope (MVP):** doctor scoping is done via a **query-string `doctor_id` filter** (URL `?doctorid=<id>` → that doctor's data only). No login / ACL — matches the intent of "read doctor ID from query string" and "doctor 1/2/3 links". Full AuthUser↔doctor ACL is explicitly **deferred** (see Follow-on).

## Key facts (current reality)

- **Filename → patient_id**: `AI_physician_patient_communication/utils/file_manager.py::extract_patient_id` (line 29). Its first regex `(.+)_\d{8}$` is **greedy** → on the new 3-part name it returns `<patient>_<doctor>` (WRONG). Must fix + add `extract_doctor_id`.
- **Pipeline**: `main_complete_pipeline_db.py` (line 166 `extract_patient_id`, line 213 `persist_pipeline_results(...)`). A separate `doctor_speaker` (transcript speaker, from `identify_doctor_speaker`) already exists and is stored in `sentence_prediction.speaker` — this is **NOT** the new `doctor_id`; leave it alone.
- **Persistence**: `db/persistence_helper.py::persist_pipeline_results`/`_save_nlp_results` (passes `patient_speaker=f"Patient_{filepath.stem}"`) → dashboard `app/Backend/persistence.py::save_all` (line 67) writes `TranscriptAnalysisLog(patient_id, source_filename, ...)` (line 117). No `doctor_id` anywhere.
- **Backend doctor endpoints** (`app/Backend/routes_doctor.py`): `/files` (452), `/scores/average` (525, builds `latest_analysis` subquery from `TranscriptAnalysisLog`, line 564), `/scores/trajectory` (849), `/scores/summary/{file}/{speaker}` (678). **No doctor filtering.** `_designated_treatment_filter` at 819.
- **Patient list**: `app/Backend/routes_patient.py::get_patient_files` (line 510) = `select(PatientSummary.file).distinct()` — returns all.
- **Frontend** (`app/Webapp/src/app/page.tsx`): already reads `doctorid` query param + has `useDoctorId` store; `?doctorid=auto` just picks the first transcript speaker. Patient-list fetch `/api/backend/patient/files` (~line 326) is **not** doctor-scoped. Physician label derived from filename in `PhysicianReportsModifiedV41Timothy.tsx` ~line 4701 via `replace(/_\d{8}$/,"")`.
- **Alembic head** = `017_recording_area_split`. Column-add template: migration `016` (`op.add_column` + CHECK).

## Design: one authoritative column

Add `doctor_id` to **`transcript_analysis_log` only** (the run header). Every doctor/patient query already joins or can join this table by `source_filename`, so a single column + joins covers all scoping — no denormalization drift. `doctor_id` is **nullable** (old 2-part files and non-doctor inputs → NULL → still visible when no filter is applied = backward compatible).

## Re-verification notes (checked against live code)

- **Backend `speaker` never filters data** — `/scores/trajectory` only logs `speaker` and echoes `speaker_filter`; it computes over ALL files (routes_doctor.py:864, 909-910). `/scores/average` uses `speaker` only for the returned display value (`speaker_val`, :601-610, :637), not to filter `rows`. So adding a **new** `doctor_id` filter is safe and does not collide with existing speaker logic. Both average and trajectory already build `latest_analysis` from `TranscriptAnalysisLog` (:564, :883) → the `doctor_id` WHERE goes in that subquery.
- **⚠️ `doctorid` URL param is overloaded** — today the frontend treats `?doctorid=` as the *transcript speaker* (`selectedSpeaker`, used for `/doctor/sentences/{file}/{speaker}`); `?doctorid=auto` (the only form actually linked) auto-detects the per-file speaker. This plan repurposes `doctorid` as the new *physician identity* for scoping. **Resolution:** `doctorid` becomes the `doctor_id` scoping key — `auto`/absent = all doctors (no filter, current behavior preserved), a concrete value = filter that doctor. The transcript `speaker` is **always auto-detected per file** from `/doctor/files` `file_details` (already the code path); the latent, unused manual `?doctorid=<speaker>` override is dropped.
- **Token constraint** — the 3-part parse assumes `patient_id` and `doctor_id` contain **no `_`** (true for the numeric/Base32 de-id tokens). Document this where the de-id filename is produced.

## Changes

### A. Pipeline — parse & carry `doctor_id` (AI repo)

1. **`utils/file_manager.py`**
   - Rewrite `extract_patient_id` to try patterns in order: **3-part** `^(.+)_(.+)_\d{8}$` → `group(1)` (patient); else existing **2-part** `(.+)_\d{8}$`; else `processed_transcripts_`; else `SID`; else fallback. (Tokens are hashes/Base32 with no `_`, so the split is unambiguous.)
   - Add `extract_doctor_id(filepath) -> Optional[str]`: returns `group(2)` only when the 3-part pattern matches, else `None`.
2. **`main_complete_pipeline_db.py`** (line 166/213): add `doctor_id = extract_doctor_id(filepath)`; pass `doctor_id=doctor_id` into `persist_pipeline_results(...)`.
3. **`db/persistence_helper.py`**: thread `doctor_id` through `persist_pipeline_results` → `_save_nlp_results` → `save_all(doctor_id=...)`.

### B. Backend — store & filter (dashboard repo)

4. **`app/Backend/models.py`** `TranscriptAnalysisLog`: add `doctor_id = Column(String(255), nullable=True, index=True)`.
5. **`app/Backend/persistence.py`** `save_all`: add `doctor_id: Optional[str] = None` param; set it on the `TranscriptAnalysisLog(...)` insert (line 117).
6. **New Alembic migration `018_add_doctor_id`** (down_revision `017_recording_area_split`): `op.add_column("transcript_analysis_log", sa.Column("doctor_id", sa.String(255), nullable=True))` + index; `downgrade` drops both. Template = migration `016`.
7. **`app/Backend/routes_doctor.py`** — add optional `doctor_id: Optional[str] = None` query param and apply `WHERE transcript_analysis_log.doctor_id == doctor_id` when provided:
   - `/files` (472 join): filter on `TranscriptAnalysisLog.doctor_id`.
   - `/scores/average` (564 `latest_analysis` subquery): add `.where(TranscriptAnalysisLog.doctor_id == doctor_id)` inside the subquery so only that doctor's files aggregate.
   - `/scores/trajectory`: same subquery filter.
   - `/scores/summary/{file}/{speaker}`: file-specific (doctor implied) — no change needed.
8. **`app/Backend/routes_patient.py`** `/api/patient/files`: add `doctor_id` param; when set, join `PatientSummary.file == TranscriptAnalysisLog.source_filename` and filter `TranscriptAnalysisLog.doctor_id`, keep `.distinct()`.

### C. Frontend — pass & scope by `doctor_id` (dashboard webapp)

Treat the existing `doctorid` param as the **doctor_id scoping key** (see re-verification note): `auto`/absent → no filter (all doctors, unchanged); a value → that doctor only.

9. **`src/app/page.tsx`**: when `doctorid` is present and not `auto`, append `?doctor_id=<doctorid>` to the patient-list fetch (`/api/backend/patient/files`) so the landing/selection list is doctor-scoped.
10. **`src/hooks/useDoctorData.tsx` + `PhysicianReportsModifiedV41Timothy.tsx`**: pass the `doctor_id` (from `doctorid`, when not `auto`) to `/doctor/files`, `/scores/average`, `/scores/trajectory`. **Stop using `doctorid` as `selectedSpeaker`** — always auto-detect the per-file speaker from `/doctor/files` `file_details` (the `defaultSpeaker = file_details[0].speaker` path), so a `doctorid` value like `DR2` is never mistaken for a transcript speaker.
11. **Patient label fix** — strip both the 3-part `_<doctor>_<date>` and legacy 2-part `_<date>` suffixes so the displayed id is just `<patient>`. Apply the same chain in `PhysicianReportsModifiedV41Timothy.tsx` (~4701) and `page.tsx` (~465): keep the `SID-<n>` case, else `name.replace(/\.[^.]+$/,"").replace(/_[^_]+_\d{8}$/,"").replace(/_\d{8}$/,"")` (3-part strip first, then legacy 2-part). E.g. `63538_DR2_06262026`→`63538`, legacy `63538_06262026`→`63538`.

## Backward compatibility

- Old files (`<hash>_<date>.csv`, already in the DB) → 3-part regex fails → parse unchanged, `doctor_id` NULL. With **no** `?doctorid` filter they still appear; only when a doctor filter is applied are NULL rows excluded. No data migration required.

## Out of scope / follow-on (do NOT build now)

- **Query-string minimization** (daily-log task 4 — a collaborator's "otherwise super dirty" note). Today the URL passes `fileid` (full filename, e.g. `63538_06262026.csv`) **plus** `patid` (`Patient_<stem>`, a duplicate of fileid) plus `visit`/`mode` — redundant. The ask: **keep only patient ID + date (+ doctor_id), drop the full filename / `Patient_` prefix**, and reconstruct the filename backend/frontend-side. Larger frontend refactor touching the patient-view routing contract (`fileid`/`patid` are read across first/followup/combined views + `handlePatientSelect`). **Decision: keep as a SEPARATE follow-on phase** (per the repository convention "one feature at a time — don't refactor + add a feature simultaneously"); do it after Doctor ID scoping ships.
- **Link (URL) generation** (daily-log task 4) — produce shareable per-row URLs (e.g. into the mapping CSV) using the existing app URL shapes:
  - Patient first-visit (report) link — `/?fileid=<file>&patid=Patient_<stem>&visit=first`
  - Patient follow-up (survey) link — `/?fileid=<file>&patid=Patient_<stem>&visit=followup` (survey add `&mode=survey`)
  - Doctor link — simple, `/?doctorid=doctor1` / `doctor2` / `doctor3` (uses the new `doctor_id` scoping from this plan).
  (Depends on this plan's `doctor_id` scoping shipping first; the doctor-link shape is enabled by it. Simplifies once query-string minimization lands.)
- **Mapping CSV** (real name · SID · hashed ID · doctor ID · hashed doctor ID · the three links above) and **doctor-ID hashing** — produced upstream at the de-id step, not in this consume-side plan.
- **Login / per-doctor ACL** (AuthUser↔doctor, `DoctorAccess` mirroring `PatientAccess`) — deferred hardening.

## Verification

1. **Parse unit test**: `extract_patient_id`/`extract_doctor_id` on `63538_DR2_06262026.csv` → (`63538`, `DR2`); on legacy `63538_06262026.csv` → (`63538`, `None`); on `SID 13.xlsx` → (`SID_13`, `None`).
2. **Alembic**: `alembic upgrade head` (→ 018) then `downgrade -1` cleanly on the native DB.
3. **End-to-end**: place `63538_DR2_06262026.csv` + `13511_DR1_06262026.csv` in `data/input`; run `bash scripts/run-pipeline-watch.sh --dir data/input` (REMOTE); confirm `transcript_analysis_log.doctor_id` = DR2/DR1 (`app/Backend/scripts/verify_db.py` or psql).
4. **Endpoint scoping**: `GET /api/doctor/files?doctor_id=DR2` and `?doctor_id=DR1` return disjoint file sets; `/scores/average?doctor_id=DR2` and `/scores/trajectory?doctor_id=DR2` only that doctor; `/api/patient/files?doctor_id=DR2` scoped; no param → all (incl. legacy NULL).
5. **Frontend**: `/?doctorid=DR2` shows only DR2 patients on the physician dashboard and landing list; patient labels show `<patient>` without the doctor/date suffix.
6. **Regression**: `cd app/Backend && pytest tests/test_doctor_endpoints.py -m "not e2e"` passes; authoritative webapp typecheck (`docker build --target builder ... && npx tsc --noEmit`) shows no new errors.
