// PhysicianReportsModified.tsx
// Language: TypeScript/React (TailwindCSS)
// UI structure: Dashboard → Grid → Detail
// REFACTORED: All nested components moved outside to prevent re-render issues
// - DashboardView, GridView, DetailView are now separate components
// - Utility functions moved outside
// - Props interfaces defined for type safety
// - NEW: Rewrite History Modal added
// - UPDATED: GridView table shows Topic, Your Score, Representative Sentence,
//            Suggestions for Improvement, and Suggested Rephrasing
// - NEW: AI Rewrite integration added

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { sendTrackingEvents } from "@/api/trackingApi";
import { trackDoctor, startSession, endSession } from "@/tracking/track";
import { getOrCreateSession } from "@/tracking/utils/session.utils";
import { TrackingEventManager } from "@/tracking/lib/TrackingEventManager";
import type { TrackingEvent } from "@/tracking/lib/TrackingEventManager";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
// import ConsultationScoring from "./ConsultationScoringV7Timothy";
// import ConsultationScoring from "./ConsultationScoringV7Timothy3";
// import ConsultationScoring from "./ConsultationScoringV7Timothy5";
import ConsultationScoring from "./ConsultationScoringV7Timothy7";
import HistoryModal from "./HistoryModal";
import OnboardingTour, { RestartTourButton } from "./OnboardingTour";
import {
  useDoctorData,
  DoctorSentenceItem,
  DoctorRewriteItem,
  RewriteHistoryResponse,
  RewriteHistoryItem,
  AIRewriteResponse,
  TrajectoryItem,
  ScoreAverageItem,
  RewriteStatsResponse,
} from "@/hooks/useDoctorData";

// ═══════════════════════════════════════════════════════════
// Store imports
// ═══════════════════════════════════════════════════════════
import { useFileId } from "@/stores/useFileId";
import { useDoctorId } from "@/stores/useDoctorId";

// ═══════════════════════════════════════════════════════════
// Types & Interfaces
// ═══════════════════════════════════════════════════════════
type TopicName =
  | "Cancer Prognosis"
  | "Life Expectancy"
  | "Erectile Dysfunction"
  | "Urinary Incontinence"
  | "Irritative Symptoms";

interface SentenceDetail {
  i: number;
  i2: number;
  sentence: string;
  context?: string;
  time: string;
  score?: number;
  hasRewrite?: boolean;
  revisedSentence?: string;
  revisedScore?: number;
  revisedTime?: string;
}

interface TopicData {
  score: number | null;
  sentences: string[];
  sentenceDetails: SentenceDetail[];
  // Treatment of the by_class row this domain's score/sentence came from.
  // "<missing>" means the domain was mentioned but not tied to the designated
  // treatment (score forced to 0) — used to show a "not tied to surgery" badge.
  representativeTreatment?: string | null;
}

interface PatientRow {
  id: string;
  name: string;
  fileName: string;
  // Processing timestamp (generic name — NOT the clinical visit date). Held for
  // possible future use; the UI shows visitIndex ("Visit N"), never a date.
  processingDate: string;
  // 1-based visit order the server reconstructs from the (hashed) visit date. The
  // UI shows "Visit N" instead of a calendar date, which is never sent.
  visitIndex?: number;
  status?: string;
  overallScore: number;
  topics: Record<TopicName, TopicData>;
}

interface PhysicianReportsProps {
  isDarkMode?: boolean;
}

interface ImprovementSuggestion {
  targetScore: number;
  suggestion: string;
}

interface SelectedTopicState {
  name: TopicName;
  patient: PatientRow;
}

// ═══════════════════════════════════════════════════════════
// Props Interfaces for Child Components
// ═══════════════════════════════════════════════════════════
interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  isDarkMode: boolean;
}

interface DashboardViewProps {
  isDarkMode: boolean;
  patients: PatientRow[];
  filteredPatients: PatientRow[];
  selectedSpeaker: string;
  search: string;
  setSearch: (value: string) => void;
  scoreBand: "ALL" | "HIGH" | "STD" | "LOW";
  setScoreBand: (value: "ALL" | "HIGH" | "STD" | "LOW") => void;
  setSelectedPatient: (patient: PatientRow) => void;
  setCurrentView: (view: "dashboard" | "grid" | "detail") => void;
  trajectoryData?: TrajectoryItem[];
  scoreAverageData?: ScoreAverageItem[];
  onOpenRubric?: (domain: TopicName | "All Domains", score: number | null) => void;
  onTrackEvent?: (
    eventType: string,
    elementId: string,
    metadata?: Record<string, any>,
  ) => void;
}

interface GridViewProps {
  isDarkMode: boolean;
  selectedPatient: PatientRow;
  selectedSpeaker: string;
  topicsData: Record<TopicName, TopicData>;
  overallScore: number | null;
  scoreSummaryLoading: boolean;
  apiLoading: boolean;
  apiError: string | null;
  sentences: { data: DoctorSentenceItem[] } | null;
  setCurrentView: (view: "dashboard" | "grid" | "detail") => void;
  setSelectedPatient: (patient: PatientRow | null) => void;
  setSelectedTopic: (topic: SelectedTopicState | null) => void;
  setSelectedSuggestion: (suggestion: ImprovementSuggestion | null) => void;
  setSelectedSentenceIdx: (idx: number) => void;
  setShowRewrite: (show: boolean) => void;
  fetchSentences: (file: string, speaker: string) => void;
  fetchRewritesFiltered: (file: string, speaker: string) => void;
  fetchScoreSummary: (file: string, speaker: string) => Promise<any>;
  setScoreSummaryLoading: (loading: boolean) => void;
  onOpenRubric?: (domain: TopicName, score: number) => void;
}

interface DetailViewProps {
  isDarkMode: boolean;
  selectedTopic: SelectedTopicState;
  topicsData: Record<TopicName, TopicData>;
  selectedSentenceIdx: number;
  setSelectedSentenceIdx: (idx: number) => void;
  showRewrite: boolean;
  setShowRewrite: (show: boolean) => void;
  newSentence: string;
  setNewSentence: (value: string) => void;
  selectedSuggestion: ImprovementSuggestion | null;
  setSelectedSuggestion: (suggestion: ImprovementSuggestion | null) => void;
  saveStatus: {
    status: "idle" | "saving" | "success" | "error";
    message: string;
  };
  setSaveStatus: (status: {
    status: "idle" | "saving" | "success" | "error";
    message: string;
  }) => void;
  rescoring: boolean;
  setRescoring: (rescoring: boolean) => void;
  selectedFile: string;
  selectedSpeaker: string;
  scoreSentence: (
    sentence: string,
    classNumber?: string,
  ) => Promise<{ score: number; sentence: string } | null>;
  saveRewriteWithTimestamp: (
    file: string,
    speaker: string,
    i: number,
    i2: number,
    originalSentence: string,
    revisedSentence: string,
    score: number,
    classNumber: string,
  ) => Promise<unknown>;
  fetchRewritesFiltered: (file: string, speaker: string) => void;
  fetchScoreSummary: (file: string, speaker: string) => Promise<any>;
  setScoreSummaryLoading: (loading: boolean) => void;
  setCurrentView: (view: "dashboard" | "grid" | "detail") => void;
  setSelectedTopic: (topic: SelectedTopicState | null) => void;
  // History props
  fetchRewriteHistory: (
    file: string,
    i: number,
    i2: number,
  ) => Promise<RewriteHistoryResponse | null>;
  rewriteHistory: RewriteHistoryResponse | null;
  clearRewriteHistory: () => void;
  // NEW: AI Rewrite props
  generateAIRewrite: (
    sentence: string,
    classNumber: string,
    targetScore?: number,
    context?: string,
  ) => Promise<AIRewriteResponse | null>;
  aiRewriteLoading: boolean;
  // Topic trajectory: all patients' scores for the selected topic
  scoreAverageData?: ScoreAverageItem[];
  patients?: PatientRow[];
  fetchScoreAverage?: (file?: string, speaker?: string, classFilter?: string) => void;
  // Rewrite usage stats (B-5 feedback)
  rewriteStats?: RewriteStatsResponse | null;
  fetchRewriteStats?: (speaker?: string) => void;
  // Rubric modal trigger
  onOpenRubric?: (domain: TopicName, score: number) => void;
}

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════
const CLASS_TO_TOPIC: Record<string, TopicName> = {
  // Numeric keys (legacy)
  "1": "Cancer Prognosis",
  "2": "Life Expectancy",
  "3": "Erectile Dysfunction",
  "4": "Urinary Incontinence",
  "5": "Irritative Symptoms",
  // Short model keys (from sentence_prediction.model)
  "cp": "Cancer Prognosis",
  "le": "Life Expectancy",
  "ed": "Erectile Dysfunction",
  "inc": "Urinary Incontinence",
  "ius": "Irritative Symptoms",
  // Full domain name keys (from pipeline)
  "cancer_prognosis": "Cancer Prognosis",
  "life_expectancy": "Life Expectancy",
  "erectile_dysfunction_potency": "Erectile Dysfunction",
  "continence": "Urinary Incontinence",
  "irritative_urinary_symptoms_frequency_urgency_nocturnia": "Irritative Symptoms",
};

const TOPIC_TO_CLASS: Record<TopicName, string> = {
  "Cancer Prognosis": "cancer_prognosis",
  "Life Expectancy": "life_expectancy",
  "Erectile Dysfunction": "erectile_dysfunction_potency",
  "Urinary Incontinence": "continence",
  "Irritative Symptoms": "irritative_urinary_symptoms_frequency_urgency_nocturnia",
};

// Short model keys for matching scoreAverage API responses
const TOPIC_TO_MODEL: Record<TopicName, string> = {
  "Cancer Prognosis": "cp",
  "Life Expectancy": "le",
  "Erectile Dysfunction": "ed",
  "Urinary Incontinence": "inc",
  "Irritative Symptoms": "ius",
};

const ALL_TOPICS: TopicName[] = [
  "Cancer Prognosis",
  "Life Expectancy",
  "Erectile Dysfunction",
  "Urinary Incontinence",
  "Irritative Symptoms",
];

// ═══════════════════════════════════════════════════════════
// Utility Functions (Outside Component)
// ═══════════════════════════════════════════════════════════
const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const formatScore = (score: number | null): string => {
  if (score === null || score === undefined) return "N/A";
  return score.toFixed(2);
};

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getScoreColor = (score: number, isDarkMode: boolean): string => {
  if (isDarkMode) {
    const darkColors: Record<number, string> = {
      0: "bg-gradient-to-br from-slate-700 to-slate-600 text-slate-300 border border-slate-600 shadow-lg",
      1: "bg-gradient-to-br from-red-600 to-red-700 text-red-100 border border-red-500 shadow-lg",
      2: "bg-gradient-to-br from-pink-600 to-pink-700 text-pink-100 border border-pink-500 shadow-lg",
      3: "bg-gradient-to-br from-yellow-600 to-yellow-700 text-yellow-100 border border-yellow-500 shadow-lg",
      4: "bg-gradient-to-br from-green-600 to-green-700 text-green-100 border border-green-500 shadow-lg",
      5: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-emerald-100 border-2 border-emerald-400 font-semibold shadow-lg",
    };
    return darkColors[score] || darkColors[0];
  }
  const lightColors: Record<number, string> = {
    0: "bg-gradient-to-br from-slate-400 to-slate-500 text-white border border-slate-300 shadow-lg",
    1: "bg-gradient-to-br from-red-500 to-red-600 text-white border border-red-400 shadow-lg",
    2: "bg-gradient-to-br from-pink-500 to-pink-600 text-white border border-pink-400 shadow-lg",
    3: "bg-gradient-to-br from-yellow-500 to-yellow-600 text-white border border-yellow-400 shadow-lg",
    4: "bg-gradient-to-br from-green-500 to-green-600 text-white border border-green-400 shadow-lg",
    5: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-emerald-400 font-semibold shadow-lg",
  };
  return lightColors[score] || lightColors[0];
};

const getScoreColorForValue = (
  score: number | null,
  isDarkMode: boolean,
): string => {
  if (score === null || score <= 0) {
    return isDarkMode
      ? "bg-gradient-to-br from-slate-700 to-slate-600 text-slate-300 border border-slate-600 shadow-lg"
      : "bg-gradient-to-br from-slate-400 to-slate-500 text-white border border-slate-300 shadow-lg";
  }
  // Match summary box colors: High(4-5)=emerald, Standard(3)=yellow, Low(0-2)=red
  if (score >= 4) {
    return isDarkMode
      ? "bg-gradient-to-br from-emerald-600 to-emerald-700 text-emerald-100 border border-emerald-500 shadow-lg"
      : "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border border-emerald-400 shadow-lg";
  }
  if (score >= 3) {
    return isDarkMode
      ? "bg-gradient-to-br from-yellow-600 to-yellow-700 text-yellow-100 border border-yellow-500 shadow-lg"
      : "bg-gradient-to-br from-yellow-500 to-yellow-600 text-white border border-yellow-400 shadow-lg";
  }
  return isDarkMode
    ? "bg-gradient-to-br from-red-600 to-red-700 text-red-100 border border-red-500 shadow-lg"
    : "bg-gradient-to-br from-red-500 to-red-600 text-white border border-red-400 shadow-lg";
};

