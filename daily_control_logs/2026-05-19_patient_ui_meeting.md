# 2026-05-19 — Patient UI feedback (meeting notes)

## Metadata

- **Date**: 2026-05-19
- **Subject**: `app/Webapp/` patient UI
- **Type**: meeting / discussion notes — item 6 of the external review round
- **Status**: open

## Document conventions

Real names are replaced with role labels per repository convention:

| Role label | Who |
|---|---|
| the collaborator | study collaborator who owns the survey instrument |
| the NLP team | the sentence-classification group |
| the AI pipeline author | author of the GPT-4o scoring pipeline |
| the manager | project maintainer / lead |
| the pipeline output owner | owner of the pipeline output format |

The original tone and structure of the meeting are preserved; wording was adjusted
only where a role label made it necessary. A companion document,
`2026-05-19_webapp_feedback.md`, consolidates the webapp feedback and task list —
the two cross-link.

---

## 6. Patient UI feedback (the largest share of the meeting)

### 6-1. Header and instructional copy

- ✅ Removed "informational only, not grading your physician" — the patient version
  carries no grade. Done 2026-05-21, commit `a1deb92`, applied to V37 only; the
  legacy V35 was left alone.
- ✅ Replaced the COMPASS acronym with the new expansion — done in four UI header
  locations (`2858453`) plus layout metadata and footer (`1fde50b`). New acronym:
  "Communication of Prognosis, Alternatives, and Side Effects for Shared Decision
  Making".
- Some instruction text still to be revised.

### 6-2. Screen structure change (the core item) — ✅ done 2026-05-21

Branch `feat/patient-ui-2026-05-19-feedback`. Key commits:
`9056d12` V37→V38 clone → `c543b92` six-screen wizard → `e91fcb5` floating progress
→ `76a6bc0` AI-summary toggle → `efe1b8f` removed Submission Progress →
`3f712b4` per-screen defaults → `30e1088` / `0850045` InstructionsBox rewrite.

- ✅ Was: summary plus every question on a single page → changed
- ✅ Split into six screens
  - ✅ Screen 1 (Overview): the five aspect summaries, no questions — AI summary
    plus excerpted sentences only
  - ✅ Screens 2–6 (per domain): AI summary + key sentences + questions + Submit
- ✅ Addresses the NLP team's concern that **the questions interfere with the
  intervention** — questions are hidden on the Overview
- ✅ Added a progress/completion indicator (floating vertical on desktop right,
  sticky top on mobile)

#### Design decisions settled 2026-05-21 — all items ✅ done

**Navigation and flow**

- ✅ Submit per domain screen, saving that domain — `c543b92`
- ✅ Next unlocks only after every question on the screen is answered and submitted
  — `c543b92`
- ✅ Overview is view-only; Next moves to screen 2 (no jumping) — `c543b92`
- ✅ Deep links: `?step=overview|cp|le|ed|inc|ius` kept in sync with the URL, so a
  refresh or a shared link preserves position — `c543b92`
- ✅ Back/Next sit inline at the bottom of each screen's body — `c543b92`

**Versioning and header**

- ✅ V37 preserved as legacy; only the active branch uses the new V38 — `9056d12`
- ✅ COMPASS header shown on all six screens with the new acronym — `2858453`, `1fde50b`

**Progress display (changed from the original plan)**

- ✅ Desktop (≥1024px): fixed vertical step list on the right, `right-6 top-24`, all
  six steps labelled with a number/✓ badge — `e91fcb5`
  - Current step: violet/indigo gradient
  - Submitted step: emerald ✓
  - Click-to-jump disabled (display only)
- ✅ Mobile/tablet (<1024px): sticky horizontal bar, `sticky top-0 z-30` with
  `backdrop-blur-md` — `e91fcb5`
- ✅ The Submission Progress box was removed entirely — WizardProgress replaces it —
  `d1faf94`, `efe1b8f`

**AI summary and relevant sentences UI**

- ✅ The AI-generated summary became a toggle ("Hide / View AI-Generated Summary")
  sharing the chrome of the relevant-sentences control — `rounded-xl`, neutral
  white/slate background, Sparkles icon + label + chevron. Expanded state keeps the
  violet card so AI provenance stays visually distinct — `76a6bc0`
- ✅ Per-screen defaults for both toggles — `32416c2`, `3f712b4`:
  - Overview: both OPEN (all five cards)
  - Per-domain: both CLOSED for the active topic; the user can open them manually,
    and navigation resets them to the default
- ✅ Per-domain cards auto-expand on entering the screen — `c543b92`

**Other**

- ✅ Helpfulness rating: V37 pattern kept unchanged on the domain screens
- ✅ InstructionsBox rewritten as three steps to match the V38 wizard — `ba4242d`,
  `30e1088`, `0850045`
  - Step 1: open each category on the Overview to read the AI summary and excerpts
  - Step 2: answer and Submit on each domain screen, re-reading content as needed
  - Step 3: navigate with Back/Next; where the progress indicator lives (right/top)

