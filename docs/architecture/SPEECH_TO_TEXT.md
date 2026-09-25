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
- **No third-party origin is contacted either.** The weights and the ONNX Runtime WASM
  binaries are served by the COMPASS server out of `public/`, not by `huggingface.co` and
  `cdn.jsdelivr.net`, and remote loading is disabled outright so it cannot silently come back.
  **§5.4 is the section to read before touching anything in this feature** — it is what makes
  the feature work behind a hospital firewall, and it is easy to break from the deploy side.
- **The cost moves to the client.** A one-time download (151 MB on the WASM path, 181 MB on
  WebGPU) and CPU inference on the doctor's own machine. Section 8 records what that costs.

---

## 3. Files

Eight files, one per responsibility. None exceeds 375 lines.

| File | Lines | Role |
|---|---|---|
| `src/components/RewriteVoiceInput.tsx` | 154 | The button. Presentation only — label, colours, disabled state, error text. |
| `src/components/SttLoadingModal.tsx` | 116 | The first-click loading window: copy, the row list, Cancel (§4.3, §10). |
| `src/components/SttLoadingRow.tsx` | 95 | One row of that window — label, byte counts, its own bar. |
| `src/hooks/useSpeechToText.tsx` | 311 | Browser plumbing: permission, `AudioContext`, worklet, microphone lifetime, the Stop handshake (§4.1), cleanup. |
| `src/lib/sttWorkerHost.ts` | 41 | Owns the worker's lifetime — one per page visit, shared by every dictation. |
| `src/workers/stt.worker.ts` | 374 | Asset origin (§5.4), both models, all inference, the token ceiling (§4.2), per-file load reporting (§4.3), and the sentence-boundary state machine. |
| `public/vad-processor.js` | 113 | `AudioWorklet` on the audio rendering thread: re-chunks and rate-converts the mic stream. |
| `src/lib/sttConstants.ts` | 212 | Model ids, asset paths, every tuning constant, `maxNewTokensFor()`, `sttAssetIdFor()`, the worker message union, `appendTranscript()`. |

One file is **not** in this repo's source tree but is required at runtime: the 223 MB of
weights and WASM binaries under `public/stt-models/` and `public/stt-wasm/`, fetched by
`scripts/fetch-stt-assets.sh`. See §5.4 — a deployment that skips it has a feature that fails
closed on the first click.

The split between the hook and `sttWorkerHost.ts` is the important one: the **microphone**
belongs to a single dictation and is released the moment it ends, while the **models** belong
to the visit. Putting both in the hook meant a component unmount — which happens every time a
doctor moves between sentences — threw the models away too.

Consumer: `src/components/PhysicianReportsModifiedV41Timothy.tsx` imports the button (`:33`)
and renders it (`:4595`) in the footer row of the re-write input box, feeding
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

1. `start()` takes the shared module Worker from `sttWorkerHost.ts` — created here on the
   first dictation of the visit, reused on every later one — attaches its listeners, and posts
   `{ type: "reset" }` then `{ type: "load" }`. On a first dictation the models begin
   downloading; on a later one `ready` comes straight back.
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
| `{ type: "asset", asset }` | One row of the loading modal — `{ id, loaded, total, done }` | Merged into `assets` by `id` → one bar per file (§4.3) |
| `{ type: "ready" }` | Warm-up inference done | `setStatus("listening")` |
| `{ type: "speech", active }` | VAD entered/left a sentence | `setSpeaking` → mic icon pulses, label reads `Listening…` |
| `{ type: "text", text }` | One recognised sentence | `onText(text)` |
| `{ type: "flushed" }` | Everything buffered at Stop has been transcribed and delivered | `stopImmediate()` — detach from the worker, status back to `idle` |
| `{ type: "error", message }` | Load or inference failure | `setStatus("error")`, message shown beside the button |

Four things go the other way:

| Message | Meaning |
|---|---|
| `{ type: "load" }` | Load both models. Already loaded — which is the normal case after the first dictation — is answered with `ready` immediately, so the page never waits. |
| `{ type: "flush" }` | Stop was pressed. Transcribe whatever is still buffered, post its `text`, then answer `flushed`. Sent instead of detaching, so the last sentence is not thrown away — see §4.1. |
| `{ type: "reset" }` | Forget the previous dictation: the rolling buffer, the pre-speech frames, the VAD's recurrent state. Sent at the start of every dictation and when the page detaches. |
| `{ buffer }` | One 512-sample frame from the worklet. No `type` field; the worker treats any message without one as audio. |

