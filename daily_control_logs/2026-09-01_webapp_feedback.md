# 2026-09-01 (Tue) — Feedback intake

> Names are replaced with role labels per repository convention — **the manager**,
> **the developer**, **the study coordinator**, **the NLP team**, **PI**.
> No PHI: no patient identifiers, transcript content, or real (including hashed)
> transcript filenames appear here. Use `SID_<n>` style placeholders instead.
> Markers: ✅ done / ⬜ not started / 🔄 in progress / ⏸️ deferred / ⚠️ partial.

## 1. Source

- Dictated to the developer on 2026-09-01. Recorded item by item as it was given.
- Purpose: collect the outstanding feedback in one place before implementing it,
  so that each item carries an explicit status rather than being inferred later
  from the code.

## 2. Items

| # | Item | Detail | Repo / target | Status |
|---|---|---|---|---|
| 1 | **Scoring rubric opens at level 5 by default** | The rubric currently opens with no level selected ("Select a score above"). Preselect **5 — Patient-centered Estimate** | dashboard (`app/Webapp`) | ✅ done |
| 2 | **Hide the "Risk Communication Scoring Rubric" panel** | Comment out the always-visible rubric legend panel on the physician dashboard so it no longer renders. Comment out, not delete — it is expected to come back | dashboard (`app/Webapp`) | ✅ done |
| 3 | **Remove the patient search box** | The "Search patient / ID / file..." input in the Patient Reports table header on the Physician Reports screen should be removed | dashboard (`app/Webapp`) | ✅ done |
| 4 | **Drop the "Average" button from the trajectory toggle** | On the "Overall Quality of Risk Communication Score Trajectory" card, the Individual / Average toggle should show **Individual only** — the Average button should not exist at all | dashboard (`app/Webapp`) | ✅ done |
| 5 | **Hide the "Individual" button too** | Follow-up to item 4: the remaining "Individual" chip should not be visible either, so the trajectory card header carries only its title | dashboard (`app/Webapp`) | ✅ done |
| 6 | **Make the topic links obviously clickable** | On the COMPASS Provider Dashboard, the per-topic links should carry a stronger visual affordance so the physician can tell at a glance that they are clickable and is prompted to click them. Requester's direction: an effect similar to the floating "Scoring Rubric" button | dashboard (`app/Webapp`) | ✅ done |
| 7 | **Focus sentence gets a yellow highlight instead of bold + underline** | In the Consultation Scoring text the scored sentence is drawn bold + underlined + cyan; it should be marked with a yellow highlighter instead. Requester's reason: a yellow highlight is understood instantly by the generation that drew highlighter pens through books | dashboard (`app/Webapp`) | ✅ done |
| 8 | **Voice input for the rephrasing / rewrite box** | The physician should be able to dictate their rewrite instead of typing it into the Re-write Practice textarea | dashboard (`app/Webapp`) | ⬜ not started |

---

### Item 1. Scoring rubric should default to level 5 (Patient-centered Estimate)

**Request.** When the physician presses the "Scoring Rubric" button, the rubric
should open with level **5 — Patient-centered Estimate** already selected.

**Current behaviour — measured in the running app, not inferred.** Driving the
physician dashboard at `:3001` headless (with the onboarding tour suppressed via
its `localStorage` flags) and clicking the button shows the modal opening with
**no level selected at all**:

- the criteria banner reads *"HOVER OR CLICK A SCORE ABOVE TO SEE CRITERIA"*
- all five domain rows read *"Select a score above"*
- all six scale labels render with identical class, weight, opacity and colour —
  none is highlighted

So today the physician must take an extra action before the rubric shows any
content. The request is to seed it at the target level instead.

**Where this lives.** `RUBRIC_SCORE_LEVELS`
(`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx:607-614`)
defines `{ score: 5, label: "Patient-centered Estimate" }`. `RubricBody`
(`:635-645`) takes `initialScore` into `lockedScore`, and `activeScore` prefers
the locked value over hover — that is what drives the criteria table. The default
therefore comes from whatever each caller passes as `initialScore`.

**Three callers mount `RubricBody`. Two of them are what this item is about:**

| Entry point | Button text (as rendered) | Seed | Measured default |
|---|---|---|---|
| `RubricFloatingButton` modal (`:1643`, `:1099`) | "Scoring Rubric" | `bodyScore`, `useState<number \| null>(null)` | **nothing selected** |
| Scoring Legend expander (`:967`, `:1020`) | "▶ View full rubric — click here" | `legendScore` | **nothing selected** |
| Re-write Practice toggle (`:4303`, `:4332`) | "Scoring rubric" | the sentence's `currentScore` | already seeded — different case |

