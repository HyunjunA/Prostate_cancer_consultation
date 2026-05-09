import { test, expect } from "@playwright/test";
import { getAllFixtures, type DemoFixture } from "./_fixtures";
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

let ALL_FIXTURES: DemoFixture[] = [];

const API_BASE = "http://localhost:8000";
const API_KEY = process.env.E2E_API_KEY || process.env.API_KEY || "";
const AUTH_HEADERS = { "X-API-Key": API_KEY };

test.beforeAll(async ({ request, baseURL }) => {
  ALL_FIXTURES = await getAllFixtures(request, baseURL);
  test.skip(
    ALL_FIXTURES.length === 0,
    "precondition: no patient data — /api/backend/patient/files returned []",
  );
});

test.describe("Patient Follow-up — Complete Flow End-to-End", () => {
  // Single sequential test: drive the full flow once per available
  // patient. With three demo fixtures (SID 10/14/15) seeded, this
  // walks all three deterministically — no random pick. Each loop
  // iteration: navigate to that patient's follow-up URL, complete
  // SDM/DCS/Risk/Satisfaction in order, click Complete Survey,
  // verify the Thank You screen, then move to the next patient.
  test("complete all 4 surveys for every seeded patient (deterministic)", async ({
    page,
  }) => {
    for (const fixture of ALL_FIXTURES) {
      const url =
        `/?fileid=${encodeURIComponent(fixture.file)}` +
        `&patid=${encodeURIComponent(fixture.patient)}` +
        `&visit=followup`;
      // eslint-disable-next-line no-console
      console.log(
        `[followup-loop] starting ${fixture.patient}  (file=${fixture.file})`,
      );

      await waitForFollowUpPage(page, url);
      await startSurvey(page);

      await completeSDM(page);
      await goToNextStep(page);
      await completeDCS(page);
      await goToNextStep(page);
      await completeRiskPerception(page);
      await goToNextStep(page);
      await completeSatisfaction(page, "Great experience.");

      const completeButton = page.getByRole("button", {
        name: /Complete Survey/i,
      });
      await expect(completeButton).toBeEnabled({ timeout: 5_000 });
      await completeButton.click();

      await expect(
        page.getByText("Complete").first(),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByRole("heading", { name: /Thank You/i }),
      ).toBeVisible({ timeout: 5_000 });

      // eslint-disable-next-line no-console
      console.log(`[followup-loop] ✓ completed ${fixture.patient}`);
    }
  });

  test("backend records all 4 submission types for every seeded patient", async () => {
    test.skip(
      !API_KEY,
      "API_KEY not set — load app/Backend/.env or export E2E_API_KEY",
    );

    // GET /api/surveys/by-speaker/{speaker} per patient. After the
    // UI loop above, all three patients must have all four survey
    // types persisted. Asserts per-patient so a single missing
    // submission identifies the offending fixture immediately.
    for (const fixture of ALL_FIXTURES) {
      const resp = await fetch(
        `${API_BASE}/api/surveys/by-speaker/${encodeURIComponent(fixture.patient)}`,
        { headers: AUTH_HEADERS },
      );
      expect(
        resp.ok,
        `GET surveys for ${fixture.patient} should return 200`,
      ).toBe(true);
      const body = (await resp.json()) as { survey_types: string[] };

      for (const type of ["sdm", "dcs", "risk_perception", "satisfaction"]) {
        expect(
          body.survey_types,
          `${fixture.patient} must have ${type} after the UI loop`,
        ).toContain(type);
      }
    }
  });
});