`reset` also bumps a session counter that a transcription in flight compares against when it
finishes. Without it, a sentence whose inference was still running when the doctor pressed
Stop would appear in the box a second or two later.

### 4.1 Stop is a handshake, not a hang-up

A sentence is only handed to the transcriber after `MIN_SILENCE_DURATION_MS` (400 ms) of
silence, and transcribing it costs roughly another second. Someone who stops talking and
clicks Stop straight away is inside that window. The hook used to detach on the click —
`reset`, remove the listeners, bump the session — which silently discarded the last thing
they said.

So Stop now runs in two halves:

1. **Immediately:** the microphone tracks are stopped and the `AudioContext` is closed. The
   browser's recording indicator must not stay lit while we wait, and the audio the flush
   needs is already inside the worker.
2. **On `flushed`:** the listeners come off and the status goes back to `idle`.

Between the two the status is `finishing` and the button is disabled (see §10). The worker is
never terminated — it holds both models, and rebuilding them would cost the doctor the full
load on the next click.

Two guards make this safe:

- `useSpeechToText.tsx` arms a `FLUSH_TIMEOUT_MS` (5 s) timer when it sends `flush`. A worker
  that never answers — wedged, or killed mid-inference — cannot strand the button in
  `Finishing…`.
- `start()` calls `releaseWorker()` before attaching. A flush from the previous dictation may
  still be outstanding, and the worker is shared, so a second set of listeners would deliver
  every sentence of the new dictation twice.

Unmount takes the other route deliberately: the box that would receive the text has gone with
the component, so it stops immediately rather than flushing into a dead callback.

### 4.2 The token ceiling

`stt.worker.ts` passes an explicit `max_new_tokens` to every transcription, computed by
`maxNewTokensFor(samples)` in `sttConstants.ts`.

Left to itself, Transformers.js applies its own bound in `_call_moonshine`
(`pipelines.js:1931`):

```js
const max_new_tokens = Math.floor(aud.length / sampling_rate) * 6;
return super._call(audio, { max_new_tokens, ...kwargs, ...inputs });
```

It comes from the Moonshine paper, where it exists to stop the decoder looping on repeated
output. Two properties of it cut real speech short here:

- **It floors whole seconds.** The shortest capture this worker can emit is 250 ms of speech
  (`MIN_SPEECH_DURATION_SAMPLES`) plus 400 ms of trailing silence, 80 ms of pad and 3 pre-roll
  frames — about **826 ms**, which floors to 0 and allows **zero** tokens. The result is an
  empty string, which `if (text?.trim())` then drops without a trace. A doctor who says
  "Correct." gets nothing at all.
- **6 tokens per second is below a brisk speaker.** A trailing fragment split off by a pause
  ("and that's the main concern", ~8 tokens in 1.6 s) is allowed only 6, so its last words go
  missing. Measured against the real tokenizer, typical clinical sentences run 15–32 tokens
  for 11–22 words — about **1.4 tokens per word**.

Note the spread order above: caller kwargs land *after* the library's own default, so passing
a value overrides it rather than being overridden by it.

The replacement is `Math.max(MIN_NEW_TOKENS, Math.ceil(seconds * TOKENS_PER_SECOND))` — a
floor of 24 tokens and a rate of 8/s. Both are deliberately generous: being too high costs a
slightly longer decode on a sentence the model finishes early anyway, while being too low
silently loses the doctor's words. `src/__tests__/lib/sttConstants.test.ts` pins the cases
that were actually broken, including that the new bound is never below the library's at any
duration the worker can emit.

This is the defect that shows up **without** touching Stop — it is the more common of the two
by a wide margin.

### 4.3 Reporting the load, per file

The first click of a visit downloads ~150 MB. It used to be reported as a single percentage
in the button's own label, which was wrong twice over:

- **The number ran backwards.** Transformers.js reports per *file* — `hub.js:598` dispatches
  `{ status, name, file, loaded, total, progress }`, where `progress` is that one file's
  share. The worker threw `file` away and the hook wrote whatever arrived into one variable,
  so each file restarted the bar at 0. Worse, `from_pretrained` fetches the encoder and the
  decoder concurrently, so two streams interleaved into that one variable and the percentage
  could drop from 80 % to 30 % mid-download.
- **It then sat at 100 % doing nothing visible.** After the last byte comes session
  construction and a warm-up inference that compiles WebGPU shaders. Neither emits a progress
  event, so the bar was full while the doctor still waited.

