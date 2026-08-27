import { test, expect } from "@playwright/test";
import { requireFirstFixture } from "./_fixtures";
import { loginAsAdmin } from "./_admin_auth";

/**
 * Admin patient / physician pickers E2E tests.
 *
 * These are the list screens that used to live on the public home page
 * (selection-screen.spec.ts covered them there). Since 2026-08-27 they sit at
 * /admin/patients and /admin/physicians behind the admin cookie gate, so every
 * test here signs in first.
 *
 * The URLs the pickers navigate TO are unchanged and still public — that is
 * what keeps the links already handed out from deid_mapping.csv working, so
 * the destination assertions below are the same as before the move.
 *
 * Skips when E2E_ADMIN_USER / E2E_ADMIN_PASSWORD are unset (see _admin_auth).
 */
test.describe("Admin patient picker", () => {
  test("lands on the admin hub after sign-in", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible({
      timeout: 10_000,
    });
    // The four staff entry points the manager asked for on the landing page.
    for (const name of [
      "Patient Records",
      "Physician View",
      "Tracking",
      "Upload Transcript",
    ]) {
      await expect(page.getByRole("link", { name: new RegExp(name, "i") })).toBeVisible();
    }
  });

  test("shows per-row patient action buttons when fixture seeded", async ({
    page,
    request,
    baseURL,
  }) => {
    // The table is populated by /api/backend/patient/files — only present when
    // the backend has at least one analysed transcript.
    await requireFirstFixture(request, baseURL);
    await loginAsAdmin(page);

    await page.goto("/admin/patients");
    await expect(
      page.getByRole("button", { name: /1st · Report/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /Total Survey/i }).first(),
    ).toBeVisible();
  });

  test("clicking 1st · Report navigates to the public first-report URL", async ({
    page,
    request,
    baseURL,
  }) => {
    await requireFirstFixture(request, baseURL);
    await loginAsAdmin(page);

    await page.goto("/admin/patients");
    const reportBtn = page.getByRole("button", { name: /1st · Report/i }).first();
    await expect(reportBtn).toBeVisible({ timeout: 10_000 });
    await reportBtn.click();

    // Same destination as before the move — a public patient URL, not /admin.
    await expect(page).toHaveURL(/[?&]f=.*&view=first-report/);
  });

  test("clicking Total Survey navigates to the combined follow-up URL", async ({
    page,
    request,
    baseURL,
  }) => {
    await requireFirstFixture(request, baseURL);
    await loginAsAdmin(page);

    await page.goto("/admin/patients");
    const surveyBtn = page.getByRole("button", { name: /Total Survey/i }).first();
    await expect(surveyBtn).toBeVisible({ timeout: 10_000 });
    await surveyBtn.click();

    await expect(page).toHaveURL(/[?&]f=.*survey=follow-up.*combined=1/);
  });
});

test.describe("Admin physician picker", () => {
  test("lists doctors linking to the public ?doctorid= URL", async ({
    page,
    request,
    baseURL,
  }) => {
    await requireFirstFixture(request, baseURL);
    await loginAsAdmin(page);

    await page.goto("/admin/physicians");
    await expect(
      page.getByRole("heading", { name: /Physician View/i }),
    ).toBeVisible({ timeout: 10_000 });

    const doctorLink = page.getByRole("link", { name: /^Doctor / }).first();
    await expect(doctorLink).toBeVisible({ timeout: 10_000 });
    await expect(doctorLink).toHaveAttribute("href", /^\/\?doctorid=/);

    await doctorLink.click();
    await expect(page).toHaveURL(/[?&]doctorid=/);
  });
});
