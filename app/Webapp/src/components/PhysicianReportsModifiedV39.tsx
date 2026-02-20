// PhysicianReports.tsx
// Fully Redesigned Version - Innovative Visualization/UX
//
// Features:
// 1. Patient table with search and score filtering
// 2. Radar chart for comparing all 5 topics
// 3. Slide panel for detail view (z-index: 50)
// 4. History modal on top (z-index: 60)
// 5. Lucide React icons (no emojis)

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart3,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Search,
  ChevronRight,
  X,
  History,
  Eye,
  EyeOff,
  Save,
  Loader2,
  User,
  FileSpreadsheet,
  TrendingUp,
  MessageSquare,
  RefreshCw,
  Clock,
  Target,
  Heart,
  Droplets,
  Zap,
  Activity,
  Users,
  ArrowRight,
} from "lucide-react";
import ConsultationScoringV8 from "./ConsultationScoringV8";
import TopicRadarChart from "./TopicRadarChart";
import HistoryModal from "./HistoryModal";
import {
  useDoctorData,
  DoctorSentenceItem,
  DoctorRewriteItem,
} from "@/hooks/useDoctorData";
import { useFileId } from "@/stores/useFileId";
import { useDoctorId } from "@/stores/useDoctorId";

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════
type TopicName =
  | "Cancer Prognosis"
  | "Life Expectancy"
  | "Erectile Dysfunction"
  | "Urinary Incontinence"
  | "Irritative Symptoms";

type ScoreBand = "ALL" | "HIGH" | "STD" | "LOW";

interface SentenceDetail {
  i: number;
  i2: number;
  sentence: string;
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
}

interface PatientRow {
  id: string;
  name: string;
  fileName: string;
  consultationDate: string;
  overallScore: number;
  topics: Record<TopicName, TopicData>;
}

interface PhysicianReportsProps {
  isDarkMode?: boolean;
}

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════
const CLASS_TO_TOPIC: Record<string, TopicName> = {
  "1": "Cancer Prognosis",
  "2": "Life Expectancy",
  "3": "Erectile Dysfunction",
  "4": "Urinary Incontinence",
  "5": "Irritative Symptoms",
};

const TOPIC_TO_CLASS: Record<TopicName, string> = {
  "Cancer Prognosis": "1",
  "Life Expectancy": "2",
  "Erectile Dysfunction": "3",
  "Urinary Incontinence": "4",
  "Irritative Symptoms": "5",
};

const ALL_TOPICS: TopicName[] = [
  "Cancer Prognosis",
  "Life Expectancy",
  "Erectile Dysfunction",
  "Urinary Incontinence",
  "Irritative Symptoms",
];

const TOPIC_DESCRIPTIONS: Record<TopicName, string> = {
  "Cancer Prognosis":
    "Communication about cancer outcomes and treatment results",
  "Life Expectancy":
    "Explanation of life expectancy and competing mortality risks",
  "Erectile Dysfunction": "Information about erectile dysfunction risks",
  "Urinary Incontinence": "Explanation of urinary incontinence possibilities",
  "Irritative Symptoms": "Guidance on irritative symptoms and side effects",
};

const SCORE_BAND_CONFIG: Record<
  ScoreBand,
  { label: string; filter: (score: number) => boolean }
> = {
  ALL: { label: "All", filter: () => true },
  HIGH: { label: "High (4-5)", filter: (s) => s >= 4 },
  STD: { label: "Standard (3)", filter: (s) => s >= 3 && s < 4 },
  LOW: { label: "Needs Work (0-2)", filter: (s) => s < 3 },
};

// ═══════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════
const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const formatScore = (score: number | null): string => {
  if (score === null || score === undefined) return "N/A";
  return score.toFixed(1);
};

const getScoreLabel = (score: number | null): string => {
  if (score === null) return "Not Available";
  const labels: Record<number, string> = {
    0: "No mention",
    1: "Name Only",
    2: "Generalization",
    3: "Imprecise Quantification",
    4: "Specific Quantification",
    5: "Patient-centered Estimate",
  };
  return labels[Math.round(score)] || "Unknown";
};

const getScoreBadgeClass = (
  score: number | null,
  isDarkMode: boolean
): string => {
  if (score === null) {
    return isDarkMode
      ? "bg-slate-600 text-slate-300"
      : "bg-slate-400 text-white";
  }
  const roundedScore = Math.round(score);
  const classes: Record<number, string> = {
    0: isDarkMode ? "bg-slate-600 text-slate-300" : "bg-slate-400 text-white",
    1: isDarkMode ? "bg-red-600 text-red-100" : "bg-red-500 text-white",
    2: isDarkMode ? "bg-pink-600 text-pink-100" : "bg-pink-500 text-white",
    3: isDarkMode
      ? "bg-yellow-600 text-yellow-100"
      : "bg-yellow-500 text-white",
    4: isDarkMode ? "bg-green-600 text-green-100" : "bg-green-500 text-white",
    5: isDarkMode
      ? "bg-emerald-600 text-emerald-100"
      : "bg-emerald-500 text-white",
  };
  return classes[roundedScore] || classes[0];
};

const getTopicIcon = (topic: TopicName) => {
  const icons: Record<TopicName, React.ReactNode> = {
    "Cancer Prognosis": <Target className="w-4 h-4" />,
    "Life Expectancy": <Clock className="w-4 h-4" />,
    "Erectile Dysfunction": <Heart className="w-4 h-4" />,
    "Urinary Incontinence": <Droplets className="w-4 h-4" />,
    "Irritative Symptoms": <Zap className="w-4 h-4" />,
  };
  return icons[topic];
};

// ═══════════════════════════════════════════════════════════
// Sub Components
// ═══════════════════════════════════════════════════════════

