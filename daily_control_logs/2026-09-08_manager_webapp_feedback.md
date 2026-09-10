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
- The morning message raised three points; two of them turned out to be the same
  defect seen on two different screens, so they are logged as one item (Item 1)
  with the evidence from both.
- A fourth point — the "Your Avg Score" wording — arrived separately later the
  same day and is logged here as Item 3.
- A fifth point — showing the week of each visit next to "Visit N" — arrived after
  the second rebuild and is logged here as Item 4.

## 2. Items

| # | Item | Detail | Repo / target | Status |
|---|---|---|---|---|
| 1 | **Topic overview chart reports twice the real patient count** | Cancer Prognosis has 5 visits but the chart header reads "10 patients"; Life Expectancy shows the same doubled count | dashboard (`app/Webapp`) | ✅ done |
| 2 | **The score scale says "hover" but only responds to a click** | The hint under the 0-5 scale reads "Hover over score numbers above for rubric guidance"; hovering appears to do nothing, clicking works | dashboard (`app/Webapp`) | ✅ done |
| 3 | **"Avg Score" should read "Your Avg Score"** | The summary panel's average is the signed-in physician's own, but the label does not say so | dashboard (`app/Webapp`) | ✅ done |
| 4 | **Show the week of each visit next to "Visit N"** | e.g. `Visit 1 week of 9/7/2026` on page 1 | dashboard + backend | ⚠️ written and verified, awaiting deploy |

Items 3 and 4 are logged here rather than in a new file because the source and the
build under review are the same.

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

### Why it said exactly "10" — the full chain

Worth writing out, because the number is not arbitrary and the defect left no
error anywhere: **10 was the number of consultation transcripts in the entire
database**, not a doubling of anything.

**1. The endpoint scopes on an optional argument.** `GET /doctor/scores/average`
(`app/Backend/routes_doctor.py:602`) takes `doctor_id` as an
`Optional[str] = None`. It is used in step 1 of the query, which picks the latest
analysis per transcript:

```python
if doctor_id:
    latest_analysis_q = latest_analysis_q.where(
        TranscriptAnalysisLog.doctor_id == doctor_id
    )
```

There is no default and no fallback to the authenticated user. **Omitting the
argument is not "unfiltered by accident" — it is a valid request meaning
_every transcript in the database_.** The route returns 200 either way.

**2. Step 4 pads every file to exactly five rows**, one per domain
(`cp/le/ed/inc/ius`), so the payload size is exactly `5 × (number of files in
scope)`. That is where the clean 25-vs-50 split comes from — measured on the
deployed API:

| Call | `total_groups` | Distinct files | Per-domain counts |
|---|---|---|---|
| with `doctor_id` | 25 | **5** — this doctor's | `{cp:5, le:5, ed:5, inc:5, ius:5}` |
| without `doctor_id` | 50 | **10** — the whole database | `{cp:10, le:10, ed:10, inc:10, ius:10}` |

Of those 10 transcripts, 5 belong to the physician who was signed in and 5 belong
to other physicians. There is **no duplication inside either payload** — 0 exact
`(file, class, speaker)` duplicates in both. So the chart was not counting anything
twice; it was drawing **five other physicians' consultations** alongside the five
real ones.

**3. The dashboard called it both ways.** Two different effects in
`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx` fired the same
request and wrote the same `scoreAverage` state:

| Line (pre-fix) | Call | Result |
|---|---|---|
| `:5015` | `fetchScoreAverage(undefined, undefined, undefined, doctorId)` | 25 rows / 5 files — correct |
| `:5068` | `fetchScoreAverage(undefined, undefined, undefined)` | 50 rows / 10 files — everyone's |

The second one is the bug. It sits at the end of the `files → patients` conversion
effect, whose comment read *"Fetch scores for all patients"* — and "all patients"
was taken literally by the API. **Whichever response landed last won**, and since
the unscoped call is fired from the later effect it consistently won, which is why
the manager saw a stable "10" rather than a flickering number.

**4. Only one consumer was exposed.** The patient list was never wrong: the effect
that assigns per-patient scores (`:5090`) matches on
`d.file === patient.fileName`, so a foreign file simply finds no match and is
dropped. The topic overview chart (`:4016`) was the single place that plotted
**every row it was handed**, filtered only by domain class — so it, and only it,
rendered all ten.

**5. Why nobody caught it earlier.** The two responses are indistinguishable in
shape: same schema, same 5-rows-per-file padding, HTTP 200 both times. The
response even echoes its filters — but only `file`, `speaker` and `class`:

