/**
 * Integration tests: Patient data flow.
 *
 * Tests the end-to-end data path through usePatientData hook:
 *   usePatientData hook -> fetch (mocked) -> state management
 *
 * Mock strategy: global.fetch is replaced with jest.fn().
 * We test the real hook against mocked network responses to verify
 * the integration between React state, fetch calls, and data flow.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { usePatientData } from "@/hooks/usePatientData";

// ──────────────────────────────────────────────────────────────────────────────
// Environment & Global Mocks
// ──────────────────────────────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
process.env.NEXT_PUBLIC_API_KEY = "test-api-key";

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

const BASE = "http://localhost:8000";

/** Mock the initial mount fetch (fetchFiles) with a file list. */
function mockMountFetch(files: string[] = ["session1.xlsx"]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ files }),
  });
}

function okJson(data: unknown) {
  return { ok: true, json: async () => data };
}

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

describe("Patient Data Flow Integration", () => {
  // ── 1. usePatientData loads files on mount ────────────────────────────
  test("loads files on mount via fetchFiles", async () => {
    const fileList = [
      "quality-coded-nlp-pilot-sid-1.xlsx",
      "quality-coded-nlp-pilot-sid-2.xlsx",
    ];
    mockMountFetch(fileList);

    const { result } = renderHook(() => usePatientData());

    // Initially, files should be null and loading should become true
    expect(result.current.files).toBeNull();

    // After the mount effect resolves, files should be set
    await waitFor(() => {
      expect(result.current.files).toEqual(fileList);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    // Verify the correct endpoint was called
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/patient/files`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-API-Key": expect.any(String),
        }),
      })
    );
  });

  // ── 2. fetchSummariesFiltered returns filtered data ───────────────────
  test("fetchSummariesFiltered returns filtered data for file+speaker", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const filteredData = {
      file: "session1.xlsx",
      speaker: "Interviewer:",
      summaries: [
        {
          class: "1",
          summary: "The patient discussed treatment options.",
          score: 3.5,
        },
        {
          class: "2",
          summary: "Risk factors were reviewed.",
          score: 4.1,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce(okJson(filteredData));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.fetchSummariesFiltered(
        "session1.xlsx",
        "Interviewer:"
      );
    });

    // Verify state was updated
    expect(result.current.summariesFiltered).toEqual(filteredData);
    // Verify the function returned the data
    expect(returnValue).toEqual(filteredData);
    // Verify query params were sent correctly
    const calledUrl = mockFetch.mock.calls[1][0] as string;
    expect(calledUrl).toContain("file=session1.xlsx");
    expect(calledUrl).toContain("speaker=Interviewer%3A");
  });

  // ── 3. updateScoring sends PUT and refreshes filtered scoring ─────────
  test("updateScoring sends PUT and refreshes filtered scoring data", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const scoringResult = {
      file: "session1.xlsx",
      speaker: "Patient_sid-1",
      scores: {
        class_1: 4,
        class_2: null,
        class_3: null,
        class_4: null,
        class_5: null,
      },
      average: 4,
    };

    const refreshedFiltered = {
      file: "session1.xlsx",
      speaker: "Patient_sid-1",
      scoring: { class_1: 4 },
    };

    // First mock: PUT response. Second mock: fetchScoringFiltered refresh.
    mockFetch
      .mockResolvedValueOnce(okJson(scoringResult))
      .mockResolvedValueOnce(okJson(refreshedFiltered));

    const updateData = {
      file: "session1.xlsx",
      speaker: "Patient_sid-1",
      class_1_patient_scoring: 4,
    };

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.updateScoring(updateData);
    });

    // Verify the PUT was sent
    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe(`${BASE}/api/patient/scoring`);
    expect(putCall[1].method).toBe("PUT");
    expect(JSON.parse(putCall[1].body)).toEqual(updateData);

    // Verify it returned the scoring result
    expect(returnValue).toEqual(scoringResult);

    // Verify it automatically refreshed filtered scoring (third fetch call)
    const refreshCall = mockFetch.mock.calls[2];
    expect(refreshCall[0]).toContain("/api/patient/scoring?");
    expect(refreshCall[0]).toContain("file=session1.xlsx");
    expect(refreshCall[0]).toContain("speaker=Patient_sid-1");

    // State should reflect the refreshed data
    expect(result.current.scoringFiltered).toEqual(refreshedFiltered);
  });

  // ── 4. Error in fetch sets error state ────────────────────────────────
  test("error in fetchSummariesAll sets error state and returns null", async () => {
    mockMountFetch();
    const { result } = renderHook(() => usePatientData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    mockFetch.mockResolvedValueOnce(failResponse(500, "Internal Server Error"));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.fetchSummariesAll();
    });

    expect(result.current.error).toBe("Failed to fetch summaries");
    expect(returnValue).toBeNull();
    expect(result.current.summariesAll).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  // ── 5. Loading state management during async operations ───────────────
  test("loading state transitions: false -> true -> false during fetch", async () => {
    // Control mount fetch manually to observe loading state
    let resolveMountFetch!: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMountFetch = resolve;
      })
    );

    const { result } = renderHook(() => usePatientData());

    // Loading should be true while mount fetch is in progress
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    expect(result.current.files).toBeNull();

    // Resolve the mount fetch
    await act(async () => {
      resolveMountFetch(okJson({ files: ["f1.xlsx"] }));
    });

    // Loading should now be false, files should be populated
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.files).toEqual(["f1.xlsx"]);
    });

    // Now test a subsequent fetch operation
    let resolveSecondFetch!: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecondFetch = resolve;
      })
    );

    // Start fetchScoringAll (don't await)
    let scoringPromise: Promise<unknown>;
    act(() => {
      scoringPromise = result.current.fetchScoringAll();
    });

    // Loading should be true again
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    // Resolve the scoring fetch
    await act(async () => {
      resolveSecondFetch(okJson({ scoring: [{ class_1: 3 }] }));
      await scoringPromise;
    });

    // Back to false
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
