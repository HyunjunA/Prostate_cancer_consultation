import { test, expect } from "@playwright/test";
import { requireFirstFixture } from "./_fixtures";

/**
 * Selection Screen E2E Tests
 *
 * The selection screen is shown when no URL parameters are provided.
 * Current layout (page.tsx ~line 320–500):
 *   - "Patient Consultation System" h1 heading
 *   - "Physician View" link in the header (`/?doctorid=auto`)
 *   - Patient table with one row per analysis log; each row has a
 *     "First Visit" and "Follow-up" button that navigates to the
 *     corresponding patient view.
 *
 * Earlier versions of the screen had a separate "Quick Test Links"
 * section with named anchors ("Patient First Visit",
 * "Patient Follow-up", "Doctor Demo") and a 3-card layout
 * ("First Visit" / "Follow-up Visit" / "Doctor Access" cards). Those
 * elements were removed during the V37 redesign; tests that looked
 * for them have been rewritten to verify the current UI instead.
 */
test.describe("Selection Screen", () => {
  test("page loads at root URL", async ({ page }) => {
    await page.goto("/");
    // Match any localhost port — CI runs the Webapp at :3000, the
    // local Docker / native deployment exposes it at :3001. Pinning
    // the literal 3000 broke the test under
    // PLAYWRIGHT_BASE_URL=http://localhost:3001.
    await expect(page).toHaveURL(/^http:\/\/localhost(:\d+)?\/?(\?.*)?$/);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("shows main heading", async ({ page }) => {
    await page.goto("/");
    // Verified against page.tsx:331 — the h1 always renders on the
    // selection screen regardless of whether the patient list is
    // empty or populated. The earlier description-line assertion
    // ("Please access this page with the appropriate URL
    // parameters.") was dropped because that description text was
    // removed during the V37 redesign.
    await expect(
      page.getByRole("heading", { name: "Patient Consultation System" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows physician-view header link", async ({ page }) => {
    await page.goto("/");
    // page.tsx:334 renders <a href="/?doctorid=auto">Physician View</a>
    // as the doctor entry-point in the selection-screen header. This
    // replaces the legacy "Doctor Demo" quick-test link.
    const physicianLink = page.getByRole("link", { name: /Physician View/i });
    await expect(physicianLink).toBeVisible({ timeout: 10_000 });
    await expect(physicianLink).toHaveAttribute("href", /doctorid=/);
  });

  test("shows per-row patient action buttons when fixture seeded", async ({
    page,
    request,
    baseURL,
  }) => {
    // Patient table is populated by `/api/patient/files` — only
    // present when the backend has at least one analysed transcript.
    // Use the same fixture-discovery helper the rest of the suite
    // uses so the test self-skips on a fresh CI database.
    await requireFirstFixture(request, baseURL);

    await page.goto("/");
    // page.tsx:458-477 renders one "First Visit" + "Follow-up"
    // button pair per patient row.
    const firstVisitBtns = page.getByRole("button", {
      name: /^\s*First Visit\s*$/i,
    });
    const followUpBtns = page.getByRole("button", {
      name: /^\s*Follow-up\s*$/i,
    });
    await expect(firstVisitBtns.first()).toBeVisible({ timeout: 10_000 });
    await expect(followUpBtns.first()).toBeVisible();
  });

  test("clicking First Visit button navigates with correct URL params", async ({
    page,
    request,
    baseURL,
  }) => {
    // Same precondition as above — quick links no longer exist; the
    // table buttons are the navigation affordance now.
    await requireFirstFixture(request, baseURL);

    await page.goto("/");
    const firstVisitBtn = page
      .getByRole("button", { name: /^\s*First Visit\s*$/i })
      .first();
    await expect(firstVisitBtn).toBeVisible({ timeout: 10_000 });

    await firstVisitBtn.click();

    // URL should now be the self-descriptive first-visit report form.
    await expect(page).toHaveURL(/[?&]f=.*&view=first-report/);
    // Selection screen heading should no longer be visible
    await expect(
      page.getByText("Patient Consultation System"),
    ).not.toBeVisible({ timeout: 10_000 });
  });
});