The replacement does not aggregate. Each file gets its own named row, which makes the
repeated 0 → 100 self-explanatory — there are simply several things to fetch — and answers
the question the doctor is actually asking, which is what is taking the time:

| `SttAssetId` | Label | Source |
|---|---|---|
| `vad` | `Voice detector` | `silero-vad/onnx/model.onnx`, 2.2 MB |
| `encoder` | `Speech model · encoder` | `moonshine-base-ONNX/onnx/encoder_model.onnx`, 80.8 MB |
| `decoder` | `Speech model · decoder` | `decoder_model_merged_q4` (WebGPU) or `_q8` (WASM) |
| `warmup` | `Warming up` | The warm-up inference — no byte count, so an indeterminate bar |

Two details carry the design:

- **The worker keeps the tally, not the page.** The library's `done` event carries only
  `{ name, file }` — no byte counts — so the worker remembers the last `loaded`/`total` per
  id and always posts a complete row. The page never merges partial updates.
- **JSON configs get no row.** `sttAssetIdFor()` returns `null` for anything that is not
  `.onnx`. The half-dozen config and tokenizer files are a few kB each; a row that appears
  and completes in the same frame reads as a glitch.

`sttAssetIdFor()` routes the VAD by **repo id**, not filename — Silero's weight file is also
called `model.onnx`, so filename alone would misfile it as the transcriber's. That is the kind
of mistake which does not crash, it just leaves a row that never moves, so it is unit-tested.

---

## 5. The two models, and where their bytes come from

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
(`STT_MODEL_ID`), so switching is a one-line change *in the code* if load time or quality
argues for it — but the weights are self-hosted, so the fetch manifest has to change with it.
See §5.4.

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

### 5.4 Where the bytes come from — self-hosted, and why remote loading is off

Out of the box this feature contacts **two third-party origins** at runtime: Transformers.js
fetches model weights from `huggingface.co`, and it points ONNX Runtime Web at
`cdn.jsdelivr.net` for the WASM binaries. Neither default survives here. Both are redirected
to the COMPASS server at the top of `stt.worker.ts` (`:60-68`):

```ts
env.allowLocalModels  = true;
env.localModelPath    = STT_MODEL_PATH;   // "/stt-models/"
env.allowRemoteModels = false;            // ← the load-bearing line
if (env.backends.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = STT_WASM_PATH;  // "/stt-wasm/"
}
```

**Why this is not a preference.** Three reasons, in order of how much they cost when ignored:

1. **The hospital firewall.** A clinician's machine may not be allowed to reach
   `huggingface.co` or a CDN at all. Every byte now comes from the same origin that already
   served the dashboard, so if the page loads, the feature loads.
2. **Metadata disclosure.** A remote fetch hands the clinician's IP, user agent and timing to
   a third party on every cold start. §2 says the *audio* never leaves the tab; without
   self-hosting, the *fact that someone is dictating* still did.
3. **Reproducibility.** Two clinicians onboarding a month apart would otherwise be able to
   receive different weights with no change to COMPASS. The fetch script pins a commit SHA.

**Why `allowRemoteModels = false` matters more than the two path settings.** The paths alone
would be a preference that decays: forget one file and Transformers.js quietly falls back to
the internet, so it still works in testing and the guarantee is silently gone. With remote
loading disabled, `hub.js:534` **throws** rather than reaching `getFile(remoteURL)`. A missing
file is a loud, immediate failure. This is deliberate — the feature fails closed.

#### What is on disk

`scripts/fetch-stt-assets.sh` populates two gitignored directories
(`app/Webapp/.gitignore:158-163`). **13 files, 223 MB:**

| Directory | Contents | Origin removed | Size |
|---|---|---|---|
| `app/Webapp/public/stt-models/onnx-community/moonshine-base-ONNX/` | 6 configs + `tokenizer.json` + `encoder_model.onnx` + **both** decoder quantisations | `huggingface.co` | 193 MB |
| `app/Webapp/public/stt-models/onnx-community/silero-vad/` | `onnx/model.onnx`, `LICENSE` | `huggingface.co` | 2.2 MB |
| `app/Webapp/public/stt-wasm/` | `ort-wasm-simd-threaded.jsep.{mjs,wasm}` | `cdn.jsdelivr.net` | 21 MB |

Two details that catch people out:

