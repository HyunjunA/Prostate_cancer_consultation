import { test, expect } from "@playwright/test";

/**
 * Public landing / auth-gate E2E tests.
 *
 * Since 2026-09-17 the root URL "/" redirects unauthenticated visitors to
 * /admin/login (middleware.ts). Personal links (?fileid=… etc.) still pass
 * through without auth. Admin routes continue to require an admin cookie.
 */
test.describe("Public landing screen", () => {
  test("page loads at root URL", async ({ page }) => {
    await page.goto("/");
    // Root redirects to /admin/login — URL should end up on the login page.
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10_000 });
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("shows admin sign-in form at root", async ({ page }) => {
    await page.goto("/");
    // Admin login page shows a username and password field.
    await expect(
      page.getByRole("heading", { name: /Admin sign in/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("offers a staff sign-in form (no separate link needed)", async ({
    page,
  }) => {
    await page.goto("/");
    // The login page IS the staff sign-in — verify form inputs exist.
    await expect(page.getByLabel(/Username/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/Password/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("exposes no patient index and no physician roster link", async ({
    page,
  }) => {
    await page.goto("/");
    // Login page must not accidentally expose patient/physician data.
    await expect(page.locator("table")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Physician View/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /1st · Report/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Total Survey/i }),
    ).toHaveCount(0);
  });

  test("the retired ?select=physician entry redirects to login", async ({
    page,
  }) => {
    await page.goto("/?select=physician");
    // No valid personal-link param → middleware redirects to login.
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10_000 });
    await expect(page.getByText(/Select a physician/i)).toHaveCount(0);
  });

  test("admin routes redirect to the login page when signed out", async ({
    page,
  }) => {
    for (const path of ["/admin", "/admin/patients", "/admin/physicians"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login(\?|$)/, {
        timeout: 10_000,
      });
    }
  });
});
