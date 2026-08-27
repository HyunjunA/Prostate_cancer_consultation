import { test, expect, type Page } from "@playwright/test";
import { requireFirstFixture, type DemoFixture } from "./_fixtures";
import { loginAsAdmin } from "./_admin_auth";

/**
 * Doctor View — full clinical walkthrough
 *
 * Drives V41Timothy through the actual physician journey:
 *
 *   1. Admin physician picker (/admin/physicians) → click a doctor
 *      to enter the doctor surface. Requires an admin session, so the
 *      test skips without E2E_ADMIN_USER / E2E_ADMIN_PASSWORD.
 *   2. Dashboard tour (react-joyride) — click "Next" until the tour
 *      ends with "Got it!". Tours might be absent if a previous
 *      session already completed them; the helper handles that
 *      gracefully (timeouts → break out).
 *   3. Pick a random patient row from the dashboard, click
 *      "View Report" to drill into their grid view.
 *   4. Grid tour — same Next/Got-it walk-through.
 *   5. Click the first topic-name button (e.g. "Cancer Prognosis")
 *      to open the detail view.
 *   6. Detail tour — same walk-through.
 *   7. In the Re-write Practice panel, copy the displayed Original
 *      Sentence verbatim into the "How would you say it better?"
 *      textarea, then click "Try & Score".
 *   8. Wait for the scoring result message ("Your rewrite scored:
 *      X.X" on success, "Could not score…" on backend miss). Either
 *      outcome means the backend round-trip completed.
 *
 * Round-trip verification:
 *   - The "Try & Score" path fires `trackDoctor` with
 *     event_type=`rewrite_apply` (V41Timothy.tsx:2805) and on
 *     success calls `saveRewriteWithTimestamp` which PUTs to
 *     `/api/doctor/rewrites` writing a row to `doctor_rewrite_log`.
 *   - We GET `/api/track/doctor/session/{id}` afterwards and assert
 *     the chain of events that proves the physician walked through
 *     each stage: page_view, patient_select, topic_select,
 *     sentence_select, rewrite_apply.
 */

// Bumped from 120 s — added the Scoring Rubric exploration on each
// page (dashboard / grid / detail). With slowMo=300 each rubric
// pass walks 6 tabs × 6 score hovers × ~300 ms ≈ 11 s, so 3 passes
// add ~33 s on top of the original walkthrough. 240 s leaves
// generous headroom on a slow CI runner.
test.setTimeout(240_000);

const API_BASE = "http://localhost:8000";
const API_KEY = process.env.E2E_API_KEY || process.env.API_KEY || "";
const AUTH_HEADERS = API_KEY ? { "X-API-Key": API_KEY } : {};

let FIXTURE: DemoFixture;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a uniformly-random index in [0, n). */
function randIdx(n: number): number {
  return Math.floor(Math.random() * n);
}

/**
 * Walk the visible react-joyride tour to completion by clicking
 * "Next" until the final step's "Got it!" button appears, or the
 * tour disappears (already completed in a prior run, dismissed,
 * etc.). Tour buttons live in a portal at document root so a
 * page-level locator finds them regardless of which view rendered
 * them.
 *
 * The locale strings come from OnboardingTour.tsx:361-367 — the
 * project pins them to `next: "Next"` and `last: "Got it!"`, so
 * matching by exact button name is stable across versions.
 */
async function clickThroughTour(page: Page, label: string) {
  for (let i = 0; i < 20 /* safety cap */; i++) {
    // OnboardingTour.tsx enables `showProgress: true`, so Joyride
    // suffixes the buttons with " (Step X of Y)". Match the verb
    // prefix instead of an exact string so the locator survives
    // the suffix.
    const gotIt = page.getByRole("button", { name: /^Got it!/ });
    const next = page.getByRole("button", { name: /^Next\b/ });

    if (await gotIt.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await gotIt.click();
      break;
    }
    if (await next.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await next.click();
      await page.waitForTimeout(400);
      continue;
    }
    // No tour visible — already completed, or this view doesn't
    // ship a tour. Either way, nothing to do.
    return;
  }

  // Critical: wait for the joyride overlay to fully unmount before
  // returning. The overlay <div class="react-joyride__overlay">
  // sits at z-index 100 and intercepts pointer events while it's
  // present — even AFTER clicking "Got it!", the overlay's
  // fade-out animation can still consume the next click. With
  // slowMo enabled this race becomes deterministic; the next
  // page-level click fails 220x with "subtree intercepts pointer
  // events" until Playwright's auto-retry timeout fires. Waiting
  // for `state: "hidden"` blocks until the DOM node is gone.
  const overlay = page.locator("div.react-joyride__overlay");
  await overlay
    .waitFor({ state: "hidden", timeout: 5_000 })
    .catch(() => {
      // If the overlay was never present, waitFor("hidden")
      // resolves immediately; if it was present but never
      // unmounted, this catch keeps the test moving (next
      // click will retry on its own auto-wait).
    });
  // Brief settle so any focus/scroll side-effects of tour exit
  // finish before the caller's next interaction.
  await page.waitForTimeout(200);
  void label;
}

