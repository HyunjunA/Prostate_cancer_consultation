import { test, expect } from "@playwright/test";
import { requireFirstFixture, type DemoFixture } from "./_fixtures";
import {
  waitForFollowUpPage,
  startSurvey,
  completeSDM,
  completeDCS,
  completeRiskPerception,
  completeSatisfaction,
  goToNextStep,
} from "./_survey_helpers";

/**
 * Survey Submit Flow E2E Tests
 *
 * Each describe block here verifies that ONE survey section can be
 * filled and submitted via the patient follow-up UI:
 *   - SDM (4 questions, custom div-based pseudo-radios)
 *   - DCS (16 Likert questions)
 *   - Risk Perception (5 radio-group questions)
 *   - Satisfaction (textarea)
 *
 * The end-to-end "fill all four sections, click Complete Survey,
 * verify backend wrote every type" flow has its own spec at
 * `patient-followup-complete-flow.spec.ts`. Splitting them keeps
 * this file focused on per-section atomic checks while the other
 * file owns the cross-section completion and round-trip checks.
 */

// These tests are long multi-step flows — give each test up to 120 seconds.
test.setTimeout(120_000);

let FIXTURE: DemoFixture;
let FOLLOWUP_URL: string;
let SPEAKER: string;

const API_BASE = "http://localhost:8000";
// API_KEY comes from the environment so the real value never lands
// in git. `e2e/global-setup.ts` populates process.env from
// app/Backend/.env.native when running locally; CI exports
// `secrets.E2E_API_KEY` directly. The backend-verification test
// below skips itself when the key is absent so the UI-only tests in
// this file still run on a fresh checkout.
const API_KEY = process.env.E2E_API_KEY || process.env.API_KEY || "";
const AUTH_HEADERS = { "X-API-Key": API_KEY };

test.beforeAll(async ({ request, baseURL }) => {
  FIXTURE = await requireFirstFixture(request, baseURL);
  FOLLOWUP_URL =
    `/?fileid=${encodeURIComponent(FIXTURE.file)}` +
    `&patid=${encodeURIComponent(FIXTURE.patient)}` +
    `&visit=followup`;
  SPEAKER = FIXTURE.patient;
});

// ===========================================================================
// 1. SDM Survey — Full submit via UI
// ===========================================================================

test.describe("SDM Survey Submit", () => {
  test("fill all 4 SDM questions and submit via UI", async ({ page }) => {
    await waitForFollowUpPage(page, FOLLOWUP_URL);
    await startSurvey(page);
    await completeSDM(page);
  });

  test("SDM submit is received by backend", async ({ page }) => {
    test.skip(
      !API_KEY,
      "API_KEY not set — load app/Backend/.env.native or export E2E_API_KEY",
    );
    await waitForFollowUpPage(page, FOLLOWUP_URL);
    await startSurvey(page);
    await completeSDM(page);

    // Verify via Backend API that submission was received
    const resp = await fetch(
      `${API_BASE}/api/surveys/by-speaker/${encodeURIComponent(SPEAKER)}`,
      { headers: AUTH_HEADERS },
    );
    expect(resp.ok).toBe(true);
    const body = await resp.json();
    expect(body.survey_types).toContain("sdm");
  });
});

// ===========================================================================
// 2. DCS Survey — Fill all 16 Likert questions and submit
// ===========================================================================

test.describe("DCS Survey Submit", () => {
  test("fill all 16 DCS questions and submit via UI", async ({ page }) => {
    await waitForFollowUpPage(page, FOLLOWUP_URL);
    await startSurvey(page);

    // Fast-forward through SDM
    await completeSDM(page);
    await goToNextStep(page);

    // Now on DCS
    await completeDCS(page);
  });
});

// ===========================================================================
// 3. Risk Perception Survey — Slider + radio questions
// ===========================================================================

test.describe("Risk Perception Survey Submit", () => {
  test("fill all 5 risk perception questions and submit via UI", async ({
    page,
  }) => {
    await waitForFollowUpPage(page, FOLLOWUP_URL);
    await startSurvey(page);

    // Fast-forward through SDM + DCS
    await completeSDM(page);
    await goToNextStep(page);
    await completeDCS(page);
    await goToNextStep(page);

    // Now on Risk Perception
    await completeRiskPerception(page);
  });
});

// ===========================================================================
// 4. Patient Satisfaction Survey — Textarea feedback
// ===========================================================================

test.describe("Patient Satisfaction Survey Submit", () => {
  test("fill satisfaction feedback and submit via UI", async ({ page }) => {
    await waitForFollowUpPage(page, FOLLOWUP_URL);
    await startSurvey(page);

    // Fast-forward through SDM + DCS + Risk Perception
    await completeSDM(page);
    await goToNextStep(page);
    await completeDCS(page);
    await goToNextStep(page);
    await completeRiskPerception(page);
    await goToNextStep(page);

    // Now on Satisfaction
    await completeSatisfaction(
      page,
      "[E2E TEST] The consultation report was very clear and helpful.",
    );
  });
});
