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
| R1 | Put the patient and doctor entry points behind admin; make the admin page the landing page, with a tracking link on it | dashboard (`app/Webapp`) | small–medium | ⬜ not started |
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

- ⬜ R1-a Remove the browsable patient list and the Physician View link from the
  public home page (or gate them behind the same admin cookie).
- ⬜ R1-b Add "Patient view" and "Doctor view" entry points to the admin landing
  page, alongside the existing tracking cards.
- ⬜ R1-c Decide what the public `/` should show once the list is gone — a plain
  landing/welcome screen, or a redirect to `/admin/login`.
- ⬜ R1-d Extend `middleware.ts` matcher if the gate must cover more than `/admin/*`.

**⚠️ Design tension that must be settled before implementing.**
The de-identifier writes three **direct** dashboard links per transcript into
`deid_mapping.csv` (`scripts/deidentify_transcript.py`):

| Column | Shape | Who opens it |
|---|---|---|
| `first_report_link` | `/?f=<stem>&view=first-report` | the patient |
| `followup_link` | `/?f=<stem>&survey=follow-up&combined=1` | the patient |
| `doctor_link` | `/?doctorid=<hashed_doctor>` | the physician |

These all live under `/`, not `/admin/`. **Patients and physicians must be able to
open their own link without an admin login**, so the gate cannot simply cover all
of `/`. The workable reading of the request is: gate the **browsable index** (the
patient list and the physician roster on the home page) while leaving the
**per-person deep links** publicly resolvable. → confirm this reading on Thursday.

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

- [ ] **R1 scope** — does "behind admin" mean only the browsable patient/physician
      index, with the per-person deep links staying public? (See the R1 design
      tension: patients cannot log in as admin.)
- [ ] **R1 public page** — what should `http://10.226.8.205:3001/` show once the
      list is removed? Landing screen, or redirect to `/admin/login`?
- [ ] **R2 conflict policy** — how should two machines share one
      `deid_mapping.csv` on OneDrive without losing rows?
- [ ] **R2 compliance** — is syncing the re-identification mapping to OneDrive
      approved?
- [ ] **R3 scope** — read-only viewer only, or also editing/deletion of rows?
- [ ] **R3 links** — set `DASHBOARD_BASE_URL` so the mapping stores absolute URLs?
- [ ] **Deadline** — the email says "later this week"; today (Thursday) is already
      the discussion date, so a target date is needed.

## 5. Next actions

1. Raise the four ⚠️ items in section 3 at Thursday's discussion **before** writing
   any code — R1's scope and R2's OneDrive conflict policy both change the design.
2. R2 first once scope is confirmed: it is the smallest change and unblocks nothing
   else (`STP_OUTPUT_DIR` already exists; the work is GUI + persistence).
3. R3 next, in the same GUI change set, so the coordinator gets one rebuild rather
   than two.
4. R1 last — it touches the public entry point and needs to be verified against the
   test session before it ships.

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
