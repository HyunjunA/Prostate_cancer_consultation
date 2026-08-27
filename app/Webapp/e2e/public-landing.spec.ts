import { test, expect } from "@playwright/test";

/**
 * Public landing screen E2E tests (formerly selection-screen.spec.ts).
 *
 * The root URL used to render a browsable index: every patient as a table row,
 * plus a "Physician View" header link to the full doctor roster. On 2026-08-27
 * both indexes moved behind the admin login (/admin/patients,
 * /admin/physicians), so the public page must now expose nothing but the
 * heading, an explanatory line, and a staff sign-in link.
 *
 * The per-person deep links (/?f=..., /?doctorid=...) stay public — patients
 * have no admin account. Those are covered by the patient/doctor deep specs.
 */
test.describe("Public landing screen", () => {
  test("page loads at root URL", async ({ page }) => {
    await page.goto("/");
    // Match any localhost port — CI runs the Webapp at :3000, the local
    // Docker / native deployment exposes it at :3001.
    await expect(page).toHaveURL(/^http:\/\/localhost(:\d+)?\/?(\?.*)?$/);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("shows main heading", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Patient Consultation System" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("offers a staff sign-in link to the admin login", async ({ page }) => {
    await page.goto("/");
    const signIn = page.getByRole("link", { name: /Staff sign-in/i });
    await expect(signIn).toBeVisible({ timeout: 10_000 });
    await expect(signIn).toHaveAttribute("href", "/admin/login");
  });

  test("exposes no patient index and no physician roster link", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Patient Consultation System" }),
    ).toBeVisible({ timeout: 10_000 });

    // The regression this test exists for: any of these reappearing on "/"
    // means the browsable index leaked back onto the public page.
    await expect(page.locator("table")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Physician View/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /1st · Report/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Total Survey/i })).toHaveCount(0);
  });

  test("the retired ?select=physician entry no longer lists doctors", async ({
    page,
  }) => {
    await page.goto("/?select=physician");
    // Falls back to the landing screen instead of the old roster.
    await expect(
      page.getByRole("heading", { name: "Patient Consultation System" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Select a physician/i)).toHaveCount(0);
  });

  test("admin routes redirect to the login page when signed out", async ({
    page,
  }) => {
    for (const path of ["/admin", "/admin/patients", "/admin/physicians"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login(\?|$)/, { timeout: 10_000 });
    }
  });
});
