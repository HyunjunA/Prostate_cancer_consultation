# 2026-08-27 (Thu) — Manager email: admin gating + de-identifier output directory

> Names are replaced with role labels — **the manager**, **the developer**,
> **the study coordinator**. The email body is otherwise reproduced verbatim,
> including its original wording and typos.
> The host `10.226.8.205` is a LAN-only private address already recorded across
> `docs/setup/` and `docs/operations/`, so it is kept as written.
> Markers: ✅ done / ⬜ not started / 🔄 in progress / ⏸️ deferred.

## 1. Source

- Received by email from **the manager**. Recorded on 2026-08-27.
- The email's own timing cues: *"testing this afternoon 2-4PM"* on the day it was
  sent, and *"We can discuss on Thursday"* — so the send date precedes the
  Thursday discussion. **Exact send date not confirmed.**
- Explicitly **not urgent**: *"This does not have to be done today."*

## 2. Email (verbatim)

> Hi [the developer],
>
> We noticed a few details that will need some revisions. This does not have to be
> done today, specially since there is going to be testing this afternoon 2-4PM.
>
> Later this week we would need to put the patient's and doctor's links behind
> admin, right now the are available via the home page http://10.226.8.205:3001.
> We would need to integrate to the admin page, it could be the admin landing page,
> and have a link for tracking there http://10.226.8.205:3001/admin/tracking
>
> Another thing that will need some work is to be able to set an output directory
> for the de-identifier tool, so that we can choose a OneDrive folder, so that two
> computers would be able to share the same files. This will require to set the
> OneDrive to always keep the files on the individual computers. Also, the CSV that
> have the mapping can be corrupted by opening directly, it might be a good idea to
> add an additional page to the interface to show the links there, so that the user
> does not have to open the CSV and potentially get it corrupted, but access the
> mapping and links through the de-identifier interface.
>
> We can discuss on Thursday, but I wanted to write it so that we don't forget.
>
> Thank you,
>
> [the manager]

## 3. Requirements, decomposed

Three separable requests. R1 is in this repository (webapp); R2 and R3 are in the
sibling AI repository (`secure_transcript_prep/`, the desktop de-identifier).

| # | Requirement | Repo | Effort | Status |
|---|---|---|---|---|
| R1 | Put the patient and doctor entry points behind admin; make the admin page the landing page, with a tracking link on it | dashboard (`app/Webapp`) | small–medium | ✅ done 2026-08-27 |
| R2 | Let the user choose the de-identifier tool's output directory (so it can point at a shared OneDrive folder) | AI repo (`secure_transcript_prep`) | small | ⬜ not started |
| R3 | Add a page to the de-identifier interface that shows the mapping and the links, so the mapping CSV is never opened by hand | AI repo (`secure_transcript_prep`) | medium | ⬜ not started |

---

### R1. Move the patient and doctor links behind admin

**Current state (verified in code):**

- `app/Webapp/src/app/page.tsx` (1008 lines) is the public home page. Its
  `SelectionScreen` renders **the full patient list** plus header links to
  `"/?select=physician"` (Physician View) and `"/admin/tracking"` (Admin).
- `src/middleware.ts` guards `/admin/:path*` only — it verifies the `admin_session`
  HS256 JWT cookie and redirects to `/admin/login` otherwise. **`/` is not
  matched**, so everything on the home page is reachable without logging in.
- `/admin/tracking/page.tsx` is already an "Admin Tracking" hub with cards for
  Upload Transcript, Patient Report, Patient Follow-up Survey Behavior, and Doctor
  Behavior. It is the natural landing page the email describes.

**Work items:**

- ✅ R1-a Removed the browsable patient list and the Physician View link from the
  public home page. Both list screens moved under `/admin`, so the existing
  cookie gate covers them.
- ✅ R1-b Added a new `/admin` landing page (`src/app/admin/page.tsx`) with four
  entry points: Patient Records, Physician View, Tracking, Upload Transcript.
  It did not exist before — `/admin` returned 404.
