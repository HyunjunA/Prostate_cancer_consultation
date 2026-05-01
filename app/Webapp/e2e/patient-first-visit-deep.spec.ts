import { test, expect, type Page } from "@playwright/test";

/**
 * Patient First Visit — deep flow (single integrated test)
 *
 * Smoke checks for this screen live in patient-first-visit.spec.ts.
 * This file goes one layer deeper: it walks a real user through the
 * entire consultation-summary review for ALL FIVE clinical domains in
 * one sweep, then verifies the rated scores actually landed in the
 * Postgres-backed `patient_summary_domain` table via the public REST
 * API.
 *
 * Flow per the product spec:
 *   1. Selection screen (`/`) lists multiple "First Visit" demo links.
 *      Pick one at random so the suite exercises different demo data
 *      across runs and we don't ossify around a single fixture.
 *   2. Land on the first-visit page → "Your Consultation Summary"
 *      header confirms PatientInitialVisitReportV37 mounted.
 *   3. For each of the 5 domain cards (CP / LE / ED / INC / IUS):
 *      a. Click the card to expand its body.
 *      b. Click "View relevant sentences from your visit" to surface
 *         the NLP-selected evidence.
 *      c. Drag every VAS slider inside that section so the patient
 *         "answered" the experimental questions. Sliders are local
 *         state in V37 (prototype), so this is UI-only.
 *      d. Tick checkboxes ("select all that apply") and one radio
 *         per single-select group, same UI-only reasoning.
 *      e. Click the 1–5 NIH PROMIS helpfulness rating. THIS step
 *         hits PUT /api/patient/scoring under the hood —
 *         `handleRatingChange` in V37:2772 calls
 *         `updateSingleClassScore` which fires the API.
 *   4. After all five categories, GET /api/patient/scoring filtered
 *      to the chosen file+speaker and assert each of the five
 *      domains came back with the score we just clicked. That is
 *      the round-trip: click in browser → DB row → API read.
 *
 * Why one big test instead of five small ones:
 *   The user explicitly asked for a single sweep that mirrors a real
 *   patient's consultation review. If one category breaks the test
 *   stops; that is an accepted trade-off because (a) the smoke spec
 *   already provides per-category coverage, and (b) on a real failure
 *   the breakage point is obvious from the Playwright trace.
 *
 * Backend round-trip uses page.request so the call shares the
 * Playwright context (cookies, network errors etc. surface in the
 * same trace). API key comes from the same global-setup hook the
 * survey-submit-flow spec already uses.
 */

// 5 categories × (slider drag + checkbox + radio + rating + animation
// waits) ≈ 60–90 sec. Pad to 3 min so a slow CI runner doesn't trip
// the default 30 sec test timeout.
test.setTimeout(180_000);

const API_BASE = "http://localhost:8000";
const API_KEY = process.env.E2E_API_KEY || process.env.API_KEY || "";
const AUTH_HEADERS = { "X-API-Key": API_KEY };

// Display name used by the V37 component → backend domain key used by
// /api/patient/scoring. Mirrors TOPIC_TO_BACKEND_DOMAIN at V37:77-81.
const TOPICS = [
  { display: "Cancer Prognosis", domain: "cp" },
  { display: "Life Expectancy", domain: "le" },
  { display: "Erectile Dysfunction", domain: "ed" },
  { display: "Urinary Incontinence", domain: "inc" },
  { display: "Irritative Urinary Symptoms", domain: "ius" },
] as const;

// Rating value we click for every category. 4 = "Helpful" on the NIH
// PROMIS unipolar scale (V37:14-15). Picked deliberately mid-positive
// so a stuck UI returning 0 / 5 by default would fail the assertion.
const TARGET_RATING = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a uniformly-random index in [0, n). */
function randIdx(n: number): number {
  return Math.floor(Math.random() * n);
}

/**
 * Drive every visible Radix `[role="slider"]` to a non-zero value.
 * Radix Slider doesn't expose `set value` in JS-land cleanly; the
 * least-flaky path that still moves the thumb is keyboard-arrow
 * navigation after focusing it. We press ArrowRight 60× from the
 * default (0) which lands somewhere mid-range regardless of step
 * size — exact value isn't backend-persisted in V37 so we don't care
 * about pixel-perfect reproducibility, just "the thumb moved".
 */
async function fillVisibleSliders(page: Page) {
  const sliders = page.locator('[role="slider"]:visible');
  const count = await sliders.count();
  for (let i = 0; i < count; i++) {
    const slider = sliders.nth(i);
    await slider.focus();
    // 60 steps gets us roughly to the middle on the default 0–100 scale.
    for (let k = 0; k < 60; k++) await slider.press("ArrowRight");
  }
}

/**
 * Tick the first one or two visible checkboxes ("select all that apply"
 * sections). `force: true` because some shadcn checkboxes hide the
 * native input behind a visual overlay that Playwright considers
 * non-interactable.
 */
async function tickFirstCheckboxes(page: Page) {
  const checkboxes = page.locator('input[type="checkbox"]:visible');
  const count = await checkboxes.count();
  if (count > 0) await checkboxes.first().check({ force: true });
  if (count > 1) await checkboxes.nth(1).check({ force: true });
}

