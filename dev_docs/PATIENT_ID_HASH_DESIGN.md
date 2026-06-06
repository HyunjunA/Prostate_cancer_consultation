# Patient ID Hashing — Design Proposal

> **Status:** Draft (pre-discussion). Not yet approved.
> **Created:** 2026-05-28
> **Owner:** TBD (assign at design review)
> **Related memos:**
> - `daily_control_logs/2026-05-19_webapp_feedback.md` §3 — original task entry
> - `daily_control_logs/2026-05-19_webapp_feedback_KR.md` §3 — KR mirror
> - `../AI_physician_patient_communication/daily_control_logs/2026-05-14_05-15_control_kr.txt:70-71` — earliest design hint
> - `docs/security/PHI_COMPLIANCE.md` — HIPAA / PHI constraints this design must satisfy
> - `dev_docs/TODO.md` item 35 — "Log PII masking" (related sub-task)
> - `dev_docs/DB_SCHEMA_CLEANUP_TODO.md` §H — "Unify patient identifier scheme" (orthogonal concern; coordinate but do not couple)

---

## 1. Problem

The application uses **plaintext, predictable patient identifiers**
(`SID_10`, `SID_14`, `SID_15`, …) and **plaintext filenames containing
those identifiers** (`Input_Keystrokes REC 001 (SID 14).xlsx`) across
ten distinct surfaces — including the browser URL, server-side route
paths, the database, the filesystem, and recent legacy log calls.

The original task in the 2026-05-19 webapp-feedback memo framed this
as "Patient ID randomization / hash functionality" but only covered
**three of those ten surfaces** (the bare `patient_id` value in URL,
screen display, and tracking logs). Implementing only the original
scope would leave PHI flowing through the remaining seven surfaces
unchanged — in particular the `fileid` URL parameter, which carries
the original filename verbatim and therefore continues to expose the
SID even after `patient_id` itself is hashed.

This document inventories the full exposure surface, surfaces
trade-offs across three design axes, and proposes a single coherent
approach with a phased migration so the system can be brought into
PHI compliance without breaking the pipeline contract.

---

## 2. Current state — exposure inventory

The table below lists every place an identifier (the SID itself, or
the filename that embeds the SID) appears in plaintext today.
Coordinates are repository-relative.

| # | Surface | Concrete value (example for SID 14) | Where | Severity |
|---|---|---|---|---|
| 1 | Database column `transcript_analysis_log.patient_id` | `SID_14` | `app/Backend/models.py` | High — also used as cross-table FK target via `analysis_id` and as a join key in 8 pipeline tables |
| 2 | URL query parameter `fileid` | `Input_Keystrokes REC001 (SID 14).xlsx` | `app/Webapp/src/app/page.tsx:178`, every link into the patient view | High — visible in browser history, referer, screenshots, analytics |
| 3 | URL query parameter `patid` | `Patient_Input_Keystrokes REC001 (SID 14)` | `app/Webapp/src/app/page.tsx:306` (synthesised as `Patient_${stem}`) | High — same channels as #2; the SID is embedded a second time |
| 4 | URL query parameter `step` | `overview` etc. | `page.tsx` | Low — not PHI itself but leaks user flow into referer/analytics |
| 5 | Backend route paths that take `{file}` or `{speaker}` | `/api/patient/summaries/{file}/{speaker}` | `app/Backend/routes_patient.py:241, 527, 721, 939, 1093` | High — server access logs, reverse-proxy logs, network captures see the filename verbatim |
| 6 | Database column `transcript_analysis_log.source_filename` | `Input_Keystrokes REC001 (SID 14).xlsx` | `app/Backend/models.py` | Medium — even if `patient_id` is hashed, this column re-leaks the SID; backups and dumps contain it |
| 7 | Database column `patient_summary.file` / `patient_summary_domain.file` | (same filename) | `app/Backend/models.py` | Medium — denormalised copies of the filename across response-side tables |
| 8 | On-disk filename in the AI repo's `data/input/` | `Input_Keystrokes REC 001 (SID 10).xlsx` | `../AI_physician_patient_communication/data/input/` | Medium — gitignored but plaintext on disk; backups, syncs, screenshots include it |
| 9 | Output directory name in the AI repo's `data/output/` | `Input_Keystrokes REC 001 (SID 10)/` (folder) and `SID_10/` (folder) | `../AI_physician_patient_communication/data/output/` | Medium — same channel as #8 |
| 10 | Legacy logger call in `archive/transcript_service.py:146` | `logger.info("Step 1: Read %d rows, patient_id=%s", …)` | `app/Backend/archive/transcript_service.py:146` | Low — currently behind the archive boundary, but the pattern is a recurrence risk for new code |

### Cross-axis structural observation

Surfaces #2 and #3 demonstrate that **the SID is leaked twice through
the same URL** (once via `fileid`, once via the synthetic `patid` =
`Patient_<stem>` where `<stem>` is the filename without extension).
The synthetic `patid` adds no security value over `fileid`; the
`Patient_` prefix is purely a label. Any design that hashes only one
of these two parameters leaves the other one leaking the same
information.

Surfaces #6, #7, #8 demonstrate that **the filename itself is a PHI
carrier**, independent of the bare SID. Even a perfect hash of
`patient_id` does not stop the SID from re-appearing inside
`source_filename`, the `file` column of response tables, or the
on-disk filename. The filename and the SID must be hashed together,
or the filename must be sanitised at ingestion time.

---

## 3. Goals and non-goals

### Goals

1. **No plaintext patient identifier reaches the browser** — URL,
   screen, screenshots, browser history, referer headers, third-party
   analytics. This covers surfaces #1–#5 from §2.
2. **No plaintext patient identifier reaches server-side logs** —
   structured logs, access logs, error tracebacks. This covers
   surface #10 and forecloses future drift.
3. **Backend retains the ability to resolve a token back to the
   original SID** for authorised operations (audit trail, doctor
   sentence rewrite history, REDCap mirroring). Resolution must be
   gated behind authentication + role check.
4. **Cross-table joins continue to work** — the pipeline contract
   that all 8 persistence tables use a single `patient_id` value as
   the join key remains intact.
5. **The migration is incremental and reversible** — every phase
   ships behind an Alembic migration, and each phase leaves the
   system in a working state that does not require the next phase to
   land first.

### Non-goals

1. **Postgres at-rest encryption** — Disk-level / TDE-style encryption
   is a separate concern handled by infrastructure. This design
   assumes plaintext-in-DB is acceptable for hashed token columns
   because the column value is already opaque to anyone without the
   reverse-lookup table.
2. **Encryption of the consultation transcript content** — The actual
   text of the consultation contains PHI (patient name, dates,
   diagnoses) that is out of scope here. That work belongs to a
   separate PHI-content-encryption initiative (see
   `docs/security/PHI_COMPLIANCE.md`).
3. **Schema unification with the `(file, speaker)` composite key** —
   See `dev_docs/DB_SCHEMA_CLEANUP_TODO.md` §H. That cleanup is
   orthogonal; this design must coordinate with it but should not
   block on it.
