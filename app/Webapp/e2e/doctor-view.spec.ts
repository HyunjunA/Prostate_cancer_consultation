import { test, expect } from "@playwright/test";
import { skipIfFixtureMissing, REQUIRED_FIXTURE_FILE } from "./_fixtures";

/**
 * Doctor View E2E Tests
 *
 * URL pattern: /?fileid=...&doctorid=...
 * Renders PhysicianReports component (quality reports, sentence analysis,
 * AI rewrites).
 *
 * NOTE: These tests use the demo data from the selection screen quick links.
 * The doctor view depends on backend API data being available.
 */

const DOCTOR_VIEW_URL =
  "/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&doctorid=Interviewer:";

test.describe("Doctor View", () => {
  // Skip if the demo fixture isn't in the backend (CI fresh DB, etc.).
  test.beforeAll(async ({ request, baseURL }) => {
    await skipIfFixtureMissing(request, baseURL, REQUIRED_FIXTURE_FILE);
  });

  test("page loads with doctor view params", async ({ page }) => {
    await page.goto(DOCTOR_VIEW_URL);
    await expect(page).toHaveURL(/doctorid=/);
    // Selection screen should NOT be visible
    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test("does not show selection screen", async ({ page }) => {
    await page.goto(DOCTOR_VIEW_URL);
    await page.waitForTimeout(2000);

    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible();
    await expect(page.getByText("Quick Test Links:")).not.toBeVisible();
  });

  test("renders doctor report content or loading state", async ({ page }) => {
    await page.goto(DOCTOR_VIEW_URL);
    await page.waitForTimeout(3000);

    // The page should have visible content
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(50);

    // Look for physician/doctor-related content keywords
    const doctorKeywords = [
      "score",
      "sentence",
      "rewrite",
      "quality",
      "report",
      "communication",
      "loading",
      "analysis",
    ];
    const bodyLower = bodyText.toLowerCase();
    const hasRelevantContent = doctorKeywords.some((kw) =>
      bodyLower.includes(kw)
    );
    expect(hasRelevantContent).toBe(true);
  });

  test("interactive elements are present", async ({ page }) => {
    await page.goto(DOCTOR_VIEW_URL);
    await page.waitForTimeout(3000);

    // Doctor view should have buttons, tabs, or interactive controls
    const buttons = page.locator("button");
    const tabs = page.locator('[role="tab"]');
    const links = page.locator("a");

    const buttonCount = await buttons.count();
    const tabCount = await tabs.count();
    const linkCount = await links.count();

    // At minimum there should be some interactive elements
    expect(buttonCount + tabCount + linkCount).toBeGreaterThan(0);
  });

  test("no uncaught console errors on doctor page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    await page.goto(DOCTOR_VIEW_URL);
    await page.waitForTimeout(3000);

    const criticalErrors = errors.filter(
      (e) => !e.includes("Hydration") && !e.includes("hydrat")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
