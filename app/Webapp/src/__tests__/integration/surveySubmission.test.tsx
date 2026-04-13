/**
 * Integration tests: Survey submission flow.
 *
 * Tests the end-to-end data path:
 *   submitSurvey() -> fetch (mocked) -> response parsing -> error handling
 *
 * Mock strategy: global.fetch is replaced with jest.fn().
 * We test the actual surveyApi module against mocked network responses.
 */

import {
  submitSurvey,
  submitDCS,
  submitSDM,
  submitBaseline,
  submitRiskPerception,
  submitSatisfaction,
  submitQuestions,
  type SurveySubmission,
  type SurveyResponse,
  type SurveyType,
} from "@/api/surveyApi";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const mockDCSSubmission: SurveySubmission = {
  survey_type: "dcs",
  file: "consultation_001.xlsx",
  speaker: "Patient_sid-1",
  answers: {
    q1: 2,
    q2: 3,
    q3: 1,
    q4: 4,
    q5: 0,
    q6: 2,
    q7: 3,
    q8: 1,
    q9: 4,
    q10: 2,
    q11: 3,
    q12: 1,
    q13: 4,
    q14: 0,
    q15: 2,
    q16: 3,
  },
};

const mockSDMSubmission: SurveySubmission = {
  survey_type: "sdm",
  file: "consultation_001.xlsx",
  speaker: "Patient_sid-1",
  answers: {
    q1: 5,
    q2: 4,
    q3: 3,
    q4: 5,
    q5: 4,
    q6: 3,
    q7: 5,
    q8: 4,
    q9: 3,
  },
};

function makeMockResponse(
  surveyType: SurveyType,
  answerCount: number
): SurveyResponse {
  return {
    status: "success",
    message: "Survey submitted successfully",
    survey_type: surveyType,
    file: "consultation_001.xlsx",
    speaker: "Patient_sid-1",
    received_at: "2026-02-26T12:00:00Z",
    answer_count: answerCount,
  };
}

function mockFetchSuccess(responseData: SurveyResponse): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(responseData),
  });
  global.fetch = fn;
  return fn;
}

function mockFetchFailure(status: number, detail: string): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: jest.fn().mockResolvedValue({ detail }),
  });
  global.fetch = fn;
  return fn;
}

function mockFetchNetworkError(): jest.Mock {
  const fn = jest.fn().mockRejectedValue(new Error("Network error"));
  global.fetch = fn;
  return fn;
}

// ──────────────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ──────────────────────────────────────────────────────────────────────────────

const originalEnv = process.env;

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...originalEnv };
  // API key is now server-side only (injected by /api/backend proxy)
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = originalEnv;
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("Survey Submission Integration", () => {
  // ── 1. Submit DCS survey — full flow ───────────────────────────────────
  test("DCS survey: submits all 16 answers and receives success response", async () => {
    const expectedResponse = makeMockResponse("dcs", 16);
    const fetchMock = mockFetchSuccess(expectedResponse);

    const result = await submitSurvey(mockDCSSubmission);

    // Verify fetch was called with correct URL and method
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/surveys/submit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );

    // Verify request body contains all answers
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.survey_type).toBe("dcs");
    expect(requestBody.file).toBe("consultation_001.xlsx");
    expect(requestBody.speaker).toBe("Patient_sid-1");
    expect(Object.keys(requestBody.answers)).toHaveLength(16);

    // Verify response
    expect(result.status).toBe("success");
    expect(result.answer_count).toBe(16);
    expect(result.survey_type).toBe("dcs");
  });

  // ── 2. Submit SDM survey — full flow ──────────────────────────────────
  test("SDM survey: submits all 9 answers and receives success response", async () => {
    const expectedResponse = makeMockResponse("sdm", 9);
    const fetchMock = mockFetchSuccess(expectedResponse);

    const result = await submitSurvey(mockSDMSubmission);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.survey_type).toBe("sdm");
    expect(Object.keys(requestBody.answers)).toHaveLength(9);
    expect(result.status).toBe("success");
    expect(result.answer_count).toBe(9);
  });

  // ── 3. Submit empty answers — verifies the API still accepts it ───────
  test("submitting survey with empty answers object sends the request", async () => {
    const emptySubmission: SurveySubmission = {
      survey_type: "dcs",
      file: "consultation_001.xlsx",
      speaker: "Patient_sid-1",
      answers: {},
    };
    const expectedResponse = makeMockResponse("dcs", 0);
    const fetchMock = mockFetchSuccess(expectedResponse);

    const result = await submitSurvey(emptySubmission);

    // The API client itself does not validate empty answers — it sends them
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.answers).toEqual({});
    expect(result.answer_count).toBe(0);
  });

  // ── 4. API error handling — server returns 422 ────────────────────────
  test("API error: server 422 response throws with detail message", async () => {
    mockFetchFailure(422, "Missing required field: answers");

    await expect(submitSurvey(mockDCSSubmission)).rejects.toThrow(
      "Missing required field: answers"
    );
  });

  // ── 4b. API error handling — network error ────────────────────────────
  test("API error: network failure throws Error", async () => {
    mockFetchNetworkError();

    await expect(submitSurvey(mockDCSSubmission)).rejects.toThrow(
      "Network error"
    );
  });

  // ── 5. Survey type mapping — each convenience function uses correct type
  test("each convenience function sends the correct survey_type string", async () => {
    const testCases: Array<{
      fn: (
        file: string,
        speaker: string,
        answers: Record<string, any>
      ) => Promise<SurveyResponse>;
      expectedType: SurveyType;
    }> = [
      { fn: submitDCS, expectedType: "dcs" },
      { fn: submitSDM, expectedType: "sdm" },
      { fn: submitBaseline, expectedType: "baseline" },
      { fn: submitRiskPerception, expectedType: "risk_perception" },
      { fn: submitSatisfaction, expectedType: "satisfaction" },
      { fn: submitQuestions, expectedType: "questions" },
    ];

    for (const { fn, expectedType } of testCases) {
      const response = makeMockResponse(expectedType, 1);
      const fetchMock = mockFetchSuccess(response);

      await fn("file.xlsx", "speaker-1", { q1: 1 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.survey_type).toBe(expectedType);
    }
  });
});
