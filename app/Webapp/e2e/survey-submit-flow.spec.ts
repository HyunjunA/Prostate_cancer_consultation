import { test, expect, Page } from "@playwright/test";

/**
 * Survey Submit Full Flow E2E Tests
 *
 * Tests the complete user journey:
 *   Patient Follow-up page → Fill surveys → Submit → Backend receives → REDCap push
 *
 * Survey flow: Welcome → SDM (4Q) → DCS (16Q) → Risk Perception (5Q) → Satisfaction (1Q) → Complete
 *
 * These tests hit the LIVE Docker environment and push real data.
 */

// These tests are long multi-step flows — give each test up to 120 seconds
test.setTimeout(120_000);

const FOLLOWUP_URL =
  "/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&patid=Patient_quality-coded-nlp-pilot-sid-1&visit=followup";
const API_BASE = "http://localhost:8000";
const API_KEY = "REDACTED_API_KEY";
const AUTH_HEADERS = { "X-API-Key": API_KEY };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the follow-up page to fully load (step sidebar visible). */
async function waitForFollowUpPage(page: Page) {
  await page.goto(FOLLOWUP_URL);
  await expect(
    page.getByText("Welcome").first()
  ).toBeVisible({ timeout: 15_000 });
}

/** Click "Start Survey" on the Welcome step to begin. */
async function startSurvey(page: Page) {
  const startButton = page.getByRole("button", { name: /Start Survey/i });
  await expect(startButton).toBeVisible({ timeout: 5_000 });
  await startButton.click();
}

/**
 * Click a custom SDM radio option by its label text.
 * SDM uses custom div-based radios: <label><div onClick/><span>text</span></label>
 * The onClick is on the circle div, so we must target it directly.
 */
async function clickSDMOption(page: Page, optionText: string) {
  await page
    .locator("label")
    .filter({ hasText: optionText })
    .first()
    .evaluate((el) => {
      const circle = el.querySelector("div");
      if (circle) circle.click();
    });
  // Small wait for React state to update
  await page.waitForTimeout(200);
}

/** Click the in-survey "Next" button (exact match, not "Continue to Next Section"). */
async function clickNextQuestion(page: Page) {
  const nextBtn = page.getByRole("button", { name: "Next", exact: true });
  await expect(nextBtn).toBeEnabled({ timeout: 5_000 });
  await nextBtn.click();
  await page.waitForTimeout(200);
}

