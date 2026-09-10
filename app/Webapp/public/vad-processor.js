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

class VADProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const buffer = inputs[0][0];
    // Null between frames when the stream is paused — keep the node alive.
    if (!buffer) return true;

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
