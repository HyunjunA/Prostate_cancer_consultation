# 2026-07-30 (Thu) — Webapp interface changes (meeting feedback)

> Extracted from four meetings on 7/30: **only the webapp interface items** (patient
> report and survey, physician dashboard, audit page).
> The DB and admin deployment topics live in `2026-07-30_prod_deploy_db_admin.md`.
> Windows de-identification app, REDCap, and deployment items are excluded in §D.
> Markers: ✅ done / ⬜ not started / ⏸️ deferred / ⚠️ partial.

## 0. Sources (four meetings on 7/30)

- ID mapping, REDCap, production URL
- Pre-E2E-test check
- Notes (specific items)
- Full E2E live test and onboarding

Components in scope: patient first visit `PatientInitialVisitReportV42`, follow-up
`PatientFollowUpReportV38`, physician `PhysicianReportsModifiedV41Timothy`, audit
`app/admin/tracking/*`.

---

## A. Patient webapp (report + survey)

| # | Item | Detail | Status |
|---|---|---|---|
| A1 | **Risk Perception 2** — auto-scroll to top on step change | `survey_type='risk_perception_2'` (the five-domain step). Scroll the viewport to the top on Next. Applies to `PatientInitialVisitReportV42` (survey mode) and the V38 Total Survey risk step | ✅ done (`000a906`) |
| A2 | **Lock survey answers** | Editable while in progress, **read-only after final submission**. Covers the whole patient survey (Risk Perception 2 plus the follow-up SDM/DCS/Satisfaction) | ✅ done (`62d8807` + `ab305db`) |
| A3 | **Usage tutorial** | "Click a card to expand" guidance with an arrow. The meeting treated this as **under review** (concern that it is overkill; decide after physician testing; intervention arm only). The video is a separate deliverable | ⏸️ deferred — reconfirm at a meeting |
| A4 | **Survey → welcome navigation** | Welcome always clickable in the sidebar, so the patient can return mid-survey. No effect on answers or submission state | ✅ done (`6d86410`) |
| A5 | **Make "more topics below" work** | Only the small pill of the scroll hint badge is clickable (the surrounding area keeps `pointer-events-none`) → clicking scrolls down | ✅ done (`d65e826`) |

## B. Physician dashboard and audit page

| # | Item | Detail | Status |
|---|---|---|---|
| B1 | **Remove the blinking score** | Removed the blinking score animation on the doctor page, plus the hover border | ✅ done (`0cd2a98`) |
| B2 | **Make the rubric/criteria visible, with improvement guidance** | A **scoring rubric toggle** under "How would you say it better?" in Re-write Practice, reusing the existing floating RubricBody scoped to the current domain and score. Outline pill button | ✅ done (`7ad3b01`) |
| B3 | **Previous/next page buttons** | **Added a back button at the bottom** of the doctor page grid and detail views (previously top only) → now both. Unified the ghost/outline design across four places with a shared `BackButton`. Note: "previous/next" here means returning to the previous page, not scrolling | ✅ done (`72e0da4`) |
| B4 | **Auto-scroll to top on page change** | `window.scrollTo(top:0)` when `currentView` changes (dashboard/grid/detail) on the physician screens. Same pattern as A1 | ✅ done |
| B5 | **Hide filenames, show "Visit 1/2/3"** | Removed the meaningless internal filename from the physician screens → **the screen shows only "Visit 1/2/3"**. The filename itself stays hashed for security (`hash(patient)_hash(doctor)_date`), and reverse lookup goes only through the mapping sheet. Note (correction 2026-08-06): the claim "keep the patient ID hash" had no basis and was removed | ✅ done (`0ec4106`) |
| B6 | **Audit page: per-session behaviour log** | Topic views, rubric open/close, dwell time, return visits (a new session) | ✅ done (already covered by existing functionality — no extra work) |

## C. Already applied (backend / interface side)

- ✅ **"visit date" → "processing date"** label (avoids PHI; only the name changed, not the
  field)
- ✅ **Reject when there is no matching REDCap record** — `record_exists`
  (`test/caire-server` → `staging/caire`)

## D. Excluded — not interface work (Windows de-identification app / REDCap / deployment)

- The de-identification app produces four links where there should be three
- EXE install location and embedded API key
- The `SID_` prefix (the app's canonical naming), the mapping sheet, and the ban on
  CSV↔Excel conversion
- **Hard-coded base URL plus deployment to the real server**, and **removing the "30
  seconds" loading copy plus the UI scale/text breakage in the Windows app**
- Provider-name dropdown (doctor ID mapping), upload field → link/email alert (REDCap),
  and the randomisation branch redesign (REDCap)

---

## Progress summary

- **A (patient webapp)**: A1, A2, A4, A5 ✅ done; **A3 ⏸️ deferred** (to be settled after
  physician testing) → everything except A3 is complete
- **B (physician dashboard and audit)**: B1, B2, B3, B4, B5 ✅ done; **B6 ✅** (already
  covered by existing functionality)
  - B1 `0cd2a98` · B2 `7ad3b01` · B3 `72e0da4` · B4 `7e7b9ad` · B5 `0ec4106`
- **Nothing outstanding.** Only A3 remains deferred, to be revisited depending on the
  physician testing results.
- Also delivered: a `?patientid=on` URL trigger that shows the hashed patient id
  alongside the label as "Visit N · hash" on the physician screen (the default remains
  "Visit N" alone) — `7adb508`.
