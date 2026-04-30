// src/__tests__/hooks/useDoctorData.test.ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDoctorData } from "../../hooks/useDoctorData";

// ──────────────────────────────────────────────────────────────────────────────
// Environment & Global Mocks
// ──────────────────────────────────────────────────────────────────────────────
// API key is now server-side only (injected by /api/backend proxy)

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  mockFetch.mockReset();
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
const BASE = ""; // same-origin; uses /api/backend/ proxy

/** Default mock: resolves fetchFiles (mount) with a file list. */
function mockMountFetch() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ files: ["session1.xlsx"] }),
  });
}

function okJson(data: unknown) {
  return { ok: true, json: async () => data };
}

function failResponse(status = 500) {
  return {
    ok: false,
    status,
    json: async () => ({ detail: "Server Error" }),
    text: async () => "Server Error",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────
describe("useDoctorData", () => {
  // ── 1. Initial state ────────────────────────────────────────────────────
  test("initial state — all data states are null, loading is false", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());

    expect(result.current.files).toBeNull();
    expect(result.current.sentences).toBeNull();
    expect(result.current.rewritesAll).toBeNull();
    expect(result.current.rewriteHistory).toBeNull();
    expect(result.current.scoreAverage).toBeNull();
    expect(result.current.aiRewrite).toBeNull();
    expect(result.current.improvementSuggestions).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  // ── 2. fetchFiles on mount ──────────────────────────────────────────────
  test("fetchFiles is called on mount and calls /api/doctor/files", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());

    await waitFor(() => {
      expect(result.current.files).toEqual(["session1.xlsx"]);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/backend/doctor/files`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });

  // ── 3. fetchSentences — path params ─────────────────────────────────────
  test("fetchSentences uses path params /sentences/{file}/{speaker}", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const mockData = { total: 5, data: [{ sentence: "Hello" }] };
    mockFetch.mockResolvedValueOnce(okJson(mockData));

    await act(async () => {
      await result.current.fetchSentences("session1.xlsx", "Doctor");
    });

    const calledUrl = mockFetch.mock.calls[1][0] as string;
    expect(calledUrl).toContain("/api/backend/doctor/sentences/");
    expect(calledUrl).toContain("session1.xlsx");
    expect(calledUrl).toContain("Doctor");
    expect(result.current.sentences).toEqual(mockData);
  });

  // ── 4. fetchRewritesAll ─────────────────────────────────────────────────
  test("fetchRewritesAll calls /api/doctor/rewrites", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const mockData = { total: 2, skip: 0, limit: 50, data: [] };
    mockFetch.mockResolvedValueOnce(okJson(mockData));

    await act(async () => {
      await result.current.fetchRewritesAll();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/backend/doctor/rewrites`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result.current.rewritesAll).toEqual(mockData);
  });

  // ── 5. fetchRewritesFiltered — query params ────────────────────────────
  test("fetchRewritesFiltered adds file and speaker as query params", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    mockFetch.mockResolvedValueOnce(okJson({ total: 1, skip: 0, limit: 50, data: [] }));

    await act(async () => {
      await result.current.fetchRewritesFiltered("session1.xlsx", "Doctor");
    });

    const calledUrl = mockFetch.mock.calls[1][0] as string;
    expect(calledUrl).toContain("/api/backend/doctor/rewrites?");
    expect(calledUrl).toContain("file=session1.xlsx");
    expect(calledUrl).toContain("speaker=Doctor");
  });

  // ── 6. fetchRewritesPaginated — skip/limit as query params ─────────────
  test("fetchRewritesPaginated adds skip and limit as query params", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    mockFetch.mockResolvedValueOnce(okJson({ total: 10, skip: 5, limit: 5, data: [] }));

    await act(async () => {
      await result.current.fetchRewritesPaginated(5, 5);
    });

    const calledUrl = mockFetch.mock.calls[1][0] as string;
    expect(calledUrl).toContain("skip=5");
    expect(calledUrl).toContain("limit=5");
  });

  // ── 7. fetchRewriteHistory — correct URL ───────────────────────────────
  test("fetchRewriteHistory calls /rewrites/{file}/{i}/{i2}/history", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const historyData = {
      file: "session1.xlsx",
      i: 3,
      i2: 7,
      speaker: "Doctor",
      class: "1",
      original_sentence: "Original.",
      original_score: 2.5,
      total_revisions: 1,
      history: [],
    };
    mockFetch.mockResolvedValueOnce(okJson(historyData));

    await act(async () => {
      await result.current.fetchRewriteHistory("session1.xlsx", 3, 7);
    });

    const calledUrl = mockFetch.mock.calls[1][0] as string;
    expect(calledUrl).toContain("/api/backend/doctor/rewrites/session1.xlsx/3/7/history");
    expect(result.current.rewriteHistory).toEqual(historyData);
  });

  // ── 8. fetchRewriteHistory — returns null on 404 ───────────────────────
  test("fetchRewriteHistory returns null on 404 without setting error", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Not found" }),
    });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.fetchRewriteHistory("missing.xlsx", 1, 1);
    });

    expect(returnValue).toBeNull();
    expect(result.current.rewriteHistory).toBeNull();
    // 404 is handled gracefully — error should not be set
    expect(result.current.error).toBeNull();
  });

  // ── 9. fetchScoreAverage — optional params ─────────────────────────────
  test("fetchScoreAverage calls /scores/average with optional params", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const avgData = { total_groups: 1, filters: {}, data: [] };
    mockFetch.mockResolvedValueOnce(okJson(avgData));

    await act(async () => {
      await result.current.fetchScoreAverage("session1.xlsx", "Doctor", "2");
    });

    const calledUrl = mockFetch.mock.calls[1][0] as string;
    expect(calledUrl).toContain("/api/backend/doctor/scores/average?");
    expect(calledUrl).toContain("file=session1.xlsx");
    expect(calledUrl).toContain("speaker=Doctor");
    expect(calledUrl).toContain("class=2");
  });

  // ── 10. saveRewrite — sends PUT with rewrite data ──────────────────────
  test("saveRewrite sends PUT with rewrite data", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const rewriteData = {
      file: "session1.xlsx",
      i: 1,
      i2: 2,
      speaker: "Doctor",
      original_sentence: "Hello patient.",
      revised_sentence: "Good morning, how are you feeling today?",
      score: 4.2,
      class_: "1",
      selected: true,
    };

    mockFetch.mockResolvedValueOnce(okJson({ success: true }));

    await act(async () => {
      await result.current.saveRewrite(rewriteData);
    });

    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe(`${BASE}/api/backend/doctor/rewrites`);
    expect(putCall[1].method).toBe("PUT");
    expect(JSON.parse(putCall[1].body)).toEqual(rewriteData);
  });

  // ── 11. saveRewriteWithTimestamp — auto-generates time field ────────────
  test("saveRewriteWithTimestamp auto-generates an ISO time field", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    mockFetch.mockResolvedValueOnce(okJson({ success: true }));

    const beforeTime = new Date().toISOString();

    await act(async () => {
      await result.current.saveRewriteWithTimestamp(
        "session1.xlsx",
        "Doctor",
        1,
        2,
        "Original sentence.",
        "Revised sentence.",
        4.0,
        "1"
      );
    });

    const afterTime = new Date().toISOString();

    const putCall = mockFetch.mock.calls[1];
    const body = JSON.parse(putCall[1].body);
    expect(body.file).toBe("session1.xlsx");
    expect(body.speaker).toBe("Doctor");
    expect(body.i).toBe(1);
    expect(body.i2).toBe(2);
    expect(body.original_sentence).toBe("Original sentence.");
    expect(body.revised_sentence).toBe("Revised sentence.");
    expect(body.score).toBe(4.0);
    expect(body.class_).toBe("1");
    // Verify the time field is a valid ISO string within the test window
    expect(body.time).toBeDefined();
    expect(body.time >= beforeTime).toBe(true);
    expect(body.time <= afterTime).toBe(true);
  });

  // ── 12. scoreSentence — sends POST to /score-sentence ──────────────────
  test("scoreSentence sends POST to /score-sentence", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const scoreResult = { score: 3.5, sentence: "Test sentence." };
    mockFetch.mockResolvedValueOnce(okJson(scoreResult));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.scoreSentence("Test sentence.", "2");
    });

    const postCall = mockFetch.mock.calls[1];
    expect(postCall[0]).toBe(`${BASE}/api/backend/doctor/score-sentence`);
    expect(postCall[1].method).toBe("POST");
    const body = JSON.parse(postCall[1].body);
    expect(body.sentence).toBe("Test sentence.");
    expect(body.class_).toBe("2");
    expect(returnValue).toEqual(scoreResult);
  });

  // ── 13. generateAIRewrite — uses aiRewriteLoading state ────────────────
  test("generateAIRewrite uses aiRewriteLoading state (not loading)", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    let resolveRewrite!: (v: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRewrite = resolve;
      })
    );

    // Start the AI rewrite call (don't await)
    let rewritePromise: Promise<unknown>;
    act(() => {
      rewritePromise = result.current.generateAIRewrite("Hello", "1", 4.0);
    });

    // aiRewriteLoading should be true while the request is in flight
    await waitFor(() => {
      expect(result.current.aiRewriteLoading).toBe(true);
    });
    // The general loading should NOT be true — generateAIRewrite uses its own state
    expect(result.current.loading).toBe(false);

    // Resolve the fetch
    await act(async () => {
      resolveRewrite(
        okJson({
          original_sentence: "Hello",
          rewritten_sentence: "Good morning",
          original_score: 2.0,
          new_score: 4.0,
          class_: "1",
          improvement_applied: "Added greeting",
        })
      );
      await rewritePromise!;
    });

    expect(result.current.aiRewriteLoading).toBe(false);
    expect(result.current.aiRewrite).not.toBeNull();
  });

  // ── 14. clearRewriteHistory — sets rewriteHistory to null ──────────────
  test("clearRewriteHistory sets rewriteHistory to null", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    // First, load some rewrite history
    const historyData = {
      file: "session1.xlsx",
      i: 1,
      i2: 1,
      speaker: "Doctor",
      class: "1",
      original_sentence: "Hi",
      original_score: 2,
      total_revisions: 0,
      history: [],
    };
    mockFetch.mockResolvedValueOnce(okJson(historyData));

    await act(async () => {
      await result.current.fetchRewriteHistory("session1.xlsx", 1, 1);
    });
    expect(result.current.rewriteHistory).toEqual(historyData);

    // Now clear it
    act(() => {
      result.current.clearRewriteHistory();
    });
    expect(result.current.rewriteHistory).toBeNull();
  });

  // ── 15. Error handling — sets error state on fetch failure ─────────────
  test("error handling — sets error state on fetch failure", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    mockFetch.mockResolvedValueOnce(failResponse(500));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.fetchRewritesAll();
    });

    expect(result.current.error).toBe("Failed to fetch rewrites");
    expect(returnValue).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
