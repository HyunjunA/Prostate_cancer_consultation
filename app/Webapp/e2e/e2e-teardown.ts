/**
 * Playwright global teardown — removes E2E test fixtures after all specs finish.
 */
import { execSync } from "child_process";
import * as path from "path";

async function globalTeardown(): Promise<void> {
  const venv = path.resolve(__dirname, "../../../.venv/bin/python");
  const seedScript = path.resolve(
    __dirname,
    "../../Backend/scripts/seed_e2e_fixtures.py",
  );

  console.log("[e2e-teardown] Removing E2E test fixtures...");
  try {
    execSync(`${venv} ${seedScript} --delete`, {
      stdio: "inherit",
      env: { ...process.env },
    });
    console.log("[e2e-teardown] Fixtures removed ✅");
  } catch (err) {
    console.error("[e2e-teardown] Cleanup failed (non-fatal):", err);
  }
}

export default globalTeardown;
