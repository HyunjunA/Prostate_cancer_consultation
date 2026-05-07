// src/__tests__/hooks/useFirstVisitResponses.test.ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFirstVisitResponses } from "../../hooks/useFirstVisitResponses";

// ──────────────────────────────────────────────────────────────────────────────
// Environment & Global Mocks
// ──────────────────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  mockFetch.mockReset();
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const FILE = "f.xlsx";
const SPEAKER = "Patient";

/** Build the all-null GET response shape. */
function emptyGetResponse() {
  return {
    responses: { cp: null, le: null, ed: null, inc: null, ius: null },
  };
}

/** Mock the next fetch call to return ok JSON. */
function mockOk(json: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => json });
}

/** Mock the next fetch call to return a server error. */
function mockFail(status: number, body = "boom") {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("useFirstVisitResponses — mount-time GET", () => {
  test("populates cache and flips isHydrated true on success", async () => {
    const cp = {
      domain: "cp",
      vas_primary: 35,
      vas_secondary: 60,
      timeline: "B",
      factors: null,
      submitted_at: "2026-05-07T09:00:00Z",
    };
    mockOk({ responses: { ...emptyGetResponse().responses, cp } });

    const { result } = renderHook(() =>
      useFirstVisitResponses(FILE, SPEAKER),
    );

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.responses.cp).toEqual(cp);
    expect(result.current.responses.le).toBeNull();
    expect(result.current.error).toBeNull();
  });

  test("flips isHydrated true even on GET failure (UI stays usable)", async () => {
    mockFail(500);

    const { result } = renderHook(() =>
      useFirstVisitResponses(FILE, SPEAKER),
    );

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  test("does not call fetch when file/speaker are missing", () => {
    renderHook(() => useFirstVisitResponses(null, null));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("useFirstVisitResponses — saveDomain", () => {
  test("PUTs the patch and merges the persisted row into the cache", async () => {
    mockOk(emptyGetResponse());                             // mount GET
    const persisted = {
      domain: "cp",
      vas_primary: 35,
      vas_secondary: null,
      timeline: null,
      factors: null,
      submitted_at: "2026-05-07T09:30:00Z",
    };
    mockOk(persisted);                                      // saveDomain PUT

    const { result } = renderHook(() =>
      useFirstVisitResponses(FILE, SPEAKER),
    );
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.saveDomain("cp", { vas_primary: 35 });
    });

    expect(returned).toEqual(persisted);
    expect(result.current.responses.cp).toEqual(persisted);
    // Verify the body actually carried file/speaker/domain.
    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe("/api/backend/patient/first-visit-responses");
    expect(putCall[1].method).toBe("PUT");
    expect(JSON.parse(putCall[1].body)).toEqual({
      file: FILE,
      speaker: SPEAKER,
      domain: "cp",
      vas_primary: 35,
    });
  });

  test("rejects when the server returns 422 and surfaces the error", async () => {
    mockOk(emptyGetResponse());                             // mount GET
    mockFail(422, "invalid factors for cp: ['Age']");       // saveDomain PUT

    const { result } = renderHook(() =>
      useFirstVisitResponses(FILE, SPEAKER),
    );
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    await act(async () => {
      await expect(
        result.current.saveDomain("cp", { factors: ["Age"] }),
      ).rejects.toThrow();
    });

    await waitFor(() =>
      expect(result.current.error).toBeInstanceOf(Error),
    );
    // Cache for cp must NOT have been mutated by a failed save.
    expect(result.current.responses.cp).toBeNull();
  });
});
