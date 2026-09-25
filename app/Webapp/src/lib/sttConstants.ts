/**
 * Tuning constants for the in-browser speech-to-text used by Re-write Practice.
 *
 * Everything here runs client-side: microphone audio becomes text inside the
 * browser and never leaves the machine. That is the whole reason this feature
 * can exist without a BAA — no consultation audio reaches a third party, and the
 * backend neither receives nor stores any.
 *
 * Ported from the Transformers.js `moonshine-web` example (src/constants.js).
 */

/**
 * Master switch for the Re-write Practice dictation button.
 *
 * `false` takes the Speak button off the screen and drops its step from the
 * guided tour; nothing else changes, and the models are never fetched because
 * they only load on a click that can no longer happen. Flip this one value to
 * `true` to put the feature back — there is nothing else to uncomment.
 */
export const VOICE_INPUT_ENABLED = true;

/**
 * Model that turns speech into text. Moonshine takes variable-length audio, so a
 * 5-second sentence costs 5 seconds of encoder work; Whisper pads every input to
 * 30 seconds regardless. Short dictation is exactly Moonshine's case.
 *
 * Swapping in Whisper is one line *here* — the pipeline API is identical:
 *   "onnx-community/whisper-base"     multilingual, stronger punctuation
 *   "onnx-community/whisper-tiny.en"  English only, smallest Whisper
 *
 * but not one line overall: remote loading is off, so the new repo's files must
 * be added to the manifest in scripts/fetch-stt-assets.sh and re-fetched, or the
 * feature fails closed on the first click. Whisper also has no equivalent of the
 * Moonshine token heuristic documented below, so maxNewTokensFor() would need
 * revisiting. See docs/architecture/SPEECH_TO_TEXT.md §5.4.
 */
export const STT_MODEL_ID = "onnx-community/moonshine-base-ONNX";

/** Voice activity detection model — decides where a spoken sentence ends. */
export const VAD_MODEL_ID = "onnx-community/silero-vad";

/**
 * Where the browser loads model weights from. Both models are served by the
 * COMPASS server out of `public/stt-models/`, not fetched from huggingface.co,
 * so no third-party origin is contacted and no request metadata — IP, timing,
 * user agent — is disclosed to one.
 *
 * Populate it with `bash scripts/fetch-stt-assets.sh`. Changing either model id
 * above means re-running that script with the new files added to its manifest;
 * remote loading is disabled, so a file that is not on disk is an error rather
 * than a silent fall back to the internet.
 */
export const STT_MODEL_PATH = "/stt-models/";

/**
 * Where the browser loads the ONNX Runtime WASM binaries from. Same reasoning,
 * different vendor: the default is a jsDelivr URL, which is a second
 * third-party origin executing code in the clinician's tab.
 */
export const STT_WASM_PATH = "/stt-wasm/";

/** Sample rate of the audio. The same for both models, as it happens. */
export const SAMPLE_RATE = 16000;
export const SAMPLE_RATE_MS = SAMPLE_RATE / 1000;

/** Probabilities ABOVE this value are considered SPEECH. */
export const SPEECH_THRESHOLD = 0.3;

/**
 * If the current state is SPEECH and the probability of the next frame is below
 * this value, it is considered NON-SPEECH.
 */
export const EXIT_THRESHOLD = 0.1;

/**
 * After each speech chunk, wait for at least this much silence before treating
 * what follows as a new sentence. Long enough that a breath mid-sentence does
 * not split the transcript in two.
 */
export const MIN_SILENCE_DURATION_MS = 400;
export const MIN_SILENCE_DURATION_SAMPLES =
  MIN_SILENCE_DURATION_MS * SAMPLE_RATE_MS;

/** Pad the speech chunk with this much audio on each side. */
export const SPEECH_PAD_MS = 80;
export const SPEECH_PAD_SAMPLES = SPEECH_PAD_MS * SAMPLE_RATE_MS;

/** Final speech chunks below this duration are discarded as noise. */
export const MIN_SPEECH_DURATION_SAMPLES = 250 * SAMPLE_RATE_MS; // 250 ms

/** Maximum duration of audio the transcriber handles in one go, in seconds. */
export const MAX_BUFFER_DURATION = 30;

