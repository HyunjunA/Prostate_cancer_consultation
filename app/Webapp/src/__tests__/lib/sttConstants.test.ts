import {
  MIN_NEW_TOKENS,
  SAMPLE_RATE,
  STT_MODEL_ID,
  VAD_MODEL_ID,
  appendTranscript,
  maxNewTokensFor,
  sttAssetIdFor,
} from "@/lib/sttConstants";

/**
 * Dictation in Re-write Practice adds to the box one recognised sentence at a
 * time. Getting the joins wrong is the difference between a usable rewrite and
 * one the doctor has to repair by hand, so the seam is tested on its own.
 */
describe("appendTranscript", () => {
  it("uses the chunk as-is when the box is empty", () => {
    expect(appendTranscript("", "Your cancer is slow growing.")).toBe(
      "Your cancer is slow growing.",
    );
  });

  it("separates consecutive sentences with a single space", () => {
    expect(appendTranscript("First part.", "Second part.")).toBe(
      "First part. Second part.",
    );
  });

  it("does not double the space when the box already ends in whitespace", () => {
    expect(appendTranscript("Typed so far.  ", "Then spoken.")).toBe(
      "Typed so far. Then spoken.",
    );
  });

  it("attaches trailing punctuation without a space before it", () => {
    // The model sometimes emits a closing mark as its own chunk.
    expect(appendTranscript("We can watch it", ".")).toBe("We can watch it.");
  });

  it("ignores a chunk that is only whitespace", () => {
    expect(appendTranscript("Unchanged.", "   ")).toBe("Unchanged.");
    expect(appendTranscript("", "  ")).toBe("");
  });

  it("trims the chunk's own padding", () => {
    expect(appendTranscript("One.", "  Two.  ")).toBe("One. Two.");
  });
});

/**
 * The library's own bound is `Math.floor(seconds) * 6`, which allows zero
 * tokens for anything under a second and too few for a brisk speaker — the
 * symptom being the doctor's last words quietly going missing. These cases are
 * the ones that were actually broken.
 */
describe("maxNewTokensFor", () => {
  const seconds = (s: number) => Math.round(s * SAMPLE_RATE);

  it("never returns zero for the shortest capture the worker can produce", () => {
    // 250 ms of speech + 400 ms trailing silence + 80 ms pad + 3 pre-roll
    // frames ≈ 826 ms, which the library's floor() would price at 0 tokens.
    expect(maxNewTokensFor(seconds(0.826))).toBeGreaterThanOrEqual(
      MIN_NEW_TOKENS,
    );
  });

  it("leaves room for a trailing fragment split off by a pause", () => {
    // "and that's the main concern" is ~8 tokens; floor(1.6) * 6 = 6 cut it.
    expect(maxNewTokensFor(seconds(1.6))).toBeGreaterThan(8);
  });

  it("beats the library heuristic at every duration the worker can emit", () => {
    const libraryBound = (s: number) => Math.floor(s) * 6;
    for (let s = 0.25; s <= 30; s += 0.25) {
      expect(maxNewTokensFor(seconds(s))).toBeGreaterThanOrEqual(
        libraryBound(s),
      );
    }
  });

  it("grows with the length of the audio once past the floor", () => {
    expect(maxNewTokensFor(seconds(30))).toBeGreaterThan(
      maxNewTokensFor(seconds(10)),
    );
  });

  it("stays finite for the longest buffer the worker allows", () => {
    // MAX_BUFFER_DURATION is 30 s; a runaway bound would mean a decode that
    // never ends on a sentence the model has already finished.
    expect(maxNewTokensFor(seconds(30))).toBeLessThanOrEqual(256);
  });
});

/**
 * Routes a Transformers.js progress event to a row of the loading modal. A
 * mis-route is not a crash — it is a row that silently never moves, which is
 * exactly the kind of thing that reaches production unnoticed.
 */
describe("sttAssetIdFor", () => {
  it("routes the two Moonshine weight files to their own rows", () => {
    expect(sttAssetIdFor(STT_MODEL_ID, "onnx/encoder_model.onnx")).toBe(
      "encoder",
    );
    expect(
      sttAssetIdFor(STT_MODEL_ID, "onnx/decoder_model_merged_q4.onnx"),
    ).toBe("decoder");
  });

  it("routes both decoder builds, because the dtype depends on the backend", () => {
    // WebGPU takes q4, WASM takes q8 — see DEVICE_DTYPE in stt.worker.ts.
    expect(
      sttAssetIdFor(STT_MODEL_ID, "onnx/decoder_model_merged_q8.onnx"),
    ).toBe("decoder");
  });

  it("routes the VAD by repo, not by filename", () => {
    // Silero's file is also called model.onnx; only the repo id separates them.
    expect(sttAssetIdFor(VAD_MODEL_ID, "onnx/model.onnx")).toBe("vad");
  });

  it("ignores the JSON configs", () => {
    // A few kB each — a row that appears and completes in one frame is noise.
    for (const file of [
      "config.json",
      "tokenizer.json",
      "generation_config.json",
      "preprocessor_config.json",
    ]) {
      expect(sttAssetIdFor(STT_MODEL_ID, file)).toBeNull();
    }
  });

  it("ignores anything it does not recognise rather than guessing a row", () => {
    expect(sttAssetIdFor(STT_MODEL_ID, "onnx/something_else.onnx")).toBeNull();
    expect(sttAssetIdFor("", "")).toBeNull();
  });
});
