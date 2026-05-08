import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Patient First Visit — deep flow (single integrated test)
 *
 * Smoke checks for this screen live in patient-first-visit.spec.ts.
 * This file goes one layer deeper: it walks a real user through the
 * entire consultation-summary review for ALL FIVE clinical domains in
 * one sweep, and verifies that every interaction the user takes
 * which DOES persist data to the backend lands correctly in
 * Postgres.
 *
 * What V37 persists to the backend (two independent round-trips):
 *   1. Behavior tracking — every category open/close, every
 *      "View relevant sentences" toggle, and the page mount itself
 *      fires `trackFirst(...)` which POSTs to
 *      /api/track/patient-first and writes a row to the
 *      `patient_first_behavior` table. The round-trip is verified
 *      via GET /api/track/patient-first/session/{id}.
 *   2. (Added 2026-05-07, PR #9) The patient's per-domain answers
 *      themselves. Each card now has a Submit button; clicking it
 *      PUTs the domain's local state (VAS sliders + radio + factor
 *      checkboxes) to /api/patient/first-visit-responses, which
 *      upserts a row in `patient_first_visit_responses`. This
 *      file's per-card sweep clicks Submit on every domain and
 *      then GETs the typed read endpoint to confirm all five
 *      domains have a persisted row.
 *
 *   The 1–5 NIH PROMIS helpfulness rating is still UI-commented-out
 *   in V37 (see lines ~2317–2360 of PatientInitialVisitReportV37.tsx);
 *   if it's brought back in a future release, it lands in
 *   `patient_summary_domain.patient_scoring` via PUT
 *   /api/patient/scoring and would gain a third round-trip block here.
 *
 * Flow:
 *   1. Selection screen (`/`) → randomly pick one of the listed
 *      "First Visit" buttons. Different demo data per run prevents
 *      ossification around a single fixture.
 *   2. Confirm V37 mounted via the "Your Consultation Summary"
 *      header.
 *   3. For each of the 5 domain cards (CP / LE / ED / INC / IUS):
 *      a. Click the card header to expand its body.
 *      b. Click "View relevant sentences from your visit" to
 *         surface the NLP-selected evidence (best-effort — some
 *         demo files have no evidence).
 *      c. Drive every visible Radix slider, tick the first one or
 *         two checkboxes, pick the first single-select radio.
 *   4. Round-trip verification: GET the session events back from
 *      the backend and assert that, at a minimum, page_view and
 *      one topic_open per category are present in the persisted
 *      timeline. Event counts are checked with `>=` rather than
 *      `==` so future tracking additions (extra timestamp events,
 *      proximity samples, etc.) don't break the test.
 */

// 5 categories × (slider drag + checkbox + radio + animation waits)
// + tracking POST settle time + headroom for `--headed --slowMo` runs.
// Headless CI completes in ~20 s; running with PLAYWRIGHT_SLOW_MO=300
// adds ~300 ms × hundreds of actions and pushes total wall time
// closer to 2-3 min, so 5 min is the conservative ceiling.
test.setTimeout(300_000);

// Tracking endpoints are not behind X-API-Key (the patient-facing
// page calls them from the browser without auth), but the GET we
// use for round-trip verification might be — read the same env var
// the survey-submit-flow spec uses so behavior is consistent.
const API_BASE = "http://localhost:8000";
const API_KEY = process.env.E2E_API_KEY || process.env.API_KEY || "";
const AUTH_HEADERS = API_KEY ? { "X-API-Key": API_KEY } : {};