```
filters {'file': None, 'speaker': None, 'class': None}
```

`doctor_id` is **not** echoed, so nothing in the payload reveals whether it was
scoped. The only symptom available anywhere was the rendered patient count, which
is exactly how it was reported.

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

### Item 3. "Your" added to the summary panel's average

**Request.** "Could you please add the word 'Your' to Avg Score."

**Where it is — one place only.** The label sits under the large number in the
summary panel on the right quarter of the doctor dashboard
(`data-tour="summary-box"`, the Google-Scholar-h-index-style box). Read off
`:3001`:

```
1.32
Avg Score (5 patients)     ← this line
High (4–5)      0 / 5
Standard (3)    0 / 5
Low (0–2)       5 / 5
```

`app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx:2806`

```tsx
Avg Score ({patients.length} patients)
```

There is no ambiguity about the target: this is the **only** on-screen "Avg Score"
string in the codebase — every other `avg_score` match is an API field or a local
variable. `summary-box` exists in exactly one component, and that component is the
one `app/page.tsx:23` mounts; the older `V23/V29/V35/V37/V38/V39` files are all
commented out.

**Why "Your" is the right word here**, checked rather than assumed:

- The number is this physician's own. `overallAvg` (`:2448`) averages
  `patients[].overallScore`, and `patients` is built from the doctor-scoped file
  list — the same scope that item 1 above had to repair.
- The surrounding screens deliberately show *other* people's scores: the topic
  trajectory plots an `Other Patients` series with its own legend. So a bare
  "Avg Score" does not say whether it is the reader's average or the cohort's.
  That is the substance of the request, not just wording.
- The component already speaks this way — `Your Score` (`:3413`), `Your Highest
  Rated Sentence` (`:3424`) — and the onboarding tour describes this very panel as
  showing "**your** average score" (`OnboardingTour.tsx:46`). This aligns the label
  with copy that already exists rather than introducing a new voice.

**Change made (✅).** One line:

```tsx
Your Avg Score ({patients.length} patients)
```

"Avg" is kept rather than expanded to "Average" — the request was to add a word,
not to relength the label.

**Measured side effect — the label wraps on a narrow viewport.** The label is
`text-xs` (12 px) inside a `md:w-1/4` panel, so the space it gets shrinks with the
window. Predicted before the edit from text metrics, then confirmed by measuring
the old build on `:3001` against the new one at identical viewports:

| Viewport | Panel width | Label height (before → after) | Panel height (before → after) |
|---|---|---|---|
| 1600 | 304 px | 16 → 16 | 270 → 270 |
| 1280 | 304 px | 16 → 16 | 270 → 270 |
| 1024 | 240 px | 16 → 16 | 270 → 270 |
| 900 | 209 px | 16 → 16 | 269 → 269 |
| 850 | 197 px | 16 → **32** | 297 → **313** |
| 800 | 184 px | 16 → **32** | 325 → **341** |
| 768 | 176 px | 16 → **32** | 353 → **369** |

**At 900 px and above nothing changes at all.** The wrap begins between 900 and
850 px and costs exactly **+16 px** of panel height when it does. Nothing clips or
overflows, and below the `md` breakpoint the panel returns to `w-full`, where the
label fits again. (The panel is already taller at narrow widths in both builds —
the other rows wrap too — so the honest figure is the 16 px delta, not the
absolute height.)

**Left alone on purpose.** `whitespace-nowrap` would trade the wrap for an
overflow, which is worse, and shortening the text would be a wording change nobody
asked for. The dashboard is used on desktop.

**Also noticed, not changed.** The parenthetical counts `patients.length` while the
average divides by `scoredPatients.length` (those with `overallScore > 0`). Both
are 5 in the current data, so the two never disagree today, but a patient with no
score would make the label describe a denominator the number did not use. Out of
scope for a one-word request; recorded under Outstanding.

**Verification** (throwaway dev server on `:3900`, both themes — every row below
was identical in light and dark):

| # | Check | Result |
|---|---|---|
| 1 | Label | `Your Avg Score (5 patients)` |
| 2 | The number above it | `1.32` — unchanged |
| 3 | Band rows | `High (4–5) 0 / 5`, `Standard (3) 0 / 5`, `Low (0–2) 5 / 5` — unchanged |
| 4 | Panel size at 1600 / 1280 | `304x270` — unchanged |
| 5 | Label line count | 1 line at 1600 / 1280 / 1024 / 900; 2 lines at 850 / 800 / 768 |
| 6 | Cost of the wrap | exactly +16 px of panel height, only below ~900 px |

