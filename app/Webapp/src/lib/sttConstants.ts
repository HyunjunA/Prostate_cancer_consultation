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
export const VOICE_INPUT_ENABLED = false;

/**
 * Model that turns speech into text. Moonshine takes variable-length audio, so a
 * 5-second sentence costs 5 seconds of encoder work; Whisper pads every input to
 * 30 seconds regardless. Short dictation is exactly Moonshine's case.
 *
 * Swapping in Whisper is a one-line change — the pipeline API is identical:
 *   "onnx-community/whisper-base"     multilingual, stronger punctuation
 *   "onnx-community/whisper-tiny.en"  English only, smallest Whisper
 */
export const STT_MODEL_ID = "onnx-community/moonshine-base-ONNX";

/** Voice activity detection model — decides where a spoken sentence ends. */
export const VAD_MODEL_ID = "onnx-community/silero-vad";

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

/** Size of the buffers arriving from the audio worklet. */
export const NEW_BUFFER_SIZE = 512;

/** How many pre-speech buffers to keep, so a chunk can be padded at the front. */
export const MAX_NUM_PREV_BUFFERS = Math.ceil(
  SPEECH_PAD_SAMPLES / NEW_BUFFER_SIZE,
);

/** Messages the STT worker posts back to the main thread. */
export type SttWorkerMessage =
  | { type: "loading"; message: string }
  | { type: "progress"; progress: number }
  | { type: "ready" }
  | { type: "speech"; active: boolean }
  | { type: "text"; text: string }
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
