import { test, expect } from "@playwright/test";
import { requireFirstFixture, type DemoFixture } from "./_fixtures";

/**
 * Cross-View Navigation E2E Tests
 *
 * Tests navigation between different views (selection, patient,
 * doctor) and verifies URL parameter handling, browser history, and
 * resilience to invalid params.
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

  test("navigate from selection to patient first visit and back", async ({ page }) => {
    // Start at selection screen
    await page.goto("/");
    await expect(
      page.getByText("Patient Consultation System")
    ).toBeVisible({ timeout: 10_000 });

    // Click the per-row "First Visit" button. Selection screen at
    // page.tsx:458-467 renders one such button per patient — `.first()`
    // picks the row corresponding to the discovered fixture (which is
    // the first/only row because we discovered it from the same list).
    const firstVisitBtn = page
      .getByRole("button", { name: /^\s*First Visit\s*$/i })
      .first();
    await firstVisitBtn.click();

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

    // Click the "Physician View" link in the selection-screen header
    // (page.tsx:334 — <a href="/?doctorid=auto">). The legacy spec
    // looked for "Doctor Demo" which no longer exists in the UI.
    const physicianLink = page.getByRole("link", { name: /Physician View/i });
    await physicianLink.click();

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
    // Start at selection
    await page.goto("/");
    await expect(
      page.getByText("Patient Consultation System")
    ).toBeVisible({ timeout: 10_000 });

    // Navigate to follow-up via the per-row "Follow-up" button
    // (page.tsx:468-477). The legacy spec used a "Patient Follow-up"
    // quick link that no longer exists.
    const followUpBtn = page
      .getByRole("button", { name: /^\s*Follow-up\s*$/i })
      .first();
    await followUpBtn.click();
    await expect(page).toHaveURL(/visit=followup/);

    // Go back. URL should be the bare baseURL — match any localhost
    // port (CI uses :3000, native deploy uses :3001) and tolerate a
    // trailing slash either way. The previous version pinned :3000.
    await page.goBack();
    await expect(page).toHaveURL(/^http:\/\/localhost(:\d+)?\/?$/);
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

/** Escape regex metacharacters in a literal string so it can be
 *  embedded in a `new RegExp(...)`. URL-encoded fixture names can
 *  contain `%`, `(`, `)`, `.` etc. which would otherwise be
 *  interpreted as regex syntax. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