### 6-3. How AI summary and key sentences are revealed — ✅ done 2026-05-21, decision partly revised

Key commits: `32416c2` auto-reveal sentences on the Overview → `76a6bc0` AI-summary
toggle with matching chrome → `3f712b4` per-screen defaults.

- ✅ Discussed dropdown-on-click versus automatic reveal — decided
- ⚠️ Decision: try automatic reveal first; restore the dropdown if it feels cluttered
  - **Changed during implementation at the user's request**: automatic reveal on the
    Overview only; **closed is the default on the per-domain screens**
  - Reason: on a domain screen the visual focus should be on answering the questions
    — narrower than the meeting's "everywhere"
  - The user can still open them manually; navigation resets to the default
- ✅ Click tracking retained for engagement measurement — `handleToggleEvidence` emits
  `evidence_open` / `evidence_close` (unchanged from V37). The AI-summary toggle also
  carries `data-track-proximity="AiSummaryToggle_<topic>"`
- ✅ **Beyond the meeting's scope**: the AI summary got the same toggle pattern as the
  sentences, for UI consistency (same rounded-xl chrome, neutral background,
  icon + label + chevron)
- Rationale: the sentences act as ground-truth verification of the AI output, which
  strengthens trust *(background, not an action item)*

### 6-4. Question wording cleanup

- Remove the repeated "AI summary from your consultations above…" — it appears three
  times and grates
- Use "Based on the AI summary above" once instead

### 6-5. ED / urinary incontinence — split by treatment type

- Raised by the AI pipeline author during user testing: ED risk differs across
  surgery / radiation / ablation
- Decision: do not add more dropdowns; group the three treatment-specific sentences
  inside the AI summary block
- The manager needs to check the pipeline output structure with the pipeline output
  owner — if it is a plain text merge, this is fine
- The same principle may apply to urinary incontinence

### 6-6. Slider default

- Decision: default 50, so the patient can see the control is movable
- But slider movement must be tracked — left at 50, an answered and an unanswered
  slider are indistinguishable
- The manager is checking whether tracking is feasible

---

## Actions (implementation and operations)

- **2026-05-21 — patient follow-up entry button temporarily hidden**: the per-row
  "Follow-up" button on the patient selection screen
  (`app/Webapp/src/app/page.tsx`) was commented out rather than deleted, as a JSX
  comment (`{/* ... */}`), so uncommenting restores it. The "First Visit" button in
  the same row stayed. (Takes effect only after the webapp container is rebuilt.)
  - **Restored 2026-05-22**: uncommented, so the Actions column shows both
    "First Visit" and "Follow-up" again. Webapp rebuilt and recreated.

- **2026-05-22 — patient first-visit questions are not wired to REDCap** *(open)*:
  the per-category questions on the patient first-visit page (VAS slider, timeline
  radio, multi-select factors, for cp/le/ed/inc/ius) are not connected to the REDCap
  project, because **the fields do not yet exist there**.
  - Action: define the fields in the REDCap project together with the collaborator,
    then map dashboard answers to them.
  - Note: answers are stored today in `patient_first_visit_answer` one row per
    `question_id` (migration 014). That long format matches REDCap's field model, so
    naming the REDCap fields after `question_id` keeps the mapping simple.
  - Related doc: `Frontend_REDCap_Field_Mapping.md` (existing follow-up survey field
    mapping) — first-visit questions need equivalent entries.

- **2026-05-22 — desktop app packaging and fresh native deployment (roadmap)**
  *(open)*: make the two repositories (`AI_physician_patient_communication` +
  `Prostate_cancer_consultation_dashboard`) behave like a desktop application a
  non-developer can double-click, with PHI kept local.
  - Options: (A) Electron/Tauri shell orchestrating local services, (B) one-click
    launcher wrapping the existing native scripts, (C) fully offline bundle
    (embedded Python/Postgres, NLP Docker replaced, Azure made optional).
  - Main obstacle: the NLP step depends on Docker (R), which is the hardest part of
    a "no Docker" desktop build. Azure OpenAI adds a network and secret dependency.
    Postgres-specific code and migrations (e.g. 014's `to_jsonb`) would need
    compatibility work before any single-user SQLite mode.
  - Phases: **Phase 0 = fresh native deployment** (from-scratch bootstrap plus
    teardown/reset scripts, with `--wipe-db` behind an explicit confirmation gate) →
    Phase 1 one-click launcher → Phase 2 Electron/Tauri → Phase 3 (optional) offline
    bundle.
  - **The detailed plan lives in the tracked document `dev_docs/TODO.md`, section
    "Desktop app packaging + fresh native deployment (roadmap)".**
  - Undecided: whether it must be fully offline / Docker-free, target OS (macOS only
    or Windows too), single-user (SQLite) versus shared (Postgres), and who installs it.
