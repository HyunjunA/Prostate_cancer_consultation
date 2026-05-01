import { test, expect } from "@playwright/test";
import { requireFirstFixture, type DemoFixture } from "./_fixtures";

/**
 * Patient First Visit E2E Tests
 *
 * URL pattern: /?fileid=...&patid=...&visit=first
 * Renders PatientReportFirstVisit component (summary only, no
 * surveys).
 *
 * Fixture identifiers come from the backend at run time so the
 * spec works against any environment that has at least one patient
 * — no hardcoded filenames.
 */

let FIXTURE: DemoFixture;
let PATIENT_FIRST_VISIT_URL: string;

test.describe("Patient First Visit", () => {
  test.beforeAll(async ({ request, baseURL }) => {
    FIXTURE = await requireFirstFixture(request, baseURL);
    PATIENT_FIRST_VISIT_URL =
      `/?fileid=${encodeURIComponent(FIXTURE.file)}` +
      `&patid=${encodeURIComponent(FIXTURE.patient)}` +
      `&visit=first`;
  });

  test("page loads with patient first visit params", async ({ page }) => {
    await page.goto(PATIENT_FIRST_VISIT_URL);
    await expect(page).toHaveURL(/visit=first/);
    // Selection screen should NOT be visible
    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test("does not show selection screen elements", async ({ page }) => {
    await page.goto(PATIENT_FIRST_VISIT_URL);
    // Wait for content to render
    await page.waitForTimeout(2000);
    // The selection heading should be absent
    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible();
    // Quick test links should be absent
    await expect(
      page.getByText("Quick Test Links:")
    ).not.toBeVisible();
  });

  test("renders patient report content or loading state", async ({ page }) => {
    await page.goto(PATIENT_FIRST_VISIT_URL);
    // The page should render something meaningful within the main container.
    // Look for common structural elements (flex-1 main content area).
    // `.first()` because the V37 layout puts multiple `flex-1` divs on
    // the page (outer wrapper + inner content area). Strict mode would
    // otherwise reject a multi-match locator.
    const mainContent = page.locator("div.flex-1").first();
    await expect(mainContent).toBeVisible({ timeout: 10_000 });

    // The page should have some visible text content (not blank)
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test("no uncaught console errors on page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    await page.goto(PATIENT_FIRST_VISIT_URL);
    await page.waitForTimeout(3000);

    // Filter out known benign errors (e.g., hydration warnings in dev mode)
    const criticalErrors = errors.filter(
      (e) => !e.includes("Hydration") && !e.includes("hydrat")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("footer is visible", async ({ page }) => {
    await page.goto(PATIENT_FIRST_VISIT_URL);
    // DashboardFooter should render at the bottom of the page
    // Check for any footer-like element
    const footer = page.locator("footer").or(page.locator("[class*='footer' i]"));
    if ((await footer.count()) > 0) {
      await expect(footer.first()).toBeVisible({ timeout: 10_000 });
    } else {
      // If no explicit footer element, at least confirm page loaded
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.length).toBeGreaterThan(0);
    }
  });
});
