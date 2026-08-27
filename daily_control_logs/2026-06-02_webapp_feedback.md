# 2026-06-02 (Tue) — meeting: UI revisions (timecodes omitted)

- **Date**: 2026-06-02
- **Scope**: UI revisions and decisions from the whole conversation, especially the
  demo segment from minute 27 to the end
- **Sections**: patient UI / physician dashboard / shared (data, PHI, technical)

> **Document convention**: real names are replaced with role labels per repository
> convention — PI / lead developer / maintenance developer / survey collaborator /
> de-identification owner. Each work item gets its own `dev_docs/<item>_PLAN.md`
> before implementation.

> **One-line background**: a tool for a prostate cancer clinical study. AI analyses
> the doctor–patient consultation and (a) shows the patient a summary of their own
> consultation, and (b) shows the physician how their "risk communication score"
> moves over time, with the goal of improving how they explain risk. This meeting
> was the final review of the patient UI and physician dashboard before the study
> starts.

---

## A. Patient-facing UI

### The premise — the patient enters the tool **twice**

- **First entry = report (Overview)**: right after the first consultation. The
  patient only browses the summary of their own consultation. No survey.
- **Second entry = survey**: one to two weeks later, right after the follow-up. The
  same summary is shown again, but this time the patient answers the survey.

The two screens have different purposes, so **what is shown and what is hidden
differs per screen** — that is the backbone of every decision in section A. (This
was originally designed as one flow; separating the screens followed from making
the two entries explicit.)

### A-1. First entry = report (Overview) — *revised and settled*

- **All five domains on one page**: cancer prognosis, life expectancy, and the other
  three are listed vertically on one screen, each collapsed behind a drop-down.
- **Two drop-downs inside each domain**: (i) the AI-generated summary, (ii) the
  supporting sentences from the consultation that back it up.
- **Every drop-down defaults to collapsed.** The patient must click to open.
  - Why: (a) **click tracking** — which domain a patient opens first and most often
    is a secondary outcome telling us what matters most to that patient;
    (b) **learning the tool** — opening them teaches the patient the difference
    between an AI summary and its supporting evidence (engagement).
- **Next button, right-hand navigation, and the progress bar are hidden on this
  screen**: it is a single page to browse freely, so there is nothing to page
  through. Those elements appear only on the survey screen (A-2).