- **Both decoder builds are required**, not one. The worker picks `q4` or `q8` from
  `DEVICE_DTYPE` only after probing for a WebGPU adapter (§5.3), so which one a given laptop
  needs is not knowable at deploy time. With remote loading off, the absent one is a crash.
- **The WASM binaries are copied, not downloaded.** jsDelivr serves the same files that ship
  inside `node_modules/@huggingface/transformers/dist/`, so the script copies them from there.
  That is why `npm install` must have run in `app/Webapp` before the script does.

A browser downloads a *subset*, not all 223 MB — only the files its own backend needs.
Measured across the deployed TLS door: **151.1 MB** on the WASM path, **181.4 MB** on WebGPU.

#### When it has to run

```bash
bash scripts/fetch-stt-assets.sh            # fetch + verify
bash scripts/fetch-stt-assets.sh --verify   # verify only, download nothing
```

Re-running is safe: a file whose byte size already matches the manifest is skipped. Order
matters in two places:

- **Before `npm run build`.** The files live under `public/`, which Next.js only picks up at
  build time. Running the script after a build leaves them out of the deployed tree.
- **Again when assembling `output: "standalone"`.** The standalone build does not copy
  `public/` into itself — that is a manual step, and no script in this repo does it. Forget it
  and the browser gets 404s from a server that has the files on disk one directory up. The
  full sequence on this deployment:

  ```bash
  bash scripts/fetch-stt-assets.sh            # ← before the build, not after
  cd app/Webapp && npm run build
  cp -r public       .next/standalone/public
  cp -r .next/static .next/standalone/.next/static
  cp .env            .next/standalone/.env
  systemctl --user restart compass-webapp
  ```

  Never run `next dev` in `app/Webapp` on this host: the dev server writes the same `.next/`
  the running service serves from, which destroys the standalone build.

Size is the only integrity check today. A SHA-256 digest per file would be stronger; tracked
as an open item in `STT_FEATURE_REPORT.md` §15.

#### Changing `STT_MODEL_ID` is not a one-line change any more

§5.2 says swapping the model is one constant. That is still true of the *code*, but the
manifest in `fetch-stt-assets.sh` — repo id, pinned revision, and the exact filename and byte
size of every file — has to change with it, and the script re-run before the next build.
Otherwise the new model id resolves to files that are not on disk and the feature fails
closed, as designed.

#### The trap: a stale browser cache hides all of this

**Self-hosting cannot be verified from the browser's UI.** Transformers.js writes weights into
the Cache API bucket `transformers-cache`, and — this is the part that surprises people — for
a browser cache the key is the **remote URL**, not the local path:

```js
// node_modules/@huggingface/transformers/src/utils/hub.js
const proposedCacheKey = cache instanceof FileCache ? /* … */ : remoteURL;   // :484
response = await tryCache(cache, localPath, proposedCacheKey);               // :502
```

`tryCache` tries **both** keys. So a browser that used this feature *before* the switch still
has entries keyed by `https://huggingface.co/...`, they still hit, and **no request reaches
the COMPASS server at all**. The feature works perfectly while proving nothing.

This was observed for real on 2026-09-25: a production test fetched `/stt-wasm/*` and
`/vad-processor.js` with 200s and made **zero** `/stt-models/` requests, because the WASM
binaries were never in `transformers-cache` and the weights were.

To actually verify, clear the cache first:

```
DevTools → Application → Cache Storage → delete "transformers-cache"    (or use a fresh profile)
```

then dictate and confirm the server was hit:

```bash
podman logs compass-nginx-tls 2>&1 | grep stt-models
# want: GET /stt-models/onnx-community/moonshine-base-ONNX/onnx/encoder_model.onnx 200 80818781
```

A `curl` against the URL proves the *server* is correct; only a cleared browser proves the
*client* takes that path.

#### Residual references are inert

`grep` still finds `https://huggingface.co` and `https://cdn.jsdelivr.net/...` in the built
chunks. Those are Transformers.js's default constants, not call sites that execute: the
`env.*` assignments above override them, and `allowRemoteModels = false` prevents the one code
path that would use `remoteURL`. Do not "fix" this by patching the vendored strings — the
guarantee is the `env` configuration plus the fail-closed throw, and that is what to assert in
a test.

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
transcribing: a cough, a chair, a door. A capture that survives this test is the shortest the
transcriber ever sees — 250 ms of speech plus pad, silence and pre-roll, about 826 ms — which
is exactly the case the library's own token bound prices at zero. See §4.2.

