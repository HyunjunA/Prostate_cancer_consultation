# COMPASS Speech-to-Text — Consolidated Engineering, Licence and Security Report

**Scope** — the in-browser speech-to-text feature behind the **Speak** button in the Re-write Practice panel of the physician dashboard. `app/Webapp` only; nothing in the Backend, the database or the AI pipeline participates in transcription.
**Date of review** — 2026-09-25. All network checks were performed on this date.
**Basis** — source code in this repository, packages installed in `app/Webapp/node_modules`, recorded measurements, and live responses from the Hugging Face and GitHub APIs.

> **This is the single complete document for the feature.** It absorbs the engineering material previously kept in `SPEECH_TO_TEXT.md`, and supersedes it wherever the two differ — that file has statements that are now stale, itemised in §17. Nothing needs to be read alongside this report.
>
> **If this document diverges from the code, the code wins.**

---

# §0. What may this feature legally be used for? — plain-language answer

*Read this first. Everything here is expanded, with evidence, in §3–§6 and §10. Licence readings are marked **[L]** — they are a careful engineering reading of the licence texts, not legal advice from counsel.*

## The short answer

**As configured today, every licence permits unrestricted use — including commercial use — with one obligation that is currently unmet and one change that would break it.**

| Question | Answer |
|---|---|
| Can we use it for research? | **Yes.** No component restricts the field of use. |
| Can we use it clinically, with real patients? | **Yes,** as far as the *licences* are concerned. Health-data law is a separate question — see "The second gate" below. |
| Can we use it commercially — a paid product, a licensed deployment? | **Yes.** MIT and Apache-2.0 are both permissive, and the English Moonshine model is MIT. |
| Must we publish COMPASS source code? | **No.** Nothing here is copyleft (no GPL, no AGPL). |
| Must we pay anyone, or report usage? | **No.** No fees, no royalties, no usage reporting. |
| Can we modify it and keep the changes private? | **Yes.** |
| Is anything we must do still outstanding? | **Yes — one thing.** See "The one thing you owe" below. |

## What the feature is built from, and under what terms

Five things run in the clinician's browser. Two licences cover all of them. **[V]**

| Under **MIT** | Under **Apache-2.0** |
|---|---|
| Moonshine ASR model (English, base) | `@huggingface/transformers` 3.7.1 — the inference library |
| Silero VAD model | The ported `moonshine-web` example source (§2.6) — three files in this repo are derived from it |
| ONNX Runtime (`onnxruntime-web`, `onnxruntime-common`) | |
| `@huggingface/jinja` | |

Both are **permissive** licences. Neither is copyleft. In plain terms: *you may use, copy, modify, merge, publish, distribute, sublicense and sell this, for any purpose, provided you keep the notices.*

## The one thing you owe — and it is not done yet

> ⚠️ **Both licences ask for essentially the same thing: keep the notices with the software. COMPASS currently ships no licence notices at all.**
>
> The JavaScript bundle is served to every clinician's browser, which makes it a **distribution**. `app/Webapp` contains no `LICENSE`, no `NOTICE`, and no third-party-notices file. **[V]**
>
> - **MIT** asks that its copyright and permission notice travel with substantial portions of the software.
> - **Apache-2.0 §4(a)** asks that recipients be given a copy of the licence; **§4(b)** asks for prominent notices stating that files were changed.
>
> On a reasonable reading, neither is satisfied today. **[L]**
>
> **This is a paperwork gap, not a permission problem.** It does not make current use unlicensed or unlawful, and it is not a reason to stop using the feature. It is a condition attached to a grant you already have, and it is cheap to fix: add a `THIRD_PARTY_NOTICES.md` listing the components in §3 with their licence texts, reachable from the served app, and change the three `Ported from …` comments to read *"ported and modified from"*. See recommendation 4 (§16) and the detail in §5.
>
> Note this obligation **predates** the voice feature's port — `@huggingface/transformers` is Apache-2.0 and was already bundled. The port added a second Apache-2.0 work to a gap that already existed.

## The one change that would break the permission

> 🚩 **Do not switch to a non-English Moonshine model — Korean in particular — without a licence review.**

Moonshine is **not uniformly MIT**. Quoting the upstream `LICENSE` directly **[V]**:

> "The only speech-to-text models that are NOT MIT are the legacy non-streaming models for languages other than English, which remain under the Moonshine Community License, a non-commercial license."

| If `STT_MODEL_ID` points at… | Licence | Commercial use |
|---|---|---|
| **English models** (what COMPASS uses today: `moonshine-base-ONNX`) | MIT | **Unrestricted, irrevocable** |
| Any **streaming** model, any language | MIT | Unrestricted |
| Legacy **non-streaming** models for **Korean**, Japanese, Mandarin, Spanish, Arabic, Ukrainian, Vietnamese | **Moonshine Community Licence** | **Non-commercial by default.** Free commercially only below **US$1M** annual revenue, and the grant is **revocable** |

Changing one string in `sttConstants.ts` would move this deployment from an irrevocable permissive grant onto a revocable non-commercial one. §14.2 lists model swaps as a one-line tuning lever — the lever is real, but it is **not licence-neutral across languages**. §6 has the full text.

## What no licence here gives you

| Not granted | Meaning |
|---|---|
| **Patent rights (MIT components)** | MIT grants copyright permission only. It says nothing about patents. |
| **Patent grant is conditional (Apache-2.0)** | The patent grant **terminates** if you initiate patent litigation over the work (§3). |
| **Trademark rights** | Neither licence lets you use the names "Moonshine", "Hugging Face", "Silero", etc. to brand a product. |
| **Any warranty** | Both disclaim all warranties. Transcription accuracy is **your** risk — which is why the UI tells clinicians to review the text before use. |

## The second gate — licences are not the whole answer

**A licence tells you what you may do with the *software*. It says nothing about what you may do with *patient data*.** Those are independent, and both must be satisfied.

| Gate | Status |
|---|---|
| **Licence** (this section, §3–§6) | Clear for research, clinical and commercial use. One notice obligation outstanding. |
| **Health-data law** (§10) | The engineering fact is strong: **audio never leaves the browser**, no third party receives any of it, and since 2026-09-25 no third-party server is contacted at all (§7.1). No Business Associate Agreement is engaged for the speech vendors, because there are no speech vendors. **[V]** |

But two things about the *data* still need a human decision, and this report does not settle them: **[L]**

1. **The transcript is stored.** Dictated text is written to `doctor_rewrite_log` in the COMPASS database when the clinician clicks Score (§7.2). That is first-party storage, not a third-party disclosure — but it belongs in the data inventory, and the privacy office should say so in writing. Recommendation 8.
2. **The legal conclusion is a reading, not a ruling.** §10 sets out the HIPAA analysis and why it points the way it does. It is engineering reasoning about legal text. Have the privacy office and IRB confirm it for your actual use.

> **Bottom line.** The licences let you use this feature for anything, including clinical and commercial use. Add the third-party notices, keep the model English, and get the data-side sign-off in writing — then nothing here is blocking.

---

## Contents