**Regressions re-checked in the same pass**, since this edit sits inside the
component both other items touched — all unchanged: topics read `5 patients` with
xMax 5 and **0** unscoped `/scores/average` requests (item 1); hint copy
`Click a score number above for rubric guidance`, cells `100x66` / `100x81` all
`cursor: pointer`, label hover raises the tooltip for 1-5, label click opens the
rubric (item 2); grid columns `182·121·486·425`, rows `203·309·242·329·348`, tile
`150x64`, ledge `4px`, `breathe` running, chip `82x24`, 5 marks / 0 underlines on
the grid and 2 / 0 on the detail screen, 0 "Individual" / 0 "Average" / 0 search
inputs (2026-09-01 items 1-7).

Static: `npx tsc --noEmit` **0** errors in the modified file,
`npx jest --runInBand` **272 passed / 28 suites**, `npm run build` clean.

**Note for whoever verifies next.** Run the browser measurements *before*
`npm run build`, or stop the dev server first: `next dev` and `next build` share
the same `.next` directory, and building underneath a running dev server breaks it
in a misleading way — the API proxy starts returning 500 and the app falls back to
the landing page, which looks exactly like a missing `BACKEND_URL` even though the
environment is fine. Restarting the dev server fixes it.

---

### Item 4. The week of each visit, shown next to "Visit N"

**Request.** "Could you please add the week that the visit occurred along with
Visit 1, so **Visit 1 week of 9/7/2026** for example, on page 1."

The example date is a **Monday**, so "week of X" means the Monday of the week the
visit falls in — a deliberately coarse stand-in for the date itself.

**This is a de-identification policy change, not just a label change.** The
dashboard hides visit dates on purpose. The de-id pipeline encrypts the visit date
into the transcript filename (AES-SIV, its own `DOMAIN_DATE`), and the backend
decrypts it **only to reconstruct the visit order**, then throws it away. Three
separate places say so in as many words:

| Where | What it says |
|---|---|
| `app/Backend/deid.py:126-131` | "The server decrypts it only to reconstruct the visit ORDER … the date itself is never stored or returned" |
| `app/Backend/routes_doctor.py:59-72` | "here we decrypt it ONLY to order the timeline (the date is never returned to the client)" |
| `PhysicianReportsModifiedV41Timothy.tsx:97-101` | "the UI shows visitIndex ('Visit N'), never a date" |

Granting the request relaxes that rule. A week label narrows a visit date to a
**7-day window** where the client previously had nothing. Requested by the manager,
so it is done — but only to the week, never to the day, and the relaxation is
recorded in the code comments as well as here.

**Is the data even there? — checked against the live database before planning.**
The visit date is **not a column in any table**. It is recoverable from the
filename, and a census of every distinct transcript says it is recoverable for all
of them:

| | Files |
|---|---|
| Distinct transcripts in `transcript_analysis_log` | 10 |
| Hashed date token decrypts via `unhash_visit_date()` | 8 |
| Legacy names carrying a plaintext `MMDDYYYY` instead | 2 |
| **Recoverable in total** | **10 / 10** |

Per physician the split is 5 / 2 / 1 / 1 / 1 files, and every physician is at 100%.
`DEID_KEY` is present in `app/Backend/.env`, and the backend already performs this
decryption on every `/files` request to build the visit order. **No schema
migration, no new column, no new data collection** — the server already knows the
value and simply does not send it.

**Three things the census turned up.**

1. **The two legacy files are a latent ordering bug.** `_hash_tokens()`
   (`deid.py:151-160`) strips a trailing plaintext 8-digit date before looking for
   hash tokens, so `unhash_visit_date()` returns `None` for exactly those names —
   even though their date is sitting in the filename in the clear. Their visit
   order therefore falls back to the AI processing timestamp
   (`_visit_order_key`, `routes_doctor.py:59`), which is not the visit date. One
   helper fixes the label and the ordering together.
2. **Two visits share a week.** The five consultations of the account used for
   review fall on three distinct dates in three distinct weeks, so two rows will
   carry the same "week of" string. That is the data, not a defect — worth saying
   out loud before it gets reported as one.
3. **`processing_date` must not be used for this.** `/files` already returns it,
   and the client already stores it in `fileDateMap`, but it is the timestamp at
   which the AI pipeline processed the file — `routes_doctor.py:516-520` says so.
   Rendering it as a visit date would be wrong.