**Stop does not wait for silence.** `flush()` dispatches whatever is buffered if the VAD is
still mid-sentence (`isRecording`), or if enough has accumulated to clear the 250 ms noise
floor. The 400 ms silence rule is a sentence *boundary* detector; at Stop there is no next
sentence to separate this one from.

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
| Model ready after the **first** click of a visit | ~~9.0 s~~ — **superseded, see note below** |
| Model ready after **every later** click | **0.16 s** — the worker still holds them |
| Per-sentence latency, warm, median | **1.6 s** (re-measured on a later build: 1.1 s) |
| Real-time factor | ≈ 0.18 — a 9-second sentence transcribes in 1.6 s |

**The 9.0 s figure predates self-hosting (§5.4) and should not be quoted.** It was measured
when the weights came from `huggingface.co` over the public internet, which was most of it.
The bytes now come from the same host as the page: the server-side floor measured through
nginx+TLS is **151.1 MB in ≈0.50 s** (≈300 MB/s, 3 runs; 181.4 MB in ≈0.32 s for the WebGPU
set on loopback). Real first-click time is therefore dominated by the clinician's link to this
server, not by a CDN — roughly 5 s on 1 Gbps, 7 s on office Wi-Fi, 17 s on 100 Mbps. Those
three are **estimates**; no real end-to-end first click has been measured since the switch,
and the §5.4 cache trap is exactly why that measurement is harder than it looks.

Separating the cold and warm numbers is what shows the steady-state cost is under two
seconds, so no optimisation is warranted yet. Two levers remain unspent if a slower machine
needs them: the WASM backend is currently **single-threaded** (no `COOP`/`COEP` headers are
sent, so `crossOriginIsolated` is false), and `STT_MODEL_ID` can drop to a 63 MB or 28 MB
build.

### Why the second click is free

Two separate caches, often confused:

1. **The weights on disk.** Transformers.js writes them into the browser's Cache API under
   `transformers-cache` — 8 entries, **123.46 MB** measured: encoder 77.07 MB, quantized
   decoder 40.53 MB, `tokenizer.json` 3.59 MB, Silero VAD 2.14 MB, four small configs. This
   survives reloads and restarts, so the download happens once per browser, ever.
   **Entries are keyed by the URL they were first fetched from**, which is why a browser that
   predates §5.4 keeps serving weights off old `huggingface.co` keys — see the trap in §5.4.
2. **The models in memory.** Reading those bytes back, rebuilding two ONNX sessions and
   running the warm-up inference took **3.3 s** — and used to happen on *every* click,
   because `stop()` terminated the worker. The worker now outlives the dictation, so it
   happens once per visit.

The cost of holding them is memory. Process-tree RSS on the deployment, headless Chromium:

| | Total | Attributable to dictation |
|---|---|---|
| Dashboard open, never dictated | 568 MB | — |
| Models loaded, transcribing | 1 214 MB | **+645 MB** |
| After Stop | 1 207 MB | **+638 MB** — deliberately still held |
| Second Speak | 1 192 MB | +624 MB |

123 MB on disk becomes ~640 MB resident because the quantized decoder is expanded to floats
for computation and onnxruntime allocates its own arenas on top. Before this change, Stop
returned most of it (dropping to +247 MB) and charged 3.3 s for the next sentence; that trade
was taken the other way round on purpose.

The models are still loaded on the first `start()`, not on mount — most doctors reach this
screen without ever dictating, and neither the download nor the 640 MB should be spent on
them.

### What "once per visit" depends on

A `Worker` cannot outlive the document that created it. Neither can the two ONNX sessions
built inside it — those live in the worker's heap, not in the Cache API. So "once per visit"
holds exactly as long as the tab keeps the **same document**, and the boundary is drawn where
it should be:

| | Models kept? |
|---|---|
| Moving between views inside the doctor dashboard | yes — `history.replaceState()`, same document |
| Opening a different doctor from `/admin/physicians` | yes — App Router client navigation |
| Picking a patient in `/admin/patients` | yes — App Router client navigation |
| Signing out, or signing back in | no — deliberately a full load, which is also a state reset |
| Closing the tab and returning | no — nothing survives a document, by design |

That table is a property of how the app navigates, not of this feature, and it did not hold
until 2026-09-25. `AdminPhysicianPicker.tsx` linked to `/?doctorid=…` with a plain `<a>`, and
`AdminPatientPicker.tsx` navigated by assigning `window.location.href`. Both tear the document
down, so a doctor who opened a second patient paid the 3.3 s rebuild again — and, because the
modal reports bytes as they come back out of the Cache API (§4.3), it *looked* like a second
download even though the network was idle. Both are now `next/link` / `useRouter().push()`.

