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
| 1 | **Remove the dashed average line from the trajectory chart** | The horizontal dashed line labelled "Avg" across the "Overall Quality of Risk Communication Score Trajectory" card; extended on the developer's word to the detail view's twin of the same line | dashboard (`app/Webapp`) | ⚠️ done and verified, built, **not deployed** |

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

**Scope — both charts.** The request named one chart, but a second, unlabelled
`ReferenceLine y={3}` existed in the detail view's "*Topic* — All Patients Score
Overview" chart (same file), with the same constant and the same problem. Raised
with the developer rather than decided unilaterally; the answer was to remove that
one too, so both are gone. `ReferenceLine` is no longer used anywhere in the file,
so its `recharts` import was dropped with it.

**Verification.** The image was built and run on a **throwaway port (`:3900`,
bound to `127.0.0.1` only)**, so the live containers were never touched — they
stayed up throughout. Both charts were read out of the DOM, not eyeballed:

| Check | Before (`:3443`) | After (`:3900`) |
|---|---|---|
| `stroke-dasharray="6 3"` in `[data-tour="trajectory-chart"]` | 1 `<line>` at `y=63.2` | **0** |
| `Avg` text label in that card | present | **absent** |
| Overall trajectory card size | `896 × 270` | `896 × 270` — unchanged |
| `stroke-dasharray="6 3"` in `[data-tour="detail-topic-trajectory"]` | 1 | **0** |
| Detail chart card size | — | `1150 × 314` |
| `tsc --noEmit` on the edited file | — | ✅ no errors |

The card size is the load-bearing check, not the line count: the reference line
was an SVG overlay, so removing it must not resize or reflow anything. It did not.

The repo's pre-existing type errors (`ChartSettings`, `FilterSidebarV3`,
`InstituteSettings`, `PatientConsultationReports`) are unrelated and untouched.

**Built but NOT deployed.** The image
`prostate_cancer_consultation_dashboard-webapp` now carries both removals, but
`docker compose up -d webapp` was not run: the standing instruction is no deploy
until the developer explicitly asks for one, and "proceed" was read as covering
the code and the build, not the swap of the live container. `:3001` / `:3443`
therefore still show the dashed lines. The backend is not involved — this is a
webapp-only change, and the deploy is a single `up -d webapp` when authorised.

## 3. Status as of 2026-09-10

| # | Item | Code | Verified | Built | Deployed | Committed |
|---|---|---|---|---|---|---|
| 1 | Dashed "Avg" line removed from both charts | ✅ | ✅ (on `:3900`) | ✅ | ⬜ | ✅ |

### Outstanding

1. **Built, not deployed.** One `docker compose -f docker-compose-frontend.yml
   up -d webapp` from the repo root makes it live. No backend change.
2. **A real average is still unbuilt.** If the intent behind the original line was
   ever "show me how I compare", removing it leaves that need unmet. Worth asking
   whether a cohort average is wanted as a genuine, computed series — which would
   need an endpoint and a decision about whose scores form the cohort.