4. **Removing existing rows from origin git history** — `.env` and
   PHI never went into the tracked repo, so there is nothing to scrub
   here. Local-only PHI on disk is the user's responsibility.

---

## 4. Design axes and trade-offs

The original 2026-05-19 memo listed three pending decisions. This
section expands each into a concrete trade-off plus two new
decisions that the exposure inventory in §2 surfaced.

### 4.1 Hash construction

| Option | Pros | Cons |
|---|---|---|
| **A. Deterministic HMAC-SHA256 with a project-secret pepper** — `token = base32(HMAC(SHA256, pepper, sid))[:N]` | Idempotent: same SID → same token. Enables fast lookup without storing a mapping for every row. Resists offline rainbow attack because the pepper is server-only. | If the pepper leaks, all tokens become reversible by anyone with the SID space (small). Pepper rotation requires re-tokenising every row. |
| **B. Random per-patient salt, stored in a mapping table** — `token = random(16 bytes); mapping[token] = sid` | No global secret. Rotating one record does not require touching others. | Mapping table must be queried on every persist. Non-idempotent: re-running the pipeline on the same input produces a new token unless the persist layer checks the mapping first. |
| **C. UUIDv4 per patient, generated once at first persist** | Maximally simple. No cryptography. | Same operational profile as B (mapping required). Length (36 chars) makes URLs unattractive. |

**Recommendation: A** — deterministic HMAC with a project-secret
pepper, stored in an env var (`PATIENT_ID_HASH_PEPPER`). Reasons:

- The patient population is small (~tens to ~hundreds). Birthday-
  collision risk at 80 bits (16-char base32) is negligible.
- Determinism lets the pipeline re-process a file safely without
  inventing a new token (matches the existing idempotent-persist
  behaviour in `persistence.file_already_processed`).
- Pepper rotation, while painful, is rare in practice; a `pepper_v`
  column on `patient_identity` lets us version it forward.

### 4.2 Reverse lookup (token → SID)

| Option | Pros | Cons |
|---|---|---|
| **A. Server-side mapping table `patient_identity(token PK, sid, filename_original, pepper_v, created_at)`** | Audit-friendly. Authorised lookup is a single indexed query. Decouples persistence from the hash construction. | One more table to migrate, back up, and protect. The mapping itself is PHI and needs row-level access control. |
| **B. No mapping; token is computed on the fly from SID for resolution** | One less table. | Only works if the surface ever needs the SID has the SID in hand already — which defeats the purpose. |

**Recommendation: A.** Mapping table is unavoidable in practice:
the doctor view needs the original SID to display, the REDCap
mirror needs it to key on the project's own record identifier, and
the audit trail needs it for any incident response. Place the table
in a dedicated `phi` schema (Postgres `CREATE SCHEMA phi;`) with
GRANTs restricted to the backend service role only.

### 4.3 `fileid` and on-disk filename

The original memo addressed `patient_id` but not the filename. From
§2 it is clear that any solution that ignores filenames keeps the SID
leaking.

| Option | Pros | Cons |
|---|---|---|
| **A. Tokenise `fileid` to a separate filename-token at pipeline ingestion time; rename the file on disk to the token; store the original filename only in the `phi.patient_identity` table** | Eliminates filename PHI from every downstream surface (URL, DB columns, logs). | Requires changes in the pipeline's input scanner and the persistence layer; existing rows need a back-fill migration. |
| **B. Generate `fileid` as a derived value at API time, never sending the original filename** | Smaller code change. | The original filename still lives in DB and on disk, so this only patches the URL surface; it does not address §2 #6, #7, #8, #9. Insufficient. |

**Recommendation: A** — at pipeline ingestion, the runner copies
`<original_filename>.xlsx` to `<filename_token>.xlsx`, persists the
mapping in `phi.patient_identity`, and from that point downstream
code only sees the tokenised filename. The original filename
remains on disk in the original `data/input/` (operator's source
material) but does not propagate anywhere else.

### 4.4 Migration approach

| Option | Pros | Cons |
|---|---|---|
| **A. Dual-write → reader cutover → drop plaintext (3 phases)** | Each phase ships behind one Alembic migration. System works at every step. Aligns with the project's stated evolutionary-DB convention (Ambler & Sadalage). | Slower. Three deployment events. |
| **B. Single big-bang migration** | Done in one shot. | Higher risk; rollback requires restoring the database. |