The trap for anyone adding a screen: a plain `<a href="/…">` to an in-app route is not
equivalent to a `<Link>` here. It is a full page load, and it silently costs the doctor a
3.3 s wait on their next dictation. Nothing fails, so nothing reports it.

Browser **back/forward** is a different mechanism and is *not* covered by the table above. It
leaves the document, so the only thing that can save the models is the back/forward cache
(bfcache), which freezes the whole document — worker included — instead of discarding it.

Four `beforeunload` listeners were moved to `pagehide` on 2026-09-25 to stop disqualifying the
document: `PhysicianReportsModifiedV41Timothy.tsx`, `tracking/hooks/index.ts`,
`tracking/lib/posthog.ts` and `tracking/lib/sessionRecorder.ts`. All four only flush tracking,
and `pagehide` fires on every unload `beforeunload` did, plus once more when the document is
frozen — so nothing buffered is lost. The doctor dashboard additionally listens for `pageshow`
with `persisted`, restarting the dwell clock so a restored visit is not billed the time spent
elsewhere.

Be precise about what that buys, because the browsers differ:

| | `beforeunload` blocks bfcache? |
|---|---|
| Firefox | yes — this change is what makes bfcache possible there at all |
| Chrome, Safari | no — `unload` blocks, `beforeunload` does not |

So on Chrome the swap is correct practice and removes a future hazard, but it is **not**
established that it was the thing forcing the reload. The other Chrome prerequisites do hold
here — the document is served `Cache-Control: s-maxage=31536000, stale-while-revalidate`, with
no `no-store`, and there are no `unload` handlers or WebSockets anywhere in `src/`.

**This could not be verified from the server.** Chrome disables bfcache whenever a DevTools or
CDP client is attached, and Playwright always attaches one — every run reports
`BackForwardCacheDisabledForDelegate` / `BackForwardCacheDisabledByCommandLine` regardless of
what the app does. Notably no *app-level* reason was ever reported, but that is weak evidence,
not a pass. The instrument that does work is Chrome DevTools → Application → Back/forward
cache → **Test back/forward cache**, run in a real browser on the deployment.

If bfcache turns out to decline there, the durable answer is to stop depending on it: give the
dashboard an in-app route back, so the round trip is a client-side navigation and falls under
the table above. bfcache is a heuristic the browser may refuse for reasons the app does not
control — memory pressure, an extension, a live GPU device — whereas keeping the document is
deterministic.

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

**Currently switched on.** `VOICE_INPUT_ENABLED` in `sttConstants.ts:20` is `true`. Setting it
to `false` is the single edit that takes the button off the screen and drops its tour step;
the models are then never fetched, because they only load on a click that can no longer
happen. (Assets stay on disk either way — the switch is client-side, not a deploy step.)

The button's label is derived, not stored:

| Condition | Label |
|---|---|
| `!supported` | `Voice unavailable` (disabled, reason in the tooltip) |
| `status === "loading"` | `Preparing…` (the detail is in the modal — see below) |
| `status === "finishing"` | `Finishing…` (disabled — see §4.1) |
| `status === "listening"` && speaking | `Listening…` (mic icon pulses) |
| `status === "listening"` && silent | `Stop` |
| otherwise | `Speak` |

**The loading modal.** While `status === "loading"`, `SttLoadingModal` covers the screen with
one progress row per file (§4.3) and a Cancel button. Three things about it are deliberate:

- **It waits 250 ms before appearing** (`APPEAR_AFTER_MS`). Only the first dictation of a
  visit downloads anything; every later one is answered from memory within a frame or two, and
  a window that flashes open and shut reads as a fault.
- **The backdrop does not dismiss it.** Cancel is explicit, because a stray click landing on
  the overlay would otherwise abandon a download the doctor is waiting on.
- **Cancel detaches rather than aborts.** The fetches already in flight finish into the
  browser's Cache API, so someone who cancels and clicks Speak again a minute later pays for
  the bytes once, not twice.

It is a modal, so it covers the input box and typing stops for its duration — the cost of
giving the explanation room. That is the accepted trade: it only ever appears on a visit's
first dictation, and the doctor who clicked Speak was not mid-sentence at the keyboard.

