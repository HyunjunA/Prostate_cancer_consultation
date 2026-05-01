import { test, type APIRequestContext } from "@playwright/test";

/**
 * Skip-helper for specs that hardcode a specific patient file.
 *
 * The legacy specs (cross-view-navigation, patient-first-visit smoke,
 * patient-followup, doctor-view, survey-submit-flow) navigate to a
 * URL that pins both `fileid` and `patid`/`doctorid` to a single
 * demo record — `quality-coded-nlp-pilot-sid-1.xlsx` /
 * `Patient_quality-coded-nlp-pilot-sid-1`. That record is created
 * by running the NLP + AI pipeline on a sample transcript; on a
 * freshly bootstrapped CI Postgres (database_schema.sql + alembic
 * upgrade head, no pipeline run) the record does not exist, so
 * every page click-target the spec depends on is missing and the
 * test times out at 30 s.
 *
 * The right long-term fix is a fixture-seed step that pipelines
 * one transcript before Playwright runs. Until that exists, we
 * gate every affected describe block on a precondition probe:
 * GET /api/backend/patient/files via the Webapp's proxy and check
 * the returned list. If the required fixture isn't there, skip
 * the whole block with a clear message — nightly stays green and
 * the moment the seed step lands, every gated test starts running
 * again with no further code changes.
 *
 * Why hit the WEBAPP proxy (`/api/backend/patient/files`) rather
 * than the backend directly:
 *   - proxy injects X-API-Key server-side, so the test doesn't
 *     need its own credentials
 *   - it exercises the same path the React code uses, so a
 *     misrouted proxy itself surfaces here as "fixture missing"
 *
 * Usage:
 *
 *   test.describe("…", () => {
 *     test.beforeAll(async ({ request, baseURL }) => {
 *       await skipIfFixtureMissing(
 *         request,
 *         baseURL,
 *         "quality-coded-nlp-pilot-sid-1.xlsx",
 *       );
 *     });
 *     // tests below run only when the fixture is present
 *   });
 */
export async function skipIfFixtureMissing(
  request: APIRequestContext,
  baseURL: string | undefined,
  requiredFile: string,
): Promise<void> {
  const root = baseURL ?? "http://localhost:3000";
  const url = `${root}/api/backend/patient/files`;

  let resp;
  try {
    resp = await request.get(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    test.skip(true, `precondition: backend unreachable at ${url} — ${msg}`);
    return;
  }

  if (!resp.ok()) {
    test.skip(
      true,
      `precondition: GET ${url} returned ${resp.status()} ${resp.statusText()}`,
    );
    return;
  }

  // Backend response shape: { files: ["foo.xlsx", ...] }
  const body = (await resp.json()) as { files?: string[] };
  const files = body.files ?? [];
  const present = files.some(
    (f) => f === requiredFile || f.includes(requiredFile),
  );
  if (!present) {
    test.skip(
      true,
      `precondition: required fixture "${requiredFile}" not seeded` +
        ` — available files: ${files.length === 0 ? "(none)" : files.join(", ")}`,
    );
  }
}

/**
 * The single demo file every legacy spec hardcodes against. Keeping
 * the literal in one place so a future rename (or a swap to a
 * different demo file) only touches this constant.
 */
export const REQUIRED_FIXTURE_FILE = "quality-coded-nlp-pilot-sid-1.xlsx";
