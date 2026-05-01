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
 * Patient Follow-up — full end-to-end completion flow
 *
 * One real-patient visit, start to finish:
 *   1. Land on the follow-up page (Welcome step)
 *   2. Click Start Survey
 *   3. Fill and submit SDM (4 questions)
 *   4. Continue to DCS, fill and submit (16 questions)
 *   5. Continue to Risk Perception, fill and submit (5 questions)
 *   6. Continue to Satisfaction, type "Great experience." and submit
 *   7. Click Complete Survey
 *   8. Verify the "Thank You" complete screen renders
 *
 * Per-section submit checks live in `survey-submit-flow.spec.ts`;
 * this file owns the cross-section completion. Splitting them is
 * mostly about test runtime — these full-flow tests take ~30-60 s
 * each because they walk every step, while the per-section tests
 * are fast atomic checks.
 *
 * Two tests:
 *   1. UI-only — confirms the patient can drive the whole flow to
 *      Complete without anything tearing down.
 *   2. Backend round-trip — same UI flow, plus a GET against
 *      `/api/surveys/by-speaker/{speaker}` afterwards to confirm all
 *      four survey types were actually written. Skips when no
 *      API_KEY is available, same pattern as the rest of the suite.
 */

// Each test walks every survey section sequentially. ~30-60 s on a
// fast machine without slowMo; pad to 120 s so a slow CI runner
// doesn't trip the default 30 s test timeout.
test.setTimeout(120_000);

let FIXTURE: DemoFixture;
let FOLLOWUP_URL: string;
let SPEAKER: string;

const API_BASE = "http://localhost:8000";
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

test.describe("Patient Follow-up — Complete Flow End-to-End", () => {
  test("complete all 4 surveys, type feedback, click Complete Survey", async ({
    page,
  }) => {
    await waitForFollowUpPage(page, FOLLOWUP_URL);
    await startSurvey(page);

    // Walk each survey section in order, hitting "Continue to Next
    // Section" between sections to advance the wizard.
    await completeSDM(page);
    await goToNextStep(page);
    await completeDCS(page);
    await goToNextStep(page);
    await completeRiskPerception(page);
    await goToNextStep(page);

    // Final section — type the patient's free-form feedback. The
    // string is the literal the user asked for; do not prefix it.
    await completeSatisfaction(page, "Great experience.");

    // Click the final "Complete Survey" button on the satisfaction
    // step's footer (distinct from the per-section "Submit Feedback"
    // button that completeSatisfaction already clicked).
    const completeButton = page.getByRole("button", {
      name: /Complete Survey/i,
    });
    await expect(completeButton).toBeEnabled({ timeout: 5_000 });
    await completeButton.click();

    // Final "Complete" step should render the Thank You confirmation.
    await expect(
      page.getByText("Complete").first(),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("heading", { name: /Thank You/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("backend has all 4 submission types after the full flow", async ({
    page,
  }) => {
    test.skip(
      !API_KEY,
      "API_KEY not set — load app/Backend/.env.native or export E2E_API_KEY",
    );

    await waitForFollowUpPage(page, FOLLOWUP_URL);
    await startSurvey(page);

    await completeSDM(page);
    await goToNextStep(page);
    await completeDCS(page);
    await goToNextStep(page);
    await completeRiskPerception(page);
    await goToNextStep(page);
    await completeSatisfaction(page, "Great experience.");

    // GET /api/surveys/by-speaker/{speaker} returns the list of
    // survey types this speaker has submitted. After a full-flow
    // run all four types must be present, otherwise the wizard
    // didn't actually persist one (or more) of the steps.
    const resp = await fetch(
      `${API_BASE}/api/surveys/by-speaker/${encodeURIComponent(SPEAKER)}`,
      { headers: AUTH_HEADERS },
    );
    expect(resp.ok).toBe(true);
    const body = await resp.json();

    expect(body.survey_types).toContain("sdm");
    expect(body.survey_types).toContain("dcs");
    expect(body.survey_types).toContain("risk_perception");
    expect(body.survey_types).toContain("satisfaction");
  });
});
