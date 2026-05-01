import { test, expect } from "@playwright/test";
import { skipIfFixtureMissing, REQUIRED_FIXTURE_FILE } from "./_fixtures";

/**
 * Cross-View Navigation E2E Tests
 *
 * Tests navigation between different views (selection, patient, doctor)
 * and verifies URL parameter handling, browser history, and resilience
 * to invalid params.
 */

const PATIENT_FIRST_VISIT_URL =
  "/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&patid=Patient_quality-coded-nlp-pilot-sid-1&visit=first";

const PATIENT_FOLLOWUP_URL =
  "/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&patid=Patient_quality-coded-nlp-pilot-sid-1&visit=followup";

const DOCTOR_VIEW_URL =
  "/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&doctorid=Interviewer:";

test.describe("Cross-View Navigation", () => {
  // Every URL above hardcodes the demo fixture file. Skip the
  // whole block on a fresh CI database where that file isn't seeded
  // yet — see e2e/_fixtures.ts for the rationale.
  test.beforeAll(async ({ request, baseURL }) => {
    await skipIfFixtureMissing(request, baseURL, REQUIRED_FIXTURE_FILE);
  });

  test("navigate from selection to patient first visit and back", async ({ page }) => {
    // Start at selection screen
    await page.goto("/");
    await expect(
      page.getByText("Patient Consultation System")
    ).toBeVisible({ timeout: 10_000 });

    // Click the Patient First Visit quick link
    const firstVisitLink = page.getByRole("link", { name: "Patient First Visit" });
    await firstVisitLink.click();

    // Should now be on patient view
    await expect(page).toHaveURL(/visit=first/);
    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible({ timeout: 10_000 });

    // Navigate back to selection
    await page.goto("/");
    await expect(
      page.getByText("Patient Consultation System")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigate from selection to doctor view and back", async ({ page }) => {
    // Start at selection screen
    await page.goto("/");
    await expect(
      page.getByText("Patient Consultation System")
    ).toBeVisible({ timeout: 10_000 });

    // Click the Doctor Demo quick link
    const doctorLink = page.getByRole("link", { name: "Doctor Demo" });
    await doctorLink.click();

    // Should now be on doctor view
    await expect(page).toHaveURL(/doctorid=/);
    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible({ timeout: 10_000 });

    // Navigate back to selection
    await page.goto("/");
    await expect(
      page.getByText("Patient Consultation System")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("URL params are preserved correctly when navigating directly", async ({ page }) => {
    // Navigate to patient first visit with specific params
    await page.goto(PATIENT_FIRST_VISIT_URL);
    await expect(page).toHaveURL(/fileid=quality-coded-nlp-pilot-sid-1\.xlsx/);
    await expect(page).toHaveURL(/patid=Patient_quality-coded-nlp-pilot-sid-1/);
    await expect(page).toHaveURL(/visit=first/);

    // Navigate to doctor view
    await page.goto(DOCTOR_VIEW_URL);
    await expect(page).toHaveURL(/fileid=quality-coded-nlp-pilot-sid-1\.xlsx/);
    await expect(page).toHaveURL(/doctorid=Interviewer:/);

    // Navigate to follow-up
    await page.goto(PATIENT_FOLLOWUP_URL);
    await expect(page).toHaveURL(/visit=followup/);
  });

  test("browser back and forward navigation works", async ({ page }) => {
    // Start at selection
    await page.goto("/");
    await expect(
      page.getByText("Patient Consultation System")
    ).toBeVisible({ timeout: 10_000 });

    // Navigate to patient view via quick link
    const followUpLink = page.getByRole("link", { name: "Patient Follow-up" });
    await followUpLink.click();
    await expect(page).toHaveURL(/visit=followup/);

    // Go back
    await page.goBack();
    await expect(page).toHaveURL(/localhost:3000\/?$/);
    await expect(
      page.getByText("Patient Consultation System")
    ).toBeVisible({ timeout: 10_000 });

    // Go forward
    await page.goForward();
    await expect(page).toHaveURL(/visit=followup/);
    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test("page does not crash on invalid or missing params", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    // Test with invalid params - should fall through to selection screen
    await page.goto("/?fileid=nonexistent&patid=&visit=invalid");
    await page.waitForTimeout(2000);

    // Page should not crash - body should have content
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    // Test with completely bogus params
    await page.goto("/?foo=bar&baz=qux");
    await page.waitForTimeout(2000);

    // Should show selection screen since no valid params are present
    await expect(
      page.getByText("Patient Consultation System")
    ).toBeVisible({ timeout: 10_000 });

    // No critical JS errors
    const criticalErrors = errors.filter(
      (e) => !e.includes("Hydration") && !e.includes("hydrat")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