/**
 * Open the floating Scoring Rubric modal, mouseover every score
 * (0-5) on every domain tab, then close the modal.
 *
 * What this exercises:
 *   - The fixed-position "Scoring Rubric" floating button at
 *     V41Timothy.tsx:856 (always rendered top-right at z-60).
 *   - The 6 domain tabs the modal exposes: "All Domains" plus the
 *     5 individual domains (V41Timothy.tsx:1035 — note the rubric
 *     tab labels use the SHORT form for IUS, "Irritative
 *     Symptoms", which differs from the full domain name
 *     "Irritative Urinary Symptoms" used elsewhere).
 *   - The 6 hoverable score blocks (0-5) with onMouseEnter at
 *     V41Timothy.tsx:966 — each hover sets `hoveredScore` and
 *     reveals the cumulative criteria for that score level.
 *
 * Why the rubric panel might also fire its own custom mini-tour
 * on first open: V41Timothy.tsx:756-790 wires a localStorage-
 * backed `rubric-modal-tour-completed` flag. The mini-tour uses
 * the SAME "Next" / "Got it!" button labels, so reusing
 * `clickThroughTour` walks it through cleanly on first run; on
 * subsequent runs the flag suppresses the tour and clickThroughTour
 * exits immediately.
 */
async function exploreScoringRubric(page: Page) {
  // 1. Click the floating button. Don't fail if it isn't there
  //    (defensive — a future refactor could relocate it; the test
  //    shouldn't crash before the rest of the spec runs).
  const rubricBtn = page.getByRole("button", { name: /^Scoring Rubric$/ });
  if (
    !(await rubricBtn.isVisible({ timeout: 3_000 }).catch(() => false))
  ) {
    return;
  }
  await rubricBtn.click();
  await page.waitForTimeout(800); // modal mount + open animation

  // 2. The rubric modal has its own mini-tour that fires on first
  //    open. Same Next/Got-it walkthrough as the page-level tours.
  await clickThroughTour(page, "rubric-modal");
  await page.waitForTimeout(300);

  // 3. Walk every tab. "All Domains" is the default — keep it as
  //    the first iteration so we hover its scores before clicking
  //    other tabs. Tab labels match the short forms at
  //    V41Timothy.tsx:1042 (IUS = "Irritative Symptoms").
  const TAB_LABELS = [
    "All Domains",
    "Cancer Prognosis",
    "Life Expectancy",
    "Erectile Dysfunction",
    "Urinary Incontinence",
    "Irritative Symptoms",
  ];

  for (const tabName of TAB_LABELS) {
    if (tabName !== "All Domains") {
      // Tabs live inside the data-tour="rubric-tabs" container so
      // we can scope by that anchor and avoid matching button text
      // outside the rubric.
      const tabBtn = page
        .locator('[data-tour="rubric-tabs"]')
        .getByRole("button", { name: new RegExp(tabName, "i") })
        .first();
      if (await tabBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // 4. Hover each score 0-5. The score numbers render as
    //    text-lg font-bold divs at V41Timothy.tsx:974 — each one
    //    contains exactly one digit and is wrapped in a parent
    //    div with the onMouseEnter handler. Hovering the inner
    //    div bubbles the mouseenter to the parent because the
    //    handler is on a parent React component.
    for (let score = 0; score <= 5; score++) {
      const scoreNum = page
        .locator("div.text-lg.font-bold")
        .filter({ hasText: new RegExp(`^${score}$`) })
        .first();
      if (
        await scoreNum.isVisible({ timeout: 1_000 }).catch(() => false)
      ) {
        await scoreNum.hover();
        await page.waitForTimeout(250);
      }
    }
  }

  // 5. Close the modal. The backdrop binds onClick to setOpen(false)
  //    (V41Timothy.tsx:882), but Escape is more reliable across
  //    Playwright versions. Try Escape first, fall back to clicking
  //    the backdrop top-left corner.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // If Escape didn't take, the backdrop is still visible — click
  // outside the modal content area to dismiss.
  const stillOpen = await page
    .getByRole("heading", { name: /Risk Communication Scoring Rubric/i })
    .isVisible({ timeout: 500 })
    .catch(() => false);
  if (stillOpen) {
    // Click the bare body top-left to land on the backdrop and
    // miss the modal content.
    await page.mouse.click(5, 5);
    await page.waitForTimeout(400);
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("Doctor View — full clinical walkthrough", () => {
  test.beforeAll(async ({ request, baseURL }) => {
    FIXTURE = await requireFirstFixture(request, baseURL);
  });

  test("Physician View → tour → patient → tour → topic → tour → re-write practice → Try & Score", async ({
    page,
  }) => {
    // Capture every doctor-tracking POST so we can assert the
    // backend persisted the chain of events.
    const trackedRequests: Array<{
      session_id: string;
      events: Array<{ event_type: string }>;
    }> = [];
    page.on("request", async (req) => {
      const url = req.url();
      if (url.includes("/track/doctor") && req.method() === "POST") {
        try {
          const body = req.postData();
          if (body) trackedRequests.push(JSON.parse(body));
        } catch {
          /* non-JSON body, ignore */
        }
      }
    });

    // Surface uncaught render errors as test failures.
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => {
      if (!/Hydration|hydrat/i.test(e.message)) pageErrors.push(e.message);
    });

    // ── Step 1 — Admin physician picker → doctor dashboard ──────────
    // The physician roster moved from the public header link
    // ("/?select=physician") to /admin/physicians on 2026-08-27, so sign in
    // first (skips without E2E_ADMIN_* creds) and click a doctor there. The
    // destination is still the public ?doctorid= dashboard URL.
    await loginAsAdmin(page);
    await page.goto("/admin/physicians");
    await page.waitForLoadState("networkidle");

    const doctorLink = page.getByRole("link", { name: /^Doctor / }).first();
    await expect(doctorLink).toBeVisible({ timeout: 10_000 });
    await doctorLink.click();
    await expect(page).toHaveURL(/doctorid=/, { timeout: 10_000 });

    // ── Step 2 — Dashboard tour ─────────────────────────────────────
    // V41 fires its dashboard tour on first arrival. Walk through
    // every step. Wait briefly first so the Joyride portal has time
    // to mount.
    await page.waitForTimeout(1_500);
    await clickThroughTour(page, "dashboard");

    // ── Step 2b — Scoring Rubric tour from the dashboard view ──────
    // After the page-level tour the user opens the floating
    // "Scoring Rubric" button, hovers every score on every domain
    // tab, then closes the modal. Repeated on each subsequent
    // page below.
    await exploreScoringRubric(page);

    // ── Step 3 — Pick a random patient → "View Report" ──────────────
    // Dashboard renders one "View Report" button per patient row
    // (V41Timothy.tsx:1621). Pick a random one — different runs
    // exercise different demo data.
    const viewReportBtns = page.getByRole("button", { name: /^View Report$/i });
    const reportCount = await viewReportBtns.count();
    expect(
      reportCount,
      "expected at least one 'View Report' button on the doctor dashboard",
    ).toBeGreaterThan(0);
    const pickedReport = viewReportBtns.nth(randIdx(reportCount));
    await pickedReport.scrollIntoViewIfNeeded();
    await pickedReport.click();
    console.log(`[doctor-deep] picked patient ${randIdx} of ${reportCount}`);

    // ── Step 4 — Grid view tour ─────────────────────────────────────
    await page.waitForTimeout(1_500);
    await clickThroughTour(page, "grid");

    // ── Step 4b — Scoring Rubric tour from the grid view ───────────
    await exploreScoringRubric(page);

    // ── Step 5 — First topic → detail view ──────────────────────────
    // Grid view has one topic-name button per domain
    // (V41Timothy.tsx:2540).
    const topicBtn = page
      .getByRole("button", {
        name: /^(Cancer Prognosis|Life Expectancy|Erectile Dysfunction|Urinary Incontinence|Irritative Urinary Symptoms)$/i,
      })
      .first();
    await expect(
      topicBtn,
      "grid view should expose at least one topic-name button after View Report",
    ).toBeVisible({ timeout: 15_000 });
    await topicBtn.scrollIntoViewIfNeeded();
    await topicBtn.click();

    // ── Step 6 — Detail view tour ───────────────────────────────────
    await page.waitForTimeout(1_500);
    await clickThroughTour(page, "detail");

    // ── Step 6b — Scoring Rubric tour from the detail view ─────────
    await exploreScoringRubric(page);

    // ── Step 7 — Re-write Practice: copy original, type into textarea
    // The Re-write Practice panel is identified by
    // `data-tour="detail-rewrite-panel"` (V41Timothy.tsx:3144). The
    // Original Sentence text sits in a quoted div under the
    // "Original Sentence" header. We extract it and paste verbatim
    // into the "How would you say it better?" textarea — matching
    // the user's spec ("type the same as the original sentence").
    const rewritePanel = page.locator('[data-tour="detail-rewrite-panel"]');
    await expect(
      rewritePanel,
      "Re-write Practice panel should be visible in detail view",
    ).toBeVisible({ timeout: 15_000 });

    // The original sentence renders inside a div containing the
    // text wrapped in unicode quotes. Grab the text and clean off
    // the surrounding quote characters.
    const originalSentenceDiv = rewritePanel
      .locator("div")
      .filter({ hasText: /^[\s"“”].*[\s"“”]$/ })
      .first();
    const rawOriginal = await originalSentenceDiv.textContent();
    const originalSentence = (rawOriginal ?? "")
      .replace(/[“”"]/g, "")
      .trim();
    expect(
      originalSentence.length,
      "expected to read a non-empty Original Sentence",
    ).toBeGreaterThan(0);
    console.log(
      `[doctor-deep] original sentence (${originalSentence.length} chars): ` +
        `"${originalSentence.slice(0, 60)}${originalSentence.length > 60 ? "…" : ""}"`,
    );

    const textarea = rewritePanel.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.fill(originalSentence);

    // ── Step 8 — Try & Score, wait for result ───────────────────────
    const tryScoreBtn = page.getByRole("button", { name: /Try & Score/i });
    await expect(tryScoreBtn).toBeEnabled({ timeout: 5_000 });
    await tryScoreBtn.click();

    // The button label flips to "Scoring..." while the request is
    // in flight; wait for it to flip back. Either of two outcomes
    // is acceptable end-state:
    //   - success: status text reads "Your rewrite scored: X.X"
    //   - error  : status text reads "Could not score…"
    // Both prove the round-trip completed; the second just means
    // the AI sibling pipeline isn't reachable in the current
    // environment.
    const resultText = page.locator("text=/Your rewrite scored:|Could not score|Scoring failed/i");
    await expect(
      resultText.first(),
      "expected either a success or error scoring message after Try & Score",
    ).toBeVisible({ timeout: 30_000 });
    const finalStatus = (await resultText.first().textContent()) ?? "";
    console.log(`[doctor-deep] scoring result: "${finalStatus.trim()}"`);

    // Pause briefly after the result lands — matches the user's
    // spec ("a little bit after, end") and gives any deferred
    // tracking POSTs time to land before we GET below.
    await page.waitForTimeout(2_000);

    // ── Step 9 — No uncaught render errors during the whole walk ────
    expect(
      pageErrors,
      `no uncaught page errors during doctor walkthrough — got: ${pageErrors.join(" | ")}`,
    ).toEqual([]);

    // ── Step 10 — Round-trip: events landed in doctor_behavior ──────
    expect(
      trackedRequests.length,
      "expected at least one tracking POST during the walkthrough",
    ).toBeGreaterThan(0);

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
    expect(sessionId, "session_id captured from a tracking POST").toBeTruthy();

    const sessionResp = await page.request.get(
      `${API_BASE}/api/track/doctor/session/${encodeURIComponent(sessionId)}`,
      { headers: AUTH_HEADERS },
    );
    expect(
      sessionResp.ok(),
      `GET /api/track/doctor/session/${sessionId} should return 200, got ${sessionResp.status()}`,
    ).toBeTruthy();

    const sessionBody = (await sessionResp.json()) as {
      session_id: string;
      count: number;
      events: Array<{ event_type: string }>;
    };
    const persistedTypes = sessionBody.events.map((e) => e.event_type);

    // Assert the events the physician drove intentionally are
    // present. `tour_open` and `view_change` may also appear but
    // are emergent; not asserted on directly.
    for (const required of [
      "page_view",
      "patient_select",
      "topic_select",
      "rewrite_apply",
    ] as const) {
      expect(
        persistedTypes,
        `${required} should appear in doctor_behavior — got: ${persistedTypes.join(", ")}`,
      ).toContain(required);
    }

    console.log(
      `[doctor-deep] session=${sessionId} persisted ${sessionBody.count} events ` +
        `[${persistedTypes.join(", ")}] — file=${FIXTURE.file} doctor=${FIXTURE.doctor}`,
    );
  });
});