`finishing` is the only state in which the button is disabled while the feature is working
normally. Clicking through it would start a dictation that the pending flush is about to tear
down. The "review before scoring" warning beside the button stays up for it too, because that
is precisely when the text is still changing under the doctor.

**Placement.** Inside the input box, in a footer row below the text — the border, background
and focus ring belong to a wrapper `div`, and both the textarea and the button sit inside it.
It is deliberately *not* positioned over the textarea: a textarea's padding is part of its
scroll area, so a floating button would have text scrolling underneath it. Being in the
wrapper but outside the textarea makes overlap structurally impossible; measured at 0 px of
overlap with the box scrolled to the top and to the middle. The button is left-aligned so it
clears the resize handle in the opposite corner.

**Onboarding.** A "Dictate Your Re-write" step in the detail-view tour (`OnboardingTour.tsx`)
is anchored to `data-tour='rewrite-voice-button'`, and is spread into the step list only when
`VOICE_INPUT_ENABLED` is true — a step whose target is never rendered stalls the tour rather
than skipping it. It states the three things the
button cannot say for itself: dictated sentences land in the same box that can still be typed
in, the audio is never recorded or uploaded, and a greyed-out "Voice unavailable" means the
page was opened over plain http.

**Appending, not replacing.** `appendTranscript(previous, chunk)` joins each recognised
sentence to the existing contents with a single space, and attaches a leading `,.!?;:` without
one. It lives in `sttConstants.ts` rather than the hook because it is the one piece of this
feature worth unit-testing on its own.

**Cleanup.** `useEffect(() => stopImmediate, [stopImmediate])` releases the microphone and
closes the `AudioContext` if the doctor navigates away mid-dictation — first, so the browser's
recording indicator goes out immediately. Note it is `stopImmediate`, not `stop`: unmount has
no box left to deliver text into, so it skips the flush handshake rather than transcribing
into a dead callback. The worker is *not* terminated there: it is detached and told
to reset, and keeps both models for the rest of the visit. Only a worker that has failed
unrecoverably is thrown away, by `disposeSttWorker()`.

**Tracking.** Voice usage reuses the existing `rewrite_input` event with
`metadata: { source: "voice" }`. `event_type` is a Postgres enum, so a new value would have
needed a migration to record the same thing.

---

## 11. Key files

| Path | What to look at |
|---|---|
| `app/Webapp/src/lib/sttConstants.ts` | `VOICE_INPUT_ENABLED` (`:20`), model ids (`:31`, `:34`), asset paths (`:47`, `:54`), every threshold, `maxNewTokensFor()` (`:114`) — see §4.2, `SttAssetId` (`:142`) and `sttAssetIdFor()` (`:176`) — see §4.3, `SttWorkerMessage`, `appendTranscript()` |
| `app/Webapp/src/workers/stt.worker.ts` | **asset-origin block (`:61-68`) — see §5.4**, `DEVICE_DTYPE` (`:102`), `load()` (`:107`), `isSpeechFrame()` (`:166`), `resetSession()` (`:214`), `dispatchSentence()` (`:225`), `flush()` (`:258`) — see §4.1, `progress_callback` (`:119`) — see §4.3, state machine |
| `scripts/fetch-stt-assets.sh` | The manifest: repo ids, pinned revisions, per-file byte sizes. Run before every build; `--verify` to check without downloading |
| `app/Webapp/public/stt-models/`, `public/stt-wasm/` | The 223 MB the browser actually loads. Gitignored (`app/Webapp/.gitignore:158-163`) — fetched per deployment, never committed |
| `app/Webapp/src/lib/sttWorkerHost.ts` | `getSttWorker()`, `disposeSttWorker()` — why the worker outlives a dictation |
| `app/Webapp/src/hooks/useSpeechToText.tsx` | Secure-context probe (`:72`), `releaseWorker()` (`:88`), `stopImmediate()` (`:116`), `stop()` (`:137`) — see §4.1, Firefox fallback (`:246`), worklet wiring (`:256`) |
| `app/Webapp/src/__tests__/lib/sttConstants.test.ts` | `appendTranscript` joins and the `maxNewTokensFor` bounds that were actually broken (§4.2) |
| `app/Webapp/public/vad-processor.js` | `toTargetRate()` (`:45`), 512-sample framing (`:90`) |
| `app/Webapp/src/components/RewriteVoiceInput.tsx` | Button, label logic, disabled state |
| `app/Webapp/src/components/SttLoadingModal.tsx` | `APPEAR_AFTER_MS` (`:26`) — why the window is delayed, Cancel wiring |
| `app/Webapp/src/components/SttLoadingRow.tsx` | `sizeLabel()` — the `48.0 / 81.0 MB` text and the indeterminate warm-up bar |
| `app/Webapp/src/components/PhysicianReportsModifiedV41Timothy.tsx` | `handleVoiceText` (`:3886`), render site (`:4595`) |
| `app/Webapp/e2e/voice-input-cross-browser.spec.ts` | Capability probe, fake microphone, per-engine assertions |
| `app/Webapp/next.config.js`, `app/Webapp/.npmrc` | onnxruntime aliasing and the pre-minified bundle plugin |

