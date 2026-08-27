// src/hooks/useDoctorData.tsx
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

// ═══════════════════════════════════════════════════════════
// Rewrite Data Type Definition (for PUT request)
// ═══════════════════════════════════════════════════════════
export interface DoctorRewriteData {
  file: string;
  i: number;
  i2: number;
  speaker: string;
  time?: string;
  original_sentence: string;
  revised_sentence: string;
  score: number;
  class_: string; // "1" | "2" | "3" | "4" | "5"
}

// ═══════════════════════════════════════════════════════════
// Sentence Data Type Definition (API Response)
// ═══════════════════════════════════════════════════════════
// Mirrors the per-item dict built in Backend routes_doctor.py
// `get_doctor_sentences` (GET /doctor/sentences/{file}/{speaker}). `file` and
// `speaker` live on the response envelope, not on each item, so they are not
// declared here. `time` is emitted as a literal null by that endpoint, and
// `score` is a lookup miss away from null, so both are nullable.
export interface DoctorSentenceItem {
  i: number;
  i2: number;
  time: string | null;
  sentence: string;
  // Surrounding utterance with the sentence wrapped in <main> tags.
  context?: string | null;
  class: string;
  score?: number | null;
}

export interface DoctorSentencesResponse {
  file: string;
  speaker: string;
  total: number;
  data: DoctorSentenceItem[];
}

// ═══════════════════════════════════════════════════════════
// Rewrite Response Data Type (GET Response)
// ═══════════════════════════════════════════════════════════
export interface DoctorRewriteItem {
  file: string;
  i: number;
  i2: number;
  speaker: string;
  time: string;
  original_sentence: string;
  revised_sentence: string;
  score: number;
  class: string;
}

export interface DoctorRewritesResponse {
  total: number;
  skip: number;
  limit: number;
  data: DoctorRewriteItem[];
}

// ═══════════════════════════════════════════════════════════
// NEW: Rewrite History Data Type Definition
// ═══════════════════════════════════════════════════════════
export interface RewriteHistoryItem {
  revision_number: number;
  time: string | null;
  revised_sentence: string;
  score: number | null;
  class: string;
}

export interface RewriteHistoryResponse {
  file: string;
  i: number;
  i2: number;
  speaker: string;
  class: string;
  original_sentence: string;
  original_score: number | null;
  total_revisions: number;
  history: RewriteHistoryItem[];
}

// ═══════════════════════════════════════════════════════════
// NEW: Score Average Data Type Definition
// ═══════════════════════════════════════════════════════════
export interface ScoreAverageItem {
  file: string;
  speaker: string;
  class: string;
  avg_score: number | null;
  count: number;
  rewritten_count: number;
  original_count: number;
  min_score: number | null;
  max_score: number | null;
}

export interface ScoreAverageResponse {
  total_groups: number;
  filters: {
    file: string | null;
    speaker: string | null;
    class: string | null;
  };
  data: ScoreAverageItem[];
}

// ═══════════════════════════════════════════════════════════
// NEW: Score Summary Data Type Definition
// ═══════════════════════════════════════════════════════════
// Mirrors the payload built in Backend routes_doctor.py
// `get_doctor_score_summary_by_file_speaker`
// (GET /doctor/scores/summary/{file}[/{speaker}]). This endpoint reads
// llm_domain_scoring_and_summary and returns ONE row per domain, so it shares
// no shape with /scores/average — do not reuse ScoreAverageItem here.
export interface ScoreSummaryClassItem {
  // Domain code: cp | le | ed | inc | ius.
  class: string;
  // Designated-treatment ai_score (0-5); forced to 0 when the domain was
  // mentioned but not tied to the designated treatment.
  score: number | null;
  // Always null on this endpoint; kept because the payload carries the key.
  pred_score: number | null;
  sentence: string | null;
  // (utterance_index, sentence_in_utterance) of `sentence`, when it could be
  // matched back to sentence_prediction.
  i: number | null;
  i2: number | null;
  explanation: string | null;
  extracted_estimate: string | null;
  treatment: string | null;
}