const getImprovementSuggestions = (
  domain: TopicName,
  currentScore: number | null,
): ImprovementSuggestion[] => {
  // Suggestions from PDF pages 12-16 (exact wording)
  const suggestions: Record<TopicName, Record<number, string>> = {
    "Cancer Prognosis": {
      1: "Discuss potential for risk of cancer death, metastasis, or progression",
      2: 'Provide a generalization of magnitude of risk ("high"/"low")',
      3: "Provide a quantified estimate of risk",
      4: "Provide a quantified estimate of risk both with treatment and without treatment at an arbitrary timepoint",
      5: "Provide a quantified estimates of risk both with and without treatment at the patient's life expectancy",
    },
    "Life Expectancy": {
      1: "Discuss the concept of competing risks of mortality",
      2: 'Provide a generalization of duration of life expectancy (i.e., "long"/"short")',
      3: 'Provide a rough quantified estimate of life expectancy (e.g., "about 15-20 years")',
      4: "Provide a probability of living to an arbitrary timepoint",
      5: "Provide a specific number of years and mention calculation based on the patient's age and health status",
    },
    "Erectile Dysfunction": {
      1: "Discuss the potential risk of erectile dysfunction",
      2: 'Provide a generalization of risk (i.e., "high"/"low")',
      3: 'Provide an average probability of ED without a time horizon (e.g., "45% risk of erectile dysfunction")',
      4: 'Provide an average probability of ED with a time horizon (e.g., "45% risk of erectile dysfunction at 1 year postop")',
      5: "Provide a patient-specific probability of ED with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
    "Urinary Incontinence": {
      1: "Discuss the potential risk of urinary incontinence",
      2: 'Provide a generalization of risk (i.e., "high"/"low")',
      3: 'Provide an average probability of UI without a time horizon (e.g., "10% risk of needing pads")',
      4: 'Provide an average probability of UI with a time horizon (e.g., "10% risk of needing pads beyond 1 year postop")',
      5: "Provide a patient-specific probability of UI with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
    "Irritative Symptoms": {
      1: "Discuss the potential risk of irritative urinary symptoms",
      2: 'Provide a generalization of risk (i.e., "high"/"low")',
      3: 'Provide an average probability of LUTS without a time horizon (e.g., "30% risk of developing irritative urinary symptoms")',
      4: 'Provide an average probability of LUTS with a time horizon (e.g., "30% risk of developing irritative urinary symptoms that may or may not resolve over the following year")',
      5: "Provide a patient-specific probability of LUTS with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
  };
  const domainSuggestions = suggestions[domain] || {};
  const applicable: ImprovementSuggestion[] = [];
  const scoreForSuggestions =
    currentScore === null ? 0 : Math.floor(currentScore);

  for (let score = scoreForSuggestions + 1; score <= 5; score++) {
    if (domainSuggestions[score]) {
      applicable.push({
        targetScore: score,
        suggestion: domainSuggestions[score],
      });
    }
  }
  return applicable;
};

const titleByScore = (score: number | null): string => {
  const names: Record<number, string> = {
    0: "No mention",
    1: "Name Only",
    2: "Generalization",
    3: "Imprecise Quantification",
    4: "Specific Quantification",
    5: "Patient-centered Estimate",
  };
  if (score === null) return "Consultation Scoring: N/A";
  const roundedScore = Math.round(score);
  return `Consultation Scoring: ${formatScore(score)} (${
    names[roundedScore] || "Unknown"
  })`;
};

const leftLabelByTopic = (topic: TopicName): string => {
  const labels: Record<TopicName, string> = {
    "Cancer Prognosis": "Cancer\nPrognosis",
    "Life Expectancy": "Life\nExpectancy",
    "Erectile Dysfunction": "Erectile\nDysfunction",
    "Urinary Incontinence": "Urinary\nIncontinence",
    "Irritative Symptoms": "Irritative\nSymptoms",
  };
  return labels[topic] || topic;
};

// getPlaceholderScore REMOVED — all scores now come directly from API
// Kept as dead code reference only
const _getPlaceholderScore_REMOVED = (_fileName: string, _topicName: string): number => {
  let hash = 0;
  const seed = `${_fileName}::${_topicName}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  // Map to 1-5 range (never 0 — 0 means "no mention" which is misleading for placeholder)
  return (Math.abs(hash) % 5) + 1;
};

// ═══════════════════════════════════════════════════════════
// LoadingSpinner Component (Outside)
// ═══════════════════════════════════════════════════════════
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "sm",
  isDarkMode,
}) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };
  return (
    <div
      className={cx(
        sizeClasses[size],
        "animate-spin rounded-full border-2 border-t-transparent",
        isDarkMode ? "border-cyan-400" : "border-cyan-600",
      )}
    />
  );
};

// ═══════════════════════════════════════════════════════════
// ScoreLegend — "?" popover showing the 0-5 scoring scale
// ═══════════════════════════════════════════════════════════
const ScoreLegend: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const [open, setOpen] = useState(false);
  const levels = [
    { score: 0, label: "No mention", color: "bg-slate-400" },
    { score: 1, label: "Name Only", color: "bg-red-500" },
    { score: 2, label: "Generalization", color: "bg-pink-500" },
    { score: 3, label: "Imprecise Quantification", color: "bg-yellow-500" },
    { score: 4, label: "Specific Quantification", color: "bg-green-500" },
    { score: 5, label: "Patient-centered Estimate", color: "bg-emerald-500" },
  ];
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        className={cx(
          "inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold transition-colors",
          isDarkMode
            ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
            : "bg-slate-200 text-slate-600 hover:bg-slate-300",
        )}
        title="Scoring criteria"
      >
        ?
      </button>
      {open && (
        <div
          className={cx(
            "absolute z-50 mt-1 right-0 w-64 rounded-lg border shadow-xl p-3",
            isDarkMode
              ? "bg-slate-800 border-slate-600"
              : "bg-white border-slate-200",
          )}
        >
          <div
            className={cx(
              "text-xs font-semibold mb-2",
              isDarkMode ? "text-slate-200" : "text-slate-800",
            )}
          >
            Risk Communication Scoring (0–5)
          </div>
          <div className="space-y-1.5">
            {levels.map(({ score, label, color }) => (
              <div key={score} className="flex items-center gap-2">
                <span
                  className={cx(
                    "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white",
                    color,
                  )}
                >
                  {score}
                </span>
                <span
                  className={cx(
                    "text-xs",
                    isDarkMode ? "text-slate-300" : "text-slate-600",
                  )}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// RubricFloatingButton — Fixed top-right button with full rubric modal
// Shows the 0-5 scale chart + per-domain criteria on hover
// ═══════════════════════════════════════════════════════════
const RUBRIC_DATA: Record<string, Record<number, string>> = {
  "Cancer Prognosis": {
    1: "Discuss potential for risk of cancer death, metastasis, or progression",
    2: 'Provide a generalization of magnitude of risk ("high"/"low")',
    3: "Provide a quantified estimate of risk",
    4: "Provide a quantified estimate of risk both with treatment and without treatment at an arbitrary timepoint",
    5: "Provide quantified estimates of risk both with and without treatment at the patient's life expectancy",
  },
  "Life Expectancy": {
    1: "Discuss the concept of competing risks of mortality",
    2: 'Provide a generalization of duration of life expectancy (i.e., "long"/"short")',
    3: 'Provide a rough quantified estimate of life expectancy (e.g., "about 15-20 years")',
    4: "Provide a probability of living to an arbitrary timepoint",
    5: "Provide a specific number of years and mention calculation based on the patient's age and health status",
  },
  "Erectile Dysfunction": {
    1: "Discuss the potential risk of erectile dysfunction",
    2: 'Provide a generalization of risk (i.e., "high"/"low")',
    3: 'Provide an average probability of ED without a time horizon (e.g., "45% risk of erectile dysfunction")',
    4: 'Provide an average probability of ED with a time horizon (e.g., "45% risk of erectile dysfunction at 1 year postop")',
    5: "Provide a patient-specific probability of ED with a time horizon, mentioning patient-specific factors such as age and baseline function",
  },
  "Urinary Incontinence": {
    1: "Discuss the potential risk of urinary incontinence",
    2: 'Provide a generalization of risk (i.e., "high"/"low")',
    3: 'Provide an average probability of UI without a time horizon (e.g., "10% risk of needing pads")',
    4: 'Provide an average probability of UI with a time horizon (e.g., "10% risk of needing pads beyond 1 year postop")',
    5: "Provide a patient-specific probability of UI with a time horizon, mentioning patient-specific factors such as age and baseline function",
  },
  "Irritative Symptoms": {
    1: "Discuss the potential risk of irritative urinary symptoms",
    2: 'Provide a generalization of risk (i.e., "high"/"low")',
    3: 'Provide an average probability of LUTS without a time horizon (e.g., "30% risk of developing irritative urinary symptoms")',
    4: 'Provide an average probability of LUTS with a time horizon (e.g., "30% risk of developing irritative urinary symptoms that may or may not resolve over the following year")',
    5: "Provide a patient-specific probability of LUTS with a time horizon, mentioning patient-specific factors such as age and baseline function",
  },
};

const RUBRIC_DOMAINS = [
  "Cancer Prognosis",
  "Life Expectancy",
  "Erectile Dysfunction",
  "Urinary Incontinence",
  "Irritative Symptoms",
] as const;

const RUBRIC_SCORE_LEVELS = [
  { score: 0, label: "No mention", color: "bg-slate-400" },
  { score: 1, label: "Name Only", color: "bg-red-500" },
  { score: 2, label: "Generalization", color: "bg-pink-500" },
  { score: 3, label: "Imprecise Quantification", color: "bg-yellow-500" },
  { score: 4, label: "Specific Quantification", color: "bg-green-500" },
  { score: 5, label: "Patient-centered Estimate", color: "bg-emerald-500" },
];

// ═══════════════════════════════════════════════════════════
// RubricBody — the shared "Quality of Risk Communication" rubric content:
// the 0–5 scale bar (hover/lock) + per-domain criteria (All Domains accordion
// or a single-domain tab). Used both inside the RubricFloatingButton modal and
// inline under the Scoring Legend, so the two always show identical content.
// Owns its own hover/lock/tab/expand state; initialScore/initialTab seed it
// (the modal re-mounts this via a key to "open at" a score from elsewhere).
// ═══════════════════════════════════════════════════════════
interface RubricBodyProps {
  isDarkMode: boolean;
  initialScore?: number | null;
  initialTab?: string;
  onTrackEvent?: (
    eventType: string,
    elementId: string,
    metadata?: Record<string, any>,
  ) => void;
}

const RubricBody: React.FC<RubricBodyProps> = ({
  isDarkMode,
  initialScore = null,
  initialTab = "All Domains",
  onTrackEvent,
}) => {
  const [hoveredScore, setHoveredScore] = useState<number | null>(null);
  const [lockedScore, setLockedScore] = useState<number | null>(initialScore);
  const [activeTab, setActiveTab] = useState<string>(initialTab || "All Domains");
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set(RUBRIC_DOMAINS));
  const activeScore = lockedScore !== null ? lockedScore : hoveredScore;

  const toggleDomain = (domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      const expanding = !next.has(domain);
      if (expanding) next.add(domain);
      else next.delete(domain);
      onTrackEvent?.(expanding ? "rubric_domain_expand" : "rubric_domain_collapse", `rubric_domain_${domain}`, { domain });
      return next;
    });
  };

  return (
    <>
      {/* Scale bar chart — replicated from ConsultationScoring */}
      <div data-tour="rubric-scale-bar" className="px-8 sm:px-12 pt-6 pb-4 overflow-visible">
        {/* Scale bar — with horizontal padding so edge labels don't clip */}
        <div className="mx-12 sm:mx-16">
          <div className="relative">
            <div className={cx("h-2 rounded-full", isDarkMode ? "bg-blue-400" : "bg-blue-600")}>
              {/* Ticks */}
              {RUBRIC_SCORE_LEVELS.map((_, index) => (
                <div
                  key={index}
                  className="absolute -top-2 h-6"
                  style={{
                    left: `${(index / 5) * 100}%`,
                    transform: "translateX(-50%)",
                    borderLeft: `2px dashed ${isDarkMode ? "#93c5fd" : "#2563eb"}`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Scale numbers and labels — hover sets hoveredScore for rubric table */}
          <div className="relative mt-4" style={{ height: "80px" }}>
            {RUBRIC_SCORE_LEVELS.map(({ score, label }, index) => {
              const isActive = activeScore === score;
              const isLocked = lockedScore === score;
              return (
                <div
                  key={score}
                  className="absolute text-center"
                  style={{
                    left: `${(index / 5) * 100}%`,
                    transform: "translateX(-50%)",
                    width: "90px",
                  }}
                  onMouseEnter={() => { if (lockedScore === null) setHoveredScore(score); }}
                  onMouseLeave={() => { if (lockedScore === null) setHoveredScore(null); }}
                  onClick={() => {
                    const newLocked = lockedScore === score ? null : score;
                    setLockedScore(newLocked);
                    onTrackEvent?.(newLocked !== null ? "rubric_score_lock" : "rubric_score_unlock", `rubric_score_${score}`, { score });
                  }}
                >
                  <div
                    className={cx(
                      "text-lg font-bold mb-1 cursor-pointer border-b-2 transition-colors",
                      isLocked ? "border-solid" : "border-dashed",
                      isActive
                        ? isDarkMode ? "text-cyan-400 border-cyan-500" : "text-cyan-600 border-cyan-400"
                        : isDarkMode ? "text-gray-100 border-slate-500" : "text-gray-800 border-slate-400",
                    )}
                    style={{ paddingBottom: "2px" }}
                  >
                    {score}
                  </div>
                  <div
                    className={cx(
                      "text-xs whitespace-pre-line leading-tight transition-colors",
                      isActive
                        ? isDarkMode ? "text-cyan-400 font-semibold" : "text-cyan-600 font-semibold"
                        : isDarkMode ? "text-gray-200" : "text-gray-800",
                    )}
                  >
                    {label}
                  </div>
                  {isLocked && (
                    <div className={cx("text-[9px] mt-0.5", isDarkMode ? "text-cyan-500" : "text-cyan-500")}>
                      (locked)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Subtitle */}
        <div className="text-center mt-2">
          <h3 className={cx(
            "text-lg font-semibold",
            isDarkMode ? "text-gray-100" : "text-gray-800",
          )}>
            Quality of Risk Communication
          </h3>
        </div>
      </div>

      {/* Domain rubric — tabs + accordion hybrid */}
      <div className="px-6 pb-6">
        {/* Status bar */}
        <div className={cx(
          "text-xs font-semibold uppercase tracking-wider px-4 py-2 mb-3 rounded-lg text-center",
          isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500",
        )}>
          {activeScore !== null
            ? `Score ${activeScore === 0 ? "0" : `1–${activeScore}`} Criteria${lockedScore !== null ? " — click score again to unlock" : ""}`
            : "Hover or click a score above to see criteria"}
        </div>

        {/* Domain tabs — "All Domains" + individual */}
        <div data-tour="rubric-tabs" className={cx(
          "flex border-b overflow-x-auto",
          isDarkMode ? "border-slate-700" : "border-slate-200",
        )}>
          {["All Domains", ...RUBRIC_DOMAINS].map((tab) => {
            const shortLabel: Record<string, string> = {
              "All Domains": "All",
              "Cancer Prognosis": "CP",
              "Life Expectancy": "LE",
              "Erectile Dysfunction": "ED",
              "Urinary Incontinence": "INC",
              "Irritative Symptoms": "IUS",
            };
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); onTrackEvent?.("rubric_tab_change", `rubric_tab_${tab}`, { tab }); }}
                className={cx(
                  "px-3 py-2.5 text-xs sm:text-sm font-medium text-center transition-colors relative whitespace-nowrap",
                  tab === "All Domains" ? "flex-shrink-0" : "flex-1",
                  activeTab === tab
                    ? isDarkMode ? "text-cyan-400" : "text-cyan-600"
                    : isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700",
                )}
              >
                <span className="hidden sm:inline">{tab === "Irritative Symptoms" ? "Irritative Sym." : tab}</span>
                <span className="sm:hidden">{shortLabel[tab] || tab}</span>
                {activeTab === tab && (
                  <div className={cx(
                    "absolute bottom-0 left-0 right-0 h-0.5",
                    isDarkMode ? "bg-cyan-400" : "bg-cyan-600",
                  )} />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div data-tour="rubric-content" className={cx(
          "rounded-b-xl border border-t-0",
          isDarkMode ? "border-slate-700" : "border-slate-200",
        )}>
          {activeTab === "All Domains" ? (
            /* All Domains — accordion view */
            <div>
              {/* Expand/Collapse All */}
              <div className={cx(
                "flex justify-end px-4 py-2",
                isDarkMode ? "bg-slate-800/30" : "bg-slate-50",
              )}>
                <button
                  onClick={() => {
                    if (expandedDomains.size === RUBRIC_DOMAINS.length) {
                      setExpandedDomains(new Set());
                    } else {
                      setExpandedDomains(new Set(RUBRIC_DOMAINS));
                    }
                  }}
                  className={cx(
                    "text-xs font-medium px-2 py-1 rounded transition-colors",
                    isDarkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-200 text-slate-500",
                  )}
                >
                  {expandedDomains.size === RUBRIC_DOMAINS.length ? "Collapse All" : "Expand All"}
                </button>
              </div>

              {RUBRIC_DOMAINS.map((domain, idx) => {
                const isExpanded = expandedDomains.has(domain);
                return (
                  <div
                    key={domain}
                    className={cx(
                      idx < RUBRIC_DOMAINS.length - 1 && (isDarkMode ? "border-b border-slate-700" : "border-b border-slate-200"),
                    )}
                  >
                    <button
                      onClick={() => toggleDomain(domain)}
                      className={cx(
                        "w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors text-left",
                        isDarkMode ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      <span>{domain}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={cx(
                          "w-4 h-4 transition-transform duration-200 flex-shrink-0",
                          isExpanded && "rotate-180",
                          isDarkMode ? "text-slate-400" : "text-slate-500",
                        )}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className={cx("px-4 pb-3", isDarkMode ? "bg-slate-800/50" : "bg-white")}>
                        {activeScore === null
                          ? <span className={cx("text-sm", isDarkMode ? "text-slate-500" : "text-slate-400")}>Select a score above</span>
                          : (
                            <div className="space-y-1.5">
                              {Array.from({ length: activeScore + 1 }, (_, s) => s)
                                .filter((s) => activeScore === 0 ? true : s > 0)
                                .map((s) => {
                                const text = s === 0 ? "No mention of this topic" : RUBRIC_DATA[domain][s];
                                const isActiveLevel = s === activeScore;
                                return (
                                  <div key={s} className="flex gap-2 items-start">
                                    <span className={cx(
                                      "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0 mt-0.5",
                                      RUBRIC_SCORE_LEVELS[s].color,
                                    )}>
                                      {s}
                                    </span>
                                    <span className={cx(
                                      "text-sm leading-snug",
                                      isActiveLevel
                                        ? isDarkMode ? "text-white font-bold" : "text-slate-900 font-bold"
                                        : isDarkMode ? "text-slate-400" : "text-slate-500",
                                    )}>
                                      {text}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Individual domain tab — direct content */
            <div className="p-4">
              {activeScore === null
                ? <span className={cx("text-sm", isDarkMode ? "text-slate-500" : "text-slate-400")}>Select a score above to see criteria</span>
                : (
                  <div className="space-y-2">
                    {Array.from({ length: activeScore + 1 }, (_, s) => s)
                      .filter((s) => activeScore === 0 ? true : s > 0)
                      .map((s) => {
                      const text = s === 0 ? "No mention of this topic" : RUBRIC_DATA[activeTab][s];
                      const isActiveLevel = s === activeScore;
                      return (
                        <div key={s} className="flex gap-2.5 items-start">
                          <span className={cx(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white flex-shrink-0 mt-0.5",
                            RUBRIC_SCORE_LEVELS[s].color,
                          )}>
                            {s}
                          </span>
                          <span className={cx(
                            "text-sm leading-snug pt-0.5",
                            isActiveLevel
                              ? isDarkMode ? "text-white font-bold" : "text-slate-900 font-bold"
                              : isDarkMode ? "text-slate-400" : "text-slate-500",
                          )}>
                            {text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className={cx(
          "text-xs mt-3 text-center",
          isDarkMode ? "text-slate-500" : "text-slate-400",
        )}>
          Score 0 = No mention. Scores 1–5 progress from qualitative to patient-centered quantitative communication.
        </p>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// RubricLegendStrip — always-visible 0–5 scoring legend shown on the
// dashboard, below the trajectory chart. Reuses RUBRIC_SCORE_LEVELS and
// mirrors the modal's scale-bar visual so doctors can see at a glance what
// each score means. Every score and the explicit "view full rubric" link
// open the existing Scoring Rubric modal (kept unchanged).
// ═══════════════════════════════════════════════════════════
interface RubricLegendStripProps {
  isDarkMode: boolean;
  onTrackEvent?: (
    eventType: string,
    elementId: string,
    metadata?: Record<string, any>,
  ) => void;
}

const RubricLegendStrip: React.FC<RubricLegendStripProps> = ({
  isDarkMode,
  onTrackEvent,
}) => {
  // The full rubric expands inline below the legend (instead of a modal).
  const [expanded, setExpanded] = useState(false);
  // Score to seed the inline RubricBody (null = no locked level). bodyKey
  // re-mounts RubricBody so a tick click re-locks it even while already open.
  const [legendScore, setLegendScore] = useState<number | null>(null);
  const [bodyKey, setBodyKey] = useState(0);

  // Expand the inline rubric, optionally locked to a score.
  const expandAt = (score: number | null) => {
    setLegendScore(score);
    setBodyKey((k) => k + 1);
    setExpanded(true);
  };

  return (
    <div
      data-tour="rubric-legend-strip"
      className={cx(
        "rounded-xl border p-4 sm:p-5",
        isDarkMode
          ? "bg-slate-800/60 border-slate-700"
          : "bg-white border-slate-200 shadow-sm",
      )}
    >
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h2
            className={cx(
              "text-sm sm:text-base font-semibold",
              isDarkMode ? "text-slate-100" : "text-slate-900",
            )}
          >
            Risk Communication Scoring Rubric
          </h2>
          <p
            className={cx(
              "text-xs sm:text-sm mt-0.5",
              isDarkMode ? "text-slate-400" : "text-slate-500",
            )}
          >
            Hover or click a score level to see domain-specific criteria
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (expanded) {
              setExpanded(false);
              onTrackEvent?.("rubric_strip_collapse", "rubric_strip_view_all");
            } else {
              expandAt(null);
              onTrackEvent?.("rubric_strip_expand", "rubric_strip_view_all");
            }
          }}
          className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold rounded-md px-3 py-1.5 bg-cyan-600 text-white hover:bg-cyan-500 transition-colors whitespace-nowrap"
          title={expanded ? "Hide the full scoring rubric" : "Show the full scoring rubric"}
        >
          {expanded ? "▼ Hide full rubric" : "▶ View full rubric — click here"}
        </button>
      </div>

      {/* Compact scale bar — shown when collapsed; sized to match RubricBody's
          scale bar so the blue axis doesn't shift when the rubric expands. */}
      {!expanded && (
      <div className="px-8 sm:px-12 pt-6 pb-4 overflow-visible">
        <div className="mx-12 sm:mx-16">
          <div className="relative">
            <div
              className={cx(
                "h-2 rounded-full",
                isDarkMode ? "bg-blue-400" : "bg-blue-600",
              )}
            >
              {RUBRIC_SCORE_LEVELS.map((_, index) => (
                <div
                  key={index}
                  className="absolute -top-2 h-6"
                  style={{
                    left: `${(index / 5) * 100}%`,
                    transform: "translateX(-50%)",
                    borderLeft: `2px dashed ${isDarkMode ? "#93c5fd" : "#2563eb"}`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="relative mt-4" style={{ height: "80px" }}>
            {RUBRIC_SCORE_LEVELS.map(({ score, label }, index) => (
              <button
                key={score}
                type="button"
                onClick={() => {
                  expandAt(score);
                  onTrackEvent?.("rubric_strip_score", `rubric_strip_score_${score}`, { score });
                }}
                className="absolute text-center cursor-pointer group"
                style={{
                  left: `${(index / 5) * 100}%`,
                  transform: "translateX(-50%)",
                  width: "90px",
                }}
                title={`Click to see criteria for score ${score}: ${label}`}
              >
                <div
                  className={cx(
                    "text-lg font-bold mb-1 border-b-2 border-dashed transition-colors",
                    isDarkMode
                      ? "text-gray-100 border-slate-500 group-hover:text-cyan-400 group-hover:border-cyan-500"
                      : "text-gray-800 border-slate-400 group-hover:text-cyan-600 group-hover:border-cyan-400",
                  )}
                >
                  {score}
                </div>
                <div
                  className={cx(
                    "text-xs leading-tight transition-colors",
                    isDarkMode
                      ? "text-gray-200 group-hover:text-cyan-400"
                      : "text-gray-800 group-hover:text-cyan-600",
                  )}
                >
                  {label}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Full rubric — the SAME body as the Scoring Rubric modal, inline */}
      {expanded && (
        <div>
          <RubricBody key={bodyKey} isDarkMode={isDarkMode} initialScore={legendScore} onTrackEvent={onTrackEvent} />
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// PatientScoreBreakdownModal — centered modal opened from a patient's
// Overall Score in the Patient Reports table. Shows that patient's per-domain
// (category) score and the rubric criterion that corresponds to each score.
// Per-domain scores come straight from scoreAverageData (no extra fetch);
// criteria reuse RUBRIC_DATA / RUBRIC_SCORE_LEVELS.
// ═══════════════════════════════════════════════════════════
interface PatientScoreBreakdownModalProps {
  isDarkMode: boolean;
  patient: PatientRow | null;
  scoreAverageData?: ScoreAverageItem[];
  onClose: () => void;
  onOpenRubric?: (domain: TopicName | "All Domains", score: number | null) => void;
  onTrackEvent?: (
    eventType: string,
    elementId: string,
    metadata?: Record<string, any>,
  ) => void;
}

const PatientScoreBreakdownModal: React.FC<PatientScoreBreakdownModalProps> = ({
  isDarkMode,
  patient,
  scoreAverageData,
  onClose,
  onOpenRubric,
  onTrackEvent,
}) => {
  // Close on Escape — only while a patient is selected (modal is open).
  useEffect(() => {
    if (!patient) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patient, onClose]);

  // Per-domain score + rubric criterion for this patient. avg_score may be a
  // float (e.g. 3.5); Math.round picks the rubric level, matching the grid
  // badge's existing rounding when it opens the rubric.
  const rows = useMemo(() => {
    if (!patient) return [];
    return RUBRIC_DOMAINS.map((domain) => {
      const item = (scoreAverageData ?? []).find(
        (d) =>
          d.file === patient.fileName &&
          d.avg_score !== null &&
          (d.class === TOPIC_TO_CLASS[domain] || d.class === TOPIC_TO_MODEL[domain]),
      );
      const avg = item?.avg_score ?? null;
      const level = avg === null ? null : Math.min(5, Math.max(0, Math.round(avg)));
      const criterion =
        level === null
          ? "AI score not available"
          : level === 0
            ? "No mention of this domain in the consultation."
            : RUBRIC_DATA[domain]?.[level] ?? "—";
      const levelLabel =
        level === null ? "—" : RUBRIC_SCORE_LEVELS[level]?.label ?? "—";
      return { domain, avg, level, criterion, levelLabel };
    });
  }, [patient, scoreAverageData]);

  if (!patient) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-16 px-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Content */}
      <div
        className={cx(
          "relative z-[71] w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border shadow-2xl",
          isDarkMode
            ? "bg-slate-900 border-slate-700"
            : "bg-white border-slate-200",
        )}
      >
        {/* Header */}
        <div
          className={cx(
            "sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b",
            isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200",
          )}
        >
          <div>
            <h2 className={cx("text-lg font-bold", isDarkMode ? "text-white" : "text-slate-900")}>
              {patient.name} — Score Breakdown
            </h2>
            <p className={cx("text-sm mt-0.5", isDarkMode ? "text-slate-400" : "text-slate-500")}>
              Per-category score and the matching rubric criterion. Click a row for the full rubric.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={cx(
              "p-2 rounded-lg transition-colors",
              isDarkMode
                ? "hover:bg-slate-800 text-slate-400 hover:text-white"
                : "hover:bg-slate-100 text-slate-500 hover:text-slate-900",
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Domain rows */}
        <div className="p-4 space-y-2">
          {rows.map(({ domain, avg, level, criterion, levelLabel }) => (
            <button
              key={domain}
              type="button"
              onClick={() => {
                onTrackEvent?.("patient_score_breakdown_domain_click", `breakdown_${TOPIC_TO_MODEL[domain]}`, { domain, level });
                onOpenRubric?.(domain, level);
              }}
              className={cx(
                "w-full flex items-start gap-3 text-left rounded-xl border p-3 transition-colors",
                isDarkMode
                  ? "border-slate-700 hover:bg-slate-800/60"
                  : "border-slate-200 hover:bg-slate-50",
              )}
              title="Click to open the full rubric for this domain"
            >
              <span
                className={cx(
                  "inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold flex-shrink-0",
                  getScoreColorForValue(avg, isDarkMode),
                )}
              >
                {avg !== null ? avg.toFixed(1) : "—"}
              </span>
              <span className="min-w-0">
                <span className={cx("block text-sm font-semibold", isDarkMode ? "text-slate-100" : "text-slate-900")}>
                  {domain}
                  <span className={cx("ml-2 text-xs font-medium", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    {level !== null ? `Level ${level} · ${levelLabel}` : "No AI score"}
                  </span>
                </span>
                <span className={cx("block text-xs mt-1 leading-snug", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                  {criterion}
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className={cx("px-4 pb-4 flex justify-end")}>
          <button
            type="button"
            onClick={() => {
              onTrackEvent?.("patient_score_breakdown_view_all", "breakdown_view_full_rubric");
              onOpenRubric?.("All Domains", null);
            }}
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold rounded-md px-3 py-1.5 bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
          >
            ▶ View full rubric — click here
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// PatientRubricReportModal — combined view opened from a patient's Overall
// Score. For each domain it shows the patient's score AND that domain's full
// 0–5 rubric, highlighting the level the patient reached — so a doctor sees
// what every level means and what the next level would require. Reuses the
// same per-domain score computation and the rubric modal's level-row visual.
// ═══════════════════════════════════════════════════════════
interface PatientRubricReportModalProps {
  isDarkMode: boolean;
  patient: PatientRow | null;
  scoreAverageData?: ScoreAverageItem[];
  onClose: () => void;
  onOpenRubric?: (domain: TopicName | "All Domains", score: number | null) => void;
  onTrackEvent?: (
    eventType: string,
    elementId: string,
    metadata?: Record<string, any>,
  ) => void;
}

const PatientRubricReportModal: React.FC<PatientRubricReportModalProps> = ({
  isDarkMode,
  patient,
  scoreAverageData,
  onClose,
  onOpenRubric,
  onTrackEvent,
}) => {
  useEffect(() => {
    if (!patient) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patient, onClose]);

  // Patient's score + rounded rubric level per domain (same source/rounding as
  // the simpler breakdown modal and the grid badge).
  const rows = useMemo(() => {
    if (!patient) return [];
    return RUBRIC_DOMAINS.map((domain) => {
      const item = (scoreAverageData ?? []).find(
        (d) =>
          d.file === patient.fileName &&
          d.avg_score !== null &&
          (d.class === TOPIC_TO_CLASS[domain] || d.class === TOPIC_TO_MODEL[domain]),
      );
      const avg = item?.avg_score ?? null;
      const level = avg === null ? null : Math.min(5, Math.max(0, Math.round(avg)));
      return { domain, avg, level };
    });
  }, [patient, scoreAverageData]);

  if (!patient) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-12 px-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className={cx(
          "relative z-[71] w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border shadow-2xl",
          isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200",
        )}
      >
        {/* Header */}
        <div
          className={cx(
            "sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b",
            isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200",
          )}
        >
          <div>
            <h2 className={cx("text-lg font-bold", isDarkMode ? "text-white" : "text-slate-900")}>
              {patient.name} — Rubric Report
            </h2>
            <p className={cx("text-sm mt-0.5", isDarkMode ? "text-slate-400" : "text-slate-500")}>
              Each category shows the full 0–5 rubric with your score highlighted.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={cx(
              "p-2 rounded-lg transition-colors",
              isDarkMode
                ? "hover:bg-slate-800 text-slate-400 hover:text-white"
                : "hover:bg-slate-100 text-slate-500 hover:text-slate-900",
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Domain sections */}
        <div className="p-4 space-y-4">
          {rows.map(({ domain, avg, level }) => (
            <div
              key={domain}
              className={cx(
                "rounded-xl border",
                isDarkMode ? "border-slate-700" : "border-slate-200",
              )}
            >
              {/* Domain header — click hands off to the interactive rubric modal */}
              <button
                type="button"
                onClick={() => {
                  onTrackEvent?.("patient_rubric_report_domain_click", `report_${TOPIC_TO_MODEL[domain]}`, { domain, level });
                  onOpenRubric?.(domain, level);
                }}
                className={cx(
                  "w-full flex items-center gap-3 px-4 py-3 text-left rounded-t-xl transition-colors",
                  isDarkMode ? "hover:bg-slate-800/60" : "hover:bg-slate-50",
                )}
                title="Open the interactive rubric for this domain"
              >
                <span
                  className={cx(
                    "inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold flex-shrink-0",
                    getScoreColorForValue(avg, isDarkMode),
                  )}
                >
                  {avg !== null ? avg.toFixed(1) : "—"}
                </span>
                <span className="min-w-0">
                  <span className={cx("block text-sm font-semibold", isDarkMode ? "text-slate-100" : "text-slate-900")}>
                    {domain}
                  </span>
                  <span className={cx("block text-xs", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    {level !== null
                      ? `Your score: ${avg!.toFixed(1)} · Level ${level} (${RUBRIC_SCORE_LEVELS[level].label})`
                      : "No AI score available"}
                  </span>
                </span>
              </button>

              {/* Full 0–5 rubric for this domain */}
              <div className={cx("px-4 pb-3 space-y-1.5", isDarkMode ? "bg-slate-800/30" : "bg-white")}>
                {RUBRIC_SCORE_LEVELS.map(({ score: s, label, color }) => {
                  const text = s === 0 ? "No mention of this topic" : RUBRIC_DATA[domain][s];
                  const isYou = level !== null && s === level;
                  return (
                    <div
                      key={s}
                      className={cx(
                        "flex gap-2.5 items-start rounded-lg px-2 py-1.5 transition-colors",
                        isYou
                          ? isDarkMode
                            ? "bg-cyan-900/30 ring-1 ring-cyan-500/50"
                            : "bg-cyan-50 ring-1 ring-cyan-400/50"
                          : "",
                      )}
                    >
                      <span className={cx("inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white flex-shrink-0 mt-0.5", color)}>
                        {s}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cx(
                            "text-sm leading-snug",
                            isYou
                              ? isDarkMode ? "text-white font-bold" : "text-slate-900 font-bold"
                              : isDarkMode ? "text-slate-400" : "text-slate-500",
                          )}
                        >
                          {label}: {text}
                        </span>
                      </span>
                      {isYou && (
                        <span className={cx("text-xs font-bold flex-shrink-0 mt-0.5", isDarkMode ? "text-cyan-400" : "text-cyan-600")}>
                          ◀ you
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer "View full rubric" button hidden per request. */}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// RubricTourTooltip — custom inline tooltip for modal mini-tour
// ═══════════════════════════════════════════════════════════
interface RubricTourTooltipProps {
  targetAttr: string;
  title: string;
  content: string;
  stepNum: number;
  totalSteps: number;
  isDarkMode: boolean;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onDone: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const RubricTourTooltip: React.FC<RubricTourTooltipProps> = ({
  targetAttr, title, content, stepNum, totalSteps,
  isDarkMode, isFirst, isLast, onNext, onBack, onSkip, onDone, containerRef,
}) => {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelector(`[data-tour='${targetAttr}']`) as HTMLElement | null;
    if (!target) return;

    const update = () => {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setPos({
        top: targetRect.bottom - containerRect.top + container.scrollTop + 8,
        left: targetRect.left - containerRect.left + targetRect.width / 2,
        width: targetRect.width,
      });
    };

    update();
    // Recalculate on scroll
    container.addEventListener("scroll", update);
    return () => container.removeEventListener("scroll", update);
  }, [targetAttr, containerRef]);

  if (!pos) return null;

  return (
    <>
      {/* Highlight ring around target */}
      <style>{`
        [data-tour='${targetAttr}'] {
          outline: 2px solid #06b6d4 !important;
          outline-offset: 4px !important;
          border-radius: 8px !important;
          position: relative;
          z-index: 2;
        }
      `}</style>

      {/* Tooltip */}
      <div
        className="absolute z-[100]"
        style={{
          top: pos.top,
          left: Math.min(Math.max(pos.left, 200), (containerRef.current?.clientWidth ?? 800) - 200),
          transform: "translateX(-50%)",
        }}
      >
        {/* Arrow */}
        <div
          className={cx(
            "w-3 h-3 rotate-45 mx-auto -mb-1.5",
            isDarkMode ? "bg-slate-800" : "bg-white",
          )}
          style={{ boxShadow: "-1px -1px 2px rgba(0,0,0,0.1)" }}
        />

        <div
          className={cx(
            "rounded-xl p-4 w-[360px] border",
            isDarkMode
              ? "bg-slate-800 border-slate-600 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
              : "bg-white border-slate-200 shadow-[0_8px_30px_rgba(0,0,0,0.15)]",
          )}
        >
          <h4 className={cx(
            "text-sm font-bold mb-1.5",
            isDarkMode ? "text-cyan-400" : "text-cyan-600",
          )}>
            {title}
          </h4>
          <p className={cx(
            "text-[13px] leading-relaxed mb-3",
            isDarkMode ? "text-slate-300" : "text-slate-600",
          )}>
            {content}
          </p>
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className={cx(
                "text-[11px] transition-colors",
                isDarkMode ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600",
              )}
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              <span className={cx("text-[11px]", isDarkMode ? "text-slate-500" : "text-slate-400")}>
                {stepNum}/{totalSteps}
              </span>
              {!isFirst && (
                <button
                  onClick={onBack}
                  className={cx(
                    "text-xs font-medium px-2 py-1 rounded transition-colors",
                    isDarkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  Back
                </button>
              )}
              <button
                onClick={isLast ? onDone : onNext}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-500 text-white hover:bg-cyan-400 transition-colors"
              >
                {isLast ? "Got it!" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

interface RubricFloatingButtonProps {
  isDarkMode: boolean;
  externalOpen?: boolean;
  externalTab?: string;
  externalScore?: number | null;
  onExternalHandled?: () => void;
  onTrackEvent?: (eventType: string, elementId: string, metadata?: Record<string, any>) => void;
}

const RubricFloatingButton: React.FC<RubricFloatingButtonProps> = ({
  isDarkMode,
  externalOpen,
  externalTab,
  externalScore,
  onExternalHandled,
  onTrackEvent,
}) => {
  const [open, setOpen] = useState(false);
  // Seeds for the shared RubricBody; bumping bodyKey re-mounts it so an
  // external request can "open at" a specific score/tab.
  const [bodyScore, setBodyScore] = useState<number | null>(null);
  const [bodyTab, setBodyTab] = useState<string>("All Domains");
  const [bodyKey, setBodyKey] = useState(0);

  // Custom mini tour inside rubric modal
  const RUBRIC_TOUR_KEY = "rubric-modal-tour-completed";
  const [rubricTourStep, setRubricTourStep] = useState<number | null>(null);
  const rubricTourStarted = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const RUBRIC_MINI_STEPS = [
    {
      target: "rubric-scale-bar",
      title: "Score Scale",
      content: "This is the scoring scale from 0 to 5. Hover over any number to preview criteria for that score level, or click a number to lock the selection.",
    },
    {
      target: "rubric-tabs",
      title: "Domain Tabs",
      content: "Use these tabs to switch between viewing all domains at once or focusing on a single domain (Cancer Prognosis, Life Expectancy, Erectile Dysfunction, Urinary Incontinence, Irritative Symptoms).",
    },
    {
      target: "rubric-content",
      title: "Rubric Criteria",
      content: "The rubric criteria appear here. When viewing \"All Domains\", click any domain name to expand or collapse it. The criteria shown are cumulative — selecting score 3 shows all requirements for scores 1 through 3.",
    },
  ];

  // Start mini tour on first modal open
  useEffect(() => {
    if (open && !rubricTourStarted.current) {
      const completed = localStorage.getItem(RUBRIC_TOUR_KEY);
      if (!completed) {
        rubricTourStarted.current = true;
        const timer = setTimeout(() => setRubricTourStep(0), 600);
        return () => clearTimeout(timer);
      }
    }
    if (!open) {
      setRubricTourStep(null);
    }
  }, [open]);

  const dismissRubricTour = useCallback(() => {
    setRubricTourStep(null);
    localStorage.setItem(RUBRIC_TOUR_KEY, "true");
  }, []);

  // Scroll target into view when step changes
  useEffect(() => {
    if (rubricTourStep !== null && modalRef.current) {
      const step = RUBRIC_MINI_STEPS[rubricTourStep];
      const target = modalRef.current.querySelector(`[data-tour='${step.target}']`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [rubricTourStep]);

  // Handle external open trigger (from a score click elsewhere). Seed the body
  // and re-mount it (bodyKey) so it opens locked at that score/tab.
  useEffect(() => {
    if (externalOpen && externalTab !== undefined && externalScore !== undefined) {
      setBodyTab(externalTab || "All Domains");
      setBodyScore(externalScore);
      setBodyKey((k) => k + 1);
      setOpen(true);
      onExternalHandled?.();
    }
  }, [externalOpen, externalTab, externalScore, onExternalHandled]);

  return (
    <>
      {/* Floating button — fixed top-right with pulse + glow */}
      <div data-tour="rubric-button" className="fixed top-4 right-4 z-[60]">
        {/* Glow ring — animated */}
        <div
          className={cx(
            "absolute inset-0 rounded-full animate-ping opacity-30",
            isDarkMode ? "bg-cyan-400" : "bg-cyan-400",
          )}
          style={{ animationDuration: "2.5s" }}
        />
        {/* Subtle pulse ring */}
        <div
          className={cx(
            "absolute -inset-1 rounded-full animate-pulse opacity-20",
            isDarkMode ? "bg-cyan-500" : "bg-cyan-300",
          )}
          style={{ animationDuration: "2s" }}
        />
        <button
          onClick={() => { setBodyScore(null); setBodyTab("All Domains"); setBodyKey((k) => k + 1); setOpen(true); onTrackEvent?.("rubric_modal_open", "rubric_floating_button"); }}
          className={cx(
            "relative flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition-all",
            "hover:scale-105 active:scale-95 animate-pulse",
            isDarkMode
              ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
              : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]",
          )}
          style={{ animationDuration: "3s" }}
          title="Scoring Rubric Guide"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Scoring Rubric
        </button>
      </div>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center pt-16 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); onTrackEvent?.("rubric_modal_close", "rubric_overlay"); } }}
        >
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setOpen(false); onTrackEvent?.("rubric_modal_close", "rubric_backdrop"); }} />

          {/* Modal content — visible scrollbar */}
          <div
            ref={modalRef}
            className={cx(
              "relative z-[71] w-full max-w-5xl max-h-[80vh] overflow-y-scroll rounded-2xl border shadow-2xl",
              isDarkMode
                ? "bg-slate-900 border-slate-700"
                : "bg-white border-slate-200",
            )}
            style={{ scrollbarGutter: "stable" }}
          >
            {/* Header */}
            <div className={cx(
              "sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b",
              isDarkMode
                ? "bg-slate-900 border-slate-700"
                : "bg-white border-slate-200",
            )}>
              <div>
                <h2 className={cx(
                  "text-xl font-bold",
                  isDarkMode ? "text-white" : "text-slate-900",
                )}>
                  Risk Communication Scoring Rubric
                </h2>
                <p className={cx(
                  "text-sm mt-0.5",
                  isDarkMode ? "text-slate-400" : "text-slate-500",
                )}>
                  Hover or click a score level to see domain-specific criteria
                </p>
              </div>
              <button
                onClick={() => { setOpen(false); onTrackEvent?.("rubric_modal_close", "rubric_close_button"); }}
                className={cx(
                  "p-2 rounded-lg transition-colors",
                  isDarkMode
                    ? "hover:bg-slate-800 text-slate-400 hover:text-white"
                    : "hover:bg-slate-100 text-slate-500 hover:text-slate-900",
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quality of Risk Communication body — the shared RubricBody,
                identical to the inline legend version */}
            <RubricBody
              key={bodyKey}
              isDarkMode={isDarkMode}
              initialScore={bodyScore}
              initialTab={bodyTab}
              onTrackEvent={onTrackEvent}
            />

            {/* Custom mini tour tooltips — rendered inline, no portal */}
            {rubricTourStep !== null && (() => {
              const step = RUBRIC_MINI_STEPS[rubricTourStep];
              const isLast = rubricTourStep === RUBRIC_MINI_STEPS.length - 1;
              const isFirst = rubricTourStep === 0;
              return (
                <RubricTourTooltip
                  targetAttr={step.target}
                  title={step.title}
                  content={step.content}
                  stepNum={rubricTourStep + 1}
                  totalSteps={RUBRIC_MINI_STEPS.length}
                  isDarkMode={isDarkMode}
                  isFirst={isFirst}
                  isLast={isLast}
                  onNext={() => setRubricTourStep(rubricTourStep + 1)}
                  onBack={() => setRubricTourStep(rubricTourStep - 1)}
                  onSkip={dismissRubricTour}
                  onDone={dismissRubricTour}
                  containerRef={modalRef}
                />
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// DashboardViewV1 Component (Original — kept for reference)
// ═══════════════════════════════════════════════════════════
const DashboardViewV1: React.FC<DashboardViewProps> = ({
  isDarkMode,
  patients,
  filteredPatients,
  selectedSpeaker,
  search,
  setSearch,
  scoreBand,
  setScoreBand,
  setSelectedPatient,
  setCurrentView,
}) => (
  <div className="space-y-8">
    <div
      className={cx(
        "border-b pb-6",
        isDarkMode ? "border-slate-600" : "border-slate-200",
      )}
    >
      <h1
        className={cx(
          "text-4xl font-light mb-3",
          isDarkMode ? "text-slate-100" : "text-slate-900",
        )}
      >
        Physician Reports
      </h1>
      <p
        className={cx(
          "text-lg",
          isDarkMode ? "text-slate-400" : "text-slate-600",
        )}
      >
        Communication Quality Assessment • Prostate Cancer Consultations •{" "}
        {patients.length} patient reports
      </p>
    </div>

    {/* Search & Filters */}
    <div data-tour="search-filters" className="flex flex-col md:flex-row items-start md:items-center gap-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by patient / ID / file..."
        className={cx(
          "w-full md:max-w-sm px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border",
          isDarkMode
            ? "bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500"
            : "bg-white border-slate-300 text-slate-900 placeholder-slate-500",
        )}
      />
      <div
        className={cx(
          "inline-flex rounded-lg p-1",
          isDarkMode ? "bg-slate-800" : "bg-slate-100",
        )}
      >
        {[
          { k: "ALL", label: "All" },
          { k: "HIGH", label: "High Quality (4–5)" },
          { k: "STD", label: "Standard (3)" },
          { k: "LOW", label: "Needs Improvement (0–2)" },
        ].map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setScoreBand(k as "ALL" | "HIGH" | "STD" | "LOW")}
            className={cx(
              "px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm rounded-md",
              scoreBand === k
                ? isDarkMode
                  ? "bg-blue-700 text-blue-100"
                  : "bg-blue-600 text-white"
                : isDarkMode
                  ? "text-slate-300 hover:bg-slate-700"
                  : "text-slate-700 hover:bg-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>

    {/* Summary Cards */}
    <div data-tour="summary-cards" className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <button
        onClick={() => setScoreBand("ALL")}
        className={cx(
          "border p-4 sm:p-6 lg:p-8 rounded-xl shadow-lg text-left transition",
          isDarkMode
            ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 hover:ring-2 hover:ring-cyan-600/30"
            : "bg-gradient-to-br from-white to-slate-50 border-slate-200 hover:ring-2 hover:ring-cyan-400/30",
        )}
      >
        <div
          className={cx(
            "text-sm sm:text-base font-semibold uppercase tracking-wider mb-2",
            isDarkMode ? "text-cyan-400" : "text-cyan-600",
          )}
        >
          Total Reports
        </div>
        <div
          className={cx(
            "text-2xl sm:text-3xl lg:text-4xl font-light",
            isDarkMode ? "text-slate-100" : "text-slate-900",
          )}
        >
          {patients.length}
        </div>
      </button>

      <button
        onClick={() => setScoreBand("HIGH")}
        className={cx(
          "border p-4 sm:p-6 lg:p-8 rounded-xl shadow-lg text-left transition",
          isDarkMode
            ? "bg-gradient-to-br from-emerald-900 to-emerald-800 border-emerald-700 hover:ring-2 hover:ring-emerald-500/30"
            : "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 hover:ring-2 hover:ring-emerald-400/30",
        )}
      >
        <div
          className={cx(
            "text-sm sm:text-base font-semibold uppercase tracking-wider mb-2",
            isDarkMode ? "text-emerald-300" : "text-emerald-700",
          )}
        >
          High Quality
        </div>
        <div
          className={cx(
            "text-2xl sm:text-3xl lg:text-4xl font-light",
            isDarkMode ? "text-emerald-100" : "text-emerald-900",
          )}
        >
          {patients.filter((p) => p.overallScore >= 4).length}
        </div>
        <div
          className={cx(
            "text-sm mt-1",
            isDarkMode ? "text-emerald-400" : "text-emerald-600",
          )}
        >
          Score 4–5
        </div>
      </button>

      <button
        onClick={() => setScoreBand("STD")}
        className={cx(
          "border p-4 sm:p-6 lg:p-8 rounded-xl shadow-lg text-left transition",
          isDarkMode
            ? "bg-gradient-to-br from-yellow-900 to-yellow-800 border-yellow-700 hover:ring-2 hover:ring-yellow-500/30"
            : "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200 hover:ring-2 hover:ring-yellow-400/30",
        )}
      >
        <div
          className={cx(
            "text-sm sm:text-base font-semibold uppercase tracking-wider mb-2",
            isDarkMode ? "text-yellow-300" : "text-yellow-700",
          )}
        >
          Standard Quality
        </div>
        <div
          className={cx(
            "text-2xl sm:text-3xl lg:text-4xl font-light",
            isDarkMode ? "text-yellow-100" : "text-yellow-900",
          )}
        >
          {
            patients.filter((p) => p.overallScore >= 3 && p.overallScore < 4)
              .length
          }
        </div>
        <div
          className={cx(
            "text-sm mt-1",
            isDarkMode ? "text-yellow-400" : "text-yellow-600",
          )}
        >
          Score 3
        </div>
      </button>

      <button
        onClick={() => setScoreBand("LOW")}
        className={cx(
          "border p-4 sm:p-6 lg:p-8 rounded-xl shadow-lg text-left transition",
          isDarkMode
            ? "bg-gradient-to-br from-red-900 to-pink-900 border-red-700 hover:ring-2 hover:ring-red-500/30"
            : "bg-gradient-to-br from-red-50 to-pink-100 border-red-200 hover:ring-2 hover:ring-red-400/30",
        )}
      >
        <div
          className={cx(
            "text-sm sm:text-base font-semibold uppercase tracking-wider mb-2",
            isDarkMode ? "text-red-300" : "text-red-700",
          )}
        >
          Needs Improvement
        </div>
        <div
          className={cx(
            "text-2xl sm:text-3xl lg:text-4xl font-light",
            isDarkMode ? "text-red-100" : "text-red-900",
          )}
        >
          {patients.filter((p) => p.overallScore < 3).length}
        </div>
        <div
          className={cx(
            "text-sm mt-1",
            isDarkMode ? "text-red-400" : "text-red-600",
          )}
        >
          Score 0–2
        </div>
      </button>
    </div>

    {/* Patient Table */}
    <div
      className={cx(
        "border rounded-xl shadow-xl overflow-hidden",
        isDarkMode
          ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700"
          : "bg-gradient-to-br from-white to-slate-50 border-slate-200",
      )}
    >
      <div
        className={cx(
          "px-4 sm:px-6 lg:px-8 py-4 sm:py-6 border-b",
          isDarkMode
            ? "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600"
            : "bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200",
        )}
      >
        <h2
          className={cx(
            "text-base sm:text-lg lg:text-xl font-semibold",
            isDarkMode ? "text-slate-100" : "text-slate-900",
          )}
        >
          Physician Communication Reports
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ tableLayout: "fixed" }}>
          <thead
            className={cx(
              "border-b",
              isDarkMode
                ? "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600"
                : "bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200",
            )}
          >
            <tr>
              <th
                className={cx(
                  "px-4 sm:px-6 lg:px-8 py-3 sm:py-4 text-left text-sm font-semibold uppercase tracking-wider",
                  isDarkMode ? "text-slate-300" : "text-slate-700",
                )}
                style={{ width: "30%" }}
              >
                Patient Information
              </th>
              <th
                className={cx(
                  "px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider",
                  isDarkMode ? "text-slate-300" : "text-slate-700",
                )}
                style={{ width: "40%" }}
              >
                Overall Score
              </th>
              <th
                className={cx(
                  "px-4 sm:px-6 lg:px-8 py-3 sm:py-4 text-center text-sm font-semibold uppercase tracking-wider",
                  isDarkMode ? "text-slate-300" : "text-slate-700",
                )}
                style={{ width: "30%" }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody
            className={cx(
              "divide-y",
              isDarkMode
                ? "bg-gradient-to-br from-slate-800 to-slate-900 divide-slate-700"
                : "bg-gradient-to-br from-white to-slate-50 divide-slate-200",
            )}
          >
            {filteredPatients.map((patient) => {
              const hasAiScore = patient.overallScore != null && patient.overallScore > 0;
              return (
              <tr
                key={patient.id}
                className={cx(
                  "transition-colors duration-200",
                  hasAiScore
                    ? isDarkMode
                      ? "hover:bg-slate-700/50 cursor-pointer"
                      : "hover:bg-slate-100/50 cursor-pointer"
                    : isDarkMode
                      ? "opacity-50 cursor-not-allowed"
                      : "opacity-40 cursor-not-allowed",
                )}
              >
                <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6" style={{ width: "30%" }}>
                  <div>
                    <div
                      title={patient.name}
                      className={cx(
                        "text-base sm:text-lg font-semibold truncate max-w-[220px]",
                        isDarkMode ? "text-slate-100" : "text-slate-900",
                      )}
                    >
                      {patient.name}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-6 text-left" style={{ width: "40%" }}>
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        "inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold",
                        getScoreColorForValue(patient.overallScore, isDarkMode),
                      )}
                    >
                      {hasAiScore
                        ? patient.overallScore.toFixed(1)
                        : "N/A"}
                    </span>
                    <span
                      className={cx(
                        "text-xs font-medium px-2 py-1 rounded-full",
                        !hasAiScore
                          ? isDarkMode
                            ? "bg-slate-700 text-slate-400"
                            : "bg-slate-200 text-slate-500"
                          : patient.overallScore >= 4
                            ? isDarkMode
                              ? "bg-emerald-900/50 text-emerald-300"
                              : "bg-emerald-100 text-emerald-700"
                            : patient.overallScore >= 3
                              ? isDarkMode
                                ? "bg-yellow-900/50 text-yellow-300"
                                : "bg-yellow-100 text-yellow-700"
                              : isDarkMode
                                ? "bg-red-900/50 text-red-300"
                                : "bg-red-100 text-red-700",
                      )}
                    >
                      {!hasAiScore
                        ? "AI Score Not Available"
                        : patient.overallScore >= 4
                          ? "High"
                          : patient.overallScore >= 3
                            ? "Standard"
                            : "Needs Improvement"}
                    </span>
                  </div>
                </td>
                <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 text-center" style={{ width: "30%" }}>
                  <button
                    disabled={!hasAiScore}
                    onClick={() => {
                      if (!hasAiScore) return;
                      setSelectedPatient(patient);
                      setCurrentView("grid");
                    }}
                    className={cx(
                      "px-4 py-2 sm:px-6 sm:py-3 rounded-lg text-sm font-semibold transition-all duration-200",
                      !hasAiScore
                        ? isDarkMode
                          ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : isDarkMode
                          ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-lg"
                          : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 shadow-lg",
                    )}
                  >
                    {hasAiScore ? "View Report" : "Not Available"}
                  </button>
                </td>
              </tr>
              );
            })}
            {filteredPatients.length === 0 && (
              <tr>
                <td className="px-8 py-10 text-center text-sm" colSpan={3}>
                  {search || scoreBand !== "ALL"
                    ? "No matching reports. Try clearing filters."
                    : "No reports available."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════
// DashboardViewV2 Component (B-1 feedback: compact summary)
// - Summary cards moved to top-right 1/3 (Google Scholar style)
// - Main space reserved for trajectory graph + patient list
// ═══════════════════════════════════════════════════════════

// Shared body for a trajectory point's details, reused by both the hover
// tooltip (quick preview) and the click-pinned resizable panel.
const TrajectoryPointDetail: React.FC<{
  item: any;
  isDarkMode: boolean;
  viewMode?: "average" | "individual";
  fileVisitMap?: Record<string, number>;
}> = ({ item, isDarkMode, viewMode = "average", fileVisitMap = {} }) => {
  const type = item.eventType === "rewrite" ? "Rewrite" : "Consultation";
  const details = item.patientsDetail ?? [];
  // Each consultation is labeled by its reconstructed visit order ("Visit N");
  // the hashed filename is never shown.
  return (
    <>
      <div className="font-semibold mb-1">
        {item.visitLabel ?? "Visit"} | {type}
      </div>
      {viewMode === "individual" ? (
        <>
          <div className="mb-1" style={{ color: "#06b6d4" }}>
            Consultation score:{" "}
            <span className="font-bold">
              {(item.individual ?? item.score).toFixed(2)}
            </span>
          </div>
        </>
      ) : (
        <div className="mb-2" style={{ color: "#06b6d4" }}>
          Cumulative Avg:{" "}
          <span className="font-bold">{item.score.toFixed(2)}</span>
          <span className="ml-1 opacity-70">({item.patientsCount} patients)</span>
        </div>
      )}
      {viewMode !== "individual" && details.length > 0 && (
        <>
          <div
            className="text-xs font-medium mb-1 pt-1 border-t"
            style={{ borderColor: isDarkMode ? "#334155" : "#e2e8f0" }}
          >
            Individual Patient Scores:
          </div>
          <div className="space-y-0.5">
            {details.map((p: { file: string; overall_score: number }) => {
              const label =
                fileVisitMap[p.file] != null
                  ? `Visit ${fileVisitMap[p.file]}`
                  : "Visit";
              return (
                <div key={p.file} className="flex justify-between text-xs">
                  <span className="truncate mr-2 max-w-[160px]">
                    {label}
                  </span>
                  <span className="font-mono font-semibold whitespace-nowrap">
                    {p.overall_score.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};

const DashboardViewV2: React.FC<DashboardViewProps> = ({
  isDarkMode,
  patients,
  filteredPatients,
  selectedSpeaker,
  search,
  setSearch,
  scoreBand,
  setScoreBand,
  setSelectedPatient,
  setCurrentView,
  trajectoryData,
  scoreAverageData,
  onOpenRubric,
  onTrackEvent,
}) => {
  // Map each file to its "Visit N" order so the trajectory tooltip can label
  // patients by visit instead of the hashed filename.
  const fileVisitMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of patients) {
      if (p.visitIndex != null) map[p.fileName] = p.visitIndex;
    }
    return map;
  }, [patients]);

  // Only count patients with AI scores (GPT-4o pipeline completed)
  const scoredPatients = patients.filter((p) => p.overallScore != null && p.overallScore > 0);
  const highCount = scoredPatients.filter((p) => p.overallScore >= 4).length;
  const stdCount = scoredPatients.filter(
    (p) => p.overallScore >= 3 && p.overallScore < 4,
  ).length;
  const lowCount = scoredPatients.filter((p) => p.overallScore < 3).length;

  // Overall average score across scored patients only
  const overallAvg = useMemo(() => {
    if (scoredPatients.length === 0) return 0;
    const sum = scoredPatients.reduce((acc, p) => acc + p.overallScore, 0);
    return sum / scoredPatients.length;
  }, [scoredPatients]);

  const summaryItems: {
    label: string;
    count: number;
    total: number;
    band: "ALL" | "HIGH" | "STD" | "LOW";
    dotColor: string;
    textColor: string;
  }[] = [
    {
      label: "High (4–5)",
      count: highCount,
      total: scoredPatients.length,
      band: "HIGH",
      dotColor: isDarkMode ? "bg-emerald-400" : "bg-emerald-500",
      textColor: isDarkMode ? "text-emerald-400" : "text-emerald-600",
    },
    {
      label: "Standard (3)",
      count: stdCount,
      total: scoredPatients.length,
      band: "STD",
      dotColor: isDarkMode ? "bg-yellow-400" : "bg-yellow-500",
      textColor: isDarkMode ? "text-yellow-400" : "text-yellow-600",
    },
    {
      label: "Low (0–2)",
      count: lowCount,
      total: scoredPatients.length,
      band: "LOW",
      dotColor: isDarkMode ? "bg-red-400" : "bg-red-500",
      textColor: isDarkMode ? "text-red-400" : "text-red-600",
    },
  ];

  // Transform trajectory API data → recharts format
  const chartData = useMemo(() => {
    if (!trajectoryData || trajectoryData.length === 0) return [];
    return trajectoryData.map((item, idx) => {
      // The X-axis is visit ORDER ("Visit N"), not a date. The real visit date is
      // hashed upstream and never sent; visit_index is the server's reconstructed
      // chronological order (falls back to array position).
      const visitNo = (item as any).visit_index ?? idx + 1;
      const visitLabel = `Visit ${visitNo}`;
      // Individual mode: this consultation's OWN overall score (its own row in
      // patients_detail), NOT the running cumulative average.
      const own = (item.patients_detail ?? []).find(
        (p: any) => p.file === item.file,
      )?.overall_score;
      return {
        time: visitLabel,
        visitLabel,
        eventType: item.event_type,
        file: item.file,
        score: item.overall_score ?? 0,
        individual: own ?? item.overall_score ?? 0,
        patientsCount: item.patients_count,
        patientsDetail: item.patients_detail ?? [],
      };
    });
  }, [trajectoryData]);

  // Chart mode: "individual" = each consultation's own score (default,
  // non-cumulative), "average" = cumulative running average.
  const [viewMode, setViewMode] = useState<"average" | "individual">("individual");

  // Patient whose Rubric Report modal is open (opened by clicking the Overall
  // Score badge in the Patient Reports table).
  const [reportPatient, setReportPatient] = useState<PatientRow | null>(null);

  // Custom hover tooltip — a stable tooltip we fully control. recharts' own
  // tooltip follows the cursor and re-renders on every mousemove, so a long
  // patient name inside it can't be hovered to reveal it. This one opens on dot
  // hover, stays while the cursor is over the dot OR the tooltip (hover-bridge),
  // and auto-hides otherwise — so its native `title` reveal works reliably.
  const [hovered, setHovered] = useState<
    { item: any; cx: number; cy: number } | null
  >(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartBoxRef = useRef<HTMLDivElement>(null);
  const showTip = (item: any, cx: number, cy: number) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHovered({ item, cx, cy });
  };
  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHovered(null), 180);
  };

  // Patient table column sorting. Default: patient (SID) ascending, matching
  // the existing numeric SID order.
  const [sortKey, setSortKey] = useState<"patient" | "visit" | "score">(
    "visit",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (key: "patient" | "visit" | "score") => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const sidNum = (id: string) => {
    const m = id.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };
  const sortedPatients = useMemo(() => {
    const arr = [...filteredPatients];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "patient") {
        cmp = sidNum(a.id) - sidNum(b.id);
      } else if (sortKey === "visit") {
        cmp = (a.visitIndex ?? 0) - (b.visitIndex ?? 0);
      } else {
        cmp = (a.overallScore || 0) - (b.overallScore || 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredPatients, sortKey, sortDir]);
  // Caret shown in a column header: ▲/▼ when active, faint ↕ otherwise.
  const sortCaret = (key: "patient" | "visit" | "score") =>
    sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "↕";

  return (
    <div className="space-y-6">
      {/* ── Row 1: Title (full width, own row) ── */}
      <div>
        <h1
          className={cx(
            "text-2xl sm:text-3xl lg:text-4xl font-semibold mb-1",
            isDarkMode ? "text-slate-100" : "text-slate-900",
          )}
        >
          Physician Reports
        </h1>
        <p
          className={cx(
            "text-sm sm:text-base",
            isDarkMode ? "text-slate-400" : "text-slate-500",
          )}
        >
          Communication Quality Assessment • Prostate Cancer Consultations
        </p>
      </div>

      {/* ── Row 2: Trajectory Graph (3/4) + Summary Box (1/4) ── */}
      {/* Google Scholar layout: graph is like citation chart, summary is like h-index sidebar */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left 3/4: Trajectory Graph placeholder */}
        <div
          data-tour="trajectory-chart"
          className={cx(
            "relative flex-1 md:w-3/4 rounded-xl border p-4 sm:p-5 lg:p-6 min-h-[220px] flex flex-col",
            isDarkMode
              ? "bg-slate-800/60 border-slate-700"
              : "bg-white border-slate-200 shadow-sm",
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              className={cx(
                "text-sm sm:text-base font-semibold",
                isDarkMode ? "text-slate-300" : "text-slate-700",
              )}
            >
              Overall Quality of Risk Communication Score Trajectory
            </h2>
            {/* Mode toggle: cumulative average vs each consultation's own score */}
            <div
              className="inline-flex rounded-md border overflow-hidden text-xs"
              style={{ borderColor: isDarkMode ? "#475569" : "#cbd5e1" }}
            >
              {(["individual", "average"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={cx(
                    "px-2.5 py-1 capitalize transition-colors",
                    viewMode === m
                      ? "bg-cyan-600 text-white"
                      : isDarkMode
                        ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        : "bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          {/* B-2: Overall score trajectory line chart */}
          <div ref={chartBoxRef} className="relative flex-1 min-h-[180px]">
            {chartData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center h-full">
                <p className={cx("text-sm", isDarkMode ? "text-slate-500" : "text-slate-400")}>
                  Loading trajectory data...
                </p>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, left: -8, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDarkMode ? "#334155" : "#e2e8f0"}
                />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: isDarkMode ? "#94a3b8" : "#64748b" }}
                  tickLine={false}
                  axisLine={{ stroke: isDarkMode ? "#475569" : "#cbd5e1" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 5]}
                  ticks={[0, 1, 2, 3, 4, 5]}
                  tick={{ fontSize: 11, fill: isDarkMode ? "#94a3b8" : "#64748b" }}
                  tickLine={false}
                  axisLine={{ stroke: isDarkMode ? "#475569" : "#cbd5e1" }}
                />
                <ReferenceLine
                  y={3}
                  stroke={isDarkMode ? "#475569" : "#cbd5e1"}
                  strokeDasharray="6 3"
                  label={{
                    value: "Avg",
                    position: "right",
                    fontSize: 10,
                    fill: isDarkMode ? "#64748b" : "#94a3b8",
                  }}
                />
                {/* recharts Tooltip intentionally removed — replaced by the
                    custom hover tooltip below (rendered outside the chart). */}
                <Line
                  type="monotone"
                  dataKey={viewMode === "individual" ? "individual" : "score"}
                  stroke="#06b6d4"
                  strokeWidth={2}
                  // Custom dots drive the hover tooltip. A wide transparent
                  // hit-circle makes the small dots easy to hover.
                  dot={(props: any) => {
                    const { cx, cy, index, payload } = props;
                    if (cx == null || cy == null) return <g key={index} />;
                    const active = hovered?.item === payload;
                    return (
                      <g
                        key={index}
                        onMouseEnter={() => showTip(payload, cx, cy)}
                        onMouseLeave={scheduleHide}
                      >
                        <circle cx={cx} cy={cy} r={12} fill="transparent" />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={active ? 7 : 5}
                          fill="#06b6d4"
                          stroke={isDarkMode ? "#1e293b" : "#ffffff"}
                          strokeWidth={2}
                        />
                      </g>
                    );
                  }}
                  activeDot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            )}
            {hovered && (
              <div
                data-testid="trajectory-hover-tooltip"
                className="absolute z-30 rounded-lg border p-3 shadow-lg overflow-auto"
                style={{
                  left: hovered.cx,
                  top: hovered.cy,
                  transform:
                    hovered.cx > (chartBoxRef.current?.clientWidth ?? 360) / 2
                      ? "translate(calc(-100% - 14px), -50%)"
                      : "translate(14px, -50%)",
                  minWidth: 220,
                  maxWidth: "min(80vw, 300px)",
                  maxHeight: 280,
                  backgroundColor: isDarkMode ? "#1e293b" : "#ffffff",
                  borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                  color: isDarkMode ? "#e2e8f0" : "#1e293b",
                  fontSize: 12,
                }}
                onMouseEnter={() => {
                  if (hideTimer.current) clearTimeout(hideTimer.current);
                }}
                onMouseLeave={scheduleHide}
              >
                <TrajectoryPointDetail
                  item={hovered.item}
                  isDarkMode={isDarkMode}
                  viewMode={viewMode}
                  fileVisitMap={fileVisitMap}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right 1/4: Compact Summary (Google Scholar h-index style) */}
        <div
          data-tour="summary-box"
          className={cx(
            "flex-shrink-0 w-full md:w-1/4 rounded-xl border p-3 sm:p-4 flex flex-col justify-center",
            isDarkMode
              ? "bg-slate-800/60 border-slate-700"
              : "bg-white border-slate-200 shadow-sm",
          )}
        >
          <div className="space-y-3">
            {/* Overall Average Score */}
            <div
              className={cx(
                "text-center pb-3 border-b",
                isDarkMode ? "border-slate-700" : "border-slate-200",
              )}
            >
              <div
                className={cx(
                  "text-3xl font-bold tabular-nums",
                  overallAvg >= 4
                    ? isDarkMode ? "text-emerald-400" : "text-emerald-600"
                    : overallAvg >= 3
                      ? isDarkMode ? "text-yellow-400" : "text-yellow-600"
                      : isDarkMode ? "text-red-400" : "text-red-600",
                )}
              >
                {overallAvg > 0 ? overallAvg.toFixed(2) : "—"}
              </div>
              <div
                className={cx(
                  "text-xs mt-0.5 flex items-center justify-center gap-1",
                  isDarkMode ? "text-slate-400" : "text-slate-500",
                )}
              >
                Avg Score ({patients.length} patients)
              </div>
            </div>

            {summaryItems.map(({ label, count, total, band, dotColor, textColor }) => (
              <button
                key={band}
                onClick={() => setScoreBand(band)}
                className={cx(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors",
                  scoreBand === band
                    ? isDarkMode
                      ? "bg-slate-700 ring-1 ring-cyan-500/40"
                      : "bg-slate-100 ring-1 ring-cyan-400/40"
                    : isDarkMode
                      ? "hover:bg-slate-700/50"
                      : "hover:bg-slate-50",
                )}
              >
                <span className="flex items-center gap-2">
                  {dotColor && (
                    <span
                      className={cx("w-2.5 h-2.5 rounded-full flex-shrink-0", dotColor)}
                    />
                  )}
                  <span
                    className={cx(
                      "text-xs font-medium",
                      isDarkMode ? "text-slate-400" : "text-slate-500",
                    )}
                  >
                    {label}
                  </span>
                </span>
                <span
                  className={cx("text-xl font-bold tabular-nums", textColor)}
                >
                  {band === "ALL" ? count : `${count} / ${total}`}
                </span>
              </button>
            ))}

            {/* Show All link — visible only when a filter is active */}
            {scoreBand !== "ALL" && (
              <button
                onClick={() => setScoreBand("ALL")}
                className={cx(
                  "w-full text-center text-xs font-medium pt-2 border-t transition-colors",
                  isDarkMode
                    ? "border-slate-700 text-cyan-400 hover:text-cyan-300"
                    : "border-slate-200 text-cyan-600 hover:text-cyan-500",
                )}
              >
                Show All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2b: Always-visible scoring legend (full width) ── */}
      <RubricLegendStrip
        isDarkMode={isDarkMode}
        onTrackEvent={onTrackEvent}
      />

      {/* Per-patient Rubric Report modal (opened from an Overall Score click) */}
      <PatientRubricReportModal
        isDarkMode={isDarkMode}
        patient={reportPatient}
        scoreAverageData={scoreAverageData}
        onClose={() => setReportPatient(null)}
        onOpenRubric={onOpenRubric}
        onTrackEvent={onTrackEvent}
      />

      {/* ── Row 3: Patient List (main content, full width) ── */}
      <div
        data-tour="patient-list"
        className={cx(
          "border rounded-xl overflow-hidden",
          isDarkMode
            ? "bg-slate-800/80 border-slate-700"
            : "bg-white border-slate-200 shadow-sm",
        )}
      >
        {/* Table header with search */}
        <div
          className={cx(
            "px-6 py-3 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
            isDarkMode
              ? "bg-slate-800 border-slate-700"
              : "bg-slate-50 border-slate-200",
          )}
        >
          <h2
            className={cx(
              "text-sm font-semibold",
              isDarkMode ? "text-slate-200" : "text-slate-800",
            )}
          >
            Patient Reports
            <span
              className={cx(
                "ml-2 text-xs font-normal",
                isDarkMode ? "text-slate-500" : "text-slate-400",
              )}
            >
              {filteredPatients.length} of {patients.length}
            </span>
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient / ID / file..."
            className={cx(
              "w-full sm:w-56 px-3 py-1.5 rounded-lg border text-sm",
              isDarkMode
                ? "bg-slate-900 border-slate-600 text-slate-200 placeholder-slate-500"
                : "bg-white border-slate-300 text-slate-900 placeholder-slate-400",
            )}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr
                className={cx(
                  "border-b text-xs uppercase tracking-wider",
                  isDarkMode
                    ? "bg-slate-800/50 border-slate-700 text-slate-400"
                    : "bg-slate-50/50 border-slate-200 text-slate-500",
                )}
              >
                <th className="px-6 py-3 text-left font-semibold" style={{ width: "48%" }}>
                  <button
                    onClick={() => toggleSort("visit")}
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:opacity-80"
                  >
                    Visit
                    <span className="text-[10px] opacity-70">
                      {sortCaret("visit")}
                    </span>
                  </button>
                </th>
                <th className="px-6 py-3 text-left font-semibold" style={{ width: "30%" }}>
                  <button
                    onClick={() => toggleSort("score")}
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:opacity-80"
                  >
                    Overall Score
                    <span className="text-[10px] opacity-70">
                      {sortCaret("score")}
                    </span>
                  </button>
                  <span
                    className={cx(
                      "block normal-case tracking-normal text-[10px] font-normal mt-0.5",
                      isDarkMode ? "text-cyan-400" : "text-cyan-600",
                    )}
                  >
                    Click a score for category breakdown
                  </span>
                </th>
                <th className="px-6 py-3 text-center font-semibold" style={{ width: "22%" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody
              key={`tbody-${scoreBand}-${search}-${sortKey}-${sortDir}`}
              className={cx(
                "divide-y",
                isDarkMode ? "divide-slate-700/50" : "divide-slate-100",
              )}
            >
              {sortedPatients.map((patient) => {
                const hasScore = patient.overallScore != null && patient.overallScore > 0;
                return (
                <tr
                  key={patient.id}
                  className={cx(
                    "transition-colors",
                    hasScore
                      ? isDarkMode ? "hover:bg-slate-700/30" : "hover:bg-slate-50"
                      : isDarkMode ? "opacity-50" : "opacity-40",
                  )}
                >
                  <td className="px-6 py-3.5" style={{ width: "48%" }}>
                    {/* Visit ORDER, not a date. The real visit date is hashed
                        upstream and never sent; the server reconstructs the order.
                        This is the row identifier — the hashed filename is never shown. */}
                    <div
                      title={patient.name}
                      className={cx(
                        "text-sm font-semibold",
                        isDarkMode ? "text-slate-100" : "text-slate-900",
                      )}
                    >
                      {patient.visitIndex != null ? `Visit ${patient.visitIndex}` : "—"}
                    </div>
                  </td>
                  <td className="px-6 py-3.5" style={{ width: "30%" }}>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={!hasScore}
                        onClick={(e) => {
                          e.stopPropagation();
                          setReportPatient(patient);
                          onTrackEvent?.(
                            "patient_score_click",
                            `dashboard_overall_score_${patient.id}`,
                            { overallScore: patient.overallScore },
                          );
                        }}
                        title={
                          hasScore
                            ? "Click to see per-category scores & criteria"
                            : undefined
                        }
                        className={cx(
                          "relative inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold transition-all",
                          getScoreColorForValue(patient.overallScore, isDarkMode),
                          hasScore
                            ? "cursor-pointer ring-2 ring-cyan-400/50"
                            : "cursor-not-allowed",
                        )}
                      >
                        {patient.overallScore > 0
                          ? patient.overallScore.toFixed(1)
                          : "—"}
                        {/* Always-visible magnifier pip signals the score is clickable */}
                        {hasScore && (
                          <span
                            className={cx(
                              "absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-500 text-white ring-2",
                              isDarkMode ? "ring-slate-800" : "ring-white",
                            )}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                            </svg>
                          </span>
                        )}
                      </button>
                      <span
                        className={cx(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          patient.overallScore >= 4
                            ? isDarkMode
                              ? "bg-emerald-900/50 text-emerald-300"
                              : "bg-emerald-50 text-emerald-700"
                            : patient.overallScore >= 3
                              ? isDarkMode
                                ? "bg-yellow-900/50 text-yellow-300"
                                : "bg-yellow-50 text-yellow-700"
                              : isDarkMode
                                ? "bg-red-900/50 text-red-300"
                                : "bg-red-50 text-red-700",
                        )}
                      >
                        {!hasScore
                          ? "AI Score Not Available"
                          : patient.overallScore >= 4
                            ? "High"
                            : patient.overallScore >= 3
                              ? "Standard"
                              : "Needs Improvement"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-center" style={{ width: "30%" }}>
                    <button
                      disabled={!hasScore}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasScore) return;
                        setSelectedPatient(patient);
                        setCurrentView("grid");
                      }}
                      className={cx(
                        "px-4 py-2 rounded-lg text-xs font-semibold transition-colors",
                        !hasScore
                          ? isDarkMode
                            ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                            : "bg-slate-200 text-slate-400 cursor-not-allowed"
                          : isDarkMode
                            ? "bg-cyan-600 text-white hover:bg-cyan-500"
                            : "bg-cyan-500 text-white hover:bg-cyan-600",
                      )}
                    >
                      {hasScore ? "View Report" : "N/A"}
                    </button>
                  </td>
                </tr>
                );
              })}
              {filteredPatients.length === 0 && (
                <tr>
                  <td
                    className={cx(
                      "px-6 py-10 text-center text-sm",
                      isDarkMode ? "text-slate-500" : "text-slate-400",
                    )}
                    colSpan={4}
                  >
                    {search || scoreBand !== "ALL"
                      ? "No matching reports. Try clearing filters."
                      : "No reports available."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// GridView Component (Outside) - UPDATED
// Table shows: Topic, Your Score, Representative Sentence,
// Suggestions for Improvement, and Suggested Rephrasing
// ═══════════════════════════════════════════════════════════
const GridView: React.FC<GridViewProps> = ({
  isDarkMode,
  selectedPatient,
  selectedSpeaker,
  topicsData,
  overallScore,
  scoreSummaryLoading,
  apiLoading,
  apiError,
  sentences,
  setCurrentView,
  setSelectedPatient,
  setSelectedTopic,
  setSelectedSuggestion,
  setSelectedSentenceIdx,
  setShowRewrite,
  fetchSentences,
  fetchRewritesFiltered,
  fetchScoreSummary,
  setScoreSummaryLoading,
  onOpenRubric,
}) => {
  const isLoadingSentences =
    apiLoading && (!sentences?.data || sentences.data.length === 0);

  // Representative sentence: from sentences API, matched by AI-selected (i, i2)
  const getRepresentativeSentence = (data: TopicData): string => {
    const repI = (data as any).representativeI;
    const repI2 = (data as any).representativeI2;
    if (repI != null && repI2 != null) {
      const match = data.sentenceDetails.find((d) => d.i === repI && d.i2 === repI2);
      if (match) return match.context || match.sentence;
    }
    const first = data.sentenceDetails[0];
    return first?.context || first?.sentence || "No sentence available";
  };

  // Score for grid display: directly from scores/summary API
  const getLastSentenceScore = (data: TopicData, _topicName?: TopicName): number | null => {
    console.log(`[getLastSentenceScore] data.score=${data.score}`);
    return data.score ?? null;
  };

  // Helper function to get first improvement suggestion
  const getFirstSuggestion = (
    topicName: TopicName,
    score: number | null,
  ): ImprovementSuggestion | null => {
    const suggestions = getImprovementSuggestions(topicName, score);
    return suggestions.length > 0 ? suggestions[0] : null;
  };

  return (
    <div className="space-y-8">
      {/* Back Button */}
      <button
        onClick={() => {
          setCurrentView("dashboard");
          setSelectedPatient(null);
        }}
        className={cx(
          "flex items-center gap-2 text-sm font-medium transition-colors",
          isDarkMode
            ? "text-cyan-400 hover:text-cyan-300"
            : "text-cyan-600 hover:text-cyan-800",
        )}
      >
        ← Return to Reports Dashboard
      </button>

      {/* ── Overall Performance Card (visually separated from topic details) ── */}
      <div
        data-tour="grid-overall"
        className={cx(
          "rounded-xl border p-5 sm:p-6",
          isDarkMode
            ? "bg-gradient-to-r from-slate-800 to-slate-800/80 border-slate-700 shadow-lg shadow-slate-900/30"
            : "bg-gradient-to-r from-white to-slate-50 border-slate-200 shadow-md",
        )}
      >
        <h1
          title={selectedPatient.name}
          className={cx(
            "text-2xl sm:text-3xl lg:text-4xl font-light mb-3 truncate max-w-full",
            isDarkMode ? "text-slate-100" : "text-slate-900",
          )}
        >
          {selectedPatient.name}
        </h1>
        <div
          className={cx(
            "text-base sm:text-lg flex flex-wrap items-center gap-3",
            isDarkMode ? "text-slate-400" : "text-slate-600",
          )}
        >
          <span className="inline-flex items-center gap-2">
            Overall Score:{" "}
            {scoreSummaryLoading ? (
              <LoadingSpinner size="sm" isDarkMode={isDarkMode} />
            ) : (
              <>
                <span
                  className={cx(
                    "inline-flex items-center justify-center w-10 h-10 rounded-full text-base font-bold",
                    getScoreColorForValue(overallScore, isDarkMode),
                  )}
                >
                  {overallScore !== null ? overallScore.toFixed(1) : "—"}
                </span>
                <span
                  className={cx(
                    "text-xs font-medium px-2 py-1 rounded-full",
                    overallScore !== null && overallScore >= 4
                      ? isDarkMode
                        ? "bg-emerald-900/50 text-emerald-300"
                        : "bg-emerald-100 text-emerald-700"
                      : overallScore !== null && overallScore >= 3
                        ? isDarkMode
                          ? "bg-yellow-900/50 text-yellow-300"
                          : "bg-yellow-100 text-yellow-700"
                        : isDarkMode
                          ? "bg-red-900/50 text-red-300"
                          : "bg-red-100 text-red-700",
                  )}
                >
                  {overallScore !== null && overallScore >= 4
                    ? "High Quality"
                    : overallScore !== null && overallScore >= 3
                      ? "Standard"
                      : "Needs Improvement"}
                </span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Error Message */}
      {apiError && (
        <div
          className={cx(
            "border rounded-lg p-4",
            isDarkMode
              ? "bg-amber-900/30 border-amber-700 text-amber-200"
              : "bg-amber-50 border-amber-200 text-amber-800",
          )}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <div className="font-medium">Error loading sentences</div>
              <div className="text-sm opacity-80">{apiError}</div>
            </div>
            <button
              onClick={() => {
                fetchSentences(selectedPatient.fileName, selectedSpeaker);
                fetchRewritesFiltered(
                  selectedPatient.fileName,
                  selectedSpeaker,
                );
                setScoreSummaryLoading(true);
                fetchScoreSummary(
                  selectedPatient.fileName,
                  selectedSpeaker,
                ).finally(() => setScoreSummaryLoading(false));
              }}
              className={cx(
                "ml-auto px-3 py-1.5 rounded text-sm font-medium",
                isDarkMode
                  ? "bg-amber-700 text-amber-100 hover:bg-amber-600"
                  : "bg-amber-200 text-amber-900 hover:bg-amber-300",
              )}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {isLoadingSentences && (
        <div
          className={cx(
            "border rounded-lg p-6 text-center",
            isDarkMode
              ? "bg-slate-800 border-slate-700"
              : "bg-slate-50 border-slate-200",
          )}
        >
          <div
            className={cx(
              "text-lg font-medium flex items-center justify-center gap-3",
              isDarkMode ? "text-slate-300" : "text-slate-600",
            )}
          >
            <LoadingSpinner size="md" isDarkMode={isDarkMode} />
            Loading sentences...
          </div>
        </div>
      )}

      {/* Topics Table */}
      <div
        data-tour="grid-topics-table"
        className={cx(
          "border rounded-xl shadow-xl overflow-hidden",
          isDarkMode
            ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700"
            : "bg-gradient-to-br from-white to-slate-50 border-slate-200",
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead
              className={cx(
                "border-b",
                isDarkMode
                  ? "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600"
                  : "bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200",
              )}
            >
              <tr>
                <th
                  className={cx(
                    "px-4 py-4 text-left text-sm font-semibold uppercase tracking-wider",
                    isDarkMode ? "text-slate-300" : "text-slate-700",
                  )}
                  style={{ width: "15%" }}
                >
                  Topic
                </th>
                <th
                  className={cx(
                    "px-4 py-4 text-center text-sm font-semibold uppercase tracking-wider",
                    isDarkMode ? "text-slate-300" : "text-slate-700",
                  )}
                  style={{ width: "10%" }}
                >
                  <div data-tour="grid-your-score" className="flex items-center justify-center gap-1">
                    Your Score
                  </div>
                </th>
                <th
                  className={cx(
                    "px-4 py-4 text-left text-sm font-semibold uppercase tracking-wider",
                    isDarkMode ? "text-slate-300" : "text-slate-700",
                  )}
                  style={{ width: "40%" }}
                >
                  <div className="flex items-center gap-1">
                    Your Highest Rated Sentence
                    <span
                      className={cx(
                        "text-xs font-normal normal-case",
                        isDarkMode ? "text-slate-500" : "text-slate-400",
                      )}
                      title="Your best performance in this category"
                    >
                      ⓘ
                    </span>
                  </div>
                </th>
                <th
                  className={cx(
                    "px-4 py-4 text-left text-sm font-semibold uppercase tracking-wider",
                    isDarkMode ? "text-slate-300" : "text-slate-700",
                  )}
                  style={{ width: "35%" }}
                >
                  <div className="flex items-center gap-1">
                    How to Improve
                    <span
                      className={cx(
                        "text-xs font-normal normal-case px-1.5 py-0.5 rounded",
                        isDarkMode
                          ? "bg-slate-700 text-slate-400"
                          : "bg-slate-200 text-slate-500",
                      )}
                      title="Actionable steps to improve your score"
                    >
                      Guide
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody
              className={cx(
                "divide-y",
                isDarkMode ? "divide-slate-700" : "divide-slate-200",
              )}
            >
              {ALL_TOPICS.map((topicName) => {
                const data = topicsData[topicName];
                const representativeSentence = getRepresentativeSentence(data);
                const lastScore = getLastSentenceScore(data, topicName);
                const allSuggestions = getImprovementSuggestions(
                  topicName,
                  lastScore,
                );

                return (
                  <tr
                    key={topicName}
                    className={cx(
                      "transition-colors duration-200",
                      isDarkMode
                        ? "hover:bg-slate-700/50"
                        : "hover:bg-slate-100/50",
                    )}
                  >
                    {/* Topic Column */}
                    <td className="px-4 py-5">
                      <button
                        onClick={() => {
                          setSelectedSuggestion(null);
                          setSelectedTopic({
                            name: topicName,
                            patient: selectedPatient,
                          });
                          setSelectedSentenceIdx(0);
                          setShowRewrite(false);
                          setCurrentView("detail");
                        }}
                        className={cx(
                          "text-sm font-semibold underline transition-colors text-left",
                          isDarkMode
                            ? "text-cyan-400 hover:text-cyan-300"
                            : "text-cyan-600 hover:text-cyan-800",
                        )}
                      >
                        {topicName}
                      </button>
                    </td>

                    {/* Your Score Column - uses last sentence score, clickable to open rubric */}
                    <td className="px-4 py-5 text-center">
                      {scoreSummaryLoading ? (
                        <div className="flex justify-center">
                          <LoadingSpinner size="sm" isDarkMode={isDarkMode} />
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            const score = getLastSentenceScore(data, topicName);
                            if (score !== null && onOpenRubric) {
                              onOpenRubric(topicName, Math.round(score));
                            }
                          }}
                          className={cx(
                            "inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold cursor-pointer transition-transform hover:scale-110",
                            getScoreColorForValue(getLastSentenceScore(data, topicName), isDarkMode),
                          )}
                          title="Click to view scoring rubric"
                        >
                          {getLastSentenceScore(data, topicName) !== null ? getLastSentenceScore(data, topicName)!.toFixed(1) : "0.0"}
                        </button>
                      )}
                    </td>

                    {/* Representative Sentence Column */}
                    <td className="px-4 py-5">
                      {/* "Mentioned — not tied to treatment" badge hidden for now
                          (representativeTreatment still set for future use). */}
                      <div
                        className={cx(
                          "text-sm leading-relaxed max-h-32 overflow-y-auto pr-2",
                          isDarkMode ? "text-slate-300" : "text-slate-700",
                        )}
                      >
                        {representativeSentence.includes("<main>") ? (
                          <>
                            {representativeSentence.split("<main>").map((part: string, idx: number) => {
                              if (idx === 0) return <span key={idx}>{part}</span>;
                              const [highlighted, rest] = part.split("</main>");
                              return (
                                <span key={idx}>
                                  <span className={cx("font-bold underline", isDarkMode ? "text-cyan-300" : "text-cyan-700")}>{highlighted}</span>
                                  {rest}
                                </span>
                              );
                            })}
                          </>
                        ) : (
                          representativeSentence
                        )}
                      </div>
                    </td>

                    {/* How to Improve Column — ALL levels above current score (highest first, lowest last) */}
                    <td className="px-4 py-5">
                      {allSuggestions.length > 0 ? (
                        <div className="space-y-2">
                          {[...allSuggestions].reverse().map((s) => {
                            const isNextStep = s.targetScore === (lastScore !== null ? Math.floor(lastScore) + 1 : 1);
                            return (
                              <div key={s.targetScore}>
                                <div
                                  className={cx(
                                    "text-xs font-semibold",
                                    isNextStep
                                      ? isDarkMode ? "text-cyan-400" : "text-cyan-600"
                                      : isDarkMode ? "text-slate-300" : "text-slate-600",
                                  )}
                                >
                                  Score {s.targetScore}:{isNextStep && " ← next step"}
                                </div>
                                <div
                                  className={cx(
                                    "text-xs leading-relaxed",
                                    isNextStep
                                      ? isDarkMode ? "text-slate-200" : "text-slate-800"
                                      : isDarkMode ? "text-slate-300" : "text-slate-600",
                                  )}
                                >
                                  {s.suggestion}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          className={cx(
                            "text-sm font-medium",
                            isDarkMode
                              ? "text-emerald-400"
                              : "text-emerald-600",
                          )}
                        >
                          ✓ Maximum score achieved
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// DetailView Component (Outside) - WITH HISTORY + AI REWRITE
// ═══════════════════════════════════════════════════════════
const DetailView: React.FC<DetailViewProps> = ({
  isDarkMode,
  selectedTopic,
  topicsData,
  selectedSentenceIdx,
  setSelectedSentenceIdx,
  showRewrite,
  setShowRewrite,
  newSentence,
  setNewSentence,
  selectedSuggestion,
  setSelectedSuggestion,
  saveStatus,
  setSaveStatus,
  rescoring,
  setRescoring,
  selectedFile,
  selectedSpeaker,
  scoreSentence,
  saveRewriteWithTimestamp,
  fetchRewritesFiltered,
  fetchScoreSummary,
  setScoreSummaryLoading,
  setCurrentView,
  setSelectedTopic,
  // History props
  fetchRewriteHistory,
  rewriteHistory,
  clearRewriteHistory,
  // AI Rewrite props
  generateAIRewrite,
  aiRewriteLoading,
  // Topic trajectory
  scoreAverageData,
  patients: allPatients,
  fetchScoreAverage,
  // Rewrite stats
  rewriteStats,
  fetchRewriteStats,
  // Rubric
  onOpenRubric,
}) => {
  const { name: topicName, patient } = selectedTopic;
  const data = topicsData[topicName];
  // Use the representative sentence from scores/summary API (pred_score highest)
  const repI = (data as any).representativeI;
  const repI2 = (data as any).representativeI2;
  const currentSentence = (() => {
    if (repI !== null && repI2 !== null) {
      const match = data.sentenceDetails.find((d) => d.i === repI && d.i2 === repI2);
      if (match) {
        console.log(`[currentSentence] Using API representative: i=${repI}, i2=${repI2}, score=${match.score}`);
        return match;
      }
    }
    console.log("[currentSentence] No API match, using first sentenceDetail");
    return data.sentenceDetails.length > 0 ? data.sentenceDetails[0] : undefined;
  })();

  // B2: current sentence score — seeds the scoring-rubric reference shown below
  // the rewrite input (highlights "where you are" so the doctor sees how to reach
  // the next level while rewriting).
  const currentScore = currentSentence?.score ?? data.score ?? null;
  // Toggle for the collapsible scoring rubric under the rewrite input.
  const [showRewriteRubric, setShowRewriteRubric] = useState(false);

  // History modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // NEW: AI Rewrite state
  const [aiRewriteText, setAiRewriteText] = useState<string | null>(null);

  // Reset AI Rewrite and restore saved rewrite when sentence changes
  useEffect(() => {
    setAiRewriteText(null);
    // Restore previously saved rewrite from DB into the textarea
    if (currentSentence?.revisedSentence) {
      setNewSentence(currentSentence.revisedSentence);
    } else {
      setNewSentence("");
    }
  }, [selectedSentenceIdx, currentSentence?.revisedSentence]);

  // Handle view history click
  const handleViewHistory = async () => {
    if (!currentSentence) return;

    setHistoryLoading(true);
    setShowHistoryModal(true);

    await fetchRewriteHistory(
      selectedFile,
      currentSentence.i,
      currentSentence.i2,
    );
    setHistoryLoading(false);
  };

  // Handle close history modal
  const handleCloseHistory = () => {
    setShowHistoryModal(false);
    clearRewriteHistory();
  };

  // NEW: Handle Generate AI Rewrite
  const handleGenerateAIRewrite = async () => {
    if (!currentSentence) return;

    const classNumber = TOPIC_TO_CLASS[topicName];
    const targetScore = selectedSuggestion?.targetScore ?? 5;

    // Get full context from all sentences in this topic
    // data.sentences is already string[], so just join them
    const context =
      data.sentences.length > 0 ? data.sentences.join(" ") : undefined;

    const result = await generateAIRewrite(
      currentSentence.sentence,
      classNumber,
      targetScore,
      context, // Pass context to API
    );

    if (result) {
      setAiRewriteText(result.rewritten_sentence);
    }
  };

  // NEW: Handle Use AI Rewrite
  const handleUseAIRewrite = (rewrittenText: string) => {
    setNewSentence(rewrittenText);
    setShowRewrite(true);
  };

  // Score-only handler: no DB save, just instant feedback
  const handleSaveRewrite = async () => {
    if (!newSentence.trim() || !currentSentence) return;

    if (selectedSpeaker) {
      trackDoctor(selectedSpeaker, selectedFile || null, {
        event_type: "rewrite_apply",
        target_type: "sentence",
        target_id: String(currentSentence.i),
        metadata: { topic: topicName, length: newSentence.length },
      });
    }

    setSaveStatus({ status: "saving", message: "Scoring..." });
    setRescoring(true);

    try {
      const classNumber = TOPIC_TO_CLASS[topicName];
      const scoreResult = await scoreSentence(newSentence, classNumber);
      const newScore = scoreResult?.score ?? null;

      setRescoring(false);

      // Save rewrite to DB (score succeeded). saveRewriteWithTimestamp resolves to
      // the saved record on success or null on failure (it swallows the error), so
      // check the result and surface a real DB-save failure instead of a false
      // "success" — otherwise a 404/500 on PUT /rewrites is invisible to the doctor.
      if (newScore !== null) {
        let saved: unknown = null;
        try {
          saved = await saveRewriteWithTimestamp(
            selectedFile,
            selectedSpeaker,
            currentSentence.i,
            currentSentence.i2,
            currentSentence.sentence,
            newSentence,
            newScore,
            classNumber,
          );
        } catch (saveErr) {
          console.error("Error saving rewrite to DB:", saveErr);
        }
        if (saved) {
          // Refresh rewrites data so it persists on page reload
          fetchRewritesFiltered(selectedFile, selectedSpeaker);
          setSaveStatus({
            status: "success",
            message: `Your rewrite scored: ${newScore.toFixed(1)} — saved.`,
          });
        } else {
          setSaveStatus({
            status: "error",
            message: `Scored ${newScore.toFixed(1)}, but saving to the database failed. Please try again.`,
          });
        }
      } else {
        setSaveStatus({
          status: "error",
          message: "Could not score. Please try again.",
        });
      }

      setTimeout(() => {
        setSaveStatus({ status: "idle", message: "" });
      }, 5000);
    } catch (err) {
      setRescoring(false);
      console.error("Error scoring rewrite:", err);
      setSaveStatus({
        status: "error",
        message: "Scoring failed. Please try again.",
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Commented out per Ivan's feedback: no rewrite history
      <HistoryModal
        isDarkMode={isDarkMode}
        isOpen={showHistoryModal}
        onClose={handleCloseHistory}
        historyData={rewriteHistory}
        loading={historyLoading}
      />
      */}

      {/* Back Button */}
      <button
        onClick={() => {
          setCurrentView("grid");
          setSelectedTopic(null);
          setSelectedSuggestion(null);
          setShowRewrite(false);
          setNewSentence("");
          setSaveStatus({ status: "idle", message: "" });
          setSelectedSentenceIdx(0);
          setAiRewriteText(null); // Clear AI rewrite on back
        }}
        className={cx(
          "flex items-center gap-2 text-sm font-medium transition-colors",
          isDarkMode
            ? "text-cyan-400 hover:text-cyan-300"
            : "text-cyan-600 hover:text-cyan-800",
        )}
      >
        ← Return to Grid Summary
      </button>

      <div
        className={cx(
          "border rounded-xl p-4 sm:p-6 lg:p-8 shadow-xl",
          isDarkMode
            ? "bg-slate-800/70 border-slate-700"
            : "bg-white border-slate-200",
        )}
      >
        {/* Header */}
        <div
          className={cx(
            "border-b pb-4 sm:pb-6 mb-4 sm:mb-6 lg:mb-8",
            isDarkMode ? "border-slate-700" : "border-slate-200",
          )}
        >
          <h2
            className={cx(
              "text-xl sm:text-2xl lg:text-3xl font-light mb-2",
              isDarkMode ? "text-slate-100" : "text-slate-900",
            )}
          >
            {topicName}
          </h2>
          <p
            className={cx(
              "text-sm sm:text-base lg:text-lg",
              isDarkMode ? "text-slate-400" : "text-slate-600",
            )}
          >
            {patient.name}
          </p>
        </div>

        {/* Topic Trajectory: all patients' scores for this topic */}
        {scoreAverageData && scoreAverageData.length > 0 && (() => {
          const classFullName = TOPIC_TO_CLASS[topicName];
          const classShortName = TOPIC_TO_MODEL[topicName];
          const topicScores = scoreAverageData
            .filter((item) => (item.class === classFullName || item.class === classShortName) && item.avg_score !== null)
            .map((item, idx) => {
              const isCurrentPatient = item.file === patient.fileName;
              const patientInfo = allPatients?.find((p) => p.fileName === item.file);
              return {
                index: idx + 1,
                file: item.file,
                label: patientInfo?.name || `Patient ${idx + 1}`,
                score: item.avg_score ?? 0,
                isCurrentPatient,
              };
            })
            .sort((a, b) => a.index - b.index);

          if (topicScores.length === 0) return null;

          const currentPatientScore = topicScores.find((s) => s.isCurrentPatient);

          return (
            <div
              data-tour="detail-topic-trajectory"
              className={cx(
                "mb-8 rounded-xl border p-6",
                isDarkMode
                  ? "bg-slate-800/40 border-slate-700"
                  : "bg-slate-50 border-slate-200",
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <h3
                  className={cx(
                    "text-sm font-semibold uppercase tracking-wider",
                    isDarkMode ? "text-slate-300" : "text-slate-700",
                  )}
                >
                  {topicName} — All Patients Score Overview
                </h3>
                <span
                  className={cx(
                    "text-xs",
                    isDarkMode ? "text-slate-500" : "text-slate-400",
                  )}
                >
                  {topicScores.length} patients • Current:{" "}
                  <span className="text-red-500 font-semibold">
                    {currentPatientScore?.score?.toFixed(1) ?? "N/A"}
                  </span>
                </span>
              </div>
              <div style={{ height: "200px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={topicScores}
                    margin={{ top: 8, right: 16, left: -8, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={isDarkMode ? "#334155" : "#e2e8f0"}
                    />
                    <XAxis
                      dataKey="index"
                      tick={{ fontSize: 10, fill: isDarkMode ? "#94a3b8" : "#64748b" }}
                      tickLine={false}
                      axisLine={{ stroke: isDarkMode ? "#475569" : "#cbd5e1" }}
                      label={{
                        value: "Patient #",
                        position: "insideBottomRight",
                        offset: -4,
                        fontSize: 10,
                        fill: isDarkMode ? "#64748b" : "#94a3b8",
                      }}
                    />
                    <YAxis
                      domain={[0, 5]}
                      ticks={[0, 1, 2, 3, 4, 5]}
                      tick={{ fontSize: 11, fill: isDarkMode ? "#94a3b8" : "#64748b" }}
                      tickLine={false}
                      axisLine={{ stroke: isDarkMode ? "#475569" : "#cbd5e1" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDarkMode ? "#1e293b" : "#ffffff",
                        border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                        borderRadius: "8px",
                        fontSize: 12,
                        color: isDarkMode ? "#e2e8f0" : "#1e293b",
                      }}
                      formatter={(value: number, _name: string, props: any) => {
                        const entry = props.payload;
                        const label = entry.isCurrentPatient
                          ? `${value.toFixed(2)} ★ Current Patient`
                          : value.toFixed(2);
                        return [label, "Score"];
                      }}
                      labelFormatter={(_: any, payload: any[]) => {
                        const item = payload?.[0]?.payload;
                        return item ? item.label : "";
                      }}
                    />
                    <ReferenceLine
                      y={3}
                      stroke={isDarkMode ? "#475569" : "#cbd5e1"}
                      strokeDasharray="6 3"
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#9ca3af"
                      strokeWidth={1.5}
                      dot={(props: any) => {
                        const { cx: dotX, cy: dotY, payload } = props;
                        if (payload.isCurrentPatient) {
                          return (
                            <circle
                              key={`dot-${payload.index}`}
                              cx={dotX}
                              cy={dotY}
                              r={8}
                              fill="#ef4444"
                              stroke={isDarkMode ? "#1e293b" : "#ffffff"}
                              strokeWidth={3}
                            />
                          );
                        }
                        return (
                          <circle
                            key={`dot-${payload.index}`}
                            cx={dotX}
                            cy={dotY}
                            r={4}
                            fill="#9ca3af"
                            stroke={isDarkMode ? "#1e293b" : "#ffffff"}
                            strokeWidth={2}
                          />
                        );
                      }}
                      activeDot={(props: any) => {
                        const { cx: dotX, cy: dotY, payload } = props;
                        return (
                          <circle
                            key={`active-${payload.index}`}
                            cx={dotX}
                            cy={dotY}
                            r={payload.isCurrentPatient ? 10 : 6}
                            fill={payload.isCurrentPatient ? "#ef4444" : "#6b7280"}
                            stroke={isDarkMode ? "#1e293b" : "#ffffff"}
                            strokeWidth={2}
                          />
                        );
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
                  <span className={cx("text-xs", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Current Patient ({patient.name})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-gray-400" />
                  <span className={cx("text-xs", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Other Patients
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Consultation Scoring — TEMPORARY: uses placeholder random scores (1-5)
            Will be replaced by Guillermo's AI scoring sub-pipeline (Step 8) */}
        <div data-tour="detail-consultation-scoring" className="mb-6">
          <ConsultationScoring
            isDarkMode={isDarkMode}
            title={titleByScore(data.score)}
            subtitle="Quality of Risk Communication"
            sentences={data.sentenceDetails.map((detail) => ({
              sentence: detail.context || detail.sentence,
              hasRewrite: detail.hasRewrite,
              revisedSentence: detail.revisedSentence,
              score: detail.score,
              revisedScore: detail.revisedScore,
            }))}
            highlightPosition={data.score}
            leftLabel={leftLabelByTopic(topicName)}
            selectedIdx={selectedSentenceIdx}
            onSentenceClick={(idx) => setSelectedSentenceIdx(idx)}
            suggestions={getImprovementSuggestions(topicName,
              data.score ?? 0
            )}
            allRubricLevels={getImprovementSuggestions(topicName, 0)}
            onSuggestionClick={(suggestion) => {
              setSelectedSuggestion(suggestion);
              setShowRewrite(true);
            }}
            aiRewriteText={aiRewriteText || undefined}
            aiRewriteLoading={aiRewriteLoading}
            onGenerateAIRewrite={handleGenerateAIRewrite}
            onUseAIRewrite={handleUseAIRewrite}
            onScoreClick={(score) => onOpenRubric?.(topicName, score)}
          />
        </div>

        {/* ═══ Re-write Practice Panel ═══ */}
        <div
          data-tour="detail-rewrite-panel"
          className={cx(
            "rounded-xl mb-8 overflow-hidden",
            isDarkMode
              ? "bg-slate-800/60 border border-slate-600"
              : "bg-white border border-slate-200 shadow-sm",
          )}
        >
          {/* Panel Header */}
          <div
            className={cx(
              "px-6 py-4 border-b flex items-center justify-between",
              isDarkMode
                ? "bg-slate-800 border-slate-700"
                : "bg-slate-50 border-slate-200",
            )}
          >
            <div className="flex items-center gap-3">
              <h4
                className={cx(
                  "text-lg font-bold",
                  isDarkMode ? "text-slate-100" : "text-slate-900",
                )}
              >
                Re-write Practice
              </h4>
              <span
                className={cx(
                  "text-sm px-3 py-1 rounded-full font-medium",
                  isDarkMode
                    ? "bg-slate-700 text-slate-300"
                    : "bg-slate-200 text-slate-600",
                )}
              >
                Learning Tool
              </span>
            </div>
            {/* Commented out per Ivan's feedback: no history, no stats tracking
            <div className="flex items-center gap-2">
              {currentSentence?.hasRewrite && (
                <button
                  onClick={handleViewHistory}
                  className={cx(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition",
                    isDarkMode
                      ? "bg-purple-800/60 text-purple-300 hover:bg-purple-700"
                      : "bg-purple-50 text-purple-700 hover:bg-purple-100",
                  )}
                >
                  View History
                </button>
              )}
              {rewriteStats && rewriteStats.total_rewrites > 0 && (
                <span
                  className={cx(
                    "px-3 py-1.5 rounded-full text-xs font-medium",
                    isDarkMode
                      ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200",
                  )}
                >
                  {rewriteStats.total_rewrites} rewrite{rewriteStats.total_rewrites !== 1 ? "s" : ""} across {rewriteStats.unique_sentences_rewritten} sentence{rewriteStats.unique_sentences_rewritten !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            */}
          </div>

          {/* Panel Body */}
          <div className="p-6">
            {currentSentence ? (
              <div className="space-y-5">
                {/* Step 1: Original Sentence */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={cx(
                        "flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold",
                        isDarkMode
                          ? "bg-slate-700 text-slate-200"
                          : "bg-slate-200 text-slate-700",
                      )}
                    >
                      1
                    </span>
                    <span
                      className={cx(
                        "text-base font-semibold",
                        isDarkMode ? "text-slate-200" : "text-slate-800",
                      )}
                    >
                      Original Sentence
                    </span>
                    <span
                      className={cx(
                        "inline-flex items-center justify-center min-w-[2.5rem] px-3 py-1 rounded text-sm font-bold ml-auto",
                        getScoreColorForValue(
                          currentSentence.score ?? data.score ?? null,
                          isDarkMode,
                        ),
                      )}
                    >
                      Score: {currentSentence.score ?? data.score ?? "N/A"}
                    </span>
                  </div>
                  <div
                    className={cx(
                      "p-4 rounded-lg text-base leading-relaxed border-l-4 max-h-40 overflow-y-auto",
                      isDarkMode
                        ? "bg-slate-700/50 text-slate-200 border-slate-500"
                        : "bg-slate-50 text-slate-800 border-slate-300",
                    )}
                  >
                    {(currentSentence.context || currentSentence.sentence).includes("<main>") ? (
                      <>
                        &quot;
                        {(currentSentence.context || currentSentence.sentence).split("<main>").map((part: string, idx: number) => {
                          if (idx === 0) return <span key={idx}>{part}</span>;
                          const [highlighted, rest] = part.split("</main>");
                          return (
                            <span key={idx}>
                              <span className={cx("font-bold underline", isDarkMode ? "text-cyan-300" : "text-cyan-700")}>{highlighted}</span>
                              {rest}
                            </span>
                          );
                        })}
                        &quot;
                      </>
                    ) : (
                      <>&quot;{currentSentence.context || currentSentence.sentence}&quot;</>
                    )}
                  </div>
                </div>

                {/* Commented out per Ivan's feedback: rewrite is feedback-only, no history/score saving
                {currentSentence.hasRewrite && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cx("flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold", isDarkMode ? "bg-emerald-900/60 text-emerald-300" : "bg-emerald-100 text-emerald-700")}>&#x2713;</span>
                      <span className={cx("text-sm font-semibold", isDarkMode ? "text-emerald-400" : "text-emerald-700")}>Your latest rewrite</span>
                      <span className={cx("inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded text-xs font-bold ml-auto", getScoreColorForValue(currentSentence.revisedScore ?? null, isDarkMode))}>
                        Score: {currentSentence.revisedScore ?? "N/A"}
                      </span>
                      <button onClick={handleViewHistory} className={cx("text-xs underline transition-colors", isDarkMode ? "text-purple-400 hover:text-purple-300" : "text-purple-600 hover:text-purple-800")}>all revisions</button>
                    </div>
                    <div className={cx("p-4 rounded-lg text-sm leading-relaxed border-l-4", isDarkMode ? "bg-emerald-900/20 text-emerald-300 border-emerald-600" : "bg-emerald-50 text-emerald-800 border-emerald-400")}>
                      &quot;{currentSentence.revisedSentence}&quot;
                    </div>
                    {currentSentence.score != null && currentSentence.revisedScore != null && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className={cx("text-xs font-medium", currentSentence.revisedScore > currentSentence.score ? (isDarkMode ? "text-emerald-400" : "text-emerald-600") : currentSentence.revisedScore < currentSentence.score ? (isDarkMode ? "text-red-400" : "text-red-600") : (isDarkMode ? "text-slate-400" : "text-slate-500"))}>
                          {currentSentence.revisedScore > currentSentence.score ? `+${(currentSentence.revisedScore - currentSentence.score).toFixed(1)} improvement` : currentSentence.revisedScore < currentSentence.score ? `${(currentSentence.revisedScore - currentSentence.score).toFixed(1)} regression` : "No change in score"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                */}

                {/* Improvement hint (if rubric suggestion selected) */}
                {selectedSuggestion && (
                  <div
                    className={cx(
                      "p-4 rounded-lg border-l-4",
                      isDarkMode
                        ? "bg-cyan-900/20 border-cyan-500"
                        : "bg-cyan-50 border-cyan-500",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cx(
                          "text-sm font-bold uppercase",
                          isDarkMode ? "text-cyan-400" : "text-cyan-600",
                        )}
                      >
                        Hint — To reach score {selectedSuggestion.targetScore}:
                      </span>
                      <button
                        onClick={() => setSelectedSuggestion(null)}
                        className={cx(
                          "ml-auto text-sm transition-colors",
                          isDarkMode
                            ? "text-slate-400 hover:text-slate-200"
                            : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        dismiss
                      </button>
                    </div>
                    <p
                      className={cx(
                        "text-base leading-relaxed",
                        isDarkMode ? "text-slate-200" : "text-slate-800",
                      )}
                    >
                      {selectedSuggestion.suggestion}
                    </p>
                  </div>
                )}

                {/* Step 2: Try rewriting */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={cx(
                        "flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold",
                        isDarkMode
                          ? "bg-cyan-900/60 text-cyan-300"
                          : "bg-cyan-100 text-cyan-700",
                      )}
                    >
                      2
                    </span>
                    <span
                      className={cx(
                        "text-base font-semibold",
                        isDarkMode ? "text-slate-200" : "text-slate-800",
                      )}
                    >
                      How would you say it better?
                    </span>
                  </div>

                  {/* B2: collapsible scoring rubric right under the prompt.
                      Same shared RubricBody as the floating button / legend, but
                      scoped to this domain and seeded at the sentence's current
                      score, so the doctor can reference the criteria while writing. */}
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setShowRewriteRubric((v) => !v)}
                      aria-expanded={showRewriteRubric}
                      title="Scoring rubric for this domain"
                      className={cx(
                        "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-semibold transition-all",
                        showRewriteRubric
                          ? isDarkMode
                            ? "border-cyan-500 bg-cyan-500/15 text-cyan-300"
                            : "border-cyan-500 bg-cyan-50 text-cyan-700"
                          : isDarkMode
                            ? "border-slate-600 text-cyan-400 hover:border-cyan-500 hover:bg-cyan-500/10"
                            : "border-slate-300 text-cyan-600 hover:border-cyan-400 hover:bg-cyan-50",
                      )}
                    >
                      {/* Rubric document icon — same as the floating rubric button */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      Scoring rubric
                      {/* Chevron — rotates when expanded */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={cx(
                          "w-4 h-4 transition-transform",
                          showRewriteRubric && "rotate-180",
                        )}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                    {showRewriteRubric && (
                      <div
                        className={cx(
                          "mt-3 rounded-xl border overflow-hidden",
                          isDarkMode
                            ? "border-slate-600 bg-slate-800/40"
                            : "border-slate-200 bg-white",
                        )}
                      >
                        <RubricBody
                          key={`rewrite-rubric-${topicName}-${currentScore}`}
                          isDarkMode={isDarkMode}
                          initialTab={topicName}
                          initialScore={
                            currentScore != null ? Math.round(currentScore) : null
                          }
                        />
                      </div>
                    )}
                  </div>
                  <textarea
                    value={newSentence}
                    onChange={(e) => setNewSentence(e.target.value)}
                    placeholder="Try rephrasing the sentence above — how would you communicate this to the patient next time?"
                    className={cx(
                      "w-full p-4 rounded-lg border text-base leading-relaxed transition-colors focus:ring-2 focus:outline-none",
                      isDarkMode
                        ? "bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400 focus:ring-cyan-600 focus:border-cyan-600"
                        : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:ring-cyan-400 focus:border-cyan-400",
                    )}
                    rows={3}
                  />

                  {/* Action row */}
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={handleSaveRewrite}
                      disabled={
                        !newSentence.trim() ||
                        rescoring ||
                        saveStatus.status === "saving"
                      }
                      className={cx(
                        "px-5 py-2.5 rounded-lg text-sm font-semibold transition-all",
                        !newSentence.trim() ||
                          rescoring ||
                          saveStatus.status === "saving"
                          ? isDarkMode
                            ? "bg-slate-600 text-slate-400 cursor-not-allowed"
                            : "bg-slate-200 text-slate-500 cursor-not-allowed"
                          : isDarkMode
                            ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-md"
                            : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 shadow-md",
                      )}
                    >
                      {rescoring
                        ? "Scoring..."
                        : saveStatus.status === "saving"
                          ? "Scoring..."
                          : "Try & Score"}
                    </button>

                    {/* Save Status inline */}
                    {saveStatus.message && (
                      <span
                        className={cx(
                          "text-sm font-medium",
                          saveStatus.status === "success"
                            ? isDarkMode ? "text-emerald-400" : "text-emerald-600"
                            : saveStatus.status === "error"
                              ? isDarkMode ? "text-red-400" : "text-red-600"
                              : isDarkMode ? "text-slate-400" : "text-slate-500",
                        )}
                      >
                        {saveStatus.message}
                      </span>
                    )}
                  </div>
                </div>

                {/* Note removed per feedback */}
              </div>
            ) : (
              /* Empty state */
              <div
                className={cx(
                  "text-center py-10",
                  isDarkMode ? "text-slate-400" : "text-slate-500",
                )}
              >
                <p className="text-base font-medium mb-1">No sentence selected</p>
                <p className="text-sm">
                  Click on a sentence above to start practicing.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════
const PhysicianReports: React.FC<PhysicianReportsProps> = ({
  isDarkMode = false,
}) => {
  // ═══════════════════════════════════════════════════════════
  // Store
  // ═══════════════════════════════════════════════════════════
  const fileId = useFileId((state) => state.fileId);
  const doctorId = useDoctorId((state) => state.doctorId);

  // ═══════════════════════════════════════════════════════════
  // useDoctorData hook - WITH AI REWRITE
  // ═══════════════════════════════════════════════════════════
  const {
    files,
    sentences,
    rewritesFiltered,
    scoreSummary,
    scoreAverage,
    // History state and functions
    rewriteHistory,
    loading: apiLoading,
    error: apiError,
    fetchFiles,
    fetchSentences,
    fetchRewritesFiltered,
    fetchScoreSummary,
    fetchScoreAverage,
    saveRewriteWithTimestamp,
    scoreSentence,
    // History functions
    fetchRewriteHistory,
    clearRewriteHistory,
    // NEW: AI Rewrite functions
    generateAIRewrite,
    aiRewriteLoading,
    // Trajectory (B-2)
    trajectoryData,
    fetchTrajectory,
    // Rewrite Stats (B-5)
    rewriteStats,
    fetchRewriteStats,
  } = useDoctorData(doctorId);

  // ═══════════════════════════════════════════════════════════
  // UI State
  // ═══════════════════════════════════════════════════════════
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("");
  const [fileSpeakerMap, setFileSpeakerMap] = useState<Record<string, string>>({});
  // file -> consult date (ISO). Stand-in: the AI processing timestamp from the
  // backend until the de-id pipeline supplies the real (±7-day shifted) date.
  const [fileDateMap, setFileDateMap] = useState<Record<string, string>>({});
  // file -> 1-based visit order (from the server, reconstructed from the hashed
  // visit date). Shown as "Visit N"; the real date is never fetched.
  const [fileVisitMap, setFileVisitMap] = useState<Record<string, number>>({});
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(
    null,
  );
  const [currentView, setCurrentView] = useState<
    "dashboard" | "grid" | "detail"
  >("dashboard");
  const [selectedTopic, setSelectedTopic] = useState<SelectedTopicState | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [scoreSummaryLoading, setScoreSummaryLoading] = useState(false);
  const [newSentence, setNewSentence] = useState("");
  const [rescoring, setRescoring] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<ImprovementSuggestion | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    status: "idle" | "saving" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  const [search, setSearch] = useState("");
  const [scoreBand, setScoreBand] = useState<"ALL" | "HIGH" | "STD" | "LOW">(
    "ALL",
  );
  const [selectedSentenceIdx, setSelectedSentenceIdx] = useState(0);
  const [showRewrite, setShowRewrite] = useState(true);

  // Rubric modal external control state
  const [rubricOpen, setRubricOpen] = useState(false);
  const [rubricTab, setRubricTab] = useState<string>("All Domains");
  const [rubricScore, setRubricScore] = useState<number | null>(null);

  const handleOpenRubric = useCallback(
    (domain: TopicName | "All Domains", score: number | null) => {
      // Map domain to a rubric tab. "All Domains" and "Irritative Symptoms"
      // both pass through unchanged; other TopicNames match their tab label.
      setRubricTab(domain);
      // score may be null (explicit "view full rubric" link) — that clears the
      // locked level so the modal opens with nothing highlighted.
      setRubricScore(score);
      setRubricOpen(true);
    },
    [],
  );

  const handleRubricHandled = useCallback(() => {
    setRubricOpen(false);
  }, []);

  // ═══════════════════════════════════════════════════════════
  // Physician Interaction Tracking
  // ═══════════════════════════════════════════════════════════
  const physicianTrackingRef = useRef(new TrackingEventManager());
  const pageLoadTimeRef = useRef<number>(Date.now());
  const rewriteInputFiredRef = useRef(false);
  // Pattern A: ensure page_view fires exactly once per session and view_change
  // skips the initial render (which is page_view's territory).
  const pageViewFiredRef = useRef(false);
  const previousViewRef = useRef<string | null>(null);

  const trackEvent = useCallback((eventType: string, elementId: string, metadata?: Record<string, any>) => {
    physicianTrackingRef.current.recordEvent({
      eventType,
      elementId,
      timestamp: new Date().toISOString(),
      metadata,
    } as TrackingEvent);

    // Pattern A: route a few legacy event names to the new doctor_behavior table.
    // Skip until selectedSpeaker is set so we never log "unknown" sessions.
    if (!selectedSpeaker) return;
    const speaker = selectedSpeaker;
    const file = (metadata as any)?.fileId || selectedPatient?.fileName || null;
    if (eventType === "patient_select") {
      trackDoctor(speaker, file, {
        event_type: "patient_select",
        target_type: "patient",
        target_id: file ?? undefined,
        metadata: metadata ?? {},
      });
    } else if (eventType === "topic_select") {
      const topicName = (metadata as any)?.topicName;
      trackDoctor(speaker, file, {
        event_type: "topic_select",
        target_type: "topic",
        target_id: topicName,
        metadata: metadata ?? {},
      });
    } else if (eventType === "sentence_select") {
      const idx = (metadata as any)?.sentenceIdx;
      trackDoctor(speaker, file, {
        event_type: "sentence_select",
        target_type: "sentence",
        target_id: idx != null ? String(idx) : undefined,
        metadata: metadata ?? {},
      });
    } else if (eventType === "rubric_modal_open") {
      trackDoctor(speaker, file, {
        event_type: "rubric_open",
        metadata: metadata ?? {},
      });
    } else if (eventType === "rubric_modal_close") {
      trackDoctor(speaker, file, {
        event_type: "rubric_close",
        metadata: metadata ?? {},
      });
    }
  }, [selectedSpeaker, selectedPatient]);

  // Flush events to backend
  useEffect(() => {
    const flushEvents = (useKeepalive: boolean = false) => {
      const events = physicianTrackingRef.current.getEvents();
      if (events.length === 0) return;
      const session = getOrCreateSession();
      const file = selectedPatient?.fileName || "physician_dashboard";
      sendTrackingEvents(
        session.sessionId,
        "physician",
        file,
        selectedSpeaker || "unknown",
        session.deviceType,
        events,
        useKeepalive,
        "",
      );
      physicianTrackingRef.current.clear();
    };

    const recordTimeSpent = () => {
      const durationMs = Date.now() - pageLoadTimeRef.current;
      if (durationMs < 1000) return;
      trackEvent("dwell_time", "page_total_time", { dwellTimeMs: durationMs, page: "physician_dashboard" });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        recordTimeSpent();
        flushEvents(true);
        pageLoadTimeRef.current = Date.now();
      }
    };

    const handleBeforeUnload = () => {
      recordTimeSpent();
      flushEvents(true);
      if (selectedSpeaker) {
        trackDoctor(selectedSpeaker, selectedPatient?.fileName || null, {
          event_type: "session_end",
          metadata: { view: currentView },
        });
      }
    };

    trackEvent("page_enter", "physician_dashboard");

    if (selectedSpeaker && !pageViewFiredRef.current) {
      pageViewFiredRef.current = true;
      trackDoctor(selectedSpeaker, selectedPatient?.fileName || null, {
        event_type: "page_view",
        metadata: { page: "physician_dashboard", view: currentView },
      });
    }

    // Pattern A: OnboardingTour dispatches "tour-open" whenever the tour
    // starts (auto on first visit OR via the Restart button) and "tour-end"
    // when it finishes (completed all steps OR skipped early). The detail
    // payload distinguishes the two cases.
    const handleTourOpen = (e: Event) => {
      if (!selectedSpeaker) return;
      const detail = (e as CustomEvent).detail || {};
      trackDoctor(selectedSpeaker, selectedPatient?.fileName || null, {
        event_type: "tour_open",
        metadata: { trigger: detail.trigger ?? "auto", view: detail.view ?? currentView },
      });
    };
    const handleTourEnd = (e: Event) => {
      if (!selectedSpeaker) return;
      const detail = (e as CustomEvent).detail || {};
      trackDoctor(selectedSpeaker, selectedPatient?.fileName || null, {
        event_type: "tour_end",
        metadata: { status: detail.status ?? "finished", view: detail.view ?? currentView },
      });
    };
    window.addEventListener("tour-open", handleTourOpen);
    window.addEventListener("tour-end", handleTourEnd);

    const periodicFlushTimer = setInterval(() => flushEvents(false), 10_000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(periodicFlushTimer);
      recordTimeSpent();
      flushEvents(true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("tour-open", handleTourOpen);
      window.removeEventListener("tour-end", handleTourEnd);
    };
  }, [selectedSpeaker, selectedPatient?.fileName, trackEvent, currentView]);

  // Pattern A: page-lifetime session — mount-only so re-renders triggered by
  // selectedPatient/currentView changes do not cause the session to restart.
  useEffect(() => {
    startSession();
    return () => endSession();
  }, []);

  // Track view changes — only on actual transitions (skip the initial render,
  // which page_view already covers).
  useEffect(() => {
    const prev = previousViewRef.current;
    previousViewRef.current = currentView;
    if (prev === null || prev === currentView) {
      // First render or no actual change — Pattern A view_change does NOT fire.
      // Legacy trackEvent still fires for backward-compat with the in-memory buffer.
      trackEvent("view_change", `${currentView}_view`, {
        view: currentView,
        ...(selectedPatient && { fileId: selectedPatient.fileName, overallScore: selectedPatient.overallScore }),
        ...(selectedTopic && { topicName: selectedTopic.name }),
      });
      rewriteInputFiredRef.current = false;
      return;
    }
    if (selectedSpeaker) {
      trackDoctor(selectedSpeaker, selectedPatient?.fileName || null, {
        event_type: "view_change",
        metadata: { from: prev, to: currentView },
      });
    }
    trackEvent("view_change", `${currentView}_view`, {
      view: currentView,
      ...(selectedPatient && { fileId: selectedPatient.fileName, overallScore: selectedPatient.overallScore }),
      ...(selectedTopic && { topicName: selectedTopic.name }),
    });
    rewriteInputFiredRef.current = false;
  }, [currentView, trackEvent]);

  // Track search (debounced) — moved after filteredPatients definition
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingSearchTrack = useRef<{ search: string } | null>(null);
  useEffect(() => {
    if (search !== "") pendingSearchTrack.current = { search };
  }, [search]);

  // Track score band filter — moved after filteredPatients definition
  const pendingScoreBandTrack = useRef<string | null>(null);
  useEffect(() => {
    if (scoreBand !== "ALL") pendingScoreBandTrack.current = scoreBand;
  }, [scoreBand]);

  // ═══════════════════════════════════════════════════════════
  // Store value sync
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (fileId) setSelectedFile(fileId);
  }, [fileId]);

  // NOTE: `doctorId` (?doctorid=doc1) is a doctor SCOPING key, not a transcript
  // speaker. The speaker is always auto-detected per file below, so we no longer
  // set selectedSpeaker = doctorId here.

  useEffect(() => {
    const init = async () => {
      // Scope the file list to the selected doctor; "auto"/absent = all doctors.
      const result = await fetchFiles(doctorId);
      // Build file→speaker map from API response
      if (result?.file_details?.length > 0) {
        const map: Record<string, string> = {};
        const dateMap: Record<string, string> = {};
        const visitMap: Record<string, number> = {};
        result.file_details.forEach(
          (fd: {
            file: string;
            speaker: string;
            processing_date?: string | null;
            visit_index?: number | null;
          }) => {
            map[fd.file] = fd.speaker;
            if (fd.processing_date) dateMap[fd.file] = fd.processing_date;
            if (fd.visit_index != null) visitMap[fd.file] = fd.visit_index;
          },
        );
        setFileSpeakerMap(map);
        setFileDateMap(dateMap);
        setFileVisitMap(visitMap);

        // Always auto-detect the transcript speaker from the first (scoped)
        // file — doctorId is a scoping key, not a speaker.
        const defaultSpeaker = result.file_details[0].speaker;
        setSelectedSpeaker(defaultSpeaker);
        fetchTrajectory(defaultSpeaker, doctorId);
      } else {
        // No files for this doctor — trajectory scoped to the doctor is empty.
        fetchTrajectory(undefined, doctorId);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════════════════════════
  // Re-fetch scores when returning to dashboard
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (
      currentView === "dashboard" &&
      selectedSpeaker &&
      files &&
      files.length > 0
    ) {
      fetchScoreAverage(undefined, undefined, undefined, doctorId);
      fetchRewriteStats(selectedSpeaker);
    }
  }, [currentView, selectedSpeaker]);

  // ═══════════════════════════════════════════════════════════
  // files → patients conversion (with numeric sorting)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (files && files.length > 0) {
      const patientList: PatientRow[] = files.map((fileName, idx) => {
        const match = fileName.match(/sid[- ]?(\d+)/i);
        // `id` is an INTERNAL key only (React key, tracking id, sort tiebreak) — it
        // must be unique per file, so keep the full de-id filename (extension
        // stripped). It is never rendered: the UI shows "Visit N" everywhere so the
        // doctor/date/patient hashes never surface.
        const id = match ? `SID-${match[1]}` : fileName.replace(/\.[^.]+$/, "");
        const visitIndex = fileVisitMap[fileName];

        return {
          id,
          // Server reconstructs the chronological visit order; the client shows it
          // as "Visit N" and never the hashed filename.
          name: visitIndex != null ? `Visit ${visitIndex}` : "Visit",
          fileName,
          processingDate: fileDateMap[fileName] ?? "",
          visitIndex,
          status: "completed",
          overallScore: 0,
          topics: {} as Record<TopicName, TopicData>,
        };
      });

      // Sort by SID number (numeric sort, not string sort)
      patientList.sort((a, b) => {
        const aMatch = a.id.match(/SID-(\d+)/i);
        const bMatch = b.id.match(/SID-(\d+)/i);
        const aNum = aMatch ? parseInt(aMatch[1], 10) : 0;
        const bNum = bMatch ? parseInt(bMatch[1], 10) : 0;
        return aNum - bNum;
      });

      setPatients(patientList);
      setLoading(false);
      console.log("Patients created from files (sorted):", patientList);

      // Fetch scores for all patients (no speaker filter — speakers vary per file)
      fetchScoreAverage(undefined, undefined, undefined);
    }
  }, [files, selectedSpeaker, fileDateMap, fileVisitMap]);

  // ═══════════════════════════════════════════════════════════
  // Auto-select patient when fileId is provided via URL (once only)
  // ═══════════════════════════════════════════════════════════
  const autoSelectDone = React.useRef(false);
  useEffect(() => {
    if (patients.length > 0 && selectedFile && !autoSelectDone.current) {
      const match = patients.find((p) => p.fileName === selectedFile);
      if (match) {
        setSelectedPatient(match);
        setCurrentView("grid");
        autoSelectDone.current = true;
      }
    }
  }, [patients, selectedFile]);

  // ═══════════════════════════════════════════════════════════
  // Update patients with real scores from scoreAverage
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!scoreAverage?.data) return;

    // TEMPORARY: Use placeholder random scores (1-5) instead of .pred_1 averages
    // Will be replaced by Guillermo's AI scoring sub-pipeline (Step 8)
    // The .pred_1 values are sentence relevance probabilities, NOT consultation quality scores.
    setPatients((prev) => {
      if (prev.length === 0) return prev;

      const updatedPatients = prev.map((patient) => {
        // Use scores directly from scoreAverage API (no frontend averaging)
        if (scoreAverage?.data) {
          const patientScores = scoreAverage.data
            .filter((d) => d.file === patient.fileName && d.avg_score !== null)
            .map((d) => d.avg_score as number);
          if (patientScores.length > 0) {
            const avg = patientScores.reduce((a, b) => a + b, 0) / patientScores.length;
            console.log(`[patientOverallScore] ${patient.fileName}: scores=${JSON.stringify(patientScores)}, avg=${avg}`);
            return { ...patient, overallScore: avg };
          }
        }
        console.log(`[patientOverallScore] ${patient.fileName}: no scores, defaulting to 0`);
        return { ...patient, overallScore: 0 };
      });

      // Only update if scores actually changed
      const hasChanges = updatedPatients.some(
        (p, idx) => p.overallScore !== prev[idx].overallScore,
      );

      if (hasChanges) {
        return updatedPatients;
      }
      return prev;
    });
  }, [scoreAverage]);

  // ═══════════════════════════════════════════════════════════
  // Patient selection → load sentences + scoreSummary
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (selectedPatient) {
      console.log(`Loading data for: ${selectedPatient.fileName}`);
      setSelectedFile(selectedPatient.fileName);

      // Use file-specific speaker from fileSpeakerMap (dynamic identification)
      const speaker = fileSpeakerMap[selectedPatient.fileName] || selectedSpeaker;
      if (speaker && speaker !== selectedSpeaker) {
        setSelectedSpeaker(speaker);
      }

      if (speaker) {
        fetchSentences(selectedPatient.fileName, speaker);
        fetchRewritesFiltered(selectedPatient.fileName, speaker);

        setScoreSummaryLoading(true);
        fetchScoreSummary(selectedPatient.fileName, speaker).finally(() =>
          setScoreSummaryLoading(false),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient, fileSpeakerMap]);

  // ═══════════════════════════════════════════════════════════
  // sentences → topics conversion + rewrites merge
  // ═══════════════════════════════════════════════════════════
  const topicsData: Record<TopicName, TopicData> = useMemo(() => {
    const result = {} as Record<TopicName, TopicData>;

    ALL_TOPICS.forEach((topic) => {
      result[topic] = {
        score: null,
        sentences: [],
        sentenceDetails: [],
      };
    });

    if (!sentences?.data || sentences.data.length === 0) {
      return result;
    }

    const rewriteMap = new Map<string, DoctorRewriteItem>();
    if (rewritesFiltered?.data) {
      rewritesFiltered.data.forEach((rw) => {
        const key = `${rw.i}-${rw.i2}-${rw.class}`;
        const existing = rewriteMap.get(key);
        if (!existing || new Date(rw.time) > new Date(existing.time)) {
          rewriteMap.set(key, rw);
        }
      });
    }

    sentences.data.forEach((item: DoctorSentenceItem) => {
      const topicName = CLASS_TO_TOPIC[item.class];
      if (!topicName) return;

      const key = `${item.i}-${item.i2}-${item.class}`;
      const rewrite = rewriteMap.get(key);

      const detail: SentenceDetail = {
        i: item.i,
        i2: item.i2,
        sentence: item.sentence,
        context: item.context,
        time: item.time,
        score: item.score,
        hasRewrite: !!rewrite,
        revisedSentence: rewrite?.revised_sentence,
        revisedScore: rewrite?.score,
        revisedTime: rewrite?.time,
      };

      result[topicName].sentenceDetails.push(detail);
      result[topicName].sentences.push(item.sentence);
    });

    if (scoreSummary?.by_class) {
      scoreSummary.by_class.forEach((item: any) => {
        const topicName = CLASS_TO_TOPIC[item.class];
        if (topicName && result[topicName]) {
          // A domain can have several by_class rows (one per treatment for
          // side-effect domains). Keep the MAX-score row — and take THAT row's
          // representative sentence — so the Grid's "Your Score" and its
          // Original Sentence match the per-domain MAX used by the rubric /
          // Patient Reports. (Was last-row-wins, which only agreed by luck of
          // row order.)
          const s = item.score ?? item.avg_score ?? null;
          const cur = result[topicName].score;
          if (s != null && (cur == null || s > cur)) {
            result[topicName].score = s;
            result[topicName].representativeI = item.i ?? null;
            result[topicName].representativeI2 = item.i2 ?? null;
            result[topicName].predScore = item.pred_score ?? null;
            result[topicName].representativeTreatment = item.treatment ?? null;
            console.log(`[topicsData] ${topicName}: max score=${s}, sentence="${(item.sentence || "").slice(0, 50)}..."`);
          }
        }
      });
    }

    console.log("[topicsData] Final:", result);
    return result;
  }, [sentences, rewritesFiltered, scoreSummary]);

  // Sync selectedSentenceIdx to API representative sentence when topic changes
  useEffect(() => {
    if (!selectedTopic?.name) return;
    const data = topicsData[selectedTopic.name];
    if (!data) return;
    const repI = (data as any).representativeI;
    const repI2 = (data as any).representativeI2;
    if (repI !== null && repI !== undefined && repI2 !== null && repI2 !== undefined) {
      const idx = data.sentenceDetails.findIndex((d) => d.i === repI && d.i2 === repI2);
      if (idx >= 0) {
        console.log(`[selectedSentenceIdx] Setting to representative: idx=${idx}, i=${repI}, i2=${repI2}`);
        setSelectedSentenceIdx(idx);
        return;
      }
    }
    setSelectedSentenceIdx(0);
  }, [selectedTopic, topicsData]);

  // ═══════════════════════════════════════════════════════════
  // Overall score calculation
  // ═══════════════════════════════════════════════════════════
  // Overall score — directly from scores/summary API (no frontend calculation)
  const overallScore = useMemo(() => {
    const apiScore = scoreSummary?.overall?.score ?? null;
    console.log(`[overallScore] From API: ${apiScore}`);
    return apiScore;
  }, [scoreSummary]);

  // ═══════════════════════════════════════════════════════════
  // Filtered Patients
  // ═══════════════════════════════════════════════════════════
  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Only show patients with AI scores (GPT-4o pipeline completed)
    let arr = patients.filter((p) => p.overallScore != null && p.overallScore > 0);
    if (scoreBand === "HIGH") arr = arr.filter((p) => p.overallScore >= 4);
    if (scoreBand === "STD")
      arr = arr.filter((p) => p.overallScore >= 3 && p.overallScore < 4);
    if (scoreBand === "LOW") arr = arr.filter((p) => p.overallScore < 3);
    if (q) {
      arr = arr.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.fileName.toLowerCase().includes(q),
      );
    }
    return arr;
  }, [patients, search, scoreBand]);

  // Deferred search tracking (needs filteredPatients to be defined)
  useEffect(() => {
    if (search === "" || !pendingSearchTrack.current) return;
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      trackEvent("search_input", "dashboard_search", { queryLength: search.length, resultCount: filteredPatients.length });
      pendingSearchTrack.current = null;
    }, 500);
    return () => clearTimeout(searchTimerRef.current);
  }, [search, filteredPatients.length, trackEvent]);

  // Deferred score band tracking (needs filteredPatients to be defined)
  useEffect(() => {
    if (scoreBand === "ALL" || !pendingScoreBandTrack.current) return;
    trackEvent("score_band_filter", `dashboard_filter_${scoreBand}`, { band: scoreBand, resultCount: filteredPatients.length });
    pendingScoreBandTrack.current = null;
  }, [scoreBand, filteredPatients.length, trackEvent]);

  // ═══════════════════════════════════════════════════════════
  // Loading & Error States
  // ═══════════════════════════════════════════════════════════
  if (loading && currentView === "dashboard") {
    return (
      <div
        className={cx(
          "max-w-7xl mx-auto p-8 min-h-screen",
          isDarkMode ? "bg-slate-900" : "bg-slate-50",
        )}
      >
        <div className="flex justify-center items-center h-64">
          <div
            className={cx(
              "text-lg font-medium flex items-center gap-3",
              isDarkMode ? "text-slate-400" : "text-slate-600",
            )}
          >
            <LoadingSpinner size="lg" isDarkMode={isDarkMode} />
            Loading physician communication reports...
          </div>
        </div>
      </div>
    );
  }

  if (
    apiError &&
    currentView === "dashboard" &&
    (!files || files.length === 0)
  ) {
    return (
      <div
        className={cx(
          "max-w-7xl mx-auto p-8 min-h-screen",
          isDarkMode ? "bg-slate-900" : "bg-slate-50",
        )}
      >
        <div
          className={cx(
            "border rounded-xl p-8 shadow-lg",
            isDarkMode
              ? "bg-red-900/50 border-red-700"
              : "bg-red-50 border-red-200",
          )}
        >
          <h2
            className={cx(
              "text-xl font-semibold mb-3",
              isDarkMode ? "text-red-100" : "text-red-900",
            )}
          >
            Error Loading Data
          </h2>
          <p
            className={cx("mb-6", isDarkMode ? "text-red-200" : "text-red-700")}
          >
            {apiError}
          </p>
          <button
            onClick={() => fetchFiles()}
            className={cx(
              "px-6 py-3 rounded-lg text-sm font-semibold",
              isDarkMode
                ? "bg-red-700 text-red-100 hover:bg-red-600"
                : "bg-red-600 text-white hover:bg-red-700",
            )}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Main Render
  // ═══════════════════════════════════════════════════════════
  return (
    <div
      className={cx(
        "max-w-7xl mx-auto p-8 min-h-screen",
        isDarkMode ? "bg-slate-900" : "bg-slate-50",
      )}
    >
      {/* COMPASS provider header */}
      <div className="mb-6">
        <h2
          className={cx(
            "text-lg font-semibold",
            isDarkMode ? "text-slate-100" : "text-slate-900",
          )}
        >
          COMPASS Provider Dashboard
        </h2>
        <p
          className={cx(
            "text-xs italic mt-0.5",
            isDarkMode ? "text-slate-400" : "text-slate-500",
          )}
        >
          <span className="font-semibold">Com</span>munication of{" "}
          <span className="font-semibold">P</span>rognosis,{" "}
          <span className="font-semibold">A</span>lternatives, and{" "}
          <span className="font-semibold">S</span>ide Effects for{" "}
          <span className="font-semibold">S</span>hared Decision Making
        </p>
      </div>

      {/* Floating Rubric Guide — always visible */}
      <RubricFloatingButton
        isDarkMode={isDarkMode}
        externalOpen={rubricOpen}
        externalTab={rubricTab}
        externalScore={rubricScore}
        onExternalHandled={handleRubricHandled}
        onTrackEvent={trackEvent}
      />

      {/* Onboarding Tour */}
      <OnboardingTour isDarkMode={isDarkMode} currentView={currentView} />
      <RestartTourButton isDarkMode={isDarkMode} />

      {currentView === "dashboard" && (
        <DashboardViewV2
          isDarkMode={isDarkMode}
          patients={patients}
          filteredPatients={filteredPatients}
          selectedSpeaker={selectedSpeaker}
          search={search}
          setSearch={setSearch}
          scoreBand={scoreBand}
          setScoreBand={setScoreBand}
          setSelectedPatient={(patient) => {
            trackEvent("patient_select", `dashboard_patient_${patient.id}`, { fileId: patient.fileName, overallScore: patient.overallScore });
            setSelectedPatient(patient);
            // Update URL with the minimized stem so the page is bookmarkable / shareable
            const url = new URL(window.location.href);
            url.searchParams.set("f", patient.fileName.replace(/\.(xlsx|csv)$/i, ""));
            url.searchParams.delete("fileid"); // drop any legacy param
            window.history.replaceState({}, "", url.toString());
          }}
          setCurrentView={setCurrentView}
          trajectoryData={trajectoryData?.trajectory}
          scoreAverageData={scoreAverage?.data}
          onOpenRubric={handleOpenRubric}
          onTrackEvent={trackEvent}
        />
      )}

      {currentView === "grid" && selectedPatient && (
        <GridView
          isDarkMode={isDarkMode}
          selectedPatient={selectedPatient}
          selectedSpeaker={selectedSpeaker}
          topicsData={topicsData}
          overallScore={overallScore}
          scoreSummaryLoading={scoreSummaryLoading}
          apiLoading={apiLoading}
          apiError={apiError}
          sentences={sentences}
          setCurrentView={(view) => {
            if (view === "dashboard") {
              trackEvent("button_click", "grid_back_to_dashboard", { patientId: selectedPatient.id });
              // Remove the patient stem from URL when returning to dashboard
              const url = new URL(window.location.href);
              url.searchParams.delete("f");
              url.searchParams.delete("fileid"); // legacy
              window.history.replaceState({}, "", url.toString());
            }
            setCurrentView(view);
          }}
          setSelectedPatient={setSelectedPatient}
          setSelectedTopic={(topic) => {
            if (topic) trackEvent("topic_select", `grid_topic_${topic.name}`, { topicName: topic.name });
            setSelectedTopic(topic);
          }}
          setSelectedSuggestion={setSelectedSuggestion}
          setSelectedSentenceIdx={setSelectedSentenceIdx}
          setShowRewrite={setShowRewrite}
          fetchSentences={fetchSentences}
          fetchRewritesFiltered={fetchRewritesFiltered}
          fetchScoreSummary={fetchScoreSummary}
          setScoreSummaryLoading={setScoreSummaryLoading}
          onOpenRubric={(domain, score) => {
            trackEvent("score_click", `grid_score_${domain}`, { topicName: domain, score });
            handleOpenRubric(domain, score);
          }}
        />
      )}

      {currentView === "detail" && selectedTopic && (
        <DetailView
          isDarkMode={isDarkMode}
          selectedTopic={selectedTopic}
          topicsData={topicsData}
          selectedSentenceIdx={selectedSentenceIdx}
          setSelectedSentenceIdx={(idx) => {
            trackEvent("sentence_select", `detail_sentence_${idx}`, { sentenceIdx: idx, topicName: selectedTopic.name });
            setSelectedSentenceIdx(idx);
          }}
          showRewrite={showRewrite}
          setShowRewrite={setShowRewrite}
          newSentence={newSentence}
          setNewSentence={(val) => {
            if (!rewriteInputFiredRef.current && val.length > 0) {
              trackEvent("rewrite_input", "detail_rewrite_textarea", { topicName: selectedTopic.name });
              rewriteInputFiredRef.current = true;
            }
            setNewSentence(val);
          }}
          selectedSuggestion={selectedSuggestion}
          setSelectedSuggestion={(suggestion) => {
            if (suggestion) trackEvent("suggestion_click", `detail_suggestion_${suggestion.targetScore}`, { topicName: selectedTopic.name, targetScore: suggestion.targetScore });
            setSelectedSuggestion(suggestion);
          }}
          saveStatus={saveStatus}
          setSaveStatus={setSaveStatus}
          rescoring={rescoring}
          setRescoring={setRescoring}
          selectedFile={selectedFile}
          selectedSpeaker={selectedSpeaker}
          scoreSentence={async (...args) => {
            trackEvent("rewrite_score_click", "detail_try_score", { topicName: selectedTopic.name });
            const result = await scoreSentence(...args);
            if (result) trackEvent("rewrite_score_result", "detail_score_result", { topicName: selectedTopic.name, newScore: result });
            return result;
          }}
          saveRewriteWithTimestamp={saveRewriteWithTimestamp}
          fetchRewritesFiltered={fetchRewritesFiltered}
          fetchScoreSummary={fetchScoreSummary}
          setScoreSummaryLoading={setScoreSummaryLoading}
          setCurrentView={(view) => {
            if (view === "grid") trackEvent("button_click", "detail_back_to_grid", { topicName: selectedTopic.name });
            setCurrentView(view);
          }}
          setSelectedTopic={setSelectedTopic}
          // History props
          fetchRewriteHistory={fetchRewriteHistory}
          rewriteHistory={rewriteHistory}
          clearRewriteHistory={clearRewriteHistory}
          // NEW: AI Rewrite props
          generateAIRewrite={async (...args) => {
            trackEvent("ai_rewrite_generate", "detail_ai_rewrite_generate", { topicName: selectedTopic.name });
            const result = await generateAIRewrite(...args);
            trackEvent("ai_rewrite_result", "detail_ai_rewrite_result", { topicName: selectedTopic.name, success: !!result });
            return result;
          }}
          aiRewriteLoading={aiRewriteLoading}
          // Topic trajectory: all patients' per-topic scores
          scoreAverageData={scoreAverage?.data}
          patients={patients}
          fetchScoreAverage={fetchScoreAverage}
          // Rewrite usage stats (B-5 feedback)
          rewriteStats={rewriteStats}
          fetchRewriteStats={fetchRewriteStats}
          onOpenRubric={(domain, score) => {
            trackEvent("score_click", `detail_rubric_score_${score}`, { topicName: domain, score });
            handleOpenRubric(domain, score);
          }}
        />
      )}
    </div>
  );
};

export default PhysicianReports;
