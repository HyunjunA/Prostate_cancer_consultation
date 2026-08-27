import { test, type Page } from "@playwright/test";

/**
 * Admin session helper for specs that need a gated /admin page.
 *
 * The patient and physician indexes moved under /admin on 2026-08-27, and
 * src/middleware.ts redirects any unauthenticated request there to
 * /admin/login. Specs that start from one of those lists therefore have to
 * sign in first.
 *
 * Credentials come from `E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD`. As with
 * `E2E_API_KEY` (see global-setup.ts), a spec self-skips when they are absent
 * rather than failing with a noisy redirect — a fresh checkout or a CI job
 * without the secret should not report a false failure.
 */

export function adminCredentials(): { username: string; password: string } | null {
  const username = process.env.E2E_ADMIN_USER;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

/**
 * Sign in as admin, leaving the httpOnly `admin_session` cookie on the page's
 * browser context. Skips the calling test when no credentials are configured.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  const creds = adminCredentials();
  test.skip(
    creds === null,
    "E2E_ADMIN_USER / E2E_ADMIN_PASSWORD not set — admin-gated test skipped",
  );
  if (!creds) return; // unreachable after skip; keeps TypeScript happy

  // The login route handler sets the cookie on its own response, and
  // page.request shares the context's cookie jar, so the session is live for
  // subsequent page.goto() calls.
  const res = await page.request.post("/api/admin-auth/login", {
    data: creds,
  });
  if (!res.ok()) {
    throw new Error(
      `Admin login failed (${res.status()}). Check E2E_ADMIN_USER / E2E_ADMIN_PASSWORD ` +
        `against the backend's admin accounts.`,
    );
  }
}
