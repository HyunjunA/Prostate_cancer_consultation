import { encrypt, decrypt } from "@/utils/cryptoUtils";

// Suppress console.error output during tests
beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("encrypt", () => {
  it("returns empty string for empty input", () => {
    expect(encrypt("")).toBe("");
  });

  it("returns empty string for falsy input", () => {
    expect(encrypt(null as unknown as string)).toBe("");
    expect(encrypt(undefined as unknown as string)).toBe("");
  });

  it("returns string starting with ENC: prefix", () => {
    const result = encrypt("hello");
    expect(result.startsWith("ENC:")).toBe(true);
  });

  it("encrypted output differs from input", () => {
    const input = "hello";
    const result = encrypt(input);
    expect(result).not.toBe(input);
  });

  it("encrypts a simple string", () => {
    const result = encrypt("test");
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan("ENC:".length);
  });

  it("handles special characters (Unicode)", () => {
    const input = "한국어 テスト émojis 🎉";
    const result = encrypt(input);
    expect(result.startsWith("ENC:")).toBe(true);
    expect(result.length).toBeGreaterThan("ENC:".length);
  });

  it("handles long strings", () => {
    const input = "a".repeat(10000);
    const result = encrypt(input);
    expect(result.startsWith("ENC:")).toBe(true);
    expect(result.length).toBeGreaterThan(input.length);
  });
});

describe("decrypt", () => {
  it("returns empty string for empty input", () => {
    expect(decrypt("")).toBe("");
  });

  it("returns empty string for non-ENC: prefixed input", () => {
    expect(decrypt("plaintext")).toBe("");
    expect(decrypt("hello world")).toBe("");
    expect(decrypt("ENC")).toBe("");
  });

  it("roundtrip: decrypt(encrypt(text)) returns original text", () => {
    const original = "hello world";
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("roundtrip works for special characters", () => {
    const original = "한국어 テスト café résumé 🎉";
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("returns empty string for tampered encrypted text", () => {
    const encrypted = encrypt("test");
    const tampered = encrypted.substring(0, 6) + "XXXXX" + encrypted.substring(11);
    const result = decrypt(tampered);
    expect(result).toBe("");
  });
});