Both landing-screen entry points open empty, which matches the report. The
Re-write Practice toggle already opens on a level (the sentence's own score), so
it is a separate decision: leaving it as-is keeps the physician anchored on where
that sentence currently sits, while changing it to 5 would show the target
instead. **Not changing it without confirmation.**

**Caveat for implementation.** `bodyScore` is also written when the physician
clicks a score badge elsewhere on the page to "open the rubric at" that score
(`:3444`, `title="Click to view scoring rubric"`). A constant default of 5 must
apply only to the *unseeded* open, not overwrite that explicit choice.

**Change made (✅).** Three edits in
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx`:

1. New constant `RUBRIC_DEFAULT_SCORE = 5` next to `RUBRIC_SCORE_LEVELS`, with a
   comment stating why 5 (it is the level physicians are working towards, so its
   criteria are the ones worth showing first).
2. `RubricLegendStrip` — the "▶ View full rubric" button now calls
   `expandAt(RUBRIC_DEFAULT_SCORE)` instead of `expandAt(null)`.
3. `RubricFloatingButton` — the "Scoring Rubric" button now seeds
   `setBodyScore(RUBRIC_DEFAULT_SCORE)` instead of `setBodyScore(null)`.

The Re-write Practice toggle and the score-badge / score-tick entry points were
left alone, so an explicit choice still wins over the default.

**Verification.** Static: 0 new `tsc` errors in the edited file (the repo's ~609
pre-existing errors are all in other files), `jest` 272 passed / 28 suites,
`next build` clean. Behavioural, measured in a headless browser against a
throwaway dev server (the deployed instance was not rebuilt):

| Entry point | Locked level after open | "Select a score above" rows |
|---|---|---|
| "Scoring Rubric" floating button | **5 — Patient-centered Estimate** | 0 |
| "▶ View full rubric — click here" | **5 — Patient-centered Estimate** | 0 |
| Explicit score tick "2 — Generalization" | **2 — Generalization** | 0 |

The third row is the regression check: the new default does not override an
explicit selection.

**Deployed.** The `webapp` image was rebuilt and the `webapp` service recreated on
2026-09-03. The three rows above were re-measured against the deployed `:3001`
and match. Not committed — see the status summary in §3.

---

### Item 2. Hide the "Risk Communication Scoring Rubric" panel

**Request.** The panel that renders the heading **"Risk Communication Scoring
Rubric"** should be hidden from the physician dashboard. **Comment it out rather
than delete it** — the request was phrased as "for now", implying a temporary
hide, so the code should stay in place and be trivially restorable.

**Which panel — measured, not inferred.** That heading string occurs twice in
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx`:

| Line | Component | When visible |
|---|---|---|
| `:1004` | `RubricLegendStrip` header | **on page load, no interaction needed** |
| `:1792` | `RubricFloatingButton` modal header | only after the "Scoring Rubric" button is clicked |

Reading `document.body.innerText` on a freshly loaded physician dashboard shows
"Risk Communication Scoring Rubric / Hover or click a score level to see
domain-specific criteria" with no clicks — that is the `RubricLegendStrip` at
`:1004`. So this item is about the **always-visible legend panel**, not the modal.
Hiding the modal too would also make Item 1 pointless, which supports the same
reading.

**What to comment out.** The mount site, not the component definition:

```
:2835   {/* ── Row 2b: Always-visible scoring legend (full width) ── */}
:2836   <RubricLegendStrip
:2837     isDarkMode={isDarkMode}
:2838     onTrackEvent={onTrackEvent}
:2839   />
```

Commenting the mount leaves `RubricLegendStrip` (`:953-…`) defined and unused,
which keeps the diff small and the restore a one-line uncomment.

**Dependency check — clear.** `grep` for `rubric-legend-strip` (the panel's
`data-tour` anchor at `:988`) returns only its own definition, so no onboarding
tour step targets it and removing it will not break the tour. The other rubric
entry points are independent of this panel:

- the floating "Scoring Rubric" button (`RubricFloatingButton`, mounted `:5235`)
- score-badge clicks that open the rubric at a score (`:3444`), which route
  through `onOpenRubric` → `RubricFloatingButton`, not through the legend strip

So after this change the rubric is still reachable; it simply stops occupying
space on the dashboard by default.

**Open point.** `RUBRIC_DEFAULT_SCORE` from Item 1 is used in two places, one of
which is inside `RubricLegendStrip`. That usage becomes dead while the panel is
commented out, but the floating-button usage keeps the constant live, so nothing
needs to change there.

**Change made (✅).** One edit in
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx`: the Row 2b
mount of `RubricLegendStrip` is wrapped in a JSX comment. The existing Row 2b
comment was merged into the same block rather than left above it — JSX comments
do not nest, so a separate `{/* ... */}` around the mount would have been
terminated early by the old comment's own `*/`. The comment text records why it
is hidden and that uncommenting restores it.

`RubricLegendStrip` itself (`:968`) is left defined and unused. `tsconfig.json`
has no `noUnusedLocals` and `.eslintrc.json` only extends `next/core-web-vitals`,
so this does not fail the build.

**Verification.** Static: 0 `tsc` errors in the edited file, `jest` 272 passed /
28 suites, `next build` clean. Behavioural, measured in a headless browser
against a throwaway dev server:

| Check | Result |
|---|---|
| "Risk Communication Scoring Rubric" in `body.innerText` on load | **0** (was 1) |
| "▶ View full rubric — click here" button on load | **0** (was 1) |
| "Hover or click a score level" hint on load | **absent** |
| Floating "Scoring Rubric" button still opens the modal | **yes**, locked at 5 — Patient-centered Estimate |

The last row is the regression check: hiding the panel did not take the rubric
itself away, and Item 1's default survives.

**Deployed.** The `webapp` image was rebuilt and the `webapp` service recreated
on 2026-09-03 (`docker compose -f docker-compose-frontend.yml build webapp` then
`up -d webapp`; only that one service, no `down` — this host runs many unrelated
containers). The four checks above were re-run against the deployed `:3001` and
match. A screenshot of the deployed dashboard confirms the trajectory graph card
is now followed directly by the Patient Reports table, with no leftover gap.

**Still not committed.** Items 1 and 2 are both live on `:3001` but exist only in
the working tree, so the running container is ahead of git.

---

### Item 3. Remove the patient search box from the Physician Reports screen

**Request.** On the Physician Reports screen, the search field shown in the
Patient Reports table header — placeholder **"Search patient / ID / file..."** —
should be removed.

**Which input — checked in code.** Two search inputs exist in
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx`, but only one
of them can ever appear on screen:

| Line | Placeholder | Component | Rendered? |
|---|---|---|---|
| `:2892` | "Search patient / ID / file..." | `DashboardViewV2` (`:2390`) | **yes** — mounted at `:5255` |
| `:1901` | "Search by patient / ID / file..." | `DashboardViewV1` (`:1859`) | **no** — dead code, kept for reference, never mounted |

Only `DashboardViewV2` is mounted (`{currentView === "dashboard" && <DashboardViewV2 ... />}`),
so the target is the `<input>` at `:2892-2902`. It sits in the table-header flex
row `:2868-2903`, next to the `"Patient Reports  N of M"` heading — which is what
the request means by "the window with the patient search".

**Scope of the removal.**

- Remove/comment the `<input>` only. The `"Patient Reports N of M"` heading in the
  same header row stays. With one child left, the row's `sm:justify-between`
  simply left-aligns the heading — no layout fix needed.
- `search` / `setSearch` are **props** of `DashboardViewV2` (`:2395-2396`), owned
  by the parent (`useState("")` at `:4543`, passed down at `:5260-5261`).
  Leaving the state in place is the smaller change; `search` also still feeds the
  tbody `key` at `:2952`. It just never changes from `""`.
- `filteredPatients` (`:5094`) filters on that state, so with the box gone it
  degenerates to "all patients". The `N of M` counter will therefore always read
  `N of N`. Acceptable, but worth a look when implementing.
- The `search_input` tracking effect (`:5113-5122`) becomes dead — it only fires
  when `search` changes. No need to remove it; it simply stops emitting.

**Pre-existing issue found while checking, NOT caused by this item.** The
onboarding tour has a step targeting `[data-tour='search-filters']`
(`OnboardingTour.tsx:20`). That anchor exists only in the dead `DashboardViewV1`
(`:1898`); the live `DashboardViewV2` search box carries no `data-tour`
attribute. So that tour step already has no target today. Removing this input
does not make it worse, but the orphaned step should be cleaned up separately.

**Open point — delete or comment out?** Item 2 was explicitly "comment out, not
delete". This one was phrased as "remove". Commenting out is the safer default
and keeps the two changes consistent and equally reversible.

**Resolved: commented out.** The instruction to proceed did not pick one, so the
change follows Item 2's pattern — the box is gone from the screen, which is what
was asked, and restoring it is a one-block uncomment.

**Change made (✅).** Two edits in
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx`:

1. The `<input>` at `:2892-2902` is wrapped in a JSX comment recording why it is
   hidden and that `search` stays `""` as a result.
2. The header comment above it changed from `{/* Table header with search */}` to
   `{/* Table header */}`, so the comment no longer describes markup that is not
   there.

Nothing else changed: `search` / `setSearch` remain props of `DashboardViewV2`,
the parent still owns the state, and the `search_input` tracking effect is left
in place (it simply stops firing).

**Verification.** Static: 0 `tsc` errors in the edited file, `jest` 272 passed /
28 suites, `next build` clean. Behavioural, measured in a headless browser
against a throwaway dev server:

| Check | Result |
|---|---|
| `<input>` elements on the dashboard | **0** (was 1) |
| Input placeholders present | **none** |
| "Patient Reports" heading | still shown |
| Counter next to the heading | `5 of 5` |
| Patient table rows rendered | **5** — the table itself is unaffected |
| Rubric legend heading (Item 2 regression check) | still **0** |

A screenshot of the dashboard confirms the header row now holds only the heading
and its counter, left-aligned, with no gap where the input used to be.

**Note on the counter.** As predicted above, `N of M` is now permanently `5 of 5`
because nothing can narrow `filteredPatients` any more. It is not wrong, just
redundant. Left as-is — collapsing it to a plain count was not requested.

**Deployed.** The `webapp` image was rebuilt and the `webapp` service recreated on
2026-09-03. Re-measured against `:3001`: 0 `<input>` elements, counter `5 of 5`,
5 table rows. The Item 1 and Item 2 checks were re-run in the same pass and still
hold — 0 rubric legend headings, and the floating "Scoring Rubric" button still
opens locked at 5 — Patient-centered Estimate. All three items are now live on
the same image.

---

### Item 4. Show only "Individual" on the trajectory toggle — no "Average" button

**Request.** The card headed **"Overall Quality of Risk Communication Score
Trajectory"** carries a two-button toggle, Individual / Average. Keep
**Individual** visible and make the **Average** button not exist at all — not
disabled, not hidden behind a condition, simply not rendered.

**Where this lives.** All in
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx`, inside
`DashboardViewV2`:

| Line | What |
|---|---|
| `:2495` | `const [viewMode, setViewMode] = useState<"average" \| "individual">("individual")` — already defaults to individual |
| `:2601-2622` | the toggle itself; both buttons come from one `.map` over `(["individual", "average"] as const)` |
| `:2671` | chart line `dataKey={viewMode === "individual" ? "individual" : "score"}` |
| `:2730` | `viewMode` passed to `TrajectoryPointDetail` for the hover tooltip |

So the change is narrow: the two buttons are generated by a single array literal
at `:2606`. Dropping `"average"` from that array removes the button and leaves
the Individual chip rendering exactly as it does now.

**Consequences, traced.**

- `viewMode` can no longer change. It stays `"individual"`, which is already the
  initial value, so the chart and tooltip keep rendering what they render today —
  no visual change beyond the missing button.
- The average branches become unreachable but stay valid: the `"score"` dataKey
  at `:2671`, and in `TrajectoryPointDetail` (`:2275`) the "Cumulative Avg"
  block (`:2314-2319`) and the "Individual Patient Scores" list (`:2321-2328`).
  Note that component's own prop default is `viewMode = "average"` (`:2284`) —
  harmless here because `DashboardViewV2` always passes the value explicitly at
  `:2730`, but worth not mistaking for the live default.
- `setViewMode` becomes unused. `tsconfig.json` has no `noUnusedLocals` and
  `.eslintrc.json` only extends `next/core-web-vitals`, so this does not fail the
  build — same situation as Items 2 and 3.

**Dependency check — clear.** The toggle carries no `data-tour` anchor; the
nearest ones are `data-tour="trajectory-chart"` on the card itself (`:2584`) and
`data-tour="summary-box"` (`:2741`), neither of which is inside the toggle. The
toggle's `onClick` (`:2609`) calls only `setViewMode` — no behaviour-tracking
event is lost.

**Open point — same question as Item 3.** Delete the `"average"` entry, or keep
it commented out as with Items 2 and 3? With a one-word array element there is
little to comment out cleanly, so a short comment recording why the array holds
a single value is probably the better fit.

**Resolved: entry deleted, reason recorded in a comment.** Commenting out a
single array element would have left `{/* "average" */}` inside a `.map`
argument, which is noise rather than documentation. Instead the array is now
`(["individual"] as const)` and the block comment above it states that "average"
was dropped and that putting it back into the array restores the toggle.

**Change made (✅).** One edit in
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx` `:2601-2606`:

1. `(["individual", "average"] as const)` → `(["individual"] as const)`.
2. The comment above it, previously `{/* Mode toggle: cumulative average vs each
   consultation's own score */}`, was rewritten — it described a toggle that no
   longer exists, and now records why only one mode is offered and how to undo it.

Nothing else changed. `viewMode`, `setViewMode`, the `"score"` dataKey branch and
`TrajectoryPointDetail`'s average branch are all left in place.

**Verification.** Static: 0 `tsc` errors in the edited file, `jest` 272 passed /
28 suites, `next build` clean. Behavioural, measured in a headless browser
against a throwaway dev server:

| Check | Result |
|---|---|
| Buttons labelled "Individual" | **1** |
| Buttons labelled "Average" | **0** (was 1) |
| Chart data dots rendered | **10** — line chart unaffected |
| Hover tooltip on the first point | `Visit 1 \| Consultation \| Consultation score: 0.80` — the individual branch, as before |
| Item 2 regression (rubric legend heading) | still **0** |
| Item 3 regression (`<input>` count) | still **0** |

The tooltip row is the meaningful check: `viewMode` is now permanently
`"individual"`, and the tooltip still renders the per-consultation score rather
than falling through to the cumulative-average branch.

**Deployed.** The `webapp` image was rebuilt and the `webapp` service recreated
on 2026-09-03. Re-measured against `:3001`: 1 "Individual" button, 0 "Average"
buttons, 10 chart dots, and the hover tooltip still reads
`Visit 1 | Consultation | Consultation score: 0.80`. Items 1-3 were re-checked in
the same pass and hold — 0 `<input>` elements, 0 rubric legend headings, and the
floating "Scoring Rubric" button still opens locked at 5 — Patient-centered
Estimate. All four items are now live on one image.

### Item 5. Hide the remaining "Individual" button as well

**Request.** Directly after Item 4 was deployed: the "Individual" chip that
survived on the trajectory card header should not be visible either. With no
second mode left to switch to, a single always-active button conveys nothing, so
the header should carry only the title "Overall Quality of Risk Communication
Score Trajectory".

**Where this lives.** The same block Item 4 touched, now at
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx` `:2601-2627` —
the `<div className="inline-flex rounded-md border overflow-hidden text-xs">`
wrapper and the `.map` inside it. Its parent is the card header
`<div className="flex items-center justify-between mb-4">` (`:2592`), whose only
other child is the `<h2>` title (`:2593`).

**Consequences, traced.**

- `justify-between` with a single remaining child leaves the `<h2>` flush left,
  which is where it already sits. No layout gap opens up.
- `viewMode` (`:2495`) is still read at `:2676` (chart `dataKey`) and `:2735`
  (`TrajectoryPointDetail`), so it does not become dead; it is simply pinned to
  its initial `"individual"`.
- `setViewMode` now has no caller at all. As with Items 2-4 this does not fail
  the build — `tsconfig.json` has no `noUnusedLocals` and `.eslintrc.json` only
  extends `next/core-web-vitals`.
- Nothing else reads the toggle: it has no `data-tour` anchor and its `onClick`
  emitted no tracking event, so neither the onboarding tour nor behaviour
  tracking loses a target.

**Change made (✅).** One edit, at
`PhysicianReportsModifiedV41Timothy.tsx` `:2601-2627`. Unlike Item 4 — where a
single array element was deleted because `{/* "average" */}` inside a `.map`
argument would have been noise — here a whole JSX element is being hidden, which
is the same shape as Items 2 and 3. So it is **commented out, not deleted**,
using one merged comment block (JSX comments do not nest, so the pre-existing
comment above the toggle had to be folded into the same block rather than wrapped
by a second one). The comment records both item 4 and item 5, and states that
uncommenting the block and restoring `"average"` to the array brings the full
toggle back.

`viewMode`, `setViewMode`, the `"score"` dataKey branch and
`TrajectoryPointDetail`'s average branch are all left untouched.

**Verification.** Static: 0 `tsc` errors in the edited file, `jest` 272 passed /
28 suites, `next build` clean. Behavioural, measured in a headless browser
against a throwaway dev server on `:3900` (started with
`BACKEND_URL=http://localhost:18001`, otherwise the proxy defaults to `:8000`
and the page never leaves "Loading physician communication reports..."):

| Check | Result |
|---|---|
| Buttons labelled "Individual" | **0** (was 1) |
| Buttons labelled "Average" | **0** (item 4 regression) |
| Trajectory card title still rendered | **yes** |
| Chart data dots rendered | **10** — chart unaffected |
| Hover tooltip on the first point | `Visit 1 \| Consultation \| Consultation score: 0.80` — still the individual branch |
| Item 2 regression (rubric legend heading) | still **0** |
| Item 3 regression (`<input>` count) | still **0** |
| Item 1 regression (floating rubric button → modal) | opens locked at **5 — Patient-centered Estimate** |

A screenshot of the card confirms the header is now the title alone, with the
line chart unchanged below it.

**Deployed.** The `webapp` image was rebuilt and the `webapp` service recreated
on 2026-09-04 (`prostatecancer-webapp-native`, healthy, `0.0.0.0:3001->3000`).
Re-measured against `:3001`: 0 "Individual" buttons, 0 "Average" buttons, the
trajectory title still rendered, 10 chart dots, and the hover tooltip still
`Visit 1 | Consultation | Consultation score: 0.80`. Items 1-3 re-checked in the
same pass and hold — 0 `<input>` elements, 0 rubric legend headings on load, and
the floating "Scoring Rubric" button still opens locked at 5 — Patient-centered
Estimate. A screenshot of the deployed card shows the header as title only. All
five items are now live on one image.

### Item 6. Make the topic links obviously clickable

**In one line.** The TOPIC cell went from a plain text link to a full-cell solid
cyan navigation tile — key-style bottom ledge, looping arrow chip, `breathe`
brightness idle, press feedback, and a "Click a topic" header chip — deliberately
kept out of the Scoring Rubric button's gradient/glow/ping vocabulary; all of it
is live on `:3001` and none of it is committed.

**Request.** On the COMPASS Provider Dashboard the per-topic links should be given
a clearer visual effect, so that the physician can tell without experimenting that
they are clickable and is nudged into clicking them. Recorded only — no code
change yet.

**Which links — identified in the running app, not inferred.** "COMPASS Provider
Dashboard" is the page-level header (`:5239`) and is shown on all three views, so
it does not by itself pick out a screen. The only place topics are rendered as
links is the **Topics Table on the patient report (grid) view** — reached from the
Physician Reports list by pressing "View Report" on a patient
(`currentView === "grid"`, `:5297`; table anchored at `data-tour="grid-topics-table"`,
`:3322`).

The links are the five domain names in the leftmost TOPIC column, generated by
`ALL_TOPICS.map(...)` (`:3411`) and rendered as a `<button>` at `:3432-3451` in
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx`:

| Row | Text |
|---|---|
| 1 | Cancer Prognosis |
| 2 | Life Expectancy |
| 3 | Erectile Dysfunction |
| 4 | Urinary Incontinence |
| 5 | Irritative Symptoms |

Clicking one calls `setSelectedTopic({ name, patient })` and switches to the
detail view — this is the main path into the sentence-rewrite screen, which is why
its discoverability matters.

**Current styling — measured with `getComputedStyle` against the deployed `:3001`,
not read off the class list.** All five buttons are identical:

| Property | Value |
|---|---|
| class | `text-sm font-semibold underline transition-colors text-left text-cyan-600 hover:text-cyan-800` |
| `cursor` | `pointer` (from the Tailwind preflight `button` rule) |
| `color` | `rgb(8, 145, 178)` — cyan-600 |
| `text-decoration-line` | `underline`, thickness `auto` |
| `font-size` / `font-weight` | `14px` / `600` |
| hit area | 137×20 px (single-line rows) to 150×40 px (two-line rows) |
| `title` / `aria-label` | none |

So the affordance today is: cyan + underline + a pointer cursor, and on hover a
colour shift to cyan-800. That is a conventional link treatment, but it is small,
it is the only cue, and the hover change is subtle.

**Two observations worth carrying into the fix.**

1. **The hit area is much smaller than the row.** Rows are ~100-200 px tall
   (driven by the sentence and suggestion columns) and the TOPIC cell is wide,
   but only the 137×20 px text responds. Most of the cell looks like part of the
   link and is dead. Enlarging the target may matter more than restyling it.
2. **The same visual treatment is used for something that is not clickable.** In
   the "YOUR HIGHEST RATED SENTENCE" column the `<main>`-highlighted span is
   rendered bold + underline + cyan (`:3496`) inside a plain `<div>`, so it looks
   exactly like the topic link but does nothing. The "How to Improve" column's
   cyan "Score N: ← next step" lines (`:3516-3525`) are plain `<div>`s too.
   Strengthening the topic link without differentiating it from these could make
   the screen harder to read rather than easier.

**Direction chosen by the requester.** Asked how strong the effect should be, the
requester answered: give the topic links **an effect similar to the floating
"Scoring Rubric" button**. That settles the visual language — the topic becomes a
gradient pill in the same idiom as that button (`:1721-1757`): `rounded-full`,
`bg-gradient-to-r from-cyan-500 to-blue-500` (dark `from-cyan-600 to-blue-600`),
white text, `shadow-[0_0_15px_rgba(6,182,212,0.35)]` (dark `0.4`),
`hover:scale-105` / `active:scale-95`, plus a `animate-ping` attention ring.

**Two design faults caught in a live-DOM prototype before any code was written**
(per the webapp's "measure first" rule — the pill markup was injected into the
running page at `:3001` and screenshotted in both themes):

1. **A top-aligned pill looks detached from its row.** The score circle in the
   next column sits at the `<td>` default `vertical-align: middle`, so a pill
   pinned to the top of the cell reads as belonging to a different row.
   `items-center` is required; measured centre-y delta afterwards was 0 px on all
   five rows.
2. **The existing `underline` class must be removed, not just overridden.** Left
   in place it is inherited by the pill's white label and is plainly visible in
   dark mode.

**Technique for enlarging the hit area — the obvious approach does not work.**

| Approach | Button height in the 203 px row | Verdict |
|---|---|---|
| Drop the `<td>` padding, give the button `h-full` | **60 px** | fails — a `<td>` gives its child no definite height to resolve against |
| `<td className="relative">` + `<button className="absolute inset-0">` | **202 px** | works |

Taking the button out of flow does not disturb the table: the `<th style={{width}}>`
hints hold the columns, and both column widths and row heights measured identical
before and after.

**Change made (✅).** Two edits, both in
`PhysicianReportsModifiedV41Timothy.tsx`:

1. `:3421` — the `<tr>` gains an anonymous `group` class.
2. `:3430-3452` — the TOPIC `<td>` is replaced. The cell becomes
   `relative p-0`; the existing `<button>` (same `onClick` body, unchanged) becomes
   `group/topic absolute inset-0 flex items-center`, carrying `title` and
   `aria-label` of `Open sentence-level review for <topic>` where it previously
   had neither, plus a `focus-visible:ring-2 ring-inset` for keyboard users. Inside
   it sits the gradient pill with the topic name and a `›` glyph (this file uses
   plain glyphs — `←`, `▶`, `ⓘ` — rather than an icon library, so no new import).

Two rings sit behind the pill:

- **Intro ring** — `animate-ping` with `animationIterationCount: 3` and
  `animationFillMode: "forwards"`. It pings three times when the table first
  renders, then stops. The `forwards` fill is load-bearing: without it the ring
  reverts to its base `opacity-25` and stays on screen as a static blob.
- **Hover ring** — `opacity-0` rising to `group-hover:opacity-25 group-hover:animate-ping`,
  i.e. it runs only while the pointer is anywhere in the row.

**Why not the floating button's permanent pulse.** The floating "Scoring Rubric"
button pulses forever, which is fine for a single element over an otherwise static
page. Five of them pulsing at once inside a table would compete with reading the
sentence and suggestion columns. Row hover gives the same "this is a control" cue
at the moment the physician is looking at that row, and costs nothing while they
read.

**Two levels of feedback, deliberately.** Tailwind v3.4.15 does not treat
`group/topic` as also matching plain `.group`, so a descendant's `group-hover:`
resolves to the nearest ancestor carrying `group` — the `<tr>` — while
`group-hover/topic:` resolves to the button. That split is used on purpose: the
pill lifts (`group-hover:scale-105`) when the pointer is anywhere in the row, and
the gradient brightens (`group-hover/topic:from-cyan-400 …`) only when the pointer
is actually over the cell.

**Correction to an earlier note in this section.** An earlier draft said the topic
buttons "emit no behaviour-tracking event today". **That was wrong.** The GridView
mount site (`:5320`) already wraps `setSelectedTopic` and emits
`trackEvent("topic_select", \`grid_topic_${topic.name}\`)`; the score circle
likewise emits `score_click`. No tracking code was added, and because the event
predates this change, click-through before and after can be compared directly from
existing data.

**Not changed, on purpose.**

- **The row is not made clickable as a whole.** It contains the score-circle
  rubric button (`:3461`) and a scrollable, selectable sentence column; a row-level
  handler would swallow or fight both. The cell is the ceiling.
- **The look-alike `<main>` highlight (`:3496`) is left alone.** Once the real link
  is a gradient pill it is no longer "underlined cyan text", so the confusion the
  earlier note flagged disappears without touching the sentence column.
- The onboarding tour is untouched: its anchor is the table wrapper
  (`data-tour="grid-topics-table"`, `:3322`), not the buttons.

**Verification.** Static: 0 `tsc` errors in the edited file, `jest` 272 passed /
28 suites, `next build` clean. Behavioural, measured in a headless browser against
a throwaway dev server on `:3900` (`BACKEND_URL=http://localhost:18001`), using a
doctor account that actually has patients — an empty account returns
`{"files":[],"file_details":[]}` and the table never renders at all:

| # | Check | Result |
|---|---|---|
| 1 | Topic button height vs its `<td>` height | 202/308/241/328/347 vs 203/309/242/329/348 — 1 px apart (was 20 vs 203) |
| 2 | Pill size / button width | 150×60 / 182 px |
| 3 | Column widths, row heights | 182·121·486·425 / 203·309·242·329·348 — **unchanged** |
| 4 | Pill centre-y vs score-circle centre-y | delta **0 px** on all five rows |
| 5 | Pill `text-decoration-line` | `none` ×5 |
| 6 | Click near the cell's inner bottom-left corner | enters the detail view (previously dead) |
| 7 | Hover on a *different* column of the row | pill `matrix(1.05, 0, 0, 1.05, 0, 0)`, hover ring animation `ping` |
| 8 | Hover on the topic cell itself | gradient brightens — light `rgb(34,211,238)→rgb(96,165,250)`, dark `rgb(6,182,212)→rgb(59,130,246)` |
| 9 | Tab to the button, press Enter | focused **true**, navigated **true** |
| 10 | Score circle still opens the rubric modal | yes — the topic button does not swallow it |
| 11 | `title` / `aria-label` | filled on all five |
| 12 | Intro ring after 10 s | opacity `0` ×5 — decays and leaves nothing behind |
| 13 | Items 1-5 regression | 0 "Individual", 0 "Average", 0 `<input>`, 0 rubric legend headings |

Checks 7-11 were run twice, once per theme (dark reached by clicking
`#theme-toggle`), and pass identically. Light and dark screenshots of the table
were taken and reviewed.

**Deployed.** The `webapp` image was rebuilt and the `webapp` service recreated on
2026-09-04 (`prostatecancer-webapp-native`, healthy, `0.0.0.0:3001->3000`). The
whole table above was re-measured against the deployed `:3001` and reproduces:
columns `182·121·486·425` and rows `203·309·242·329·348` unchanged; button heights
`202/308/241/328/347`; `alignDelta` 0 on all five rows; `text-decoration-line`
`none` and white text on all five pills; `title === aria-label` on all five; the
intro ring at `0.21` on load and `0` ten seconds later; a click at the cell's inner
bottom-left corner (6 px in from the edges) enters the detail view. Row hover gives
`matrix(1.05, 0, 0, 1.05, 0, 0)` with the hover ring animating `ping`, and cell
hover brightens the gradient — light `rgb(34,211,238)→rgb(96,165,250)`, dark
`rgb(6,182,212)→rgb(59,130,246)`. The score circle still opens the rubric and
keyboard focus + Enter still navigates, in both themes. Items 1-5 re-checked in the
same pass and hold: 0 "Individual", 0 "Average", 0 `<input>`, 0 rubric legend
headings. Light and dark screenshots of the deployed table were taken. All six
items are now live on one image. Not committed — see §3.

**Follow-up 6a — the pill shape was wrong for the content (fixed, deployed).**
On review the requester asked for the design to be reworked and for the current
design's problem to be fixed first. Inspecting the deployed table at 2× revealed
that the label and the `›` chevron both sat inside the pill's end curve. Measured
cause:

| Topic | Width needed on one line | Width available inside the pill |
|---|---|---|
| Cancer Prognosis | 137 px | **108 px** |
| Life Expectancy | 124 px | 108 px |
| Erectile Dysfunction | 159 px | 108 px |
| Urinary Incontinence | 165 px | 108 px |
| Irritative Symptoms | 158 px | 108 px |

**All five labels wrap to two lines, and widening is not available** — the TOPIC
column measures 182 px at 1280, 1440 and 1920 viewport widths alike. `rounded-full`
is a single-line shape: on a 60 px-tall box it produces 30 px semicircular end
caps, so a two-line label and a right-aligned chevron are both pushed into the
curve. The floating "Scoring Rubric" button does not have this problem because its
label is one line — copying its radius along with its colours was the mistake.

**Fix.** `rounded-full` → `rounded-2xl` (16 px) on the pill and on both rings.
Four radii (9999 / 16 / 12 / 8 px) were injected into the live DOM and compared as
screenshots; 16 px keeps the soft look while clearing the curve, and `rounded-2xl`
is already used in this file. The reason is recorded in a code comment next to the
class, with the measurements.

Re-verified against the rebuilt `:3001`: radius `16px` on all five pills and all
five intro rings; pill size now uniform at 150×60 across all five rows; columns
`182·121·486·425` and rows `203·309·242·329·348` unchanged; button heights
`202/308/241/328/347`; `alignDelta` 0; `text-decoration-line` `none`;
`title === aria-label` on all five; intro ring at `0` once it finishes; corner
click still enters the detail view; row hover still `matrix(1.05, …)` with the ring
animating `ping` at radius `16px`; cell hover still brightens the gradient; score
circle and keyboard Enter still work — all of it in both themes. Items 1-5 hold
(0 "Individual", 0 "Average", 0 `<input>`, 0 rubric legend headings). `tsc` 0
errors in the file, `jest` 272 passed / 28 suites, `next build` clean.

A further redesign of this effect is expected — the requester has said they want a
different design, to be specified. This entry records the state it is being handed
over in.

**Follow-up 6b — redesigned so it is clearly not the rubric button (code + verified,
deployed).**

*Request.* "The design should look clearly different from the Scoring Rubric, but it
still has to induce the user to click." So the problem is not that the pill was ugly
— it is that it had no differentiation. The original direction for item 6 was "same
effect as the Scoring Rubric button", which was followed literally, and the result
copied four of that button's five traits:

| Trait | Floating Scoring Rubric (`:1741`) | Pill as deployed (6 + 6a) |
|---|---|---|
| Fill | cyan→blue **gradient** | cyan→blue **gradient** — same |
| Shadow | cyan **glow** `0 0 15px` | cyan **glow** `0 0 15px` — same |
| Resting motion | `animate-pulse` + 2 ping rings | ping ring (3× on entry) — same family |
| Hover | `scale-105` + gradient brightens | `scale-105` + gradient brightens — same |
| Shape | `rounded-full` | `rounded-2xl` — the only difference |

Only the radius differed, so five miniature rubric buttons sat in the table and the
one real rubric button lost its meaning.

*Direction chosen.* The two controls have different jobs, so they should speak
different vocabularies:

- **Scoring Rubric = reference / help.** One per screen, has to keep saying "look at
  me" → gradient, glow and a permanent pulse are appropriate.
- **Topic = navigation.** Five per screen, has to say "go in here" → directional
  vocabulary is appropriate.

The app already has a navigation vocabulary: the **"View Report"** button in the
patient list (`:3078`) — `rounded-lg`, **solid** `bg-cyan-500` (dark `cyan-600`), no
glow, no animation. The topic tile was moved into that family rather than inventing
a third style. That separates it from the rubric button and makes "this takes you to
the next screen" consistent across the app.

*Where the click inducement comes from now.* Not from a pulse:

- **Solid cyan fill** — as visible at rest as the gradient was; the column does not
  go quiet.
- **A verb, `REVIEW`** — the least ambiguous signal there is, and something the
  rubric button does not have.
- **A `→` arrow that advances 4 px on hover** — direction rather than a radial
  pulse. This file uses plain glyphs (`←`, `▶`, `ⓘ`) and no icon library, so no new
  import.
- **The tile lifts when the pointer is anywhere in the row** — the left column still
  answers while the sentence column is being read.
- **A one-off staggered slide-in on mount** (70 ms apart, left to right) replaces the
  ping rings: motion that draws the eye once, not forever, and horizontal rather
  than radial.

*Change made.* In `PhysicianReportsModifiedV41Timothy.tsx`:

1. Both ping rings deleted. The topic cells now contain zero `animate-ping` /
   `animate-pulse` elements (measured).
2. The gradient pill replaced by a solid tile: `rounded-lg`, `bg-cyan-500` /
   `bg-cyan-600`, `shadow-sm` → `shadow-md`, row-hover `-translate-y-0.5`,
   cell-hover deepens the fill. Two content rows: the topic name, then `REVIEW`
   with the `→` right-aligned.
3. `entered` state in `GridView` flips one animation frame after mount; the entrance
   transition sits on a **separate wrapper `<span>`**, not on the tile.
4. The comment above the cell rewritten — it still claimed the cell was "styled
   after the floating Scoring Rubric button", which is now the opposite of the
   intent.

*Two things the measurement corrected.*

- Reducing the padding from `px-3.5` to `px-3` widens the text box from 108 px to
  126 px, so "Life Expectancy" (124 px) now fits on **one** line while the other
  four still wrap — line counts `[2,1,2,2,2]`. That makes the natural tile heights
  uneven, so a `min-h` is needed to keep the column tidy.
- The prototype had suggested `min-h-[76px]`, but that was measured **before** the
  `REVIEW` row existed. With it, the real heights are **86 px** (two-line) and
  **76 px** (one-line), so `min-h-[76px]` equalized nothing. Re-measured and set to
  `min-h-[86px]`; all five tiles then measure exactly 150×86. The table rows are
  203 px or taller, so this costs no layout.

*Differentiation achieved:*

| Trait | Rubric button | New topic tile |
|---|---|---|
| Fill | gradient | **solid** (= View Report) |
| Shape | `rounded-full` | **`rounded-lg`** (8 px, = View Report) |
| Shadow | cyan glow | **plain `shadow-sm` → `shadow-md`** |
| Resting motion | permanent pulse + 2 ping rings | **none** (one slide-in on mount) |
| Interaction | `scale` | **lift + arrow advance** |
| Content | icon + noun | **noun + verb + arrow** |

*Not changed.* The click target structure (`<td relative>` +
`<button absolute inset-0>`) is untouched, so the whole cell is still clickable — the
137×20 → 182×202 gain from item 6 is preserved. The row is still not a click target
(it holds the score circle and a scrollable sentence column). No tracking was added:
`topic_select` already fires at the mount site, so click-through before and after
this redesign is comparable from existing data. The rubric button itself, items 1-5,
the tour anchor and `tailwind.config.js` are all untouched.

*Verification* (headless Chromium, throwaway dev server, doctor account with five
patients, both themes):

| # | Check | Result |
|---|---|---|
| 1 | Column widths / row heights | `182·121·486·425` / `203·309·242·329·348` — unchanged |
| 2 | Button height vs `<td>` height | 202/203, 308/309, 241/242, 328/329, 347/348 — 1 px |
| 3 | Tile size, all five | **150×86 ×5** — uniform in both themes |
| 4 | Tile vs score circle vertical centre | 0 px ×5 |
| 5 | `border-radius` / `background-image` | `8px` / **`none`** — gradient gone |
| 6 | `box-shadow` | no cyan glow; `rgba(0,0,0,0.05) 0 1px 2px` at rest |
| 7 | `animate-ping` / `animate-pulse` inside topic cells | **0** |
| 8 | After entrance: wrapper `opacity` / `transform` | `1` / identity — stagger ends clean |
| 9 | Row hover | tile `translateY(-2px)`, arrow `translateX(4px)`, `shadow-md` |
| 10 | Cell hover fill | light `rgb(6,182,212)`→`rgb(8,145,178)`; dark `rgb(8,145,178)`→`rgb(6,182,212)` |
| 11 | Bottom-left corner of the cell clicked | enters the detail view |
| 12 | Keyboard focus + Enter | focus ring `2px inset` (light `rgb(6,182,212)`, dark `rgb(34,211,238)`); Enter navigates |
| 13 | Score circle click | opens the rubric modal, stays on the grid — the topic button does not swallow it |
| 14 | `title` / `aria-label` | present on all five |
| 15 | Dark mode | all of the above re-measured under `#theme-toggle` |
| 16 | Items 1-5 regression | 0 "Individual", 0 "Average", 0 `<input>` |

`tsc` 0 errors in this file, `jest` 272 passed / 28 suites, `next build` clean. A
full-screen capture in each theme shows the rubric button and the topic tiles
together; they no longer read as the same control.

**Deployed.** `docker compose -f docker-compose-frontend.yml build webapp` then
`up -d webapp` (the `webapp` service only — no `down`, no prune; this host runs many
other projects). Container healthy, `:3001` returns 200. The full 16-row table above
was re-measured against the rebuilt container in both themes and every value
matches the dev-server run: tiles `150×86` ×5, radius `8px`, `background-image`
`none`, no cyan glow, 0 animated elements in the topic cells, columns and rows
unchanged, corner click / keyboard Enter / score circle all behaving, items 1-5
still clean. Screenshots of the deployed table taken in both themes.

**Follow-up 6c — a slight idle animation added back (code + verified, deployed).**

*Request.* "Can a slight animation effect be added to it, like the Scoring Rubric?"

*Tension, and how it was resolved.* 6b removed all resting motion precisely because
the ping rings were what made the tile read as a copy of the rubric button. Putting
that vocabulary back would undo the differentiation the same requester asked for one
step earlier. So the tile now animates continuously — the "alive" quality of the
rubric button — but along different axes:

| | Scoring Rubric | Topic tile (6c) |
|---|---|---|
| What moves | scale (radial ping ×2 + `animate-pulse`) | **brightness** of the fill, and the **arrow**, horizontally |
| Amplitude | ring grows to 2× and fades out | **brightness 1 → 1.14**, arrow **0 → 4 px** |
| Phase | one control, always in phase with itself | **staggered 320 ms per row** — the column ripples, it never throbs in unison |
| On hover | keeps pulsing | **stops**, handing over to the hover response |

*Change made.*

1. `tailwind.config.js` — two new keyframes next to the existing `glow-*` pair:
   `nudge-x` (0 → 4 px → 0, originally over 2.6 s — see follow-up 6d) and `breathe`
   (`brightness(1)` → `brightness(1.14)` over 3.2 s).
2. The tile gets `motion-safe:animate-breathe group-hover:animate-none`; the arrow
   gets `motion-safe:animate-nudge-x group-hover:animate-none group-hover:translate-x-1`.
3. Both carry `animationDelay: topicIdx * 320ms`, so the five rows are out of phase.

*Why brightness and not opacity or scale.* Opacity would fade the label text with the
fill, and scale on five tiles at once pulls the eye away from the sentence column —
the same objection that kept the ping rings from being permanent in item 6. A
brightness filter moves only the fill; the tile does not move, so nothing reflows.

*Why the loop stops on hover.* The arrow's idle drift and its hover response both end
at +4 px. If the loop kept running under the hover transition the arrow would slide
back out from under the pointer's own feedback. With `group-hover:animate-none` the
loop is dropped and the same 4 px becomes a held position, so the two agree.

*`motion-safe:`* — measured under `prefers-reduced-motion: reduce`: both animation
names resolve to `none`, brightness stays flat at 1.000 and the arrow at 0 px. The
tile is fully usable without any motion.

*Verification* (headless Chromium, 12 samples 300 ms apart, both themes):

| # | Check | Result |
|---|---|---|
| 1 | Animation names on the five tiles / arrows | `breathe` / `nudge-x` on all five |
| 2 | Brightness swing | `1.000 … 1.140` on every row |
| 3 | Arrow travel | `0.0 … 4.0 px` on every row |
| 4 | Stagger delays | `0 / 0.32 / 0.64 / 0.96 / 1.28 s` |
| 5 | Same-instant brightness across rows | `1.014 1.138 1.003 1.026 1.070` — out of phase, as intended |
| 6 | Tile size during animation | `150×86` on every sample — no reflow |
| 7 | Tile top offset during animation | constant on every sample — nothing shifts |
| 8 | Row hover | both animation names → `none`, arrow parks at exactly `4 px` |
| 9 | `prefers-reduced-motion: reduce` | both → `none`, brightness `1.000`, arrow `0 px` |
| 10 | `animate-ping` / `animate-pulse` in topic cells | still **0** — no rubric-family motion |
| 11 | Geometry, click target, keyboard, score circle, items 1-5 | full 6b table re-run, all unchanged |

`tsc` 0 errors in this file, `jest` 272 passed / 28 suites, `next build` clean.

**Deployed.** `build webapp` then `up -d webapp` — the `webapp` service only, no
`down`, no prune; 17 containers still running on the host afterwards. Container
healthy, `:3001` returns 200. Re-measured against the rebuilt container: `breathe` /
`nudge-x` on all five rows, brightness `1.000 … 1.140`, arrow `0.0 … 4.0 px`, delays
`0 / 0.32 / 0.64 / 0.96 / 1.28 s`, same-instant brightness `1.021 1.138 1.002 1.022
1.065`, tile size and top offset constant through every sample, row hover kills both
loops and parks the arrow at `4 px`, `prefers-reduced-motion: reduce` flattens
everything. The 6b table was re-run on the deployed build too — geometry, click
target, hover fills, corner click, keyboard Enter, score circle and items 1-5 all
unchanged in both themes.

**Follow-up 6d — arrow speed increased (code + verified, deployed).**

*Request.* "Can the arrow movement be made faster?"

*Change made.* One value in `tailwind.config.js`: the `nudge-x` animation goes from
`2.6s` to **`1.4s`**, i.e. roughly 1.9× faster. Nothing else moved — the keyframe
itself, the 4 px travel, the 320 ms per-row stagger, the `breathe` timing (3.2 s) and
every hover / reduced-motion rule are unchanged. Only the arrow was asked about, so
only the arrow was touched; the tile's brightness cycle still runs at its old pace,
which also means the two loops no longer share a rhythm and the column reads less
mechanical.

*Verified against a dev server*, sampling row 1 every 40 ms for 3.6 s:

| # | Check | Result |
|---|---|---|
| 1 | Declared duration on all five arrows | `1.4s` (was `2.6s`) |
| 2 | Real peak-to-peak period | `1397 ms`, `1434 ms` — matches the declaration |
| 3 | Travel | `0.00 … 3.99 px` — unchanged amplitude, only the pace |
| 4 | Per-row delays | `0 / 0.32 / 0.64 / 0.96 / 1.28 s` — stagger intact |
| 5 | `breathe` on the tile | still `3.2s`, brightness `1.000 … 1.140` |
| 6 | Tile size / top offset while animating | `150×86`, constant — no reflow |
| 7 | Row hover | both loops → `none`, arrow parks at `4 px` |
| 8 | `prefers-reduced-motion: reduce` | both → `none`, arrow `0 px` |

`jest` 272 passed / 28 suites, `next build` clean.

**Deployed.** `build webapp` then `up -d webapp` — the `webapp` service only, 17
containers still up on the host, container healthy, `:3001` returns 200. Re-measured
on the deployed build: duration `1.4s` on all five arrows, real peak-to-peak
`1405 ms` / `1403 ms`, travel `0.00 … 4.00 px`, delays `0 / 0.32 / 0.64 / 0.96 /
1.28 s`, `breathe` still `3.2s` with brightness `1.000 … 1.139`, tile size and offset
constant, row hover stops both loops with the arrow parked at `4 px`, reduced-motion
flattens both. The 6b geometry table also re-run on the deployed build in both
themes — columns, rows, tile sizes, click target and items 1-5 all unchanged.

(Note: the compose command must be run from the repo root — the first attempt was
issued from `app/Webapp/`, where `docker-compose-frontend.yml` does not exist, and
failed harmlessly before touching the container.)

**Follow-up 6e — "Review" removed, clickability carried by shape instead
(code + verified, deployed).**

*Request.* Asked why the word "Review" was on the tile at all; told to delete that
line, and asked what else could signal visually that the tile is clickable.

*Why the word was there, and why removing it is right.* It was added in 6b, not
requested. Its job was to be the unambiguous "what happens if I press this" signal at
a point where all resting motion had just been removed, and to break the rubric
button's `icon + noun` pattern. Since then the arrow loop (6c/6d) took over the
"this leads somewhere" job, and the label's costs were real: the same word repeated
five times down the column, and the extra line pushed the tile from 60 px to 86 px.

*Measured first.* Before choosing a replacement, three layouts were injected into the
live table and measured:

| | Tile height | Label lines | Overflow |
|---|---|---|---|
| As deployed (with `REVIEW`) | 86 px | `[2,1,2,2,2]` | 0 |
| Label + arrow in a chip | **60 px** | `[2,2,2,2,2]` | 0 |
| Label + bare arrow | 60 px | `[2,2,2,2,2]` | 0 |

The chip costs 32 px of the 126 px text box, which pushes every label to two lines —
so the five tiles come out **uniform by construction**, and the `min-h` that 6b
needed is no longer load-bearing (it is kept at 64 px only as a guard).

*One idea measured and dropped:* adding `cursor-pointer`. The computed cursor on the
topic button is already `pointer` (Tailwind's preflight sets it for `button`), so
there was nothing to gain — worth recording so it is not "fixed" again later.

*Change made.*

1. The `REVIEW` row is gone. The tile is a single row: label left, arrow right,
   `items-center justify-between`.
2. The arrow now sits in a **24 px round chip** (`bg-white/20`), so it reads as a
   control to operate rather than as punctuation. It keeps the `nudge-x` loop, the
   per-row stagger and the hover hand-off unchanged.
3. The tile gets a **4 px bottom ledge** in a darker cyan (light `cyan-700`, dark
   `cyan-800`; one step darker again on cell hover) — the front face of a key. This
   is the main "you can press me" cue now, and being a shape cue it does not repeat
   as text five times.
4. **Press feedback**: `active` drops the face 2 px and halves the ledge to 2 px, so
   the key visibly sinks. Tile height stays 64 px throughout, so nothing reflows.

*Verification* (headless Chromium, both themes):

| # | Check | Result |
|---|---|---|
| 1 | Any "review" text left in the tile | **none** on all five |
| 2 | Tile size | `150×64` ×5 — uniform |
| 3 | Label lines / horizontal overflow | `2` each / `0` each |
| 4 | Bottom ledge at rest | `4px rgb(14,116,144)` light, `4px rgb(21,94,117)` dark |
| 5 | Ledge on cell hover | darkens to `rgb(21,94,117)` / `rgb(14,116,144)` |
| 6 | Pressed | face `+2 px`, ledge `2px`, height still 64 px |
| 7 | Chip | `24×24`, radius `9999px`, `rgba(255,255,255,0.2)`, `nudge-x` running |
| 8 | Row hover | tile `-2 px`, `shadow-md`, chip loop → `none`, chip parked at `4 px` |
| 9 | Columns / rows | `182·121·486·425` / `203·309·242·329·348` — unchanged |
| 10 | Button height vs `<td>` | 1 px on all five — whole cell still clickable |
| 11 | Tile vs score circle centre | `0 px` ×5 |
| 12 | Cursor on the button | `pointer` (already) |
| 13 | `background-image` / `animate-ping` / `animate-pulse` | `none` / 0 / 0 — still no rubric vocabulary |
| 14 | Press, corner click, keyboard Enter | all enter the detail view |
| 15 | Score circle | opens the rubric modal, stays on the grid |
| 16 | `title` / `aria-label`, items 1-5 | present ×5; 0 "Individual", 0 "Average", 0 `<input>` |

`tsc` 0 errors in this file, `jest` 272 passed / 28 suites, `next build` clean.

**Deployed.** `build webapp` then `up -d webapp` from the repo root — that service
only; container healthy, `:3001` returns 200, 17 containers still up. The whole
16-row table above was re-measured against the rebuilt container in both themes and
every value matches: tiles `150×64` ×5, no "review" text, ledge `4px` →
`2px` when pressed with the face dropping `2 px`, chip `24×24` at radius `9999px`,
columns and rows unchanged, press / corner click / keyboard Enter all reaching the
detail view, score circle still opening the rubric. The arrow loop was re-timed on
the deployed build as well: `1.4s` declared, `1401 ms` / `1394 ms` measured, travel
`0.00 … 4.00 px`.

**Follow-up 6f — a "Click a topic" chip on the column header (code + verified,
deployed).**

*Request.* Asked for a way to tell the user visually that the tiles are clickable —
something other than the shape cues added in 6e.

*What already existed, checked before adding anything.*

- The onboarding tour's grid step already says "Click a topic name to see the
  detailed sentence-level view" (`OnboardingTour.tsx:81`) — but only on a first
  visit, and inside a paragraph with two other points.
- Every topic button already carries `title` / `aria-label`
  ("Open sentence-level review for …"), so a native tooltip appears on hover, but
  only after the OS delay and only for whoever hovers.
- The computed cursor is already `pointer` (6e).

So the gap is a **persistent, at-a-glance** signal, and the table already has a
convention for exactly that: the small `Guide` chip beside the "How to Improve"
header.

*Change made.* The `Topic` header becomes `Topic` + a cyan chip reading
**"Click a topic"**, styled like the existing `Guide` chip. It appears once per
table rather than five times down the column, which was the objection to the
`REVIEW` label in the tiles.

*Wording and size were measured, not chosen by eye.* The header shares the 182 px
TOPIC column, so an oversized chip widens it and shifts every other column:

| Chip text | Font | Chip width | TOPIC column | Other columns |
|---|---|---|---|---|
| "Click to review" | 12 px | 110 px | **199 px** | all shift |
| "Click to open" | 12 px | 99 px | **188 px** | all shift |
| "Click to review" | 10 px | 94 px | 183 px | 1 px shift |
| **"Click a topic"** | **10 px** | **80 px** | **182 px** | **unchanged** |

Without `whitespace-nowrap` the chip breaks into two lines ("Click to / review"),
which is what the first attempt did.

*Verification* (both themes): columns `182·121·486·425` and rows
`203·309·242·329·348` unchanged, so the chip costs no layout. Tiles still `150×64`
×5 with the ledge, chip arrow and press behaviour from 6e intact; corner click,
keyboard Enter and the score-circle rubric all still work; `animate-ping` /
`animate-pulse` still 0; items 1-5 clean. `tsc` 0 errors in this file, `jest` 272
passed / 28 suites, `next build` clean.

*Note.* This was added alongside the 6e ledge and press, not instead of them — if
the shape cues are meant to be dropped now that the header says it in words, that is
a one-line revert and has not been done.

**Deployment.** Requested 2026-09-04. `docker compose -f docker-compose-frontend.yml build webapp`
then `up -d webapp`, from the repo root; only the `webapp` service was touched
(`prostatecancer-webapp-native` recreated, `:3001 -> :3000`). No `down`, no prune.

Re-measured on `:3001` after the deploy:

| # | Check | Light | Dark |
|---|---|---|---|
| 1 | Header chip text / lines | "Click a topic", 1 line | "Click a topic", 1 line |
| 2 | Chip box / font / wrap | 82x24, 10 px, `nowrap` | 82x24, 10 px, `nowrap` |
| 3 | Chip colours | `rgb(207,250,254)` on `rgb(14,116,144)` | `rgba(22,78,99,0.6)` on `rgb(103,232,249)` |
| 4 | Column widths | 182-121-486-425 | 182-121-486-425 |
| 5 | Row heights | 203-309-242-329-348 | 203-309-242-329-348 |
| 6 | Tile size / ledge | 150x64, `4px` | 150x64, `4px` |
| 7 | Arrow chip | 24x24, radius 9999px, `nudge-x` | same |
| 8 | Row hover / cell hover | tile `-2 px`, arrow `+4 px`, deeper fill | same |
| 9 | Pressed | face `+2 px`, ledge `2px`, height 64 px | same |
| 10 | Corner click / Enter / score circle | detail / detail / modal | detail / detail / modal |
| 11 | `animate-ping` + `animate-pulse` in topic cells | 0 | 0 |
| 12 | Items 1-5 regression | Individual 0, Average 0, inputs 0 | same |

The header chip and the 6e shape cues are both live; nothing was reverted.

**Questions answered without a code change.**

Two questions were raised about the tile that produced no edit, recorded here so the
answers are not re-derived later:

1. *"Why is the word `Review` on the button?"* (2026-09-04, before 6e). It was
   introduced in 6b and had not been asked for — see 6e for the full answer and the
   removal.
2. *"What is the effect that makes the colour look slightly different?"*
   (2026-09-04, after the 6f deploy). It is the `breathe` keyframe from 6c, measured
   on the deployed `:3001`: `filter: brightness(1) → 1.14 → 1`, `3.2 s`, infinite,
   sampled range exactly `1.000 .. 1.140`. The fill colour itself never changes
   (`rgb(6,182,212)` light / `rgb(8,145,178)` dark) — only brightness, which is why
   it reads as a faint colour shift. The five tiles are offset `0 / 0.32 / 0.64 /
   0.96 / 1.28 s` so the column ripples instead of the whole table throbbing, and it
   stops on hover (`group-hover:animate-none`). Both idle animations sit behind
   `motion-safe:`, so they do not run under `prefers-reduced-motion`. No change was
   requested; narrowing the swing (1.14 → 1.07), lengthening the period, or dropping
   `breathe` entirely and keeping only the arrow are each a one-value edit.

**Final state of the topic control, for reference.** Two files hold all of items
6-6f: `app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx` (the `<td>`,
the tile, the header chip, the entrance state in `GridView`) and
`app/Webapp/tailwind.config.js` (the `nudge-x` and `breathe` keyframes).

| Layer | What it does | Value |
|---|---|---|
| Click target | whole cell, not the text | `<td relative p-0>` + `<button absolute inset-0>`, 182×202 vs 137×20 before |
| Fill / shape | navigation vocabulary, not rubric | solid cyan, `rounded-lg` (8 px), `shadow-sm`, no gradient, no glow |
| Ledge | reads as a physical key face | `border-b-4`, darker cyan |
| Entrance | once per visit to the grid | fade + slide-in, 500 ms, staggered 70 ms per row |
| Idle (tile) | keeps it alive at rest | `breathe`, brightness 1 → 1.14, 3.2 s, staggered 320 ms |
| Idle (arrow) | says "this leads somewhere" | `nudge-x`, 4 px, 1.4 s, staggered 320 ms, in a 24×24 `bg-white/20` circle |
| Hover | two levels | row hover: lift 2 px + arrow 4 px + idle stops; cell hover: deeper fill |
| Press | confirms the press | face down 2 px, ledge 4 px → 2 px, height constant 64 px |
| Words | one per table, not per tile | "Click a topic" chip on the TOPIC header, 10 px, `nowrap`, 82×24 |
| Assistive | unchanged throughout | `title` + `aria-label`, `focus-visible` ring, `pointer` cursor |

### Item 7. Focus-sentence emphasis becomes a yellow highlight

**Request** (2026-09-04). In the Consultation Scoring text, the focus sentence is
currently drawn **bold + underlined + cyan**. Change it to a **yellow highlighter
mark**. The requester gave the reason: a yellow highlight carries its meaning
instantly for the generation that grew up drawing highlighter pens through books.
Bold + underline does not — it has to be interpreted first, and on the web an
underline also reads as a link. Recorded first, per instruction, then implemented.

**What the "focus sentence" is.** The NLP pipeline hands the surrounding utterance
to the UI with the sentence that was actually scored wrapped in `<main>…</main>`
(`hooks/useDoctorData.tsx:43`). Every screen that shows a sentence in context
parses those markers and styles the inner part.

**Where it renders today — measured on the deployed `:3001`, not read off the
source.** On the detail screen (under the heading
`Consultation Scoring: 2.00 (Generalization)`) there are exactly two `.underline`
elements, and on the grid screen five — one per topic row:

| Site | Screen | Size | Colour light / dark | Source |
|---|---|---|---|---|
| A | Consultation Scoring sentence bubble | 544x39 (2 lines) | `rgb(8,145,178)` / `rgb(103,232,249)` | `ConsultationScoringV7Timothy7.tsx:354` |
| B | "1 Original Sentence" panel just below it | 1058x45 (2 lines) | `rgb(14,116,144)` / `rgb(103,232,249)` | `PhysicianReportsModifiedV41Timothy.tsx:4326` |
| C | Grid table sentence column, x5 | one per row | `rgb(14,116,144)` / `rgb(103,232,249)` | `PhysicianReportsModifiedV41Timothy.tsx:3630` |

All three are `font-weight: 700` + `text-decoration: underline` + cyan, with no
background (`rgba(0,0,0,0)`).

**What already exists.** The yellow-highlighter idiom is already in the same
component. `ConsultationScoringV7Timothy7.tsx:293` declares

```js
const highlightBg = isDarkMode ? "bg-yellow-600/50" : "bg-yellow-200";
```

and `:674` uses it as `${highlightBg} font-semibold px-1 rounded` on the matched
sentence inside the collapsible context panel — which is collapsed by default, so
it is rarely seen. This item is therefore not a new visual vocabulary; it promotes
an idiom the component already owns to the place that matters.

**Scope decision.** A, B and C are all changed; the patient first-visit view
(`PatientInitialVisitReportV42.tsx:1059`, same `<main>` treatment) is **not**.

- A is the site the request names.
- B is included because A and B render *the same sentence on the same screen* —
  changing only A would leave a yellow highlight and a cyan underline side by side.
- C is included because the grid is where the physician meets that sentence first,
  and a different mark there makes it harder to recognise as the same sentence.
- The patient view is a different screen for a different reader and is not
  Consultation Scoring, so it keeps bold + underline.

B and C are consistency work, not side effects of A. Reverting either is a one-line
change if only the bubble was meant.

**Change made.** One recipe, used at all three sites:

```
px-1 rounded box-decoration-clone
light: bg-yellow-200 text-slate-900   dark: bg-yellow-300 text-slate-900
```

- `ConsultationScoringV7Timothy7.tsx` — `highlightBg` (`:293`) now carries that
  pair and is applied to the focus sentence (`:354`) as well as the context panel
  it already served (`:674`), so the file has exactly one yellow.
- `PhysicianReportsModifiedV41Timothy.tsx` — a new `focusSentenceMark(isDarkMode)`
  helper next to `cx` (`:296`) holds the same recipe for sites B and C, rather than
  repeating the string twice.

Four decisions, each measured rather than chosen by eye:

| Decision | Why |
|---|---|
| Underline dropped | An underline reads as a link, and this screen already underlines a real control (the `all revisions` button). Two meanings for one mark. |
| Weight dropped to normal (was `700`) | Prototyped normal / semibold / bold in the live DOM. The mark is the emphasis; bolding a two-line sentence on top of a yellow stripe is one signal too many, and normal weight is what a highlighter over printed text actually looks like. |
| Cyan text colour dropped | Cyan on yellow is a poor pairing. Dark text on the mark measures 15.34:1 (light) and 13.54:1 (dark) — a highlighter is a light mark with the text showing through, not a tinted glow. |
| Yellow is solid, not translucent | The same mark is drawn on three different surfaces (gray bubble, `slate-700/50` panel, table cell). An alpha yellow composites to a different colour on each; a solid one does not. The first dark-mode attempt used the old `bg-yellow-600/50` and read as olive, not yellow. |

`box-decoration-clone` is load-bearing and new to this repo. The focus sentence
wraps — measured at 2 fragments in the bubble and up to 4 in the grid — and without
it the `px-1` padding and the rounded ends appear only at the very start and the
very end, leaving the middle lines cut off at the edge. Tailwind 3.4.15 does
generate the utility: computed `box-decoration-break: clone`.

**Verification** (throwaway dev server on `:3900`, both themes, doctor account with
five patients):

| # | Check | Light | Dark |
|---|---|---|---|
| 1 | `.underline` elements — grid / detail | 0 / 0 | 0 / 0 |
| 2 | Highlight marks found — grid / detail | 5 / 2 | 5 / 2 |
| 3 | Mark background | `rgb(254,240,138)` | `rgb(253,224,71)` |
| 4 | Mark text colour | `rgb(15,23,42)` | `rgb(15,23,42)` |
| 5 | Contrast ratio | **15.34:1** | **13.54:1** |
| 6 | `font-weight` / `text-decoration-line` | 400 / `none` | 400 / `none` |
| 7 | `box-decoration-break` | `clone` | `clone` |
| 8 | Padding / radius | `4px/4px` / `4px` | same |
| 9 | Wrapped fragments on the bubble sentence | 2 | 2 |
| 10 | Grid columns / rows | 182-121-486-425 / 203-309-242-329-348 | identical |
| 11 | Items 6b-6f regression | tile 150x64, ledge `4px`, `breathe` running, chip 82x24 "Click a topic" | same |
| 12 | Items 1-5 regression | Individual 0, Average 0, inputs 0 | same |

`npx tsc --noEmit` reports 0 errors in either modified file; `npx jest --runInBand`
272 passed / 28 suites; `npm run build` clean. `git status` shows only the two
component files changed (plus the earlier `tailwind.config.js`), so the patient
first-visit view is provably untouched.

*Noted while working.* The "Full Context" collapsible in
`ConsultationScoringV7Timothy7.tsx:643` never renders in the live app — its
`fullContext` prop is not passed by `PhysicianReportsModifiedV41Timothy.tsx`. Its
highlight (`:674`) was updated anyway so the file has one yellow, but it is dead
code today. Not fixed; out of scope.

**Deployment.** Requested 2026-09-04, right after verification.
`docker compose -f docker-compose-frontend.yml build webapp` then `up -d webapp`,
from the repo root; only `prostatecancer-webapp-native` was recreated
(`:3001 -> :3000`). No `down`, no prune — 17 containers share this host.

The whole verification table above was re-run against the deployed `:3001` and
reproduces exactly: 0 underlines on both screens, 5 marks in the grid and 2 in the
detail view, `rgb(254,240,138)` light / `rgb(253,224,71)` dark on `rgb(15,23,42)`
text, contrast 15.34:1 / 13.54:1, weight 400, `text-decoration: none`,
`box-decoration-break: clone`, `4px/4px` padding, `4px` radius, 2 wrapped
fragments. Grid geometry and every item 1-6f check unchanged in both themes.
Light and dark screenshots taken.

### Item 8. Voice input for the rephrasing / rewrite box

**Request** (2026-09-04). The rephrasing / rewrite feature should accept **voice
input** — the physician should be able to speak their rewrite rather than type it.
Recorded only at this point; no code change, no design decision taken yet.

**Where this would live — located in the source, not assumed.** The rewrite is
entered in a single `<textarea>` in the **Re-write Practice** panel of the detail
screen, `app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx`:

| Line | What |
|---|---|
| `:4225` | `{/* ═══ Re-write Practice Panel ═══ */}` — the panel |
| `:4251` | the "Re-write Practice" heading |
| `:4526-4537` | the `<textarea>`, bound to `newSentence` / `setNewSentence`, placeholder "Try rephrasing the sentence above — how would you communicate this to the patient next time?" |
| `:4540-…` | the action row: `handleSaveRewrite`, disabled while `!newSentence.trim()`, `rescoring`, or `saveStatus.status === "saving"` |

So the insertion point is narrow: anything that produces text and writes it through
`setNewSentence` reaches the existing save and re-score path unchanged. The
"Suggested Rephrasing" column on the grid (`:3143`) is *output* — the AI's
suggestion, not the physician's input — and is not part of this item. The many
older `PhysicianReportsModifiedV*` files that also contain "Suggested Rephrasing"
are not mounted; `V41Timothy` is the live one.

**Nothing like this exists yet — checked.** `grep` across `app/Webapp/src` for
`SpeechRecognition`, `webkitSpeechRecognition`, `MediaRecorder`, `getUserMedia`,
`whisper` and `transcrib*` returns **zero** matches. There is no microphone
permission prompt, no audio capture and no transcription client anywhere in the
webapp today, so this is a new capability rather than a restyling of an existing
one — unlike items 1-7.

**Open questions to settle before implementing.** These change the size of the work
by an order of magnitude, so they are recorded rather than guessed at:

1. **Which engine.** The browser's built-in `SpeechRecognition` (Chrome/Edge only,
   no extra infrastructure, but it streams audio to Google's servers) versus
   capturing audio in the browser and transcribing it server-side through the
   Backend. The second is more work but keeps the audio inside the project's own
   boundary.
2. **Whether consultation speech counts as PHI here.** The physician is dictating a
   rewrite of a sentence from a real consultation, so the audio and its transcript
   may carry patient-identifiable content. Repo rule 1 ("PHI never enters git") is
   about the repository, but the same reasoning applies to a third-party speech API
   — this needs an explicit decision, not a default.
3. **Whether the audio is stored at all**, or only the resulting text. Nothing in
   the current flow persists anything but the final rewrite string
   (`/api/doctor/rewrites`).
4. **Browser support.** `SpeechRecognition` is unavailable in Firefox and behind a
   prefix in Safari; the control would need a graceful fallback rather than a dead
   button.
5. **Where the transcript lands.** Replace the textarea contents, or append at the
   caret so dictation and typing can be mixed.

---

**Implemented 2026-09-10** on branch `feat/rewrite-voice-input` (base
`staging/caire` @ `6855d35`). The five open questions above were settled as
follows, and the answer to (1) is what makes (2) and (3) stop being questions:

1. **Which engine — neither of the two originally listed.** Speech becomes text
   **inside the browser tab** via `@huggingface/transformers` (`transformers.js`)
   running ONNX Runtime Web. No browser `SpeechRecognition` (which streams audio
   to a vendor), and no server-side transcription endpoint.
2. **Whether the speech counts as PHI — moot by construction.** The audio never
   leaves the machine: it goes microphone → `AudioContext` → worker → text. There
   is no upload path to disable, so no BAA and no vendor boundary to argue about.
   The resulting text reaches the Backend only where the typed text already did,
   through the unchanged "Try & Score" / `/api/doctor/rewrites` call.
3. **Whether audio is stored — no.** Nothing is written to disk, IndexedDB or the
   network. Only the model weights are cached (browser Cache API, first visit only).
4. **Browser support — a capability check, not a dead button.** `getUserMedia`
   exists only in a secure context, so on plain HTTP the control renders disabled
   with the reason in its tooltip ("Voice input needs a secure connection (HTTPS or
   localhost)."). Typing is untouched either way.
5. **Where the transcript lands — appended, never replacing.** `appendTranscript()`
   joins each recognised sentence to whatever is already in the box with a single
   space, and attaches a lone closing mark without one. Dictation and typing mix
   freely.

**Model — Moonshine, and the reason is compute shape, not file size.** Whisper
pads every input to 30 seconds of mel frames, so a five-second dictation still
costs thirty seconds of encoder work. Moonshine takes variable-length audio, so
cost tracks the actual utterance — exactly the short-phrase case this box is.
Measured ONNX download (encoder fp32 + decoder q8, the WASM combination):

| Model | encoder | decoder (merged) | total |
|---|---|---|---|
| **moonshine-base** (chosen) | fp32 80.8 MB | q8 42.5 MB | **123 MB** |
| moonshine-base, int8 encoder | 20.5 MB | 42.5 MB | 63 MB |
| moonshine-tiny | 7.9 MB | 20.2 MB | 28 MB |
| whisper-base | 82.5 MB | 53.7 MB | 136 MB |
| whisper-tiny.en | 32.9 MB | 30.7 MB | 64 MB |
| silero-vad (voice activity, always loaded) | — | 2.2 MB | 2.2 MB |

The model id is a single constant (`STT_MODEL_ID` in `src/lib/sttConstants.ts`)
and both families use the same `pipeline("automatic-speech-recognition", …)` call,
so switching is a one-line change if quality or load time argues for it.

**Files.** New: `src/lib/sttConstants.ts` (thresholds, model ids,
`appendTranscript`), `src/workers/stt.worker.ts` (VAD state machine + inference,
off the main thread), `src/hooks/useSpeechToText.tsx` (microphone, 16 kHz
`AudioContext`, worker lifecycle, cleanup), `src/components/RewriteVoiceInput.tsx`
(the button, 106 lines), `public/vad-processor.js` (`AudioWorklet` that re-chunks
the mic stream to 512-sample frames — served statically so the bundler never has
to handle a worklet), `.npmrc`, and a unit test for `appendTranscript`.
Modified: `PhysicianReportsModifiedV41Timothy.tsx` (button in the "How would you
say it better?" header row; `setNewSentence` widened to the full setState
signature because sentences arrive back-to-back and must append, not overwrite),
`next.config.js`, `Dockerfile`, `package.json` / lock.

**No migration.** `event_type` is a Postgres enum, so voice usage reuses the
existing `rewrite_input` value with `metadata: { source: "voice" }` rather than
adding a value that would need migration 030.

**Two build obstacles, both real rather than worked around.**
`onnxruntime-node`'s postinstall aborts on a CUDA 11 host; `.npmrc` sets
`onnxruntime-node-install-cuda=skip`, which is correct here because inference is
browser-side and that binding is never loaded (`next.config.js` also aliases it
to `false`). Separately, Terser died on `ort.bundle.min.*.mjs` — a pre-built ESM
file with top-level `import.meta` — so a small webpack plugin marks it
`minimized: true`, which is a statement of fact about an already-minified file,
not a suppression.

**Verified.** `tsc` clean for the new files (the 609-error baseline is unchanged),
`next lint` clean, 278/278 Jest tests pass including six for `appendTranscript`,
production build succeeds, and `app-build-manifest.json` confirms the
transformers/ORT chunks are **not** in the eager set for `/` — they load only
inside the worker, so First Load JS stays at 387 kB. End-to-end in headless
Chromium against a throwaway production server on `:3900`, with a public-domain
speech clip fed through `--use-file-for-fake-audio-capture`: model ready at 9 s,
first transcript in the textarea at 18 s, text correct. The same run on the
LAN URL (`http://10.226.8.205:3900`, not a secure context) shows the disabled
button with its tooltip and a still-working textarea.

**Status.** ✅ Implemented, verified and deployed.

**Follow-up the same day — the pilot needed HTTPS, so the deployment now has
it.** On `http://10.226.8.205:3001` the microphone cannot open at all; that is
the browser's secure-context rule and no application code can lift it. The
`chrome://flags/#unsafely-treat-insecure-origin-as-secure` route was tried first
and did not take on the requester's machine, so the fix moved to where it
belongs — the deployment, not each tester's browser:

- `webapp-tls` (nginx:1.27-alpine) in `docker-compose-frontend.yml` serves the
  identical webapp over TLS, proxying to the same container. It **owns LAN port
  3001**, the port everyone's existing links already use; the webapp container
  itself is now published host-locally only (`127.0.0.1:3002`) as the plain-HTTP
  door for tooling and tunnels. Port 3443 is kept as an alias.
- **Reverted the same day: `:3001` stays plain http.** For a few minutes nginx
  owned 3001 and redirected it to https so existing links would upgrade
  themselves. The requester did not want the automatic redirect, so it was
  undone — `:3001` behaves exactly as it always has, and https lives only on
  3443. The consequence is accepted deliberately: **voice input does not work
  on `:3001` and will not**, because plain http has no `getUserMedia` to call.
- **Lesson kept in the config: the upgrade redirect is now 302 + `no-store`,
  not 301.** A permanent redirect is cached by the browser indefinitely, so
  after the revert the requester's browser kept jumping to https on its own —
  the server had stopped sending the redirect, but the browser had not stopped
  believing it. Fixing that needed a cache clear on the client. Any redirect
  that might ever be withdrawn must not be cacheable.
- `scripts/generate-webapp-tls-cert.sh` issues the certificate (SAN
  `IP:10.226.8.205, IP:127.0.0.1, DNS:localhost`, 825 days) into `_tls/`, which
  is gitignored — the private key must never enter the repository.
- Self-signed, because no public CA issues certificates for private 10.x
  address space. The cost is a one-time "not private" click-through per browser;
  after it the origin is a full secure context, which is all the microphone
  needs. Unlike the flag, this needs nothing from the tester and works in
  Chrome, Edge, Safari and Firefox alike.

- `scripts/close-lan-exposure.sh` now closes **both** doors — `0.0.0.0:3001:3000`
  (webapp) and `0.0.0.0:3443:443` (webapp-tls) — and recreates both containers.
  It previously matched one literal string; with a second LAN port added, the
  2026-10-01 deadline would otherwise have closed half the exposure and reported
  success.

Verified end to end on `https://10.226.8.205:3443` with the requester's own
query string: `isSecureContext: true`, button enabled, transcript in the
textarea 18 s after the click. `http://10.226.8.205:3001` answers 200 directly
with no redirect, as before, and shows the disabled button with its tooltip.

**Remaining friction, and the honest limit.** Plain http can never open a
microphone — the API is absent, not merely blocked, so this is not something
application code can be made to do. What is left is the one-time self-signed
certificate warning. Removing that needs either the certificate installed in
each tester's trust store, or a hostname under a domain the project controls so
a publicly trusted certificate can be issued; neither was in scope today.

## 3. Status as of 2026-09-04

Intake is still open — more items are expected. This section records only what
has actually been carried out so far, so that "done" is never inferred later from
the code.

| # | Item | Code | Verified | Deployed to `:3001` | Committed |
|---|---|---|---|---|---|
| 1 | Rubric defaults to level 5 | ✅ | ✅ | ✅ | ❌ |
| 2 | Rubric legend panel hidden | ✅ | ✅ | ✅ | ❌ |
| 3 | Patient search box removed | ✅ | ✅ | ✅ | ❌ |
| 4 | Trajectory "Average" button dropped | ✅ | ✅ | ✅ | ❌ |
| 5 | Trajectory "Individual" button hidden | ✅ | ✅ | ✅ | ❌ |
| 6 | Topic links made obviously clickable | ✅ | ✅ | ✅ | ❌ |
| 6b | Topic tile redesigned away from the rubric style | ✅ | ✅ | ✅ | ❌ |
| 6c | Slight idle animation on the topic tile | ✅ | ✅ | ✅ | ❌ |
| 6d | Arrow loop sped up 2.6 s → 1.4 s | ✅ | ✅ | ✅ | ❌ |
| 6e | "Review" removed; ledge + arrow chip + press | ✅ | ✅ | ✅ | ❌ |
| 6f | "Click a topic" chip on the TOPIC header | ✅ | ✅ | ✅ | ❌ |
| 7 | Focus sentence highlighted yellow, not bold+underline | ✅ | ✅ | ✅ | ❌ |
| 8 | Voice input for the rewrite box | ⬜ | ⬜ | ⬜ | ⬜ |

"Verified" means measured in a headless browser, not just built. Each item's own
section above carries the measurement table.

**Follow-on feedback.** Reviewing this build on 2026-09-08, the manager reported
that the topic overview chart showed "10 patients" for a physician with 5 visits,
and that the score scale only responded to clicks despite saying "hover". Those
are **not** regressions from the items above — the patient-count defect predates
this log entirely (an unscoped `/doctor/scores/average` call returning every
transcript in the database). Both are recorded, root-caused and fixed in
[`2026-09-08_manager_webapp_feedback.md`](2026-09-08_manager_webapp_feedback.md),
which carries the full "why it said 10" chain.

### Outstanding

1. ~~**Nothing is committed.**~~ **Committed on 2026-09-08** as
   `feat(webapp): make the rubric and topic tiles readable at a glance`
   (`cf8c1ab`) on `staging/caire` — the first twelve rows above (items 1-7 plus
   follow-ups 6b-6f; item 8 is not started), together with
   `app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx`,
   `app/Webapp/src/components/ConsultationScoringV7Timothy7.tsx`,
   `app/Webapp/tailwind.config.js` and this log file. Both component files also
   carried the 2026-09-08 fixes by then, so the commit was split hunk-by-hunk;
   `cf8c1ab` therefore reconstructs exactly the state deployed on 2026-09-04.
   Not pushed.
2. **The `N of M` counter is now always `N of N`** (Item 3 side effect). Not
   wrong, just redundant. Collapsing it to a plain patient count was not
   requested and was left alone.
3. **Item 1 left one decision open** — whether the Re-write Practice rubric
   toggle (`:4332`) should also default to 5. It still opens on the sentence's
   own score. Unchanged pending confirmation.
4. **Click-through for the redesigned tile is worth checking later.** `topic_select`
   has been firing since before item 6, so the behaviour tables hold the pre-item-6
   gradient-pill and post-6b numbers for the same control. No new instrumentation
   is needed — just a query once there is enough traffic.
5. **Unrelated defect noticed while working on Item 3**: the onboarding tour step
   targeting `[data-tour='search-filters']` (`OnboardingTour.tsx:20`) has no
   matching element in the live dashboard view. Pre-existing, out of scope here,
   worth its own item.
6. **6f was added alongside 6e, not instead of it.** The request was phrased as a
   replacement for the shape cues, but the ledge and press are still live together
   with the header chip. Dropping them is a one-line revert; not done, pending
   confirmation.
7. **The onboarding tour still describes the old control.** Its grid step says
   "Click a topic name" (`OnboardingTour.tsx:81`), written when the topics were
   plain text links. They are now tiles with an arrow and a header chip. Not wrong,
   just dated; rewording was not requested.
