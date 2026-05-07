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
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // PLAYWRIGHT_FULLSCREEN=1 gives the headed Chromium a maximized
    // window — useful for demos. With viewport=null Playwright lets
    // the OS window manager decide size, and --start-maximized asks
    // Chromium to open at full screen. No effect in headless.
    ...(process.env.PLAYWRIGHT_FULLSCREEN === "1"
      ? { viewport: null }
      : {}),
    // Slow each Playwright action down by N ms so a human can follow
    // along when running --headed. Off (0) by default; opt in by
    // exporting PLAYWRIGHT_SLOW_MO=500 (or whatever delay feels
    // right). Only meaningful with --headed; in headless / CI it
    // just adds wall-clock time without any visible benefit.
    launchOptions: {
      slowMo: Number(process.env.PLAYWRIGHT_SLOW_MO ?? 0),
      // PLAYWRIGHT_DEVTOOLS=1 auto-opens DevTools for every tab —
      // newer Playwright deprecated `devtools: true`, but the
      // Chromium flag `--auto-open-devtools-for-tabs` still works.
      // PLAYWRIGHT_FULLSCREEN=1 maximises the window. Both can be
      // combined; we collapse them into a single args array.
      args: [
        ...(process.env.PLAYWRIGHT_FULLSCREEN === "1"
          ? ["--start-maximized"]
          : []),
        ...(process.env.PLAYWRIGHT_DEVTOOLS === "1"
          ? ["--auto-open-devtools-for-tabs"]
          : []),
      ],
    },
  },

  /* Global test timeout: 30 seconds normally, plus PLAYWRIGHT_SLOW_MO
     budget per action since slowMo extends each click/type/etc by
     N ms. We don't know exactly how many actions a spec runs, so add
     a generous 200× headroom — overshooting on timeout is fine,
     undershooting fails an otherwise-good test. */
  timeout:
    30_000 + 200 * Number(process.env.PLAYWRIGHT_SLOW_MO ?? 0),

  /* Chromium only for speed */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