- ✅ R1-c The public `/` renders a minimal landing screen (heading + "this page is
  accessed through the personal link you were given" + a Staff sign-in link).
  **Not** a redirect to `/admin/login` — see the design tension below.
- ✅ R1-d `middleware.ts` was left untouched. `matcher: ["/admin/:path*"]` already
  covers `/admin`, `/admin/patients` and `/admin/physicians` (verified: all three
  return 307 → `/admin/login?next=…` when signed out).

**Files changed:**

| File | Change |
|---|---|
| `src/app/admin/page.tsx` | new — admin landing page |
| `src/app/admin/patients/page.tsx` | new — gated patient index |
| `src/app/admin/physicians/page.tsx` | new — gated physician roster |
| `src/components/AdminPatientPicker.tsx` | new — renders the list; polling lives in the hook below |
| `src/hooks/usePatientFileList.tsx` | new — list fetch + 5 s processing poll, extracted to keep the picker under the 150-line limit |
| `src/components/AdminPatientTable.tsx` | new — table markup moved from `page.tsx` |
| `src/components/AdminPhysicianPicker.tsx` | new — roster moved from `page.tsx` |
| `src/components/AdminHubCard.tsx` | new — nav card shared by both admin hubs |
| `src/app/admin/tracking/page.tsx` | Upload Transcript card removed (it only lived here while `/admin` did not exist); cards now use `AdminHubCard` |
| `src/app/page.tsx` | −414 lines: list, `?select=physician`, `doctorSelect` view all removed; landing screen added. Deep-link handling untouched |
| `src/app/admin/login/page.tsx` | default landing after sign-in `/admin/tracking` → `/admin` |
| `src/components/AdminTopBar.tsx` | "← Home" `/admin/tracking` → `/admin` |
| `.gitignore` (webapp) | ignore `test-results/` and `playwright-report/` — Playwright's `error-context.md` snapshots the failing page |
| `e2e/_admin_auth.ts` | new — `loginAsAdmin()`, skips without `E2E_ADMIN_USER`/`E2E_ADMIN_PASSWORD` |
| `e2e/public-landing.spec.ts` | new — replaces `selection-screen.spec.ts`; asserts the index is *gone* |
| `e2e/admin-pickers.spec.ts` | new — the moved list behaviour, authenticated |
| `e2e/cross-view-navigation.spec.ts`, `e2e/patient-first-visit-deep.spec.ts`, `e2e/doctor-view-deep.spec.ts` | start from the admin pickers; destination-URL assertions unchanged |
| `src/__tests__/app/page.test.tsx` | landing-screen test rewritten + a "no index leaked back" test |

**Verified after rebuild + `up -d webapp`** (image-baked frontend, so a rebuild was
required; only the `webapp` service was recreated):

- signed out: `/admin`, `/admin/patients`, `/admin/physicians`, `/admin/tracking`
  → 307 to `/admin/login`; `/` and `/admin/login` → 200
- `/` renders no `<table>`, no Physician View link, no row buttons; the retired
  `?select=physician` falls back to the landing screen
- all three distributed deep links still render: `?f=…&view=first-report`,
  `?f=…&survey=follow-up&combined=1`, `?doctorid=…`
- signed in: `/admin/patients` row → `/?f=…&view=first-report`;
  `/admin/physicians` row → `/?doctorid=…` (unchanged destinations)
- signed in: Upload Transcript appears once on `/admin` and no longer on
  `/admin/tracking`, which now shows only its three behavior dashboards
- 262/262 Jest tests pass; production build clean; `JWT_SECRET` still present in
  the container; port binding still `0.0.0.0:3001`
- `public-landing.spec.ts` passes 6/6 against the running container. The
  admin-gated specs still skip: they need `E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD`.
  Unrelated pre-existing failures remain in `survey-submit-flow.spec.ts` and
  `patient-followup-complete-flow.spec.ts`, whose helper waits for a
  "Submit Responses" button that the `surveysSecondVersion` components render as
  "Submit & continue to next section".

**⚠️ Design tension, settled as follows.**
The de-identifier writes three **direct** dashboard links per transcript into
`deid_mapping.csv` (`scripts/deidentify_transcript.py`):

| Column | Shape | Who opens it |
|---|---|---|
| `first_report_link` | `/?f=<stem>&view=first-report` | the patient |
| `followup_link` | `/?f=<stem>&survey=follow-up&combined=1` | the patient |
| `doctor_link` | `/?doctorid=<hashed_doctor>` | the physician |

These all live under `/`, not `/admin/`. **Patients and physicians must be able to
open their own link without an admin login**, so the gate cannot simply cover all
of `/`. The implemented reading: gate the **browsable index** (the patient list and
the physician roster) while leaving the **per-person deep links** publicly
resolvable. → still worth confirming with the manager, but the alternative
(gating `/` outright) would kill every link already handed out.

---

### R2. Configurable output directory for the de-identifier tool

**Current state (verified in code):**

- `secure_transcript_prep/config.py :: output_dir()` **already supports an
  override** via the `STP_OUTPUT_DIR` environment variable. Defaults otherwise:
  - Windows frozen `.exe` → beside the executable
  - macOS `.app` → `~/SecureTranscriptPrep`
  - source run → `<repo>/dist`
- `gui_v2.py:142` computes `self.out_dir = config.output_dir() / OUTPUT_SUBDIR`
  **once at construction**. The GUI has an "open output folder" action
  (`_open_out_dir`) but **no folder picker and no persisted setting**.

So the engine-side capability exists; what is missing is UI plus persistence.

**Work items:**

- ⬜ R2-a Add a folder picker (`filedialog.askdirectory`) to the GUI settings row.
- ⬜ R2-b Persist the choice across launches (a small JSON settings file next to the
  app; must not be baked into the frozen build).
- ⬜ R2-c Re-read `out_dir` at run time rather than only at construction.
- ⬜ R2-d Validate the chosen folder is writable, and surface a clear error if not.
- ⬜ R2-e Rebuild and redistribute — `.github/workflows/build-windows.yml`; the
  coordinator's machine needs the new build. Current version `0.1.0-test`.

**⚠️ OneDrive concerns to raise on Thursday:**

- The email already notes the requirement to set OneDrive to *"always keep the
  files on the individual computers"* (Files On-Demand off). If a file is
  cloud-only, the app will see a placeholder and fail to read it.
- **Two machines writing `deid_mapping.csv` in the same folder will conflict.**
  `pipeline.py :: _append_mapping_row()` appends a row to a single shared CSV. Two
  simultaneous runs produce a OneDrive conflict copy
  (`deid_mapping-<PC name>.csv`) and one machine's row is silently lost.
  → This is a **correctness risk, not a convenience issue**, and needs a decision
  (per-machine mapping files, an append lock, or accept-and-merge).
- **Institutional review**: `deid_mapping.csv` holds the real SID ↔ hash mapping.
  Putting it on OneDrive means the re-identification key is synced to cloud
  storage. Confirm this is permitted before implementing.

---

### R3. Mapping and links viewer inside the de-identifier interface

**Why it is being asked for:** opening `deid_mapping.csv` in Excel can corrupt it —
Excel rewrites the file on save, reformats values, and can mangle long numeric
fields. Today that is the only way to retrieve the links to hand out.

**Current state (verified in code):** the GUI has **no mapping view**. After a run
it shows only the output filename and offers to open the output folder. The full
mapping row is written to `deid_mapping.csv` by `_append_mapping_row()` with these
columns: `real_sid`, `hashed_patient`, `doctor_id`, `hashed_doctor`, `real_date`,
`hashed_date`, `output_file`, `first_report_link`, `followup_link`, `doctor_link`.

**Work items:**

- ⬜ R3-a Add a "Mapping / Links" tab or window that reads `deid_mapping.csv`
  read-only and renders it as a table.
- ⬜ R3-b Per-row copy buttons for the three links (this is the actual daily task —
  the coordinator needs to copy a link, not read a spreadsheet).
- ⬜ R3-c Search/filter by SID and by date.
- ⬜ R3-d Open the file read-only and never write it back, so the viewer itself
  cannot be the corruption source.
- ⬜ R3-e Decide whether to keep writing CSV at all, or move the canonical store to
  a format Excel cannot damage (e.g. JSONL) and export CSV on demand.

**Note:** `config.py :: base_url()` returns `""` unless `DASHBOARD_BASE_URL` is
set, in which case the mapping links are stored **relative** (`/?f=...`) and are
not copy-pasteable. For R3-b to be useful, `DASHBOARD_BASE_URL` must be set to
`http://10.226.8.205:3001` in the build secrets — otherwise the viewer must
prepend the host itself.

---

## 4. Open questions for Thursday's discussion

- [x] **R1 scope** — implemented as "only the browsable index is gated; the
      per-person deep links stay public". Confirm with the manager; the
      alternative breaks every link already distributed.
- [x] **R1 public page** — `http://10.226.8.205:3001/` now shows a minimal landing
      screen (heading + "use your personal link" + Staff sign-in), not a redirect.
- [ ] **R2 conflict policy** — how should two machines share one
      `deid_mapping.csv` on OneDrive without losing rows?
- [ ] **R2 compliance** — is syncing the re-identification mapping to OneDrive
      approved?
- [ ] **R3 scope** — read-only viewer only, or also editing/deletion of rows?
- [ ] **R3 links** — set `DASHBOARD_BASE_URL` so the mapping stores absolute URLs?
- [ ] **Deadline** — the email says "later this week"; today (Thursday) is already
      the discussion date, so a target date is needed.

## 5. Next actions

1. ✅ **R1 shipped 2026-08-27** — implemented and redeployed ahead of the other two
   at the developer's request (the plan below had it last). The one open point is
   confirming the scope reading with the manager: only the index is gated.
2. Raise R2's ⚠️ items (OneDrive conflict policy, compliance) at Thursday's
   discussion **before** writing any code — they change the design.
3. R2 next once scope is confirmed: it is the smallest change and unblocks nothing
   else (`STP_OUTPUT_DIR` already exists; the work is GUI + persistence).
4. R3 in the same GUI change set, so the coordinator gets one rebuild rather
   than two.

## 6. Not affected

- The 2–4 PM testing session referenced in the email is unaffected; the email
  explicitly defers all three items.
- No pipeline, backend, or database change is implied by any of the three requests.
- No change to the de-identification algorithm itself (AES-SIV hashing and the
  PHI_Removal text stage are untouched).

## References

- Home page: `app/Webapp/src/app/page.tsx`
- Admin gate: `app/Webapp/src/middleware.ts`, `app/Webapp/src/app/admin/layout.tsx`
- Admin hub: `app/Webapp/src/app/admin/tracking/page.tsx`
- De-identifier app: `../AI_physician_patient_communication/secure_transcript_prep/`
  (`config.py`, `gui_v2.py`, `pipeline.py`, `README.md`)
- Mapping fields: `../AI_physician_patient_communication/scripts/deidentify_transcript.py`
- Windows build: `../AI_physician_patient_communication/.github/workflows/build-windows.yml`