- **Keep instruction 1, remove 2 and 3**:
  - Numbered instructions 1/2/3 sit under the header.
  - **2 and 3 explain how to answer the survey**, which is out of place on a report
    screen with no survey → move them to the survey screen.
  - **1 explains how to use the tool** ("click the drop-downs"), which is useful on
    the report as well → keep. (PI: "there are no questions on the first screen, so
    those instructions aren't needed. Only the first is about using the tool, and
    that's useful in the report too.")
- **Header wording consistency** *(unresolved)*: the header currently reads
  *"Your consultation summary…"*. Whether the second (survey) entry should reuse it
  or get wording matched to its purpose was left open.

### A-2. Second entry = survey screen — *revised*

- **Skip the Overview**: the first thing shown is the "Cancer prognosis" domain and
  its questions. The second visit is fundamentally about answering, so there is no
  need to pass through an overview.
- **AI summary defaults to open here**: the patient should see the summary (and its
  numbers) without clicking, because the answers are meant to be informed by those
  numbers. (The control arm answers from memory with no AI summary — that difference
  is the intervention effect.)
- **Supporting sentences stay click-to-open**, as on the first screen, so we can
  still track which patients open the evidence.
- **Per-domain flow**: answer → Submit → Next moves to the following domain
  (life expectancy, and so on).
- **Right-hand navigation and the bottom Next button appear only here**, not on the
  report screen.

### A-3. Survey question alignment — *action item*

> **Why this came up**: the same side effect carries different risk depending on the
> treatment. Erectile dysfunction, for example, produces separate estimates and
> supporting sentences per treatment (surgery 4, radiation 3, ablation 2) — which is
> also why the sentence count varies from one to four in A-4. But while *display*
> can show several treatments, the *questions* cannot be triplicated. The lead
> developer put it in one line: *"then how would you score it?"* — asking per
> treatment makes risk perception impossible to score as a single outcome, and the
> statistical analysis falls apart.

- **Decision: ask about exactly one, most-relevant treatment per side effect**
  - Erectile dysfunction (ED) → radical prostatectomy
  - Urinary incontinence → radical prostatectomy
  - Irritative / lower urinary tract symptoms → radiation
  - Selection rule: the treatment where that side effect is most pronounced (surgery
    for ED and incontinence, radiation for irritative symptoms)
- **Name the assumed treatment inside the question text** (e.g. "if you were to have
  a radical prostatectomy…")
- **Cross-check (action item)**: there was doubt about whether the wording on screen
  is the latest version reflecting this decision. The lead developer and the survey
  collaborator had already aligned the questions the previous week, so this is a
  **verification** task, not new work — but it should still be double-checked.

### A-4. Side-effect display — *test requested*

- AI pipeline validation showed the supporting sentences for a side-effect domain
  can vary **from one to four** because of the per-treatment estimates (see A-3).
  One side effect may produce separate blocks for surgery / radiation / ablation.
- The UI must therefore **stay consistent and unbroken regardless of sentence
  count** → the maintenance developer should test the 1, 2, 3, and 4 cases (width
  overflow, broken wrapping). The display area must not be fixed-width.

### A-5. Colour consistency — *minor tweak*

- Domain colours do not match the legend on the right → unify on one colour scheme.
  - e.g. cancer prognosis should be the legend's red rather than the current green;
    life expectancy purple.
  - Purpose: matching colours prevent the patient from mis-reading which domain is
    which.

---

## B. Physician dashboard

> The PI called this "the real **gem** of our study": other AI studies look only at
> patients or at automation, whereas this one **intervenes on physician behaviour**.
> Almost nothing changed here — the discussion converged on two small tweaks.

### B-1. Landing page — risk communication score trajectory

- **Left**: the patients assigned to that physician within the study, listed by SID
  (study ID).
- **Top**: a time series of that physician's risk communication score.
- **Time runs left to right (latest on the right), each visit is one point** —
  settled. (The score is expected to rise, meaning the physician's explanations are
  improving.)
- **Change 1 — add a consult date column to the patient report table**, so the
  physician can tell which visit is the most recent and how the rows are ordered.
- (Note) **Randomisation is clustered by physician**, so every patient on this screen
  belongs to that one physician.

> **🔧 Implementation note — consult date column (D-8) and the data reality
> (code analysis, 2026-06-05)**
>
> Checking the code: **the actual consultation date does not exist anywhere in the
> schema.**
> - The only date available is `llm_domain_scoring_and_summary.created_at`
>   (`server_default func.now()`) — the moment the AI pipeline processed that
>   transcript and wrote it to the DB, not the day the patient saw the doctor.
> - The real values bear this out: SID 21/22/24 all fall in 2026-05-30 12:15–12:18,
>   three to four minutes apart — a batch-processing timestamp, not a visit interval.
> - The trajectory chart's X axis already uses this `created_at`, so it is a
>   processing timeline.
> - The true consultation date is **PHI under HIPAA** → it has to arrive
>   **shifted by a random ±7 days** through the de-identification pipeline
>   (C-1/C-2/D-11), and neither the column nor the data exists yet.
>
> **Proposed increment** (build the UI now, swap the data source later):
> 1. Add the per-file date (`created_at`) to the `/api/doctor/files` response, which
>    currently returns only file / speaker / sentence_count.
> 2. Add a Date column with date sorting to the patient table, so the latest visit
>    is obvious.
> 3. Show the "displayed dates may not be the actual consultation dates" note (D-10)
>    alongside it, consistent with the C-2 decision.
> 4. When the de-identification pipeline supplies the ±7-day-shifted real date,
>    **swap the source** from `created_at` to that column.
>
> In short: build the date column, sorting, and disclaimer first, wire it temporarily
> to the processing timestamp, and swap when de-identification is ready. (The
> trajectory X axis should switch to the real date at the same time.)

### B-2. Patient drill-down (View Report)

- Clicking a patient in the left list opens their detail screen.
- Layout: **overall score** + **per-topic score** + the single **highest-rated
  sentence** for each topic, highlighted.
- **"How to Improve" column on the right**: guidance for moving up a level, shown as
  the 2→3→4→5 progression.
  - PI's assessment: showing the arc rather than only the top score lets the
    physician see the gradient — "a 2 means you mentioned the risk level, a 3 means
    you quantified it" — and understand incremental improvement. But keep the length
    down; eight to ten lines is overwhelming.
- **"Scoring rubric" button, top right**: opens the full hierarchy of the scoring
  criteria (for learning, not tied to a specific patient). This rubric is a study
  output accepted for publication in *Medical Decision Making*.

### B-3. Whether to add instructions — *discussed, effectively deferred*

- PI raised adding light usage/navigation guidance to the physician landing page.
- Majority view: **"physicians don't read instructions, they just click"** → leaning
  towards not adding it, with the PI to make the final call. If anything is added,
  the maximum would be highlighting or colouring the most recent patient.

---

## C. Shared / data and technical (affecting the UI)

### C-1. Patient identifier handling

> Governing principle: **no PHI of any kind on the server.**

- **The MRN cannot live on the server** → use a hashed ID, and give the physician the
  hashed ID plus a separate mapping table.
- **No sequential numbering (1, 2, 3…)**: a patient could guess another patient's ID
  and fool the tool (a requirement from hospital information security) → hence a
  non-sequential hash.
- **The SID can itself be an identifier**, so the scheme must be agnostic to the real
  number.
- **Patient initials are also not allowed** → the hashed ID is the only displayable
  form.
- (Note) This physician-side identifier and mapping is **never visible to patients**;
  a patient sees only their own report.

### C-2. Date handling — *UI disclaimer to add*

- **Visit dates are PHI under HIPAA** → the real consultation date cannot be stored.
- Apply a **random ±7-day shift**. The safe threshold is ±3 days; ±7 was chosen for
  margin. **The relative order of a patient's visits must be preserved**, so the
  trajectory chart's shape is not distorted.
- **Change 2 — add a two-line note to the UI** saying the displayed date may not be
  the actual consultation date. Without it, a careful physician who thinks "I didn't
  see that patient that day" loses trust in the tool. Acknowledging it up front
  prevents the misreading.
- Where it happens: both hashing and date shifting are performed **inside the
  de-identification owner's pipeline**, so by the time data reaches the tool the
  transformation is already done and the tool is unaffected.

### C-3. Multi-device compatibility — *testing needed*

- It has to work on phone, tablet, and desktop. The framework is probably responsive
  by default, but **this has never actually been tested** → the maintenance developer
  will check.

> **🔧 Implementation note — first responsive audit (2026-06-05, automated with Playwright)**
>
> **The automated audit ran, but real-device testing is still required.**
>
> - **Baseline**: the viewport meta tag is present (`width=device-width`) and
>   responsive classes are plentiful (80 `sm:/md:/lg:` on the patient page, 84 on the
>   physician dashboard). The skeleton is there.
> - **First audit** (5 screens × 4 devices = 20 combinations: phone 390, tablet
>   768/1024, desktop 1366):
>   - **Horizontal overflow: 20/20 passed (0 px)** — the primary mobile-breakage
>     indicator is clean.
>   - But **two real problems on the phone (390 px)**:
>     1. **The physician trajectory chart does not render** (no `recharts-surface`,
>        zero dots). Likely cause: `ResponsiveContainer height="100%"` with a mobile
>        parent using `flex-col` and `min-h` rather than an explicit height, so the
>        percentage height resolves to 0. Tablet (≥768, `md:flex-row`) and desktop are
>        fine. → **Candidate fix**: explicit mobile height on the chart container.
>     2. **The "Scoring Rubric" button overlaps the header title** (absolute
>        positioning at a narrow width). → **Candidate fix**: header wrap or right
>        padding.
> - **⚠️ Limitation**: the audit only measures overflow and element dimensions.
>   Things that show up **only on real hardware** — touch gestures and scroll
>   momentum, iOS Safari 100vh and safe-area behaviour, real font rendering, inputs
>   hidden behind the on-screen keyboard, rotation, low-end performance — still need
>   the maintenance developer on an actual phone and tablet.
> - Audit screenshots were written to a scratch directory; the Playwright script is
>   re-runnable.

---

## D. Action items and next steps

| # | Item | Owner |
|---|---|---|
| 1 | Patient UI: AI summary default-open on the survey, sentences click-to-open | lead / maintenance developer |
| 2 | Patient UI: drop the Overview on the second entry, start at cancer prognosis | lead / maintenance developer |
| 3 | Patient UI: hide Next, right navigation, and instructions 2–3 on the first entry (keep 1) | lead / maintenance developer |
| 4 | Patient UI: review header wording for report versus survey | lead / maintenance developer |
| 5 | Unify domain colours with the legend colour scheme | lead / maintenance developer |
| 6 | Test side-effect display with 1–4 sentences (no layout breakage) | maintenance developer |
| 7 | Cross-check the latest survey wording (single designated treatment) | lead developer / survey collaborator |
| 8 | Physician dashboard: add the consult date column | lead / maintenance developer |
| 9 | Physician dashboard: final decision on landing-page instructions | PI |
| 10 | Add the two-line "displayed date ≠ actual consultation date" note | lead / maintenance developer |
| 11 | Integrate MRN hashing and date shifting into the de-identification pipeline | de-identification owner |
| 12 | Mobile/tablet responsive testing | maintenance developer |
| 13 | Share a link (temporary ~1-hour deploy) or a voiceover video / in-person demo | lead developer |
| 14 | AI pipeline test before Thursday's meeting | lead / maintenance developer |

> **Overall tone**: the PI and the team both said explicitly that there are **no major
> changes, only little tweaks**. Development freezes in two weeks; after that the
> maintenance developer takes over and the lead developer moves to the next project
> at the end of June. Before the freeze, the next step is for the co-PIs to use the
> tool themselves and collect feedback.
