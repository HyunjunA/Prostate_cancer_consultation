import { test, expect, type Page } from "@playwright/test";
import { requireFirstFixture, type DemoFixture } from "./_fixtures";

/**
 * Doctor View — deep flow with backend tracking round-trip
 *
 * Smoke checks live in `doctor-view.spec.ts` (page mounts, no
 * console errors, interactive elements present). This file goes
 * one layer deeper:
 *
 *   1. Navigate to the physician view via the dynamically-discovered
 *      fixture (no hardcoded fileid).
 *   2. Confirm the doctor surface mounted — at minimum the URL is
 *      `?doctorid=...` and the selection screen heading is gone.
 *   3. Walk through some interactive content the physician would
 *      actually click during a real review:
 *        - the per-patient list (clicking a row → patient_select)
 *        - a topic / domain (clicking → topic_select)
 *        - a sentence (clicking → sentence_select)
 *      Each click is best-effort — if the V41 layout doesn't
 *      expose the affordance the test moves on; the goal is to
 *      fire *some* tracking events beyond the bare `page_view`.
 *   4. Backend round-trip: every `trackDoctor(...)` call in
 *      PhysicianReportsModifiedV41Timothy.tsx posts to
 *      `/api/track/doctor`. After the UI flow we GET
 *      `/api/track/doctor/session/{id}` and assert that, at a
 *      minimum, `page_view` made it into `doctor_behavior` table.
 *
 * What V41 emits (DoctorEventType, see app/Webapp/src/tracking/track.ts:64):
 *   page_view, view_change, patient_select, topic_select,
 *   sentence_select, rewrite_open, rewrite_input, rewrite_apply,
 *   rubric_open, rubric_close, rubric_score_lock, tour_open,
 *   tour_end, session_end.
 */

test.setTimeout(120_000);

const API_BASE = "http://localhost:8000";
// Tracking GET endpoint inherits the same auth conventions the rest
// of the suite uses. A missing key reads as an empty header — the
// backend doesn't actually require auth on this endpoint, but the
// pattern stays consistent with survey-submit-flow / deep specs.
const API_KEY = process.env.E2E_API_KEY || process.env.API_KEY || "";
const AUTH_HEADERS = API_KEY ? { "X-API-Key": API_KEY } : {};

let FIXTURE: DemoFixture;
let DOCTOR_VIEW_URL: string;

test.describe("Doctor View — deep flow", () => {
  test.beforeAll(async ({ request, baseURL }) => {
    FIXTURE = await requireFirstFixture(request, baseURL);
    DOCTOR_VIEW_URL =
      `/?fileid=${encodeURIComponent(FIXTURE.file)}` +
      `&doctorid=${encodeURIComponent(FIXTURE.doctor)}`;
  });

  test("walk doctor view, interact with content, confirm tracking events persist", async ({
    page,
  }) => {
    // Capture every POST to /track/doctor so we can pull the
    // session_id (generated client-side per mount) and check what
    // event_types fired during the flow.
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
          // Non-JSON bodies aren't expected here — ignore rather
          // than crashing the listener.
        }
      }
    });

    // Surface uncaught render errors as test failures with the
    // original stack instead of a torn-down section.
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => {
      if (!/Hydration|hydrat/i.test(e.message)) pageErrors.push(e.message);
    });

    // ── 1. Navigate to the doctor view ─────────────────────────────
    await page.goto(DOCTOR_VIEW_URL);
    await expect(page).toHaveURL(/doctorid=/);

    // Selection screen heading must be gone — we're past selection.
    await expect(
      page.getByText("Patient Consultation System"),
      "selection-screen heading should NOT be visible on doctor view",
    ).not.toBeVisible({ timeout: 10_000 });

    // ── 2. Wait for the doctor surface to mount ────────────────────
    // V41 loads asynchronously (patient list fetch, then sentences,
    // then charts). Wait for ANY interactive control before trying
    // to click — better than an arbitrary sleep because it gives a
    // clean error if the surface never finishes mounting.
    const interactives = page
      .locator("button")
      .or(page.locator('[role="tab"]'))
      .or(page.locator("a"));
    await expect(interactives.first()).toBeVisible({ timeout: 15_000 });
    // Extra settle time so React's lazy-loaded sub-trees are fully
    // attached. The V41 component fetches multiple endpoints on
    // mount; without this pad the first click can race with
    // rendering and miss the tracking handler.
    await page.waitForTimeout(2000);

    // ── 3. Best-effort interactive sweep ───────────────────────────
    // V41 is a 3000-line component with many possible affordances.
    // Rather than wire a brittle selector for every one, we click
    // a small handful of likely-interactive elements and rely on
    // the tracking listener above to record whatever fires. The
    // round-trip assertion is intentionally lenient: any non-zero
    // event count beyond `page_view` proves the doctor's mouse
    // events are landing on instrumented handlers.
    const buttons = page.locator("button:visible");
    const buttonCount = await buttons.count();
    // Click the first 3 visible buttons, but skip anything that
    // looks dangerous (Submit, Delete, Logout, etc.) — we only
    // want to exercise navigation/expand affordances.
    const SAFE_BUTTON_PATTERN = /^(?!.*(submit|delete|logout|sign out|close window)).*$/i;
    let clicksAttempted = 0;
    for (let i = 0; i < Math.min(buttonCount, 8) && clicksAttempted < 3; i++) {
      const btn = buttons.nth(i);
      const text = ((await btn.textContent()) || "").trim();
      if (!text || !SAFE_BUTTON_PATTERN.test(text)) continue;
      try {
        await btn.click({ timeout: 2_000 });
        await page.waitForTimeout(300);
        clicksAttempted++;
      } catch {
        // Disabled, off-screen, or transient click target — skip.
      }
    }

    // ── 4. No uncaught render errors during the sweep ──────────────
    expect(
      pageErrors,
      `no uncaught page errors on doctor view — got: ${pageErrors.join(" | ")}`,
    ).toEqual([]);

    // ── 5. Round-trip: tracking events landed in doctor_behavior ───
    expect(
      trackedRequests.length,
      "expected at least one tracking POST during the sweep " +
        "(page_view alone fires on mount)",
    ).toBeGreaterThan(0);

    // Pick the session that owns the most events. Like the
    // patient-first-visit-deep spec, brief mount/unmount cycles on
    // adjacent pages can show up in the captured stream — the
    // doctor session is reliably the one with the most rows.
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

    // Give the backend a moment to flush the last POST before we GET.
    await page.waitForTimeout(750);

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

    expect(
      persistedTypes,
      "page_view should be persisted for the doctor-view mount",
    ).toContain("page_view");

    // Soft assertion that the click sweep landed on at least one
    // instrumented handler. clicksAttempted may be 0 if every
    // visible button was filtered (rare in practice), so don't
    // require a non-page_view event when no clicks ran.
    if (clicksAttempted > 0) {
      const nonPageView = persistedTypes.filter((t) => t !== "page_view");
      expect(
        nonPageView.length,
        `expected at least one non-page_view event after ${clicksAttempted} button click(s) — got types: ${persistedTypes.join(", ")}`,
      ).toBeGreaterThan(0);
    }

    console.log(
      `[doctor-deep] session=${sessionId} persisted ${sessionBody.count} events ` +
        `[${persistedTypes.join(", ")}] — file=${FIXTURE.file} doctor=${FIXTURE.doctor}`,
    );
  });
});