/**
 * Ceiling on the tokens Moonshine may emit for one captured sentence.
 *
 * Transformers.js applies its own heuristic when none is supplied —
 * `Math.floor(seconds) * 6` in `_call_moonshine` (pipelines.js) — taken from the
 * Moonshine paper, where it exists to stop the decoder looping on repeated
 * output. Two things make it cut real speech short here:
 *
 *   - It floors *whole seconds*. Our shortest capture is 250 ms of speech plus
 *     400 ms of trailing silence, 80 ms of pad and 3 pre-roll frames — about
 *     826 ms, which floors to 0 and allows **zero** tokens. A doctor who says
 *     "Correct." gets nothing at all, silently.
 *   - 6 tokens per second is below a brisk speaker. A trailing fragment split
 *     off by a pause ("and that's the main concern", ~8 tokens in 1.6 s) is
 *     allowed only 6, so its last words are dropped.
 *
 * Passing an explicit value overrides the heuristic: `_call_moonshine` spreads
 * caller kwargs *after* its own default. The floor is what fixes short captures;
 * the rate is what fixes fast ones. Both are deliberately generous — the cost of
 * being too high is a slightly longer decode on a sentence that ends early
 * anyway, while the cost of being too low is silently losing the doctor's words.
 */
export const TOKENS_PER_SECOND = 8;
export const MIN_NEW_TOKENS = 24;

/** The bound actually passed to the transcriber, for a buffer of `samples`. */
export function maxNewTokensFor(samples: number): number {
  const seconds = samples / SAMPLE_RATE;
  return Math.max(MIN_NEW_TOKENS, Math.ceil(seconds * TOKENS_PER_SECOND));
}

/** Size of the buffers arriving from the audio worklet. */
export const NEW_BUFFER_SIZE = 512;

/** How many pre-speech buffers to keep, so a chunk can be padded at the front. */
export const MAX_NUM_PREV_BUFFERS = Math.ceil(
  SPEECH_PAD_SAMPLES / NEW_BUFFER_SIZE,
);

/**
 * The pieces of the first-click load, in the order the modal lists them.
 *
 * Deliberately not a single aggregated percentage. The load is several files
 * fetched partly in parallel, so one combined bar either jumps backwards or has
 * to pretend it knows the total before any server has said so. Naming what is
 * being fetched is both honest and more useful: a doctor who sees "Speech model
 * · encoder 48 / 81 MB" knows what is taking the time.
 */
export type SttAssetId = "vad" | "encoder" | "decoder" | "warmup";

/** Fixed display order — rows appear greyed out before they start. */
export const STT_ASSET_ORDER: readonly SttAssetId[] = [
  "vad",
  "encoder",
  "decoder",
  "warmup",
];

export const STT_ASSET_LABELS: Record<SttAssetId, string> = {
  vad: "Voice detector",
  encoder: "Speech model · encoder",
  decoder: "Speech model · decoder",
  warmup: "Warming up",
};

export interface SttAssetProgress {
  id: SttAssetId;
  /** Bytes received. Always 0 for `warmup`, which has no bytes to count. */
  loaded: number;
  /** Bytes expected, or 0 until the server has sent a `Content-Length`. */
  total: number;
  done: boolean;
}

/**
 * Which row of the loading modal a Transformers.js progress event belongs to.
 *
 * The library reports per *file*, including the handful of JSON configs that
 * are a few kB each. Those return `null`: a row that appears and completes in
 * the same frame reads as a glitch, and they are rounding error next to the
 * weights.
 */
export function sttAssetIdFor(repoId: string, file: string): SttAssetId | null {
  if (!file.includes(".onnx")) return null;
  if (repoId === VAD_MODEL_ID) return "vad";
  if (file.includes("encoder_model")) return "encoder";
  if (file.includes("decoder_model")) return "decoder";
  return null;
}

/** Messages the STT worker posts back to the main thread. */
export type SttWorkerMessage =
  | { type: "loading"; message: string }
  // One row of the loading modal, complete each time — the worker keeps the
  // running byte tally so the page never has to merge partial updates.
  | { type: "asset"; asset: SttAssetProgress }
  | { type: "ready" }
  | { type: "speech"; active: boolean }
  | { type: "text"; text: string }
  // Everything still buffered when the doctor pressed Stop has been transcribed
  // and delivered. Only after this is it safe to detach from the worker.
  | { type: "flushed" }
  | { type: "error"; message: string };

/**
 * Append a transcribed chunk to whatever the doctor has already written, so
 * dictation adds to the box instead of replacing it. Kept here (not in the hook)
 * because it is the one piece of this feature worth unit-testing on its own.
 */
export function appendTranscript(previous: string, chunk: string): string {
  const addition = chunk.trim();
  if (!addition) return previous;
  const base = previous.replace(/\s+$/, "");
  if (!base) return addition;
  // No space before a clause-closing mark the model emitted on its own.
  return /^[,.!?;:]/.test(addition)
    ? `${base}${addition}`
    : `${base} ${addition}`;
}
