# V37 Patient First Visit — Persistence Design

## Document Overview

| Item | Description |
|---|---|
| **Status** | Design — implementation in progress on `feat/v37-first-visit-persistence`. |
| **Purpose** | Captures the design rationale for persisting the 14 experimental-arm inputs added in `PatientInitialVisitReportV37.tsx`. Trade-offs and resolved decisions are recorded here so the implementation can proceed with full context. |
| **Audience** | Backend / frontend developers and the research team owning V37. |
| **Scope** | One new table (`patient_first_visit_responses`), two new API endpoints (`GET` + `PUT`), one new webapp hook, plus the existing V37 component edited to use them. |
| **Out of scope** | REDCap mirroring of the new fields, behavior-tracking events on save, backfill of pre-persistence data, broader auth/login work (login feature was dropped per team decision 2026-05-07). |
| **Related files** | `app/Webapp/src/components/PatientInitialVisitReportV37.tsx`, `app/Backend/migrations/versions/`, `app/Backend/routes_patient.py`, `app/Backend/models.py` |
| **Related tasks** | `daily_control_logs/2026-05-07_TASKS.md` (today's plan), `daily_control_logs/2026-04-30_TASKS.md` Gap A / P0-D-2, GitHub Issue #4 |

---

## 1. Context

### 1.1 What V37 is

`PatientInitialVisitReportV37.tsx` is the latest version of the patient first-visit screen. The webapp follows a versioned-component convention (`V29` → `V31` → `V33` → `V35` → `V37`): when a screen grows past the ~150-line component-size guideline or its UX changes substantially, a new version file is started rather than expanding the existing one in place.

### 1.2 Control vs experimental arm

The study is a randomised trial. Patients are split into two arms:

| Arm | What they see |
|---|---|
| **Control** | Standard consultation report. |
| **Experimental** | Standard report **plus** an AI-generated summary card per clinical domain, **plus** 14 additional cognition / understanding questions placed directly under each domain card. |

The 14 questions exist only on the experimental arm. They are how the study measures whether the AI summary closed (or widened) the doctor-patient understanding gap.

### 1.3 The five clinical domains

| Code | Name |
|---|---|
| `cp` | Cancer Prognosis |
| `le` | Life Expectancy |
| `ed` | Erectile Dysfunction |
| `inc` | Urinary Incontinence |
| `ius` | Irritative Urinary Symptoms |

---

## 2. The 14 fields

Per-domain breakdown, with the React state symbol in the V37 source file shown in code font.

| Domain | Field | What it asks the patient | Input shape | V37 state |
|---|---|---|---|---|
| cp | Risk of dying — without treatment | Patient's understanding of cancer death risk if untreated. | VAS slider 0–100 | `cpRiskWithoutTreatment` |
| cp | Risk of dying — with treatment | Same risk, with treatment. | VAS slider 0–100 | `cpRiskWithTreatment` |
| cp | Time period | Over what horizon was the risk quoted (5 / 5–10 / 11–15 / 16–20 / 20–30 years). | Single-select radio (5 options, coded `B`–`F`) | `cpTimePeriod` |
| le | Projected life expectancy | Patient's understanding of their own life-expectancy estimate. | Single-select radio (`Less than 5 years` / `5-10 years` / `11-15 years` / `16-20 years` / `More than 20 years`) | `leProjectedLE` |
| le | Factors considered | Which factors patient believes the doctor weighed. | Multi-select checkbox: `Tumor grade`, `Age`, `Marital status`, `Health conditions or comorbidities`, `Tumor stage` | `leFactors` |
| ed | Likelihood of returning to baseline | Probability of regaining baseline erectile function. | VAS 0–100 | `edBaselineReturn` |
| ed | Time period | Over what timeline. | Radio (5 options) | `edTimePeriod` |
| ed | Factors considered | Multi-select. | Checkbox: `Tumor grade`, `Age`, `Tumor stage`, `Health conditions or comorbidities`, `Baseline function` | `edFactors` |
| inc | Risk of urinary incontinence | Patient's perceived risk. | VAS 0–100 | `incRisk` |
| inc | Timeline | Same five-option radio. | Radio | `incTimeline` |
| inc | Factors considered | Same five-option checkbox as ed. | Checkbox | `incFactors` |
| ius | Risk of irritative LUTS | Patient's perceived risk. | VAS 0–100 | `iusRisk` |
| ius | Timeline | Radio. | Radio | `iusTimeline` |
| ius | Factors considered | Same five-option checkbox as ed. | Checkbox | `iusFactors` |

Total: 5 VAS + 5 radios + 4 checkboxes = **14 fields**. The cp domain has no factor checkbox.

### 2.1 Frontend baseline as of today

V37 already holds all 14 inputs in `React.useState`. As of 2026-05-07 the page also has a per-domain **Submit** button (5 buttons total) and a working "Submission Progress" indicator that counts how many domains the patient has clicked Submit on. Today's frontend changes do not yet write anything to the backend — Submit only mutates an in-memory `submittedDomains` map, and a reload erases everything. This document describes how to promote that Submit click into a real persistence event.

---

## 3. Persistence design

### 3.1 Why a separate table (not extending `patient_summary_domain`)

| Option | Verdict |
|---|---|
| Extend `patient_summary_domain` with 4 new columns | **Rejected.** The control arm uses the same table; control rows would carry four perpetually-NULL columns, and the table's intent ("per-domain summary, scoring, free-text response") would blur. |
| Embed the 14 fields inside `patient_first_behavior` (the click-tracking table) | **Rejected.** That table records UI events, not survey answers. Mixing semantics makes both queries harder. |
| Five small tables, one per domain | **Rejected.** Five tables for four shared columns is over-normalised. A single table with a `domain` discriminator is simpler. |
| **One new table, one row per `(file, speaker, domain)`** | **Chosen.** Cleanly isolates experimental-arm responses, leaves existing tables untouched, and fits the per-domain Submit UX exactly (one Submit click writes one row). |

### 3.2 Schema

```sql
CREATE TABLE patient_first_visit_responses (
    id              SERIAL       PRIMARY KEY,
    file            VARCHAR(255) NOT NULL,
    speaker         VARCHAR(100) NOT NULL,
    domain          VARCHAR(100) NOT NULL,

    vas_primary     INTEGER,
    vas_secondary   INTEGER,
    timeline        VARCHAR(50),
    factors         JSONB,

    submitted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_first_visit
        UNIQUE (file, speaker, domain),
    CONSTRAINT ck_domain
        CHECK (domain IN ('cp','le','ed','inc','ius')),
    CONSTRAINT ck_vas_primary
        CHECK (vas_primary BETWEEN 0 AND 100),
    CONSTRAINT ck_vas_secondary
        CHECK (vas_secondary BETWEEN 0 AND 100),
    CONSTRAINT fk_first_visit_to_patient_summary
        FOREIGN KEY (file, speaker)
        REFERENCES patient_summary(file, speaker)
        ON DELETE CASCADE
);

CREATE INDEX idx_pfvr_file_speaker
    ON patient_first_visit_responses(file, speaker);
```

### 3.3 Column rationale

| Column | Why |
|---|---|
| `id SERIAL PRIMARY KEY` | A single-integer surrogate PK keeps later references and ORM logging trivial. Uniqueness of the natural key is enforced separately by `uq_first_visit`. |
| `file VARCHAR(255)` | Matches `patient_summary.file` exactly so the FK lines up; consistent with every other patient-keyed table. |
| `speaker VARCHAR(100)` | Same — pairs with `file` to identify the patient inside the transcript. |
| `domain VARCHAR(100)` | One row per domain means the discriminator is a column, not a wide schema with `cp_*`, `le_*` columns. |
| `vas_primary INTEGER` | The "main" VAS for whichever domain this row represents (cp = without-treatment, ed/inc/ius = single VAS, le = NULL). NULL allowed because (a) le has no VAS at all, (b) if Submit ever lands with the slider untouched the column simply records that. |
| `vas_secondary INTEGER` | Only cp uses two VAS sliders; this column is the second one. NULL for every other domain, forever. JSONB-packing was rejected because numeric range queries (`vas_secondary > 50`) are common in research analysis and benefit from a typed column. |
| `timeline VARCHAR(50)` | All five domains have a single-select radio; the value shape differs (cp uses short codes like `B`, le uses prose like `5-10 years`), but all fit comfortably in a 50-char text column. |
| `factors JSONB` | Multi-select. JSONB chosen over a separate join table for compactness, and over comma-separated text for query support (`factors @> '"Age"'`). cp is always NULL here. Element-level whitelist validation lives at the Pydantic layer (see §5). |
| `submitted_at TIMESTAMPTZ` | When the patient clicked Submit for this `(file, speaker, domain)`. Useful for "time-from-summary-to-answer" analysis. `TIMESTAMPTZ` matches every other timestamp in this schema; UTC at the wire keeps timezone bugs out. The upsert path resets this on every Submit (see §5). |

#### 3.3.1 Columns intentionally **not** included

| Column | Why not |
|---|---|
| `visit_version` | All rows would currently carry the same constant `'v37'`, so the column would be informationless at write time. A future V39 will likely change more than just a label (different question set, different validation rules, possibly new columns), so a single string column would not actually save us future migration work. The repo-wide CLAUDE.md guidance is explicit: *"Don't design for hypothetical future requirements."* If a V39 ever ships, an Alembic migration at that point can add `visit_version` along with whatever other columns the new design actually needs. |
| `updated_at` | The system has no other "did this row get edited later" tracking — `patient_summary_domain.patient_scoring` overwrites silently, with no audit trail. Adding `updated_at` only here would create an inconsistent special case. The research team has not flagged "did the patient revise their answer?" as a V37 question. If it ever becomes one, a follow-up migration can add the column with `server_default=submitted_at` to backfill cleanly. |

### 3.4 Constraint rationale

| Constraint | Why |
|---|---|
| `UNIQUE (file, speaker, domain)` | Without it, repeated Submit clicks could insert duplicate rows for the same domain. With it, the upsert path collapses to "select then update". |
| `CHECK (domain IN ('cp','le','ed','inc','ius'))` | Defence in depth. Pydantic blocks the bad value at the API edge; this catches anything entering via direct SQL (admin scripts, ad-hoc fixes). |
| `CHECK (vas_primary BETWEEN 0 AND 100)` | Same idea for the slider range. |
| `CHECK (vas_secondary BETWEEN 0 AND 100)` | Same. |
| `FOREIGN KEY (file, speaker) REFERENCES patient_summary(file, speaker) ON DELETE CASCADE` | Enforces that responses always belong to a registered patient. CASCADE makes patient-deletion cleanups automatic. **The FK targets `patient_summary`, not `patient_summary_domain`**, because the domain row may not exist for every patient (it is itself created by an upsert in `routes_patient.update_patient_scoring`); pointing at `patient_summary` avoids spurious FK failures while still anchoring the row to a real patient. |

### 3.5 Index rationale

The dominant read query is "fetch all of one patient's domain responses":

```sql
SELECT * FROM patient_first_visit_responses
WHERE file = ? AND speaker = ?;
```

The `UNIQUE (file, speaker, domain)` constraint already creates a 3-column composite index whose `(file, speaker)` prefix can serve this query. The explicit `idx_pfvr_file_speaker` is added as documentation: it makes the intent obvious to future readers and is robust to any reordering of the unique columns later.

---

## 4. API contract

Two endpoints under the existing `routes_patient.py` router.

### 4.1 `GET /api/patient/first-visit-responses/{file}/{speaker}`

Returns the patient's responses, keyed by domain. The response always includes all five domain keys; missing rows come back as `null`.

```json
{
  "responses": {
    "cp":  { "vas_primary": 35, "vas_secondary": 60, "timeline": "B",          "factors": null,                           "submitted_at": "2026-05-05T09:36:48Z" },
    "le":  { "vas_primary": null, "vas_secondary": null, "timeline": "5-10 years", "factors": ["Age", "Tumor stage"],     "submitted_at": "2026-05-05T09:37:12Z" },
    "ed":  null,
    "inc": null,
    "ius": null
  }
}
```

Stable shape lets the frontend index directly without null-checking the `responses` object itself.

### 4.2 `PUT /api/patient/first-visit-responses`

Upsert one row. Called when the patient clicks Submit on a domain card. The body carries every field the patient touched; unsent fields are left at NULL on first write or untouched on subsequent writes.

```json
{
  "file": "Input_Keystrokes REC 001 (SID 10).xlsx",
  "speaker": "Patient",
  "domain": "cp",
  "vas_primary": 35,
  "vas_secondary": 60,
  "timeline": "B",
  "factors": null
}
```

Response: the canonical row after the upsert (so the client can reconcile any server-side normalisation).

### 4.3 Auth and ACL

Both endpoints follow the existing patient-route pattern:

```python
db: AsyncSession = Depends(get_db),
user: AuthUser   = Depends(get_current_user),
...
await check_patient_access(file, user, db)
```

The auth model: `AUTH_MODE` env var (default `api_key`) selects the backend. In `api_key` mode, `APIKeyBackend.authenticate` validates the `X-API-Key` header and returns a synthetic `is_superuser=True` user; `check_patient_access` short-circuits at the superuser check, so the `auth_user` and `patient_access` tables are not consulted. When the backend is reconfigured to JWT or OAuth2 in the future, the same code path will start enforcing per-patient ACL automatically — no edits to the new endpoints required.

### 4.4 Pydantic validation

`schemas.py` adds:

- `DomainLiteral = Literal["cp", "le", "ed", "inc", "ius"]`
- `FirstVisitResponseUpsert` with `Field(ge=0, le=100)` on the two VAS fields
- `field_validator("factors")` that rejects (a) any factors at all when `domain == "cp"`, (b) any factor not in the per-domain whitelist for `le`, `ed`, `inc`, `ius`
- `field_validator("vas_secondary")` that rejects values when `domain != "cp"`

The whitelist mirrors the literal arrays in `PatientInitialVisitReportV37.tsx` so any future factor-list edit must touch both files (the integration tests catch a mismatch).

---

## 5. Upsert pattern

The existing `update_patient_scoring` endpoint sets the convention: select-then-update-or-insert, **not** `INSERT ... ON CONFLICT`. The reasoning recorded in that route applies here too — a row may not exist yet, and `ON CONFLICT` requires expressing the same upsert logic at SQL level which is harder to read. We follow the same shape:

```python
stmt = select(PatientFirstVisitResponses).where(
    PatientFirstVisitResponses.file == body.file,
    PatientFirstVisitResponses.speaker == body.speaker,
    PatientFirstVisitResponses.domain == body.domain,
)
record = (await db.execute(stmt)).scalars().first()

payload = body.model_dump(exclude_unset=True,
                          exclude={"file", "speaker", "domain"})

if record:
    for key, value in payload.items():
        setattr(record, key, value)
    record.submitted_at = func.now()
else:
    record = PatientFirstVisitResponses(
        file=body.file, speaker=body.speaker, domain=body.domain,
        **payload,
    )
    db.add(record)

await db.commit()
await db.refresh(record)
```

`exclude_unset=True` is the linchpin: clients that send only the field they changed do not accidentally null other columns. Re-Submits overwrite — `submitted_at` is reset on every PUT, which is acceptable because the system does not track edit history and the research team has not asked for one.

---

## 6. Webapp integration

### 6.1 Lifecycle

```
V37 mounts
   |
   |  useFirstVisitResponses(file, speaker)  ← new hook
   |
   |--> useEffect: GET /api/patient/first-visit-responses/{file}/{speaker}
   |       on success: populate cache, set isHydrated=true
   |       on failure: set error, set isHydrated=true (UI still usable)
   |
   |--> 14 useState slots prefilled from the hook's cache once isHydrated
   |
   |--> patient clicks Submit on a domain card:
   |       collect that domain's local state into a payload
   |       saveDomain(domain, payload)         ← single PUT
   |       on success: parent flips submittedDomains[topic] = true
   |       on failure: inline error on the card; progress count stays
```

### 6.2 Hydration race

If the user starts typing before the GET resolves, the local React state still updates, and the eventual GET payload prefills only the **other** domains the user hasn't touched. This protects the user's in-progress input from being clobbered by stale server state.

### 6.3 Error handling

Network or 5xx errors surface through the hook's `error` state. The Submit button on that card flips back to its un-submitted style and shows a small "Save failed — try again" indicator; `submittedDomains[topic]` is **not** flipped to true on failure, so the progress count truthfully reflects what is persisted. Validation errors (422 from Pydantic) cause a domain-card-level error banner with the server's message.

---

## 7. Migration mechanics

The codebase uses Alembic (versions in `app/Backend/migrations/versions/`). The current head is `009_widen_llm_text_columns`. This work introduces `010_add_patient_first_visit_responses`.

`database_schema.sql` is the **001 baseline** snapshot and is **not** edited for new work. Migrations 002–009 already evolve the schema past that snapshot; 010 continues the same pattern. The bootstrap script `app/Backend/scripts/init-db-native.sh` runs `database_schema.sql` first and then `alembic upgrade head`, so a fresh install applies the baseline plus every migration in order.

`upgrade()` creates the table and the index. `downgrade()` drops them. The integration test suite exercises both directions to keep the migration reversible.

---

## 8. Test plan

| Layer | Scope |
|---|---|
| Alembic | `alembic upgrade head` then `alembic downgrade -1` then `alembic upgrade head` again — table comes back identical. |
| Backend integration | (a) PUT-then-GET round-trip; (b) partial PUT preserves untouched columns; (c) anonymous request → 403; (d) wrong-API-key → 403; (e) invalid VAS rejected at 422; (f) `factors` on cp rejected; (g) `Baseline function` factor on le rejected (le-specific whitelist); (h) `vas_secondary` rejected on non-cp domains; (i) deleting the parent `patient_summary` row cascades the response away. |
| Backend unit | Pydantic validators are tested in isolation. |
| Webapp hook (Jest) | `isHydrated=false` blocks PUT; PUT failure leaves `submittedDomains` untouched; 422 surfaces an error without retrying. |
| Manual end-to-end | Fill the 14 inputs in a browser, click Submit on each domain, reload, confirm restore; sever the network mid-Submit, confirm the failure indicator appears and the progress count does not advance. |
| Playwright e2e | Out of scope for this PR; covered by P0-D-1 (Issue #3) once the CI fixture seed lands. |

---

## 9. Risks tracked

| Risk | Mitigation |
|---|---|
| Submit fails silently on network drop | Hook surfaces an error state; Submit button reverts; progress count stays accurate. |
| Hydration race overwrites user input | `isHydrated` guard + "local state wins on conflict" rule. |
| Concurrent edits across tabs produce inconsistent rows | Last-write-wins via UNIQUE + select-then-update. |
| FK violation when patient row missing | V37 does not render without an existing `patient_summary`; if it ever does, the API rejects cleanly. |
| Factor whitelist drift between webapp and Pydantic | Integration test enforces the two lists match. |
| Migration applied without backend/webapp changes | The PR ships all three together as one unit. |
| `API_KEY` env unset on webapp container start | Recreate the webapp with `export API_KEY=$(grep '^API_KEY=' app/Backend/.env | cut -d= -f2)` first. |

---

## 10. Files touched by the implementation

Backend:

- `app/Backend/migrations/versions/010_add_patient_first_visit_responses.py` (new)
- `app/Backend/models.py` (add `PatientFirstVisitResponses`)
- `app/Backend/schemas.py` (add upsert / read schemas + validators)
- `app/Backend/routes_patient.py` (add GET + PUT endpoints)
- `app/Backend/tests/integration/test_first_visit_responses.py` (new)

Webapp:

- `app/Webapp/src/api/firstVisitApi.ts` (new typed fetch wrapper)
- `app/Webapp/src/hooks/useFirstVisitResponses.tsx` (new)
- `app/Webapp/src/components/PatientInitialVisitReportV37.tsx` (further edited: consume the hook; replace the local-only Submit handler with one that PUTs and only flips submittedDomains on success)
- `app/Webapp/src/__tests__/hooks/useFirstVisitResponses.test.ts` (new)

Docs and tracking:

- `docs/architecture/DATABASE_SCHEMA.md` (add the new table to the schema doc; bump table count from 18 to 19)
- `dev_docs/TODO.md` (close P0-D-2)
- `daily_control_logs/2026-04-30_TASKS.md` (mark Gap A complete; close login-related items per team decision)
- `daily_control_logs/2026-05-07_TASKS.md` (today's plan; will be updated as each step closes)

The PR description references GitHub Issue #4 with `Closes #4`.
