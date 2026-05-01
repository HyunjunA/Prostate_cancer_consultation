import { test, expect, type Page } from "@playwright/test";

/**
 * Patient First Visit — deep flow (single integrated test)
 *
 * Smoke checks for this screen live in patient-first-visit.spec.ts.
 * This file goes one layer deeper: it walks a real user through the
 * entire consultation-summary review for ALL FIVE clinical domains in
 * one sweep, and verifies that every interaction the user takes
 * which DOES persist data to the backend lands correctly in
 * Postgres.
 *
 * What V37 actually persists to the backend:
 *   The experimental questions in V37 (VAS sliders, "select all
 *   that apply" checkboxes, single-select radios) and the 1–5
 *   helpfulness rating are local React state only — none of them
 *   write to the backend (the rating UI itself is currently
 *   commented out in V37, see lines ~2317–2360 in
 *   PatientInitialVisitReportV37.tsx).
 *
 *   What DOES round-trip is behavior tracking. Every category
 *   open/close, every "View relevant sentences" toggle, and the
 *   page mount itself fires `trackFirst(...)` (V37:2548, 2807,
 *   2841), which POSTs to /api/track/patient-first and writes a
 *   row to the `patient_first_behavior` table. So the round-trip
 *   we verify is: user clicks → POST /api/backend/track/patient-first
 *   → DB write → GET /api/track/patient-first/session/{id}
 *   → events come back.
 *
 *   When V37 grows real persistence for the patient's answers
 *   (e.g. wires the rating button back in, or PUTs VAS values to
 *   /api/patient/responses), THIS file is the right place to add a
 *   second round-trip block at the end of the sweep.
 *
 * Flow:
 *   1. Selection screen (`/`) → randomly pick one of the listed
 *      "First Visit" buttons. Different demo data per run prevents
 *      ossification around a single fixture.
 *   2. Confirm V37 mounted via the "Your Consultation Summary"
 *      header.
 *   3. For each of the 5 domain cards (CP / LE / ED / INC / IUS):
 *      a. Click the card header to expand its body.
 *      b. Click "View relevant sentences from your visit" to
 *         surface the NLP-selected evidence (best-effort — some
 *         demo files have no evidence).
 *      c. Drive every visible Radix slider, tick the first one or
 *         two checkboxes, pick the first single-select radio.
 *   4. Round-trip verification: GET the session events back from
 *      the backend and assert that, at a minimum, page_view and
 *      one topic_open per category are present in the persisted
 *      timeline. Event counts are checked with `>=` rather than
 *      `==` so future tracking additions (extra timestamp events,
 *      proximity samples, etc.) don't break the test.
 */

// 5 categories × (slider drag + checkbox + radio + animation waits)
// + tracking POST settle time + headroom for `--headed --slowMo` runs.
// Headless CI completes in ~20 s; running with PLAYWRIGHT_SLOW_MO=300
// adds ~300 ms × hundreds of actions and pushes total wall time
// closer to 2-3 min, so 5 min is the conservative ceiling.
test.setTimeout(300_000);

// Tracking endpoints are not behind X-API-Key (the patient-facing
// page calls them from the browser without auth), but the GET we
// use for round-trip verification might be — read the same env var
// the survey-submit-flow spec uses so behavior is consistent.
const API_BASE = "http://localhost:8000";
const API_KEY = process.env.E2E_API_KEY || process.env.API_KEY || "";
const AUTH_HEADERS = API_KEY ? { "X-API-Key": API_KEY } : {};

