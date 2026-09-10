/**
 * AudioWorklet processor for the Re-write Practice voice input.
 *
 * Runs on the audio rendering thread and re-chunks the microphone stream into
 * fixed 512-sample frames, which is the frame size the Silero VAD model expects.
 * Each frame is posted to the main thread, which forwards it to the STT worker.
 *
 * Served as a static file rather than bundled: `audioWorklet.addModule()` needs a
 * plain URL, and the worklet scope has no module system of its own.
 *
 * Ported from the Transformers.js `moonshine-web` example (src/processor.js).
 */

const MIN_CHUNK_SIZE = 512;
let globalPointer = 0;
let globalBuffer = new Float32Array(MIN_CHUNK_SIZE);

// Both models are trained on 16 kHz audio. Must match SAMPLE_RATE in
// src/lib/sttConstants.ts — a worklet cannot import, so the constant is
// repeated here rather than shared.
const TARGET_SAMPLE_RATE = 16000;

// `sampleRate` is a global in the worklet scope: the rate of the AudioContext
// this processor was created in. Chromium and WebKit accept a context built at
// 16 kHz and resample the microphone themselves, so the ratio is 1 there and
// everything below is skipped. Firefox refuses to connect a microphone stream
// into a context whose rate differs from the device's, so the hook falls back
// to the device rate and the conversion to 16 kHz has to happen here instead.
const RESAMPLE_RATIO = sampleRate / TARGET_SAMPLE_RATE;

// Input samples received but not yet consumed by the resampler, plus how far
// into the next sample the read head sits. Both carry across process() calls:
// 128-frame blocks do not divide evenly by the ratio.
let resampleCarry = new Float32Array(0);
let resampleOffset = 0;

/**
 * Rate-converts one block to 16 kHz.
 *
 * Each output sample is the mean of the input samples it spans rather than a
 * point sample, which is a crude low-pass — without one, downsampling folds
 * everything above 8 kHz back into the speech band as aliasing. Cheap enough to
 * run on the audio thread, and the models never see anything above 8 kHz anyway.
 */
function toTargetRate(input) {
  if (RESAMPLE_RATIO === 1) return input;

  const all = new Float32Array(resampleCarry.length + input.length);
  all.set(resampleCarry, 0);
  all.set(input, resampleCarry.length);

  const count = Math.floor((all.length - resampleOffset) / RESAMPLE_RATIO);
  if (count <= 0) {
    resampleCarry = all;
    return new Float32Array(0);
  }

  const out = new Float32Array(count);
  let position = resampleOffset;
  for (let k = 0; k < count; k++) {
    const start = Math.floor(position);
    const end = Math.min(Math.floor(position + RESAMPLE_RATIO), all.length);
    let sum = 0;
    let n = 0;
    for (let i = start; i < end; i++) {
      sum += all[i];
      n += 1;
    }
    // n === 0 only when upsampling, where the window is narrower than one
    // sample; nearest-neighbour is the sensible answer there.
    out[k] = n > 0 ? sum / n : all[Math.min(start, all.length - 1)];
    position += RESAMPLE_RATIO;
  }

  const consumed = Math.floor(position);
  resampleOffset = position - consumed;
  resampleCarry = all.slice(consumed);
  return out;
}

class VADProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0][0];
    // Null between frames when the stream is paused — keep the node alive.
    if (!input) return true;

    const buffer = toTargetRate(input);
    if (buffer.length === 0) return true;

    if (buffer.length > MIN_CHUNK_SIZE) {
      // Larger than one frame — forward it whole.
      this.port.postMessage({ buffer });
    } else {
      const remaining = MIN_CHUNK_SIZE - globalPointer;
      if (buffer.length >= remaining) {
        // Fill the frame, ship it, then keep the leftover for the next one.
        globalBuffer.set(buffer.subarray(0, remaining), globalPointer);
        this.port.postMessage({ buffer: globalBuffer });

        globalBuffer = new Float32Array(MIN_CHUNK_SIZE);
        globalBuffer.set(buffer.subarray(remaining), 0);
        globalPointer = buffer.length - remaining;
      } else {
        globalBuffer.set(buffer, globalPointer);
        globalPointer += buffer.length;
      }
    }

    return true; // Keep the processor alive
  }
}

registerProcessor("vad-processor", VADProcessor);