/** Click the "Continue to Next Section" navigation button. */
async function goToNextStep(page: Page) {
  const nextButton = page.getByRole("button", {
    name: /Continue to Next Section|Complete Survey/i,
  });
  await expect(nextButton).toBeEnabled({ timeout: 10_000 });
  await nextButton.click();
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Survey Step Helpers (DRY — these fill and submit entire survey sections)
// ---------------------------------------------------------------------------

/** Fill and submit SDM (4 questions: Q1=yesno, Q2=scale, Q3=scale, Q4=yesno). */
async function completeSDM(page: Page) {
  await expect(
    page.getByText("Shared Decision Making").first()
  ).toBeVisible({ timeout: 5_000 });

  // Q1: Yes/No — click "Yes"
  await clickSDMOption(page, "Yes");
  await clickNextQuestion(page);

  // Q2: Scale — click "A lot"
  await clickSDMOption(page, "A lot");
  await clickNextQuestion(page);

  // Q3: Scale — click "Some"
  await clickSDMOption(page, "Some");
  await clickNextQuestion(page);

  // Q4: Yes/No — click "Yes"
  await clickSDMOption(page, "Yes");

  // Submit
  const submitBtn = page.getByRole("button", { name: /Submit Responses/i });
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
  await submitBtn.click();
  await expect(
    page.getByText("Responses submitted successfully!")
  ).toBeVisible({ timeout: 10_000 });
}

/** Fill and submit DCS (16 Likert questions — each uses real <button> elements). */
async function completeDCS(page: Page) {
  await expect(
    page.getByText("Decisional Conflict").first()
  ).toBeVisible({ timeout: 5_000 });

  for (let q = 1; q <= 16; q++) {
    const agreeBtn = page.getByRole("button", { name: "Agree" }).first();
    await expect(agreeBtn).toBeVisible({ timeout: 3_000 });
    await agreeBtn.click();

    if (q < 16) {
      await clickNextQuestion(page);
    }
  }

  const submitBtn = page.getByRole("button", { name: /Submit Responses/i });
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
  await submitBtn.click();
  await expect(
    page.getByText("Responses submitted successfully!")
  ).toBeVisible({ timeout: 10_000 });
}

/** Fill and submit Risk Perception (5 radio questions, 6 options each). */
async function completeRiskPerception(page: Page) {
  await expect(
    page.getByText("Risk Perception").first()
  ).toBeVisible({ timeout: 5_000 });

  // 5 questions, each with radio options (Very Low, Low, Moderate, High, Very High, Not Sure)
  // Real <input type="radio"> inside <label> — clicking the label works
  for (let q = 1; q <= 5; q++) {
    await page.waitForTimeout(300);
    // Click the first radio label for each question
    const radioLabels = page.locator('label:has(input[type="radio"])');
    await expect(radioLabels.first()).toBeVisible({ timeout: 5_000 });
    await radioLabels.first().click();

    if (q < 5) {
      await clickNextQuestion(page);
    }
  }

  const submitBtn = page.getByRole("button", { name: /Submit Responses/i });
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
  await submitBtn.click();
  await expect(
    page.getByText("Responses submitted successfully!")
  ).toBeVisible({ timeout: 10_000 });
}

/** Fill and submit Satisfaction (textarea + submit). */
async function completeSatisfaction(page: Page, feedback: string) {
  await expect(
    page.getByText("Satisfaction").first()
  ).toBeVisible({ timeout: 5_000 });

  const textarea = page.locator("textarea");
  await expect(textarea).toBeVisible({ timeout: 5_000 });
  await textarea.fill(feedback);

  const submitBtn = page.getByRole("button", { name: /Submit Feedback/i });
  await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
  await submitBtn.click();
  await expect(
    page.getByText("Feedback submitted successfully!")
  ).toBeVisible({ timeout: 10_000 });
}

// ===========================================================================
// 1. SDM Survey — Full submit via UI
// ===========================================================================

test.describe("SDM Survey Submit", () => {
  test("fill all 4 SDM questions and submit via UI", async ({ page }) => {
    await waitForFollowUpPage(page);
    await startSurvey(page);
    await completeSDM(page);
  });

  test("SDM submit is received by backend", async ({ page }) => {
    await waitForFollowUpPage(page);
    await startSurvey(page);
    await completeSDM(page);

    // Verify via Backend API that submission was received
    const speaker = "Patient_quality-coded-nlp-pilot-sid-1";
    const resp = await fetch(
      `${API_BASE}/api/surveys/by-speaker/${encodeURIComponent(speaker)}`,
      { headers: AUTH_HEADERS }
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
    await waitForFollowUpPage(page);
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
    await waitForFollowUpPage(page);
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
    await waitForFollowUpPage(page);
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
      "[E2E TEST] The consultation report was very clear and helpful."
    );
  });
});

// ===========================================================================
// 5. Complete Full Flow — All 4 surveys + reach Complete step
// ===========================================================================

test.describe("Complete Survey Flow End-to-End", () => {
  test("complete all 4 surveys and reach the Complete step", async ({
    page,
  }) => {
    await waitForFollowUpPage(page);
    await startSurvey(page);

    // SDM → DCS → Risk Perception → Satisfaction
    await completeSDM(page);
    await goToNextStep(page);
    await completeDCS(page);
    await goToNextStep(page);
    await completeRiskPerception(page);
    await goToNextStep(page);
    await completeSatisfaction(page, "[E2E FULL FLOW] Great experience.");

    // Navigate to Complete step
    const completeButton = page.getByRole("button", {
      name: /Complete Survey/i,
    });
    await expect(completeButton).toBeEnabled({ timeout: 5_000 });
    await completeButton.click();

    // Complete step reached
    await expect(
      page.getByText("Complete").first()
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("heading", { name: /Thank You/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("all 4 survey submissions exist in backend after full flow", async ({
    page,
  }) => {
    const speaker = "Patient_quality-coded-nlp-pilot-sid-1";

    await waitForFollowUpPage(page);
    await startSurvey(page);

    // Complete all 4 surveys
    await completeSDM(page);
    await goToNextStep(page);
    await completeDCS(page);
    await goToNextStep(page);
    await completeRiskPerception(page);
    await goToNextStep(page);
    await completeSatisfaction(
      page,
      "[E2E VERIFY] Backend receipt verification test."
    );

    // Verify all 4 types exist in backend
    const resp = await fetch(
      `${API_BASE}/api/surveys/by-speaker/${encodeURIComponent(speaker)}`,
      { headers: AUTH_HEADERS }
    );
    expect(resp.ok).toBe(true);
    const body = await resp.json();

    expect(body.survey_types).toContain("sdm");
    expect(body.survey_types).toContain("dcs");
    expect(body.survey_types).toContain("risk_perception");
    expect(body.survey_types).toContain("satisfaction");
  });
});
