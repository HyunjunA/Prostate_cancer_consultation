import { test, expect } from "@playwright/test";
import { requireFirstFixture, type DemoFixture } from "./_fixtures";
import { loginAsAdmin } from "./_admin_auth";

/**
 * Cross-View Navigation E2E Tests
 *
 * Tests navigation between different views (admin pickers, patient,
 * doctor) and verifies URL parameter handling, browser history, and
 * resilience to invalid params.
 *
 * The list screens these flows start from moved from "/" to /admin/patients
 * and /admin/physicians on 2026-08-27, so the picker-driven tests sign in
 * first (they skip without E2E_ADMIN_USER / E2E_ADMIN_PASSWORD). The
 * destination URLs are unchanged and still public.
 *
 * Patient / file / doctor identifiers are discovered from the
 * backend at run time (`requireFirstFixture`) so the spec is
 * portable across environments — local dev with one demo file, CI
 * with whatever the seed step produces, a teammate's box with
 * something completely different. The spec only depends on "at
 * least one patient exists in the backend".
 */

let FIXTURE: DemoFixture;
let PATIENT_FIRST_VISIT_URL: string;
let PATIENT_FOLLOWUP_URL: string;
let DOCTOR_VIEW_URL: string;

test.describe("Cross-View Navigation", () => {
  test.beforeAll(async ({ request, baseURL }) => {
    FIXTURE = await requireFirstFixture(request, baseURL);
    const file = encodeURIComponent(FIXTURE.file);
    const patient = encodeURIComponent(FIXTURE.patient);
    const doctor = encodeURIComponent(FIXTURE.doctor);
    PATIENT_FIRST_VISIT_URL = `/?fileid=${file}&patid=${patient}&visit=first`;
    PATIENT_FOLLOWUP_URL = `/?fileid=${file}&patid=${patient}&visit=followup`;
    DOCTOR_VIEW_URL = `/?fileid=${file}&doctorid=${doctor}`;
  });

  test("navigate from the admin patient list to patient first visit and back", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/patients");

    // Click the per-row "1st · Report" button. `.first()` picks the row
    // corresponding to the discovered fixture (which is the first/only row
    // because we discovered it from the same list).
    const reportBtn = page.getByRole("button", { name: /1st · Report/i }).first();
    await expect(reportBtn).toBeVisible({ timeout: 10_000 });
    await reportBtn.click();

    // Should now be on the public patient view (self-descriptive URL).
    await expect(page).toHaveURL(/[?&]f=.*(view=first-report|survey=first-visit)/);

    // Back to the picker
    await page.goto("/admin/patients");
    await expect(
      page.getByRole("heading", { name: "Patient Records" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigate from the admin physician list to doctor view and back", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/physicians");

    const doctorLink = page.getByRole("link", { name: /^Doctor / }).first();
    await expect(doctorLink).toBeVisible({ timeout: 10_000 });
    await doctorLink.click();

    // Should now be on the public doctor view
    await expect(page).toHaveURL(/doctorid=/);
    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible({ timeout: 10_000 });

    // Back to the picker
    await page.goto("/admin/physicians");
    await expect(
      page.getByRole("heading", { name: /Physician View/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("URL params are preserved correctly when navigating directly", async ({ page }) => {
    // Navigate to patient first visit with specific params. The
    // assertions check that the params we put into the URL come
    // back out exactly — that's the property the test is about, not
    // any specific filename.
    const fileEnc = encodeURIComponent(FIXTURE.file);
    const patientEnc = encodeURIComponent(FIXTURE.patient);

    await page.goto(PATIENT_FIRST_VISIT_URL);
    await expect(page).toHaveURL(new RegExp(`fileid=${escapeRegex(fileEnc)}`));
    await expect(page).toHaveURL(new RegExp(`patid=${escapeRegex(patientEnc)}`));
    await expect(page).toHaveURL(/visit=first/);

    // Navigate to doctor view
    await page.goto(DOCTOR_VIEW_URL);
    await expect(page).toHaveURL(new RegExp(`fileid=${escapeRegex(fileEnc)}`));
    await expect(page).toHaveURL(/doctorid=/);

    // Navigate to follow-up
    await page.goto(PATIENT_FOLLOWUP_URL);
    await expect(page).toHaveURL(/visit=followup/);
  });

  test("browser back and forward navigation works", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/patients");

    // Navigate to the survey flow via the per-row "Total Survey" button.
    const surveyBtn = page.getByRole("button", { name: /Total Survey/i }).first();
    await expect(surveyBtn).toBeVisible({ timeout: 10_000 });
    await surveyBtn.click();
    await expect(page).toHaveURL(/survey=follow-up/);

    // Go back to the picker.
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/patients\/?$/);
    await expect(
      page.getByRole("heading", { name: "Patient Records" }),
    ).toBeVisible({ timeout: 10_000 });

    // Go forward
    await page.goForward();
    await expect(page).toHaveURL(/survey=follow-up/);
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

/** Escape regex metacharacters in a literal string so it can be
 *  embedded in a `new RegExp(...)`. URL-encoded fixture names can
 *  contain `%`, `(`, `)`, `.` etc. which would otherwise be
 *  interpreted as regex syntax. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