**Where "Visit N" appears on page 1** — all in
`PhysicianReportsModifiedV41Timothy.tsx`:

| Surface | Code | Room for a longer label |
|---|---|---|
| Patient Reports table, first column | built `:5045-5052`, rendered `:3008-3019` | yes — the target |
| Score trajectory chart, X-axis tick | `:2492-2497` | **no** |
| Chart tooltip header | `:2318` | yes |
| Chart tooltip per-visit rows | `:2353-2357` | yes |

The X-axis is deliberately left as `Visit N`: a tick reading
`Visit 1 week of 9/7/2026` is roughly three times the current tick width, and five
of them collide. The manager's "page 1" is the table.

**Change made (✅).** Backend first, because the client cannot invent a value the
API does not send.

1. `app/Backend/deid.py` — `unhash_visit_date()` now also reads the **legacy
   plaintext** date, via a new `_legacy_plaintext_date()` helper. Only a value that
   parses as a real calendar date is accepted, so an 8-digit patient code cannot be
   mistaken for one. `_hash_tokens()` itself is untouched: it decides which token is
   the patient's and which the doctor's, and shortening the list would break that.
2. `app/Backend/deid.py` — new `visit_week_start()` returns the **Monday** of the
   visit's week as `"M/D/YYYY"`, unpadded, matching the format the request was
   written in. Its docstring states that this is the one date-derived value a client
   may see and that a day-level variant needs the same explicit request.
3. `app/Backend/routes_doctor.py` — `/files` `file_details` and
   `/scores/trajectory` events each gained **`visit_week`**. `processing_date` is
   left in place. The three comments that said "the date is never returned" now say
   what is actually true: the position and the week are returned, the day is not.
4. `PhysicianReportsModifiedV41Timothy.tsx` — a `fileWeekMap` state filled from the
   `/files` response (the same shape as the existing `fileVisitMap`), a `visitWeek`
   field on `PatientRow`, and the row label built as
   `Visit N week of M/D/YYYY`, falling back to plain `Visit N` when the server sent
   no week. The trajectory tooltip's `fileVisitMap` became `fileVisitLabelMap` so
   the tooltip carries the same string.
5. The chart's X-axis keeps the short tick. `chartData` now separates `time` (the
   tick, `Visit N`) from `visitLabel` (the tooltip header, with the week).

**A second defect fell out of change 1.** Because legacy names previously yielded no
date, `_visit_order_key` sorted them by the AI **processing timestamp** instead. On
the whole-database list two files moved from positions 8 and 9 to 3 and 4, and one
physician's two-visit timeline **swapped**: what the dashboard labelled "Visit 1"
was in fact the later consultation. The account used for review is unaffected (all
five of its files carry hashed dates and their order is byte-identical before and
after), but the fix is real and applies to every physician with a legacy file.

**Verification.** Backend measured by running a second, throwaway uvicorn on
`:18901` and diffing it against the untouched production backend on `:18001` — the
running service was never restarted, so `:3001` was not disturbed at any point.

| # | Check | Result |
|---|---|---|
| 1 | `/files` carries `visit_week` | **10 / 10** files, whole database |
| 2 | Every value is a Monday, unpadded `M/D/YYYY` | ✅ (asserted on the parsed weekday, not on the literal) |
| 3 | `/scores/trajectory` carries `visit_week` | 5 / 5 points |
| 4 | Old backend, same requests | `visit_week` absent everywhere — the field is new, nothing was overwritten |
| 5 | Visit order for the review account | `1·2·3·4·5` → identical before and after |
| 6 | Visit order elsewhere | two legacy files reordered; one physician's two visits swapped (the bug above) |

Browser measurements (throwaway dev server on `:3900` pointed at `:18901`, both
themes) — the row label:

| Viewport | Column width | Lines | Row height (before → after) | Overflow |
|---|---|---|---|---|
| 1600 | 583 | 1 | 65 → 65 | no |
| 1280 | 583 | 1 | 65 → 65 | no |
| 1024 | 460 | 1 | 65 → 65 | no |
| 900 | 400 | 1 | 65 → 65 | no |
| 850 | 376 | 1 | 65 → 65 | no |
| 768 | 337 | 1 | 77 → 77 | no |
| 700 | 304 | 1 | 77 → 77 | no |

**The layout cost is zero at every width measured** — identical geometry on `:3001`
and `:3900`, table height `383` px down to 768 and `459` px below it in both. (The
65 → 77 step at 768 px is a pre-existing breakpoint in another column, present in
the old build too; it is not caused by the longer label.) All five rows match
`Visit N week of M/D/YYYY`, the `title=` attribute matches the visible text, and
nothing wraps or is clipped.

