import { secureSet, secureGet, secureRemove, secureHas } from "@/utils/secureStorage";

// Suppress console.error output during tests
beforeEach(() => {
  localStorage.clear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("secureSet", () => {
  it("stores encrypted value and returns true", () => {
    const result = secureSet("myKey", "myValue");
    expect(result).toBe(true);
    expect(localStorage.getItem("myKey")).not.toBeNull();
  });

  it("returns false for empty key", () => {
    expect(secureSet("", "value")).toBe(false);
  });

  it("returns false for null/undefined value", () => {
    expect(secureSet("key", null as unknown as string)).toBe(false);
    expect(secureSet("key", undefined as unknown as string)).toBe(false);
  });

  it("encrypted value in localStorage starts with ENC:", () => {
    secureSet("myKey", "myValue");
    const stored = localStorage.getItem("myKey");
    expect(stored).not.toBeNull();
    expect(stored!.startsWith("ENC:")).toBe(true);
  });
});

describe("secureGet", () => {
  it("retrieves and decrypts stored value", () => {
    secureSet("myKey", "myValue");
    const result = secureGet("myKey");
    expect(result).toBe("myValue");
  });

  it("returns null for empty key", () => {
    expect(secureGet("")).toBeNull();
  });

  it("returns null for non-existent key", () => {
    expect(secureGet("nonExistent")).toBeNull();
  });

  it("returns unencrypted value for backwards compatibility", () => {
    localStorage.setItem("legacyKey", "plainValue");
    const result = secureGet("legacyKey");
    expect(result).toBe("plainValue");
  });

  it("decrypts ENC: prefixed values", () => {
    secureSet("encKey", "secretData");
    const stored = localStorage.getItem("encKey");
    expect(stored!.startsWith("ENC:")).toBe(true);
    const result = secureGet("encKey");
    expect(result).toBe("secretData");
  });
});

describe("secureRemove", () => {
  it("removes item and returns true", () => {
    secureSet("myKey", "myValue");
    expect(localStorage.getItem("myKey")).not.toBeNull();
    const result = secureRemove("myKey");
    expect(result).toBe(true);
    expect(localStorage.getItem("myKey")).toBeNull();
  });

  it("returns false for empty key", () => {
    expect(secureRemove("")).toBe(false);
  });
});

describe("secureHas", () => {
  it("returns true for existing key", () => {
    secureSet("myKey", "myValue");
    expect(secureHas("myKey")).toBe(true);
  });

  it("returns false for non-existent key", () => {
    expect(secureHas("missing")).toBe(false);
  });

  it("returns false for empty key", () => {
    expect(secureHas("")).toBe(false);
  });
});

describe("roundtrip", () => {
  it("secureSet then secureGet returns original value", () => {
    const original = "sensitive data with spëcial chars!";
    secureSet("roundtrip", original);
    const retrieved = secureGet("roundtrip");
    expect(retrieved).toBe(original);
  });
});
