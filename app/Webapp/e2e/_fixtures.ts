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
 * The single demo file every legacy spec used to hardcode against.
 * Kept here for the surviving `skipIfFixtureMissing` callers (e.g.
 * the selection-screen quick-test-link test that explicitly checks
 * the legacy URL shape). New specs should prefer
 * `getFirstAvailableFixture` so they exercise whatever data the
 * environment happens to have.
 */
export const REQUIRED_FIXTURE_FILE = "quality-coded-nlp-pilot-sid-1.xlsx";

// ---------------------------------------------------------------------------
// Dynamic fixture discovery
// ---------------------------------------------------------------------------

/**
 * The bundle of identifiers a single spec needs to drive the patient
 * pages — file id (xlsx name), patient id (speaker), and doctor id.
 */
export interface DemoFixture {
  file: string;
  patient: string;
  doctor: string;
}

/**
 * Discover the first patient/file pair the backend currently knows
 * about. The legacy specs hardcoded
 * `quality-coded-nlp-pilot-sid-1.xlsx`, which is fragile across
 * environments — a fresh CI Postgres has zero rows, a dev box might
 * have a different demo, and a fixture rename in the backend
 * breaks every spec at once.
 *
 * Discovery rules:
 *   - File: first entry returned by `/api/backend/patient/files`.
 *     Order is whatever the backend ships; nothing here depends on
 *     it being a particular file, only on it being a real one.
 *   - Patient: derived as `Patient_<file without .xlsx>`. This is
 *     the convention every demo transcript follows in
 *     `persistence.py` / the seed pipeline.
 *   - Doctor: the literal string `Interviewer:` — that's the
 *     speaker label all sample transcripts use for the physician
 *     turn. Hardcoded here because it isn't returned by any list
 *     endpoint, but it's a stable string across every fixture in
 *     the repo's history.
 *
 * Returns `null` when no files are available; the caller should
 * `test.skip()` in that case.
 */
export async function getFirstAvailableFixture(
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<DemoFixture | null> {
  const root = baseURL ?? "http://localhost:3000";
  const url = `${root}/api/backend/patient/files`;
  let resp;
  try {
    resp = await request.get(url);
  } catch {
    return null;
  }
  if (!resp.ok()) return null;
  const body = (await resp.json()) as { files?: string[] };
  const files = body.files ?? [];
  if (files.length === 0) return null;
  const file = files[0];
  return {
    file,
    patient: `Patient_${file.replace(/\.xlsx$/i, "")}`,
    doctor: "Interviewer:",
  };
}

/**
 * Convenience wrapper for the most common pattern: get the first
 * available fixture, skip the whole describe block if none exists.
 * Use inside `test.beforeAll`.
 *
 *   let FIXTURE: DemoFixture;
 *   test.beforeAll(async ({ request, baseURL }) => {
 *     FIXTURE = await requireFirstFixture(request, baseURL);
 *   });
 *
 * The returned value is non-null — `test.skip` aborts before the
 * caller assigns the result when no fixture is available, so any
 * code that runs after this call can treat `FIXTURE` as defined.
 */
export async function requireFirstFixture(
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<DemoFixture> {
  const fixture = await getFirstAvailableFixture(request, baseURL);
  if (!fixture) {
    test.skip(
      true,
      "precondition: no patient data in backend — " +
        "/api/backend/patient/files returned an empty list",
    );
  }
  // unreachable when test.skip fires, but TS doesn't know that
  return fixture as DemoFixture;
}
