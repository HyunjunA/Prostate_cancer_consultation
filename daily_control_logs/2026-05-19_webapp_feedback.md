# Webapp Feedback & Action Items — 2026-05-19

## Metadata
- **Date**: 2026-05-19
- **Target**: `app/Webapp/` (Next.js 13 frontend) and related backend support
- **Source**: TBD (to be filled in — meeting / email / Slack / user testing)
- **Reporter role**: TBD (manager / collaborator / patient tester / etc.)
- **Status**: open — awaiting full feedback body for remaining items

## Document conventions
- Real names replaced with role labels per repository convention.
- Companion Korean version: `2026-05-19_webapp_feedback_KR.md`.
- Each task should move into a dedicated plan doc under `dev_docs/` before implementation begins.

---

## Outgoing message context (sent in reply)

Paraphrased outgoing reply that anchors the upcoming-tasks section below:
> "I am also preparing the setup so that it can run properly on the collaborator's local machine as well. For the other tasks mentioned last week — including the Admin Page and Patient ID randomization/hash functionality — I will proceed with them next according to the priorities outlined."

---

## Feedback items received on 2026-05-19

### Item 1. Remove disclaimer from patient interface

- **Exact sentence to remove**:
  > "This report is informational only and is in no way grading your physician."

- **Location**:

  | File | Line | Status |
  |---|---|---|
  | `app/Webapp/src/components/PatientInitialVisitReportV37.tsx` | **3494** | active (V37) |
  | `app/Webapp/src/components/PatientInitialVisitReportV35.tsx` | **1816** | legacy (V35) |

- **Code context** (V37, lines 3484–3495):
  ```tsx
  {/* [V35] Disclaimer — feedback 2-8 */}
  <div
    className={cx(
      "mb-4 sm:mb-6 px-3 sm:px-5 py-3 sm:py-4 rounded-2xl border text-center text-sm",
      isDarkMode
        ? "bg-amber-500/10 border-amber-500/20 text-amber-300/90"
        : "bg-amber-50 border-amber-200/60 text-amber-800",
    )}
  >
    <Info size={16} className="inline-block mr-2 -mt-0.5 opacity-70" />
    This report is informational only and is in no way grading your physician.
  </div>
  ```

- **Visual position**:
  - Screen: Patient First Visit Report (patient interface).
  - Element: amber-colored background box with `Info` icon, center-aligned text.
  - Relative position: directly above the `InstructionsBox` in the page body.
  - Code comment: `[V35] Disclaimer — feedback 2-8` (added in a prior feedback round).

- **Requested action**: **Confirmed — remove the entire `<div>` block (not just the text) from the patient interface.**

- **Open decisions**:
  1. Touch the legacy V35 file too, or only active V37?
  2. Confirm full block removal vs. replacement with different wording. (Current plan: full removal.)

### Item 2. Move patient questions onto a dedicated separate page  *(HIGHEST PRIORITY)*

- **Goal**: Restructure the patient interface so that the questions/answers UI is on its own standalone page, not inline below the current patient report page.

- **Required changes**:
  1. Extract the question-answering UI out of the current patient page into a dedicated page of its own.
  2. Add a **"Next page"** button at the **very bottom** of the current patient page that navigates to the new question page.
  3. Users answer the questions on the new dedicated page (not on the current patient page anymore).

- **Priority**: **HIGHEST** — this supersedes the prior-week priorities for this round.

- **Open questions to clarify**:
  - Which patient view does this apply to?
    - Patient First Visit (`PatientInitialVisitReportV37.tsx`) — `patient_scoring` + `patient_response` per domain card, or
    - Patient Follow-up (`PatientFollowUpReportV31Re.tsx`) — DCS / SDM / Risk Perception / Satisfaction surveys, or
    - Both?
  - Routing approach: a new Next.js route (e.g. `/patient/questions`) versus an in-app view-state switch driven by query string (current single-`page.tsx` pattern)?
  - Persistence: should answers be auto-saved on navigation? Allow editing after going back?
  - Back-navigation behavior: can the patient return to the report page after starting the questions?
  - Mobile / tablet layout considerations for the split.

- **Likely files involved**:
  - `app/Webapp/src/components/PatientInitialVisitReportV37.tsx` (if first visit)
  - `app/Webapp/src/components/PatientFollowUpReportV31Re.tsx` (if follow-up)
  - `app/Webapp/src/app/page.tsx` — current query-string-driven routing
  - New file likely needed under `app/Webapp/src/app/` (new route) or `src/components/` (new component) depending on routing approach chosen.