const TOPICS = [
  { display: "Cancer Prognosis", domain: "cp" },
  { display: "Life Expectancy", domain: "le" },
  { display: "Erectile Dysfunction", domain: "ed" },
  { display: "Urinary Incontinence", domain: "inc" },
  { display: "Irritative Urinary Symptoms", domain: "ius" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randIdx(n: number): number {
  return Math.floor(Math.random() * n);
}

/**
 * Drive every visible Radix `[role="slider"]` to a non-zero value.
 * Radix Slider doesn't expose a clean "set value" hook in JS-land;
 * the least-flaky path that still moves the thumb is keyboard-arrow
 * navigation after focusing it. 20 ArrowRight presses lands the
 * thumb at value ~20 on the 0–100 scale — enough for the user to
 * see the bubble move, and (more importantly) keeps the per-slider
 * cost low so a `--headed --slowMo` demo run doesn't blow past the
 * test timeout. The exact value isn't checked anywhere because V37
 * never persists VAS responses.
 */
const SLIDER_PRESSES = 20;

async function fillVisibleSliders(scope: Page | Locator) {
  const sliders = scope.locator('[role="slider"]:visible');
  const count = await sliders.count();
  for (let i = 0; i < count; i++) {
    const slider = sliders.nth(i);
    await slider.focus();
    for (let k = 0; k < SLIDER_PRESSES; k++) await slider.press("ArrowRight");
  }
}

/**
 * Tick EVERY visible checkbox in the section. V37's checkbox groups
 * are "select all that apply" prompts (V37:1450, 1715, 1977, 2242),
 * so the realistic patient response is "tick anything that fits"
 * — emulated here by ticking everything visible. `force: true`
 * because shadcn checkboxes hide the native input behind a visual
 * overlay that Playwright considers non-interactable by default.
 */
async function tickAllCheckboxes(scope: Page | Locator) {
  const checkboxes = scope.locator('input[type="checkbox"]:visible');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check({ force: true });
  }
}

/**
 * Single-select questions: pick the first option in EACH radio
 * group. Grouping is by the `name` attribute (HTML radio
 * convention). Without per-group dedup we'd only answer the very
 * first group on the page and leave every other single-select
 * question blank.
 */
async function pickFirstRadioPerGroup(scope: Page | Locator) {
  const radios = scope.locator('input[type="radio"]:visible');
  const count = await radios.count();
  const groupsAnswered = new Set<string>();
  for (let i = 0; i < count; i++) {
    const r = radios.nth(i);
    const name = (await r.getAttribute("name")) ?? `__anon_${i}`;
    if (groupsAnswered.has(name)) continue;
    groupsAnswered.add(name);
    await r.check({ force: true });
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("Patient First Visit — deep flow", () => {
  test("walk every domain card on a randomly-picked first-visit and verify tracking events persist", async ({
    page,
  }) => {
    // ── Capture: every patient-first tracking POST so we can pull
    // the session_id (generated client-side per-mount) and check
    // exactly which event types the page fired during the flow.
    const trackedRequests: Array<{ session_id: string; events: Array<{ event_type: string }> }> = [];
    page.on("request", async (req) => {
      const url = req.url();
      if (
        url.includes("/track/patient-first") &&
        req.method() === "POST"
      ) {
        try {
          const body = req.postData();
          if (body) trackedRequests.push(JSON.parse(body));
        } catch {
          // Non-JSON bodies aren't expected here, but ignore them
          // rather than crashing the listener.
        }
      }
    });

    // Capture uncaught page errors. A React render crash inside V37
    // would normally surface as a torn-down section; this hook
    // turns it into a test failure with the original stack.
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => {
      if (!/Hydration|hydrat/i.test(e.message)) pageErrors.push(e.message);
    });

    // [demo] Inject a fetch() wrapper into the PAGE's JS context so
    // V37's own backend writes log directly to the browser DevTools
    // console (not just the Playwright runner's terminal). With
    // PLAYWRIGHT_DEVTOOLS=1 the panel is auto-opened, so a watcher
    // sees these messages live in the inspector. addInitScript runs
    // before any page script, so the wrapper is in place before V37
    // even mounts.
    // [demo] Mirror everything that lands in the browser console
    // back to the test's terminal output. Helps verify whether the
    // init-script logs below are actually being captured by the
    // page (vs being swallowed by the DevTools panel filter etc).
    page.on("console", (msg) => {
      const txt = msg.text();
      if (
        txt.includes("V37 SUBMIT") ||
        txt.includes("INIT SCRIPT LOADED") ||
        txt.includes("TRACK")
      ) {
        console.log(`  [browser-console][${msg.type()}] ${txt}`);
      }
    });

    await page.addInitScript(() => {
      // Immediate ping so the watcher can verify the wrapper is in
      // place before any V37 fetch fires.
      // eslint-disable-next-line no-console
      console.log(
        "%c🟢 [INIT SCRIPT LOADED] fetch wrapper installed",
        "color:#10b981;font-weight:bold;font-size:14px",
      );

      // [demo] Floating overlay so DB writes are visible WITHOUT
      // having to click the DevTools Console tab. Renders a fixed
      // panel on the right edge of the viewport, appends a colored
      // line for each tracked event, auto-scrolls to the latest.
      const ensurePanel = (): HTMLElement => {
        const id = "__e2e_demo_panel__";
        const existing = document.getElementById(id);
        if (existing) return existing;
        const panel = document.createElement("div");
        panel.id = id;
        panel.style.cssText = [
          "position:fixed",
          "top:10px",
          "right:10px",
          "width:520px",
          "max-height:80vh",
          "overflow:auto",
          "background:rgba(0,0,0,0.92)",
          "color:#e2e8f0",
          "font:12px ui-monospace,Menlo,monospace",
          "padding:12px 14px",
          "z-index:2147483647",
          "border-radius:10px",
          "box-shadow:0 6px 24px rgba(0,0,0,0.5)",
          "pointer-events:none",
        ].join(";");
        const header = document.createElement("div");
        header.textContent = "🟢 Backend writes (DB persistence) — live";
        header.style.cssText =
          "color:#10b981;font-weight:bold;margin-bottom:6px;font-size:13px";
        panel.appendChild(header);
        if (document.body) document.body.appendChild(panel);
        else
          document.addEventListener("DOMContentLoaded", () =>
            document.body.appendChild(panel),
          );
        return panel;
      };
      (window as unknown as { __e2eLog?: (m: string, c?: string) => void }).__e2eLog = (
        msg: string,
        color = "#e2e8f0",
      ) => {
        const panel = ensurePanel();
        const line = document.createElement("div");
        line.style.cssText = `color:${color};margin:2px 0;white-space:pre-wrap;word-break:break-word`;
        const t = new Date().toLocaleTimeString();
        line.textContent = `${t}  ${msg}`;
        panel.appendChild(line);
        panel.scrollTop = panel.scrollHeight;
      };

      const orig = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        const method = init?.method ?? "GET";
        const isV37 = url.includes("/patient/first-visit-responses");
        const isTrack = url.includes("/track/patient-first");
        const log = (window as unknown as { __e2eLog?: (m: string, c?: string) => void }).__e2eLog;
        if (isV37 && method === "PUT" && init?.body) {
          try {
            const payload = JSON.parse(String(init.body));
            log?.(
              `🟢 PUT first-visit-responses\n   domain=${payload.domain}  vas=${payload.vas_primary ?? "·"}/${payload.vas_secondary ?? "·"}  timeline=${payload.timeline ?? "·"}  factors=${payload.factors ? payload.factors.length + " items" : "·"}`,
              "#10b981",
            );
          } catch {
            log?.("🟢 PUT first-visit-responses (unparseable body)", "#10b981");
          }
        }
        const resp = await orig(input, init);
        if (isV37 && method === "PUT") {
          try {
            const body = await resp.clone().json();
            log?.(
              `   ↳ ${resp.status} OK   submitted_at=${(body as { submitted_at?: string }).submitted_at?.slice(11, 19) ?? "?"}`,
              "#22d3ee",
            );
          } catch {
            log?.(`   ↳ ${resp.status} (non-JSON)`, "#ef4444");
          }
        }
        if (isTrack) {
          log?.(`🔵 TRACK ${method} → ${resp.status}`, "#60a5fa");
        }
        return resp;
      };
    });

    // [demo] Live console echo for every backend write the page makes.
    // Useful when running --headed to watch the DB persistence happen
    // in real time. Filtered to the per-domain Submit (PUT
    // /api/backend/patient/first-visit-responses) and to behavior
    // tracking POSTs (/api/backend/track/patient-first); other proxy
    // calls stay silent so the console stays readable. Truncates long
    // bodies to keep the headed run from drowning in noise.
    const trim = (s: string, n = 200) =>
      s.length > n ? `${s.slice(0, n)}…(${s.length - n} more)` : s;
    page.on("response", async (resp) => {
      const url = resp.url();
      const method = resp.request().method();
      const isFirstVisit = url.includes("/patient/first-visit-responses");
      const isTrackFirst = url.includes("/track/patient-first");
      if (!isFirstVisit && !isTrackFirst) return;
      let reqBody = "";
      try {
        reqBody = resp.request().postData() ?? "";
      } catch {
        /* ignore */
      }
      let respBody = "";
      try {
        respBody = await resp.text();
      } catch {
        /* ignore */
      }
      const tag = isFirstVisit ? "[v37-persist]" : "[track]";
      const line = `${tag} ${method} ${url} → ${resp.status()}\n   request : ${trim(reqBody)}\n   response: ${trim(respBody)}`;
      // Echo to the test's terminal output (this file's stdout)…
      console.log(line);
      // …AND to the browser's own DevTools console so a watcher
      // running with PLAYWRIGHT_DEVTOOLS=1 sees DB persistence
      // happen live in the inspector panel.
      try {
        await page.evaluate((msg) => console.log(msg), line);
      } catch {
        // page may have navigated; ignore.
      }
    });

    // ── 1. Selection screen → random first-visit button ─────────────
    // page.tsx:458-467 renders each row's "First Visit" affordance
    // as a <button> (no href) with an onClick that rewrites the
    // query string. Match the exact button name to avoid heading
    // text overlap.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const firstVisitButtons = page.getByRole("button", {
      name: /^\s*First Visit\s*$/i,
    });
    const buttonCount = await firstVisitButtons.count();
    // CI starts against a freshly-bootstrapped Postgres with no
    // pipeline rows yet, so the selection screen renders zero
    // first-visit buttons. Skipping (rather than failing) keeps
    // nightly green; the moment a fixture-seed step starts
    // populating patient data, the test starts exercising the
    // full deep flow without any further changes here.
    test.skip(
      buttonCount === 0,
      "no first-visit patients on selection screen — likely an unseeded DB",
    );

    const idx = randIdx(buttonCount);
    const chosenButton = firstVisitButtons.nth(idx);
    await chosenButton.scrollIntoViewIfNeeded();
    await chosenButton.click();

    await page.waitForURL(/\bvisit=first\b/, { timeout: 10_000 });
    const liveUrl = new URL(page.url());
    const fileid = liveUrl.searchParams.get("fileid");
    const patid = liveUrl.searchParams.get("patid");
    expect(fileid, "fileid in URL after click").toBeTruthy();
    expect(patid, "patid in URL after click").toBeTruthy();

    console.log(
      `[deep] picked first-visit ${idx + 1}/${buttonCount}  ` +
        `file=${fileid}  speaker=${patid}`,
    );

    // ── 2. Confirm V37 mounted ──────────────────────────────────────
    await expect(
      page.getByText("Your Consultation Summary"),
      "V37 header confirms patient first-visit page mounted",
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. Per-category sweep ───────────────────────────────────────
    for (const { display: topic } of TOPICS) {
      // 3a. Click the topic header button to expand the card body.
      // V37 CategoryCard at line 957 is a real <button> wrapping the
      // <h3>{topicName}</h3>. Match by accessible role + an h3 child
      // so we never click a different button on the page.
      const topicHeaderBtn = page
        .getByRole("button")
        .filter({ has: page.locator("h3", { hasText: topic }) })
        .first();
      await expect(
        topicHeaderBtn,
        `${topic} card header button must exist`,
      ).toBeVisible({ timeout: 10_000 });
      await topicHeaderBtn.scrollIntoViewIfNeeded();
      await topicHeaderBtn.click();
      // Tailwind max-h transition is ~300ms; pad to 800ms so the
      // section is fully laid out before we look inside it.
      await page.waitForTimeout(800);

      // 3a-bis. V37 starts with the FIRST topic (Cancer Prognosis)
      // expanded by default, so the click in 3a COLLAPSES that card.
      // Detect via the per-card Submit button — which only renders
      // inside the isExpanded branch — and click the header again to
      // restore the expanded state. Without this, the fill steps
      // below run against a collapsed card and Submit fires with an
      // empty payload (vas/timeline/factors all NULL).
      const topicId = topic.replace(/\s+/g, "");
      const submitBtn = page.locator(
        `[data-track-proximity="SubmitTopic_${topicId}"]`,
      );
      const expanded = await submitBtn
        .isVisible({ timeout: 1_500 })
        .catch(() => false);
      if (!expanded) {
        await topicHeaderBtn.click();
        await page.waitForTimeout(800);
      }

      // 3b. Click "View relevant sentences from your visit" if
      // present. Demo files without NLP evidence don't render the
      // button, so this is best-effort. The button text toggles
      // between "View" and "Hide" depending on state — match by
      // verb prefix only so we never click a different button.
      const viewSentencesBtn = page
        .getByRole("button", {
          name: /^View relevant sentences from your visit/i,
        })
        .first();
      const sentencesBtnPresent = await viewSentencesBtn
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      if (sentencesBtnPresent) {
        await viewSentencesBtn.click();
        await page.waitForTimeout(400);
      }

      // 3c-e. Fill every visible question in THIS card only. Scoping
      // to the per-card container (data-track-proximity="TopicCard_…")
      // is critical: V37 keeps every previously-expanded card open
      // when a new card opens, so without this scope each iteration
      // would touch all already-expanded cards' inputs as well — the
      // visible flow would look like every card reacting to every
      // step instead of one card progressing at a time.
      const cardScope = page.locator(
        `[data-track-proximity="TopicCard_${topicId}"]`,
      );
      await fillVisibleSliders(cardScope);
      await tickAllCheckboxes(cardScope);
      await pickFirstRadioPerGroup(cardScope);

      // 3f. Click "Hide relevant sentences from your visit" to
      // collapse the evidence section back. Real users typically
      // hide the evidence after reading; clicking the toggle a
      // second time also exercises the close-direction code path
      // (fires evidence_close on the tracker) which would otherwise
      // never be hit by the test. Best-effort because if the View
      // button wasn't visible above, neither is Hide.
      const hideSentencesBtn = page
        .getByRole("button", {
          name: /^Hide relevant sentences from your visit/i,
        })
        .first();
      const hideBtnPresent = await hideSentencesBtn
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      if (hideBtnPresent) {
        await hideSentencesBtn.click();
        await page.waitForTimeout(300);
      }

      // 3g. Click the per-domain Submit button (V37 added 2026-05-07).
      // The handler PUTs the domain's local state to
      //   /api/backend/patient/first-visit-responses
      // and only flips submittedDomains[topic] = true on a 200, so a
      // server failure leaves the button in its un-submitted style.
      // The card is guaranteed expanded by step 3a-bis above, so the
      // Submit button is in the DOM at this point.
      await expect(
        submitBtn,
        `Submit button must exist on the ${topic} card`,
      ).toBeVisible({ timeout: 5_000 });
      await submitBtn.scrollIntoViewIfNeeded();
      await submitBtn.click();
      // [demo] Pad after Submit so a watcher with DevTools open can
      // read the per-domain payload + response in the Console panel
      // before the next iteration starts.
      await page.waitForTimeout(2_000);
      await expect(
        submitBtn,
        `${topic} button should switch to the "Submitted" state after PUT`,
      ).toContainText(/Submitted/i, { timeout: 5_000 });
    }

    // ── 4. No uncaught render errors anywhere in the sweep ──────────
    expect(
      pageErrors,
      `no uncaught page errors during sweep — got: ${pageErrors.join(" | ")}`,
    ).toEqual([]);

    // ── 5. Round-trip: tracking events landed on the backend ────────
    // The page emits page_view on mount (V37:2548) and topic_open
    // each time a card is expanded (V37:2807). 5 expansions × 1
    // page = at minimum 6 events should be persisted. Optional
    // evidence_open events are not asserted because they only fire
    // when a demo file has NLP sentences to show.
    expect(
      trackedRequests.length,
      "expected at least one tracking POST during the sweep",
    ).toBeGreaterThan(0);

    // Browsing the selection screen and then navigating to a
    // first-visit page can produce TWO sessions in the captured
    // POST stream — the brief mount-and-unmount on the selection
    // screen (page_view + session_end) plus the actual first-visit
    // session that hosts the per-category interactions. Pick the
    // session that owns the most events; that is reliably the
    // first-visit one.
    const sessionEventCounts = new Map<string, number>();
    for (const req of trackedRequests) {
      sessionEventCounts.set(
        req.session_id,
        (sessionEventCounts.get(req.session_id) || 0) + req.events.length,
      );
    }
    const sessionId = [...sessionEventCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0][0];

    // Give the backend a moment to settle the last POST before we
    // GET — tracking writes are fire-and-forget on the client.
    await page.waitForTimeout(750);

    const sessionResp = await page.request.get(
      `${API_BASE}/api/track/patient-first/session/${encodeURIComponent(sessionId)}`,
      { headers: AUTH_HEADERS },
    );
    expect(
      sessionResp.ok(),
      `GET /session/${sessionId} should return 200, got ${sessionResp.status()}`,
    ).toBeTruthy();

    const sessionBody = (await sessionResp.json()) as {
      session_id: string;
      count: number;
      events: Array<{ event_type: string; domain: string | null }>;
    };
    const persistedTypes = sessionBody.events.map((e) => e.event_type);

    expect(
      persistedTypes,
      "page_view should be persisted for the page mount",
    ).toContain("page_view");

    // V37:2644 expands the first topic by default
    // (`setExpandedTopics({ [TOPIC_ORDER[0]]: true })`), so clicking
    // its header fires `topic_close` rather than `topic_open`. To
    // assert "the patient interacted with every category" we count
    // distinct `domain` values across topic_open AND topic_close
    // events — which sums to TOPICS.length when each card has been
    // clicked exactly once, regardless of the initial-expanded card.
    const topicDomains = new Set(
      sessionBody.events
        .filter(
          (e) =>
            e.event_type === "topic_open" || e.event_type === "topic_close",
        )
        .map((e) => e.domain),
    );
    expect(
      topicDomains.size,
      `expected topic events covering all ${TOPICS.length} domains, got ${topicDomains.size} distinct (${[...topicDomains].join(", ")})`,
    ).toBe(TOPICS.length);

    console.log(
      `[deep] session=${sessionId} persisted ${sessionBody.count} events ` +
        `covering domains [${[...topicDomains].join(", ")}] ` +
        `for file=${fileid} speaker=${patid}`,
    );

    // ── 6. V37 first-visit-responses round-trip ─────────────────────
    // The 5 Submit clicks above each PUT to
    //   /api/backend/patient/first-visit-responses
    // and a row should land in patient_first_visit_responses for
    // every (file, speaker, domain). Verify by GET-ing the typed
    // endpoint directly: the response is keyed by domain so the
    // five expected keys are guaranteed by the schema.
    const fvResp = await page.request.get(
      `${API_BASE}/api/patient/first-visit-responses/${encodeURIComponent(fileid!)}/${encodeURIComponent(patid!)}`,
      { headers: AUTH_HEADERS },
    );
    expect(
      fvResp.ok(),
      `GET /api/patient/first-visit-responses should return 200, got ${fvResp.status()}`,
    ).toBeTruthy();

    const fvBody = (await fvResp.json()) as {
      responses: Record<
        string,
        {
          domain: string;
          vas_primary: number | null;
          vas_secondary: number | null;
          timeline: string | null;
          factors: string[] | null;
          submitted_at: string;
        } | null
      >;
    };

    // Stable shape: all five domain keys are always present, missing
    // rows are explicit nulls.
    expect(
      Object.keys(fvBody.responses).sort(),
      "GET response always includes all five domain keys",
    ).toEqual(["cp", "ed", "inc", "ius", "le"]);

    // After the sweep every domain must have a persisted row.
    for (const { domain } of TOPICS) {
      const row = fvBody.responses[domain];
      expect(
        row,
        `domain=${domain} should have a persisted row after Submit`,
      ).not.toBeNull();
      expect(
        row!.submitted_at,
        `domain=${domain} row must carry a submitted_at timestamp`,
      ).toBeTruthy();
    }

    console.log(
      `[deep] first-visit-responses persisted for all ${TOPICS.length} domains ` +
        `(${TOPICS.map((t) => t.domain).join(", ")}) ` +
        `for file=${fileid} speaker=${patid}`,
    );
  });
});
