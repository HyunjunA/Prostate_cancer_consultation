import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/**
 * Does the Re-write Practice dictation button work outside Chromium?
 *
 * The feature leans on four things that are not uniformly old: a secure
 * context for getUserMedia, an AudioWorklet, a module Worker, and
 * onnxruntime-web's WebAssembly backend. Any one of them missing turns the
 * button into dead weight in that browser, and none of it is visible from
 * reading the code — so this spec runs the whole path in Chromium, Firefox and
 * WebKit and reports what each engine actually did.
 *
 * ── Why a fake stream rather than a fake microphone ──────────────────────────
 * Chromium can be handed a WAV file with --use-file-for-fake-audio-capture, but
 * that flag does not exist in Firefox or WebKit, and Firefox's own fake device
 * emits a tone rather than speech (the VAD correctly refuses to call it a
 * sentence, so nothing is ever transcribed). Instead getUserMedia is replaced
 * before the app loads with a MediaStream fed from a decoded WAV. That is
 * engine-neutral, needs no launch flags and no permission prompt, and exercises
 * every layer the real microphone would except the capture driver itself.
 *
 * ── Running it ───────────────────────────────────────────────────────────────
 *   VOICE_TEST_URL='https://<host>:3443/?doctorid=…&f=…' \
 *     npx playwright test --config e2e/playwright.voice.config.ts
 *
 * The URL must be https or localhost. Over plain http the button is disabled by
 * design in every browser, which the spec asserts rather than skips. The URL is
 * supplied by the operator and never committed: it carries a de-identified
 * study token, which belongs in nobody's git history.
 */

const TARGET = process.env.VOICE_TEST_URL;

// Public-domain speech. Any mono WAV works; override for another language or a
// longer sample. Must not be a real consultation recording.
const AUDIO_FILE = process.env.VOICE_TEST_AUDIO ?? "/tmp/jfk.wav";
const AUDIO_ROUTE = "**/__stt_test_audio.wav";

/** Feature probes, run in the page before anything is clicked. */
type Capabilities = {
  isSecureContext: boolean;
  getUserMedia: boolean;
  audioWorklet: boolean;
  moduleWorker: boolean;
  wasm: boolean;
  wasmSimd: boolean;
  cacheApi: boolean;
  crossOriginIsolated: boolean;
  audioContextSampleRate: number | null;
  hardwareConcurrency: number;
};

async function probeCapabilities(page: Page): Promise<Capabilities> {
  return page.evaluate(async () => {
    // The canonical SIMD detection module: one v128 local, which a runtime
    // without SIMD refuses to validate.
    const simdModule = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10,
      1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]);

    let moduleWorker = false;
    try {
      const blob = new Blob(["export {};"], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const w = new Worker(url, { type: "module" });
      w.terminate();
      URL.revokeObjectURL(url);
      moduleWorker = true;
    } catch {
      moduleWorker = false;
    }

    // The hook asks for a 16 kHz context. Some engines quietly ignore the hint
    // and hand back the hardware rate, which is fine — the worklet resamples —
    // but it is worth recording which ones do.
    let audioContextSampleRate: number | null = null;
    try {
      const ac = new AudioContext({ sampleRate: 16000 });
      audioContextSampleRate = ac.sampleRate;
      await ac.close();
    } catch {
      audioContextSampleRate = null;
    }

    return {
      isSecureContext: window.isSecureContext,
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      audioWorklet: typeof AudioWorkletNode !== "undefined",
      moduleWorker,
      wasm: typeof WebAssembly !== "undefined",
      wasmSimd: typeof WebAssembly !== "undefined" && WebAssembly.validate(simdModule),
      cacheApi: typeof caches !== "undefined",
      crossOriginIsolated: !!window.crossOriginIsolated,
      audioContextSampleRate,
      hardwareConcurrency: navigator.hardwareConcurrency,
    };
  });
}

/**
 * Replaces the microphone with a looping WAV and records every message the STT
 * worker posts back, with timestamps. Must run before the app's scripts do.
 */
async function installFakeMicAndWorkerTap(page: Page): Promise<void> {
  await page.route(AUDIO_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: fs.readFileSync(AUDIO_FILE),
    }),
  );

  await page.addInitScript(() => {
    // Skip the guided tour: its overlay swallows the click on the mic button.
    // Version numbers, not booleans — see TOUR_VERSIONS in OnboardingTour.tsx.
    localStorage.setItem(
      "physician-dashboard-tour-completed",
      JSON.stringify({ dashboard: 1, grid: 1, detail: 2 }),
    );

    interface SttEvent {
      t: number;
      type: string;
      active?: boolean;
      text?: string;
      message?: string;
    }
    (window as unknown as { __sttLog: SttEvent[] }).__sttLog = [];

    // Tap the worker's outbound messages. The app already posts exactly the two
    // events a latency measurement needs — {type:"speech",active:false} when the
    // VAD closes a sentence, {type:"text"} when the model returns — so nothing
    // has to be instrumented in application code.
    const NativeWorker = window.Worker;
    const Tapped = function (this: unknown, ...args: [string | URL, WorkerOptions?]) {
      const worker = new NativeWorker(...args);
      worker.addEventListener("message", (event: MessageEvent) => {
        const d = event.data ?? {};
        if (["ready", "text", "speech", "error"].includes(d.type)) {
          (window as unknown as { __sttLog: SttEvent[] }).__sttLog.push({
            t: performance.now(),
            type: d.type,
            active: d.active,
            text: d.text,
            message: d.message,
          });
        }
      });
      return worker;
    } as unknown as typeof Worker;
    Tapped.prototype = NativeWorker.prototype;
    window.Worker = Tapped;

    if (!navigator.mediaDevices) return;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        // Created inside the call, which happens on the button click, so the
        // context starts in a user gesture and no autoplay policy blocks it.
        const ac = new AudioContext();
        await ac.resume();
        const response = await fetch("/__stt_test_audio.wav");
        const decoded = await ac.decodeAudioData(await response.arrayBuffer());
        const source = ac.createBufferSource();
        source.buffer = decoded;
        source.loop = true;
        const destination = ac.createMediaStreamDestination();
        source.connect(destination);
        source.start();
        return destination.stream;
      },
    });
  });
}