- **Status**: confirmed, not started — design decision required first (which page, routing approach).

### Item 3. Add a visual cue to the "View relevant sentences from your visit" toggle

- **Goal**: Add an appropriate visual effect to the per-category "View relevant sentences from your visit" button so patients are reminded to click it and don't forget to look at the supporting sentences.

- **Location**:

  | File | Line | Description | Status |
  |---|---|---|---|
  | `app/Webapp/src/components/PatientInitialVisitReportV37.tsx` | **2548–2572** | the button itself (per domain card) | active (V37) |
  | `app/Webapp/src/components/PatientInitialVisitReportV37.tsx` | 810 | instructional text mentioning this button | active (V37) |
  | `PatientInitialVisitReportV35.tsx` | 804 | same button pattern | legacy |
  | `PatientInitialVisitReportV33.tsx` | 758 | same button pattern | legacy |
  | `PatientInitialVisitReportV31.tsx` | 737 | same button pattern | legacy |

- **Button text** (V37, lines 2563–2565):
  ```tsx
  {showEvidence ? "Hide" : "View"} relevant sentences from your visit
  ```

- **Current behavior**: Plain toggle button per domain card — white/slate background, gray border, `MessageSquareText` icon, no animation or attention-grabbing styling. Easy for patients to overlook.

- **Requested change**: Add a visual cue that draws attention without being intrusive. Options to consider:
  - Subtle pulse animation on the button.
  - Glowing border / shadow ring.
  - One-time highlight on first appearance (fades after a few seconds).
  - Tooltip / arrow indicator.
  - Animated icon (`MessageSquareText`) on first load.
  - Color shift to a higher-contrast tone for this specific button.

- **Scope**: per-domain card on the Patient First Visit Report — 5 cards total: `cp` / `le` / `ed` / `inc` / `ius`.

- **Open questions**:
  - Continuous pulse vs. one-time effect?
  - Should the effect stop after the user has clicked the button once (per-card or globally)?
  - Persistence: track whether the user already opened this section so we don't keep re-attracting attention on subsequent visits?
  - Apply only on first-time use, or every session?

- **Likely files**:
  - `app/Webapp/src/components/PatientInitialVisitReportV37.tsx` (button + per-card state)
  - Possibly a new keyframe in `tailwind.config.js` if a custom animation is needed
  - May need a small Zustand or local state slice to track "user has clicked the evidence toggle" per card

- **Status**: confirmed, not started — design decision needed (which effect, persistence behavior).

### Item 4. Track slider (VAS) interactions and surface them on the admin tracking page

- **Goal**: Detect whether a patient has actually moved / changed the VAS slider on each domain card, persist that as a tracking event, and make it visible on the admin tracking page at `http://localhost:3001/admin/tracking/patient-first`.

- **Why**: Today the sliders default to 50; if a patient never touches the slider, the submitted value is indistinguishable from a deliberate "50" answer. The admin / research team cannot tell whether a patient actually engaged with the question.

- **Current state**:
  - Slider component: shadcn `<Slider />` per domain in `PatientInitialVisitReportV37.tsx` (lines 1321, 1407, 1770, 2032, 2298, etc.).
  - Slider `onValueChange` currently only calls `setCpRiskWithoutTreatment`, `setCpRiskWithTreatment`, `setEdBaselineReturn`, `setIncRisk`, `setIusRisk`, etc. — pure local React state, no tracking call.
  - Tracking event types defined in `app/Webapp/src/tracking/track.ts:48`:
    ```ts
    export type PatientFirstEventType =
      | "page_view"
      | "topic_open"
      | "topic_close"
      | "evidence_open"
      | "evidence_close"
      | "rating_click"
      | "session_end";
    ```
    → no `slider_change` (or equivalent) event currently exists.
  - Admin page route: `app/Webapp/src/app/admin/tracking/patient-first/page.tsx` → renders `AdminTrackingPatientFirst.tsx`, which displays events by `event_type` but has nothing slider-specific.

