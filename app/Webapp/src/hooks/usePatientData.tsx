// src/hooks/usePatientData.tsx
import { useState, useEffect } from "react";

export interface ChartData {
  category: string;
  count: number;
  percentage: number;
}

export interface DistributionData {
  title: string;
  data: ChartData[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Request bodies for the PUT APIs
// ──────────────────────────────────────────────────────────────────────────────
export interface PatientScoringUpdate {
  file: string;
  speaker: string;
  domain: string;
  patient_scoring: number | null;
}

export interface PatientResponsesUpdate {
  file: string;
  speaker: string;
  domain: string;
  patient_response: string | null;
}

export interface ScoringResult {
  file: string;
  speaker: string;
  scores: { [domain: string]: number | null };
  average: number | null;
}

export interface ResponsesResult {
  file: string;
  speaker: string;
  answers: { [domain: string]: string | null };
}

// ──────────────────────────────────────────────────────────────────────────────
// API Configuration
// ──────────────────────────────────────────────────────────────────────────────
const BASE_URL = ""; // same-origin; proxied via /api/backend/

// Helper function to create headers
const getHeaders = () => ({
  "Content-Type": "application/json",
});

export const usePatientData = () => {
  const [files, setFiles] = useState<string[] | null>(null);
  const [summariesAll, setSummariesAll] = useState<any | null>(null);
  const [summariesFiltered, setSummariesFiltered] = useState<any | null>(null);
  const [summaryDetail, setSummaryDetail] = useState<any | null>(null);
  const [aiSummary, setAiSummary] = useState<any | null>(null);
  const [scoringAll, setScoringAll] = useState<any | null>(null);
  const [scoringFiltered, setScoringFiltered] = useState<any | null>(null);
  const [responsesAll, setResponsesAll] = useState<any | null>(null);
  const [responsesFiltered, setResponsesFiltered] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // GET APIs (every function returns its payload)
  // ============================================================================

  // 1) Get Files
  const fetchFiles = async (): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/backend/patient/files`, {
        method: "GET",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch files");
      const data = await response.json();
      setFiles(data.files);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading files:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 2) Get Summaries (All)
  const fetchSummariesAll = async (): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/backend/patient/summaries`, {
        method: "GET",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch summaries");
      const data = await response.json();
      setSummariesAll(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading summaries:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 3) Get Summaries (Filtered)
  const fetchSummariesFiltered = async (
    file: string,
    speaker: string
  ): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ file, speaker });
      const response = await fetch(
        `${BASE_URL}/api/backend/patient/summaries?${params.toString()}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch filtered summaries");
      const data = await response.json();
      setSummariesFiltered(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading filtered summaries:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 4) Get Summary Detail - API #10
  const fetchSummaryDetail = async (
    file: string,
    speaker: string
  ): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `${BASE_URL}/api/backend/patient/summaries/${file}/${speaker}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch summary detail");
      const data = await response.json();
      setSummaryDetail(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading summary detail:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 4b) Get AI Summary — GPT-4o generated patient-facing risk summaries
  const fetchAISummary = async (file: string): Promise<any | null> => {
    try {
      const response = await fetch(
        `${BASE_URL}/api/backend/patient/ai-summary/${encodeURIComponent(file)}`,
        { method: "GET", headers: getHeaders() }
      );
      if (!response.ok) return null; // silently fail — fallback to existing summary
      const data = await response.json();
      setAiSummary(data);
      return data;
    } catch (err) {
      console.log("[usePatientData] AI summary not available, using fallback");
      return null;
    }
  };

  // 5) Get Scoring (All)
  const fetchScoringAll = async (): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/backend/patient/scoring`, {
        method: "GET",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch scoring");
      const data = await response.json();
      setScoringAll(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading scoring:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 6) Get Scoring (Filtered)
  const fetchScoringFiltered = async (
    file: string,
    speaker: string
  ): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ file, speaker });
      const response = await fetch(
        `${BASE_URL}/api/backend/patient/scoring?${params.toString()}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch filtered scoring");
      const data = await response.json();
      setScoringFiltered(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading filtered scoring:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 7) Get Responses (All)
  const fetchResponsesAll = async (): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/backend/patient/responses`, {
        method: "GET",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch responses");
      const data = await response.json();
      setResponsesAll(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading responses:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 8) Get Responses (Filtered)
  const fetchResponsesFiltered = async (
    file: string,
    speaker: string
  ): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ file, speaker });
      const response = await fetch(
        `${BASE_URL}/api/backend/patient/responses?${params.toString()}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch filtered responses");
      const data = await response.json();
      setResponsesFiltered(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading filtered responses:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 9) Get Evidence Sentences by Class
  const fetchSentencesByClass = async (
    file: string,
    // 10 so every AI-summary source sentence is within the evidence window
    // the "From your consultation" highlight matches against (some sources
    // rank as low as #10 by NLP pred_score — e.g. SID 14 ED radiation).
    top_n: number = 10
  ): Promise<any | null> => {
    try {
      const params = new URLSearchParams({ top_n: top_n.toString() });
      const response = await fetch(
        `${BASE_URL}/api/backend/patient/sentences/${encodeURIComponent(file)}?${params.toString()}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch evidence sentences");
      const data = await response.json();
      return data;
    } catch (err) {
      console.error("Error loading evidence sentences:", err);
      return null;
    }
  };

  // ============================================================================
  // PUT APIs
  // ============================================================================

  // 9) Update Scoring - API #13
  // PUT /api/patient/scoring
  const updateScoring = async (
    data: PatientScoringUpdate
  ): Promise<ScoringResult | null> => {
    try {
      setLoading(true);
      setError(null);
      console.log("Updating scoring:", data);

      const response = await fetch(`${BASE_URL}/api/backend/patient/scoring`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update scoring: ${errorText}`);
      }

      const result: ScoringResult = await response.json();
      console.log("Scoring updated successfully:", result);

      // Optionally refresh scoring data after update
      await fetchScoringFiltered(data.file, data.speaker);

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error updating scoring:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 10) Update Responses - PUT /api/patient/responses
  const updateResponses = async (
    data: PatientResponsesUpdate
  ): Promise<ResponsesResult | null> => {
    try {
      setLoading(true);
      setError(null);
      console.log("Updating responses:", data);

      const response = await fetch(`${BASE_URL}/api/backend/patient/responses`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update responses: ${errorText}`);
      }

      const result: ResponsesResult = await response.json();
      console.log("Responses updated successfully:", result);

      // Optionally refresh responses data after update
      await fetchResponsesFiltered(data.file, data.speaker);

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error updating responses:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 11) Update Single Class Score (Convenience function)
  // Convenience wrapper: update a single domain's score
  const updateSingleClassScore = async (
    file: string,
    speaker: string,
    domain: string,
    score: number
  ): Promise<ScoringResult | null> => {
    const data: PatientScoringUpdate = {
      file,
      speaker,
      domain,
      patient_scoring: score,
    };
    return updateScoring(data);
  };

  // 12) Update All Class Scores at Once (Convenience function)
  // Convenience wrapper: update every domain score in one call
  const updateAllClassScores = async (
    file: string,
    speaker: string,
    scores: { [domain: string]: number }
  ): Promise<ScoringResult | null> => {
    // With normalized table, each domain is a separate row.
    // Send updates sequentially and return the last result.
    let lastResult: ScoringResult | null = null;
    for (const [domain, score] of Object.entries(scores)) {
      lastResult = await updateSingleClassScore(file, speaker, domain, score);
      if (!lastResult) break;
    }
    return lastResult;
  };

  // 13) Update Single Answer (Convenience function)
  // Convenience wrapper: update a single domain's answer
  const updateSingleAnswer = async (
    file: string,
    speaker: string,
    domain: string,
    answer: string
  ): Promise<ResponsesResult | null> => {
    const data: PatientResponsesUpdate = {
      file,
      speaker,
      domain,
      patient_response: answer,
    };
    return updateResponses(data);
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  return {
    // State
    files,
    summariesAll,
    summariesFiltered,
    summaryDetail,
    aiSummary,
    scoringAll,
    scoringFiltered,
    responsesAll,
    responsesFiltered,
    loading,
    error,

    // GET APIs
    fetchFiles,
    fetchSummariesAll,
    fetchSummariesFiltered,
    fetchSummaryDetail,
    fetchAISummary,
    fetchScoringAll,
    fetchScoringFiltered,
    fetchResponsesAll,
    fetchResponsesFiltered,
    fetchSentencesByClass,

    // PUT APIs
    updateScoring,
    updateResponses,

    // Convenience functions
    updateSingleClassScore,
    updateAllClassScores,
    updateSingleAnswer,
  };
};
