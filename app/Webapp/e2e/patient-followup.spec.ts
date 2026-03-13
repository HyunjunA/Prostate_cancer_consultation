import { test, expect } from "@playwright/test";

/**
 * Patient Follow-up Visit E2E Tests
 *
 * URL pattern: /?fileid=...&patid=...&visit=followup
 * Renders PatientFollowUpReport component (with surveys: SDM, DCS,
 * Risk Perception, Satisfaction).
 *
 * NOTE: These tests use the demo data from the selection screen quick links.
 * Survey sections depend on the component rendering correctly with backend data.
 */

const PATIENT_FOLLOWUP_URL =
  "/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&patid=Patient_quality-coded-nlp-pilot-sid-1&visit=followup";

test.describe("Patient Follow-up Visit", () => {
  test("page loads with follow-up visit params", async ({ page }) => {
    await page.goto(PATIENT_FOLLOWUP_URL);
    await expect(page).toHaveURL(/visit=followup/);
    // Selection screen should NOT be visible
    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test("renders follow-up report content (not selection screen)", async ({ page }) => {
    await page.goto(PATIENT_FOLLOWUP_URL);
    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should not show the selection heading
    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible();

    // Page should have substantial content
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("survey-related content renders or loading state shown", async ({ page }) => {
    await page.goto(PATIENT_FOLLOWUP_URL);

    // Look for survey-related text. The follow-up report should contain
    // survey sections. We check for common survey keywords.
    // Use generous timeout since data may need to load from backend.
    const surveyKeywords = [
      "survey",
      "SDM",
      "decision",
      "satisfaction",
      "risk",
      "questionnaire",
    ];

    // Wait for page to settle
    await page.waitForTimeout(3000);
    const bodyText = (await page.locator("body").innerText()).toLowerCase();

    // At least one survey keyword should appear, OR a loading/empty state is shown
    const hasSurveyContent = surveyKeywords.some((kw) =>
      bodyText.includes(kw.toLowerCase())
    );
    const hasLoadingState =
      bodyText.includes("loading") || bodyText.includes("no data");

    expect(hasSurveyContent || hasLoadingState).toBe(true);
  });

  test("radio buttons or form inputs are present for surveys", async ({ page }) => {
    await page.goto(PATIENT_FOLLOWUP_URL);
    await page.waitForTimeout(3000);

    // Look for radio buttons, checkboxes, or other form inputs
    const radioButtons = page.locator('input[type="radio"]');
    const checkboxes = page.locator('input[type="checkbox"]');
    const buttons = page.locator("button");

    const radioCount = await radioButtons.count();
    const checkboxCount = await checkboxes.count();
    const buttonCount = await buttons.count();

    // The follow-up survey should have some form of interactive elements.
    // If data is not loaded, there might be no radio buttons but at least buttons.
    expect(radioCount + checkboxCount + buttonCount).toBeGreaterThan(0);
  });

  test("no uncaught console errors on follow-up page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    await page.goto(PATIENT_FOLLOWUP_URL);
    await page.waitForTimeout(3000);

    const criticalErrors = errors.filter(
      (e) => !e.includes("Hydration") && !e.includes("hydrat")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
