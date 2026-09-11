# Speech-to-Text — in-browser dictation for Re-write Practice

How the **Speak** button on the doctor dashboard turns a spoken sentence into text in the
Re-write Practice box. All inference runs **inside the browser tab**; no audio is uploaded,
stored, or sent to any third party. If this document diverges from the code, the code wins.

Scope: `app/Webapp` only. Nothing in the Backend, the database, or the AI pipeline
participates in transcription.

---

## 1. What it does

On the doctor dashboard's topic detail view, the Re-write Practice panel asks *"How would
you say it better?"*. Next to that prompt sits a microphone button. Clicking it opens the
microphone, loads two ONNX models into a Web Worker, and from then on every complete spoken
sentence is appended to the textarea as text. Clicking again releases the microphone.

Typing is untouched. Dictation **appends** to whatever is already in the box, so the two can
be mixed freely. The recognised text reaches the Backend only where typed text already did —
through the unchanged **Try & Score** and `/api/doctor/rewrites` calls.

---

## 2. Design premise — the audio never leaves the tab

This is the single decision everything else follows from.

Two conventional options were rejected:

| Option | Why not |
|---|---|
| Browser `SpeechRecognition` / `webkitSpeechRecognition` | Streams the microphone to a browser-vendor service. Absent in Firefox, prefixed in Safari. |
| A server-side transcription endpoint | Creates an upload path for consultation speech, and therefore a vendor boundary to argue about. |

Instead the model runs client-side via `@huggingface/transformers` (Transformers.js) on ONNX
Runtime Web. The consequences:

- **PHI question is moot by construction.** The path is microphone → `AudioContext` →
  Web Worker → text. There is no upload to disable, so no BAA is required and no vendor
  boundary exists.
- **Nothing is stored.** No disk, no IndexedDB, no network. The only cached artefact is the
  model weights, in the browser's Cache API, on first visit.
- **The cost moves to the client.** A ~123 MB one-time download and CPU inference on the
  doctor's own machine. Section 8 records what that actually costs.

---

## 3. Files

Five files, one per responsibility. None exceeds 240 lines.

| File | Lines | Role |
|---|---|---|
| `src/components/RewriteVoiceInput.tsx` | 109 | The button. Presentation only — label, colours, disabled state, error text. |
| `src/hooks/useSpeechToText.tsx` | 177 | Browser plumbing: permission, `AudioContext`, worklet, worker lifecycle, cleanup. |
| `src/workers/stt.worker.ts` | 233 | Both models, all inference, and the sentence-boundary state machine. |
| `public/vad-processor.js` | 114 | `AudioWorklet` on the audio rendering thread: re-chunks and rate-converts the mic stream. |
| `src/lib/sttConstants.ts` | 90 | Model ids, every tuning constant, the worker message union, `appendTranscript()`. |

Consumer: `src/components/PhysicianReportsModifiedV41Timothy.tsx` imports the button (`:33`)
and renders it (`:4491`) in the "How would you say it better?" heading row, feeding
`handleVoiceText` (`:3886`).

Test coverage: `src/__tests__/lib/sttConstants.test.ts` (unit, `appendTranscript`) and
`e2e/voice-input-cross-browser.spec.ts` (Playwright, three engines — see §9).

---

## 4. Threads and data flow

Three execution contexts, deliberately. Inference on the UI thread would stall the dashboard;
audio capture anywhere but the audio rendering thread drops frames.

```
┌─ UI thread ────────────────────────────────────────────────────────────────┐
│  RewriteVoiceInput.tsx        button, label, disabled state                 │
│  useSpeechToText.tsx          getUserMedia → AudioContext → worklet+worker  │
│        ▲ text                                    │ 512-sample frames        │
└────────┼─────────────────────────────────────────┼─────────────────────────┘
         │                                         │
         │                    ┌─ Audio rendering thread ──────────────────────┐
         │                    │  public/vad-processor.js                      │
         │                    │    128-sample blocks → (resample to 16 kHz)    │
         │                    │    → fixed 512-sample frames → port.postMessage│
         │                    └───────────────────────────────────────────────┘
         │                                         │
         │                    ┌─ Web Worker (module) ─────────────────────────┐
         └────────────────────┤  src/workers/stt.worker.ts                    │
              { type:"text" } │    Silero VAD   → is this frame speech?        │
                              │    state machine → where does the sentence end?│
                              │    Moonshine    → transcribe the sentence      │
                              └───────────────────────────────────────────────┘
```

