import * as path from "path";
import * as fs from "fs";
import dotenv from "dotenv";

/**
 * Playwright global setup.
 *
 * Loads `app/Backend/.env` into process.env so spec files can
 * reach the live FastAPI without a hand-edited API key. Mirrors the
 * pattern already used by the Backend python e2e suite
 * (`app/Backend/tests/e2e/test_full_flow.py`), so the same
 * .env file is the single source of truth for both layers.
 *
 * Resolution order (first non-empty wins):
 *   1. Whatever is already in process.env (CI secret like
 *      `secrets.E2E_API_KEY` exported into the workflow env).
 *   2. Values from `.env` — only set if the corresponding key
 *      is currently empty, so CI never overwrites its own secret.
 *
 * Spec files read `process.env.E2E_API_KEY` (preferred) or
 * `process.env.API_KEY` (fallback, the name `.env` uses).
 * If neither is present after this hook runs, the affected tests
 * call `test.skip(...)` instead of failing with a noisy 401.
 */
async function globalSetup(): Promise<void> {
  // app/Webapp/e2e/global-setup.ts → app/Backend/.env
  // Walk three levels up from this file: e2e/ → Webapp/ → app/ → Backend/
  const envNative = path.resolve(
    __dirname,
    "..",
    "..",
    "Backend",
    ".env"
  );

  if (!fs.existsSync(envNative)) {
    // No .env locally — assume CI is exporting the secrets
    // directly into the workflow env. Nothing to do.
    return;
  }

  // override: false — don't clobber values the CI runner already set.
  dotenv.config({ path: envNative, override: false });
}

export default globalSetup;