**Recommendation: A.** The project's documented preference is
phased migration (`README.md` Roadmap: "Phase the migration through
dual-write → reader cutover → drop"). Patient ID hashing is a
canonical case for this pattern.

### 4.5 Token format and length

| Option | Length | Collision-safe up to | URL appearance |
|---|---|---|---|
| 8-char base32 (40 bits) | 8 | ~10⁵ records | clean |
| **12-char base32 (60 bits)** | 12 | ~10⁹ records | clean (recommended) |
| 16-char base32 (80 bits) | 16 | ~10¹² records | slightly noisier |
| UUIDv4 hex | 36 | universal | noisy |

**Recommendation: 12-char base32** — birthday collision probability
remains below 10⁻⁹ for the foreseeable patient population, and the
URL stays compact enough to be visually clean.

---

## 5. Recommended design (single coherent proposal)

### 5.1 Token construction

```
pepper        = $PATIENT_ID_HASH_PEPPER  (32-byte random, server-only)
patient_token = base32(HMAC(SHA256, pepper, sid))[:12]
file_token    = base32(HMAC(SHA256, pepper, original_filename))[:12]
```

Both tokens are computed at pipeline ingestion time and stored in
the new `phi.patient_identity` table. From that point on, no other
code path ever sees the SID or the original filename.

### 5.2 New table

```sql
CREATE SCHEMA phi;

-- One row per processed FILE. file_token is the PRIMARY KEY because the file
-- is the natural unit of a pipeline run and of the (file, speaker) key used by
-- the response tables. patient_token is intentionally NOT unique: one patient
-- (one SID) can own several files (e.g. a follow-up recording), so several file
-- rows may share a patient_token.
--
-- DO NOT use the original "patient_token PRIMARY KEY + file_token UNIQUE"
-- pairing — it forces a strict 1:1 file↔patient mapping and therefore cannot
-- represent the one-patient-many-files case that §7.2 explicitly flags (an
-- INSERT of a second file for the same patient would violate the PK). See §10.1.
CREATE TABLE phi.patient_identity (
    file_token          CHAR(12)        PRIMARY KEY,
    patient_token       CHAR(12)        NOT NULL,
    sid                 VARCHAR(255)    NOT NULL,
    original_filename   VARCHAR(500)    NOT NULL,
    redcap_record_id    VARCHAR(255),   -- equals sid under Option B (§7.4); explicit for sync auditing
    pepper_v            SMALLINT        NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patient_identity_patient_token ON phi.patient_identity(patient_token);
CREATE INDEX idx_patient_identity_sid           ON phi.patient_identity(sid);

-- access control
REVOKE ALL ON SCHEMA phi FROM PUBLIC;
GRANT  USAGE ON SCHEMA phi TO prostatecancer_user;
GRANT  SELECT, INSERT, UPDATE ON phi.patient_identity TO prostatecancer_user;
```

**Filename normalization (required before hashing).** `file_token =
base32(HMAC(pepper, normalize(original_filename)))`. The dataset already
contains cosmetic filename variants for the same logical record (e.g.
`REC 001 (SID 10)` vs `REC001 (SID 14)` — note the space), so the raw string
must be normalized first (trim, collapse internal whitespace, case-fold the
extension) or the same file re-dropped under a slightly different name will mint
a *different* token and orphan the earlier rows. The normalization function is
the single source of truth and must live next to `mint_tokens()` (§6 Phase 0).

> The "two patients in one file" case (§7.2) is still **not** representable by
> this single table and remains deferred together with the `fileid`/`patid`
> collapse decision; if it ever becomes real, add a `phi.patient` table and make
> `patient_identity.patient_token` a FK into it.

### 5.3 Schema changes on existing tables

For each pipeline / response / behaviour table that currently keys on
`patient_id`, `source_filename`, or `(file, speaker)`, add the matching
token column(s). During Phase 1 (dual-write) both columns are populated. The
final Phase 4 drops the plaintext columns.

> **The table below was corrected on 2026-05-29 against the live models in
> `app/Backend/models.py` (see §10.2).** The draft-v2 version mis-stated five
> rows: `nlp_all_predictions` / `nlp_pipeline_intermediate` carry a *direct*
> `patient_id` (not "via FK"); `llm_domain_scoring_and_summary` also carries
> `source_filename`; `survey_submission_log` and `doctor_rewrite_log` have **no**
> `patient_id` (they key on `file`/`speaker`); and the answers table is the
> **singular** `patient_first_visit_answer`. The corrected rows below are what
> makes the §11 "SID survives in exactly three places" claim actually hold.

| Table | Plaintext today (verified) | Token to add | Note |
|---|---|---|---|
| `transcript_analysis_log` | `patient_id`, `source_filename` | `patient_token`, `file_token` | PK `id` |
| `sentence_prediction` | `patient_id` | `patient_token` | also has non-PHI `speaker` (utterance role) |
| `nlp_all_predictions` | **`patient_id` (direct)** | `patient_token` | draft v2 wrongly said "via FK / none" |
| `nlp_pipeline_intermediate` | **`patient_id` (direct)** | `patient_token` | draft v2 wrongly said "via FK / none" |
| `llm_pipeline_intermediate` | `patient_id` | `patient_token` | |
| `llm_domain_scoring_and_summary` | `patient_id`, **`source_filename`** | `patient_token`, **`file_token`** | source_filename missed in draft v2 |
| `patient_summary` | `file`, `speaker` | `file_token`, `patient_token` | composite PK `(file, speaker)` |
| `patient_summary_domain` | `file`, `speaker` | `file_token`, `patient_token` | composite PK `(file, speaker, domain)` |
| `patient_first_behavior` | `file`, `speaker` | `file_token`, `patient_token` | PK `id` |
| `patient_followup_survey` | `file`, `speaker` | `file_token`, `patient_token` | PK `id` |
| `doctor_behavior` | `file` (nullable), `speaker` | `file_token`, `patient_token` | `file` nullable |
| `survey_submission_log` | **`file`, `speaker`** (no `patient_id`) | `file_token`, `patient_token` | draft v2 wrongly said `patient_id`; FK→`patient_summary(file,speaker)` |
| `doctor_rewrite_log` | **`file`** (no `patient_id`) | `file_token` | `file` is part of 4-col composite PK `(file, i, i2, time)` → PK redesign, not a plain column add |
| `patient_first_visit_responses` | `file`, `speaker` | `file_token`, `patient_token` | PK `id` |
| `patient_first_visit_answer` (singular) | `file`, `speaker` | `file_token`, `patient_token` | draft v2 wrote the plural `…answers` |

### 5.4 URL contract

| Surface today | Surface after |
|---|---|
| `?fileid=Input_Keystrokes+REC001+%28SID+14%29.xlsx&patid=Patient_Input_Keystrokes+REC001+%28SID+14%29&visit=first` | `?fileid=K4QXJ7R2NDA8&patid=K4QXJ7R2NDA8&visit=first` |

Note that `fileid` and `patid` continue to exist as separate
parameters during the migration but converge to the same 12-char
token value (since a file maps 1:1 to a patient in this dataset).
Whether to collapse them into a single `?pid=…` is an open
question (§7).

### 5.5 Backend resolution layer

A single dependency `get_patient_identity(token: str)` is added at
`app/Backend/auth/access_control.py` (or a new
`app/Backend/phi_resolver.py`). Every route that today accepts
`{file}` or `{speaker}` instead accepts `{patient_token}` and
resolves through this dependency. The resolver requires the
caller to have a valid `X-API-Key` (already enforced) and returns
the original SID/filename only if the request originated from the
backend itself or from an authenticated doctor session. Patient
sessions never receive the original SID over the wire.

### 5.6 Display rules

| Surface | Doctor view | Patient view |
|---|---|---|
| URL | token | token |
| Page header | display original SID (read from `phi.patient_identity` server-side, returned via authenticated endpoint) | display the token only, or render a neutral title with no identifier at all |
| Sentence-level metadata in the page body | original SID is fine | the token |
| Tracking events posted to backend | token | token |
| Browser dev-tools console | token | token |
| Print / PDF export of the page | token in the URL footer | token in the URL footer |
| REDCap external records (record_id) | SID (per §7.4 resolution) | SID (per §7.4 resolution) |

This reflects the design hint from the AI repo's 2026-05-14_05-15
memo ("doctor view keeps real SID; patient view uses hashed value"),
extended with the requirement that even the doctor's URL uses the
token to keep the SID out of browser history and referer headers.

### 5.7 What "the patient screen" actually means

The phrase "patient view" / "patient screen" in this document is
specific: it refers to the dashboard pages a **patient themselves**
opens via a URL given to them after their consultation. The
application's single-entry `page.tsx` routes the request based on
the URL's query string into one of two patient-facing views:

| View | Triggered by | Component | What the patient sees |
|---|---|---|---|
| Patient first-visit | `?visit=first` | `app/Webapp/src/components/PatientInitialVisitReportV38.tsx` (current active version; V37 remains for the experimental arm) | Five domain summary cards (`cp`, `le`, `ed`, `inc`, `ius`) with the focus sentence highlighted via the `<main>…</main>` markers, plus VAS sliders and a free-text response box for each card |
| Patient follow-up | `?visit=followup` | Follow-up report components | Four survey sections — DCS, SDM, Risk Perception, Satisfaction — with required-answer popups before submit |

The doctor view is a separate third path triggered by `?doctorid=…`
and is covered separately in §5.6 (it retains the SID in the body of
the page but uses tokens in the URL).

**Why we hide the SID even on the patient's own screen.** The
patient is presumably authorised to see their own data; the question
is not "does the patient need to be hidden from themselves" but
"what happens when the screen or its URL is captured, shared, or
synchronised somewhere we did not intend". Concrete leakage paths:

| Leakage path | Scenario |
|---|---|
| Shared family / clinic computer | Patient opens the link at home or on a clinic kiosk; the URL ends up in the browser history seen by the next user |
| Screenshot for a relative or another clinician | Patient takes a screenshot of "what the doctor said" and forwards it via chat / email; the screenshot embeds the URL (or the SID rendered on the page) |
| Browser sync to a cloud account | Browser history syncs to Google / iCloud / Edge cloud, taking the SID outside the BAA boundary |
| HTTP `Referer` header | Patient clicks an external link on the page; the receiving site's access log records the originating URL, SID and all |
| Browser extensions / analytics | Ad blockers, password managers, corporate-managed browsers, accessibility tools all touch URL bar contents |
| Print / PDF export | Patient prints the summary for a paper file; printers commonly add the URL into a footer, persisting the SID into the paper record and the print queue |
| Message forwarding | Patient pastes the URL into a message to a family member who is helping them ("can you check this?") |
| Public-network capture | Even with HTTPS, network metadata and SNI fields can in some configurations expose URL paths to monitoring software on managed networks |

The cumulative effect: **the patient screen is not protected for the
patient's own benefit but for the unintended audience that screen
captures, URLs, and history entries always eventually reach**. The
token-only contract holds at every one of those leakage points.

---

## 6. Migration plan

### Phase 0 — table + helper (preparatory, no behaviour change)

1. Alembic migration `016_phi_patient_identity_table.py` creates
   `phi.patient_identity`, indexes, and grants.
2. Add `PATIENT_ID_HASH_PEPPER` to `.env.example` (Backend and AI
   repo). The actual value is generated with
   `openssl rand -base64 32` at setup time.
3. Add `app/Backend/phi_resolver.py` with `mint_tokens(sid, filename) -> (patient_token, file_token)` and `resolve(token) -> identity`. Unit tests.

**Done-when:** the new table exists, the helper is unit-tested, no
runtime behaviour changed.

### Phase 1 — dual-write at pipeline persist time

1. AI repo: `db/persistence_helper.py` calls `mint_tokens(...)` at
   pipeline start, persists the mapping into `phi.patient_identity`,
   and writes both plaintext `patient_id` / `source_filename` AND the
   new `patient_token` / `file_token` into every pipeline table.
2. Backend: routes accept either token or plaintext (dual-key
   transitional state).
3. Backend REDCap path (`app/Backend/routes_surveys.py:361`):
   when `submission.patient_token` is supplied, resolve it to the
   original SID via `phi_resolver` and pass that SID as the
   REDCap `record_id`. This implements the §7.4 decision (Option B
   — REDCap keeps SID-keyed records) while the rest of the system
   migrates away from plaintext.
4. Frontend: continues to send plaintext for now.

**Back-fill:** a one-shot script `scripts/backfill_patient_tokens.py`
walks every existing `transcript_analysis_log` row, mints tokens,
and updates every dependent row in a single transaction. Re-runnable.

**Done-when:** every row in every pipeline-touching table has both
plaintext and token columns populated. Backend route tests pass for
both shapes. REDCap submissions made via the new token path land
under the SID record_id in the REDCap project.

### Phase 2 — frontend reader cutover

1. `app/Webapp/src/app/page.tsx:306` changes `Patient_${stem}` to use
   the token returned by `/api/patient/files` (which now returns a
   list of `{file_token, patient_token, display_label}` objects;
   `display_label` is `Patient ${number_from_sid}` for the doctor
   selection screen, or just `Patient ${index}` for patients).
2. Every link in the codebase that constructs a URL with `fileid` or
   `patid` is updated to use the token.
3. Doctor view still shows the SID in the page body via an
   authenticated `/api/doctor/patient-display/{patient_token}`
   endpoint that returns the original SID.

**Done-when:** no URL produced by the webapp contains plaintext SID
or filename. Browser history for a typical session shows only tokens.

### Phase 3 — backend route signatures changed to token-only

1. The route signatures in `routes_patient.py`, `routes_doctor.py`,
   `routes_surveys.py`, `routes_track_*.py` change from
   `{file}/{speaker}` to `{patient_token}` (single canonical path
   param).
2. The transitional dual-key acceptance from Phase 1 is removed.
3. Update OpenAPI schema, API client code in the webapp, and
   integration tests.

**Done-when:** `grep -r "patient_id\|file=\|speaker=" routes_*` shows
no path-parameter occurrences. Only the resolver and the
`phi.patient_identity` table touch the originals.

### Phase 4 — drop plaintext columns

1. Alembic migration `017_drop_plaintext_patient_id.py` drops the
   `patient_id`, `source_filename`, `file`, and `speaker` columns
   from every table where the token-only path is sufficient. Keep
   them only in `phi.patient_identity`.
2. Drop `survey_submission_log.redcap_record_id` — this column was a
   plaintext SID duplicate (the value REDCap returned, which is the
   SID under Option B). The token → SID mapping needed to query
   REDCap for a given submission is reachable via
   `phi.patient_identity`. Optionally move it into `phi` schema
   instead of dropping (decision in §7.4).
3. Remove the legacy logger.info pattern at
   `archive/transcript_service.py:146` (or delete the archive file
   entirely if not needed). Sweep `routes_surveys.py:349, 418, 450,
   1011` and similar call sites so `print` / `logger.error` arguments
   carry tokens or are explicitly masked.
4. Add a CI rule (e.g. ruff custom rule, or a grep-based pre-commit
   hook) that blocks new code from referencing
   `patient_id` / `source_filename` outside the resolver.

**Done-when:** plaintext columns no longer exist in the operational
schema. The only place a plaintext SID can be read is via the
authenticated resolver against `phi.patient_identity` and, for
external mirroring, the REDCap project itself. CI prevents
regressions.

---

## 7. Open decisions

These need a sign-off at the design review before Phase 0 starts.

1. **Pepper rotation policy.** Annual? On personnel change? Never?
   The `pepper_v` column on `patient_identity` accommodates any
   policy; we just need to pick one.
2. **Collapse `fileid` and `patid` into a single URL parameter?**
   Today they are semantically distinct (a file vs a patient) but in
   this dataset they map 1:1. Collapsing simplifies routing but
   couples a future "two patients in one file" scenario to a schema
   change.
3. **Doctor-view URL: token or original SID?** Recommendation in
   §5.6 is token (consistent), but the 2026-05-14 memo hinted that
   the doctor view could keep the SID. Need to choose.
4. **REDCap mirroring.** ~~Does REDCap need the original SID, the
   token, or its own record identifier?~~ **Resolved: Option B —
   REDCap continues to use the SID as `record_id`.** The backend
   resolves `patient_token → SID` at the REDCap API boundary (a
   single call site at `routes_surveys.py:361`). The manager's
   REDCap dashboard workflow is preserved; the existing
   `Patient_<filename>` cruft in record IDs is replaced with clean
   `SID_14` identifiers, which is itself an improvement.
   Rationale: iREDCap is a Cedars-Sinai-internal HIPAA-compliant
   instance covered by the BAA; the SID's role there is the same as
   any other PHI value REDCap stores by design, so the work to
   make our own surfaces PHI-free does not require removing it
   from REDCap as well. The consequence is that after Phase 4 the
   plaintext SID survives in exactly three places, all of which
   are explicitly catalogued in §11.

   **Sub-decision still open — migration of existing REDCap records.**
   Records already submitted under the old `Patient_<filename>`
   identifier remain in the REDCap project. Options:

   - X. Leave the existing records as-is and apply the new
     SID-keyed identifier only to new submissions. REDCap
     dashboard ends up with two identifier formats coexisting.
   - Y. Use the REDCap API to rename existing records to the SID
     form. Cleanest, but rename operations on REDCap can be risky
     and need careful sequencing of dependent instruments.
   - Z. Manually clean up the small number of existing records
     (currently ~12: three patients × four surveys each).

   Recommended: **Y or Z**, while the dataset is small.
5. **Backup / dump strategy.** The `phi.patient_identity` table
   recombines plaintext SID with the token. Dumps of the operational
   database should exclude this schema by default; backups should
   encrypt it. Where does this policy live?
6. **Display labels for the doctor selection screen.** Doctors today
   pick a patient by seeing `SID_10`, `SID_14`, … in a list. After
   hashing, the list will show 12-char tokens, which is poor UX.
   Options: (a) doctor selection endpoint returns SID for authorised
   sessions only; (b) display a short numeric label (`Patient 10`,
   `Patient 14`) derived from the SID inside the authenticated
   resolver.

---

## 8. Out of scope (explicit non-coverage)

These are real problems but they belong in separate efforts and
should not block this work:

- **Transcript-content PHI** (patient names, dates in the actual
  consultation text). Handled by a separate content-redaction
  initiative.
- **The doctor's own identifier** (`doctorid` URL parameter). Doctors
  authenticate via a separate flow; the doctor identifier is not
  considered PHI here. If that changes, mirror this design.
- **DB-at-rest encryption.** Infrastructure concern.
- **The `(file, speaker)` composite-key cleanup** documented in
  `dev_docs/DB_SCHEMA_CLEANUP_TODO.md` §H. The two efforts touch
  the same columns; coordinate timing so the schema cleanup lands
  after Phase 4 of this design, or interleave carefully with
  individual Alembic migrations.

---

## 9. References

- `daily_control_logs/2026-05-19_webapp_feedback.md` §3 — original task
- `daily_control_logs/2026-05-19_webapp_feedback_KR.md` §3 — KR mirror
- `../AI_physician_patient_communication/daily_control_logs/2026-05-14_05-15_control_kr.txt:70-71` — earliest design hint
- `docs/security/PHI_COMPLIANCE.md` — HIPAA §164.312 constraints
- `docs/security/SECURITY_AUDIT.md` — earlier audit; the
  `_sanitize_patient_id` fix (path traversal) lives here. This
  proposal does not change that fix.
- `dev_docs/TODO.md` item 35 — "Log PII masking" (folds into Phase 0
  + Phase 4 of this proposal)
- `dev_docs/DB_SCHEMA_CLEANUP_TODO.md` §H — identifier scheme
  unification (coordinate, do not couple)
- `README.md` Roadmap "Later (Q2 onward)" — "Unify the patient
  identifier scheme" entry that this proposal partially implements

---

## 10. Implementation-readiness corrections (verified 2026-05-29)

Before this draft is implemented, the following was checked against the live
code on `feat/patient-ui-2026-05-19-feedback` (`models.py`, `page.tsx`,
`routes_patient.py`, `routes_surveys.py`, `alembic/versions/`, `core/settings.py`).
The design **direction and threat model hold**; these are the corrections that
make it safe to *apply*. Items 10.1–10.5 are blocking; 10.6 is advisory.

### 10.1 Identity table must not force a strict 1:1 (blocking)

The draft-v2 schema (`patient_token PRIMARY KEY` + `file_token NOT NULL UNIQUE`)
can only represent one file per patient and one patient per file — which
directly contradicts §7.2's own acknowledgement that the mapping may diverge.
Fixed in §5.2: `file_token` is the PK, `patient_token` is a non-unique indexed
column (one-patient-many-files now works), filename is normalized before
hashing, and the "two-patients-one-file" case is explicitly deferred.

### 10.2 §5.3 table column facts were wrong for 5 tables (blocking)

Verified against `models.py`:

- `nlp_all_predictions`, `nlp_pipeline_intermediate` — carry a **direct
  `patient_id VARCHAR(255)`** column (draft v2 assumed "via FK, nothing to
  add"). Left uncorrected, Phase 4 would leave the SID in these two tables and
  the §11 "exactly three places" claim would be **false**. Now in scope.
- `llm_domain_scoring_and_summary` — also carries **`source_filename`** (needs
  `file_token`), not just `patient_id`.
- `survey_submission_log` — has **no `patient_id`**; it keys on `(file, speaker)`
  with a FK to `patient_summary`. Its Phase 1 dual-write derives the token from
  `file`/`speaker`, not from a `patient_id` column.
- `doctor_rewrite_log` — has **no `patient_id`**; `file` is part of the 4-column
  composite PK `(file, i, i2, time)`. Tokenising it is a **PK redesign**, not a
  plain column add — call this out in the Phase 1 migration.
- Table name is the **singular `patient_first_visit_answer`** (draft v2 wrote
  the plural). A migration referencing the plural name fails.

### 10.3 Pepper rotation is a full cross-table re-key, not a one-table op (blocking to document)

`patient_token`/`file_token` are derived from the pepper *and* are the join keys
on 15 tables. Rotating the pepper changes every token, so §4.1's "`pepper_v`
column versions it forward" is insufficient — rotation requires a coordinated
re-key across all token columns in one migration (or a design where the token is
*not* the cross-table join key; see 10.6). The rotation runbook must be written
before Phase 1, not after, because the token columns are added in Phase 1.

### 10.4 REDCap token has de-identified *export* rights (factual note)

Live testing (2026-05-29) confirmed the REDCap API token used for the Option B
mirror has **de-identified export** rights: writes (record import) of every
field succeed, but on *export* REDCap blanks identifier / free-text / notes /
date fields. This does **not** affect the design (the `token → SID` resolution
and the SID-keyed `record_id` write both work), but any verification script that
round-trips through REDCap export must expect blanked fields and not treat that
as data loss.

### 10.5 Stale code references to refresh (non-blocking, but causes friction)

The draft cites line numbers that have drifted; refresh them so the doc can drive
implementation:

| Reference in doc | Actual |
|---|---|
| `routes_surveys.py:361` `record_id = submission.speaker` | line **383** |
| log/print sites `routes_surveys.py:349, 450, 1011` | only **418** is a print; 349/450/1011 are not log calls |
| `page.tsx:178` reads `fileid`/`patid` | lines **175–178** (also reads `doctorid`, `visit`) |
| `page.tsx:306` `Patient_${stem}` | lines **305–306** ✓ |
| "latest migration is 014" | latest is **015**; next free is **016** ✓ (assumption holds) |
| frontend call sites | add `PhysicianReportsModifiedV41Timothy.tsx:4201–4203, 4225–4227` (manipulates `fileid` in the URL) and the four leaking `console.log`s at `page.tsx:180–185, 190, 205, 215` to the Phase 2 work list |

Route claims (`routes_patient.py:241/527/721/939/1093`), the DB role
(`prostatecancer_user`), and `persistence.file_already_processed()` (line 276)
were all verified **correct**.

### 10.6 Optional: don't make the token the cross-table join key (advisory)

10.1 and 10.3 both stem from using the HMAC token as a primary/join key. A more
robust alternative keeps a stable surrogate integer key for internal joins and
treats the token purely as the external-surface (URL/log) representation resolved
via `phi.patient_identity`. This decouples pepper rotation and identity-model
changes from every FK in the schema. Worth weighing against the extra indirection
before Phase 1 locks the column shape in.

---

## 11. Where the SID survives after Phase 4 — detailed surface inventory

> The "exactly **three**" guarantee below holds **only with the §5.3 / §10.2
> corrections applied** (tokens added + plaintext dropped on
> `nlp_all_predictions`, `nlp_pipeline_intermediate`, and the `source_filename`
> of `llm_domain_scoring_and_summary`). Without them the SID also survives in
> those two-plus tables.

After all four migration phases have landed and Option B is in place
for the REDCap path, the plaintext SID survives in exactly **three**
places in the entire system. Every other surface uses opaque
12-character tokens or the identifier has been removed entirely.

The summary table below is the quick reference; the numbered
sub-sections immediately after expand each row with the concrete
files, current state, post-migration state, who has access, and
why that resolution is correct.

| # | Surface | SID present? | One-line summary |
|---|---|---|---|
| 1 | URL (`fileid`, `patid`) | ❌ token only | Browser history, referer, screenshots no longer leak SID |
| 2 | HTML — patient view | ❌ token only | Screenshots, family device sharing, print exports no longer leak SID |
| 3 | HTML — doctor view | ✅ visible in page body | Authenticated doctor session only; URL still token, so history/referer protected |
| 4 | 8 pipeline persistence tables | ❌ token only | After Phase 4 |
| 5 | 5 response / behaviour-tracking tables | ❌ token only | After Phase 4 |
| 6 | `phi.patient_identity` table | ✅ present | **The single PHI carrier in our DB** |
| 7 | `survey_submission_log` | ❌ removed | `redcap_record_id` column dropped or moved to `phi` schema |
| 8 | Backend logs | ❌ masked | structlog processor masks SID-shaped patterns; CI blocks new offenders |
| 9 | On-disk filenames in AI repo | ✅ in `data/input/` (operator source) / ❌ in `data/output/` | Input is operator workflow (manual placement); output is automated and uses `<file_token>/` folders |
| 10 | REDCap (`iredcap.csmc.edu`) | ✅ `record_id` is the SID | Option B (§7.4). BAA-covered external system. Manager dashboard workflow preserved |

### 11.1 URL (`fileid`, `patid`)

**What this is.** The query string of the URL in the browser address
bar. Read at `app/Webapp/src/app/page.tsx:178`
(`searchParams.get("fileid") / get("patid")`), and currently
constructed at `page.tsx:306` as `` `Patient_${stem}` ``.

**Current shape.** Both `fileid` and `patid` carry the SID-bearing
filename verbatim. The encoded form looks deceptively opaque but
URL-decoders trivially recover `Input_Keystrokes REC001 (SID 14).xlsx`
and `Patient_Input_Keystrokes REC001 (SID 14)`.

**After Phase 4.** Both parameters carry a 12-character base32 token:
`?fileid=M7P2X4LFQND9&patid=K4QXJ7R2NDA8&visit=first`. No data
recoverable without the server-side `phi.patient_identity` table.

**Channels protected.** Browser history, browser sync to cloud
accounts (Google / iCloud / Edge), HTTP `Referer` headers on
outbound clicks, page-bar screenshots, URLs shared via messaging
apps, page-print headers/footers, browser-extension data ingestion,
managed-network proxy logs.

**Why the token is sufficient here.** Tokens are HMAC-derived from a
server-only pepper; without that pepper a leaked token cannot be
reversed back to the SID, so the URL becomes truly information-free
to any party outside the backend.

### 11.2 HTML — patient view

**What this is.** Defined in detail in §5.7. Concretely the
`PatientInitialVisitReportV38.tsx` component for first-visit and the
follow-up survey components for `?visit=followup`. Both are accessed
by the patient themselves via a URL they receive after the
consultation.

**Current shape.** The body of the page does not generally display
the raw SID, but several auxiliary surfaces leak it: the URL in the
address bar (§11.1), the `console.log("🔍 URL Parameters:", …)` call
at `page.tsx` (visible in browser DevTools), the URL footer added by
the print dialog when patients print or save as PDF, and the
`speaker = `Patient_${stem}`` value posted back in tracking events
and survey submissions.

**After Phase 4.** Every surface listed above carries the token
instead of the SID, or the SID-rendering call site is removed:

- URL is the token (§11.1).
- Console logs use the token, or are deleted in production builds.
- Print/PDF exports show only the token in the URL footer.
- Tracking events sent to backend carry `{patient_token, file_token}`
  (see §11.5).
- Page titles and headings stay neutral
  (e.g. "Your prostate consultation summary") or render the token
  for debugging only.

**Channels protected.** All the patient-screen leakage paths
catalogued in §5.7 — shared family / clinic computer history,
forwarded screenshots, browser-sync data, HTTP `Referer` on outbound
clicks, browser-extension reads of URL or DOM content, print queue,
messaging-app previews, public-network capture.

**Why the patient screen is protected even though the patient is
authorised.** The protection is not against the patient themselves;
it is against the **unintended audience** that captures, syncs, or
shares the screen and its URL.

### 11.3 HTML — doctor view

**What this is.** The doctor-facing dashboard pages, accessed when
the URL carries `?doctorid=…`. Includes the patient-selection screen
(list of patients the doctor has access to) and the per-patient
detail page (score trajectory, sentence rewrites, score history).

**Current shape.** Doctor pages render the SID directly in the
header ("Patient SID_14"), in the patient-selection list, and in
sentence-rewrite history. The URL is also SID-bearing under the
current scheme.

**After Phase 4.** Asymmetric protection: the URL becomes a token
exactly as in §11.1 (protecting browser history and referer), but
the **rendered body** of the doctor view continues to display the
SID. That SID is fetched server-side from `phi.patient_identity`
via an authenticated endpoint (e.g.
`GET /api/doctor/patient-display/{patient_token}`) that requires the
doctor's session credentials and refuses anonymous or
patient-session requests.

**Channels protected.** Browser history, referer, URL-bar
screenshots, URL sharing.

**Channels NOT protected (by design).** Body-of-page screenshots,
print exports of the doctor page, doctor-station shoulder surfing.
These remain inside the doctor's responsibility envelope — the
doctor is an authorised PHI user inside the BAA boundary and can
see the SID by design. The change relative to today is that the
URL is no longer a covert leakage vector.

**Why this asymmetry is correct.** The threat model in §5.7 is
about unintended audiences. The doctor's intended view of the SID
is part of their clinical workflow; making the URL token-only
removes the unintended channel without breaking the intended one.

### 11.4 Eight pipeline persistence tables

**What this is.** The DB tables the NLP and AI pipelines write into
during each pipeline run. From `app/Backend/models.py`:

| # | Table | Purpose |
|---|---|---|
| 1 | `transcript_analysis_log` | One row per analysis run; carries the overall AI score |
| 2 | `sentence_prediction` | Top-N selected sentences per domain with the `<main>…</main>` context |
| 3 | `nlp_all_predictions` | Every sentence × every NLP model (5 models) for full traceability |
| 4 | `nlp_pipeline_intermediate` | JSONB blobs of intermediate dataframes from NLP steps 0–4 |
| 5 | `llm_pipeline_intermediate` | AI candidate rows with the post-filter survival flag |
| 6 | `llm_domain_scoring_and_summary` | Final patient-visible AI output, one row per domain |
| 7 | `patient_summary` | Per-file parent row that response tables anchor to |
| 8 | `patient_summary_domain` | Per-domain hook the dashboard reads |

**Current shape.** Each row carries a `patient_id VARCHAR(255)` whose
value is the SID (`SID_14`). The first table additionally carries
`source_filename VARCHAR(500)` and the response-side tables
(`patient_summary*`) carry `file` and `speaker` columns whose values
include the original filename and the `Patient_<stem>` synthetic
identifier.

**After Phase 4.** Token columns added in Phase 1 (`patient_token
CHAR(12)`, `file_token CHAR(12)` where applicable) become the
canonical join keys. The plaintext `patient_id`, `source_filename`,
`file`, and `speaker` columns are dropped. Indexes are re-built
against the token columns.

**Channels protected.** Database dumps, replicas, point-in-time
backups, CSV exports, ad-hoc SQL by anyone with read access to the
operational schema.

**Why token-only joins still work.** Tokens are deterministic — the
HMAC of the same SID under the same pepper always yields the same
token. Cross-table joins continue to use the token as a key.
Pipeline re-runs on the same input continue to produce the same
token and therefore remain compatible with the
`persistence.file_already_processed(...)` idempotency check.

### 11.5 Five response / behaviour-tracking tables

**What this is.** Tables that record patient and doctor actions
during their interaction with the dashboard, plus survey responses
and first-visit answers:

| # | Table | Purpose |
|---|---|---|
| 1 | `patient_first_behavior` | First-visit page events (slider movements, summary toggles, answer changes, ...) |
| 2 | `patient_followup_survey` | Follow-up survey page events |
| 3 | `doctor_behavior` | Doctor view events (rewrite, score-trajectory inspection, ...) |
| 4 | `patient_first_visit_responses` | V37 first-visit response rows |
| 5 | `patient_first_visit_answers` | Row-per-question first-visit answers (migration 014) |

**Current shape.** Each table keys on `(file, speaker)` — the same
denormalised filename / synthetic-speaker pair as the response-side
of §11.4.

**After Phase 4.** The composite key becomes
`(file_token, patient_token)`. Plaintext `file` and `speaker`
columns are dropped. The token-based key continues to join cleanly
against §11.4 because the same token values are used everywhere.

**Channels protected.** Same as §11.4. Additionally, behaviour-event
exports (e.g. for offline analytics) are now PHI-free by default.

### 11.6 `phi.patient_identity` — the single PHI carrier

**What this is.** A new table introduced by this design (§5.2),
sitting in a dedicated `phi` schema with restricted GRANTs. It is
the only place in our database where a plaintext SID is paired with
its tokens. Its schema:

```sql
CREATE SCHEMA phi;

-- See §5.2 for the authoritative DDL and the rationale. file_token is the PK;
-- patient_token is non-unique (one patient may own several files). The earlier
-- "patient_token PRIMARY KEY + file_token UNIQUE" form was corrected per §10.1.
CREATE TABLE phi.patient_identity (
    file_token          CHAR(12)        PRIMARY KEY,
    patient_token       CHAR(12)        NOT NULL,
    sid                 VARCHAR(255)    NOT NULL,
    original_filename   VARCHAR(500)    NOT NULL,
    redcap_record_id    VARCHAR(255),   -- equals sid under Option B; explicit for sync auditing
    pepper_v            SMALLINT        NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

**Who can read it.** Only the backend service role
(`prostatecancer_user`). The patient-facing route handlers never
touch this table — they accept a token, hand it to a route-internal
resolver, and the resolver returns only the fields needed for the
specific operation. The doctor-facing routes read it via an
authenticated endpoint. Audit and incident-response use cases
should run under a separate `phi_reader` role; that role is not
provisioned by this design and is a follow-up.

**Why concentrating PHI here is correct.** Once PHI is concentrated
in one table, every PHI-relevant control — access grants, audit
logging, encryption at rest, backup encryption, dump exclusion — has
exactly one target. Today PHI is sprayed across 15 tables, each of
which has to be considered separately for every control. After
Phase 4 this drops to a single point of focus.

**Risk this concentration introduces.** Compromise of this one table
is enough to recover every SID for every token in the rest of the
system. Mitigations: schema-level GRANT restrictions, row-level
security if patient-by-patient scoping is needed, write-side audit
logging, and (long-term) physical separation onto a dedicated
encrypted volume or instance.

### 11.7 `survey_submission_log`

**What this is.** The table that records each survey submission
attempted from the dashboard and whether it synced to REDCap.

**Current shape.** Carries `patient_id` (the SID) and
`redcap_record_id` (the value REDCap returned — under the current
code that is `Patient_<filename>`).

**After Phase 4.**
- `patient_id` → `patient_token`.
- `redcap_record_id` is dropped, **or** it is moved into
  `phi.patient_identity` as the column already named
  `redcap_record_id` (per §11.6). The latter is the recommended
  option in §7.4 because REDCap sync state is conceptually per
  patient identity, not per submission, and consolidating it onto
  `phi.patient_identity` keeps all PHI on one table.
- `redcap_synced BOOLEAN` and `redcap_error TEXT` remain on
  `survey_submission_log` — those are operational state, not PHI.

**Channels protected.** Operational backups and dumps of
`survey_submission_log` are now PHI-free. Admin views that summarise
submission and sync-failure rates continue to work using token-keyed
joins.

### 11.8 Backend logs

**What this is.** Backend stdout/stderr (captured by `nohup` into
`logs/backend-native-*.log`) plus structured `structlog` events.

**Current leakage sites.**
- `app/Backend/archive/transcript_service.py:146` —
  `logger.info("Step 1: Read %d rows, patient_id=%s", …)` (in the
  archive boundary today, but the pattern recurs in new code).
- `app/Backend/routes_surveys.py:349, 418, 450, 1011` — `print()`
  and `logger.error()` calls that carry the REDCap `record_id`,
  which today is the `Patient_<filename>` synthetic value.
- Any future log statement a developer adds while debugging.

**After Phase 4. Two layers of defence:**

1. A structlog processor in `app/Backend/core/logging.py` walks
   every event dict and replaces SID-shaped substrings with
   `SID_***` and `Patient_<…>` substrings with `Patient_***`. This
   catches both intentional logging and incidental traceback
   inclusion.
2. A CI / pre-commit rule blocks new code from referencing
   `patient_id` or `source_filename` outside the resolver module.
   This is implementable as a ruff custom rule or as a grep-based
   pre-commit hook; either way it prevents the next developer from
   reintroducing the leakage.

**Channels protected.** Local log files on disk, log-shipping
pipelines (Loki / CloudWatch / ELK in the future), error-tracking
SDKs (Sentry-style services), oncall `tail -f` sessions, log
archives in object storage.

### 11.9 On-disk filenames in the AI repo

**What this is.** The directories `data/input/` (operator-supplied
transcripts) and `data/output/` (pipeline-generated artefacts) in
the sibling `AI_physician_patient_communication` repo.

**Current shape.**
- `data/input/Input_Keystrokes REC 001 (SID 10).xlsx` — operator
  drops this file with the original filename.
- `data/output/Input_Keystrokes REC 001 (SID 10)/...` — pipeline
  output folder named after the input.
- `data/output/SID_10/` — additional output folder keyed by SID.

**After Phase 4.**

- **Input directory stays as-is.** The original filenames are the
  operator's source material; the operator needs to recognise the
  files in order to drop and remove them. This directory is
  gitignored, lives only on the operator's machine, and is
  protected by host-level filesystem access control. Removing the
  SID from filenames here would force the operator to look up
  every file via a separate mapping — a usability regression with
  no PHI-protection gain in the threat model.
- **Output directory becomes token-keyed.** The pipeline runner
  computes `file_token` at ingestion time (§5.1) and writes all
  outputs under `data/output/<file_token>/`. The legacy
  `data/output/SID_10/` paths are dropped. Downstream readers of
  the output directory (verification scripts, dashboard imports)
  switch to looking up the folder by token.

**Channels protected (for the output side).** Operator
`ls data/output/`, recursive copies and rsyncs, IDE / editor file
trees, file-watch tooling, disk backups of the output directory.

**Why the asymmetry between input and output is correct.** Input is
human-facing source material in a controlled local directory;
output is machine-generated and is read by code, not eyeballed. The
SID protection is most valuable where automated tooling and
synced/backup pipelines touch the data, which is the output side.

### 11.10 REDCap (`iredcap.csmc.edu`)

**What this is.** The Cedars-Sinai-internal REDCap instance that
mirrors patient-survey submissions for downstream analysis.

**Current shape.** Records are keyed by the `Patient_<filename>`
value (see §11.1 / `routes_surveys.py:361`). Each record carries
the survey-instrument fields.

**After Phase 4 (Option B per §7.4).** Records continue to be
keyed by SID, but the keys become the clean SID form rather than
the cluttered `Patient_<filename>` form:

```
record_id = "SID_14"  →  { sdm_q1: 4, sdm_q2: 3, … }
record_id = "SID_10"  →  { sdm_q1: 3, … }
record_id = "SID_15"  →  { sdm_q1: 5, … }
```

The conversion happens at exactly one call site in our code
(`routes_surveys.py:361`):

```python
# OLD
record_id = submission.speaker         # "Patient_Input_Keystrokes REC001 (SID 14)"

# NEW
identity = await phi_resolver.resolve(submission.patient_token)
record_id = identity.sid               # "SID_14"
```

**What the manager sees in the REDCap dashboard.** A clean list of
records keyed by SID. No `Patient_` prefix, no filename cruft.
Workflow for filtering, exporting to SPSS, and per-patient
inspection is preserved or improved.

**Why SID at REDCap is the right trade-off.** REDCap is the
project's PHI store of record by design. iREDCap is a
Cedars-Sinai-internal system covered by the BAA; the SID's role
inside REDCap is consistent with every other PHI field REDCap
already holds (consultation dates, survey responses linked to
patients, etc.). Making our own surfaces PHI-free does not require
removing the SID from a system that is itself PHI-by-design.

**Open sub-decision.** Existing records that were created under the
old `Patient_<filename>` identifier — whether to leave them, rename
them via the REDCap API, or recreate them manually given the small
current dataset — is captured as the sub-decision in §7.4.
Recommended approach: rename or manually clean up while the dataset
remains small.

---

## 12. Change log

| Date | Author | Change |
|---|---|---|
| 2026-05-28 | (draft v1) | Initial draft based on the 2026-05-19 task, the AI-repo design hint, and the §2 inventory derived from a code walk on `feat/patient-ui-2026-05-19-feedback` |
| 2026-05-28 | (draft v2) | §7.4 resolved to **Option B** (REDCap keeps SID as `record_id`). Added §5.7 defining "the patient view" and the leakage-path threat model. Added §11 with per-surface detail for all ten places the SID currently lives, including the three that remain after Phase 4 (`phi.patient_identity`, REDCap, on-disk input filenames). Extended §6 Phase 1 and Phase 4 with concrete REDCap conversion and `survey_submission_log.redcap_record_id` handling. Extended §5.6 display rules table with browser-console, print/PDF, and REDCap rows. |
| 2026-05-29 | (draft v3) | Implementation-readiness review against the live code. **Blocking fixes:** redesigned §5.2 identity table (`file_token` PK, non-unique `patient_token`) so it can represent one-patient-many-files (draft-v2's `patient_token` PK + `file_token` UNIQUE forced a 1:1 that contradicts §7.2); added required filename normalization before hashing. Corrected the §5.3 table against `models.py` — `nlp_all_predictions`/`nlp_pipeline_intermediate` carry a *direct* `patient_id`, `llm_domain_scoring_and_summary` also carries `source_filename`, `survey_submission_log`/`doctor_rewrite_log` have **no** `patient_id` (they key on `file`/`speaker`; `doctor_rewrite_log.file` is a composite-PK member → PK redesign), and the answers table is the singular `patient_first_visit_answer`. Added new **§10** (implementation-readiness corrections): identity-model fix, the five §5.3 corrections, pepper-rotation = full cross-table re-key, REDCap de-identified-export note, stale line-reference refresh, and an advisory to keep the token off the cross-table join key. Reconciled the §11.6 DDL with §5.2 and gated §11's "exactly three places" guarantee on the §5.3/§10.2 corrections. |