export interface ScoreSummaryResponse {
  file: string;
  speaker: string;
  overall: {
    // Canonical per-patient overall: designated-treatment domain scores
    // averaged over 5. Null when the file has no AI rows yet.
    score: number | null;
    count: number;
  };
  by_class: ScoreSummaryClassItem[];
}

// ═══════════════════════════════════════════════════════════
// NEW: Class Distribution Data Type Definition
// ═══════════════════════════════════════════════════════════
export interface ClassDistributionItem {
  file: string;
  classes: Record<string, number>;
  total: number;
}

export interface ClassDistributionResponse {
  total_files: number;
  filters: {
    file: string | null;
    include_invalid: boolean;
  };
  data: ClassDistributionItem[];
}

export interface ClassDistributionDetailItem {
  class: string;
  count: number;
  percentage: number;
}

export interface ClassDistributionDetailResponse {
  file: string;
  total_sentences: number;
  include_invalid: boolean;
  distribution: ClassDistributionDetailItem[];
}

// ═══════════════════════════════════════════════════════════
// Sentence Scoring Data Type Definition
// ═══════════════════════════════════════════════════════════
export interface SentenceScoringRequest {
  sentence: string;
  class_?: string;
}

export interface SentenceScoringResponse {
  score: number;
  sentence: string;
}

// ═══════════════════════════════════════════════════════════
// NEW: AI Rewrite Data Type Definition
// ═══════════════════════════════════════════════════════════
export interface AIRewriteRequest {
  sentence: string;
  class_: string;
  target_score?: number;
  context?: string; // Optional: full context for better rewriting
}

export interface AIRewriteResponse {
  original_sentence: string;
  rewritten_sentence: string;
  original_score: number | null;
  new_score: number;
  class_: string;
  improvement_applied: string; // Description of what was improved
}

// ═══════════════════════════════════════════════════════════
// NEW: Improvement Suggestions Data Type Definition
// ═══════════════════════════════════════════════════════════
export interface ImprovementSuggestionItem {
  target_score: number;
  suggestion: string;
}

export interface ImprovementSuggestionsResponse {
  class_: string;
  class_name: string;
  current_score: number | null;
  suggestions: ImprovementSuggestionItem[];
  all_levels: Record<number, string>;
}

export interface AllImprovementSuggestionsResponse {
  total_classes: number;
  data: Record<
    string,
    {
      class_name: string;
      suggestions: Record<number, string>;
    }
  >;
}

// ═══════════════════════════════════════════════════════════
// Score Trajectory Data Type Definition (B-2 feedback)
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// Rewrite Stats Data Type Definition
// ═══════════════════════════════════════════════════════════
export interface RewriteStatsFileItem {
  file: string;
  rewrite_count: number;
  unique_sentences: number;
  first_rewrite: string | null;
  last_rewrite: string | null;
}

export interface RewriteStatsResponse {
  total_rewrites: number;
  unique_sentences_rewritten: number;
  per_file: RewriteStatsFileItem[];
}

export interface TrajectoryPatientDetail {
  file: string;
  overall_score: number;
}

export interface TrajectoryItem {
  timestamp: string;
  event_type: "consultation" | "rewrite";
  file: string;
  overall_score: number | null;
  by_class: Record<string, number>;
  patients_count: number;
  patients_detail: TrajectoryPatientDetail[];
}

export interface TrajectoryResponse {
  total_events: number;
  speaker_filter: string | null;
  trajectory: TrajectoryItem[];
}

const BASE_URL = ""; // same-origin; proxied via /api/backend/

// Helper function to create headers
const getHeaders = () => ({
  "Content-Type": "application/json",
});