Step by step, from the click:

1. `start()` creates the module Worker and posts `{ type: "load" }`. Models begin downloading.
2. `getUserMedia({ channelCount: 1, echoCancellation, autoGainControl, noiseSuppression,
   sampleRate: 16000 })` prompts for the microphone.
3. An `AudioContext` is built at 16 kHz, the worklet module is added, and the mic source is
   connected to an `AudioWorkletNode` named `vad-processor`.
4. The worklet emits fixed 512-sample `Float32Array` frames on its port. The hook forwards
   each one, unmodified, to the worker.
5. The worker scores every frame with Silero VAD and accumulates speech into a rolling buffer.
6. When the state machine decides a sentence has ended, the buffer is handed to Moonshine.
7. The worker posts `{ type: "text", text }`. The hook calls `onText`, which the component's
   consumer turns into `setNewSentence(prev => appendTranscript(prev, text))`.

The only thing that ever crosses from the worker back to the page is a string.

### Worker message protocol

`SttWorkerMessage` in `sttConstants.ts` is the complete contract:

| Message | Meaning | Hook's reaction |
|---|---|---|
| `{ type: "loading", message }` | Download started | (status is already `loading`) |
| `{ type: "progress", progress }` | 0–100 across **both** models | `setProgress` → `Loading… N%` |
| `{ type: "ready" }` | Warm-up inference done | `setStatus("listening")` |
| `{ type: "speech", active }` | VAD entered/left a sentence | `setSpeaking` → mic icon pulses, label reads `Listening…` |
| `{ type: "text", text }` | One recognised sentence | `onText(text)` |
| `{ type: "error", message }` | Load or inference failure | `setStatus("error")`, message shown beside the button |

---

## 5. The two models

### 5.1 Silero VAD — the gate

`onnx-community/silero-vad`, 2.2 MB, loaded at **fp32** unconditionally (quantizing a 2 MB
model buys nothing). It scores each 512-sample frame for "is this speech?" and carries a
recurrent state tensor of shape `[2, 1, 128]` between frames.

Its purpose is economic: Moonshine is expensive, so it must only ever see audio that is
actually someone talking. Without a VAD, the transcriber either runs continuously on silence
or has to be driven by a push-to-talk the doctor must remember to release.

### 5.2 Moonshine — the transcriber

`onnx-community/moonshine-base-ONNX`, loaded through the standard
`pipeline("automatic-speech-recognition", …)` API.

**Why Moonshine and not Whisper — it is compute shape, not file size.** Whisper pads every
input to a fixed 30-second mel spectrogram, so a five-second dictation costs thirty seconds
of encoder work regardless. Moonshine consumes the raw waveform at its natural length (rotary
position embeddings, so nothing forces padding), and encoder cost tracks the actual utterance.
On a GPU that difference is hidden; on a CPU — which is what a clinician's laptop is — it is
the difference between usable and not. Short dictated phrases are exactly Moonshine's case.

Measured ONNX download sizes (encoder fp32 + merged decoder q8, i.e. the WASM combination):

| Model | encoder | decoder (merged) | total |
|---|---|---|---|
| **moonshine-base** (chosen) | fp32 80.8 MB | q8 42.5 MB | **123 MB** |
| moonshine-base, int8 encoder | 20.5 MB | 42.5 MB | 63 MB |
| moonshine-tiny | 7.9 MB | 20.2 MB | 28 MB |
| whisper-base | 82.5 MB | 53.7 MB | 136 MB |
| whisper-tiny.en | 32.9 MB | 30.7 MB | 64 MB |
| silero-vad (always loaded) | — | 2.2 MB | 2.2 MB |

Both families use the identical pipeline call, and the model id is a single constant
(`STT_MODEL_ID`), so switching is a one-line change if load time or quality argues for it.

### 5.3 Backend and precision — `DEVICE_DTYPE`

```ts
const DEVICE_DTYPE = {
  webgpu: { encoder_model: "fp32", decoder_model_merged: "q4" },
  wasm:   { encoder_model: "fp32", decoder_model_merged: "q8" },
} as const;
```

The worker probes `navigator.gpu.requestAdapter()` at load time and picks `webgpu` if an
adapter is actually granted, otherwise onnxruntime-web's WebAssembly backend on the CPU. Two
separate decisions are encoded here:

- **Encoder stays fp32 on both backends.** It runs *once* per utterance. Quantizing it trades
  accuracy for a saving on the cheaper half of the work.
- **Decoder quantization depends on the backend.** The decoder runs once per output token, so
  it dominates. On WebGPU, `q4` wins: memory bandwidth is the bottleneck, and dequantizing
  4-bit weights is essentially free inside a shader. On WASM there are no 4-bit kernels — the
  runtime would dequantize in scalar code, making `q4` *slower* than `q8`, and on some builds
  unsupported outright. Hence `q8` there.

In short: **WebGPU runs the decoder at q4, WASM runs it at q8**, and the encoder is full
precision either way.

No GPU is required. Every latency figure in §8 was measured on the **CPU/WASM path**.

---

## 6. Finding sentence boundaries

This is the part that carries the user-visible behaviour, and it lives in `stt.worker.ts`'s
`onmessage` handler. The constants are all in `sttConstants.ts`.

| Constant | Value | What it buys |
|---|---|---|
| `SAMPLE_RATE` | 16 000 Hz | Rate both models were trained at. |
| `NEW_BUFFER_SIZE` | 512 samples (32 ms) | Frame size Silero VAD expects. |
| `SPEECH_THRESHOLD` | 0.3 | Score above this **enters** speech. |
| `EXIT_THRESHOLD` | 0.1 | While recording, score above this **stays** in speech. |
| `MIN_SILENCE_DURATION_MS` | 400 ms | Silence shorter than this is a breath, not a sentence end. |
| `MIN_SPEECH_DURATION_SAMPLES` | 250 ms | Captures shorter than this are discarded as noise. |
| `SPEECH_PAD_MS` | 80 ms | Padding appended to the captured chunk. |
| `MAX_NUM_PREV_BUFFERS` | `ceil(80 ms / 512)` = 3 frames | Pre-roll FIFO, see below. |
| `MAX_BUFFER_DURATION` | 30 s | Ceiling on one transcription. |

**Dual threshold (hysteresis).** Entering speech needs 0.3; staying in it only needs 0.1. A
single threshold makes the VAD flap on quiet syllables — the tail of a word dips below the
line and the sentence is cut in half. Two thresholds mean it is harder to start than to
continue, which is the correct asymmetry for dictation.

**Pre-roll FIFO.** While no speech is detected, the last three frames are kept in
`prevBuffers`. When a sentence eventually starts, VAD has already consumed the first ~100 ms
of it deciding whether it was speech — so `dispatchSentence()` prepends those kept frames.
Without this the transcriber never hears the first syllable, and "prostate" arrives as
"rostate".

**End of sentence.** Once recording, non-speech frames accumulate in `postSpeechSamples`.
Below `MIN_SILENCE_DURATION_SAMPLES` (400 ms) nothing happens — the speaker is drawing
breath. At or above it, the sentence is over.

**Noise rejection.** If the whole capture is shorter than 250 ms it is thrown away without
transcribing: a cough, a chair, a door.

**The 30-second ceiling.** If someone talks continuously past the buffer, the buffer is
dispatched as-is and the overflow samples are copied to the front of the fresh buffer via
`reset(overflow.length)`, so the continuing sentence is not clipped at the seam.

**Serialized inference.** Transformers.js cannot run two inferences concurrently, so both VAD
and transcription go through a single `inferenceChain` promise. VAD on a 512-sample frame is
cheap enough that queueing behind a transcription does not lose audio — frames keep arriving
from the worklet and simply wait.

---

## 7. Browser-specific behaviour

### 7.1 Secure-context gate

`getUserMedia` exists only in a secure context. Over plain HTTP on a LAN address,
`navigator.mediaDevices` is **undefined** — the API is absent, not merely denied, so no
application code can work around it.

The hook probes this on mount and sets `unsupportedReason`, which makes the button render
**disabled** with the reason in its tooltip ("Voice input needs a secure connection (HTTPS or
localhost).") rather than failing at the click. Typing is untouched in that state.

In this deployment that means voice input works on `https://<host>:3443` (the `webapp-tls`
nginx container) and **does not work, by design, on `http://<host>:3001`**.

### 7.2 Firefox — sample-rate fallback and resampling

A 16 kHz `AudioContext` is the first choice, because an engine that accepts it resamples the
microphone itself with a better filter than anything affordable on the audio thread. Chromium
and WebKit do accept it.

