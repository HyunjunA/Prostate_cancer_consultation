# How to run the Webapp e2e tests visually

**Audience:** anyone who wants to *watch* the e2e suite drive a real browser
— for a demo, for debugging a flaky selector, or just to convince themselves
that the assertions actually correspond to a real user journey.

For the day-to-day fast feedback loop you want **headless** mode (the
default — no browser window, ~5–10× faster). Headless is what CI uses; the
modes documented here are strictly for human eyes.

---

## Prerequisites (one-time)

1. **Run the full stack locally.** The specs hit a real backend at
   `:8000` and a real Webapp at `:3000` (or `:3001` behind nginx —
   pick one). Easiest way: `bash scripts/run-native.sh` from the
   repo root, which spins up Postgres, Redis, the NLP container,
   the FastAPI backend, and the Webapp in dev mode.

2. **Install Playwright's bundled Chromium** (separate from the
   system Chrome / Island browser, which is policy-restricted and
   refuses Playwright automation):

   ```bash
   cd app/Webapp
   npx playwright install chromium
   ```

3. **Confirm the backend has at least one patient.** Most specs
   self-discover whatever is in `/api/backend/patient/files`; the
   ones that need a record will *skip cleanly* if the database is
   empty rather than fail. To populate, run the standalone
   pipeline once on any sample transcript:

   ```bash
   .venv/bin/python scripts/run-pipeline-standalone.py \
     --file /path/to/sample.xlsx
   ```

4. **`.env.native` should hold the real `API_KEY`.** The Playwright
   `globalSetup` (`e2e/global-setup.ts`) loads it into
   `process.env` automatically; the backend round-trip checks
   skip themselves if it's missing.

---

## Mode 1 — Headed (the basic "show me the browser" mode)

Real Chromium window appears, runs at full speed (~10–20 sec for
the deep flow). Closes on its own when the test finishes.

```bash
cd app/Webapp

# Override the base URL because the local stack uses :3001 (nginx),
# while the default Playwright config expects :3000.
PLAYWRIGHT_BASE_URL=http://localhost:3001 \
  npx playwright test \
  --config=e2e/playwright.config.ts \
  --headed
```

To run a single spec:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 \
  npx playwright test \
  --config=e2e/playwright.config.ts \
  patient-followup-complete-flow.spec.ts \
  --headed
```

To run a single test by name (the `-g` flag matches the test
title with a regex):

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 \
  npx playwright test \
  --config=e2e/playwright.config.ts \
  patient-followup-complete-flow.spec.ts \
  --headed \
  -g "complete all 4 surveys"
```

---

## Mode 2 — Headed + slowMo (the "I want to actually follow along" mode)

Adds a configurable delay between each Playwright action so a
human can watch the mouse move, the input fill, the click land.
Set `PLAYWRIGHT_SLOW_MO` to the millisecond delay you want.

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 \
PLAYWRIGHT_SLOW_MO=300 \
  npx playwright test \
  --config=e2e/playwright.config.ts \
  patient-followup-complete-flow.spec.ts \
  --headed
```

Suggested values:
- `100`–`200` ms — fast but human-followable.
- `300` ms — comfortable demo pace (this is the pacing every demo
  in this project has used).
- `500`–`1000` ms — for screen-recording or recording a clip.

The test timeout in `playwright.config.ts` already scales with
`PLAYWRIGHT_SLOW_MO` so a slowed-down run doesn't time out
spuriously.

---

## Mode 3 — UI mode (timeline scrub + auto-rerun on save)

Opens a dedicated Playwright Test Runner window with a sortable
test tree, a timeline of every action with a DOM snapshot, network
trace, and a built-in watcher that re-runs on every spec edit.
Best for iterating on a flaky spec or exploring the trace after a
failure.

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 \
  npx playwright test \
  --config=e2e/playwright.config.ts \
  --ui
```

**What you can do inside the UI:**
- Pick any test from the left tree and press ▶ to run it.
- Toggle "Show browser" to also see the live browser run.
- After a run, click any step in the timeline to see the DOM
  snapshot, the screenshot, and the network requests at that
  moment.
- Edit a spec, save — the watcher re-runs automatically.
- "Pick locator" tool generates a Playwright locator from a hover
  on the rendered page.

