/**
 * Owner of the speech-to-text worker's lifetime.
 *
 * The worker is created once per page visit and then kept, because creating it
 * is what costs: the weights are already in the browser's Cache API after the
 * first visit, but every fresh worker still has to read ~123 MB back, rebuild
 * both ONNX sessions and run a warm-up inference — measured at ~3.3 s on the
 * deployment, every single time. Terminating it at the end of each dictation
 * made a doctor pay that again for every sentence.
 *
 * What is deliberately NOT tied to this module: the microphone and the
 * AudioContext. Those are released the moment dictation stops, by the hook that
 * opened them — holding the worker must never mean holding the microphone.
 *
 * The cost of keeping it is memory: roughly 700 MB resident while the models are
 * loaded, held until the tab is closed or reloaded. That trade was made
 * knowingly; see docs/architecture/SPEECH_TO_TEXT.md.
 */

let worker: Worker | null = null;

/** The shared worker, created on first use. */
export function getSttWorker(): Worker {
  worker ??= new Worker(new URL("../workers/stt.worker.ts", import.meta.url), {
    type: "module",
  });
  return worker;
}

/**
 * Throw the worker away, so the next dictation builds a fresh one.
 *
 * Only for the case where it has failed in a way it cannot recover from — a
 * module that would not construct, an uncaught exception. Load failures are not
 * that: the worker clears its own load promise and retries on the next attempt,
 * so a network blip does not cost a rebuild.
 */
export function disposeSttWorker(): void {
  worker?.terminate();
  worker = null;
}
