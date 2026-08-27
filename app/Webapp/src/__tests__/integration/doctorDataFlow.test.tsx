/**
 * Integration tests: Doctor data flow.
 *
 * Tests the end-to-end data path through useDoctorData hook:
 *   useDoctorData hook -> fetch (mocked) -> state management
 *
 * Mock strategy: global.fetch is replaced with jest.fn().
 * We test the real hook against mocked network responses to verify
 * the integration between React state, fetch calls, and data flow.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useDoctorData } from "@/hooks/useDoctorData";

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

describe("Doctor Data Flow Integration", () => {
  // ── 1. useDoctorData loads files on mount ─────────────────────────────
  test("loads files on mount via fetchFiles", async () => {
    const fileList = [
      "quality-coded-nlp-pilot-sid-1.xlsx",
      "quality-coded-nlp-pilot-sid-2.xlsx",
      "quality-coded-nlp-pilot-sid-3.xlsx",
    ];
    mockMountFetch(fileList);

    const { result } = renderHook(() => useDoctorData());

    // Initially null
    expect(result.current.files).toBeNull();

    // After mount effect resolves
    await waitFor(() => {
      expect(result.current.files).toEqual(fileList);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    // Verify correct endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/backend/doctor/files`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  // ── 2. fetchSentences returns sentence data ───────────────────────────
  test("fetchSentences returns sentence data for a file and speaker", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const sentenceData = {
      total: 3,
      data: [
        {
          file: "session1.xlsx",
          i: 1,
          i2: 1,
          speaker: "Interviewer:",
          time: "00:01:05",
          sentence: "How are you feeling today?",
          class: "1",
          score: 3.2,
        },
        {
          file: "session1.xlsx",
          i: 2,
          i2: 1,
          speaker: "Interviewer:",
          time: "00:01:15",
          sentence: "Let me explain the treatment options.",
          class: "2",
          score: 4.1,
        },
        {
          file: "session1.xlsx",
          i: 3,
          i2: 1,
          speaker: "Interviewer:",
          time: "00:01:30",
          sentence: "Do you have any questions about that?",
          class: "3",
          score: 3.8,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce(okJson(sentenceData));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.fetchSentences(
        "session1.xlsx",
        "Interviewer:"
      );
    });

    // Verify state was updated
    expect(result.current.sentences).toEqual(sentenceData);
    expect(returnValue).toEqual(sentenceData);

    // Verify the URL contains path params
    const calledUrl = mockFetch.mock.calls[1][0] as string;
    expect(calledUrl).toContain("/api/backend/doctor/sentences/");
    expect(calledUrl).toContain("session1.xlsx");
    expect(calledUrl).toContain("Interviewer%3A");
  });

  // ── 3. saveRewrite sends PUT request ──────────────────────────────────
  test("saveRewrite sends PUT with rewrite data and returns result", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const rewriteData = {
      file: "session1.xlsx",
      i: 1,
      i2: 2,
      speaker: "Interviewer:",
      time: "2026-02-26T12:00:00Z",
      original_sentence: "Hello patient.",
      revised_sentence:
        "Good morning, I'd like to discuss your treatment options with you today.",
      score: 4.5,
      class_: "1",
      selected: true,
    };

    const saveResult = {
      success: true,
      message: "Rewrite saved",
      data: rewriteData,
    };

    mockFetch.mockResolvedValueOnce(okJson(saveResult));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.saveRewrite(rewriteData);
    });

    // Verify the PUT call
    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe(`${BASE}/api/backend/doctor/rewrites`);
    expect(putCall[1].method).toBe("PUT");

    const body = JSON.parse(putCall[1].body);
    expect(body.file).toBe("session1.xlsx");
    expect(body.original_sentence).toBe("Hello patient.");
    expect(body.revised_sentence).toContain("Good morning");
    expect(body.score).toBe(4.5);
    expect(body.class_).toBe("1");

    expect(returnValue).toEqual(saveResult);
  });

  // ── 4. scoreSentence sends POST request ───────────────────────────────
  test("scoreSentence sends POST and returns scored result", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    const scoreResult = {
      score: 4.2,
      sentence: "I want to make sure you understand all your options.",
    };

    mockFetch.mockResolvedValueOnce(okJson(scoreResult));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.scoreSentence(
        "I want to make sure you understand all your options.",
        "2"
      );
    });

    // Verify the POST call
    const postCall = mockFetch.mock.calls[1];
    expect(postCall[0]).toBe(`${BASE}/api/backend/doctor/score-sentence`);
    expect(postCall[1].method).toBe("POST");

    const body = JSON.parse(postCall[1].body);
    expect(body.sentence).toBe(
      "I want to make sure you understand all your options."
    );
    expect(body.class_).toBe("2");

    expect(returnValue).toEqual(scoreResult);
  });

  // ── 5. Error handling across multiple operations ──────────────────────
  test("error from one operation does not block subsequent operations", async () => {
    mockMountFetch();
    const { result } = renderHook(() => useDoctorData());
    await waitFor(() => expect(result.current.files).not.toBeNull());

    // First operation: fetchSentences fails
    mockFetch.mockResolvedValueOnce(failResponse(500));

    await act(async () => {
      await result.current.fetchSentences("session1.xlsx", "Doctor");
    });

    expect(result.current.error).toBe("Failed to fetch sentences");
    expect(result.current.sentences).toBeNull();

    // Second operation: fetchRewritesAll succeeds — error should be cleared
    const rewritesData = { total: 1, skip: 0, limit: 50, data: [] };
    mockFetch.mockResolvedValueOnce(okJson(rewritesData));

    await act(async () => {
      await result.current.fetchRewritesAll();
    });

    // Error should be cleared by the successful operation
    expect(result.current.error).toBeNull();
    expect(result.current.rewritesAll).toEqual(rewritesData);
    expect(result.current.loading).toBe(false);

    // Third operation: saveRewrite fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Invalid rewrite data" }),
    });

    const badRewriteResult = await act(async () => {
      return await result.current.saveRewrite({
        file: "session1.xlsx",
        i: 1,
        i2: 1,
        speaker: "Doctor",
        original_sentence: "Hi",
        revised_sentence: "",
        score: 0,
        class_: "1",
      });
    });

    expect(badRewriteResult).toBeNull();
    expect(result.current.error).toBe("Invalid rewrite data");

    // Fourth operation: scoreSentence succeeds — error clears again
    mockFetch.mockResolvedValueOnce(
      okJson({ score: 3.0, sentence: "Hello" })
    );

    const scoreResult = await act(async () => {
      return await result.current.scoreSentence("Hello", "1");
    });

    expect(scoreResult).toEqual({ score: 3.0, sentence: "Hello" });
    expect(result.current.error).toBeNull();
  });
});
