import { appendTranscript } from "@/lib/sttConstants";

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
