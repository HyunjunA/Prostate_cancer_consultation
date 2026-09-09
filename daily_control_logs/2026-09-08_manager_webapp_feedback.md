# 2026-09-08 (Mon) — Manager feedback on the physician dashboard

> Names are replaced with role labels per repository convention — **the manager**,
> **the developer**, **the study coordinator**, **the NLP team**, **PI**.
> No PHI: no patient identifiers, transcript content, or real (including hashed)
> transcript filenames appear here.
> Markers: ✅ done / ⬜ not started / 🔄 in progress / ⏸️ deferred / ⚠️ partial.

## 1. Source

- Sent by the manager on 2026-09-08 after reviewing the build deployed on
  2026-09-04, which carries items 1-7 of
  [`2026-09-01_webapp_feedback.md`](2026-09-01_webapp_feedback.md).
- Three points were raised. Two of them turned out to be the same defect seen on
  two different screens, so they are logged as one item with the evidence from
  both.

## 2. Items

| # | Item | Detail | Repo / target | Status |
|---|---|---|---|---|
| 1 | **Topic overview chart reports twice the real patient count** | Cancer Prognosis has 5 visits but the chart header reads "10 patients"; Life Expectancy shows the same doubled count | dashboard (`app/Webapp`) | ✅ done |
| 2 | **The score scale says "hover" but only responds to a click** | The hint under the 0-5 scale reads "Hover over score numbers above for rubric guidance"; hovering appears to do nothing, clicking works | dashboard (`app/Webapp`) | ✅ done |

---

### Item 1. Topic overview chart counted other physicians' consultations

**Request.** "Cancer Prognosis only has 5 actual visits, but the patient count
shows 10." And separately: "Life Expectancy also shows 10 sessions."

**Reproduced before touching anything**, against the deployed `:3001` with the
study's five-patient doctor account. All five topics, not just the two reported:

| Topic | Header on `:3001` | X-axis max |
|---|---|---|
| Cancer Prognosis | `10 patients • Current: 2.0` | 10 |
| Life Expectancy | `10 patients • Current: 0.0` | 10 |
| Erectile Dysfunction | `10 patients • Current: 2.0` | 10 |
| Urinary Incontinence | `10 patients • Current: 0.0` | 10 |
| Irritative Symptoms | `10 patients • Current: 0.0` | 10 |

The doctor has **5** consultation files. So the chart was plotting ten points
where five exist — on every topic, not only the two the manager happened to open.