Firefox does not. It ignores the `sampleRate` constraint passed to `getUserMedia` (the track
settings do not even report a rate) and then throws on `createMediaStreamSource`:

> `AudioContext.createMediaStreamSource: Connecting AudioNodes from AudioContexts with
> different sample-rate is currently not supported.`

So the hook wraps that one call in a `try`/`catch`: on failure it closes the context, rebuilds
it at the device rate, and lets the worklet convert. Chromium and WebKit never reach the catch,
and their path is unchanged.

`vad-processor.js` then does the conversion, with `RESAMPLE_RATIO = sampleRate /
TARGET_SAMPLE_RATE` (1 when the context is already 16 kHz, in which case `toTargetRate()`
returns its input untouched). Each output sample is the **mean of the input samples it spans**,
not a point sample. That average is a crude low-pass filter; plain decimation would fold
everything above 8 kHz back into the speech band as aliasing. `resampleCarry` and
`resampleOffset` persist across `process()` calls because 128-sample blocks do not divide
evenly by the ratio.

### 7.3 Why the worklet is a static file

`audioWorklet.addModule()` takes a plain URL and the worklet scope has no module system, so
`vad-processor.js` is served from `public/` rather than bundled. The consequence is that it
cannot `import` — `TARGET_SAMPLE_RATE = 16000` is duplicated there and must be kept in sync
with `SAMPLE_RATE` in `sttConstants.ts`.

### 7.4 Build configuration

Two obstacles were fixed at the root rather than worked around:

- `.npmrc` sets `onnxruntime-node-install-cuda=skip`. `@huggingface/transformers` pulls in
  `onnxruntime-node`, whose postinstall downloads native binaries and fails outright on a
  CUDA 11 host. Inference is browser-side, so that binding is never loaded; `next.config.js`
  also aliases `onnxruntime-node` and `sharp` to `false`.
- A small webpack plugin in `next.config.js` marks onnxruntime-web's pre-built
  `ort.bundle.min.*.mjs` as `minimized: true`. Terser otherwise dies on its top-level
  `import.meta`. The file is genuinely already minified, so this is a statement of fact rather
  than a suppression.

The transformers/ORT chunks are **not** in the eager set for `/` — `app-build-manifest.json`
confirms they load only inside the worker, so First Load JS stays at 387 kB.

---

## 8. Performance, measured

Measured on the deployed TLS door, 18 sentences over one warm session, `hardwareConcurrency:
52`, `crossOriginIsolated: false`, on the **CPU/WASM path** (the test browser exposes
`navigator.gpu` but is granted no adapter):

| | |
|---|---|
| Model ready after click | 8.9 s (one-time; weights then sit in the Cache API) |
| Per-sentence latency, warm, median | **1.6 s** (re-measured on a later build: 1.1 s) |
| Real-time factor | ≈ 0.18 — a 9-second sentence transcribes in 1.6 s |
| First transcript on a cold cache | ~18 s, of which most is the 123 MB download |

Separating the cold and warm numbers is what shows the steady-state cost is under two
seconds, so no optimisation is warranted yet. Two levers remain unspent if a slower machine
needs them: the WASM backend is currently **single-threaded** (no `COOP`/`COEP` headers are
sent, so `crossOriginIsolated` is false), and `STT_MODEL_ID` can drop to a 63 MB or 28 MB
build.

The models are loaded on the first `start()`, not on mount — most doctors reach this screen
without ever dictating, and the download should not be spent on them.

---

## 9. Cross-browser status

`e2e/voice-input-cross-browser.spec.ts` drives the entire path — capability probe, model
download, VAD, transcription, and the disabled-over-plain-http case — in three engines. It
runs under its own config (`npm run test:e2e:voice`) and is excluded from the ordinary e2e
run, because the weights are a ~123 MB download per browser.

The microphone is replaced by a `MediaStream` fed from a decoded WAV, defined on
`MediaDevices.prototype`, rather than by `--use-file-for-fake-audio-capture` (Chromium-only).
Firefox's own fake device emits a tone, which the VAD correctly declines to call a sentence.

| Engine | Secure ctx | AudioWorklet | Module worker | WASM SIMD | Context rate | Transcript |
|---|---|---|---|---|---|---|
| Chromium 143 | ✅ | ✅ | ✅ | ✅ | 16 000 Hz | ✅ |
| Firefox 145 | ✅ | ✅ | ✅ | ✅ | 16 000 Hz | ✅ (after the §7.2 fix) |
| WebKit 26.0 | ✅ | ✅ | ✅ | ✅ | 16 000 Hz | ✅ |