/** Pick the first option in any single-select radio group. */
async function pickFirstRadio(page: Page) {
  const radios = page.locator('input[type="radio"]:visible');
  if ((await radios.count()) > 0) {
    await radios.first().check({ force: true });
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("Patient First Visit — deep flow", () => {
  test("rate every domain on a randomly-picked first-visit and confirm DB persisted", async ({
    page,
  }) => {
    // The backend round-trip step needs a real X-API-Key. global-setup
    // populates process.env from app/Backend/.env.native; if the user
    // didn't run that bootstrap (or no .env.native exists) the value
    // is empty and we skip with a clear reason.
    test.skip(
      !API_KEY,
      "API_KEY not set — load app/Backend/.env.native or export E2E_API_KEY",
    );

    // ── 1. Selection screen → randomly pick a first-visit link ────────
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const firstVisitLinks = page.getByRole("link", {
      name: /First Visit|Patient First Visit/i,
    });
    const linkCount = await firstVisitLinks.count();
    expect(
      linkCount,
      "selection screen must list at least one first-visit link",
    ).toBeGreaterThan(0);

    const idx = randIdx(linkCount);
    const chosenLink = firstVisitLinks.nth(idx);
    const href = await chosenLink.getAttribute("href");
    expect(href, "picked link must have an href").toBeTruthy();

    // Pull fileid + patid out so we can hit the backend with the same
    // ids the page is about to load.
    const url = new URL(href!, "http://localhost");
    const fileid = url.searchParams.get("fileid")!;
    const patid = url.searchParams.get("patid")!;
    expect(fileid, "fileid query param").toBeTruthy();
    expect(patid, "patid query param").toBeTruthy();

    console.log(
      `[deep] picked first-visit ${idx + 1}/${linkCount}  ` +
        `file=${fileid}  speaker=${patid}`,
    );

    await chosenLink.click();

    // ── 2. Confirm V37 mounted ────────────────────────────────────────
    await expect(
      page.getByText("Your Consultation Summary"),
      "V37 header confirms patient first-visit page mounted",
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. Per-category sweep ─────────────────────────────────────────
    for (const { display: topic } of TOPICS) {
      // 3a. Find the category card and click to expand. The card
      // header text is the topic name; first() picks the heading
      // rather than any in-body mention.
      const topicHeader = page.getByText(topic, { exact: true }).first();
      await expect(
        topicHeader,
        `${topic} card header must exist`,
      ).toBeVisible({ timeout: 10_000 });
      await topicHeader.scrollIntoViewIfNeeded();
      await topicHeader.click();
      // Tailwind max-h transition is ~300ms; pad to 800ms.
      await page.waitForTimeout(800);

      // 3b. Click "View relevant sentences from your visit" to surface
      // the NLP evidence. Some demo files don't have evidence to show
      // (the button is then absent), so this is best-effort.
      const viewSentencesBtn = page
        .getByRole("button", {
          name: /View relevant sentences from your visit/i,
        })
        .first();
      const sentencesBtnPresent = await viewSentencesBtn
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      if (sentencesBtnPresent) {
        await viewSentencesBtn.click();
        await page.waitForTimeout(400);
      }

      // 3c-e. Drag sliders, tick checkboxes, pick first radio. These
      // are UI-only in V37 (no API call), but exercising them proves
      // the component handles a "patient filled everything" state
      // without crashing.
      await fillVisibleSliders(page);
      await tickFirstCheckboxes(page);
      await pickFirstRadio(page);

      // 3f. Click the rating. THIS is the backend-persisted action —
      // V37 handleRatingChange → updateSingleClassScore → PUT
      // /api/patient/scoring. aria-label is "Rate {n} - {label}";
      // matching only the prefix keeps us tolerant of label changes.
      const ratingBtn = page
        .getByRole("button", {
          name: new RegExp(`^Rate ${TARGET_RATING} -`, "i"),
        })
        .first();
      await expect(
        ratingBtn,
        `Rate ${TARGET_RATING} button must exist for ${topic}`,
      ).toBeVisible({ timeout: 5_000 });
      await ratingBtn.click();
      // Give the PUT a moment to round-trip before clicking the next
      // category's rating (otherwise sequential PUTs can race against
      // each other on the backend's session boundary).
      await page.waitForTimeout(600);
    }

    // ── 4. Backend round-trip — every domain has the score we set ─────
    const resp = await page.request.get(
      `${API_BASE}/api/patient/scoring` +
        `?file=${encodeURIComponent(fileid)}` +
        `&speaker=${encodeURIComponent(patid)}`,
      { headers: AUTH_HEADERS },
    );
    expect(resp.ok(), `GET /api/patient/scoring should return 200, got ${resp.status()}`).toBeTruthy();

    const body = (await resp.json()) as {
      total: number;
      data: Array<{
        file: string;
        speaker: string;
        scores: Record<string, number | null>;
        average: number | null;
      }>;
    };

    expect(body.total, "scoring response should contain at least one row").toBeGreaterThan(0);

    // The endpoint groups by (file, speaker); we picked exactly one,
    // so there should be a single matching entry.
    const entry = body.data.find(
      (d) => d.file === fileid && d.speaker === patid,
    );
    expect(
      entry,
      `expected scoring data for file=${fileid} speaker=${patid}`,
    ).toBeDefined();

    // Each of the five domains should be present with the rating we
    // just clicked. If V37 ever stops persisting one of them, this
    // assertion is the fastest place that surfaces it.
    for (const { display, domain } of TOPICS) {
      expect(
        entry!.scores[domain],
        `${display} (${domain}) should be persisted at value ${TARGET_RATING}`,
      ).toBe(TARGET_RATING);
    }

    console.log(
      `[deep] all 5 domains persisted at ${TARGET_RATING} for ` +
        `file=${fileid} speaker=${patid}; average=${entry!.average}`,
    );
  });
});