const TOPICS = [
  { display: "Cancer Prognosis", domain: "cp" },
  { display: "Life Expectancy", domain: "le" },
  { display: "Erectile Dysfunction", domain: "ed" },
  { display: "Urinary Incontinence", domain: "inc" },
  { display: "Irritative Urinary Symptoms", domain: "ius" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randIdx(n: number): number {
  return Math.floor(Math.random() * n);
}

/**
 * Drive every visible Radix `[role="slider"]` to a non-zero value.
 * Radix Slider doesn't expose a clean "set value" hook in JS-land;
 * the least-flaky path that still moves the thumb is keyboard-arrow
 * navigation after focusing it. 20 ArrowRight presses lands the
 * thumb at value ~20 on the 0–100 scale — enough for the user to
 * see the bubble move, and (more importantly) keeps the per-slider
 * cost low so a `--headed --slowMo` demo run doesn't blow past the
 * test timeout. The exact value isn't checked anywhere because V37
 * never persists VAS responses.
 */
const SLIDER_PRESSES = 20;

async function fillVisibleSliders(page: Page) {
  const sliders = page.locator('[role="slider"]:visible');
  const count = await sliders.count();
  for (let i = 0; i < count; i++) {
    const slider = sliders.nth(i);
    await slider.focus();
    for (let k = 0; k < SLIDER_PRESSES; k++) await slider.press("ArrowRight");
  }
}

/**
 * Tick EVERY visible checkbox in the section. V37's checkbox groups
 * are "select all that apply" prompts (V37:1450, 1715, 1977, 2242),
 * so the realistic patient response is "tick anything that fits"
 * — emulated here by ticking everything visible. `force: true`
 * because shadcn checkboxes hide the native input behind a visual
 * overlay that Playwright considers non-interactable by default.
 */
async function tickAllCheckboxes(page: Page) {
  const checkboxes = page.locator('input[type="checkbox"]:visible');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check({ force: true });
  }
}

/**
 * Single-select questions: pick the first option in EACH radio
 * group. Grouping is by the `name` attribute (HTML radio
 * convention). Without per-group dedup we'd only answer the very
 * first group on the page and leave every other single-select
 * question blank.
 */
async function pickFirstRadioPerGroup(page: Page) {
  const radios = page.locator('input[type="radio"]:visible');
  const count = await radios.count();
  const groupsAnswered = new Set<string>();
  for (let i = 0; i < count; i++) {
    const r = radios.nth(i);
    const name = (await r.getAttribute("name")) ?? `__anon_${i}`;
    if (groupsAnswered.has(name)) continue;
    groupsAnswered.add(name);
    await r.check({ force: true });
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("Patient First Visit — deep flow", () => {
  test("walk every domain card on a randomly-picked first-visit and verify tracking events persist", async ({
    page,
  }) => {
    // ── Capture: every patient-first tracking POST so we can pull
    // the session_id (generated client-side per-mount) and check
    // exactly which event types the page fired during the flow.
    const trackedRequests: Array<{ session_id: string; events: Array<{ event_type: string }> }> = [];
    page.on("request", async (req) => {
      const url = req.url();
      if (
        url.includes("/track/patient-first") &&
        req.method() === "POST"
      ) {
        try {
          const body = req.postData();
          if (body) trackedRequests.push(JSON.parse(body));
        } catch {
          // Non-JSON bodies aren't expected here, but ignore them
          // rather than crashing the listener.
        }
      }
    });

    // Capture uncaught page errors. A React render crash inside V37
    // would normally surface as a torn-down section; this hook
    // turns it into a test failure with the original stack.
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => {
      if (!/Hydration|hydrat/i.test(e.message)) pageErrors.push(e.message);
    });

    // ── 1. Selection screen → random first-visit button ─────────────
    // page.tsx:458-467 renders each row's "First Visit" affordance
    // as a <button> (no href) with an onClick that rewrites the
    // query string. Match the exact button name to avoid heading
    // text overlap.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const firstVisitButtons = page.getByRole("button", {
      name: /^\s*First Visit\s*$/i,
    });
    const buttonCount = await firstVisitButtons.count();
    // CI starts against a freshly-bootstrapped Postgres with no
    // pipeline rows yet, so the selection screen renders zero
    // first-visit buttons. Skipping (rather than failing) keeps
    // nightly green; the moment a fixture-seed step starts
    // populating patient data, the test starts exercising the
    // full deep flow without any further changes here.
    test.skip(
      buttonCount === 0,
      "no first-visit patients on selection screen — likely an unseeded DB",
    );

    const idx = randIdx(buttonCount);
    const chosenButton = firstVisitButtons.nth(idx);
    await chosenButton.scrollIntoViewIfNeeded();
    await chosenButton.click();

    await page.waitForURL(/\bvisit=first\b/, { timeout: 10_000 });
    const liveUrl = new URL(page.url());
    const fileid = liveUrl.searchParams.get("fileid");
    const patid = liveUrl.searchParams.get("patid");
    expect(fileid, "fileid in URL after click").toBeTruthy();
    expect(patid, "patid in URL after click").toBeTruthy();

    console.log(
      `[deep] picked first-visit ${idx + 1}/${buttonCount}  ` +
        `file=${fileid}  speaker=${patid}`,
    );

    // ── 2. Confirm V37 mounted ──────────────────────────────────────
    await expect(
      page.getByText("Your Consultation Summary"),
      "V37 header confirms patient first-visit page mounted",
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. Per-category sweep ───────────────────────────────────────
    for (const { display: topic } of TOPICS) {
      // 3a. Click the topic header button to expand the card body.
      // V37 CategoryCard at line 957 is a real <button> wrapping the
      // <h3>{topicName}</h3>. Match by accessible role + an h3 child
      // so we never click a different button on the page.
      const topicHeaderBtn = page
        .getByRole("button")
        .filter({ has: page.locator("h3", { hasText: topic }) })
        .first();
      await expect(
        topicHeaderBtn,
        `${topic} card header button must exist`,
      ).toBeVisible({ timeout: 10_000 });
      await topicHeaderBtn.scrollIntoViewIfNeeded();
      await topicHeaderBtn.click();
      // Tailwind max-h transition is ~300ms; pad to 800ms so the
      // section is fully laid out before we look inside it.
      await page.waitForTimeout(800);

      // 3b. Click "View relevant sentences from your visit" if
      // present. Demo files without NLP evidence don't render the
      // button, so this is best-effort. The button text toggles
      // between "View" and "Hide" depending on state — match by
      // verb prefix only so we never click a different button.
      const viewSentencesBtn = page
        .getByRole("button", {
          name: /^View relevant sentences from your visit/i,
        })
        .first();
      const sentencesBtnPresent = await viewSentencesBtn
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      if (sentencesBtnPresent) {
        await viewSentencesBtn.click();
        await page.waitForTimeout(400);
      }

      // 3c-e. Fill every visible question in this expanded section.
      // Slider values, "select all that apply" checkboxes, and
      // single-select radios are all local React state in V37 — no
      // backend persistence. The point is to prove the component
      // accepts a fully-answered patient state without throwing.
      await fillVisibleSliders(page);
      await tickAllCheckboxes(page);
      await pickFirstRadioPerGroup(page);

      // 3f. Click "Hide relevant sentences from your visit" to
      // collapse the evidence section back. Real users typically
      // hide the evidence after reading; clicking the toggle a
      // second time also exercises the close-direction code path
      // (fires evidence_close on the tracker) which would otherwise
      // never be hit by the test. Best-effort because if the View
      // button wasn't visible above, neither is Hide.
      const hideSentencesBtn = page
        .getByRole("button", {
          name: /^Hide relevant sentences from your visit/i,
        })
        .first();
      const hideBtnPresent = await hideSentencesBtn
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      if (hideBtnPresent) {
        await hideSentencesBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // ── 4. No uncaught render errors anywhere in the sweep ──────────
    expect(
      pageErrors,
      `no uncaught page errors during sweep — got: ${pageErrors.join(" | ")}`,
    ).toEqual([]);

    // ── 5. Round-trip: tracking events landed on the backend ────────
    // The page emits page_view on mount (V37:2548) and topic_open
    // each time a card is expanded (V37:2807). 5 expansions × 1
    // page = at minimum 6 events should be persisted. Optional
    // evidence_open events are not asserted because they only fire
    // when a demo file has NLP sentences to show.
    expect(
      trackedRequests.length,
      "expected at least one tracking POST during the sweep",
    ).toBeGreaterThan(0);

    // Browsing the selection screen and then navigating to a
    // first-visit page can produce TWO sessions in the captured
    // POST stream — the brief mount-and-unmount on the selection
    // screen (page_view + session_end) plus the actual first-visit
    // session that hosts the per-category interactions. Pick the
    // session that owns the most events; that is reliably the
    // first-visit one.
    const sessionEventCounts = new Map<string, number>();
    for (const req of trackedRequests) {
      sessionEventCounts.set(
        req.session_id,
        (sessionEventCounts.get(req.session_id) || 0) + req.events.length,
      );
    }
    const sessionId = [...sessionEventCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0][0];

    // Give the backend a moment to settle the last POST before we
    // GET — tracking writes are fire-and-forget on the client.
    await page.waitForTimeout(750);

    const sessionResp = await page.request.get(
      `${API_BASE}/api/track/patient-first/session/${encodeURIComponent(sessionId)}`,
      { headers: AUTH_HEADERS },
    );
    expect(
      sessionResp.ok(),
      `GET /session/${sessionId} should return 200, got ${sessionResp.status()}`,
    ).toBeTruthy();

    const sessionBody = (await sessionResp.json()) as {
      session_id: string;
      count: number;
      events: Array<{ event_type: string; domain: string | null }>;
    };
    const persistedTypes = sessionBody.events.map((e) => e.event_type);

    expect(
      persistedTypes,
      "page_view should be persisted for the page mount",
    ).toContain("page_view");

    // V37:2644 expands the first topic by default
    // (`setExpandedTopics({ [TOPIC_ORDER[0]]: true })`), so clicking
    // its header fires `topic_close` rather than `topic_open`. To
    // assert "the patient interacted with every category" we count
    // distinct `domain` values across topic_open AND topic_close
    // events — which sums to TOPICS.length when each card has been
    // clicked exactly once, regardless of the initial-expanded card.
    const topicDomains = new Set(
      sessionBody.events
        .filter(
          (e) =>
            e.event_type === "topic_open" || e.event_type === "topic_close",
        )
        .map((e) => e.domain),
    );
    expect(
      topicDomains.size,
      `expected topic events covering all ${TOPICS.length} domains, got ${topicDomains.size} distinct (${[...topicDomains].join(", ")})`,
    ).toBe(TOPICS.length);

    console.log(
      `[deep] session=${sessionId} persisted ${sessionBody.count} events ` +
        `covering domains [${[...topicDomains].join(", ")}] ` +
        `for file=${fileid} speaker=${patid}`,
    );
  });
});