Other surfaces, both themes:

| Check | Result |
|---|---|
| Trajectory tooltip header, points 1 / 3 / 5 | `Visit N week of M/D/YYYY \| Consultation` |
| X-axis ticks | `Visit 1 … Visit 5` — deliberately unchanged |
| Summary panel | `Your Avg Score (5 patients)` — item 3 intact |

**Regressions re-run in the same pass** (`/tmp/verify_0908.js`, both themes): **0**
unscoped `/scores/average` requests; all five topics `5 patients` with xMax 5; hint
`Click a score number above for rubric guidance`; cells `100x66` (score 5 `100x81`)
all `pointer`; label hover raises the tooltip for 1-5 and the label click opens the
rubric; grid columns `182·121·486·425`, rows `203·309·242·329·348`, tile `150x64`,
ledge `4px`, `breathe` running, chip `82x24`, 5 marks / 0 underlines on the grid and
2 / 0 on the detail screen; 0 "Individual" / 0 "Average" / 0 search inputs.

Static: backend `pytest -m "not e2e"` **594 passed / 4 skipped**, including six new
`visit_week_start` cases and three rewritten legacy-date cases;
`npx tsc --noEmit` **0** errors in the modified component;
`npx jest --runInBand` **272 passed / 28 suites**; `npm run build` clean.

**One backend test changed meaning, on purpose.**
`test_legacy_plaintext_date_returns_none` asserted the old behaviour — that a
legacy name yields no date. It is now
`test_legacy_plaintext_date_is_read_as_is`, and its docstring records what the old
`None` was silently costing (the processing-timestamp fallback). Two cases were
added beside it: a legacy date needs no `DEID_KEY`, and eight digits that are not a
calendar date are still rejected.

**Not verified on screen, and why.** The tooltip's per-visit breakdown — the
`fileVisitLabelMap` path — only renders in the chart's cumulative ("average") mode,
and the Individual / Average toggle was removed by the 2026-09-01 work, so that
branch is currently unreachable in the UI. It was updated for consistency, not
because it can be seen today.

---

## 3. Status as of 2026-09-08

| # | Item | Code | Verified | Deployed to `:3001` | Committed |
|---|---|---|---|---|---|
| 1 | Topic overview chart counts only this doctor's consultations | ✅ | ✅ | ✅ | ❌ |
| 2 | Score scale says "click" and the whole column is the target | ✅ | ✅ | ✅ | ❌ |
| 3 | Summary panel reads "Your Avg Score" | ✅ | ✅ | ✅ | ❌ |
| 4 | Visit rows read "Visit N week of M/D/YYYY" | ✅ | ✅ | ⬜ | ❌ |

**Item 4 needs a backend restart, not just a webapp rebuild.** It is the first item
in this log that changes Python. The running backend on `:18001` is the process
started 2026-08-28 and does not know the `visit_week` field; the client falls back
to a plain `Visit N` when the field is absent, so deploying only the webapp would
look like the change silently did nothing. Deploy order: restart the backend, then
`build` + `up -d webapp`.

**Deployment.** `docker compose -f docker-compose-frontend.yml build webapp` →
`up -d webapp`, from the repo root, on 2026-09-08. Only the `webapp` service was
touched; `prostatecancer-webapp-native` reports `healthy`. This build also carries
items 1-7 of the 2026-09-01 log, which were already live.

**Item 3 arrived after that rebuild and went out in a second one**, same commands,
same day; `prostatecancer-webapp-native` healthy again. So `:3001` now carries all
three items plus the 2026-09-01 set.

**Re-verified on `:3001` after the second deploy** (both themes): the label reads
`Your Avg Score (5 patients)`, one line at 1600 / 1024 / 900 with the panel at
`304x270` / `240x270` / `209x269`, two lines at 850 (`197x313`) exactly as measured
on the dev server; the number `1.32` and the bands `0/5`, `0/5`, `5/5` are
unchanged. Items 1 and 2 re-checked in the same pass and still clean — all topics
`5 patients` / xMax 5, **0** unscoped requests, `Click a score number above for
rubric guidance`, cells `100x66` / `100x81` all `pointer`, label click opens the
rubric, grid `182·121·486·425` × `203·309·242·329·348`, 5 marks / 0 underlines.

