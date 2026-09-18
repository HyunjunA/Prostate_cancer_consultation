/**
 * Playwright global setup — seeds E2E test fixtures before any spec runs.
 * Calls the Python seed script which inserts clearly-fake test patient data
 * (prefixed E2E_) into the production DB. This isolates E2E tests from
 * real patient records and prevents survey-completion state from blocking
 * the follow-up survey flow tests.
 */
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import dotenv from "dotenv";

async function globalSetup(): Promise<void> {
  // Load backend .env so API_KEY / DATABASE_URL / admin credentials are available.
  const envPath = path.resolve(__dirname, "../../../Backend/.env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
  // Provide admin credentials for admin-gated E2E tests if not already set.
  if (!process.env.E2E_ADMIN_USER) process.env.E2E_ADMIN_USER = "admin";
  if (!process.env.E2E_ADMIN_PASSWORD) process.env.E2E_ADMIN_PASSWORD = "admin1234567";

  // app/Webapp/e2e/ → app/Webapp/ → app/ → repo root (.venv lives here)
  const venv = path.resolve(__dirname, "../../../.venv/bin/python");
  const seedScript = path.resolve(
    __dirname,
    "../../Backend/scripts/seed_e2e_fixtures.py",
  );

  console.log("[e2e-setup] Seeding E2E test fixtures...");
  try {
    execSync(`${venv} ${seedScript}`, {
      stdio: "inherit",
      env: { ...process.env },
    });
    console.log("[e2e-setup] Fixtures seeded ✅");
  } catch (err) {
    console.error("[e2e-setup] Seed failed:", err);
    // Don't abort — tests can still run; the skip logic in _fixtures.ts
    // will gracefully skip individual specs if data is missing.
  }
}

export default globalSetup;