// Loading Spinner
const LoadingSpinner: React.FC<{
  size?: "sm" | "md" | "lg";
  isDarkMode: boolean;
}> = ({ size = "sm", isDarkMode }) => {
  const sizeClasses = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" };
  return (
    <Loader2
      className={cx(
        sizeClasses[size],
        "animate-spin",
        isDarkMode ? "text-cyan-400" : "text-cyan-600"
      )}
    />
  );
};

// Progress Bar
const ProgressBar: React.FC<{
  value: number;
  max: number;
  label: string;
  isDarkMode: boolean;
}> = ({ value, max, label, isDarkMode }) => {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className={isDarkMode ? "text-slate-400" : "text-slate-600"}>
          {label}
        </span>
        <span className={isDarkMode ? "text-slate-300" : "text-slate-700"}>
          {value}/{max} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div
        className={`h-2 rounded-full ${
          isDarkMode ? "bg-slate-700" : "bg-slate-200"
        }`}
      >
        <div
          className="h-full rounded-full transition-all duration-500 bg-emerald-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

// Summary Stat Card
const SummaryCard: React.FC<{
  title: string;
  count: number;
  icon: React.ReactNode;
  color: "cyan" | "emerald" | "yellow" | "red";
  isActive: boolean;
  onClick: () => void;
  isDarkMode: boolean;
}> = ({ title, count, icon, color, isActive, onClick, isDarkMode }) => {
  const colorConfig = {
    cyan: {
      bg: isDarkMode ? "from-slate-800 to-slate-900" : "from-white to-slate-50",
      border: isDarkMode ? "border-slate-700" : "border-slate-200",
      activeBorder: "border-cyan-500",
      activeRing: "ring-cyan-500/30",
      iconBg: isDarkMode ? "bg-cyan-900/50" : "bg-cyan-100",
      iconColor: isDarkMode ? "text-cyan-400" : "text-cyan-600",
      text: isDarkMode ? "text-cyan-400" : "text-cyan-600",
      count: isDarkMode ? "text-slate-100" : "text-slate-900",
    },
    emerald: {
      bg: isDarkMode
        ? "from-emerald-900/30 to-emerald-950/30"
        : "from-emerald-50 to-emerald-100/50",
      border: isDarkMode ? "border-emerald-800" : "border-emerald-200",
      activeBorder: "border-emerald-500",
      activeRing: "ring-emerald-500/30",
      iconBg: isDarkMode ? "bg-emerald-900/50" : "bg-emerald-100",
      iconColor: isDarkMode ? "text-emerald-400" : "text-emerald-600",
      text: isDarkMode ? "text-emerald-400" : "text-emerald-600",
      count: isDarkMode ? "text-emerald-100" : "text-emerald-900",
    },
    yellow: {
      bg: isDarkMode
        ? "from-yellow-900/30 to-yellow-950/30"
        : "from-yellow-50 to-yellow-100/50",
      border: isDarkMode ? "border-yellow-800" : "border-yellow-200",
      activeBorder: "border-yellow-500",
      activeRing: "ring-yellow-500/30",
      iconBg: isDarkMode ? "bg-yellow-900/50" : "bg-yellow-100",
      iconColor: isDarkMode ? "text-yellow-400" : "text-yellow-600",
      text: isDarkMode ? "text-yellow-400" : "text-yellow-600",
      count: isDarkMode ? "text-yellow-100" : "text-yellow-900",
    },
    red: {
      bg: isDarkMode
        ? "from-red-900/30 to-red-950/30"
        : "from-red-50 to-red-100/50",
      border: isDarkMode ? "border-red-800" : "border-red-200",
      activeBorder: "border-red-500",
      activeRing: "ring-red-500/30",
      iconBg: isDarkMode ? "bg-red-900/50" : "bg-red-100",
      iconColor: isDarkMode ? "text-red-400" : "text-red-600",
      text: isDarkMode ? "text-red-400" : "text-red-600",
      count: isDarkMode ? "text-red-100" : "text-red-900",
    },
  };

  const c = colorConfig[color];

  return (
    <button
      onClick={onClick}
      className={cx(
        "p-4 rounded-xl border bg-gradient-to-br transition-all duration-200 text-left w-full",
        c.bg,
        isActive ? `${c.activeBorder} ring-2 ${c.activeRing}` : c.border,
        "hover:scale-[1.02]"
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <div
            className={`text-xs font-semibold uppercase tracking-wider mb-1 ${c.text}`}
          >
            {title}
          </div>
          <div className={`text-2xl font-bold ${c.count}`}>{count}</div>
        </div>
        <div className={`p-2 rounded-lg ${c.iconBg} ${c.iconColor}`}>
          {icon}
        </div>
      </div>
    </button>
  );
};

// Score Band Filter Pills
const ScoreBandFilter: React.FC<{
  value: ScoreBand;
  onChange: (band: ScoreBand) => void;
  isDarkMode: boolean;
}> = ({ value, onChange, isDarkMode }) => {
  const bands: ScoreBand[] = ["ALL", "HIGH", "STD", "LOW"];

  return (
    <div
      className={cx(
        "inline-flex rounded-lg p-1",
        isDarkMode ? "bg-slate-800" : "bg-slate-100"
      )}
    >
      {bands.map((band) => (
        <button
          key={band}
          onClick={() => onChange(band)}
          className={cx(
            "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
            value === band
              ? isDarkMode
                ? "bg-cyan-600 text-white"
                : "bg-cyan-500 text-white"
              : isDarkMode
              ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
          )}
        >
          {SCORE_BAND_CONFIG[band].label}
        </button>
      ))}
    </div>
  );
};

// Patient Table Component
const PatientTable: React.FC<{
  patients: PatientRow[];
  selectedPatient: PatientRow | null;
  onSelect: (patient: PatientRow) => void;
  isDarkMode: boolean;
  loading: boolean;
  scoreBand: ScoreBand;
  onScoreBandChange: (band: ScoreBand) => void;
  search: string;
  onSearchChange: (s: string) => void;
  patientScores: Map<string, number>;
}> = ({
  patients,
  selectedPatient,
  onSelect,
  isDarkMode,
  loading,
  scoreBand,
  onScoreBandChange,
  search,
  onSearchChange,
  patientScores,
}) => {
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return patients
      .filter((p) => {
        const score = patientScores.get(p.fileName);
        // If score not loaded yet and filter is ALL, include it
        if (score === undefined) return scoreBand === "ALL";
        return SCORE_BAND_CONFIG[scoreBand].filter(score);
      })
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.fileName.toLowerCase().includes(q)
      );
  }, [patients, search, scoreBand, patientScores]);

  const colors = {
    cardBg: isDarkMode ? "bg-slate-900" : "bg-white",
    border: isDarkMode ? "border-slate-800" : "border-slate-200",
    headerBg: isDarkMode ? "bg-slate-800" : "bg-slate-50",
    title: isDarkMode ? "text-slate-100" : "text-slate-900",
    subtitle: isDarkMode ? "text-slate-400" : "text-slate-600",
    rowHover: isDarkMode ? "hover:bg-slate-800" : "hover:bg-slate-50",
    rowSelected: isDarkMode ? "bg-cyan-900/30" : "bg-cyan-50",
  };

  return (
    <div
      className={`${colors.cardBg} rounded-2xl border ${colors.border} overflow-hidden`}
    >
      {/* Header */}
      <div className={`px-6 py-4 border-b ${colors.border} ${colors.headerBg}`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users
              className={`w-5 h-5 ${
                isDarkMode ? "text-cyan-400" : "text-cyan-600"
              }`}
            />
            <h2 className={`text-lg font-semibold ${colors.title}`}>
              Patient Reports
            </h2>
            <span className={`text-sm ${colors.subtitle}`}>
              ({filtered.length})
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative">
              <Search
                className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}
              />
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search patients..."
                className={cx(
                  "pl-9 pr-4 py-2 rounded-lg border text-sm w-full sm:w-64",
                  isDarkMode
                    ? "bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500"
                    : "bg-white border-slate-200 text-slate-800 placeholder-slate-400"
                )}
              />
            </div>
            {/* Filter Pills */}
            <ScoreBandFilter
              value={scoreBand}
              onChange={onScoreBandChange}
              isDarkMode={isDarkMode}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-80">
        <table className="w-full">
          <thead
            className={`border-b ${colors.border} ${colors.headerBg} sticky top-0`}
          >
            <tr>
              <th
                className={`px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider ${colors.subtitle}`}
              >
                Patient
              </th>
              <th
                className={`px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider ${colors.subtitle}`}
              >
                File
              </th>
              <th
                className={`px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider ${colors.subtitle}`}
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y ${colors.border}`}>
            {filtered.length > 0 ? (
              filtered.map((patient) => (
                <tr
                  key={patient.id}
                  className={cx(
                    "transition-colors cursor-pointer",
                    selectedPatient?.id === patient.id
                      ? colors.rowSelected
                      : colors.rowHover
                  )}
                  onClick={() => onSelect(patient)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={cx(
                          "w-8 h-8 rounded-full flex items-center justify-center",
                          isDarkMode ? "bg-slate-700" : "bg-slate-100"
                        )}
                      >
                        <User
                          className={`w-4 h-4 ${
                            isDarkMode ? "text-slate-400" : "text-slate-500"
                          }`}
                        />
                      </div>
                      <div>
                        <div className={`font-medium ${colors.title}`}>
                          {patient.name}
                        </div>
                        <div className={`text-xs ${colors.subtitle}`}>
                          {patient.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className={`w-4 h-4 ${colors.subtitle}`} />
                      <span className={`text-sm ${colors.subtitle}`}>
                        {patient.fileName}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(patient);
                      }}
                      className={cx(
                        "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        selectedPatient?.id === patient.id
                          ? isDarkMode
                            ? "bg-cyan-600 text-white"
                            : "bg-cyan-500 text-white"
                          : isDarkMode
                          ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      )}
                    >
                      {selectedPatient?.id === patient.id ? "Selected" : "View"}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center">
                  <div className={`text-sm ${colors.subtitle}`}>
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <LoadingSpinner isDarkMode={isDarkMode} />
                        Loading patients...
                      </div>
                    ) : (
                      "No patients found"
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Topic Detail Slide Panel (z-index: 50)
const TopicDetailPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  topic: TopicName | null;
  topicData: TopicData | null;
  isDarkMode: boolean;
  selectedSentenceIdx: number;
  setSelectedSentenceIdx: (idx: number) => void;
  showRewrite: boolean;
  setShowRewrite: (show: boolean) => void;
  newSentence: string;
  setNewSentence: (s: string) => void;
  onScorePreview: () => void;
  onSaveRewrite: () => void;
  previewScore: number | null;
  saveStatus: { status: string; message: string };
  rescoring: boolean;
  onViewHistory: () => void;
  isHistoryOpen: boolean;
  onClearPreview: () => void;
}> = ({
  isOpen,
  onClose,
  topic,
  topicData,
  isDarkMode,
  selectedSentenceIdx,
  setSelectedSentenceIdx,
  showRewrite,
  setShowRewrite,
  newSentence,
  setNewSentence,
  onScorePreview,
  onSaveRewrite,
  previewScore,
  saveStatus,
  rescoring,
  onViewHistory,
  isHistoryOpen,
  onClearPreview,
}) => {
  if (!topic || !topicData) return null;

  const currentSentence = topicData.sentenceDetails[selectedSentenceIdx];
  const description = TOPIC_DESCRIPTIONS[topic];

  const colors = {
    bg: isDarkMode ? "bg-slate-900" : "bg-white",
    border: isDarkMode ? "border-slate-700" : "border-slate-200",
    title: isDarkMode ? "text-slate-100" : "text-slate-900",
    subtitle: isDarkMode ? "text-slate-400" : "text-slate-600",
    cardBg: isDarkMode ? "bg-slate-800" : "bg-slate-50",
  };

  return (
    <>
      {/* Backdrop - z-index: 40 */}
      <div
        className={cx(
          "fixed inset-0 z-40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          isDarkMode ? "bg-black/60" : "bg-black/40"
        )}
        onClick={onClose}
      />

      {/* Panel - z-index changes based on history modal state */}
      <div
        className={cx(
          "fixed top-0 h-full w-full max-w-4xl shadow-2xl transition-all duration-300 ease-in-out",
          isOpen ? "right-0" : "right-[-100%]",
          isHistoryOpen ? "z-40" : "z-50",
          colors.bg
        )}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b ${colors.border} flex items-center justify-between`}
        >
          <div className="flex items-center gap-3">
            <div
              className={cx(
                "p-2 rounded-lg",
                isDarkMode ? "bg-cyan-900/50" : "bg-cyan-100"
              )}
            >
              {getTopicIcon(topic)}
            </div>
            <div>
              <h2 className={`text-xl font-bold ${colors.title}`}>{topic}</h2>
              <p className={`text-sm ${colors.subtitle}`}>{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={cx(
              "p-2 rounded-lg transition-colors",
              isDarkMode
                ? "hover:bg-slate-800 text-slate-400"
                : "hover:bg-slate-100 text-slate-500"
            )}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 h-[calc(100%-80px)] overflow-y-auto space-y-6">
          {/* Score Overview */}
          <div
            className={`p-4 rounded-xl ${colors.cardBg} border ${colors.border}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm ${colors.subtitle}`}>
                  Current Score
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span
                    className={`text-3xl font-bold px-3 py-1 rounded-lg ${getScoreBadgeClass(
                      topicData.score,
                      isDarkMode
                    )}`}
                  >
                    {formatScore(topicData.score)}
                  </span>
                  <span className={`text-sm ${colors.subtitle}`}>
                    {getScoreLabel(topicData.score)}
                  </span>
                </div>
              </div>
              <div className={`text-right ${colors.subtitle}`}>
                <div className="text-2xl font-light">
                  {topicData.sentenceDetails.length}
                </div>
                <div className="text-xs">sentences</div>
              </div>
            </div>
          </div>

          {/* Consultation Scoring Visualization */}
          <ConsultationScoringV8
            isDarkMode={isDarkMode}
            sentences={topicData.sentenceDetails.map((d) => ({
              sentence: d.sentence,
              hasRewrite: d.hasRewrite,
              revisedSentence: d.revisedSentence,
              score: d.score,
              revisedScore: d.revisedScore,
            }))}
            highlightPosition={topicData.score ?? 0}
            leftLabel={topic}
            selectedIdx={selectedSentenceIdx}
            onSentenceClick={setSelectedSentenceIdx}
          />

          {/* Rewrite Section */}
          <div
            className={`p-4 rounded-xl ${colors.cardBg} border ${colors.border}`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-semibold ${colors.title}`}>
                Rewrite Sentence
              </h3>
              <div className="flex gap-2">
                {currentSentence?.hasRewrite && (
                  <button
                    onClick={onViewHistory}
                    className={cx(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      isDarkMode
                        ? "bg-purple-900/50 text-purple-300 hover:bg-purple-900/70"
                        : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                    )}
                  >
                    <History className="w-3.5 h-3.5" />
                    History
                  </button>
                )}
                <button
                  onClick={() => setShowRewrite(!showRewrite)}
                  className={cx(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    isDarkMode
                      ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  )}
                >
                  {showRewrite ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  {showRewrite ? "Hide" : "Show"} Editor
                </button>
              </div>
            </div>

            {showRewrite && currentSentence && (
              <div className="space-y-4">
                {/* Original */}
                <div>
                  <div
                    className={`text-xs font-medium mb-1 ${colors.subtitle}`}
                  >
                    Original (Score: {currentSentence.score ?? "N/A"})
                  </div>
                  <div
                    className={cx(
                      "p-3 rounded-lg text-sm",
                      isDarkMode
                        ? "bg-slate-700 text-slate-300"
                        : "bg-slate-100 text-slate-700"
                    )}
                  >
                    "{currentSentence.sentence}"
                  </div>
                </div>

                {/* Current Rewrite (if exists) */}
                {currentSentence.hasRewrite && (
                  <div>
                    <div
                      className={`text-xs font-medium mb-1 flex items-center gap-1 ${
                        isDarkMode ? "text-emerald-400" : "text-emerald-600"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Current Rewrite (Score: {currentSentence.revisedScore})
                    </div>
                    <div
                      className={cx(
                        "p-3 rounded-lg text-sm",
                        isDarkMode
                          ? "bg-emerald-900/30 text-emerald-300"
                          : "bg-emerald-50 text-emerald-700"
                      )}
                    >
                      "{currentSentence.revisedSentence}"
                    </div>
                  </div>
                )}

                {/* New Rewrite Input */}
                <div>
                  <div
                    className={`text-xs font-medium mb-1 ${colors.subtitle}`}
                  >
                    Your Revised Sentence
                  </div>
                  <textarea
                    value={newSentence}
                    onChange={(e) => {
                      setNewSentence(e.target.value);
                      onClearPreview();
                    }}
                    placeholder="Enter an improved version..."
                    rows={3}
                    className={cx(
                      "w-full p-3 rounded-lg border text-sm resize-none",
                      isDarkMode
                        ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500"
                        : "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
                    )}
                  />
                </div>

                {/* Preview Score Display */}
                {previewScore !== null && (
                  <div
                    className={cx(
                      "p-4 rounded-lg border-2 border-dashed",
                      isDarkMode
                        ? "bg-cyan-900/20 border-cyan-700"
                        : "bg-cyan-50 border-cyan-300"
                    )}
                  >
                    <div
                      className={`text-xs font-medium mb-2 ${colors.subtitle}`}
                    >
                      Preview Score
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-2xl font-bold px-3 py-1 rounded-lg ${getScoreBadgeClass(
                          previewScore,
                          isDarkMode
                        )}`}
                      >
                        {previewScore.toFixed(1)}
                      </span>
                      <span className={`text-sm ${colors.subtitle}`}>
                        {getScoreLabel(previewScore)}
                      </span>
                    </div>
                    <p className={`text-xs mt-2 ${colors.subtitle}`}>
                      If satisfied, click "Save" to store this rewrite.
                    </p>
                  </div>
                )}

                {/* Status Message */}
                {saveStatus.message && (
                  <div
                    className={cx(
                      "p-3 rounded-lg text-sm flex items-center gap-2",
                      saveStatus.status === "success"
                        ? isDarkMode
                          ? "bg-emerald-900/50 text-emerald-300"
                          : "bg-emerald-100 text-emerald-700"
                        : saveStatus.status === "error"
                        ? isDarkMode
                          ? "bg-red-900/50 text-red-300"
                          : "bg-red-100 text-red-700"
                        : isDarkMode
                        ? "bg-slate-700 text-slate-300"
                        : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {saveStatus.status === "success" && (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    {saveStatus.status === "error" && (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                    {saveStatus.status === "saving" && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    {saveStatus.message}
                  </div>
                )}

                {/* Two-step buttons: Score first, then Save */}
                <div className="flex gap-3">
                  {/* Score Button */}
                  <button
                    onClick={onScorePreview}
                    disabled={
                      !newSentence.trim() || rescoring || previewScore !== null
                    }
                    className={cx(
                      "flex-1 py-3 rounded-lg font-semibold transition-all inline-flex items-center justify-center gap-2",
                      !newSentence.trim() || rescoring || previewScore !== null
                        ? isDarkMode
                          ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : isDarkMode
                        ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500"
                        : "bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600"
                    )}
                  >
                    {rescoring ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : previewScore !== null ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Scored
                      </>
                    ) : (
                      <>
                        <BarChart3 className="w-4 h-4" />
                        Score
                      </>
                    )}
                  </button>

                  {/* Save Button */}
                  <button
                    onClick={onSaveRewrite}
                    disabled={
                      previewScore === null || saveStatus.status === "saving"
                    }
                    className={cx(
                      "flex-1 py-3 rounded-lg font-semibold transition-all inline-flex items-center justify-center gap-2",
                      previewScore === null || saveStatus.status === "saving"
                        ? isDarkMode
                          ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : isDarkMode
                        ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500"
                        : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600"
                    )}
                  >
                    {saveStatus.status === "saving" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {!showRewrite && (
              <p className={`text-sm ${colors.subtitle}`}>
                Click "Show Editor" to rewrite the selected sentence and improve
                the score.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════
const PhysicianReports: React.FC<PhysicianReportsProps> = ({
  isDarkMode = false,
}) => {
  // Store
  const { fileId } = useFileId();
  const { doctorId } = useDoctorId();

  // API Hook
  const {
    files,
    sentences,
    rewritesFiltered,
    scoreSummary,
    rewriteHistory,
    loading: apiLoading,
    error: apiError,
    fetchFiles,
    fetchSentences,
    fetchRewritesFiltered,
    fetchScoreSummary,
    saveRewriteWithTimestamp,
    scoreSentence,
    fetchRewriteHistory,
    clearRewriteHistory,
  } = useDoctorData();

  // State
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("");
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(
    null
  );
  const [selectedTopic, setSelectedTopic] = useState<TopicName | null>(null);
  const [selectedSentenceIdx, setSelectedSentenceIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scoreSummaryLoading, setScoreSummaryLoading] = useState(false);

  // Filtering state
  const [search, setSearch] = useState("");
  const [scoreBand, setScoreBand] = useState<ScoreBand>("ALL");

  // Rewrite state
  const [showRewrite, setShowRewrite] = useState(false);
  const [newSentence, setNewSentence] = useState("");
  const [rescoring, setRescoring] = useState(false);
  const [previewScore, setPreviewScore] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    status: string;
    message: string;
  }>({
    status: "idle",
    message: "",
  });

  // History modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Patient scores cache - stores overallScore for each patient by fileName
  const [patientScores, setPatientScores] = useState<Map<string, number>>(
    new Map()
  );

  // Store sync
  useEffect(() => {
    if (fileId) setSelectedFile(fileId);
  }, [fileId]);

  useEffect(() => {
    if (doctorId) setSelectedSpeaker(doctorId);
  }, [doctorId]);

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    if (!selectedSpeaker && !doctorId) {
      setSelectedSpeaker("Interviewer:");
    }
  }, [selectedSpeaker, doctorId]);

  // Files → Patients
  useEffect(() => {
    if (files && files.length > 0) {
      const patientList: PatientRow[] = files.map((fileName, idx) => {
        const match = fileName.match(/sid-(\d+)/i);
        const id = match
          ? `SID-${match[1]}`
          : `P${String(idx + 1).padStart(3, "0")}`;
        return {
          id,
          name: `Patient ${id}`,
          fileName,
          consultationDate: new Date().toISOString().split("T")[0],
          overallScore: 0,
          topics: {} as Record<TopicName, TopicData>,
        };
      });

      patientList.sort((a, b) => {
        const aMatch = a.id.match(/SID-(\d+)/i);
        const bMatch = b.id.match(/SID-(\d+)/i);
        return (
          (aMatch ? parseInt(aMatch[1], 10) : 0) -
          (bMatch ? parseInt(bMatch[1], 10) : 0)
        );
      });

      setPatients(patientList);
      setLoading(false);
    }
  }, [files]);

  // Patient selection → Load data
  useEffect(() => {
    if (selectedPatient && selectedSpeaker) {
      setSelectedFile(selectedPatient.fileName);
      fetchSentences(selectedPatient.fileName, selectedSpeaker);
      fetchRewritesFiltered(selectedPatient.fileName, selectedSpeaker);
      setScoreSummaryLoading(true);
      fetchScoreSummary(selectedPatient.fileName, selectedSpeaker).finally(() =>
        setScoreSummaryLoading(false)
      );
      setSelectedTopic(null);
      setSelectedSentenceIdx(0);
      setShowRewrite(false);
      setNewSentence("");
    }
  }, [selectedPatient, selectedSpeaker]);

  // Update patientScores when scoreSummary is loaded
  useEffect(() => {
    if (selectedPatient && scoreSummary?.overall?.avg_score !== undefined) {
      setPatientScores((prev) => {
        const newMap = new Map(prev);
        newMap.set(selectedPatient.fileName, scoreSummary.overall.avg_score);
        return newMap;
      });
    }
  }, [selectedPatient, scoreSummary]);

  // Build topics data
  const topicsData: Record<TopicName, TopicData> = useMemo(() => {
    const result = {} as Record<TopicName, TopicData>;
    ALL_TOPICS.forEach((topic) => {
      result[topic] = { score: null, sentences: [], sentenceDetails: [] };
    });

    if (!sentences?.data || sentences.data.length === 0) return result;

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

      result[topicName].sentenceDetails.push({
        i: item.i,
        i2: item.i2,
        sentence: item.sentence,
        time: item.time,
        score: item.score,
        hasRewrite: !!rewrite,
        revisedSentence: rewrite?.revised_sentence,
        revisedScore: rewrite?.score,
        revisedTime: rewrite?.time,
      });
      result[topicName].sentences.push(item.sentence);
    });

    if (scoreSummary?.by_class) {
      scoreSummary.by_class.forEach((item) => {
        const topicName = CLASS_TO_TOPIC[item.class];
        if (topicName && result[topicName]) {
          result[topicName].score = item.avg_score;
        }
      });
    }

    return result;
  }, [sentences, rewritesFiltered, scoreSummary]);

  // Overall score
  const overallScore = useMemo(() => {
    return scoreSummary?.overall?.avg_score ?? null;
  }, [scoreSummary]);

  // Summary stats - based on patientScores cache
  const summaryStats = useMemo(() => {
    const total = patients.length;
    let high = 0;
    let std = 0;
    let low = 0;
    let unknown = 0;

    patients.forEach((p) => {
      const score = patientScores.get(p.fileName);
      if (score === undefined) {
        unknown++;
      } else if (score >= 4) {
        high++;
      } else if (score >= 3) {
        std++;
      } else {
        low++;
      }
    });

    return { total, high, std, low, unknown };
  }, [patients, patientScores]);

  // Rewrite stats
  const rewriteStats = useMemo(() => {
    let total = 0;
    let rewritten = 0;
    ALL_TOPICS.forEach((topic) => {
      topicsData[topic].sentenceDetails.forEach((s) => {
        total++;
        if (s.hasRewrite) rewritten++;
      });
    });
    return { total, rewritten };
  }, [topicsData]);

  // Radar chart data
  const radarData = useMemo(() => {
    const data: Record<
      TopicName,
      { score: number | null; sentenceCount: number }
    > = {} as any;
    ALL_TOPICS.forEach((topic) => {
      data[topic] = {
        score: topicsData[topic].score,
        sentenceCount: topicsData[topic].sentenceDetails.length,
      };
    });
    return data;
  }, [topicsData]);

  // Score preview handler (step 1: get score only)
  const handleScorePreview = useCallback(async () => {
    if (!newSentence.trim() || !selectedTopic) return;

    setRescoring(true);
    setSaveStatus({ status: "idle", message: "" });

    try {
      const classNumber = TOPIC_TO_CLASS[selectedTopic];
      const scoreResult = await scoreSentence(newSentence, classNumber);
      const newScore = scoreResult?.score ?? 0;
      setPreviewScore(newScore);
      setRescoring(false);
    } catch (err) {
      setRescoring(false);
      setSaveStatus({ status: "error", message: "Failed to get score." });
    }
  }, [newSentence, selectedTopic, scoreSentence]);

  // Save rewrite handler (step 2: save with previewed score)
  const handleSaveRewrite = useCallback(async () => {
    if (!newSentence.trim() || !selectedTopic || previewScore === null) return;
    const currentData = topicsData[selectedTopic];
    const currentSentence = currentData?.sentenceDetails[selectedSentenceIdx];
    if (!currentSentence) return;

    setSaveStatus({ status: "saving", message: "Saving..." });

    try {
      const classNumber = TOPIC_TO_CLASS[selectedTopic];

      const result = await saveRewriteWithTimestamp(
        selectedFile,
        selectedSpeaker,
        currentSentence.i,
        currentSentence.i2,
        currentSentence.sentence,
        newSentence,
        previewScore,
        classNumber,
        true
      );

      if (result) {
        setSaveStatus({
          status: "success",
          message: `Saved! Score: ${previewScore.toFixed(1)}`,
        });
        await fetchRewritesFiltered(selectedFile, selectedSpeaker);
        setScoreSummaryLoading(true);
        await fetchScoreSummary(selectedFile, selectedSpeaker);
        setScoreSummaryLoading(false);
        setNewSentence("");
        setPreviewScore(null);
        setTimeout(() => setSaveStatus({ status: "idle", message: "" }), 3000);
      } else {
        setSaveStatus({ status: "error", message: "Failed to save." });
      }
    } catch (err) {
      setSaveStatus({ status: "error", message: "Error occurred." });
    }
  }, [
    newSentence,
    selectedTopic,
    selectedSentenceIdx,
    topicsData,
    selectedFile,
    selectedSpeaker,
    previewScore,
    saveRewriteWithTimestamp,
    fetchRewritesFiltered,
    fetchScoreSummary,
  ]);

  // Clear preview when sentence changes
  const handleClearPreview = useCallback(() => {
    setPreviewScore(null);
  }, []);

  // History handler
  const handleViewHistory = useCallback(async () => {
    if (!selectedTopic) return;
    const currentSentence =
      topicsData[selectedTopic]?.sentenceDetails[selectedSentenceIdx];
    if (!currentSentence) return;

    setHistoryLoading(true);
    setShowHistoryModal(true);
    await fetchRewriteHistory(
      selectedFile,
      currentSentence.i,
      currentSentence.i2
    );
    setHistoryLoading(false);
  }, [
    selectedTopic,
    selectedSentenceIdx,
    topicsData,
    selectedFile,
    fetchRewriteHistory,
  ]);

  // Colors
  const colors = {
    bg: isDarkMode ? "bg-slate-950" : "bg-slate-50",
    cardBg: isDarkMode ? "bg-slate-900" : "bg-white",
    border: isDarkMode ? "border-slate-800" : "border-slate-200",
    title: isDarkMode ? "text-slate-100" : "text-slate-900",
    subtitle: isDarkMode ? "text-slate-400" : "text-slate-600",
  };

  // Loading state
  if (loading) {
    return (
      <div
        className={`min-h-screen ${colors.bg} flex items-center justify-center`}
      >
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" isDarkMode={isDarkMode} />
          <span className={colors.subtitle}>Loading physician reports...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${colors.bg} p-6`}>
      {/* History Modal - z-index: 70 (above slide panel's z-50) */}
      <HistoryModal
        isDarkMode={isDarkMode}
        isOpen={showHistoryModal}
        onClose={() => {
          setShowHistoryModal(false);
          clearRewriteHistory();
        }}
        historyData={rewriteHistory}
        loading={historyLoading}
        zIndex={70}
        originalSentenceFromParent={
          selectedTopic
            ? topicsData[selectedTopic]?.sentenceDetails[selectedSentenceIdx]
                ?.sentence
            : undefined
        }
      />

      {/* Topic Detail Panel - z-index: 50, shrinks when history open */}
      <TopicDetailPanel
        isOpen={selectedTopic !== null}
        onClose={() => {
          setSelectedTopic(null);
          setShowRewrite(false);
          setNewSentence("");
          setPreviewScore(null);
          setSaveStatus({ status: "idle", message: "" });
        }}
        topic={selectedTopic}
        topicData={selectedTopic ? topicsData[selectedTopic] : null}
        isDarkMode={isDarkMode}
        selectedSentenceIdx={selectedSentenceIdx}
        setSelectedSentenceIdx={(idx) => {
          setSelectedSentenceIdx(idx);
          setPreviewScore(null);
          setNewSentence("");
        }}
        showRewrite={showRewrite}
        setShowRewrite={setShowRewrite}
        newSentence={newSentence}
        setNewSentence={setNewSentence}
        onScorePreview={handleScorePreview}
        onSaveRewrite={handleSaveRewrite}
        previewScore={previewScore}
        saveStatus={saveStatus}
        rescoring={rescoring}
        onViewHistory={handleViewHistory}
        isHistoryOpen={showHistoryModal}
        onClearPreview={handleClearPreview}
      />

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div
          className={`${colors.cardBg} rounded-2xl border ${colors.border} p-6`}
        >
          <div className="flex items-center gap-3">
            <div
              className={cx(
                "p-3 rounded-xl",
                isDarkMode ? "bg-cyan-900/50" : "bg-cyan-100"
              )}
            >
              <Activity
                className={`w-6 h-6 ${
                  isDarkMode ? "text-cyan-400" : "text-cyan-600"
                }`}
              />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${colors.title}`}>
                Physician Communication Quality
              </h1>
              <p className={`text-sm ${colors.subtitle}`}>
                Prostate Cancer Consultation Analysis Dashboard
              </p>
            </div>
          </div>
        </div>

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            title="Total Reports"
            count={summaryStats.total}
            icon={<BarChart3 className="w-5 h-5" />}
            color="cyan"
            isActive={scoreBand === "ALL"}
            onClick={() => setScoreBand("ALL")}
            isDarkMode={isDarkMode}
          />
          <SummaryCard
            title="High Quality"
            count={summaryStats.high}
            icon={<CheckCircle2 className="w-5 h-5" />}
            color="emerald"
            isActive={scoreBand === "HIGH"}
            onClick={() => setScoreBand("HIGH")}
            isDarkMode={isDarkMode}
          />
          <SummaryCard
            title="Standard"
            count={summaryStats.std}
            icon={<FileText className="w-5 h-5" />}
            color="yellow"
            isActive={scoreBand === "STD"}
            onClick={() => setScoreBand("STD")}
            isDarkMode={isDarkMode}
          />
          <SummaryCard
            title="Needs Improvement"
            count={summaryStats.low}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="red"
            isActive={scoreBand === "LOW"}
            onClick={() => setScoreBand("LOW")}
            isDarkMode={isDarkMode}
          />
        </div>

        {/* Patient Table */}
        <PatientTable
          patients={patients}
          selectedPatient={selectedPatient}
          onSelect={setSelectedPatient}
          isDarkMode={isDarkMode}
          loading={apiLoading}
          scoreBand={scoreBand}
          onScoreBandChange={setScoreBand}
          search={search}
          onSearchChange={setSearch}
          patientScores={patientScores}
        />

        {/* Main Content */}
        {selectedPatient ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Radar Chart + Stats */}
            <div
              className={`${colors.cardBg} rounded-2xl border ${colors.border} p-6`}
            >
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-cyan-400" : "text-cyan-600"
                  }`}
                />
                <h2 className={`text-lg font-semibold ${colors.title}`}>
                  Score Overview
                </h2>
              </div>

              {/* Overall Score */}
              <div className="text-center mb-6">
                <div
                  className={`inline-flex items-center justify-center w-24 h-24 rounded-full ${getScoreBadgeClass(
                    overallScore,
                    isDarkMode
                  )}`}
                >
                  <div>
                    <div className="text-3xl font-bold">
                      {scoreSummaryLoading ? (
                        <LoadingSpinner size="sm" isDarkMode={isDarkMode} />
                      ) : (
                        formatScore(overallScore)
                      )}
                    </div>
                    <div className="text-[10px] opacity-80">OVERALL</div>
                  </div>
                </div>
              </div>

              {/* Radar Chart */}
              <div className="flex justify-center mb-6">
                <TopicRadarChart
                  data={radarData}
                  selectedTopic={selectedTopic}
                  onTopicClick={(topic) => {
                    setSelectedTopic(topic);
                    setSelectedSentenceIdx(0);
                  }}
                  isDarkMode={isDarkMode}
                  loading={scoreSummaryLoading}
                />
              </div>

              {/* Progress */}
              <div className="space-y-3">
                <ProgressBar
                  value={rewriteStats.rewritten}
                  max={rewriteStats.total}
                  label="Sentences Rewritten"
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>

            {/* Right: Topic Cards Grid */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-cyan-400" : "text-cyan-600"
                  }`}
                />
                <h2 className={`text-lg font-semibold ${colors.title}`}>
                  Topics
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ALL_TOPICS.map((topic) => {
                  const data = topicsData[topic];
                  const rewrittenCount = data.sentenceDetails.filter(
                    (s) => s.hasRewrite
                  ).length;

                  return (
                    <button
                      key={topic}
                      onClick={() => {
                        setSelectedTopic(topic);
                        setSelectedSentenceIdx(0);
                      }}
                      className={cx(
                        "p-5 rounded-xl border text-left transition-all duration-200",
                        selectedTopic === topic
                          ? isDarkMode
                            ? "bg-cyan-900/30 border-cyan-500 ring-1 ring-cyan-500/50"
                            : "bg-cyan-50 border-cyan-400 ring-1 ring-cyan-400/50"
                          : isDarkMode
                          ? "bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50"
                          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div
                            className={cx(
                              "p-2 rounded-lg mt-0.5",
                              isDarkMode ? "bg-slate-800" : "bg-slate-100"
                            )}
                          >
                            {getTopicIcon(topic)}
                          </div>
                          <div>
                            <h3 className={`font-semibold ${colors.title}`}>
                              {topic}
                            </h3>
                            <p className={`text-xs mt-0.5 ${colors.subtitle}`}>
                              {TOPIC_DESCRIPTIONS[topic].slice(0, 35)}...
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-xl font-bold px-3 py-1 rounded-lg ${getScoreBadgeClass(
                            data.score,
                            isDarkMode
                          )}`}
                        >
                          {scoreSummaryLoading ? "-" : formatScore(data.score)}
                        </span>
                      </div>

                      <div
                        className={`mt-4 flex items-center gap-4 text-xs ${colors.subtitle}`}
                      >
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          {data.sentenceDetails.length} sentences
                        </span>
                        {rewrittenCount > 0 && (
                          <span
                            className={`flex items-center gap-1 ${
                              isDarkMode
                                ? "text-emerald-400"
                                : "text-emerald-600"
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {rewrittenCount} rewritten
                          </span>
                        )}
                      </div>

                      {/* Mini sentence preview */}
                      {data.sentenceDetails.length > 0 && (
                        <div
                          className={cx(
                            "mt-3 p-2 rounded-lg text-xs truncate",
                            isDarkMode
                              ? "bg-slate-800 text-slate-400"
                              : "bg-slate-100 text-slate-500"
                          )}
                        >
                          "{data.sentenceDetails[0].sentence.slice(0, 60)}..."
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div
            className={`${colors.cardBg} rounded-2xl border ${colors.border} p-12 text-center`}
          >
            <div
              className={cx(
                "w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4",
                isDarkMode ? "bg-slate-800" : "bg-slate-100"
              )}
            >
              <User
                className={`w-8 h-8 ${
                  isDarkMode ? "text-slate-600" : "text-slate-400"
                }`}
              />
            </div>
            <h2 className={`text-xl font-semibold ${colors.title} mb-2`}>
              Select a Patient to Begin
            </h2>
            <p className={colors.subtitle}>
              Choose a patient from the table above to view their communication
              quality analysis.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhysicianReports;