/**
 * Clicks through to a domain detail view, where the rewrite panel lives.
 *
 * Each control is waited for rather than slept on: the patient list and the
 * domain table both arrive from the backend, and how long that takes differs
 * per engine — a fixed delay that is comfortable in Chromium is a flake in
 * WebKit.
 */
async function openRewritePanel(page: Page): Promise<void> {
  const anchor = page.locator("[data-tour='rewrite-voice-button']");

  // How many clicks it takes depends on where the URL lands: a bare ?doctorid
  // opens the patient list and needs "View Report" first, while a URL carrying
  // ?f= drops straight onto the domain grid. Rather than encode either shape,
  // click whichever of the two controls is on screen until the panel appears.
  for (let hop = 0; hop < 4; hop++) {
    if (await anchor.isVisible().catch(() => false)) return;
    const step = page
      .locator('button:has-text("View Report"), button:has-text("Cancer Prognosis")')
      .first();
    await step.waitFor({ state: "visible", timeout: 30_000 });
    await step.click();
    await page.waitForTimeout(1500);
  }

  await anchor.waitFor({ state: "visible", timeout: 30_000 });
}

test.describe("Re-write dictation, per browser engine", () => {
  test.skip(!TARGET, "set VOICE_TEST_URL to the dashboard URL to run this");
  test.skip(
    !fs.existsSync(AUDIO_FILE),
    `test audio not found at ${AUDIO_FILE} — set VOICE_TEST_AUDIO`,
  );

  test("loads both models and transcribes a spoken sentence", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);

    const engine = testInfo.project.name;
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await installFakeMicAndWorkerTap(page);
    await page.goto(TARGET!, { waitUntil: "domcontentloaded" });

    const capabilities = await probeCapabilities(page);
    console.log(`\n[${engine}] capabilities`, capabilities);

    // Everything downstream is meaningless without these two, and their absence
    // is a property of how the page was reached, not of the browser.
    expect(capabilities.isSecureContext, "page must be https or localhost").toBe(true);
    expect(capabilities.getUserMedia).toBe(true);
    expect(capabilities.audioWorklet, "AudioWorklet carries the 512-sample framing").toBe(true);
    expect(capabilities.moduleWorker, "the STT worker is a module worker").toBe(true);
    expect(capabilities.wasm).toBe(true);

    await openRewritePanel(page);

    const mic = page.locator("[data-tour='rewrite-voice-button'] button").first();
    await expect(mic).toBeVisible();
    await expect(mic, "button should be enabled in a secure context").toBeEnabled();

    const textarea = page.locator("textarea").first();
    await textarea.fill("");
    await mic.click();

    // First the models have to arrive — ~123 MB on a cold cache — and only then
    // can a sentence be transcribed. Two waits, so a failure says which half.
    await page.waitForFunction(
      () =>
        (window as unknown as { __sttLog: { type: string }[] }).__sttLog.some(
          (e) => e.type === "ready" || e.type === "error",
        ),
      undefined,
      { timeout: 120_000 },
    );

    await page.waitForFunction(
      () =>
        (window as unknown as { __sttLog: { type: string }[] }).__sttLog.some(
          (e) => e.type === "text" || e.type === "error",
        ),
      undefined,
      { timeout: 120_000 },
    );

    const log = await page.evaluate(
      () => (window as unknown as { __sttLog: Record<string, unknown>[] }).__sttLog,
    );
    const workerError = log.find((e) => e.type === "error");
    expect(workerError, `worker reported: ${workerError?.message}`).toBeUndefined();

    const transcript = (await textarea.inputValue()).trim();
    console.log(`[${engine}] transcript: ${transcript.slice(0, 120)}`);
    expect(transcript.length, "the textarea should hold recognised speech").toBeGreaterThan(10);

    await testInfo.attach(`${engine}-stt-log.json`, {
      body: JSON.stringify({ capabilities, log, transcript }, null, 2),
      contentType: "application/json",
    });

    // A clean console matters here: onnxruntime falling back or a worklet
    // failing to register shows up as a logged error long before it shows up
    // as a missing transcript.
    const relevant = consoleErrors.filter((e) => !/favicon|net::ERR_ABORTED/i.test(e));
    if (relevant.length) console.log(`[${engine}] console errors:`, relevant);
  });

  test("says why it is unavailable over plain http", async ({ page }) => {
    const insecure = TARGET!.replace(/^https:/, "http:").replace(":3443", ":3001");
    test.skip(insecure === TARGET, "no plain-http equivalent of this URL");

    await installFakeMicAndWorkerTap(page);
    await page.goto(insecure, { waitUntil: "domcontentloaded" });
    await openRewritePanel(page);

    const mic = page.locator("[data-tour='rewrite-voice-button'] button").first();
    await expect(mic).toBeVisible();
    await expect(mic, "no secure context means no microphone, in any browser").toBeDisabled();
    await expect(mic).toHaveText(/Voice unavailable/i);

    // The point of the disabled state is that typing is untouched.
    const textarea = page.locator("textarea").first();
    await textarea.fill("typing still works");
    expect(await textarea.inputValue()).toBe("typing still works");
  });
});