export const useDoctorData = (doctorId?: string | null) => {
  const [files, setFiles] = useState<string[] | null>(null);
  const [sentences, setSentences] = useState<DoctorSentencesResponse | null>(
    null
  );
  const [rewritesAll, setRewritesAll] = useState<DoctorRewritesResponse | null>(
    null
  );
  const [rewritesFiltered, setRewritesFiltered] =
    useState<DoctorRewritesResponse | null>(null);
  const [rewritesPaginated, setRewritesPaginated] =
    useState<DoctorRewritesResponse | null>(null);

  // Rewrite History State
  const [rewriteHistory, setRewriteHistory] =
    useState<RewriteHistoryResponse | null>(null);

  // Score Average States
  const [scoreAverage, setScoreAverage] = useState<ScoreAverageResponse | null>(
    null
  );
  const [scoreSummary, setScoreSummary] = useState<ScoreSummaryResponse | null>(
    null
  );
  const [classDistribution, setClassDistribution] =
    useState<ClassDistributionResponse | null>(null);
  const [classDistributionDetail, setClassDistributionDetail] =
    useState<ClassDistributionDetailResponse | null>(null);

  // NEW: AI Rewrite State
  const [aiRewrite, setAIRewrite] = useState<AIRewriteResponse | null>(null);
  const [aiRewriteLoading, setAIRewriteLoading] = useState(false);

  // NEW: Improvement Suggestions State
  const [improvementSuggestions, setImprovementSuggestions] =
    useState<ImprovementSuggestionsResponse | null>(null);
  const [allImprovementSuggestions, setAllImprovementSuggestions] =
    useState<AllImprovementSuggestionsResponse | null>(null);

  // NEW: Trajectory State (B-2 feedback)
  const [trajectoryData, setTrajectoryData] =
    useState<TrajectoryResponse | null>(null);

  // NEW: Rewrite Stats State (B-5 feedback)
  const [rewriteStats, setRewriteStats] =
    useState<RewriteStatsResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ═══════════════════════════════════════════════════════════
  // 1) Get Files
  // ═══════════════════════════════════════════════════════════
  const fetchFiles = async (doctorId?: string | null) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (doctorId) params.append("doctor_id", doctorId);
      const url = params.toString()
        ? `${BASE_URL}/api/backend/doctor/files?${params.toString()}`
        : `${BASE_URL}/api/backend/doctor/files`;
      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch files");
      const data = await response.json();
      setFiles(data.files);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading files:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 2) Get Sentences by File & Speaker
  // ═══════════════════════════════════════════════════════════
  const fetchSentences = async (file: string, speaker: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `${BASE_URL}/api/backend/doctor/sentences/${encodeURIComponent(
          file
        )}/${encodeURIComponent(speaker)}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch sentences");
      const data = await response.json();
      setSentences(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading sentences:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 3) Get Rewrites (All)
  // ═══════════════════════════════════════════════════════════
  const fetchRewritesAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/backend/doctor/rewrites`, {
        method: "GET",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch rewrites");
      const data = await response.json();
      setRewritesAll(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading rewrites:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 4) Get Rewrites (Filtered)
  // ═══════════════════════════════════════════════════════════
  const fetchRewritesFiltered = async (file: string, speaker: string) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ file, speaker });
      const response = await fetch(
        `${BASE_URL}/api/backend/doctor/rewrites?${params.toString()}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch filtered rewrites");
      const data = await response.json();
      setRewritesFiltered(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading filtered rewrites:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 5) Get Rewrites (Pagination)
  // ═══════════════════════════════════════════════════════════
  const fetchRewritesPaginated = async (skip: number, limit: number) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(limit),
      });
      const response = await fetch(
        `${BASE_URL}/api/backend/doctor/rewrites?${params.toString()}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch paginated rewrites");
      const data = await response.json();
      setRewritesPaginated(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading paginated rewrites:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 5-1) Get Rewrite History for Specific Sentence
  // GET /api/doctor/rewrites/{file}/{i}/{i2}/history
  // ═══════════════════════════════════════════════════════════
  const fetchRewriteHistory = async (
    file: string,
    i: number,
    i2: number
  ): Promise<RewriteHistoryResponse | null> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${BASE_URL}/api/backend/doctor/rewrites/${encodeURIComponent(
          file
        )}/${i}/${i2}/history`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          setRewriteHistory(null);
          return null;
        }
        throw new Error("Failed to fetch rewrite history");
      }

      const data: RewriteHistoryResponse = await response.json();
      setRewriteHistory(data);
      console.log("Rewrite history loaded:", data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading rewrite history:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // Helper: Clear Rewrite History
  // ═══════════════════════════════════════════════════════════
  const clearRewriteHistory = () => {
    setRewriteHistory(null);
  };

  // ═══════════════════════════════════════════════════════════
  // 6) Save Rewrite (PUT)
  // ═══════════════════════════════════════════════════════════
  const saveRewrite = async (rewriteData: DoctorRewriteData) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${BASE_URL}/api/backend/doctor/rewrites`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(rewriteData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to save rewrite");
      }

      const data = await response.json();
      console.log("Rewrite saved successfully:", data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error saving rewrite:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 7) Helper: Save Rewrite with auto-generated timestamp
  // ═══════════════════════════════════════════════════════════
  const saveRewriteWithTimestamp = async (
    file: string,
    speaker: string,
    i: number,
    i2: number,
    originalSentence: string,
    revisedSentence: string,
    score: number,
    classNumber: string
  ) => {
    const rewriteData: DoctorRewriteData = {
      file,
      i,
      i2,
      speaker,
      time: new Date().toISOString(),
      original_sentence: originalSentence,
      revised_sentence: revisedSentence,
      score,
      class_: classNumber,
    };

    return saveRewrite(rewriteData);
  };

  // ═══════════════════════════════════════════════════════════
  // 8) Get Score Average
  // GET /api/doctor/scores/average?file=...&speaker=...&class=...
  // ═══════════════════════════════════════════════════════════
  const fetchScoreAverage = async (
    file?: string,
    speaker?: string,
    classNumber?: string,
    doctorId?: string | null
  ) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (file) params.append("file", file);
      if (speaker) params.append("speaker", speaker);
      if (classNumber) params.append("class", classNumber);
      if (doctorId) params.append("doctor_id", doctorId);

      const url = params.toString()
        ? `${BASE_URL}/api/backend/doctor/scores/average?${params.toString()}`
        : `${BASE_URL}/api/backend/doctor/scores/average`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) throw new Error("Failed to fetch score average");
      const data: ScoreAverageResponse = await response.json();
      setScoreAverage(data);
      console.log("Score average loaded:", data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading score average:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 9) Get Score Summary by File & Speaker
  // GET /api/doctor/scores/summary/{file}/{speaker}
  // ═══════════════════════════════════════════════════════════
  const fetchScoreSummary = async (file: string, speaker?: string) => {
    try {
      setLoading(true);
      setError(null);

      const url = speaker
        ? `${BASE_URL}/api/backend/doctor/scores/summary/${encodeURIComponent(file)}/${encodeURIComponent(speaker)}`
        : `${BASE_URL}/api/backend/doctor/scores/summary/${encodeURIComponent(file)}`;

      const response = await fetch(url,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );

      if (!response.ok) throw new Error("Failed to fetch score summary");
      const data: ScoreSummaryResponse = await response.json();
      setScoreSummary(data);
      console.log("Score summary loaded:", data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading score summary:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 10) Get Class Distribution
  // GET /api/doctor/class-distribution?file=...&include_invalid=...
  // ═══════════════════════════════════════════════════════════
  const fetchClassDistribution = async (
    file?: string,
    includeInvalid: boolean = false
  ) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (file) params.append("file", file);
      if (includeInvalid) params.append("include_invalid", "true");

      const url = params.toString()
        ? `${BASE_URL}/api/backend/doctor/class-distribution?${params.toString()}`
        : `${BASE_URL}/api/backend/doctor/class-distribution`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) throw new Error("Failed to fetch class distribution");
      const data: ClassDistributionResponse = await response.json();
      setClassDistribution(data);
      console.log("Class distribution loaded:", data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading class distribution:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 11) Get Class Distribution Detail by File
  // GET /api/doctor/class-distribution/{file}?include_invalid=...
  // ═══════════════════════════════════════════════════════════
  const fetchClassDistributionDetail = async (
    file: string,
    includeInvalid: boolean = false
  ) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (includeInvalid) params.append("include_invalid", "true");

      const url = params.toString()
        ? `${BASE_URL}/api/backend/doctor/class-distribution/${encodeURIComponent(
            file
          )}?${params.toString()}`
        : `${BASE_URL}/api/backend/doctor/class-distribution/${encodeURIComponent(
            file
          )}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok)
        throw new Error("Failed to fetch class distribution detail");
      const data: ClassDistributionDetailResponse = await response.json();
      setClassDistributionDetail(data);
      console.log("Class distribution detail loaded:", data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading class distribution detail:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 12) Score Sentence (POST)
  // POST /api/doctor/score-sentence
  // ═══════════════════════════════════════════════════════════
  const scoreSentence = async (
    sentence: string,
    classNumber?: string
  ): Promise<SentenceScoringResponse | null> => {
    try {
      setLoading(true);
      setError(null);

      const requestBody: SentenceScoringRequest = {
        sentence,
        class_: classNumber,
      };

      const response = await fetch(`${BASE_URL}/api/backend/doctor/score-sentence`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error("Failed to score sentence");
      const data: SentenceScoringResponse = await response.json();
      console.log("Sentence scored:", data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error scoring sentence:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // NEW: 13) Generate AI Rewrite (POST)
  // POST /api/doctor/ai-rewrite
  // Calls LLM to generate an improved version of the sentence
  // ═══════════════════════════════════════════════════════════
  const generateAIRewrite = async (
    sentence: string,
    classNumber: string,
    targetScore?: number,
    context?: string
  ): Promise<AIRewriteResponse | null> => {
    try {
      setAIRewriteLoading(true);
      setError(null);

      const requestBody: AIRewriteRequest = {
        sentence,
        class_: classNumber,
        target_score: targetScore,
        context,
      };

      const response = await fetch(`${BASE_URL}/api/backend/doctor/ai-rewrite`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to generate AI rewrite");
      }

      const data: AIRewriteResponse = await response.json();
      setAIRewrite(data);
      console.log("AI Rewrite generated:", data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error generating AI rewrite:", err);
      return null;
    } finally {
      setAIRewriteLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // Helper: Clear AI Rewrite
  // ═══════════════════════════════════════════════════════════
  const clearAIRewrite = () => {
    setAIRewrite(null);
  };

  // ═══════════════════════════════════════════════════════════
  // NEW: 14) Fetch Improvement Suggestions by Class
  // GET /api/doctor/improvement-suggestions/{class_}?current_score=...
  // ═══════════════════════════════════════════════════════════
  const fetchImprovementSuggestions = async (
    classNumber: string,
    currentScore?: number
  ): Promise<ImprovementSuggestionsResponse | null> => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (currentScore !== undefined) {
        params.append("current_score", currentScore.toString());
      }

      const url = params.toString()
        ? `${BASE_URL}/api/backend/doctor/improvement-suggestions/${encodeURIComponent(
            classNumber
          )}?${params.toString()}`
        : `${BASE_URL}/api/backend/doctor/improvement-suggestions/${encodeURIComponent(
            classNumber
          )}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok)
        throw new Error("Failed to fetch improvement suggestions");
      const data: ImprovementSuggestionsResponse = await response.json();
      setImprovementSuggestions(data);
      console.log("Improvement suggestions loaded:", data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading improvement suggestions:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // NEW: 15) Fetch All Improvement Suggestions
  // GET /api/doctor/improvement-suggestions
  // ═══════════════════════════════════════════════════════════
  const fetchAllImprovementSuggestions =
    async (): Promise<AllImprovementSuggestionsResponse | null> => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${BASE_URL}/api/backend/doctor/improvement-suggestions`,
          {
            method: "GET",
            headers: getHeaders(),
          }
        );

        if (!response.ok)
          throw new Error("Failed to fetch all improvement suggestions");
        const data: AllImprovementSuggestionsResponse = await response.json();
        setAllImprovementSuggestions(data);
        console.log("All improvement suggestions loaded:", data);
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Error loading all improvement suggestions:", err);
        return null;
      } finally {
        setLoading(false);
      }
    };

  // ═══════════════════════════════════════════════════════════
  // Helper: Clear Improvement Suggestions
  // ═══════════════════════════════════════════════════════════
  const clearImprovementSuggestions = () => {
    setImprovementSuggestions(null);
  };

  // ═══════════════════════════════════════════════════════════
  // NEW: 16) Fetch Score Trajectory (B-2 feedback)
  // GET /api/doctor/scores/trajectory?speaker=...
  // ═══════════════════════════════════════════════════════════
  const fetchTrajectory = async (
    speaker?: string,
    doctorId?: string | null
  ): Promise<TrajectoryResponse | null> => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (speaker) params.append("speaker", speaker);
      if (doctorId) params.append("doctor_id", doctorId);

      const url = params.toString()
        ? `${BASE_URL}/api/backend/doctor/scores/trajectory?${params.toString()}`
        : `${BASE_URL}/api/backend/doctor/scores/trajectory`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) throw new Error("Failed to fetch trajectory");
      const data: TrajectoryResponse = await response.json();
      setTrajectoryData(data);
      console.log("Trajectory loaded:", data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error loading trajectory:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // Rewrite Stats (B-5 feedback: track rewrite usage)
  // ═══════════════════════════════════════════════════════════
  const fetchRewriteStats = async (
    speaker?: string
  ): Promise<RewriteStatsResponse | null> => {
    try {
      const params = new URLSearchParams();
      if (speaker) params.append("speaker", speaker);

      const url = params.toString()
        ? `${BASE_URL}/api/backend/doctor/rewrites/stats?${params.toString()}`
        : `${BASE_URL}/api/backend/doctor/rewrites/stats`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) throw new Error("Failed to fetch rewrite stats");
      const data: RewriteStatsResponse = await response.json();
      setRewriteStats(data);
      return data;
    } catch (err) {
      console.error("Error loading rewrite stats:", err);
      return null;
    }
  };

  useEffect(() => {
    // Scope the mount fetch to the doctor (if provided) so it never races with
    // a component's own scoped fetch and shows another doctor's patients.
    fetchFiles(doctorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  return {
    // State
    files,
    sentences,
    rewritesAll,
    rewritesFiltered,
    rewritesPaginated,
    // Rewrite History State
    rewriteHistory,
    // Score States
    scoreAverage,
    scoreSummary,
    classDistribution,
    classDistributionDetail,
    // NEW: AI Rewrite State
    aiRewrite,
    aiRewriteLoading,
    // NEW: Improvement Suggestions State
    improvementSuggestions,
    allImprovementSuggestions,
    loading,
    error,
    // GET Functions
    fetchFiles,
    fetchSentences,
    fetchRewritesAll,
    fetchRewritesFiltered,
    fetchRewritesPaginated,
    // Rewrite History Functions
    fetchRewriteHistory,
    clearRewriteHistory,
    // Score Functions
    fetchScoreAverage,
    fetchScoreSummary,
    fetchClassDistribution,
    fetchClassDistributionDetail,
    // PUT Functions
    saveRewrite,
    saveRewriteWithTimestamp,
    // POST Functions
    scoreSentence,
    // NEW: AI Rewrite Functions
    generateAIRewrite,
    clearAIRewrite,
    // NEW: Improvement Suggestions Functions
    fetchImprovementSuggestions,
    fetchAllImprovementSuggestions,
    clearImprovementSuggestions,
    // NEW: Trajectory Functions (B-2 feedback)
    trajectoryData,
    fetchTrajectory,
    // NEW: Rewrite Stats (B-5 feedback)
    rewriteStats,
    fetchRewriteStats,
  };
};
