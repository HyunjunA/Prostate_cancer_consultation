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

// One dedicated patient per test section — prevents survey-completion
// state from leaking between tests (session restore would skip ahead).
const E2E_PATIENTS: Record<string, { file: string; patient: string }> = {
  sdm:  { file: "E2E_TEST_FILE_PATIENT_A_DOC1_20260101.csv", patient: "Patient_E2E_TEST_FILE_PATIENT_A_DOC1_20260101" },
  dcs:  { file: "E2E_TEST_FILE_PATIENT_B_DOC1_20260101.csv", patient: "Patient_E2E_TEST_FILE_PATIENT_B_DOC1_20260101" },
  risk: { file: "E2E_TEST_FILE_PATIENT_C_DOC1_20260101.csv", patient: "Patient_E2E_TEST_FILE_PATIENT_C_DOC1_20260101" },  // needs &combined=1
  sat:  { file: "E2E_TEST_FILE_PATIENT_D_DOC1_20260101.csv", patient: "Patient_E2E_TEST_FILE_PATIENT_D_DOC1_20260101" },
};

function followUpUrl(section: keyof typeof E2E_PATIENTS): string {
  const { file, patient } = E2E_PATIENTS[section];
  const base = `/?fileid=${encodeURIComponent(file)}&patid=${encodeURIComponent(patient)}&visit=followup`;
  // Risk Perception is only reachable in the combined (Total Survey) flow.
  return section === "risk" ? base + "&combined=1" : base;
}

const API_BASE = process.env.E2E_API_BASE || "http://localhost:18001";
const API_KEY = process.env.E2E_API_KEY || process.env.API_KEY || "";
const AUTH_HEADERS = { "X-API-Key": API_KEY };

// Verify E2E fixtures are present (seeded by globalSetup)
test.beforeAll(async ({ request, baseURL }) => {
  const all = await getAllFixtures(request, baseURL);
  const e2eFiles = all.filter((f) => f.file.startsWith("E2E_"));
  if (e2eFiles.length < 4) {
    test.skip(true, `precondition: need 4 E2E fixtures, found ${e2eFiles.length}`);
  }
});

// ===========================================================================
// 1. SDM Survey — Full submit via UI
// ===========================================================================

test.describe("SDM Survey Submit", () => {
  test("fill all 4 SDM questions and submit via UI", async ({ page }) => {
    await waitForFollowUpPage(page, followUpUrl("sdm"));
    await startSurvey(page);
    await completeSDM(page);
  });

  test("SDM submit is received by backend", async ({ page }) => {
    test.skip(
      !API_KEY,
      "API_KEY not set — load app/Backend/.env or export E2E_API_KEY",
    );
    const url = followUpUrl("sdm");
    await waitForFollowUpPage(page, url);
    await startSurvey(page);
    await completeSDM(page);

    // Verify via Backend API that submission was received
    const resp = await fetch(
      `${API_BASE}/api/surveys/by-speaker/${encodeURIComponent(E2E_PATIENTS.sdm.patient)}`,
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
    await waitForFollowUpPage(page, followUpUrl("dcs"));
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
    await waitForFollowUpPage(page, followUpUrl("risk"));
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
    await waitForFollowUpPage(page, followUpUrl("sat"));
    await startSurvey(page);

    // Fast-forward through SDM + DCS (Risk is not in the basic follow-up flow).
    await completeSDM(page);
    await goToNextStep(page);
    await completeDCS(page);
    await goToNextStep(page);

    // Now on Satisfaction
    await completeSatisfaction(
      page,
      "[E2E TEST] The consultation report was very clear and helpful.",
    );
  });
});
