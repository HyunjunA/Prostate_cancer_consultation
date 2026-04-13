/**
 * Tests for surveyApi — API client for submitting survey responses.
 *
 * Mock strategy: global.fetch is replaced with jest.fn().
 * Environment variables are saved/restored between tests.
 */

import {
  submitSurvey,
  submitBaseline,
  submitSDM,
  submitDCS,
  submitRiskPerception,
  submitSatisfaction,
  submitQuestions,
  type SurveySubmission,
  type SurveyResponse,
  type SurveyType,
} from "@/api/surveyApi";
import surveyApiDefault from "@/api/surveyApi";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockSubmission: SurveySubmission = {
  survey_type: "dcs",
  file: "consultation_001",
  speaker: "patient_123",
  answers: { q1: 0, q2: 1, q3: 2 },
};

const mockResponse: SurveyResponse = {
  status: "success",
  message: "Survey submitted",
  survey_type: "dcs",
  file: "consultation_001",
  speaker: "patient_123",
  received_at: "2026-02-26T12:00:00Z",
  answer_count: 3,
};

function mockFetchSuccess(data: unknown = mockResponse): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(data),
  });
  global.fetch = fn;
  return fn;
}

function mockFetchHttpError(
  status: number,
  errorBody?: Record<string, unknown>
): jest.Mock {
  const jsonFn = errorBody
    ? jest.fn().mockResolvedValue(errorBody)
    : jest.fn().mockRejectedValue(new Error("not json"));

  const fn = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: jsonFn,
  });
  global.fetch = fn;
  return fn;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

const originalEnv = process.env;

beforeEach(() => {
  jest.resetAllMocks();
  // Isolate env mutations
  process.env = { ...originalEnv };
  // API key is now server-side only (injected by /api/backend proxy)
  // Suppress console.error noise in test output
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = originalEnv;
});

// ---------------------------------------------------------------------------
// submitSurvey — core behaviour
// ---------------------------------------------------------------------------

describe("submitSurvey", () => {
  it("returns SurveyResponse on successful submission", async () => {
    mockFetchSuccess();

    const result = await submitSurvey(mockSubmission);

    expect(result).toEqual(mockResponse);
  });

  it("sends request to the correct URL", async () => {
    const fetchMock = mockFetchSuccess();

    await submitSurvey(mockSubmission);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/surveys/submit",
      expect.anything()
    );
  });

  it("sends correct headers without X-API-Key (handled by server proxy)", async () => {
    const fetchMock = mockFetchSuccess();

    await submitSurvey(mockSubmission);

    const callArgs = fetchMock.mock.calls[0][1];
    expect(callArgs.headers).toEqual(
      expect.objectContaining({
        "Content-Type": "application/json",
      })
    );
    expect(callArgs.headers).not.toHaveProperty("X-API-Key");
  });

  it("sends the submission as JSON body", async () => {
    const fetchMock = mockFetchSuccess();

    await submitSurvey(mockSubmission);

    const callArgs = fetchMock.mock.calls[0][1];
    expect(callArgs.method).toBe("POST");
    expect(JSON.parse(callArgs.body)).toEqual(mockSubmission);
  });

  it("never sends X-API-Key header from client (server proxy injects it)", async () => {
    const fetchMock = mockFetchSuccess();

    await submitSurvey(mockSubmission);

    const callArgs = fetchMock.mock.calls[0][1];
    expect(callArgs.headers).not.toHaveProperty("X-API-Key");
  });

  it("throws with detail message on HTTP error with JSON body", async () => {
    mockFetchHttpError(422, { detail: "Validation failed" });

    await expect(submitSurvey(mockSubmission)).rejects.toThrow(
      "Validation failed"
    );
  });

  it("throws with default HTTP error message when error response is not JSON", async () => {
    mockFetchHttpError(500);

    await expect(submitSurvey(mockSubmission)).rejects.toThrow(
      "HTTP error 500"
    );
  });

  it('throws "An unexpected error occurred" for non-Error exceptions', async () => {
    // fetch itself rejects with a non-Error value
    global.fetch = jest.fn().mockRejectedValue("some string error");

    await expect(submitSurvey(mockSubmission)).rejects.toThrow(
      "An unexpected error occurred"
    );
  });

  it("calls console.error on failure", async () => {
    mockFetchHttpError(422, { detail: "Bad request" });

    await submitSurvey(mockSubmission).catch(() => {});

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Survey submission failed"),
      expect.any(String)
    );
  });

  it("includes metadata in the request body when provided", async () => {
    const fetchMock = mockFetchSuccess();
    const submissionWithMeta: SurveySubmission = {
      ...mockSubmission,
      metadata: { source: "web", version: "1.0" },
    };

    await submitSurvey(submissionWithMeta);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.metadata).toEqual({ source: "web", version: "1.0" });
  });

  it("uses relative /api/backend/ path (no external base URL)", async () => {
    const fetchMock = mockFetchSuccess();

    await submitSurvey(mockSubmission);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/surveys/submit",
      expect.anything()
    );
  });
});

// ---------------------------------------------------------------------------
// Convenience functions — each should delegate with the correct survey_type
// ---------------------------------------------------------------------------

describe("convenience functions", () => {
  const file = "consultation_001";
  const speaker = "patient_123";
  const answers = { q1: 1 };

  const cases: Array<{
    name: string;
    fn: (f: string, s: string, a: Record<string, any>) => Promise<SurveyResponse>;
    expectedType: SurveyType;
  }> = [
    { name: "submitBaseline", fn: submitBaseline, expectedType: "baseline" },
    { name: "submitSDM", fn: submitSDM, expectedType: "sdm" },
    { name: "submitDCS", fn: submitDCS, expectedType: "dcs" },
    {
      name: "submitRiskPerception",
      fn: submitRiskPerception,
      expectedType: "risk_perception",
    },
    {
      name: "submitSatisfaction",
      fn: submitSatisfaction,
      expectedType: "satisfaction",
    },
    { name: "submitQuestions", fn: submitQuestions, expectedType: "questions" },
  ];

  it.each(cases)(
    "$name sends survey_type=$expectedType",
    async ({ fn, expectedType }) => {
      const fetchMock = mockFetchSuccess();

      await fn(file, speaker, answers);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({
        survey_type: expectedType,
        file,
        speaker,
        answers,
      });
    }
  );
});

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

describe("default export", () => {
  it("contains all exported functions", () => {
    expect(surveyApiDefault).toEqual(
      expect.objectContaining({
        submitSurvey: expect.any(Function),
        submitBaseline: expect.any(Function),
        submitSDM: expect.any(Function),
        submitDCS: expect.any(Function),
        submitRiskPerception: expect.any(Function),
        submitSatisfaction: expect.any(Function),
        submitQuestions: expect.any(Function),
      })
    );
  });
});
