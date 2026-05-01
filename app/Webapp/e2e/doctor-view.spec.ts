import { test, expect } from "@playwright/test";
import { requireFirstFixture, type DemoFixture } from "./_fixtures";

/**
 * Doctor View E2E Tests
 *
 * URL pattern: /?fileid=...&doctorid=...
 * Renders PhysicianReports component (quality reports, sentence
 * analysis, AI rewrites).
 *
 * Fixture identifiers come from the backend at run time so the spec
 * works against any environment that has at least one patient — no
 * hardcoded filenames.
 */

let FIXTURE: DemoFixture;
let DOCTOR_VIEW_URL: string;

test.describe("Doctor View", () => {
  test.beforeAll(async ({ request, baseURL }) => {
    FIXTURE = await requireFirstFixture(request, baseURL);
    DOCTOR_VIEW_URL =
      `/?fileid=${encodeURIComponent(FIXTURE.file)}` +
      `&doctorid=${encodeURIComponent(FIXTURE.doctor)}`;
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
