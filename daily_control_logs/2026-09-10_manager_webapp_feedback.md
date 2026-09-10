# 2026-09-10 (Thu) — Manager feedback on the physician dashboard

> Names are replaced with role labels per repository convention — **the manager**,
> **the developer**, **the study coordinator**, **the NLP team**, **PI**.
> No PHI: no patient identifiers, transcript content, or real (including hashed)
> transcript filenames appear here.
> Markers: ✅ done / ⬜ not started / 🔄 in progress / ⏸️ deferred / ⚠️ partial.

## 1. Source

- Sent by the manager on 2026-09-10, after the backend restart that made
  [`2026-09-08_manager_webapp_feedback.md`](2026-09-08_manager_webapp_feedback.md)
  Item 4 ("Visit N week of M/D/YYYY") visible on `:3001` / `:3443`.
- The manager notes this was **raised before** and is being repeated: *"We
  mentioned removing the dashed average line if you could please do this on the
  overall quality of risk trajectory."* A repeat request is a signal the earlier
  round missed it, so it gets its own log entry rather than an amendment.

## 2. Items

| # | Item | Detail | Repo / target | Status |
|---|---|---|---|---|
| 1 | **Remove the dashed average line from the trajectory chart** | The horizontal dashed line labelled "Avg" across the "Overall Quality of Risk Communication Score Trajectory" card | dashboard (`app/Webapp`) | ⚠️ code done, not built or deployed |

---

### Item 1. The dashed "Avg" line was not an average

**Request.** "We mentioned removing the dashed average line if you could please do
this on the overall quality of risk trajectory."

**Measured before touching anything**, against the deployed `:3443` with the
study's five-patient physician account, reading the SVG out of the chart card
(`[data-tour="trajectory-chart"]`) rather than trusting the source:

| Measurement | Deployed build (2026-09-10, before) |
|---|---|
| Elements with `stroke-dasharray="6 3"` inside the card | 1 — a `<line>` at `y=63.2` |
| Text labels in the card | `Visit 1…5`, `0 1 2 3 4 5`, **`Avg`** |
| Card size | `896 × 270` |

So the report is accurate: one dashed line, labelled `Avg`.

**What it actually was.** `PhysicianReportsModifiedV41Timothy.tsx` drew it as

```tsx
<ReferenceLine y={3} strokeDasharray="6 3" label={{ value: "Avg", ... }} />
```

`y` is the literal constant `3` — the midpoint of the 0-5 scale. **No average was
ever computed for it**: not the physician's own average, not a cohort average, not
a rolling one. Nothing feeds it and no endpoint is called for it. On this account
every visit scores 0.8-2.0, so a fixed line at 3 sat above every point and read as
"you are consistently below average" — a comparison the chart was not entitled to
make. That is the strongest argument for removing it rather than relabelling it.

**Change.** Deleted the `<ReferenceLine>` block from the trajectory chart and left
a comment in its place recording why, so the next reader does not "restore the
missing average". Deleted, not commented out — unlike the view-mode toggle and the
rubric legend strip, which were commented out because restoring them means
uncommenting. A real average would be a different value from a different endpoint,
not this line, so there is nothing here worth keeping warm.

**Scope.** Only the chart the manager named. A second, unlabelled `ReferenceLine
y={3}` exists in the detail view's "*Topic* — All Patients Score Overview" chart
(same file). It was left alone: the request named one chart, and on that chart a
midline is at least defensible because the series really is a cohort. Flagged
under Outstanding — it has the same "constant pretending to be a statistic"
problem and the manager may want it gone too.

**Verification.**

| Check | Result |
|---|---|
| `tsc --noEmit` on the edited file | ✅ no errors (the repo's pre-existing errors are all in `ChartSettings` / `FilterSidebarV3` / `InstituteSettings` / `PatientConsultationReports`, none touched here) |
| `ReferenceLine` import still needed | ✅ yes — still used by the detail-view chart, so the import stays |
| Rendered result | ⬜ **not verified** — see below |

**Not built, not deployed.** The standing instruction is no rebuild and no deploy
until the developer asks, and this request said only "remove it". The dashed line
is still on `:3001` / `:3443` until a webapp rebuild happens; the backend is not
involved. After the rebuild the check is: zero `stroke-dasharray="6 3"` elements
inside `[data-tour="trajectory-chart"]`, no `Avg` label, and the card still
`896 × 270` (the line was an overlay, so removing it must not resize anything).

## 3. Status as of 2026-09-10

| # | Item | Code | Verified | Deployed | Committed |
|---|---|---|---|---|---|
| 1 | Dashed "Avg" line removed from the trajectory chart | ✅ | ⚠️ typecheck only | ⬜ | ⬜ |

### Outstanding

1. **Needs a webapp rebuild + redeploy** to become visible. No backend change.
2. **The detail view has the same line**, unlabelled, in "*Topic* — All Patients
   Score Overview". Ask the manager whether that one should go too rather than
   deciding unilaterally in either direction.
3. **A real average is still unbuilt.** If the intent behind the original line was
   ever "show me how I compare", removing it leaves that need unmet. Worth asking
   whether a cohort average is wanted as a genuine, computed series — which would
   need an endpoint and a decision about whose scores form the cohort.
