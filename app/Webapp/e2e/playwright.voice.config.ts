import { defineConfig, devices } from "@playwright/test";

/**
 * Cross-browser run for the dictation spec only.
 *
 * Kept apart from playwright.config.ts for two reasons: the other specs are
 * written against Chromium and would fail noisily on three engines, and this one
 * downloads ~123 MB of model weights per browser, so it is far too slow to sit
 * in the default suite.
 *
 * Prerequisites:
 *   npx playwright install firefox webkit
 *   VOICE_TEST_URL='https://<host>:3443/?doctorid=…&f=…'
 *
 * Run:
 *   npx playwright test --config e2e/playwright.voice.config.ts
 *   npx playwright test --config e2e/playwright.voice.config.ts --project=firefox
 */
export default defineConfig({
  testDir: ".",
  testMatch: "voice-input-cross-browser.spec.ts",
  fullyParallel: false,
  // One engine at a time: three browsers each loading the models at once
  // measures contention, not the browsers.
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "../playwright-report-voice" }]],

  use: {
    // The dashboard is served with a certificate from a local CA, so a browser
    // that has not imported _tls/ca.crt refuses it. The spec is checking engine
    // support, not the PKI, and the certificate is verified separately.
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  // Generous: a cold model download plus first inference, three times over.
  timeout: 240_000,

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
