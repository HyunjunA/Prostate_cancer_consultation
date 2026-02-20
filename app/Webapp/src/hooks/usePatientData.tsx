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
// PUT API용 Interface 정의
// ──────────────────────────────────────────────────────────────────────────────
export interface PatientScoringUpdate {
  file: string;
  speaker: string;
  class_1_patient_scoring?: number | null;
  class_2_patient_scoring?: number | null;
  class_3_patient_scoring?: number | null;
  class_4_patient_scoring?: number | null;
  class_5_patient_scoring?: number | null;
}

export interface PatientResponsesUpdate {
  file: string;
  speaker: string;
  answer_1?: string | null;
  answer_2?: string | null;
  answer_3?: string | null;
  answer_4?: string | null;
  answer_5?: string | null;
}

export interface ScoringResult {
  file: string;
  speaker: string;
  scores: {
    class_1: number | null;
    class_2: number | null;
    class_3: number | null;
    class_4: number | null;
    class_5: number | null;
  };
  average: number | null;
}

export interface ResponsesResult {
  file: string;
  speaker: string;
  answers: {
    answer_1: string | null;
    answer_2: string | null;
    answer_3: string | null;
    answer_4: string | null;
    answer_5: string | null;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// API Configuration
// ──────────────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY =
  process.env.NEXT_PUBLIC_API_KEY || "REDACTED_API_KEY";

// Helper function to create headers with API Key
const getHeaders = () => {
  console.log("=== getHeaders called ===");
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
  };
  console.log("Headers:", headers);
  return headers;
};

export const usePatientData = () => {
  const [files, setFiles] = useState<string[] | null>(null);
  const [summariesAll, setSummariesAll] = useState<any | null>(null);
  const [summariesFiltered, setSummariesFiltered] = useState<any | null>(null);
  const [summaryDetail, setSummaryDetail] = useState<any | null>(null);
  const [scoringAll, setScoringAll] = useState<any | null>(null);
  const [scoringFiltered, setScoringFiltered] = useState<any | null>(null);
  const [responsesAll, setResponsesAll] = useState<any | null>(null);
  const [responsesFiltered, setResponsesFiltered] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // GET APIs (모든 함수에 return 추가)
  // ============================================================================

  // 1) Get Files
  const fetchFiles = async (): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      console.log("TEST-Fetching from:", `${BASE_URL}/api/patient/files`);
      console.log("TEST-API Key:", API_KEY);
      const response = await fetch(`${BASE_URL}/api/patient/files`, {
        method: "GET",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch files");
      const data = await response.json();
      setFiles(data.files);
      return data; // ← 추가
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading files:", err);
      return null; // ← 추가
    } finally {
      setLoading(false);
    }
  };

  // 2) Get Summaries (All)
  const fetchSummariesAll = async (): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/patient/summaries`, {
        method: "GET",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch summaries");
      const data = await response.json();
      setSummariesAll(data);
      return data; // ← 추가
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading summaries:", err);
      return null; // ← 추가
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
        `${BASE_URL}/api/patient/summaries?${params.toString()}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch filtered summaries");
      const data = await response.json();
      setSummariesFiltered(data);
      return data; // ← 추가
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading filtered summaries:", err);
      return null; // ← 추가
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
        `${BASE_URL}/api/patient/summaries/${file}/${speaker}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch summary detail");
      const data = await response.json();
      setSummaryDetail(data);
      return data; // ← 추가
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading summary detail:", err);
      return null; // ← 추가
    } finally {
      setLoading(false);
    }
  };

  // 5) Get Scoring (All)
  const fetchScoringAll = async (): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/patient/scoring`, {
        method: "GET",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch scoring");
      const data = await response.json();
      setScoringAll(data);
      return data; // ← 추가
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading scoring:", err);
      return null; // ← 추가
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
        `${BASE_URL}/api/patient/scoring?${params.toString()}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch filtered scoring");
      const data = await response.json();
      setScoringFiltered(data);
      return data; // ← 추가
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading filtered scoring:", err);
      return null; // ← 추가
    } finally {
      setLoading(false);
    }
  };

  // 7) Get Responses (All)
  const fetchResponsesAll = async (): Promise<any | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/patient/responses`, {
        method: "GET",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch responses");
      const data = await response.json();
      setResponsesAll(data);
      return data; // ← 추가
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading responses:", err);
      return null; // ← 추가
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
        `${BASE_URL}/api/patient/responses?${params.toString()}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch filtered responses");
      const data = await response.json();
      setResponsesFiltered(data);
      return data; // ← 추가
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading filtered responses:", err);
      return null; // ← 추가
    } finally {
      setLoading(false);
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

      const response = await fetch(`${BASE_URL}/api/patient/scoring`, {
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

      const response = await fetch(`${BASE_URL}/api/patient/responses`, {
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
  // 개별 class score만 업데이트하는 편의 함수
  const updateSingleClassScore = async (
    file: string,
    speaker: string,
    classNumber: 1 | 2 | 3 | 4 | 5,
    score: number
  ): Promise<ScoringResult | null> => {
    const data: PatientScoringUpdate = {
      file,
      speaker,
      [`class_${classNumber}_patient_scoring`]: score,
    };
    return updateScoring(data);
  };

  // 12) Update All Class Scores at Once (Convenience function)
  // 모든 class scores를 한번에 업데이트하는 편의 함수
  const updateAllClassScores = async (
    file: string,
    speaker: string,
    scores: {
      class_1?: number;
      class_2?: number;
      class_3?: number;
      class_4?: number;
      class_5?: number;
    }
  ): Promise<ScoringResult | null> => {
    const data: PatientScoringUpdate = {
      file,
      speaker,
      class_1_patient_scoring: scores.class_1,
      class_2_patient_scoring: scores.class_2,
      class_3_patient_scoring: scores.class_3,
      class_4_patient_scoring: scores.class_4,
      class_5_patient_scoring: scores.class_5,
    };
    return updateScoring(data);
  };

  // 13) Update Single Answer (Convenience function)
  // 개별 answer만 업데이트하는 편의 함수
  const updateSingleAnswer = async (
    file: string,
    speaker: string,
    answerNumber: 1 | 2 | 3 | 4 | 5,
    answer: string
  ): Promise<ResponsesResult | null> => {
    const data: PatientResponsesUpdate = {
      file,
      speaker,
      [`answer_${answerNumber}`]: answer,
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
    fetchScoringAll,
    fetchScoringFiltered,
    fetchResponsesAll,
    fetchResponsesFiltered,

    // PUT APIs
    updateScoring,
    updateResponses,

    // Convenience functions
    updateSingleClassScore,
    updateAllClassScores,
    updateSingleAnswer,
  };
};