---

## 12. Open items

1. **The truncation fix (§4.1, §4.2) has not been confirmed by a user.** Deployed
   2026-09-25 and covered by unit tests, but the symptom was reported from real dictation and
   only real dictation can close it. If words still go missing, the next thing to measure is
   the VAD boundary — whether the capture itself ends early — rather than the token bound,
   which is now well clear of any sentence length observed.
2. **Manual Safari check.** WPE WebKit passes; a real Mac or iPhone has not been tried.
3. **`COOP`/`COEP` headers** would make onnxruntime-web multi-threaded. Not sent today, so
   WASM inference is single-threaded.
4. **A lighter model** (63 MB int8-encoder moonshine-base, or 28 MB moonshine-tiny) if a
   clinician laptop proves too slow — one constant in the code, plus the manifest edit and
   re-fetch described at the end of §5.4.
5. **The self-hosted path has never been confirmed from a browser.** Every `/stt-models/`
   request in the access log so far is `curl`. The one production test to date hit the cache
   instead (§5.4). Until someone dictates from a profile with `transformers-cache` cleared and
   the encoder appears in `podman logs compass-nginx-tls`, treat "works behind a firewall" as
   designed-for, not demonstrated.
6. **Asset integrity is checked by byte size, not by hash.** `fetch-stt-assets.sh` pins a
   commit SHA and compares file lengths; it does not verify SHA-256 digests. Tracked in
   `STT_FEATURE_REPORT.md` §15.
7. **The certificate warning on `:3443`.** Removing it needs `_tls/ca.crt` imported on each
   client, or a hostname under a controlled domain so a publicly trusted certificate can be
   issued.
8. **`TARGET_SAMPLE_RATE` is duplicated** in `vad-processor.js` because a worklet cannot
   import. Any change to `SAMPLE_RATE` must be made in both places.
9. **Nothing unloads the models before the tab closes.** Once a doctor has dictated, ~640 MB
   stays resident for the rest of the visit, even if they never dictate again. An idle timer
   in `sttWorkerHost.ts` would cap that, at the price of the 3.3 s rebuild for anyone who
   comes back after it fires. Not added, because no one has reported memory pressure — the
   number to watch is a clinician laptop, not this server.
10. **The worker is a singleton with no owner check.** One `RewriteVoiceInput` is ever on
   screen, so two hooks driving the same worker cannot currently happen. If a second dictation
   surface is added, `sttWorkerHost.ts` needs to arbitrate rather than hand the same worker to
   both.
11. **Browser back/forward is unverified.** The four `beforeunload` listeners that would have
   disqualified the document are gone (§8), but whether Chrome now restores from bfcache
   cannot be measured from here — Chrome switches bfcache off whenever CDP is attached, which
   Playwright always does. Needs one run of DevTools → Application → Back/forward cache →
   Test, in a real browser. If it declines, add an in-app route back from the dashboard and
   stop depending on bfcache at all.
12. **The dashboard has no way out except the browser's back button.** `/?doctorid=…` renders
   no `next/link`, no `useRouter`, and no outbound `href`; `AdminTopBar` lives in
   `src/app/admin/layout.tsx`, which `/` is not under. That is why the client-side navigation
   fix in §8 covers getting *into* the dashboard but not back out of it, and it is the reason
   item 11 matters at all. A link back to `/admin/physicians` would close the loop
   deterministically — deferred because it is a product decision, not a speech one: a doctor
   arriving on their own public `?doctorid=` link has no picker to return to.
12. **Nothing stops the next plain `<a href="/…">` from undoing §8.** The property that keeps
   the models alive is "the app never does a full page load between screens", and it is held
   by convention across two pickers, not by a lint rule or a test. `jsx-a11y` has no rule for
   this; `@next/next/no-html-link-for-pages` covers `pages/` only, not the App Router.
