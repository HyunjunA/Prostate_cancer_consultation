import { test, expect } from "@playwright/test";
import { requireFirstFixture, type DemoFixture } from "./_fixtures";

/**
 * Doctor View — deep flow with backend tracking round-trip
 *
 * Smoke checks for the physician surface live in
 * `doctor-view.spec.ts`. This file drives the actual three-stage
 * physician walkthrough that V41 was built around:
 *
 *   1. Dashboard view — patient list. Click a row's "View Report"
 *      button → fires `patient_select`, switches the doctor surface
 *      to the grid view (V41Timothy.tsx ~line 1621).
 *   2. Grid view — per-topic table for the selected patient. Click
 *      a topic-name button (e.g. "Cancer Prognosis") → fires
 *      `topic_select`, switches to the detail view (~line 2540).
 *   3. Detail view — sentences for the chosen topic. Click any
 *      sentence card → fires `sentence_select` (~line 4257).
 *
 * Each `trackEvent(...)` call posts to `/api/track/doctor` and
 * writes a row to `doctor_behavior`. After the walk we GET
 * `/api/track/doctor/session/{id}` and assert at least
 * `page_view`, `patient_select`, and `topic_select` came back —
 * the three events that prove the physician moved through the
 * intended view chain rather than just landing on the dashboard.
 *
 * `sentence_select` is best-effort because the detail view's
 * sentence list takes an extra API roundtrip to populate (sentences
 * are fetched on demand); the assertion treats it as a soft target.
 */

test.setTimeout(120_000);

const API_BASE = "http://localhost:8000";
// Tracking GET endpoint inherits the same auth conventions as the
// rest of the suite. The endpoint itself doesn't enforce auth, but
// keeping the X-API-Key header consistent across specs simplifies
// debugging.
const API_KEY = process.env.E2E_API_KEY || process.env.API_KEY || "";
const AUTH_HEADERS = API_KEY ? { "X-API-Key": API_KEY } : {};

let FIXTURE: DemoFixture;
let DOCTOR_VIEW_URL: string;

test.describe("Doctor View — deep flow", () => {
  test.beforeAll(async ({ request, baseURL }) => {
    FIXTURE = await requireFirstFixture(request, baseURL);
    // Intentionally NOT including `fileid=` in the URL. V41 has an
    // auto-select effect (PhysicianReportsModifiedV41Timothy.tsx
    // ~line 3850) that bypasses the dashboard and jumps straight
    // to the grid view when `fileid` is in the URL — and that
    // jump skips `trackEvent("patient_select", ...)` because
    // `setSelectedPatient` is called directly instead of via the
    // wrapper at line 4197. Starting from `/?doctorid=...` lands
    // us on the dashboard so we can click "View Report" the way a
    // physician would and exercise the full event chain.
    DOCTOR_VIEW_URL = `/?doctorid=${encodeURIComponent(FIXTURE.doctor)}`;
  });

  test("walk dashboard → grid → detail and confirm tracking events persist", async ({
    page,
  }) => {
    // Capture every tracking POST so we can pull the session id
    // and check exactly which event_types fired during the flow.
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
          /* non-JSON bodies aren't expected here — ignore */
        }
      }
    });

    // Surface uncaught render errors as test failures with the
    // original stack instead of a torn-down section.
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => {
      if (!/Hydration|hydrat/i.test(e.message)) pageErrors.push(e.message);
    });

    // ── 1. Dashboard view (initial mount) ────────────────────────────
    // Loading dashboard triggers `page_view` + the initial
    // patient list fetch. We wait for the patient table's "View
    // Report" button to be present before clicking — that's the
    // affordance physicians actually use to drill into a patient
    // (V41 ~1621). Selection-screen heading must be gone too.
    await page.goto(DOCTOR_VIEW_URL);
    await expect(page).toHaveURL(/doctorid=/);
    await expect(
      page.getByText("Patient Consultation System"),
    ).not.toBeVisible({ timeout: 10_000 });

    const viewReportBtn = page
      .getByRole("button", { name: /^View Report$/i })
      .first();
    await expect(
      viewReportBtn,
      "expected at least one 'View Report' button on the dashboard",
    ).toBeVisible({ timeout: 15_000 });

    // ── 2. Stage 1 → 2 transition (dashboard → grid) ─────────────────
    // Clicking "View Report" calls `setSelectedPatient(...)` which
    // is wired to `trackEvent("patient_select", ...)` at the V41
    // top level (~line 4197). Then the view state flips to "grid".
    await viewReportBtn.click();
    // Grid view shows topic-name buttons for each domain
    // (Cancer Prognosis / Life Expectancy / etc.). Wait for the
    // first one to appear — that's the next click target.
    const topicBtn = page
      .getByRole("button", {
        name: /Cancer Prognosis|Life Expectancy|Erectile Dysfunction|Urinary Incontinence|Irritative Urinary Symptoms/i,
      })
      .first();
    await expect(
      topicBtn,
      "grid view should expose at least one topic-name button after patient_select",
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. Stage 2 → 3 transition (grid → detail) ────────────────────
    // The topic-name button has `setSelectedTopic({name, patient})`
    // wired to `trackEvent("topic_select", ...)` (~line 4233).
    await topicBtn.click();
    await page.waitForTimeout(1_500);

    // ── 4. Stage 3 — best-effort sentence_select ─────────────────────
    // Detail view fetches sentences on demand so the list is
    // sometimes empty for a brief moment. If a sentence card is
    // visible within 5 s click it; otherwise just move on (the
    // soft assertion below tolerates the absence).
    const sentenceCard = page
      .locator('[data-testid="sentence-card"], button:has-text("Score:")')
      .first();
    const sentenceVisible = await sentenceCard
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (sentenceVisible) {
      await sentenceCard.click().catch(() => {
        // Sentence click can collide with the detail-view's own
        // re-render — best-effort, don't fail the whole test on it.
      });
      await page.waitForTimeout(800);
    }

    // ── 5. No uncaught render errors during the flow ─────────────────
    expect(
      pageErrors,
      `no uncaught page errors on doctor view — got: ${pageErrors.join(" | ")}`,
    ).toEqual([]);

    // ── 6. Round-trip — events landed in doctor_behavior ─────────────
    expect(
      trackedRequests.length,
      "expected at least one tracking POST during the dashboard → grid → detail walk",
    ).toBeGreaterThan(0);

    // The doctor surface generates one session per mount — pick
    // the session with the most events to skip any short-lived
    // mount/unmount sessions on adjacent pages.
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

    // Hard assertions: the three events the physician drove
    // intentionally must all be persisted.
    for (const required of [
      "page_view",
      "patient_select",
      "topic_select",
    ] as const) {
      expect(
        persistedTypes,
        `${required} should appear in doctor_behavior — got types: ${persistedTypes.join(", ")}`,
      ).toContain(required);
    }

    // Soft signal — sentence_select only fires when the detail
    // view had time to render its sentence list and the click
    // landed. Logged for diagnostic value but not asserted on.
    if (persistedTypes.includes("sentence_select")) {
      console.log("[doctor-deep] sentence_select also fired — full chain");
    }

    console.log(
      `[doctor-deep] session=${sessionId} persisted ${sessionBody.count} events ` +
        `[${persistedTypes.join(", ")}] — file=${FIXTURE.file} doctor=${FIXTURE.doctor}`,
    );
  });
});
