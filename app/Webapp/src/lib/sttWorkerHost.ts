// Reuse the model between successive sentences, then release its WASM heap.
let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

export function releaseIdleWorker(instance: Worker): void {
  if (worker !== instance) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(disposeSttWorker, 30_000);
}

/** The shared worker, created on first use. */
export function getSttWorker(): Worker {
  clearTimeout(idleTimer);
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
  clearTimeout(idleTimer);
  worker?.terminate();
  worker = null;
}