Close the UI window or `Ctrl-C` the terminal to stop.

---

## Mode 4 — Debug (step through the test, line by line)

Opens both the browser AND the Playwright Inspector. Each test
action pauses; click "Step over" in the Inspector to advance one
action. Best for "why exactly is this selector returning the wrong
element?" investigation.

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 \
  npx playwright test \
  --config=e2e/playwright.config.ts \
  patient-followup-complete-flow.spec.ts \
  --debug
```

Tips:
- The Inspector exposes a "Pick locator" button — hover over any
  element on the page to generate a locator string you can paste
  into the spec.
- `await page.pause()` inserted in spec code drops you into the
  Inspector at exactly that line.

---

## Test selection cookbook

Cd into `app/Webapp` first; all commands assume that working
directory.

```bash
# All tests, headless (the default)
npx playwright test --config=e2e/playwright.config.ts

# Just the survey-submit-flow spec
npx playwright test --config=e2e/playwright.config.ts \
  survey-submit-flow.spec.ts

# Just the Risk Perception group
npx playwright test --config=e2e/playwright.config.ts \
  -g "Risk Perception"

# Just the deep first-visit walkthrough
npx playwright test --config=e2e/playwright.config.ts \
  patient-first-visit-deep.spec.ts

# All flows that hit the live backend round-trip
# (titles include the literal "received by backend" or
#  "backend has all 4 submission types")
npx playwright test --config=e2e/playwright.config.ts \
  -g "(received by backend|all 4 submission types)"
```

Combine with `--headed`, `--debug`, `--ui`, or
`PLAYWRIGHT_SLOW_MO=` env as needed.

---

## After a run

- **HTML report**: `app/Webapp/playwright-report/index.html`. Open
  in a browser to see per-test results, error stacks, and (for
  failures) the screenshot + trace at the moment of failure.
- **Trace files** (created on first retry of a failure):
  `app/Webapp/test-results/<test-name>/trace.zip`. Open with
  `npx playwright show-trace path/to/trace.zip` for a fully
  scrubbable timeline.
- **Console output** appears in the terminal — every spec logs
  `[deep] picked first-visit X/N file=... speaker=...` on entry
  and the final pass/skip/fail summary at the bottom.

---

## Common gotchas

- **Tests *skip* with no error** — that's by design. The legacy
  specs and the deep spec call
  `requireFirstFixture(request, baseURL)`; if the backend has zero
  patient files, the whole describe block reports as skipped
  rather than failing. Check the skip message — it tells you
  exactly why (usually "no patient data in backend"). Run the
  pipeline on a sample transcript to populate.

- **"Chromium channel failed to launch" / 403 errors** — the
  default browser launch tries the system Chrome / Island
  browser, which has enterprise policies blocking automation.
  Re-run `npx playwright install chromium` to make sure the
  bundled browser is in place; the config uses Playwright's
  bundled Chromium, not the system one.

- **`--headed` shows a tiny window then closes** — most likely
  the test passed in headless-equivalent time (~1–2 sec) before
  you could see anything. Add `PLAYWRIGHT_SLOW_MO=300` to slow it
  down.

- **`localhost:3000` vs `:3001`** — the default Playwright config
  targets `:3000` (CI uses that). The local native deploy puts
  the Webapp behind nginx at `:3001`. Always export
  `PLAYWRIGHT_BASE_URL=http://localhost:3001` for local headed
  runs against the native stack.

- **Test passes locally but you don't know if CI runs it** —
  Playwright e2e is in the Nightly E2E workflow only (not on
  every PR). Trigger it manually with
  `gh workflow run "Nightly E2E"` or wait for the 03:00 UTC
  cron. Per-PR runs only execute the lighter `webapp-ci.yml`
  (lint + Jest unit tests).

---

## Quick reference

| Goal | Command |
|---|---|
| All tests, headless (default) | `npx playwright test --config=e2e/playwright.config.ts` |
| All tests, visible browser | `+ --headed` |
| Slow-motion demo | `+ --headed` and `PLAYWRIGHT_SLOW_MO=300` |
| Timeline + scrub | `+ --ui` |
| Step through | `+ --debug` |
| Single spec | `+ <spec>.spec.ts` |
| Single test by title | `+ -g "regex"` |
| View last HTML report | `npx playwright show-report` |
