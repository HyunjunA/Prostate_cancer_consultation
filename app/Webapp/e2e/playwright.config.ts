import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for the NUSPAR Dashboard.
 *
 * Assumes the app is already running at http://localhost:3000 (via Docker/nginx).
 * No webServer config — start the app before running tests.
 */
export default defineConfig({
  testDir: ".",
  // Loads app/Backend/.env.native into process.env before any spec runs,
  // so backend-verification tests can authenticate against the live API
  // without a hand-edited key. CI exports `secrets.E2E_API_KEY` into the
  // workflow env directly — the setup hook only fills gaps.
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  /* Shared settings for all tests */
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  /* Global test timeout: 30 seconds */
  timeout: 30_000,

  /* Chromium only for speed */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
