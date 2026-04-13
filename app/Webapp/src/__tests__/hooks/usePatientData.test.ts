// src/__tests__/hooks/usePatientData.test.ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePatientData } from "../../hooks/usePatientData";

// ──────────────────────────────────────────────────────────────────────────────
// Environment & Global Mocks
// ──────────────────────────────────────────────────────────────────────────────
// API key is now server-side only (injected by /api/backend proxy)

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Suppress console noise from the hook
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

/** Default mock: resolves fetchFiles (mount) with an empty file list. */
function mockMountFetch() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ files: ["file1.xlsx"] }),
  });
}

/** Create a successful JSON response mock. */
function okJson(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  };
}

/** Create a failed response mock. */
function failResponse(status = 500, body = "Internal Server Error") {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({ detail: body }),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────
describe("usePatientData", () => {
  // ── 1. Initial state ────────────────────────────────────────────────────
  test("initial state — loading is false, files is null, error is null", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());

    // Immediately after render (before useEffect resolves)
    expect(result.current.files).toBeNull();
    expect(result.current.error).toBeNull();

    // Wait for mount fetch to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  // ── 2. fetchFiles on mount ──────────────────────────────────────────────
  test("fetchFiles is called on mount and sets files state", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());

    await waitFor(() => {
      expect(result.current.files).toEqual(["file1.xlsx"]);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/backend/patient/files`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  // ── 3. fetchFiles sets loading during request ───────────────────────────
  test("fetchFiles sets loading to true during request", async () => {
    let resolveFetch!: (v: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { result } = renderHook(() => usePatientData());

    // Loading should be true while fetch is pending
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    // Resolve the fetch
    await act(async () => {
      resolveFetch(okJson({ files: [] }));
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  // ── 4. fetchFiles sets error on failure ─────────────────────────────────
  test("fetchFiles sets error state on failure", async () => {
    mockFetch.mockResolvedValueOnce(failResponse(500));
    const { result } = renderHook(() => usePatientData());

    await waitFor(() => {
      expect(result.current.error).toBe("Failed to fetch files");
      expect(result.current.loading).toBe(false);
    });
  });

  // ── 5. fetchSummariesAll ────────────────────────────────────────────────
  test("fetchSummariesAll calls correct endpoint and sets state", async () => {
    mockMountFetch();
    const mockSummaries = { summaries: [{ file: "f1", speaker: "s1" }] };

    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    mockFetch.mockResolvedValueOnce(okJson(mockSummaries));
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.fetchSummariesAll();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/backend/patient/summaries`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result.current.summariesAll).toEqual(mockSummaries);
    expect(returnValue).toEqual(mockSummaries);
  });

  // ── 6. fetchSummariesFiltered — query params ───────────────────────────
  test("fetchSummariesFiltered includes file and speaker as query params", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    mockFetch.mockResolvedValueOnce(okJson({ filtered: true }));
    await act(async () => {
      await result.current.fetchSummariesFiltered("test.xlsx", "Doctor");
    });

    const calledUrl = mockFetch.mock.calls[1][0] as string;
    expect(calledUrl).toContain("/api/backend/patient/summaries?");
    expect(calledUrl).toContain("file=test.xlsx");
    expect(calledUrl).toContain("speaker=Doctor");
  });

  // ── 7. fetchSummaryDetail — path params ─────────────────────────────────
  test("fetchSummaryDetail uses path params /summaries/{file}/{speaker}", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    mockFetch.mockResolvedValueOnce(okJson({ detail: "ok" }));
    await act(async () => {
      await result.current.fetchSummaryDetail("report.xlsx", "Patient");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/backend/patient/summaries/report.xlsx/Patient`,
      expect.objectContaining({ method: "GET" })
    );
  });

  // ── 8. fetchScoringAll ──────────────────────────────────────────────────
  test("fetchScoringAll calls /api/patient/scoring", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const mockScoring = { scoring: [{ file: "f1" }] };
    mockFetch.mockResolvedValueOnce(okJson(mockScoring));
    await act(async () => {
      await result.current.fetchScoringAll();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/backend/patient/scoring`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result.current.scoringAll).toEqual(mockScoring);
  });

  // ── 9. fetchResponsesAll ────────────────────────────────────────────────
  test("fetchResponsesAll calls /api/patient/responses", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const mockResponses = { responses: [{ file: "f1" }] };
    mockFetch.mockResolvedValueOnce(okJson(mockResponses));
    await act(async () => {
      await result.current.fetchResponsesAll();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/backend/patient/responses`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result.current.responsesAll).toEqual(mockResponses);
  });

  // ── 10. updateScoring — PUT with correct body ──────────────────────────
  test("updateScoring sends PUT with correct body", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const scoringResult = {
      file: "test.xlsx",
      speaker: "Doctor",
      scores: { class_1: 3, class_2: null, class_3: null, class_4: null, class_5: null },
      average: 3,
    };

    // First call: the PUT itself. Second call: fetchScoringFiltered refresh.
    mockFetch
      .mockResolvedValueOnce(okJson(scoringResult))
      .mockResolvedValueOnce(okJson({ filtered: true }));

    const updateData = {
      file: "test.xlsx",
      speaker: "Doctor",
      class_1_patient_scoring: 3,
    };

    await act(async () => {
      await result.current.updateScoring(updateData);
    });

    // Check the PUT call (call index 1, because 0 is the mount fetchFiles)
    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe(`${BASE}/api/backend/patient/scoring`);
    expect(putCall[1].method).toBe("PUT");
    expect(JSON.parse(putCall[1].body)).toEqual(updateData);
  });

  // ── 11. updateScoring calls fetchScoringFiltered after success ─────────
  test("updateScoring calls fetchScoringFiltered after success", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const scoringResult = {
      file: "test.xlsx",
      speaker: "Doctor",
      scores: { class_1: 3, class_2: null, class_3: null, class_4: null, class_5: null },
      average: 3,
    };
    const filteredResult = { file: "test.xlsx", filtered: true };

    mockFetch
      .mockResolvedValueOnce(okJson(scoringResult))
      .mockResolvedValueOnce(okJson(filteredResult));

    await act(async () => {
      await result.current.updateScoring({
        file: "test.xlsx",
        speaker: "Doctor",
        class_1_patient_scoring: 3,
      });
    });

    // The third fetch call (index 2) should be the fetchScoringFiltered refresh
    const refreshCall = mockFetch.mock.calls[2];
    expect(refreshCall[0]).toContain("/api/backend/patient/scoring?");
    expect(refreshCall[0]).toContain("file=test.xlsx");
    expect(refreshCall[0]).toContain("speaker=Doctor");
  });

  // ── 12. updateResponses — PUT with correct body ────────────────────────
  test("updateResponses sends PUT with correct body", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const responsesResult = {
      file: "test.xlsx",
      speaker: "Patient",
      answers: { answer_1: "Yes", answer_2: null, answer_3: null, answer_4: null, answer_5: null },
    };

    mockFetch
      .mockResolvedValueOnce(okJson(responsesResult))
      .mockResolvedValueOnce(okJson({ filtered: true }));

    const updateData = {
      file: "test.xlsx",
      speaker: "Patient",
      answer_1: "Yes",
    };

    await act(async () => {
      await result.current.updateResponses(updateData);
    });

    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe(`${BASE}/api/backend/patient/responses`);
    expect(putCall[1].method).toBe("PUT");
    expect(JSON.parse(putCall[1].body)).toEqual(updateData);
  });

  // ── 13. updateSingleClassScore — builds correct payload ────────────────
  test("updateSingleClassScore builds correct payload for class 3", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const scoringResult = {
      file: "test.xlsx",
      speaker: "Doctor",
      scores: { class_1: null, class_2: null, class_3: 4, class_4: null, class_5: null },
      average: 4,
    };

    mockFetch
      .mockResolvedValueOnce(okJson(scoringResult))
      .mockResolvedValueOnce(okJson({ filtered: true }));

    await act(async () => {
      await result.current.updateSingleClassScore("test.xlsx", "Doctor", 3, 4);
    });

    const putCall = mockFetch.mock.calls[1];
    const body = JSON.parse(putCall[1].body);
    expect(body).toEqual({
      file: "test.xlsx",
      speaker: "Doctor",
      class_3_patient_scoring: 4,
    });
  });

  // ── 14. updateAllClassScores — includes all 5 class scores ─────────────
  test("updateAllClassScores includes all 5 class scores", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const scoringResult = {
      file: "test.xlsx",
      speaker: "Doctor",
      scores: { class_1: 1, class_2: 2, class_3: 3, class_4: 4, class_5: 5 },
      average: 3,
    };

    mockFetch
      .mockResolvedValueOnce(okJson(scoringResult))
      .mockResolvedValueOnce(okJson({ filtered: true }));

    await act(async () => {
      await result.current.updateAllClassScores("test.xlsx", "Doctor", {
        class_1: 1,
        class_2: 2,
        class_3: 3,
        class_4: 4,
        class_5: 5,
      });
    });

    const putCall = mockFetch.mock.calls[1];
    const body = JSON.parse(putCall[1].body);
    expect(body).toEqual({
      file: "test.xlsx",
      speaker: "Doctor",
      class_1_patient_scoring: 1,
      class_2_patient_scoring: 2,
      class_3_patient_scoring: 3,
      class_4_patient_scoring: 4,
      class_5_patient_scoring: 5,
    });
  });

  // ── 15. API error — sets error state and returns null ──────────────────
  test("API error sets error state and returns null", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    mockFetch.mockResolvedValueOnce(failResponse(500));
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.fetchScoringAll();
    });

    expect(result.current.error).toBe("Failed to fetch scoring");
    expect(returnValue).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