**Re-verified on `:3001` after the deploy** (both themes, same probes as above):
all five topics read `5 patients` with xMax 5 (`Current:` 2.0 / 0.0 / 2.0 / 0.0 /
0.0, unchanged); **0** unscoped `/scores/average` requests; hint copy is
`Click a score number above for rubric guidance`; cells `100x66` (score 5:
`100x81`) all `cursor: pointer`; hover on the label under 1-5 raises the tooltip
(0 still has none); clicking the label under "4" opens the rubric. Regressions
clean — grid columns `182·121·486·425`, rows `203·309·242·329·348`, tile `150x64`,
ledge `4px`, `breathe` running, chip `82x24`, 5 marks / 0 underlines on the grid
and 2 marks / 0 underlines on the detail screen.

Static checks for all three items: `npx tsc --noEmit` reports **0** errors in
either modified file, `npx jest --runInBand` **272 passed / 28 suites**,
`npm run build` clean.

**Regression checks re-run in the same pass** (both themes, on `:3900`): grid
columns `182·121·486·425` and rows `203·309·242·329·348` unchanged; topic tile
`150x64` with its `4px` ledge and `breathe` loop; `Click a topic` chip `82x24`;
5 yellow focus-sentence marks on the grid and 2 on the detail screen with **0**
underlines; 0 "Individual", 0 "Average", 0 search `<input>`. So items 1-7 of the
2026-09-01 log are intact.

### Outstanding

1. ~~**Not committed.**~~ **Committed on 2026-09-08** as
   `fix(webapp): scope score averages to the signed-in doctor, widen the
   score-scale target` (`0f31bc3`) on `staging/caire`, with this log. The
   2026-09-01 items went in first as `cf8c1ab`; both component files carried both
   sets of changes, so the two commits were split hunk-by-hunk rather than by
   file. Working tree clean, git now matches what runs on `:3001`. Not pushed.
   **Item 3 came in after those commits and is not in either of them** — the
   one-line label change and this log's item-3 sections are uncommitted.
2. **Item 4 is written and verified but not deployed**, and it is the first item
   here that needs the **backend** restarted as well as the webapp rebuilt. Until
   both happen, `:3001` keeps showing plain `Visit N`.
3. **The week is now a client-visible value.** Anything that renders a `PatientRow`
   name, or logs it, now carries a 7-day locator for a real consultation. Nothing
   currently writes it to storage — `PatientRow` is never persisted, and the
   webapp's own rule forbids PHI in `localStorage` — but a future feature that
   exports or caches the patient table should be checked against that rule rather
   than assuming the row label is opaque. The same applies to
   `console.log("Patients created from files (sorted):", patientList)`
   (`PhysicianReportsModifiedV41Timothy.tsx`), which now prints the week to the
   browser console.
4. **"N patients" wording** on the topic overview chart — see the open point under
   Item 1. Needs a decision, not a fix. The same wording sits in the summary
   panel's `Your Avg Score (N patients)`, so both should change together if it
   changes at all.
5. **The summary panel's count and its average use different denominators.** The
   parenthetical is `patients.length`; the average divides by
   `scoredPatients.length`, i.e. patients whose `overallScore` is above 0
   (`PhysicianReportsModifiedV41Timothy.tsx:2440-2453`). Today both are 5, so the
   label never contradicts the number. A patient with no score would make it read
   "N patients" over a mean that excluded one of them. Not part of a one-word
   request; recorded so the next reader does not have to rediscover it.
6. **Score 0 has no rubric tooltip.** Pre-existing; needs a level-0 rubric entry to
   resolve.
7. **Worth checking whether other screens call `/scores/average` unscoped.** The
   two call sites in the live component are now both scoped, but the older
   `PhysicianReportsModifiedV38Timothy.tsx` / `V39Timothy.tsx` (not mounted) pass
   a speaker and no doctor id. Harmless while they are unmounted; a trap if one is
   ever revived.
8. **The endpoint makes this class of bug invisible.** `doctor_id` is optional
   with no default, so "give me every physician's data" is spelled by leaving an
   argument out, and the response does not echo `doctor_id` in its `filters`
   block — a scoped and an unscoped payload are indistinguishable except by
   counting rows. Two cheap hardenings, neither requested and neither done:
   echo `doctor_id` in `filters` so a caller can assert on it, and/or default the
   scope to the authenticated user in `routes_doctor.py:602` so the parameter has
   to be widened deliberately rather than narrowed. The second changes API
   behaviour for any existing caller that relies on the unscoped form, so it needs
   a decision rather than a patch.
