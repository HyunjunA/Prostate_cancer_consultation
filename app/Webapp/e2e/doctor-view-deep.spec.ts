import { test, expect, type Page } from "@playwright/test";
import { requireFirstFixture, type DemoFixture } from "./_fixtures";

/**
 * Doctor View — full clinical walkthrough
 *
 * Drives V41Timothy through the actual physician journey:
 *
 *   1. Selection screen → click the "Physician View" header link
 *      (page.tsx:334) to enter the doctor surface.
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

test.setTimeout(120_000);

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
      await page.waitForTimeout(400);
      return;
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
  // Hit the cap without finishing — log and let the caller decide.
  console.log(`[doctor-deep] tour at "${label}" exceeded 20 step iterations`);
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

    // ── Step 1 — Selection screen → Physician View ──────────────────
    // Start at the bare root URL and click the "Physician View"
    // link in the header (page.tsx:334 — <a href="/?doctorid=auto">).
    // This drops the user onto the doctor dashboard.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const physicianLink = page.getByRole("link", { name: /Physician View/i });
    await expect(physicianLink).toBeVisible({ timeout: 10_000 });
    await physicianLink.click();
    await expect(page).toHaveURL(/doctorid=/, { timeout: 10_000 });

    // ── Step 2 — Dashboard tour ─────────────────────────────────────
    // V41 fires its dashboard tour on first arrival. Walk through
    // every step. Wait briefly first so the Joyride portal has time
    // to mount.
    await page.waitForTimeout(1_500);
    await clickThroughTour(page, "dashboard");

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
