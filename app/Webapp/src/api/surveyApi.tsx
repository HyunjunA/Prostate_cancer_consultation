/**
 * surveyApi.ts
 *
 * API client for submitting survey responses to the backend.
 * Provides a flexible, type-safe interface for all survey types.
 */

// ══════════════════════════════════════════════════════════════════════════════
// Configuration
// ══════════════════════════════════════════════════════════════════════════════

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Survey types supported by the API
 */
export type SurveyType =
  | "baseline"
  | "sdm"
  | "dcs"
  | "risk_perception"
  | "satisfaction"
  | "questions";

/**
 * Generic survey submission payload
 * - answers: Dict[str, Any] - flexible structure for any survey format
 */
export interface SurveySubmission {
  survey_type: SurveyType;
  file: string;
  speaker: string;
  answers: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * API response from survey submission
 */
export interface SurveyResponse {
  status: string;
  message: string;
  survey_type: string;
  file: string;
  speaker: string;
  received_at: string;
  answer_count: number;
}

/**
 * API error response
 */
export interface ApiError {
  detail: string;
  status_code?: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// API Functions
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Submit a survey to the backend API
 *
 * @param submission - Survey submission data
 * @returns Promise<SurveyResponse> - API response
 * @throws Error if the request fails
 *
 * @example
 * // Submit DCS survey
 * const result = await submitSurvey({
 *   survey_type: 'dcs',
 *   file: 'consultation_001',
 *   speaker: 'patient_123',
 *   answers: { q1: 0, q2: 1, q3: 2, ... }
 * });
 */
export async function submitSurvey(
  submission: SurveySubmission
): Promise<SurveyResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/surveys/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add API key if configured
        ...(process.env.NEXT_PUBLIC_API_KEY && {
          "X-API-Key": process.env.NEXT_PUBLIC_API_KEY,
        }),
      },
      body: JSON.stringify(submission),
    });

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({
        detail: `HTTP error ${response.status}`,
      }));
      throw new Error(errorData.detail || `Request failed: ${response.status}`);
    }

    const data: SurveyResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`❌ Survey submission failed:`, error.message);
      throw error;
    }
    throw new Error("An unexpected error occurred");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Convenience Functions (Optional - for specific survey types)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Submit Baseline Information survey
 */
export async function submitBaseline(
  file: string,
  speaker: string,
  answers: Record<string, any>
): Promise<SurveyResponse> {
  return submitSurvey({
    survey_type: "baseline",
    file,
    speaker,
    answers,
  });
}

/**
 * Submit Shared Decision Making (SDM) survey
 */
export async function submitSDM(
  file: string,
  speaker: string,
  answers: Record<string, any>
): Promise<SurveyResponse> {
  return submitSurvey({
    survey_type: "sdm",
    file,
    speaker,
    answers,
  });
}

/**
 * Submit Decisional Conflict Survey (DCS)
 */
export async function submitDCS(
  file: string,
  speaker: string,
  answers: Record<string, any>
): Promise<SurveyResponse> {
  return submitSurvey({
    survey_type: "dcs",
    file,
    speaker,
    answers,
  });
}

/**
 * Submit Risk Perception survey
 */
export async function submitRiskPerception(
  file: string,
  speaker: string,
  answers: Record<string, any>
): Promise<SurveyResponse> {
  return submitSurvey({
    survey_type: "risk_perception",
    file,
    speaker,
    answers,
  });
}

/**
 * Submit Patient Satisfaction survey
 */
export async function submitSatisfaction(
  file: string,
  speaker: string,
  answers: Record<string, any>
): Promise<SurveyResponse> {
  return submitSurvey({
    survey_type: "satisfaction",
    file,
    speaker,
    answers,
  });
}

/**
 * Submit Patient Questions
 */
export async function submitQuestions(
  file: string,
  speaker: string,
  answers: Record<string, any>
): Promise<SurveyResponse> {
  return submitSurvey({
    survey_type: "questions",
    file,
    speaker,
    answers,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// GET - Fetch previous submissions for a file+speaker
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Response from the by-speaker submissions endpoint
 */
export interface SurveySubmissionsByType {
  speaker: string;
  total_submissions: number;
  survey_types: string[];
  submissions_by_type: Record<
    string,
    Array<{
      id: number;
      file: string;
      answers: Record<string, any>;
      submitted_at: string | null;
      redcap_synced: boolean;
    }>
  >;
}

/**
 * Fetch all previous survey submissions for a given file and speaker.
 * Used to restore state on page refresh.
 */
export async function fetchSurveySubmissions(
  file: string,
  speaker: string
): Promise<SurveySubmissionsByType | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/surveys/by-speaker/${encodeURIComponent(speaker)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.NEXT_PUBLIC_API_KEY && {
            "X-API-Key": process.env.NEXT_PUBLIC_API_KEY,
          }),
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data: SurveySubmissionsByType = await response.json();

    // Filter to only submissions for this specific file
    const filtered: SurveySubmissionsByType = {
      ...data,
      submissions_by_type: {},
      survey_types: [],
      total_submissions: 0,
    };

    for (const [type, submissions] of Object.entries(data.submissions_by_type)) {
      const forFile = submissions.filter((s) => s.file === file);
      if (forFile.length > 0) {
        filtered.submissions_by_type[type] = forFile;
        filtered.survey_types.push(type);
        filtered.total_submissions += forFile.length;
      }
    }

    return filtered;
  } catch (error) {
    console.error("Failed to fetch survey submissions:", error);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Export Default
// ══════════════════════════════════════════════════════════════════════════════

export default {
  submitSurvey,
  submitBaseline,
  submitSDM,
  submitDCS,
  submitRiskPerception,
  submitSatisfaction,
  submitQuestions,
  fetchSurveySubmissions,
};
