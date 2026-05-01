import { expect, type Page } from "@playwright/test";

/**
 * Shared helpers for the patient follow-up survey flow.
 *
 * Two specs consume these:
 *   - survey-submit-flow.spec.ts — verifies each survey section can
 *     be submitted independently via the UI.
 *   - patient-followup-complete-flow.spec.ts — runs the full
 *     end-to-end consultation (Welcome → SDM → DCS → Risk → Satisfaction
 *     → Complete) in one sweep and round-trips the resulting writes.
 *
 * Helpers that need the follow-up page URL take it as an argument
 * because each spec discovers its own fixture and builds its own
 * URL inside `test.beforeAll`. Keeping the helper module URL-free
 * means a future spec that wants to drive a different patient can
 * reuse these without modification.
 */

// ---------------------------------------------------------------------------
// Navigation primitives
// ---------------------------------------------------------------------------

/** Wait for the follow-up page to fully load (Welcome step visible). */
export async function waitForFollowUpPage(page: Page, url: string) {
  await page.goto(url);
  await expect(
    page.getByText("Welcome").first(),
  ).toBeVisible({ timeout: 15_000 });
}

/** Click "Start Survey" on the Welcome step to begin. */
export async function startSurvey(page: Page) {
  const startButton = page.getByRole("button", { name: /Start Survey/i });
  await expect(startButton).toBeVisible({ timeout: 5_000 });
  await startButton.click();
}

/**
 * Click a custom SDM radio option by its label text.
 * SDM uses div-based pseudo-radios: <label><div onClick/><span>text</span></label>
 * The onClick is on the inner circle div, so we target it directly via
 * `evaluate`.
 */
export async function clickSDMOption(page: Page, optionText: string) {
  await page
    .locator("label")
    .filter({ hasText: optionText })
    .first()
    .evaluate((el) => {
      const circle = el.querySelector("div");
      if (circle) (circle as HTMLDivElement).click();
    });
  // Small wait for React state to update
  await page.waitForTimeout(200);
}

/** Click the in-question "Next" button (exact match — does NOT match
 *  "Continue to Next Section"). */
export async function clickNextQuestion(page: Page) {
  const nextBtn = page.getByRole("button", { name: "Next", exact: true });
  await expect(nextBtn).toBeEnabled({ timeout: 5_000 });
  await nextBtn.click();
  await page.waitForTimeout(200);
}

/** Click the "Continue to Next Section" / "Complete Survey" button
 *  that moves the survey from one section to the next. */
export async function goToNextStep(page: Page) {
  const nextButton = page.getByRole("button", {
    name: /Continue to Next Section|Complete Survey/i,
  });
  await expect(nextButton).toBeEnabled({ timeout: 10_000 });
  await nextButton.click();
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Per-section completion helpers
// ---------------------------------------------------------------------------

/** Fill and submit the SDM section (4 questions: Q1=yesno, Q2=scale,
 *  Q3=scale, Q4=yesno). */
export async function completeSDM(page: Page) {
  await expect(
    page.getByText("Shared Decision Making").first(),
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
    page.getByText("Responses submitted successfully!"),
  ).toBeVisible({ timeout: 10_000 });
}

/** Fill and submit the DCS section (16 Likert questions). Each uses a
 *  real <button> element labelled "Agree". */
export async function completeDCS(page: Page) {
  await expect(
    page.getByText("Decisional Conflict").first(),
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
    page.getByText("Responses submitted successfully!"),
  ).toBeVisible({ timeout: 10_000 });
}

/** Fill and submit the Risk Perception section (5 radio questions,
 *  6 options each: Very Low / Low / Moderate / High / Very High / Not Sure).
 *  For each question, opens the per-topic "View consultation summary
 *  for this topic" panel (if present — only renders when the backend
 *  returned an AI-generated summary for that domain), then picks
 *  the first option. */
export async function completeRiskPerception(page: Page) {
  await expect(
    page.getByText("Risk Perception").first(),
  ).toBeVisible({ timeout: 5_000 });

  for (let q = 1; q <= 5; q++) {
    await page.waitForTimeout(300);

    // Open the per-topic AI consultation summary if it's there.
    // RiskPerceptionWithSummary.tsx:204 renders a button labelled
    // "View consultation summary for this topic" when collapsed
    // (and "Hide consultation summary for this topic" when already
    // open). We match the View prefix so we never collapse an
    // already-open panel. Best-effort — if a particular topic has
    // no AI summary, the button isn't rendered and we just move on.
    const viewSummaryBtn = page
      .getByRole("button", {
        name: /^View consultation summary for this topic/i,
      })
      .first();
    if (await viewSummaryBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await viewSummaryBtn.click();
      // Tailwind max-h transition runs ~300ms; pad to 400ms before
      // moving on so the panel is fully laid out.
      await page.waitForTimeout(400);
    }

    // Real <input type="radio"> inside <label> — clicking the label works.
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
    page.getByText("Responses submitted successfully!"),
  ).toBeVisible({ timeout: 10_000 });
}

/** Fill and submit the Satisfaction section (textarea + submit).
 *  The feedback string lands in `survey_submission_log.payload` on the
 *  backend, so callers can use a recognisable marker for round-trip
 *  assertions if they need one. */
export async function completeSatisfaction(page: Page, feedback: string) {
  await expect(
    page.getByText("Satisfaction").first(),
  ).toBeVisible({ timeout: 5_000 });

  const textarea = page.locator("textarea");
  await expect(textarea).toBeVisible({ timeout: 5_000 });
  await textarea.fill(feedback);

  const submitBtn = page.getByRole("button", { name: /Submit Feedback/i });
  await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
  await submitBtn.click();
  await expect(
    page.getByText("Feedback submitted successfully!"),
  ).toBeVisible({ timeout: 10_000 });
}