- **Required changes**:
  1. **Webapp — tracking type**: extend `PatientFirstEventType` in `tracking/track.ts` with a new event (e.g. `slider_change` or `vas_change`).
  2. **Webapp — emit event**: wire each VAS slider's `onValueChange` in `PatientInitialVisitReportV37.tsx` to call `trackFirst` with the new event type, domain, slider id (which question), and the new value. Consider debouncing so a drag doesn't emit dozens of events — emit on first touch, or on commit (`onValueCommit` from Radix), or throttled.
  3. **Backend**: ensure the tracking endpoint (`/api/track/patient-first` or proxied equivalent) accepts the new event type and persists into the behavior-tracking table.
  4. **Admin page**: update `AdminTrackingPatientFirst.tsx` to surface slider interactions — at minimum:
     - Include slider events in the event list.
     - Optionally a per-patient / per-domain "Slider touched?" boolean column or icon.
     - Optionally a histogram of recorded slider movements per domain.

- **Open questions**:
  - Event granularity: emit once per first interaction, or every change, or only the final committed value?
  - What payload fields beyond the value? (e.g. `from`, `to`, `domain`, `question_id`)
  - How to distinguish "slider untouched, submitted at default 50" vs. "slider deliberately set to 50" — likely a per-card boolean stored in component state and surfaced on submit.
  - Should the admin page show only "touched yes/no" or the full change trail?

- **Likely files**:
  - `app/Webapp/src/tracking/track.ts` (event type)
  - `app/Webapp/src/components/PatientInitialVisitReportV37.tsx` (emit calls)
  - `app/Webapp/src/components/AdminTrackingPatientFirst.tsx` (display)
  - Backend route handling `/api/track/patient-first` (likely `app/Backend/routes_track_*.py`) and the behavior-tracking model
  - DB migration if a new column is introduced (vs. just a new event_type string)

- **Status**: confirmed, not started — design decisions required on event granularity and admin-page presentation.

---

## Task list (priority order)

### 0. Split patient questions into a dedicated page  *(NEW — HIGHEST priority, supersedes the list below)*
- **Goal**: Move the patient question-answering UI off the current patient report page and onto its own dedicated page; add a "Next page" button at the bottom of the current patient page to navigate there. Full detail in **Feedback Item 2** above.
- **Open**: target page (First Visit / Follow-up / both), routing approach, persistence behavior.
- **Branch note**: same as Task 5 — do not edit on `main`; create a `feat/<topic>` branch.
- **Status**: confirmed, not started — design decision required first.

### 1. Collaborator local-machine setup
- **Goal**: Make the dashboard runnable end-to-end on the collaborator's local machine (not just the primary dev environment).
- **Scope**: Native deployment path (`scripts/run-native.sh`), Postgres (`:5433`), Redis, NLP Docker image bring-up.
- **Risks / unknowns**: OS differences, port conflicts, env var distribution (no PHI / secrets in shared files).
- **Status**: in preparation.

### 2. Admin Page
- **Goal**: Implement / refine the admin dashboard view per manager's priorities.
- **Reference**: see `dev_docs/ADMIN_SIMPLIFICATION_PLAN_KR.md`, `dev_docs/ADMIN_TRACKING_PER_PAGE_KR.md` for prior planning.
- **Status**: not started — pending kickoff after collaborator setup is functional.

### 3. Patient ID randomization / hash functionality
- **Goal**: Replace / obscure raw patient identifiers with randomized or hashed equivalents in the webapp surface and supporting backend paths.
- **Scope**: URL parameters, displayed IDs, tracking logs; PHI must not leak through any client-stored value (webapp convention).
- **Open questions**:
  - Hash scheme (deterministic vs. salted random) — needs decision.
  - Reverse-lookup path for authorized backend operations.
  - Migration of existing references in `survey_submission_log`, `doctor_rewrite_log`, behavior tables.
- **Status**: not started — design discussion required first.

### 5. Add visual cue to the "View relevant sentences" toggle
- **Goal**: Draw patient attention to the per-domain "View relevant sentences from your visit" button so it isn't overlooked (linked to **Feedback Item 3** above).
- **Location**: `app/Webapp/src/components/PatientInitialVisitReportV37.tsx:2548–2572` (button block).
- **Concrete change**: add an attention-grabbing visual effect (pulse, glow, one-time highlight, etc.) to the existing button; behavior to stop or persist once user has interacted.
- **Open**: which effect, one-time vs. continuous, per-card vs. global persistence.
- **Status**: confirmed, not started — design decision required.