**Root cause — a race between a scoped and an unscoped fetch.** The dashboard
calls `/api/backend/doctor/scores/average` from two different effects in
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx`:

| Line | Call | Rows returned | Files |
|---|---|---|---|
| `:5015` | `fetchScoreAverage(undefined, undefined, undefined, doctorId)` | 25 | **5** — this doctor's |
| `:5068` | `fetchScoreAverage(undefined, undefined, undefined)` | 50 | **10** — every file in the database |

Both write the same `scoreAverage` state, so **whichever response lands last
wins**. Measured directly off the wire:

- unscoped: `total_groups=50`, `{cp:10, le:10, ed:10, inc:10, ius:10}`, 10 distinct files
- scoped: `total_groups=25`, `{cp:5, le:5, ed:5, inc:5, ius:5}`, 5 distinct files

There is no duplication inside either payload — 0 exact `(file, class, speaker)`
duplicates in both. The "10" was not double counting; it was **other physicians'
consultations** being drawn on this physician's chart. That also explains why the
number was reproducible rather than flickering: the unscoped call is fired from
the `files → patients` effect, which resolves later in practice.

The patient list itself was never wrong, because the effect that assigns per-patient
scores (`:5090`) matches on `d.file === patient.fileName` and simply finds no match
for a foreign file. The topic overview chart (`:4016`) was the one consumer that
plotted every row it was handed, filtered only by domain class.

**Change made (✅).** Two edits, both in `PhysicianReportsModifiedV41Timothy.tsx`:

1. `:5068` now passes `doctorId`, like the other call site. A comment records that
   the argument is required and what its absence caused.
2. `:4016` — the chart derives `ownFiles` from the `patients` prop and drops any
   row whose `file` is not in it, guarded by `ownFiles.size === 0` so an empty
   patient list cannot blank the chart. This is defence in depth: the endpoint is
   now scoped at both call sites, but this chart is the only place that renders
   whatever it is given, so it re-checks instead of trusting the payload.

**Verification** (throwaway dev server on `:3900`, both themes, five-patient
doctor account), measured against the unchanged `:3001` for a direct before/after:

| Topic | `:3001` (before) | `:3900` (after) |
|---|---|---|
| Cancer Prognosis | `10 patients` / xMax 10 | **`5 patients`** / xMax 5 |
| Life Expectancy | `10 patients` / xMax 10 | **`5 patients`** / xMax 5 |
| Erectile Dysfunction | `10 patients` / xMax 10 | **`5 patients`** / xMax 5 |
| Urinary Incontinence | `10 patients` / xMax 10 | **`5 patients`** / xMax 5 |
| Irritative Symptoms | `10 patients` / xMax 10 | **`5 patients`** / xMax 5 |

Unscoped `/scores/average` requests observed after the fix: **0** (was 1 per page
load). `Current:` values are unchanged, so the current patient's own score still
resolves correctly.

**Open point — the word "patients" is itself questionable.** One row on this chart
is one consultation file, and the rest of the dashboard names those rows
"Visit N". The manager's own message called them "visits" and "sessions", never
patients. The count is now correct either way, but "5 patients" for 5 visits of a
patient population the UI cannot resolve is still loose wording. Renaming the
header and the "Patient #" axis to consultations/visits was **not** requested, so
it has not been done — flagged for a decision.

---

### Item 2. The 0-5 score scale advertised hover but was a 13 px target

**Request.** "Hovering does nothing here — you have to click. So the wording
should say 'click' rather than 'hover'."

**Measured before changing the copy**, because the copy is only wrong if hover
really is dead. It is not dead — it is nearly unreachable:

| What was measured | Result |
|---|---|
| Hover target = the digit glyph only | **13 x 32 px** |
| The column the reader sees | **100 x 66 px** (100 x 81 for score 5) |
| Hover on the digit | tooltip displays, 288 px wide, fully on screen |
| Hover on the label under it ("Imprecise Quantification") | **nothing** — the label was outside the `group` |
| Hover on score `0` | **nothing ever** — no rubric entry maps to `targetScore === 0`, so no tooltip is rendered at all |
| Click | works, opens the rubric at that level (`onScoreClick` → `onOpenRubric`) |
| The `group-hover` CSS rule | present and correct — `.group:hover .group-hover\:block { display: block }` |

So the hover affordance covered **4%** of the cell the reader is aiming at, and
the click target was the same 13 x 32 px glyph. The manager's experience is
exactly what the geometry predicts: aim at a score, land on the label, get
nothing; aim precisely at the digit and click, and it works.

(One measurement of my own was wrong on the first pass and is recorded so it is
not repeated: an early probe reported hover doing nothing even on the digit. That
was an artifact — the scale sits below the fold at 1600x1100 and the element had
to be scrolled into view before `elementFromPoint` and `:hover` behaved.)

**Change made (✅).** Two edits in
`app/Webapp/src/components/ConsultationScoringV7Timothy7.tsx`:

1. The interactive target moves from the digit to the **whole 100 px column** —
   digit and label together. `group` and the `onClick` now sit on the column
   wrapper; the digit's inner `<div>` keeps `relative` so the tooltip still
   anchors above the number, and `hover:scale-110` becomes `group-hover:scale-110`
   so the digit still reacts. This fixes the click target the manager was asked to
   use, not just the hover.
2. The hint now reads **"Click a score number above for rubric guidance"** when a
   click handler is wired, falling back to the old hover wording when it is not
   (the component is also used without `onScoreClick`). A comment records why
   click is the honest verb: hover is pointer-only and stays silent on score 0.

The hover tooltip is deliberately kept — it is now reachable across the whole
column, so it complements the click rather than competing with it.

**Verification** (throwaway dev server on `:3900`, both themes):

| # | Check | Light | Dark |
|---|---|---|---|
| 1 | Hint copy | `Click a score number above for rubric guidance` | same |
| 2 | Interactive cell size, scores 0-4 | **100x66** (was 13x32) | same |
| 3 | Interactive cell size, score 5 | **100x81** | same |
| 4 | Cursor on the cell | `pointer` ×6 | same |
| 5 | Hover on the **label** under 1/2/3/4/5 | tooltip `block`, 288x94 / 183 / 184 / 249 / 313, fully on screen | same |
| 6 | Hover on the label under 0 | no tooltip — pre-existing, no rubric entry maps to 0 | same |
| 7 | **Click** on the label under "4" | rubric opens (`All Domains` absent → present) | same |

**Not changed, on purpose.** Score 0 still has no tooltip; giving it one means
authoring a rubric entry for level 0, which is a content decision, not a UI one.
No keyboard handler was added — the target was already a clickable `<div>` and
still is, so this is unchanged rather than newly missing; worth its own item.

---

## 3. Status as of 2026-09-08

| # | Item | Code | Verified | Deployed to `:3001` | Committed |
|---|---|---|---|---|---|
| 1 | Topic overview chart counts only this doctor's consultations | ✅ | ✅ | ✅ | ❌ |
| 2 | Score scale says "click" and the whole column is the target | ✅ | ✅ | ✅ | ❌ |

**Deployment.** `docker compose -f docker-compose-frontend.yml build webapp` →
`up -d webapp`, from the repo root, on 2026-09-08. Only the `webapp` service was
touched; `prostatecancer-webapp-native` reports `healthy`. This build also carries
items 1-7 of the 2026-09-01 log, which were already live.

**Re-verified on `:3001` after the deploy** (both themes, same probes as above):
all five topics read `5 patients` with xMax 5 (`Current:` 2.0 / 0.0 / 2.0 / 0.0 /
0.0, unchanged); **0** unscoped `/scores/average` requests; hint copy is
`Click a score number above for rubric guidance`; cells `100x66` (score 5:
`100x81`) all `cursor: pointer`; hover on the label under 1-5 raises the tooltip
(0 still has none); clicking the label under "4" opens the rubric. Regressions
clean — grid columns `182·121·486·425`, rows `203·309·242·329·348`, tile `150x64`,
ledge `4px`, `breathe` running, chip `82x24`, 5 marks / 0 underlines on the grid
and 2 marks / 0 underlines on the detail screen.

Static checks for both items: `npx tsc --noEmit` reports **0** errors in either
modified file, `npx jest --runInBand` **272 passed / 28 suites**, `npm run build`
clean.

**Regression checks re-run in the same pass** (both themes, on `:3900`): grid
columns `182·121·486·425` and rows `203·309·242·329·348` unchanged; topic tile
`150x64` with its `4px` ledge and `breathe` loop; `Click a topic` chip `82x24`;
5 yellow focus-sentence marks on the grid and 2 on the detail screen with **0**
underlines; 0 "Individual", 0 "Average", 0 search `<input>`. So items 1-7 of the
2026-09-01 log are intact.

### Outstanding

1. **Not committed** — and neither are items 1-7 from
   [`2026-09-01_webapp_feedback.md`](2026-09-01_webapp_feedback.md). Three webapp
   files are now modified in the working tree:
   `PhysicianReportsModifiedV41Timothy.tsx`, `ConsultationScoringV7Timothy7.tsx`,
   `tailwind.config.js`. The running container is ahead of git.
2. **"N patients" wording** on the topic overview chart — see the open point under
   Item 1. Needs a decision, not a fix.
3. **Score 0 has no rubric tooltip.** Pre-existing; needs a level-0 rubric entry to
   resolve.
4. **Worth checking whether other screens call `/scores/average` unscoped.** The
   two call sites in the live component are now both scoped, but the older
   `PhysicianReportsModifiedV38Timothy.tsx` / `V39Timothy.tsx` (not mounted) pass
   a speaker and no doctor id. Harmless while they are unmounted; a trap if one is
   ever revived.
