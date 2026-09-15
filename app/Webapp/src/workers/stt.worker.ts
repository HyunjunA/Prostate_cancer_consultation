/**
 * Speech-to-text worker for Re-write Practice.
 *
 * Owns both models and all inference, off the UI thread:
 *   1. Silero VAD scores every 512-sample frame for "is this speech?", which is
 *      how a spoken sentence's start and end are found.
 *   2. Moonshine transcribes each completed sentence.
 *
 * Audio never leaves this worker — the only thing that crosses back to the page
 * is the recognised text, and nothing is sent to the backend or to any third
 * party. See src/lib/sttConstants.ts for why that matters here.
 *
 * Ported from the Transformers.js `moonshine-web` example (src/worker.js). The
 * example's top-level `await` is wrapped in an init function instead, so the
 * module does not depend on the bundler enabling top-level await.
 */

import { AutoModel, Tensor, pipeline } from "@huggingface/transformers";

import {
  EXIT_THRESHOLD,
  MAX_BUFFER_DURATION,
  MAX_NUM_PREV_BUFFERS,
  MIN_SILENCE_DURATION_SAMPLES,
  MIN_SPEECH_DURATION_SAMPLES,
  SAMPLE_RATE,
  SPEECH_PAD_SAMPLES,
  SPEECH_THRESHOLD,
  STT_MODEL_ID,
  VAD_MODEL_ID,
  type SttWorkerMessage,
} from "@/lib/sttConstants";

// The worker global. Typed locally rather than via lib "webworker", which this
// project's tsconfig does not include (lib is dom/dom.iterable/esnext).
type WorkerScope = {
  postMessage(message: SttWorkerMessage): void;
  onmessage: ((event: MessageEvent) => void) | null;
};
const ctx = self as unknown as WorkerScope;

const post = (message: SttWorkerMessage) => ctx.postMessage(message);

// ── Models ───────────────────────────────────────────────────────────────────

/** Silero VAD returns the updated recurrent state alongside the speech score. */
type VadOutput = { stateN: Tensor; output: Tensor };
type VadModel = (inputs: Record<string, Tensor>) => Promise<VadOutput>;
type Transcriber = (audio: Float32Array) => Promise<{ text: string }>;

let vad: VadModel | null = null;
let transcriber: Transcriber | null = null;
let loading: Promise<void> | null = null;
// Set once both models are live. The worker outlives a single dictation, so a
// later "load" has to be answered with "ready" rather than silently doing
// nothing — the page is waiting on that message to enable the button.
let isLoaded = false;

async function supportsWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return (await gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}

// The encoder stays full precision either way; only the decoder is quantized,
// and how far depends on the backend. q4 is a WebGPU-only win — on WASM it is
// slower than q8 and, on some builds, unsupported.
const DEVICE_DTYPE = {
  webgpu: { encoder_model: "fp32", decoder_model_merged: "q4" },
  wasm: { encoder_model: "fp32", decoder_model_merged: "q8" },
} as const;

async function load(): Promise<void> {
  const device = (await supportsWebGPU()) ? "webgpu" : "wasm";
  post({ type: "loading", message: "Loading speech model" });

  // Download progress covers both models; the weights land in the browser's
  // Cache API, so this is a first-visit cost only.
  const progress_callback = (item: { status?: string; progress?: number }) => {
    if (item.status === "progress" && typeof item.progress === "number") {
      post({ type: "progress", progress: item.progress });
    }
  };

  vad = (await AutoModel.from_pretrained(VAD_MODEL_ID, {
    config: { model_type: "custom" } as never,
    dtype: "fp32", // Full precision: the model is 2 MB, quantizing buys nothing.
    progress_callback,
  })) as unknown as VadModel;

  transcriber = (await pipeline("automatic-speech-recognition", STT_MODEL_ID, {
    device,
    dtype: DEVICE_DTYPE[device],
    progress_callback,
  })) as unknown as Transcriber;

  // Warm up (compiles WebGPU shaders) so the first real sentence is not slow.
  await transcriber(new Float32Array(SAMPLE_RATE));
  isLoaded = true;
  post({ type: "ready" });
}

// ── Rolling state ────────────────────────────────────────────────────────────

// Transformers.js cannot run two inferences at once, so they are chained.
let inferenceChain: Promise<unknown> = Promise.resolve();

const BUFFER = new Float32Array(MAX_BUFFER_DURATION * SAMPLE_RATE);
let bufferPointer = 0;

const sr = new Tensor("int64", [SAMPLE_RATE], []);
let state = new Tensor("float32", new Float32Array(2 * 1 * 128), [2, 1, 128]);

let isRecording = false;
let postSpeechSamples = 0;
let prevBuffers: Float32Array[] = [];

