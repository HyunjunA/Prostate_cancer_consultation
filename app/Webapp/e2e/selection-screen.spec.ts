import { test, expect } from "@playwright/test";
import { skipIfFixtureMissing, REQUIRED_FIXTURE_FILE } from "./_fixtures";

/**
 * Selection Screen E2E Tests
 *
 * The selection screen is shown when no URL parameters are provided.
 * It displays cards for First Visit, Follow-up Visit, and Doctor Access,
 * along with quick test links.
 */
test.describe("Selection Screen", () => {
  test("page loads at root URL", async ({ page }) => {
    await page.goto("/");
    // Match any localhost port — CI runs the Webapp at :3000, the
    // local Docker / native deployment exposes it at :3001, and a
    // future setup might use yet another port. Pinning the literal
    // 3000 broke the test under PLAYWRIGHT_BASE_URL=http://localhost:3001.
    await expect(page).toHaveURL(/^http:\/\/localhost(:\d+)?\/?(\?.*)?$/);
    // The page should not show a blank screen
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("shows main heading and description", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText("Patient Consultation System")
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Please access this page with the appropriate URL parameters.")
    ).toBeVisible();
  });

  test("shows all three access cards", async ({ page }) => {
    await page.goto("/");
    // Three cards have emoji + title (e.g. "👤 First Visit")
    await expect(page.getByText(/First Visit/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Follow-up Visit/).first()).toBeVisible();
    await expect(page.getByText(/Doctor Access/).first()).toBeVisible();
  });

  test("shows quick test links", async ({ page }) => {
    await page.goto("/");
    const firstVisitLink = page.getByRole("link", { name: "Patient First Visit" });
    const followUpLink = page.getByRole("link", { name: "Patient Follow-up" });
    const doctorLink = page.getByRole("link", { name: "Doctor Demo" });

    await expect(firstVisitLink).toBeVisible({ timeout: 10_000 });
    await expect(followUpLink).toBeVisible();
    await expect(doctorLink).toBeVisible();

    // Verify href values contain expected params
    await expect(firstVisitLink).toHaveAttribute("href", /visit=first/);
    await expect(followUpLink).toHaveAttribute("href", /visit=followup/);
    await expect(doctorLink).toHaveAttribute("href", /doctorid=/);
  });

  test("clicking quick test link navigates with correct URL params", async ({ page, request, baseURL }) => {
    // The Quick Test Links section only renders when at least one
    // patient is in the backend (the link's href points at that
    // patient's fileid + patid). Skip rather than fail when the
    // fixture isn't seeded, e.g. on a fresh CI Postgres.
    await skipIfFixtureMissing(request, baseURL, REQUIRED_FIXTURE_FILE);
    await page.goto("/");
    const firstVisitLink = page.getByRole("link", { name: "Patient First Visit" });
    await expect(firstVisitLink).toBeVisible({ timeout: 10_000 });

    await firstVisitLink.click();

    // URL should now contain patient params
    await expect(page).toHaveURL(/fileid=.*&patid=.*&visit=first/);
    // Selection screen heading should no longer be visible
    await expect(
      page.getByText("Patient Consultation System")
    ).not.toBeVisible({ timeout: 10_000 });
  });
});
