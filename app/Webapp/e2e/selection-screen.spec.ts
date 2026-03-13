import { test, expect } from "@playwright/test";

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
    await expect(page).toHaveURL(/localhost:3000/);
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

  test("clicking quick test link navigates with correct URL params", async ({ page }) => {
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