// Counts dictations, not sentences. Everything above is rolling state that must
// not survive from one dictation into the next: half a sentence still in the
// buffer, the pre-speech frames, the VAD's recurrent state. Bumping this both
// marks the old state stale and lets a transcription that is still running be
// discarded when it finally returns, instead of appearing in the box seconds
// after the doctor pressed Stop.
let sessionEpoch = 0;

/** Voice activity detection on one frame. */
async function isSpeechFrame(buffer: Float32Array): Promise<boolean> {
  if (!vad) return false;
  const input = new Tensor("float32", buffer, [1, buffer.length]);
  const { stateN, output } = (await (inferenceChain = inferenceChain.then(() =>
    vad!({ input, sr, state }),
  ))) as VadOutput;
  state = stateN;

  const score = output.data[0] as number;
  return (
    // Above the threshold: definitely speech.
    score > SPEECH_THRESHOLD ||
    // Mid-sentence: hold on until the score drops past the lower exit threshold.
    (isRecording && score >= EXIT_THRESHOLD)
  );
}

async function transcribe(buffer: Float32Array): Promise<void> {
  if (!transcriber) return;
  const epoch = sessionEpoch;
  const { text } = (await (inferenceChain = inferenceChain.then(() =>
    transcriber!(buffer),
  ))) as { text: string };
  if (epoch !== sessionEpoch) return; // Dictation ended while this was running.
  if (text?.trim()) post({ type: "text", text });
}

function reset(offset = 0) {
  BUFFER.fill(0, offset);
  bufferPointer = offset;
  isRecording = false;
  postSpeechSamples = 0;
  post({ type: "speech", active: false });
}

/**
 * Forget the previous dictation entirely.
 *
 * Sent at both ends of a dictation, because the worker is now reused: without
 * this, the frames kept for front-padding and any half-captured sentence would
 * be prepended to the doctor's next one. The VAD's recurrent state goes back to
 * zero too — it is a running summary of the audio it has heard, and the audio it
 * heard belongs to a different sitting.
 */
function resetSession() {
  sessionEpoch += 1;
  BUFFER.fill(0);
  bufferPointer = 0;
  isRecording = false;
  postSpeechSamples = 0;
  prevBuffers = [];
  state = new Tensor("float32", new Float32Array(2 * 1 * 128), [2, 1, 128]);
}

/** Ship the sentence we just captured, front-padded with the pre-speech frames. */
function dispatchSentence(overflow?: Float32Array) {
  const captured = BUFFER.slice(0, bufferPointer + SPEECH_PAD_SAMPLES);
  const padLength = prevBuffers.reduce((acc, b) => acc + b.length, 0);
  const padded = new Float32Array(padLength + captured.length);

  let offset = 0;
  for (const prev of prevBuffers) {
    padded.set(prev, offset);
    offset += prev.length;
  }
  padded.set(captured, offset);
  prevBuffers = [];

  void transcribe(padded);

  if (overflow) BUFFER.set(overflow, 0);
  reset(overflow?.length ?? 0);
}

// ── Message handling ─────────────────────────────────────────────────────────

ctx.onmessage = async (event: MessageEvent) => {
  const data = event.data as { type?: string; buffer?: Float32Array };

  if (data.type === "load") {
    // Already holding both models from an earlier dictation: answer at once.
    if (isLoaded) {
      post({ type: "ready" });
      return;
    }
    loading ??= load().catch((error: unknown) => {
      loading = null;
      post({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  if (data.type === "reset") {
    resetSession();
    return;
  }

  const buffer = data.buffer;
  if (!buffer || !vad) return;

  const wasRecording = isRecording;
  const speech = await isSpeechFrame(buffer);

  if (!wasRecording && !speech) {
    // Silence before any speech: keep a short FIFO of frames so the eventual
    // sentence can be padded at the front and not clip its own first syllable.
    if (prevBuffers.length >= MAX_NUM_PREV_BUFFERS) prevBuffers.shift();
    prevBuffers.push(buffer);
    return;
  }

  const remaining = BUFFER.length - bufferPointer;
  if (buffer.length >= remaining) {
    // Hit the 30-second ceiling — transcribe what we have and carry the rest.
    BUFFER.set(buffer.subarray(0, remaining), bufferPointer);
    bufferPointer += remaining;
    dispatchSentence(buffer.subarray(remaining));
    return;
  }

  BUFFER.set(buffer, bufferPointer);
  bufferPointer += buffer.length;

  if (speech) {
    if (!isRecording) post({ type: "speech", active: true });
    isRecording = true;
    postSpeechSamples = 0;
    return;
  }

  postSpeechSamples += buffer.length;

  // We were recording and this frame is not speech. Is the pause long enough to
  // count as the end of the sentence, or is the speaker just drawing breath?
  if (postSpeechSamples < MIN_SILENCE_DURATION_SAMPLES) return;

  if (bufferPointer < MIN_SPEECH_DURATION_SAMPLES) {
    reset(); // Too short to be a sentence — a cough, a chair, a door.
    return;
  }

  dispatchSentence();
};