| § | Section |
|---|---|
| **0** | **[What may this feature legally be used for? — plain-language answer](#0-what-may-this-feature-legally-be-used-for--plain-language-answer)** — start here |
| 1 | [Executive summary](#1-executive-summary) |
| 2 | [Architecture, code flow and provenance](#2-architecture-code-flow-and-provenance) |
| 3 | [Components and licences](#3-components-and-licences) |
| 4 | [How each licence was verified](#4-how-each-licence-was-verified) |
| 5 | [Licence obligations, and an open compliance gap](#5-licence-obligations-and-an-open-compliance-gap) |
| 6 | [Moonshine dual licence — the boundary condition](#6-moonshine-dual-licence--the-boundary-condition) |
| 7 | [Data flow — what actually leaves the machine](#7-data-flow--what-actually-leaves-the-machine) |
| 8 | [Download size — corrected](#8-download-size--corrected) |
| 9 | [Security properties](#9-security-properties) |
| 10 | [HIPAA and protected health information](#10-hipaa-and-protected-health-information) |
| 11 | [Institutional environment risks](#11-institutional-environment-risks) |
| 12 | [Resource use — measured](#12-resource-use--measured) |
| 13 | [Browser support and browser-specific behaviour](#13-browser-support-and-browser-specific-behaviour) |
| 14 | [Operations and tuning guide](#14-operations-and-tuning-guide) |
| 15 | [Supply-chain and code findings](#15-supply-chain-and-code-findings) |
| 16 | [Recommendations](#16-recommendations) |
| 17 | [Limitations, and what this supersedes](#17-limitations-and-what-this-supersedes) |
| 18 | [References](#18-references) |

---

## How to read this report

Every substantive claim carries one of three marks. Claims that could not be substantiated were removed rather than softened.

| Mark | Meaning |
|---|---|
| **[V]** | **Verified.** Reproduced against source code in this repository, an installed package, a recorded measurement, or a live API response retrieved on 2026-09-25. |
| **[E]** | **Estimate or unverified.** Not measured in this deployment, or resting on published platform documentation rather than a test performed here. |
| **[L]** | **Legal reading.** The underlying facts are verified, but the conclusion drawn from them should be confirmed by institutional counsel or the privacy office before it is relied on. |

---

## Summary

| Item | Finding |
|---|---|
| Feature | In-browser speech-to-text for the Re-write Practice panel |
| **Provenance** | Ported from the official Transformers.js **`moonshine-web`** example — **Apache-2.0**. Three files, source-credited. See §2.6. **[V]** |
| ASR model | `onnx-community/moonshine-base-ONNX` (English) — **MIT** **[V]** |
| VAD model | `onnx-community/silero-vad` — **MIT** **[V]** |
| Inference library | `@huggingface/transformers` 3.7.1 — **Apache-2.0** **[V]** |
| Execution runtime | `onnxruntime-web` 1.22.0-dev.20250409-89f8206ba4 — **MIT** **[V]** |
| **Does audio leave the browser?** | **No.** No network or storage path in the speech-to-text code carries audio or audio-derived buffers. **[V]** |
| **Third-party origins contacted** | **None, as of 2026-09-25.** Every asset is served by the COMPASS server, and remote loading is disabled in code so a missing file fails rather than reaching the internet. Previously two — `huggingface.co` and `cdn.jsdelivr.net`. See §7.1. **[V]** |
| **Is the dictated text stored?** | **Yes.** On **Score** the text is saved to `doctor_rewrite_log` in the COMPASS database. This is first-party storage and is by design. **[V]** |
| First-use download | ≈ **160 MB** on the WebGPU path, ≈ **129 MB** on the WASM path **[V]** |
| Steady-state cost | 1.6 s per sentence, +645 MB resident, 0.16 s to start after the first dictation **[V]** |
| BAA for the audio signal | **Not triggered** on these facts — no audio reaches any third party. Privacy-office confirmation still recommended. **[L]** |
| Open items | **No third-party licence notices shipped** (§5); assets verified by byte size rather than SHA-256 (§15); the 250 ms noise filter is unreachable — a defect inherited from upstream. Revision pinning was resolved by self-hosting on 2026-09-25. See §15. **[V]** |

---

## 1. Executive summary

The **Speak** button converts spoken input into text in the rewrite box. Voice activity detection and speech recognition both run **inside the browser tab**, in a Web Worker, using two ONNX models that are downloaded once and then read back from the browser cache. **[V]**

**Microphone audio is never transmitted and never persisted.** An exhaustive review of `stt.worker.ts`, `useSpeechToText.tsx`, `sttWorkerHost.ts`, `sttConstants.ts`, `RewriteVoiceInput.tsx` and `vad-processor.js` found no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `MediaRecorder`, or any use of `localStorage`, `sessionStorage`, `IndexedDB`, the Cache API or the File API that carries audio. The only path audio takes is an in-tab `postMessage` from the AudioWorklet to the Worker — a same-origin structured clone, never a network target. The Worker's outbound message type union (`sttConstants.ts:77-83`) contains no buffer variant, so it is structurally incapable of returning audio to the page. **[V]**

Because no audio reaches an external party, that party receives no protected health information, and on these facts a Business Associate Agreement is not triggered **for the audio signal**. That is a legal conclusion drawn from a verified engineering fact, and it is recorded here as such rather than asserted as settled. **[L]**

All components are under permissive licences — MIT for both models and the ONNX runtime, Apache-2.0 for the inference library. **[V]** One licence condition constrains future changes: **Moonshine is dual-licensed**, and the MIT grant applies here only because this deployment uses the **English** model. §6 sets out the boundary precisely.

This code is **a port of the official Transformers.js `moonshine-web` example**, not original work; §2.6 sets out exactly which files and how far the port goes. That is disclosed in the source comments, but it carries an Apache-2.0 obligation — see §5. **[V]**

Four things this review corrects in earlier documentation, and which matter operationally:

1. **The download is larger than previously stated on the common path.** Chrome and Edge fetch ≈ 160 MB, not ≈ 123 MB. §8 also explains why "123" propagated — it meant three different quantities in three different places.
2. **A second third-party origin was undisclosed — and both have since been removed.** The ONNX runtime's WASM binaries came from `cdn.jsdelivr.net`, not from Hugging Face, so a firewall allowance naming only Hugging Face would not have been sufficient. Finding that is what prompted self-hosting on 2026-09-25: every asset is now served by the COMPASS server and remote loading is disabled in code. §7.1, §11, §14.5.
3. **"Only text is sent for scoring" understated what happens.** The dictated text is also written to the database, and a per-utterance telemetry event marks it as voice-sourced. Both go to the COMPASS backend — first party, not third party — but a privacy review should state them. §7.
4. **The provenance and its licence were undisclosed, and no licence notices are shipped.** The bundle carries MIT and Apache-2.0 code but `app/Webapp` contains no `LICENSE`, `NOTICE` or third-party-notices file. §2.6, §5.

---

## 2. Architecture, code flow and provenance

### 2.1 Design premise — the audio never leaves the tab

This is the single decision everything else follows from. Two conventional options were rejected: **[V]**

| Option | Why not |
|---|---|
| Browser `SpeechRecognition` / `webkitSpeechRecognition` | Streams the microphone to a browser-vendor service. Absent in Firefox, prefixed in Safari. |
| A server-side transcription endpoint | Creates an upload path for consultation speech, and therefore a vendor boundary to argue about. |

Instead the model runs client-side via `@huggingface/transformers` on ONNX Runtime Web. The consequences:

- **The vendor-disclosure question is resolved by construction.** The path is microphone → `AudioContext` → Web Worker → text. There is no upload to disable, so no vendor boundary exists for the audio. (The earlier engineering note phrased this as "no BAA is required" — see §10, where it is stated as a legal reading rather than a flat fact.)
- **No audio is stored.** No disk, no IndexedDB, no network. The only cached artefact is the model weights, in the browser's Cache API, on first visit. **Note:** the *transcript* is a different matter — it is stored in the COMPASS database on Score. §7.
- **The cost moves to the client.** A one-time download and CPU inference on the clinician's own machine. §12 records what that actually costs.

### 2.2 Threads

Three execution contexts, deliberately. Inference on the UI thread would stall the dashboard; audio capture anywhere but the audio rendering thread drops frames. **[V]**

```
┌─ UI thread ────────────────────────────────────────────────────────────────┐
│  RewriteVoiceInput.tsx        button, label, disabled state                 │
│  useSpeechToText.tsx          getUserMedia → AudioContext → worklet+worker  │
│        ▲ text                                    │ 512-sample frames        │
└────────┼─────────────────────────────────────────┼─────────────────────────┘
         │                                         │
         │                    ┌─ Audio rendering thread ──────────────────────┐
         │                    │  public/vad-processor.js                      │
         │                    │    128-sample blocks → (resample to 16 kHz)   │
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

**The only thing that ever crosses from the worker back to the page is a string.** **[V]**

### 2.3 Code flow, step by step

Line numbers were read directly where cited; elsewhere the symbol name is given, because line numbers drift between revisions. **[V]**

| Step | Where | What happens |
|---|---|---|
| **1. User clicks Speak** | `RewriteVoiceInput.tsx` | Calls `start()` on the `useSpeechToText` hook. The button renders only when `VOICE_INPUT_ENABLED` is `true` in `sttConstants.ts:20`, so with the switch off no model is ever requested. |
| **2. Secure-context check** | `useSpeechToText.tsx:54-59` | `if (!window.isSecureContext)` → `"Voice input needs a secure connection (HTTPS or localhost)."`; `else if (!navigator.mediaDevices?.getUserMedia)` → `"This browser does not support microphone capture."` The button is then disabled and labelled `"Voice unavailable"`; the reason appears only in the `title` tooltip. The flow stops before any download. |
| **3. Worker acquisition** | `sttWorkerHost.ts:20-28` | `getSttWorker()` returns a module-level singleton `new Worker(url, { type: "module" })`. One worker per page session, reused across dictations. The hook posts `{ type: "reset" }` then `{ type: "load" }`. |
| **4. Device selection** | `stt.worker.ts:59-67`, `:78` | `supportsWebGPU()` probes `navigator.gpu.requestAdapter()` and selects `"webgpu"` or `"wasm"`. This choice decides which decoder quantisation is downloaded — see §8 and §14.2. |
| **5. Model load** | `stt.worker.ts:89-99` | `AutoModel.from_pretrained(VAD_MODEL_ID, { dtype: "fp32" })` and `pipeline("automatic-speech-recognition", STT_MODEL_ID, { device, dtype: DEVICE_DTYPE[device] })`. Neither call passes a `revision`, which no longer matters: both resolve against `public/stt-models/`, whose contents were fetched at a pinned revision (§7.1). Re-entry is short-circuited at `:212-215` when already loaded, so `ready` comes straight back on later dictations. |
| **6. Warm-up** | `stt.worker.ts:102` | The transcriber runs once over one second of silence so WebGPU shaders compile before the first real sentence. |
| **7. Microphone and framing** | `useSpeechToText.tsx:151-159`, `public/vad-processor.js` | `getUserMedia` requests `channelCount: 1`, `echoCancellation: true`, `autoGainControl: true`, `noiseSuppression: true`, `sampleRate: 16000`. The sample rate is a **request, not a guarantee**; when the context rate differs, the AudioWorklet resamples (`vad-processor.js:29,46`). 128-sample blocks are accumulated into fixed 512-sample frames. |
| **8. Detection and transcription** | `stt.worker.ts:142-144`, `sttConstants.ts` | A frame counts as speech when `score > 0.3`, or `score >= 0.1` while already recording. 400 ms of silence closes a sentence. Each dispatched segment is padded by 80 ms on each side. The closed segment goes to Moonshine, which returns text. Full state-machine detail in §14.1. |
| **9. Append, telemetry, stop** | `sttConstants.ts`, `useSpeechToText.tsx:76-87`, `PhysicianReportsModifiedV41Timothy.tsx:3814-3824` | `appendTranscript()` adds the text to the textarea. **A behaviour event is then POSTed to the COMPASS backend** carrying the topic, sentence index, character count and `source: "voice"` — no audio and no transcript content. On stop, media tracks are stopped, `AudioContext.close()` is called, and `{ type: "reset" }` bumps a session epoch so in-flight transcriptions are discarded (`stt.worker.ts:150,154,175-183`). |

### 2.4 Worker message protocol

`SttWorkerMessage` in `sttConstants.ts:77-83` is the complete contract. **This table is the evidence for the central security claim:** there is no message variant capable of carrying audio out of the worker. **[V]**

| Worker → page | Meaning | Hook's reaction |
|---|---|---|
| `{ type: "loading", message }` | Download started | (status is already `loading`) |
| `{ type: "progress", progress }` | 0–100 across **both** models | `setProgress` → `Loading… N%` |
| `{ type: "ready" }` | Warm-up inference done | `setStatus("listening")` |
| `{ type: "speech", active }` | VAD entered/left a sentence | `setSpeaking` → mic icon pulses, label reads `Listening…` |
| `{ type: "text", text }` | One recognised sentence | `onText(text)` |
| `{ type: "error", message }` | Load or inference failure | `setStatus("error")`, message shown beside the button |

| Page → worker | Meaning |
|---|---|
| `{ type: "load" }` | Load both models. Already loaded — the normal case after the first dictation — is answered with `ready` immediately, so the page never waits. |
| `{ type: "reset" }` | Forget the previous dictation: the rolling buffer, the pre-speech frames, the VAD's recurrent state. Sent at both the start and the end of every dictation. |
| `{ buffer }` | One 512-sample frame from the worklet. No `type` field; the worker treats any message without one as audio. |

`reset` also bumps a session counter that a transcription in flight compares against when it finishes. Without it, a sentence whose inference was still running when the clinician pressed Stop would appear in the box a second or two later. **[V]**

### 2.5 Source files

Six files, one per responsibility. None exceeds 280 lines. **[V]**

| File | Lines | Role |
|---|---|---|
| `src/components/RewriteVoiceInput.tsx` | 108 | The button. Presentation only — label, colours, disabled state, error text. |
| `src/hooks/useSpeechToText.tsx` | 222 | Browser plumbing: permission, `AudioContext`, worklet, microphone lifetime, cleanup. |
| `src/lib/sttWorkerHost.ts` | 41 | Owns the worker's lifetime — one per page visit, shared by every dictation. `disposeSttWorker()` terminates it on an uncaught worker error. |
| `src/workers/stt.worker.ts` | 276 | Both models, all inference, and the sentence-boundary state machine. |
| `public/vad-processor.js` | 113 | `AudioWorklet` on the audio rendering thread: re-chunks and rate-converts the mic stream. |
| `src/lib/sttConstants.ts` | 89 | Model ids, every tuning constant, the worker message union, `appendTranscript()`. |

**The split between the hook and `sttWorkerHost.ts` is the important one.** The **microphone** belongs to a single dictation and is released the moment it ends; the **models** belong to the visit. Putting both in the hook meant a component unmount — which happens every time a clinician moves between sentences — threw the models away too, at 3.3 s per rebuild. **[V]**

Consumer: `PhysicianReportsModifiedV41Timothy.tsx` imports the button (`:33`) and renders it (`:4595`) in the footer row of the re-write input box, feeding `handleVoiceText` (`:3886`).

Test coverage: `src/__tests__/lib/sttConstants.test.ts` (unit, `appendTranscript`) and `e2e/voice-input-cross-browser.spec.ts` (Playwright, three engines — §13).

Build configuration lives in `next.config.js` and `.npmrc` — see §14.3.

### 2.6 Provenance — this code is a port of the Transformers.js `moonshine-web` example

The speech-to-text path is **not original work**. Three files are ports of the official Hugging Face example at `huggingface/transformers.js-examples/moonshine-web`, and each carries a source comment saying so. **[V]**

| COMPASS file | Upstream original | Relationship |
|---|---|---|
| `src/lib/sttConstants.ts` (`:9`) | `moonshine-web/src/constants.js` | **Value-for-value identical.** Every tuning constant — `0.3`, `0.1`, `400 ms`, `80 ms`, `250 ms`, `30 s`, `512`, and the `Math.ceil(SPEECH_PAD_SAMPLES / NEW_BUFFER_SIZE)` expression — matches upstream in value and order. Comments were rewritten; COMPASS adds `VOICE_INPUT_ENABLED`, the typed message union and `appendTranscript()`. |
| `src/workers/stt.worker.ts` (`:13`) | `moonshine-web/src/worker.js` | **Semantically equivalent** TypeScript translation. Buffering and sentence-close logic are line-for-line the same; `dispatchForTranscriptionAndResetAudioBuffer` was renamed `dispatchSentence`, and untyped `status` messages became the typed union. COMPASS adds the session-epoch reset. |
| `public/vad-processor.js` (`:11`) | `moonshine-web/src/processor.js` | Ported, with the rate-based resampler added for contexts that are not already at 16 kHz. |

The example pins `@huggingface/transformers` at **3.7.1** — the same version COMPASS resolves, consistent with the dependency having been taken from the example. **[V]**

**Why this matters.**

1. **The licence position gains a fourth component.** `huggingface/transformers.js-examples` is **Apache-2.0** (repository-root `LICENSE`, 11,357 bytes; **no `NOTICE` file**, and no per-example `LICENSE`). See §5. **[V]**
2. **A defect in §15.1 is inherited, not introduced here.** The unreachable 250 ms filter exists identically upstream at `worker.js:211,217`. Attributing it to COMPASS would be wrong, and fixing it locally leaves the upstream example — and everyone else using it — unchanged. **[V]**
3. **The audio-confinement property is inherited too.** The upstream example is likewise fully local. The verification in §9 was performed against the COMPASS source as it stands, so the conclusion holds regardless of origin; but future upstream merges must be re-checked rather than assumed safe.

---

## 3. Components and licences

| Component | Identifier | Version / revision | Licence | Basis |
|---|---|---|---|---|
| ASR model | `onnx-community/moonshine-base-ONNX` | `b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad` (2025-01-18) | **MIT** | Model-card metadata; binding text upstream |
| ASR upstream | `moonshine-ai/moonshine-base` (formerly `UsefulSensors`) | `7a73d8d55ac0ba2ef3ae761593f6784b51f96dcf` | **MIT** | README front matter + repository `LICENSE` |
| VAD model | `onnx-community/silero-vad` | `e71cae966052b992a7eca6b17738916ce0eca4ec` | **MIT** | `LICENSE` file in the repository |
| VAD upstream | `snakers4/silero-vad` | current `main` | **MIT** | GitHub licence API, `spdx_id` = `MIT` |
| Inference library | `@huggingface/transformers` | 3.7.1 | **Apache-2.0** | `LICENSE` + `package.json` in `node_modules` |
| Execution runtime | `onnxruntime-web` | `1.22.0-dev.20250409-89f8206ba4` | **MIT** | `package.json` in `node_modules` |
| Runtime common | `onnxruntime-common` | 1.21.0 | **MIT** | `package.json` in `node_modules` |
| Template engine | `@huggingface/jinja` | 0.5.10 | **MIT** | `package.json` in `node_modules` |
| **Ported source** | `huggingface/transformers.js-examples` → `moonshine-web` | `main` | **Apache-2.0** | Repository-root `LICENSE`; **no `NOTICE` file**. See §2.6 |

> Earlier documentation omitted both the ONNX runtime packages and the ported example. They execute in the browser and are therefore in scope for licence review. `sharp` (Apache-2.0) is a declared dependency of the inference library but is aliased to `false` in `next.config.js`, so it is not shipped to the browser. **[V]**

---

## 4. How each licence was verified

Recorded so a reviewer can repeat the check.

| Claim | Method | Result |
|---|---|---|
| The ONNX ASR model is MIT | `GET https://huggingface.co/api/models/onnx-community/moonshine-base-ONNX` | `cardData.license` = `"mit"`; tag `license:mit`; revision `b1e9b6a` |
| That repository carries **no** `LICENSE` file | `GET .../onnx-community/moonshine-base-ONNX/raw/main/LICENSE` | **HTTP 404.** The MIT statement exists only as model-card metadata, so the binding text is upstream. |
| The ONNX model derives from the **English** base model | `cardData.base_model` on the same response | `["UsefulSensors/moonshine-base"]`, tag `base_model:moonshine-ai/moonshine-base` |
| The upstream base model is MIT and English | Model API + README front matter for `moonshine-ai/moonshine-base` | `license: mit`, `language: [en]`, `arxiv: 2410.15608` |
| The binding upstream licence text | `GET https://raw.githubusercontent.com/moonshine-ai/moonshine/main/LICENSE` | 14,180 bytes. MIT in Section 1; a separate Community Licence in Section 2. |
| Why GitHub cannot classify that file | `GET https://api.github.com/repos/moonshine-ai/moonshine` | `license.spdx_id` = `"NOASSERTION"`, name `"Other"` — because the file combines two licences. Expected, not a defect. |
| Silero VAD is MIT | `GET https://api.github.com/repos/snakers4/silero-vad` + the mirror's `LICENSE` | `spdx_id` = `"MIT"`; mirror ships an MIT licence naming the Silero Team |
| The inference library is Apache-2.0 | Read `node_modules/@huggingface/transformers/LICENSE` and `package.json` | File is the Apache Licence 2.0; package declares `"Apache-2.0"` at 3.7.1 |
| The ONNX runtime is MIT | Read `node_modules/onnxruntime-web/package.json` | `"MIT"`, version `1.22.0-dev.20250409-89f8206ba4` |
| The ported example is Apache-2.0 | `GET https://raw.githubusercontent.com/huggingface/transformers.js-examples/main/LICENSE` | Apache Licence 2.0, 11,357 bytes. Repository-root `NOTICE` and per-example `LICENSE` both **HTTP 404**. |
| Which model files are actually fetched | Read `node_modules/@huggingface/transformers/src/utils/dtypes.js` | `DEFAULT_DTYPE_SUFFIX_MAPPING`: `q8` → `_quantized`, `q4` → `_q4`, `fp32` → no suffix. This fixes the byte counts in §8. |

---

## 5. Licence obligations, and an open compliance gap

| Licence | Applies to | What must be done | What is **not** granted |
|---|---|---|---|
| **MIT** | Moonshine English models, Silero VAD, ONNX Runtime, Jinja | Retain the copyright notice and the permission notice in all copies or substantial portions of the software | **No patent licence.** No warranty. No trademark rights. |
| **Apache-2.0** | `@huggingface/transformers`, **and the ported `moonshine-web` example source (§2.6)** | Give recipients a copy of the licence (§4(a)); carry prominent notices stating that the files were changed (§4(b)); retain attribution notices from the source form (§4(c)) | No trademark rights. The patent grant **terminates** if the licensee initiates patent litigation over the work (§3). |

Neither licence is copyleft. There is no obligation to publish COMPASS source code, no usage fee, and no field-of-use restriction for the components above. **[V]**

COMPASS loads the model weights at runtime into the end user's browser and does not redistribute them, so obligations that attach to *distribution* are largely not engaged for the weights. **[L]**

> ### ⚠️ Open compliance gap — no licence notices are shipped
>
> The JavaScript bundle *is* distributed: it is served to every clinician's browser. That bundle contains MIT code (ONNX Runtime, Jinja) and Apache-2.0 code (`@huggingface/transformers`, plus the ported example source of §2.6). **[V]**
>
> A search of `app/Webapp` for any `LICENSE`, `NOTICE` or third-party-notices file returns **nothing**. **[V]** Apache-2.0 §4(a) asks that recipients be given a copy of the licence, and MIT asks that its permission notice travel with substantial portions of the software. On a reasonable reading, neither is currently satisfied. **[L]**
>
> This obligation existed **before** the example was ported — `@huggingface/transformers` is itself Apache-2.0 and is bundled regardless. The port does not create the gap; it adds a second Apache-2.0 work to it.
>
> **The fix is small:** add a `THIRD_PARTY_NOTICES.md` to the webapp listing the components in §3 with their licence texts, and reachable from the served application. The three ported files already carry `Ported from …` comments, which go most of the way toward §4(b); making them read *"ported and modified from"* would close it. See recommendation 4.

---

## 6. Moonshine dual licence — the boundary condition

> ⚠️ **This is the one licence condition that constrains future changes.**
> Moonshine is not uniformly MIT. The MIT grant covers this deployment **because it uses the English model.** An exhaustively enumerated list of legacy non-English models is published under a separate, non-commercial licence.

Quoting the upstream `LICENSE` file directly **[V]**:

> "The only speech-to-text models that are NOT MIT are the legacy non-streaming models for languages other than English, which remain under the Moonshine Community License, a non-commercial license."

| Model family | Licence | Commercial use |
|---|---|---|
| **English** models at every size — **including the base model COMPASS uses** | MIT | Unrestricted |
| All **streaming** models, in every language | MIT | Unrestricted |
| Legacy **non-streaming** models for Arabic, Japanese, **Korean**, Mandarin, Spanish, Ukrainian, Vietnamese (Base and Tiny) | **Moonshine AI Community Licence** | **Non-commercial by default.** Commercial use free only below **US$1,000,000** annual revenue. The grant is **revocable**, non-transferable and non-sublicensable. |
| Text-to-speech and grapheme-to-phoneme models and data | Per their own readmes | Not covered by the MIT default; derived from third-party work |

**Practical consequence.** Changing `STT_MODEL_ID` in `sttConstants.ts` to a non-English legacy Moonshine model — **Korean in particular** — would move this deployment from a permissive, irrevocable MIT grant onto a revocable non-commercial licence. Any such change must be reviewed before it ships. **The current configuration is compliant.** **[V]** / **[L]**

> This interacts directly with §14.2, which lists model swaps as a one-line tuning lever. The lever is real, but it is **not** licence-neutral across languages.

---

## 7. Data flow — what actually leaves the machine

### 7.1 Self-hosting — both third-party origins removed

Implemented 2026-09-25. Previously the browser fetched model weights from `huggingface.co` and the ONNX Runtime WASM binaries from `cdn.jsdelivr.net`. Both are now served by the COMPASS server. **[V]**

| | Before | Now |
|---|---|---|
| Model weights | `https://huggingface.co/{model}/resolve/main/` (library default, `env.js:142-143`) | `/stt-models/{model}/` — `public/stt-models/`, 201 MB |
| ORT WASM binaries | `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1/dist/` (`backends/onnx.js:185`) | `/stt-wasm/` — `public/stt-wasm/`, 21.6 MB |
| Revision | `'main'`, resolved per client at download time | Pinned: ASR `b1e9b6a`, VAD `e71cae9` |
| If a file is absent | Silently fetched from the internet | **Error.** Remote loading is off |

Four lines in `stt.worker.ts` do it, set at module scope so they run before any session is created:

```ts
env.allowLocalModels = true;
env.localModelPath = STT_MODEL_PATH;   // "/stt-models/"
env.allowRemoteModels = false;         // the structural guarantee
if (env.backends.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = STT_WASM_PATH;
```

**`allowRemoteModels = false` is what makes this a property rather than a preference.** With it, a file missing from `public/` throws at `hub.js:536` instead of falling through to `getFile(remoteURL)` at `hub.js:553`. The feature fails closed, and cannot quietly resume contacting Hugging Face because someone forgot to copy a file. **[V]**

Populate the directories with `bash scripts/fetch-stt-assets.sh` (§14.5). Both decoder quantisations are fetched, because the worker picks `q4` on WebGPU and `quantized` on WASM and either may now be required.

Verified on a live server: all 9 model files and both WASM files return HTTP 200 at the expected byte counts, `.wasm` is served as `application/wasm`, and `silero-vad/config.json` returns 404 — which is correct, as it does not exist upstream either and the worker injects that config directly. **[V]**

> **What did not change.** The microphone path. Audio confinement (§9) never depended on where the weights came from, and this change does not weaken or strengthen it.

### 7.2 What crosses the network

| Event | Destination | Payload | Notes |
|---|---|---|---|
| **First dictation of a browser profile** | **COMPASS server**, same origin | ≈ 160 MB or ≈ 129 MB of model weights | Served from `public/stt-models/`. Once per browser profile. Was `huggingface.co` before 2026-09-25. **[V]** |
| **ONNX runtime initialisation** | **COMPASS server**, same origin | WASM binaries for onnxruntime-web | Served from `public/stt-wasm/`. **These are not in `transformers-cache`** — only the ordinary HTTP cache applies, so revalidation traffic is expected. Was `cdn.jsdelivr.net` before 2026-09-25. **[V]** |
| **Every later dictation, same session** | none | 0 bytes | Models stay resident in the worker (`stt.worker.ts:212-215`) **[V]** |
| **While dictating** | none | 0 bytes | Audio frames stay inside the Web Worker. No request carries audio. **[V]** |
| **Per recognised utterance** | COMPASS backend, same-origin `/api/backend/track-*` | topic, sentence index, character count, `source: "voice"` | Usage telemetry, reusing the existing `rewrite_input` event because `event_type` is a Postgres enum and a new value would need a migration. **No audio, no transcript content.** `PhysicianReportsModifiedV41Timothy.tsx:3818-3824` → `track.ts:151` **[V]** |
| **Clicking Score** | COMPASS backend, same-origin `/api/backend/doctor/score-sentence` | the textarea text | Same-origin relative path; scheme is whatever the page used — HTTPS in the deployed configuration. **[V]** |
| **On a successful Score** | COMPASS backend, `PUT /api/backend/doctor/rewrites` | `original_sentence`, `revised_sentence` | **The dictated text is persisted to `doctor_rewrite_log`.** `useDoctorData.tsx:558,585-608` **[V]** |

**Two corrections to earlier documentation.**

- It named only the Hugging Face CDN. **`cdn.jsdelivr.net` was a second third-party origin** executing code in the clinician's tab — undisclosed until this review. Finding it is what made §7.1 necessary: a firewall allowance naming only Hugging Face would have left voice input broken with no obvious cause. Both origins are now gone.
- It said Score "sends text only". Score also **stores** that text in the COMPASS database. A stale comment at `PhysicianReportsModifiedV41Timothy.tsx:3829` reads `// Score-only handler: no DB save` and contradicts the code. **[V]**

**The backend hop.** The browser posts to a same-origin path. The Next.js proxy (`src/app/api/backend/[...path]/route.ts`) forwards it server-side to `http://localhost:18001` over **plain HTTP on loopback**, injecting the API key. Port 18001 is a server-side hop, never a browser target. **[V]**

**Metadata disclosure to the CDNs — eliminated.** Fetching from `huggingface.co` and `cdn.jsdelivr.net` disclosed the clinician's IP address, timing and user agent to those hosts. That was not protected health information, but it was a third-party disclosure of metadata. Self-hosting (§7.1) removes it: the only host that now sees those requests is the COMPASS server itself. **[V]** / **[L]**

---

## 8. Download size — corrected

Earlier documentation quoted a single figure of "≈ 123 MB". The worker selects a different decoder quantisation depending on WebGPU availability, so Chrome and Edge — the common case — download substantially more. **[V]**

| Path | Encoder | Decoder | Tokeniser + VAD | Total |
|---|---|---|---|---|
| **WebGPU** (Chrome, Edge) | `encoder_model.onnx`, fp32, **80.82 MB** | `decoder_model_merged_q4.onnx`, q4, **72.78 MB** | 3.90 + 2.24 MB | **≈ 159.7 MB** (152.3 MiB) |
| **WASM** (no WebGPU adapter) | `encoder_model.onnx`, fp32, **80.82 MB** | `decoder_model_merged_quantized.onnx`, q8, **42.50 MB** | 3.90 + 2.24 MB | **≈ 129.5 MB** (123.5 MiB) |

Sizes are byte counts returned by the Hugging Face blob API for revision `b1e9b6a`. The mapping from the dtype named in `DEVICE_DTYPE` to the file actually requested was confirmed in the library source. **[V]**

### Why "123" propagated — it meant three different things

This is worth recording, because the coincidence is what made the error durable. **[V]**

| Where "123" appeared | What it actually measured | Value |
|---|---|---|
| Engineering note, model comparison table | Encoder + decoder **only**, decimal MB, WASM path — no tokeniser, no VAD | 80.82 + 42.50 = **123.32 MB** |
| Engineering note, CacheStorage measurement | **All 8 cache entries**, in **MiB**, WASM path | **123.46 MiB** |
| Earlier report, headline figure | Quoted as the universal download size for every browser | "≈ 123 MB" |

The first two are different quantities that happen to round to the same number; the third generalised a WASM-path measurement to all browsers. **Cross-validating them confirms both are right in their own terms:** 123.46 MiB = 129.5 MB decimal, which matches the API byte counts file-by-file to three significant figures (encoder 80.82 MB = 77.07 MiB, decoder 42.50 MB = 40.53 MiB, tokenizer 3.76 MB = 3.59 MiB, VAD 2.243 MB = 2.14 MiB). Two independent methods agree.

> **Plan firewall allowances and cache-quota guidance against ≈ 160 MB**, not the lower figure. The lower figure describes only browsers without a WebGPU adapter.

**Caching.** Weights are stored in the Cache API under `transformers-cache` (`hub.js:452`), enabled by the library default `useBrowserCache` (`env.js:150`). If `caches.open()` is unavailable or throws, the library logs a warning and proceeds **uncached**, re-downloading on every visit — now from the COMPASS server rather than across the internet, so the failure mode is far cheaper than it was. **[V]**

The repository configures four library settings and no others, all in `stt.worker.ts`: `allowLocalModels`, `localModelPath`, `allowRemoteModels` and `wasmPaths` (§7.1). `useBrowserCache` and `numThreads` are left at their defaults. Before 2026-09-25 nothing was configured at all, which is why every origin and revision in this report was a library default rather than a project decision. **[V]**

---

## 9. Security properties

| Property | Detail | Mark |
|---|---|---|
| Audio does not leave the browser | No `fetch`, `XHR`, `WebSocket`, `sendBeacon` or `MediaRecorder` in the STT path. The only audio transfer is an in-tab `postMessage` structured clone. | **[V]** |
| Audio is never persisted | No `localStorage`, `sessionStorage`, `IndexedDB`, Cache API or File API write of audio anywhere in the STT path. Only model files are cached. | **[V]** |
| The worker cannot return audio | The outbound message union (§2.4) has no buffer variant — this is enforced by the type system, not by convention. | **[V]** |
| No third-party speech service | No call to any hosted speech API. Recognition is local. | **[V]** |
| Microphone released on stop | Media tracks are stopped first, then `AudioContext.close()`. The browser recording indicator clears immediately. | **[V]** |
| No off-device error telemetry | Worker errors surface only in the UI. The inference library contains no analytics, and its fetch path sends no auth token and no custom user agent. | **[V]** |
| Transport security is mandatory | The feature refuses to start outside a secure context, so capture cannot occur over plain HTTP. | **[V]** |
| Transcript is reviewable before it is sent | Text lands in the textarea and is only transmitted when the clinician clicks Score. A warning is shown while recording. | **[V]** |
| Single-threaded WASM, no `SharedArrayBuffer` | **Correct result, by default rather than by choice.** No COOP/COEP headers are sent, so `crossOriginIsolated` is `false`, and `onnxruntime-web` falls back to `numThreads = 1` (`backend-wasm.ts:37-56`). Adding COOP/COEP would **opt the app into multi-threaded WASM** and `SharedArrayBuffer`. | **[V]** |

### Observations a privacy review should note

| Observation | Detail |
|---|---|
| **Dictated text is retained** | On Score it is written to `doctor_rewrite_log`. First-party, by design — but retention exists and should appear in the data inventory. **[V]** |
| **Dictation telemetry exists** | `source: "voice"` plus a character count per utterance is POSTed to the backend. Low sensitivity, but it is behavioural metadata about dictation. **[V]** |
| **Consultation text is logged to the browser console** | `PhysicianReportsModifiedV41Timothy.tsx:5238` logs consultation sentence text; `useDoctorData.tsx:569,796` log API responses. Browser-local only, not the transcript — but relevant where console output may be captured by endpoint tooling. **[V]** |
| **Models are held until the tab closes** | ≈ 640 MB stays resident with no manual release path. Deliberate, to avoid a 3.3 s reload per dictation — §12. **[V]** |
| **Test inputs are operator-supplied and never committed** | `VOICE_TEST_URL` carries a de-identified study token; `VOICE_TEST_AUDIO` must be synthetic or public-domain speech, **never a real consultation recording**. **[V]** |

---

## 10. HIPAA and protected health information

This section separates verified engineering facts from readings of the regulation. The facts are settled; the regulatory conclusions should be confirmed by the privacy office.

| Question | Finding | Basis |
|---|---|---|
| Is consultation speech protected health information? | **Treat it as such.** Voice captured during a clinical encounter is individually identifiable health information where it identifies the speaker and relates to care or payment. A voice print is itself an enumerated identifier. | 45 C.F.R. § 160.103 (definitions); § 164.514(b)(2)(i)(P), which lists *"biometric identifiers, including finger and voice prints"* **[L]** |
| Does any third party receive that audio? | **No.** Verified by source review — audio never crosses the network boundary, so no vendor obtains it. | Source review of the worker, hook and audio worklet **[V]** |
| Is the model host a business associate? | **On these facts, no.** It serves static files to the browser and does not create, receive, maintain or transmit PHI on behalf of the covered entity. | Definition of *business associate*, 45 C.F.R. § 160.103 **[L]** |
| Is a BAA required **for the audio signal**? | **Not triggered**, because the predicate — disclosure of PHI to the vendor — does not occur. This covers the audio signal specifically, **not** the compliance posture of the application as a whole. | 45 C.F.R. § 164.502(e)(1)(i) and § 164.308(b)(1) **[L]** |
| What **did** the vendor receive? | Request metadata only: IP address, timing, user agent. Not PHI, but a third-party disclosure. **Eliminated on 2026-09-25** by self-hosting (§7.1) — no vendor now receives anything. | Verified network path **[V]** / **[L]** |
| Do the covered entity's own obligations still apply? | **Yes.** Audio is captured on, and the transcript exists on, a clinician workstation inside the covered entity. The transcript is additionally stored in the COMPASS database. Workstation and technical safeguards continue to apply regardless of where recognition runs. | 45 C.F.R. § 164.310(b)–(c); § 164.312 **[L]** |

> **The defensible sentence.** *Because the audio signal never leaves the browser, no protected health information is disclosed to the model host, and therefore no Business Associate Agreement is required for that audio signal.*
> The broader question of whether the application as a whole is compliant is out of scope for this report and rests with the privacy office. Note that the **transcript** — as distinct from the audio — is stored in the COMPASS database and is squarely within the covered entity's own safeguard obligations.
>
> Earlier engineering notes stated flatly that "the PHI question is moot" and "no BAA is required". The engineering fact behind those statements is correct and verified; the legal conclusion is recorded here as a reading, which is the form it needs to take in a document intended to support a compliance review.

---

## 11. Institutional environment risks

| Risk | Level | Detail and mitigation |
|---|---|---|
| **Model download blocked by firewall** | **RESOLVED** | Was **HIGH**: first use fetched ≈ 160 MB from `huggingface.co`, and if blocked the button stayed in its loading state and never became usable. The weights are now served by the COMPASS server (§7.1), so no firewall allowance is needed and no clinician can be blocked by one. |
| **`cdn.jsdelivr.net` blocked by firewall** | **RESOLVED** | Was **HIGH**: the ONNX runtime's WASM binaries loaded from jsDelivr, so inference could not start **even if Hugging Face was allowed** — and this origin was absent from previous guidance, making it the likeliest cause of a silent rollout failure. Now served from `public/stt-wasm/` (§7.1). |
| **Assets missing from a deployment** | MEDIUM | *New, and the cost of §7.1.* `public/stt-models/` and `public/stt-wasm/` are gitignored, so a fresh checkout does not have them. Voice input then fails closed with a load error rather than falling back to the internet — correct, but it must not be discovered by a clinician.<br>**Mitigation:** run `bash scripts/fetch-stt-assets.sh` in the deployment procedure before `npm run build` or any image build, and `bash scripts/fetch-stt-assets.sh --verify` as a post-deploy check. |
| **WebAssembly restricted by endpoint policy** | **HIGH** | The runtime uses WASM as its compute back end without WebGPU. Enterprise browser policy can block WASM execution.<br>**Mitigation:** confirm WASM is permitted for the COMPASS origin before rollout. |
| **Endpoint protection flags a large binary download** | LOW | Was MEDIUM. A clinical web app pulling ≈ 160 MB **from an external CDN** can trigger behavioural detection; the same volume from the hospital's own application server is a far weaker signal.<br>**Mitigation:** allow-list the COMPASS origin. One-time per device. |
| **Module-type Web Worker blocked by policy** | MEDIUM | The worker is created as a module worker; some managed browser configurations restrict this.<br>**Mitigation:** validate on a managed device image, not a developer machine. |
| **Plain-HTTP access silently disables the feature** | MEDIUM | On `http://<host>:3001` the button renders disabled by design. A clinician given the wrong URL sees "Voice unavailable" with no obvious cause — the reason is in a tooltip only.<br>**Mitigation:** distribute the HTTPS URL only; consider surfacing the reason inline. §13.1. |
| **Cache eviction forces re-download** | LOW | Storage-quota policy can evict the cached weights, causing a repeat download. If `caches.open()` fails entirely, **every visit re-downloads**.<br>**Mitigation:** since 2026-09-25 a repeat download is a same-origin fetch from the COMPASS server (§7.1), not a 160 MB trip to two CDNs — so the consequence is a slow first sentence, not a firewall dependency. |
| **Sustained microphone and CPU use observed by monitoring** | LOW | The audio thread runs while the microphone is open.<br>**Mitigation:** none required. Capture is user-initiated and released on stop. |
| **Audio disclosed to a third party** | **NONE** | No audio crosses the network boundary. Confirmed by source review, not assumption. **[V]** |
| **Cross-origin isolation headers required** | **NONE** | Not required. Note the inverse risk: *adding* COOP/COEP would enable multi-threaded WASM and `SharedArrayBuffer`, changing the security profile. **[V]** |

---

## 12. Resource use — measured

These are **measurements**, not estimates. Recorded on the deployed TLS door, 18 sentences over one warm session, headless Chromium, `hardwareConcurrency: 52`, `crossOriginIsolated: false`, on the **CPU/WASM path** — the test browser exposes `navigator.gpu` but is granted no adapter. **[V]**

### 12.1 Latency

| Metric | Measured | Notes |
|---|---|---|
| Model ready after the **first** click of a visit | **9.0 s** — *measured before self-hosting; see below* | ≈ 5.7 s of it was the download from `huggingface.co` and `cdn.jsdelivr.net` **[E]** |
| Model ready after **every later** click | **0.16 s** | The worker still holds the models. Unchanged by self-hosting |
| Per-sentence latency, warm, median | **1.6 s** (1.1 s re-measured on a later build) | Unchanged by self-hosting — pure local compute |
| Real-time factor | **≈ 0.18** | A 9-second sentence transcribes in 1.6 s |

**The 9.0 s figure is superseded.** It was measured when the assets came from two internet CDNs. Since 2026-09-25 they are served by the COMPASS server (§7.1), so the download leg is now bounded by the clinician's link to that server rather than by the hospital's internet egress. **[V]**

Measured on the server itself, through nginx and TLS, fetching the complete asset set the browser requests:

| Path | Bytes fetched | Served in |
|---|---|---|
| WASM (Firefox, Safari, Chrome without WebGPU) | 151.1 MB — 129.5 MB weights + 21.6 MB runtime | **≈ 0.50 s** (≈ 300 MB/s, three runs) |
| WebGPU (Chrome, Edge) | 181.4 MB — q4 decoder instead of q8 | ≈ 0.32 s on loopback |

That is the **server-side floor** — it measures how fast COMPASS can serve the bytes, with no client network in the path. It is not a first-click number. What a clinician actually sees is that download over their own link, plus the ≈ 3.3 s of session build and warm-up (§12.2), which is CPU work and did not change: **[E]**

| Clinician's link to the COMPASS server | Download (151 MB) | First click, total |
|---|---|---|
| 1 Gbps wired LAN | ≈ 1.4 s | **≈ 5 s** |
| Good Wi-Fi (≈ 40 MB/s) | ≈ 3.8 s | **≈ 7 s** |
| 100 Mbps | ≈ 14 s | **≈ 17 s** |

The useful change is not the headline number — on a fast LAN it improves by roughly half — but that the figure is now **predictable and under institutional control.** Previously it depended on internet egress, CDN routing and proxy inspection, none of which COMPASS could observe or influence. A slow first click is now a question about the hospital network, answerable by the people who run it. **[L]**

Separating the cold and warm numbers is what shows the steady-state cost is under two seconds, so no optimisation is warranted yet. Two levers remain unspent if a slower machine needs them — §14.2.

> **Not yet measured:** a real first click in a real browser against the deployed server. The table above composes a measured server-side serving time with a measured session-build time; it is not a single end-to-end observation. §17.1.

### 12.2 Why the second click is free — two caches, often confused

**1. The weights on disk.** Transformers.js writes them into the browser's Cache API under `transformers-cache` — **8 entries, 123.46 MiB** measured: encoder 77.07 MiB, quantized decoder 40.53 MiB, `tokenizer.json` 3.59 MiB, Silero VAD 2.14 MiB, four small configs. This survives reloads and restarts, so the download happens **once per browser profile, ever**. **[V]**

**2. The models in memory.** Reading those bytes back, rebuilding two ONNX sessions and running the warm-up inference took **3.3 s** — and used to happen on *every* click, because `stop()` terminated the worker. The worker now outlives the dictation, so it happens once per visit. **[V]**

### 12.3 Memory — the price of holding them

Process-tree RSS on the deployment, headless Chromium: **[V]**

| State | Total | Attributable to dictation |
|---|---|---|
| Dashboard open, never dictated | 568 MB | — |
| Models loaded, transcribing | 1 214 MB | **+645 MB** |
| After Stop | 1 207 MB | **+638 MB** — deliberately still held |
| Second Speak | 1 192 MB | +624 MB |

≈ 129 MB on disk becomes ≈ 640 MB resident because the quantized decoder is expanded to floats for computation and onnxruntime allocates its own arenas on top. Before this change, Stop returned most of it (dropping to +247 MB) and charged 3.3 s for the next sentence; **that trade was taken the other way round on purpose.** **[V]**

The models load on the first `start()`, not on mount — most clinicians reach this screen without ever dictating, and neither the download nor the 640 MB should be spent on them. **[V]**

> Earlier report drafts quoted "≈ 700 MB", a rounded-up code comment, and claimed "CPU high". The measured figure is **≈ 640–645 MB**, and **no CPU-utilisation measurement exists anywhere in the repository** — only wall-clock latency was measured, so that claim has been removed. **[V]**

---

## 13. Browser support and browser-specific behaviour

The feature requires a secure context, AudioWorklet and module-type Web Workers. WebGPU is optional and changes only speed and download size.

### 13.1 The secure-context gate

`getUserMedia` exists only in a secure context. Over plain HTTP on a LAN address, `navigator.mediaDevices` is **undefined** — the API is absent, not merely denied, so no application code can work around it. **[V]**

The hook probes this on mount and sets `unsupportedReason`, which makes the button render **disabled** with the reason in its tooltip, rather than failing at the click. Typing is untouched in that state.

In this deployment that means voice input works on `https://<host>:3443` (the `webapp-tls` nginx container) and **does not work, by design, on `http://<host>:3001`**. **[V]**

### 13.2 Firefox — sample-rate fallback and resampling

A 16 kHz `AudioContext` is the first choice, because an engine that accepts it resamples the microphone itself with a better filter than anything affordable on the audio thread. Chromium and WebKit do accept it. Firefox does not: it ignores the `sampleRate` constraint passed to `getUserMedia` — the track settings do not even report a rate — and then throws on `createMediaStreamSource`: **[V]**

> `AudioContext.createMediaStreamSource: Connecting AudioNodes from AudioContexts with different sample-rate is currently not supported.`

So the hook wraps that one call in a `try`/`catch` (`useSpeechToText.tsx:176-181`): on failure it closes the context, rebuilds it at the device rate, and lets the worklet convert. Chromium and WebKit never reach the catch, and their path is unchanged.

`vad-processor.js` then does the conversion, with `RESAMPLE_RATIO = sampleRate / TARGET_SAMPLE_RATE` (1 when the context is already 16 kHz, in which case `toTargetRate()` returns its input untouched). Each output sample is the **mean of the input samples it spans**, not a point sample — that average is a crude low-pass filter, where plain decimation would fold everything above 8 kHz back into the speech band as aliasing. `resampleCarry` and `resampleOffset` persist across `process()` calls because 128-sample blocks do not divide evenly by the ratio. **[V]**

> **Correction to an earlier report draft.** It listed Firefox as "partial" on the rationale that it "cannot do a 16 kHz AudioContext". **There is no user-agent sniffing anywhere in the STT path** — the resampler branches purely on the actual context rate (`vad-processor.js:29,46`), and the fallback is a `try`/`catch`, not a browser check. The project's own test run records **Firefox 145 at 16 000 Hz with a full pass.** **[V]**

### 13.3 Tested engines

`e2e/voice-input-cross-browser.spec.ts` drives the entire path — capability probe, model download, VAD, transcription, and the disabled-over-plain-HTTP case — in three engines. It runs under its own config (`npm run test:e2e:voice`) and is excluded from the ordinary e2e run, because the weights are a large download per browser. The microphone is replaced by a `MediaStream` fed from a decoded WAV, defined on `MediaDevices.prototype`, rather than by `--use-file-for-fake-audio-capture` (Chromium-only); Firefox's own fake device emits a tone, which the VAD correctly declines to call a sentence. **[V]**

| Engine | Secure ctx | AudioWorklet | Module worker | WASM SIMD | Context rate | Transcript |
|---|---|---|---|---|---|---|
| Chromium 143 | ✅ | ✅ | ✅ | ✅ | 16 000 Hz | ✅ |
| Firefox 145 | ✅ | ✅ | ✅ | ✅ | 16 000 Hz | ✅ (via the §13.2 fallback) |
| WebKit 26.0 | ✅ | ✅ | ✅ | ✅ | 16 000 Hz | ✅ |

**Caveat.** Playwright's WebKit is the WPE port, **not macOS Safari**. Same engine and the same four APIs, but a Mac or iPhone deserves one manual check before Safari is called proven. **[E]**

> **Correction to an earlier report draft.** It gave version floors — "Chrome/Edge 89+", "Safari 16.4+", "Firefox 76+". **Those numbers appear nowhere in the repository** and were not derived from any test performed here. They have been replaced with the engines actually tested. **[V]**

---

## 14. Operations and tuning guide

### 14.1 Sentence-boundary constants

The user-visible behaviour lives in `stt.worker.ts`'s `onmessage` handler; every constant is in `sttConstants.ts`. **[V]**

| Constant | Value | What it buys |
|---|---|---|
| `SAMPLE_RATE` | 16 000 Hz | Rate both models were trained at |
| `NEW_BUFFER_SIZE` | 512 samples (32 ms) | Frame size Silero VAD expects |
| `SPEECH_THRESHOLD` | 0.3 | Score above this **enters** speech |
| `EXIT_THRESHOLD` | 0.1 | While recording, score above this **stays** in speech |
| `MIN_SILENCE_DURATION_MS` | 400 ms | Silence shorter than this is a breath, not a sentence end |
| `MIN_SPEECH_DURATION_SAMPLES` | 250 ms | *Intended* to discard captures shorter than this as noise — **but see §15.1: this check is unreachable** |
| `SPEECH_PAD_MS` | 80 ms | Padding appended to the captured chunk |
| `MAX_NUM_PREV_BUFFERS` | `ceil(80 ms / 512)` = 3 frames | Pre-roll FIFO |
| `MAX_BUFFER_DURATION` | 30 s | Ceiling on one transcription |

**Dual threshold (hysteresis).** Entering speech needs 0.3; staying in it only needs 0.1. A single threshold makes the VAD flap on quiet syllables — the tail of a word dips below the line and the sentence is cut in half. Two thresholds mean it is harder to start than to continue, which is the correct asymmetry for dictation.

**Pre-roll FIFO.** While no speech is detected, the last three frames are kept in `prevBuffers`. When a sentence eventually starts, VAD has already consumed the first ~100 ms of it deciding whether it was speech — so `dispatchSentence()` prepends those kept frames. Without this the transcriber never hears the first syllable, and "prostate" arrives as "rostate".

**End of sentence.** Once recording, non-speech frames accumulate in `postSpeechSamples`. Below 400 ms nothing happens — the speaker is drawing breath. At or above it, the sentence is over.

**Noise rejection — does not currently work.** The intent is that a capture shorter than 250 ms is thrown away without transcribing: a cough, a chair, a door. **The check is unreachable.** See §15.1.

**The 30-second ceiling.** If someone talks continuously past the buffer, the buffer is dispatched as-is and the overflow samples are copied to the front of the fresh buffer via `reset(overflow.length)`, so the continuing sentence is not clipped at the seam.

**Serialized inference.** Transformers.js cannot run two inferences concurrently, so both VAD and transcription go through a single `inferenceChain` promise. VAD on a 512-sample frame is cheap enough that queueing behind a transcription does not lose audio — frames keep arriving from the worklet and simply wait.

### 14.2 The two models, and the levers available

**Silero VAD — the gate.** `onnx-community/silero-vad`, 2.2 MB, loaded at **fp32** unconditionally (quantizing a 2 MB model buys nothing). It scores each 512-sample frame and carries a recurrent state tensor of shape `[2, 1, 128]` between frames. Its purpose is economic: Moonshine is expensive, so it must only ever see audio that is actually someone talking. Without a VAD the transcriber either runs continuously on silence, or has to be driven by a push-to-talk the clinician must remember to release. **[V]**

**Moonshine — the transcriber, and why not Whisper.** It is compute *shape*, not file size. Whisper pads every input to a fixed 30-second mel spectrogram, so a five-second dictation costs thirty seconds of encoder work regardless. Moonshine consumes the raw waveform at its natural length (rotary position embeddings, so nothing forces padding), and encoder cost tracks the actual utterance. On a GPU that difference is hidden; on a CPU — which is what a clinician's laptop is — it is the difference between usable and not. **[V]**

Encoder + decoder download sizes, decimal MB, WASM combination (**excludes** tokeniser and VAD — see §8): **[V]**

| Model | Encoder | Decoder (merged) | Total |
|---|---|---|---|
| **moonshine-base** (chosen) | fp32 80.8 MB | q8 42.5 MB | **123.3 MB** |
| moonshine-base, int8 encoder | 20.5 MB | 42.5 MB | 63 MB |
| moonshine-tiny | 7.9 MB | 20.2 MB | 28 MB |
| whisper-base | 82.5 MB | 53.7 MB | 136 MB |
| whisper-tiny.en | 32.9 MB | 30.7 MB | 64 MB |
| silero-vad (always loaded) | — | 2.2 MB | 2.2 MB |

Both families use the identical `pipeline()` call and the model id is a single constant, so switching is a one-line change if load time or quality argues for it. **Subject to the licence boundary in §6 — the lever is not licence-neutral across languages.**

**Backend and precision — `DEVICE_DTYPE`** (`stt.worker.ts:72-75`): **[V]**

```ts
const DEVICE_DTYPE = {
  webgpu: { encoder_model: "fp32", decoder_model_merged: "q4" },
  wasm:   { encoder_model: "fp32", decoder_model_merged: "q8" },
} as const;
```

Two separate decisions are encoded here:

- **Encoder stays fp32 on both backends.** It runs *once* per utterance. Quantizing it trades accuracy for a saving on the cheaper half of the work.
- **Decoder quantization depends on the backend.** The decoder runs once per output token, so it dominates. On WebGPU, `q4` wins: memory bandwidth is the bottleneck and dequantizing 4-bit weights is essentially free inside a shader. On WASM there are no 4-bit kernels — the runtime would dequantize in scalar code, making `q4` *slower* than `q8`, and on some builds unsupported outright. Hence `q8` there.

No GPU is required. Every latency figure in §12 was measured on the CPU/WASM path.

**Unspent performance levers**, if a clinician laptop proves too slow: sending `COOP`/`COEP` headers would make onnxruntime-web multi-threaded (**but see §9 — this also enables `SharedArrayBuffer`**), and `STT_MODEL_ID` can drop to the 63 MB or 28 MB build.

### 14.3 Build configuration

Two obstacles were fixed at the root rather than worked around: **[V]**

- **`.npmrc` sets `onnxruntime-node-install-cuda=skip`.** `@huggingface/transformers` pulls in `onnxruntime-node`, whose postinstall downloads native binaries and fails outright on a CUDA 11 host. Inference is browser-side, so that binding is never loaded; `next.config.js` also aliases `onnxruntime-node` and `sharp` to `false`.
- **A webpack plugin in `next.config.js` marks onnxruntime-web's pre-built `ort.bundle.min.*.mjs` as `minimized: true`.** Terser otherwise dies on its top-level `import.meta`. The file is genuinely already minified, so this is a statement of fact rather than a suppression.

**Why the worklet is a static file.** `audioWorklet.addModule()` takes a plain URL and the worklet scope has no module system, so `vad-processor.js` is served from `public/` rather than bundled. The consequence: it cannot `import`, so `TARGET_SAMPLE_RATE = 16000` is duplicated there and **must be kept in sync** with `SAMPLE_RATE` in `sttConstants.ts`.

The transformers/ORT chunks are **not** in the eager set for `/` — `app-build-manifest.json` confirms they load only inside the worker, so First Load JS stays at 387 kB. **[V]**

### 14.4 UI behaviour

The button's label is derived, not stored: **[V]**

| Condition | Label |
|---|---|
| `!supported` | `Voice unavailable` (disabled, reason in the tooltip) |
| `status === "loading"` | `Loading… N%` |
| `status === "listening"` && speaking | `Listening…` (mic icon pulses) |
| `status === "listening"` && silent | `Stop` |
| otherwise | `Speak` |

**Placement.** Inside the input box, in a footer row below the text — the border, background and focus ring belong to a wrapper `div`, and both the textarea and the button sit inside it. It is deliberately *not* positioned over the textarea: a textarea's padding is part of its scroll area, so a floating button would have text scrolling underneath it. Being in the wrapper but outside the textarea makes overlap structurally impossible; measured at 0 px of overlap with the box scrolled to the top and to the middle. The button is left-aligned so it clears the resize handle in the opposite corner.

**Onboarding.** A "Dictate Your Re-write" step in the detail-view tour (`OnboardingTour.tsx`) is anchored to `data-tour='rewrite-voice-button'`, and is spread into the step list only when `VOICE_INPUT_ENABLED` is true — a step whose target is never rendered stalls the tour rather than skipping it. It states the three things the button cannot say for itself: dictated sentences land in the same box that can still be typed in, the audio is never recorded or uploaded, and a greyed-out "Voice unavailable" means the page was opened over plain HTTP.

**Appending, not replacing.** `appendTranscript(previous, chunk)` joins each recognised sentence to the existing contents with a single space, and attaches a leading `,.!?;:` without one. It lives in `sttConstants.ts` rather than the hook because it is the one piece of this feature worth unit-testing on its own.

**The review warning.** `"⚠ Review and edit the transcription before clicking Score. The recording may take a moment to finish after you stop speaking."` — shown **only while `status === "listening"`**. See §15.1: it disappears exactly when it is most needed.

**Cleanup.** `useEffect(() => stop, [stop])` releases the microphone and closes the `AudioContext` if the clinician navigates away mid-dictation — microphone first, so the browser's recording indicator goes out immediately. The worker is *not* terminated there: it is detached and told to reset, and keeps both models for the rest of the visit. Only a worker that has failed unrecoverably is thrown away, by `disposeSttWorker()`.

### 14.5 Fetching the self-hosted assets

`scripts/fetch-stt-assets.sh`, run from the repo root, is what puts the files §7.1 depends on onto disk. **[V]**

```bash
bash scripts/fetch-stt-assets.sh            # fetch + copy, then verify
bash scripts/fetch-stt-assets.sh --verify   # check an existing deployment only
```

| | |
|---|---|
| Downloads | 9 ASR files and 2 VAD files from Hugging Face, each at its pinned revision (`b1e9b6a` / `e71cae9`) → `app/Webapp/public/stt-models/` |
| Copies | `ort-wasm-simd-threaded.jsep.mjs` and `.wasm` out of `node_modules/@huggingface/transformers/dist/` → `app/Webapp/public/stt-wasm/` |
| Verifies | every file against a byte-size manifest held in the script; **exits 1 on any mismatch** |
| Result | 223 MB — 201 MB of weights, 21.6 MB of WASM |

**The WASM binaries are copied, not downloaded.** jsDelivr was serving the same two files that npm had already installed locally, so the default was a network round trip to fetch something that was on disk the whole time. This also ties the runtime binaries to the `@huggingface/transformers` version in `package-lock.json`, which is the correct coupling — they are that package's own build artefacts.

**When it has to run.** Both directories are gitignored (`app/Webapp/.gitignore:158-163`), so a fresh checkout does not have them. The script must run **before `npm run build` or any image build**, on every deployment, or voice input fails closed with a load error. `.dockerignore` has no `public/` rule and the Dockerfile copies `/app/public` wholesale (`Dockerfile:45`), so once the files exist they reach the image without further configuration. **[V]**

**When it has to run again.** Changing `STT_MODEL_ID` or `VAD_MODEL_ID` in `sttConstants.ts` means adding the new files to the script's manifest and re-running it. There is no fallback to the internet to cover a miss.

---

## 15. Supply-chain and code findings

| Finding | Detail | Recommendation |
|---|---|---|
| ~~**Model revisions are not pinned**~~ — **resolved 2026-09-25** | Neither load passed a `revision`, so both resolved to `'main'` at download time (`hub.js:467`), and two clinicians onboarding a month apart could receive different weights with no change to COMPASS. Self-hosting (§7.1) closed this: the bytes now come from `public/stt-models/`, fetched once at `b1e9b6a` (ASR) and `e71cae9` (VAD). §4 is reproducible as a result. | None. Keep the revisions in `scripts/fetch-stt-assets.sh` current with any deliberate upgrade. |
| **No subresource integrity** — *partially addressed* | The weights and WASM binaries are still not hash-pinned. What changed is the exposure: they are no longer fetched from two unpinned third-party origins at runtime, but served same-origin from bytes a maintainer fetched once and can inspect. `fetch-stt-assets.sh` verifies **byte sizes**, not SHA-256 — enough to catch a truncated or mis-fetched file, not enough to detect a same-size substitution. | Add SHA-256 digests to the script's manifest. Cheap, and it turns the current size check into a real integrity check. |
| **The ONNX runtime is a pre-release build** | `onnxruntime-web` resolves to `1.22.0-dev.20250409-89f8206ba4` — a dated development build pinned by the inference library, not a GA release. | Record in the deployment inventory; re-check on every library upgrade. No action required today. |
| **Upstream identifiers have moved** | `UsefulSensors` now redirects to `moonshine-ai` on both Hugging Face and GitHub. | Update written references. Redirects are a courtesy and can be withdrawn. |
| **The licence lives upstream, not in the mirror** | The ONNX mirror asserts MIT in metadata but ships no licence file. | Keep a dated copy of the upstream licence text with the deployment records. |

### 15.1 Defects noted during review

| Defect | Detail |
|---|---|
| **The 250 ms noise filter is unreachable — and the defect is upstream's** | `MIN_SPEECH_DURATION_SAMPLES` (4 000 samples) is checked at `stt.worker.ts:270`, but that line is reached only after `:268` requires `postSpeechSamples >= 6 400`. Since `:254-255` buffers *every* frame including trailing silence, `bufferPointer` always exceeds 4 000 by then. **Every captured segment is transcribed** — a cough or door slam that clears the VAD threshold produces text rather than being discarded.<br><br>**This is inherited, not introduced here.** The Hugging Face example has the identical structure at `moonshine-web/src/worker.js:211` followed by `:217`, with the same unconditional buffering before it. Every project using this example is in the same state. Worth fixing locally, and worth reporting upstream. **[V]** |
| **Stale comments contradict the code** | `PhysicianReportsModifiedV41Timothy.tsx:3829` says `// Score-only handler: no DB save` — but Score does save. `:4521` says the voice feature is "Off at the moment"; it is on. **[V]** |
| **The master switch is not environment-driven** | `VOICE_INPUT_ENABLED` is a hardcoded boolean, so disabling the feature requires a rebuild and redeploy — it cannot be turned off in an incident. **[V]** |
| **The warning is not shown when it matters most** | The review warning appears only while `status === "listening"` and **disappears the instant Stop is pressed** — that is, it is gone during the window when the clinician is actually reviewing the text before clicking Score. **[V]** |

### 15.2 Known open items carried forward

1. **Manual Safari check.** WPE WebKit passes; a real Mac or iPhone has not been tried.
2. **`COOP`/`COEP` headers** would make onnxruntime-web multi-threaded. Not sent today. Note the security trade-off in §9.
3. **A lighter model** (63 MB int8-encoder moonshine-base, or 28 MB moonshine-tiny) is a one-line change if a clinician laptop proves too slow — subject to §6.
4. **The certificate warning on `:3443`.** Removing it needs `_tls/ca.crt` imported on each client, or a hostname under a controlled domain so a publicly trusted certificate can be issued.
5. **`TARGET_SAMPLE_RATE` is duplicated** in `vad-processor.js` because a worklet cannot import. Any change to `SAMPLE_RATE` must be made in both places.
6. **Nothing unloads the models before the tab closes.** ≈ 640 MB stays resident for the rest of the visit. An idle timer in `sttWorkerHost.ts` would cap that, at the price of the 3.3 s rebuild for anyone who comes back after it fires. Not added, because no one has reported memory pressure — the number to watch is a clinician laptop, not this server.
7. **The worker is a singleton with no owner check.** One `RewriteVoiceInput` is ever on screen, so two hooks driving the same worker cannot currently happen. If a second dictation surface is added, `sttWorkerHost.ts` needs to arbitrate rather than hand the same worker to both.

---

## 16. Recommendations

| # | Action | Priority |
|---|---|---|
| 1 | ~~Allow **both** `huggingface.co` (and its CDN) **and `cdn.jsdelivr.net`** on port 443.~~ **No longer needed** — recommendation 3 removed both origins, so no firewall allowance is required for voice input. Nothing to ask of the network team. | — |
| 2 | Confirm browser policy permits WebAssembly for the COMPASS origin; validate on a managed device image, not a developer machine. | **High** |
| 3 | ~~**Self-host the model weights and the ORT WASM binaries** on the COMPASS server.~~ **Done 2026-09-25** (§7.1, §14.5). Both third-party origins are gone, revisions are pinned, the metadata disclosure is eliminated, and first use is served from the same host as the page. **Residual:** the manifest in `scripts/fetch-stt-assets.sh` checks byte sizes rather than SHA-256 digests — worth tightening (§15). **Operational consequence:** that script must run on every deployment before the build, or voice input fails closed. | Done |
| 4 | **Add a `THIRD_PARTY_NOTICES.md` to the webapp** covering the components in §3 and the ported example source in §2.6, and make it reachable from the served application. Closes the compliance gap flagged in §5. | **High** |
| 5 | Fix the unreachable 250 ms noise filter so short non-speech segments are discarded as intended, and report it upstream — the Hugging Face example carries the same defect (§15.1). | Medium |
| 6 | Add a review gate so any future change to `STT_MODEL_ID` is checked against the licence boundary in §6 before it ships. | Medium |
| 7 | Record the licence position — including the upstream dual-licence text, the English-only boundary, and the ported-example provenance in §2.6 — in the project's compliance records. | Medium |
| 8 | Have the privacy office confirm §10 in writing, and add `doctor_rewrite_log` to the data inventory as a store of clinician-dictated text. | Medium |
| 9 | Keep the review warning visible after Stop, until the clinician clicks Score. | Medium |
| 10 | Correct the stale comments in §15.1 so the code does not mislead the next reader, and change the three `Ported from …` comments to read *"ported and modified from"* (Apache-2.0 §4(b)). | Low |
| 11 | Make `VOICE_INPUT_ENABLED` environment-driven so the feature can be disabled without a rebuild. | Low |
| 12 | Tell users the first use may take ≈ 9 s while models download, and that later dictations start in well under a second. | Low |
| 13 | Do the manual Safari check on a real Mac or iPhone (§13.3), and record the result here. | Low |

---

## 17. Limitations, and what this supersedes

### 17.1 Limitations of this report

Stating these plainly is what makes the rest usable as evidence.

| Limitation | Detail |
|---|---|
| Measurements are from one environment | §12 figures were recorded on headless Chromium on the deployment host with `hardwareConcurrency: 52`, on the WASM path. A clinical workstation will differ — particularly on the WebGPU path, which was not benchmarked. |
| Browser support is a three-engine test, not a device matrix | §13.3 reflects Playwright engines. **Real macOS and iOS Safari have never been tested.** |
| Licence findings are point-in-time | All checks reflect upstream repositories as of 2026-09-25. Licences can change for later revisions. Self-hosting (§7.1) fixes which bytes are deployed, so the finding stays true of the copy in use; it does not stop upstream terms from changing for a future upgrade. |
| Regulatory statements are not legal advice | §10 is an engineering reading of the cited rules, prepared to support a review. It is not a legal opinion and does not substitute for one. |
| Scope is the speech-to-text feature | The audio path and its components. The rest of the COMPASS application is not assessed. |
| Code review cannot prove a negative indefinitely | "No audio leaves the browser" is verified against the current source. It is a property that must be re-checked whenever the STT path changes — including on any merge from upstream (§2.6). |

### 17.2 What this report supersedes in `SPEECH_TO_TEXT.md`

That file remains in the repository. Where it differs from this report, **this report is correct** — these specific statements in it are stale or imprecise: **[V]**

| In `SPEECH_TO_TEXT.md` | Correction |
|---|---|
| §10: *"Currently switched off. `VOICE_INPUT_ENABLED` … is `false`"* | It is **`true`** (`sttConstants.ts:20`). The feature is live. |
| §2: *"no BAA is required"*, *"the PHI question is moot"* | The engineering fact is right; the legal conclusion is restated as a reading in §10 of this report. |
| §2: *"Nothing is stored. No disk, no IndexedDB, no network."* | True of **audio**. The **transcript** is stored in `doctor_rewrite_log` on Score — §7. |
| §5.2 and §8: *"123 MB"* | Three different quantities were all called "123". WebGPU browsers download ≈ 160 MB — §8. |
| §6: *"If the whole capture is shorter than 250 ms it is thrown away"* | The check is **unreachable**; nothing is discarded — §15.1. |
| §2 and throughout: no mention of `cdn.jsdelivr.net` | It was a second third-party origin, undisclosed there. Both origins were removed on 2026-09-25 — §7.1. |
| §2 and throughout: weights described as coming from Hugging Face | Stale since 2026-09-25. Both models and the ORT WASM binaries are served by the COMPASS server, and remote loading is disabled — §7.1, §14.5. |
| Throughout: no mention of the ported provenance | Three files are ports of an Apache-2.0 example — §2.6. |

---

## 18. References

| Source | Reference |
|---|---|
| ASR model | https://huggingface.co/onnx-community/moonshine-base-ONNX |
| ASR upstream model | https://huggingface.co/moonshine-ai/moonshine-base |
| Moonshine licence text | https://github.com/moonshine-ai/moonshine — `LICENSE` at the repository root |
| Moonshine paper | arXiv:2410.15608 — *Moonshine: Speech Recognition for Live Transcription and Voice Commands* |
| VAD model | https://huggingface.co/onnx-community/silero-vad · https://github.com/snakers4/silero-vad |
| Inference library | https://github.com/huggingface/transformers.js — Apache Licence 2.0 |
| **Ported example source** | https://github.com/huggingface/transformers.js-examples/tree/main/moonshine-web — Apache Licence 2.0 (repository-root `LICENSE`; no `NOTICE` file) |
| ONNX Runtime | https://github.com/microsoft/onnxruntime — MIT Licence |
| Superseded engineering note | `SPEECH_TO_TEXT.md` — retained in the repository; see §17.2 |
| HIPAA definitions | 45 C.F.R. § 160.103 |
| HIPAA identifiers, incl. voice prints | 45 C.F.R. § 164.514(b)(2)(i)(P) |
| Business associate contract requirement | 45 C.F.R. § 164.502(e)(1)(i); § 164.308(b)(1) |
| Workstation and technical safeguards | 45 C.F.R. § 164.310(b)–(c); § 164.312 |