**Caveat.** Playwright's WebKit is the WPE port, not macOS Safari. Same engine and same four
APIs, but an iPhone or a Mac still deserves one manual check before this is called proven.

Two test inputs are operator-supplied and never committed: `VOICE_TEST_URL` (it carries a
de-identified study token) and `VOICE_TEST_AUDIO` (must be synthetic or public-domain speech,
never a real consultation recording).

---

## 10. UI behaviour

The button's label is derived, not stored:

| Condition | Label |
|---|---|
| `!supported` | `Voice unavailable` (disabled, reason in the tooltip) |
| `status === "loading"` | `Loading… N%` |
| `status === "listening"` && speaking | `Listening…` (mic icon pulses) |
| `status === "listening"` && silent | `Stop` |
| otherwise | `Speak` |

**Placement.** Immediately after the prompt it answers — `2  How would you say it better?
[🎤 Speak]`, 8 px to the right, same baseline. Reading order carries the meaning: the
question, then the two ways of answering it. It stays outside the textarea rather than
floating over it, because a button over the box covers the text being written. The accepted
trade-off is that with the inline rubric expanded, the button sits a criteria table away from
the box.

**Onboarding.** A "Dictate Your Re-write" step in the detail-view tour (`OnboardingTour.tsx`,
step 5 of 7) is anchored to `data-tour='rewrite-voice-button'`. It states the three things the
button cannot say for itself: dictated sentences land in the same box that can still be typed
in, the audio is never recorded or uploaded, and a greyed-out "Voice unavailable" means the
page was opened over plain http.

**Appending, not replacing.** `appendTranscript(previous, chunk)` joins each recognised
sentence to the existing contents with a single space, and attaches a leading `,.!?;:` without
one. It lives in `sttConstants.ts` rather than the hook because it is the one piece of this
feature worth unit-testing on its own.

**Cleanup.** `useEffect(() => stop, [stop])` releases the microphone, closes the
`AudioContext` and terminates the worker if the doctor navigates away mid-dictation.

**Tracking.** Voice usage reuses the existing `rewrite_input` event with
`metadata: { source: "voice" }`. `event_type` is a Postgres enum, so a new value would have
needed a migration to record the same thing.

---

## 11. Key files

| Path | What to look at |
|---|---|
| `app/Webapp/src/lib/sttConstants.ts` | Model ids, every threshold, `SttWorkerMessage`, `appendTranscript()` |
| `app/Webapp/src/workers/stt.worker.ts` | `DEVICE_DTYPE` (`:68`), `load()` (`:73`), `isSpeechFrame()` (`:118`), `dispatchSentence()` (`:152`), state machine (`:173`) |
| `app/Webapp/src/hooks/useSpeechToText.tsx` | Secure-context probe (`:42`), Firefox fallback (`:126`), worklet wiring (`:141`) |
| `app/Webapp/public/vad-processor.js` | `toTargetRate()` (`:45`), 512-sample framing (`:90`) |
| `app/Webapp/src/components/RewriteVoiceInput.tsx` | Button, label logic, disabled state |
| `app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx` | `handleVoiceText` (`:3886`), render site (`:4491`) |
| `app/Webapp/e2e/voice-input-cross-browser.spec.ts` | Capability probe, fake microphone, per-engine assertions |
| `app/Webapp/next.config.js`, `app/Webapp/.npmrc` | onnxruntime aliasing and the pre-minified bundle plugin |

---

## 12. Open items

1. **Manual Safari check.** WPE WebKit passes; a real Mac or iPhone has not been tried.
2. **`COOP`/`COEP` headers** would make onnxruntime-web multi-threaded. Not sent today, so
   WASM inference is single-threaded.
3. **A lighter model** (63 MB int8-encoder moonshine-base, or 28 MB moonshine-tiny) is a
   one-line change if a clinician laptop proves too slow.
4. **The certificate warning on `:3443`.** Removing it needs `_tls/ca.crt` imported on each
   client, or a hostname under a controlled domain so a publicly trusted certificate can be
   issued.
5. **`TARGET_SAMPLE_RATE` is duplicated** in `vad-processor.js` because a worklet cannot
   import. Any change to `SAMPLE_RATE` must be made in both places.