### 6. Track VAS slider interactions and show on admin page
- **Goal**: Detect & log whether the patient actually moved the VAS slider per domain, and display on `http://localhost:3001/admin/tracking/patient-first` (linked to **Feedback Item 4** above).
- **Locations**:
  - Slider event source: `app/Webapp/src/components/PatientInitialVisitReportV37.tsx` (slider blocks at lines 1321, 1407, 1770, 2032, 2298, …)
  - Tracking type: `app/Webapp/src/tracking/track.ts:48` — extend `PatientFirstEventType`
  - Admin display: `app/Webapp/src/components/AdminTrackingPatientFirst.tsx`
  - Backend tracking endpoint + behavior-tracking table (Backend side)
- **Concrete change**: add new `slider_change` (or `vas_change`) event type → wire each slider's `onValueChange` / `onValueCommit` to `trackFirst` → ensure backend accepts → surface in admin UI.
- **Open**: event granularity, payload fields, "touched yes/no" vs. full change trail in admin view.
- **Status**: confirmed, not started — design decision required.

### 7. Remove disclaimer from patient interface
- **Goal**: Remove the amber disclaimer box from the patient interface (full details and code context in **Feedback Item 1** above).
- **Sentence**: "This report is informational only and is in no way grading your physician."
- **Location**: `app/Webapp/src/components/PatientInitialVisitReportV37.tsx:3494` (and legacy `PatientInitialVisitReportV35.tsx:1816`).
- **Concrete change**: delete the entire `{/* [V35] Disclaimer — feedback 2-8 */}` `<div>` block (lines 3484–3495 in V37) — not just the inner text.
- **Open question**: Touch legacy V35 too, or only active V37?
- **Branch note**: Do **not** edit on `main`. Stash / commit the 6 in-flight changes first, then branch `fix/remove-patient-disclaimer` (or similar).
- **Status**: confirmed, not started — small task, can be slotted opportunistically once branch is clean.

### 8. Connect patient first-visit questions to the REDCap project  *(NEW — 2026-05-22)*
- **Problem**: The per-category questions on the patient first-visit page (cp/le/ed/inc/ius — VAS sliders, timeline radio, factor multi-select) are **not connected to the REDCap project**, and those question fields **do not yet exist in the REDCap project**.
- **Action**: Work with the **collaborator** to define/add the corresponding fields in REDCap, then map dashboard answers ↔ REDCap fields.
- **Context**: Answers are now stored row-per-question in `patient_first_visit_answer` (migration 014), keyed by `question_id`. This long format matches REDCap's field model — aligning REDCap field names with the `question_id`s makes the mapping straightforward.
- **Related docs**: `docs/features/Frontend_REDCap_Field_Mapping.md` (existing follow-up survey mapping — add the first-visit question rows the same way).
- **Status**: open, not started — coordination item (needs collaborator + REDCap access).

---

## Priority order
Updated 2026-05-19 — new top-priority item from this round's feedback overrides prior list.
0. **Split patient questions into a dedicated page** — NEW, HIGHEST priority (Feedback Item 2).
1. Collaborator local-machine setup — active.
2. Admin Page.
3. Patient ID randomization / hash.
4. Visual cue on "View relevant sentences" toggle — small UX tweak (Feedback Item 3; Task 5 in this doc).
5. Track VAS slider interactions on admin page — ties into Admin Page work (Feedback Item 4; Task 6 in this doc; may be folded into Task 2).
6. Disclaimer removal — small, opportunistic (Feedback Item 1; Task 7 in this doc).
7. Connect first-visit questions to REDCap — coordination item, needs collaborator + REDCap access (Task 8 in this doc).

## Open questions to clarify with reporter
- Scope of disclaimer removal: Patient First Visit only, or all report views (Follow-up, Doctor) too?
- Legacy V35: include or skip?
- Any related copy changes (InstructionsBox, footer disclaimer) that should be addressed together?

## Branch hygiene
- `main` currently has 6 uncommitted webapp files including V37.
- Resolve those (commit or stash) before starting any task above.
- New work must go on a `feat/<topic>` or `fix/<topic>` branch per repo rule.

## Next steps
1. Receive and paste full feedback body for additional items.
2. Resolve in-flight `main` changes.
3. Open plan docs in `dev_docs/` for tasks 2 and 3 before any code change.
4. For each feedback item: file path → current behavior → requested change → priority.
