"use client";

/**
 * PatientFollowUpReport.tsx - v4
 *
 * Second Visit 환자 페이지 - 설문 전용 컴포넌트
 *
 * ============================================================================
 * v4 변경사항
 * ============================================================================
 * - v3 구조 유지 (question-by-question, 한 번에 하나의 질문만 표시)
 * - Healthcare 테마 색상 적용 (Teal/Cyan/Sky/Emerald/Blue)
 * - v1의 왼쪽 Progress Sidebar 추가 (전체 진행률 표시 포함)
 *
 * ============================================================================
 * 요구사항 명세 (Transcript 기반)
 * ============================================================================
 *
 * [목적]
 * - 환자가 첫 방문 이후 AI 요약을 본 뒤, follow-up 이후에
 * - 리스크 인식(risk perception) 및 치료 이해도(treatment understanding) 질문에 답하여
 * - AI 요약이 환자가 follow-up에서 더 정보 기반 질문을 하도록 돕는지 측정
 *
 * [필수 요구사항]
 * - 설문 질문 UI (risk perception, treatment understanding)
 * - REDCap 연동 저장 (대시보드 내 설문 입력 → 백엔드에서 REDCap으로 전송)
 * - 질문 단위로 명확히 분리된 구성 (question-by-question)
 * - 페이지 역할/목적 안내 문구
 *
 * [Dr. Daskivich 요구사항 - 2024 업데이트]
 * - 한 번에 하나의 질문만 표시 (one question at a time)
 * - 각 질문 하단에 progress bar 표시
 * - 답변 완료 시 'Next' 버튼 활성화
 *
 * ============================================================================
 *
 * Survey Flow (Question-by-Question):
 * 1. Welcome/Introduction (목적 및 프로토콜 안내)
 * 2. SDM Questions (1-9, one at a time)
 * 3. Decisional Conflict Questions (1-16, one at a time)
 * 4. Risk Perception Questions (1-5, one at a time, with collapsible summaries)
 * 5. Patient Satisfaction Questions (1-5, one at a time)
 * 6. Completion/Thank You
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";

import { usePatientId } from "@/stores/usePatientId";
import { useFileId } from "@/stores/useFileId";
import { usePatientData } from "@/hooks/usePatientData";

// Survey Components & Types
import {
  INITIAL_SDM_ANSWERS,
  type YesNoAnswer,
  type ScaleAnswer,
  type SDMAnswers,
  INITIAL_DCS_ANSWERS,
  type DecisionalConflictAnswers,
  type LikertAnswer,
  INITIAL_RISK_ANSWERS,
  type RiskPerceptionAnswers,
  INITIAL_SATISFACTION_ANSWERS,
  type PatientSatisfactionAnswers,
} from "@/components/surveys";

import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  FileText,
  Shield,
  HelpCircle,
  BarChart3,
  Smile,
  Sparkles,
  MessageSquareText,
  Info,
  Check,
  Heart,
} from "lucide-react";

import { submitSurvey } from "@/api/surveyApi";

/* =============================================================================
   SECTION 1: TRACKING SYSTEM
============================================================================= */

interface TrackingEvent {
  eventType:
    | "proximity_enter"
    | "proximity_exit"
    | "scroll_depth"
    | "dwell_time"
    | "survey_step_view"
    | "survey_answer"
    | "summary_toggle"
    | "button_click";
  elementId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

class TrackingEventManager {
  private events: TrackingEvent[] = [];
  private listeners: ((event: TrackingEvent) => void)[] = [];

  recordEvent(event: TrackingEvent) {
    this.events.push(event);
    console.log(`📊 [Survey Tracking]`, event);
    this.listeners.forEach((listener) => listener(event));
  }

  subscribe(listener: (event: TrackingEvent) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getEvents(): TrackingEvent[] {
    return [...this.events];
  }

  clear() {
    this.events = [];
  }

  exportEvents(): string {
    return JSON.stringify(this.events, null, 2);
  }
}

const trackingManager = new TrackingEventManager();

if (typeof window !== "undefined") {
  (window as any).surveyTrackingManager = trackingManager;
}

/* =============================================================================
   SECTION 2: TYPES & CONSTANTS
============================================================================= */

interface PatientFollowUpReportProps {
  isDarkMode?: boolean;
}

interface ClassSummary {
  class_name: string;
  summary: string;
  score: number | null;
}

interface SummaryDetailResponse {
  file: string;
  speaker: string;
  summary: {
    entire_summary: string | null;
    classes: ClassSummary[];
  };
}

// Survey Sections
type SurveySection =
  | "welcome"
  | "sdm"
  | "dcs"
  | "risk"
  | "satisfaction"
  | "complete";

// Survey Steps for Sidebar (same as SurveySection)
const SURVEY_STEPS: SurveySection[] = [
  "welcome",
  "sdm",
  "dcs",
  "risk",
  "satisfaction",
  "complete",
];

// Step Info for Sidebar - Healthcare Theme Icons
const STEP_INFO: Record<
  SurveySection,
  { title: string; description: string; icon: React.ReactNode }
> = {
  welcome: {
    title: "Welcome",
    description: "Introduction to the survey",
    icon: <Heart size={18} />,
  },
  sdm: {
    title: "Shared Decision Making",
    description: "9 questions",
    icon: <Shield size={18} />,
  },
  dcs: {
    title: "Decisional Conflict",
    description: "16 questions",
    icon: <HelpCircle size={18} />,
  },
  risk: {
    title: "Risk Perception",
    description: "5 questions",
    icon: <BarChart3 size={18} />,
  },
  satisfaction: {
    title: "Satisfaction",
    description: "5 questions",
    icon: <Smile size={18} />,
  },
  complete: {
    title: "Complete",
    description: "Thank you",
    icon: <CheckCircle size={18} />,
  },
};

// Topic Mapping
const CLASS_TO_TOPIC_MAP: Record<string, string> = {
  "1": "Cancer Prognosis",
  "1.0": "Cancer Prognosis",
  "2": "Life Expectancy",
  "2.0": "Life Expectancy",
  "3": "Erectile Dysfunction",
  "3.0": "Erectile Dysfunction",
  "4": "Urinary Incontinence",
  "4.0": "Urinary Incontinence",
  "5": "Irritative Urinary Symptoms",
  "5.0": "Irritative Urinary Symptoms",
};

// Topic Colors - Healthcare Theme (Teal/Cyan/Sky/Emerald/Blue)
const TOPIC_COLORS: Record<
  string,
  { gradient: string; iconBg: string; border: string; light: string }
> = {
  "Cancer Prognosis": {
    gradient: "from-teal-500/10 via-cyan-500/10 to-sky-500/10",
    iconBg: "from-teal-500 to-cyan-500",
    border: "border-teal-200/50 dark:border-teal-500/20",
    light: "bg-teal-50 border-teal-200",
  },
  "Life Expectancy": {
    gradient: "from-sky-500/10 via-blue-500/10 to-indigo-500/10",
    iconBg: "from-sky-500 to-blue-500",
    border: "border-sky-200/50 dark:border-sky-500/20",
    light: "bg-sky-50 border-sky-200",
  },
  "Erectile Dysfunction": {
    gradient: "from-cyan-500/10 via-teal-500/10 to-emerald-500/10",
    iconBg: "from-cyan-500 to-teal-500",
    border: "border-cyan-200/50 dark:border-cyan-500/20",
    light: "bg-cyan-50 border-cyan-200",
  },
  "Urinary Incontinence": {
    gradient: "from-emerald-500/10 via-teal-500/10 to-cyan-500/10",
    iconBg: "from-emerald-500 to-teal-500",
    border: "border-emerald-200/50 dark:border-emerald-500/20",
    light: "bg-emerald-50 border-emerald-200",
  },
  "Irritative Urinary Symptoms": {
    gradient: "from-blue-500/10 via-sky-500/10 to-cyan-500/10",
    iconBg: "from-blue-500 to-sky-500",
    border: "border-blue-200/50 dark:border-blue-500/20",
    light: "bg-blue-50 border-blue-200",
  },
};

// Type alias for summaries
type TopicSummaryMap = Record<
  string,
  { aiSummary: string; extractedSentences: string[] }
>;

/* =============================================================================
   SECTION 3: QUESTION DEFINITIONS
============================================================================= */

// SDM Questions (9 questions)
const SDM_QUESTIONS = [
  {
    id: "q1",
    text: "My doctor made clear that a decision needs to be made.",
    type: "yesNo" as const,
  },
  {
    id: "q2",
    text: "My doctor wanted to know exactly how I want to be involved in making the decision.",
    type: "yesNo" as const,
  },
  {
    id: "q3",
    text: "My doctor told me that there are different options for treating my medical condition.",
    type: "yesNo" as const,
  },
  {
    id: "q4",
    text: "My doctor precisely explained the advantages and disadvantages of the treatment options.",
    type: "yesNo" as const,
  },
  {
    id: "q5",
    text: "My doctor helped me understand all the information.",
    type: "yesNo" as const,
  },
  {
    id: "q6",
    text: "My doctor asked me which treatment option I prefer.",
    type: "yesNo" as const,
  },
  {
    id: "q7",
    text: "My doctor and I thoroughly weighed the different treatment options.",
    type: "yesNo" as const,
  },
  {
    id: "q8",
    text: "My doctor and I selected a treatment option together.",
    type: "yesNo" as const,
  },
  {
    id: "q9",
    text: "My doctor and I reached an agreement on how to proceed.",
    type: "yesNo" as const,
  },
];

// Decisional Conflict Questions (16 questions)
const DCS_QUESTIONS = [
  {
    id: "q1",
    text: "I know which options are available to me.",
    subscale: "informed",
  },
  {
    id: "q2",
    text: "I know the benefits of each option.",
    subscale: "informed",
  },
  {
    id: "q3",
    text: "I know the risks and side effects of each option.",
    subscale: "informed",
  },
  {
    id: "q4",
    text: "I am clear about which benefits matter most to me.",
    subscale: "values",
  },
  {
    id: "q5",
    text: "I am clear about which risks and side effects matter most to me.",
    subscale: "values",
  },
  {
    id: "q6",
    text: "I am clear about which is more important to me (the benefits or the risks and side effects).",
    subscale: "values",
  },
  {
    id: "q7",
    text: "I have enough support from others to make a choice.",
    subscale: "support",
  },
  {
    id: "q8",
    text: "I am choosing without pressure from others.",
    subscale: "support",
  },
  {
    id: "q9",
    text: "I have enough advice to make a choice.",
    subscale: "support",
  },
  {
    id: "q10",
    text: "I am clear about the best choice for me.",
    subscale: "uncertainty",
  },
  {
    id: "q11",
    text: "I feel sure about what to choose.",
    subscale: "uncertainty",
  },
  {
    id: "q12",
    text: "This decision is easy for me to make.",
    subscale: "uncertainty",
  },
  {
    id: "q13",
    text: "I feel I have made an informed choice.",
    subscale: "effective",
  },
  {
    id: "q14",
    text: "My decision shows what is important to me.",
    subscale: "effective",
  },
  {
    id: "q15",
    text: "I expect to stick with my decision.",
    subscale: "effective",
  },
  {
    id: "q16",
    text: "I am satisfied with my decision.",
    subscale: "effective",
  },
];

// Risk Perception Questions (5 questions)
const RISK_QUESTIONS = [
  {
    id: "q1",
    text: "What is the chance that your cancer will spread or come back if you choose active surveillance?",
    topic: "Cancer Prognosis",
  },
  {
    id: "q2",
    text: "What is the chance that your cancer will spread or come back if you choose treatment (surgery or radiation)?",
    topic: "Cancer Prognosis",
  },
  {
    id: "q3",
    text: "What is the chance of having erectile dysfunction after treatment?",
    topic: "Erectile Dysfunction",
  },
  {
    id: "q4",
    text: "What is the chance of having urinary incontinence after treatment?",
    topic: "Urinary Incontinence",
  },
  {
    id: "q5",
    text: "What is the chance of having irritative urinary symptoms after treatment?",
    topic: "Irritative Urinary Symptoms",
  },
];

// Satisfaction Questions (5 questions)
const SATISFACTION_QUESTIONS = [
  {
    id: "overall",
    text: "Overall, how satisfied are you with today's consultation?",
    type: "rating" as const,
  },
  {
    id: "communication",
    text: "How well did your doctor communicate with you?",
    type: "rating" as const,
  },
  {
    id: "timeSpent",
    text: "Was the time spent with you adequate?",
    type: "rating" as const,
  },
  {
    id: "recommend",
    text: "Would you recommend this doctor to a friend or family member?",
    type: "yesNoMaybe" as const,
  },
  {
    id: "comments",
    text: "Do you have any additional comments or feedback about your consultation?",
    type: "text" as const,
  },
];

// Answer options
const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const LIKERT_OPTIONS = [
  { value: "strongly_agree", label: "Strongly Agree" },
  { value: "agree", label: "Agree" },
  { value: "neither", label: "Neither Agree nor Disagree" },
  { value: "disagree", label: "Disagree" },
  { value: "strongly_disagree", label: "Strongly Disagree" },
];

const RISK_OPTIONS = [
  { value: "very_low", label: "Very Low (0-10%)" },
  { value: "low", label: "Low (11-30%)" },
  { value: "moderate", label: "Moderate (31-50%)" },
  { value: "high", label: "High (51-70%)" },
  { value: "very_high", label: "Very High (71-100%)" },
  { value: "not_sure", label: "Not Sure" },
];

const RATING_OPTIONS = [
  { value: 1, label: "1 - Very Poor" },
  { value: 2, label: "2 - Poor" },
  { value: 3, label: "3 - Fair" },
  { value: 4, label: "4 - Good" },
  { value: 5, label: "5 - Excellent" },
];

const YES_NO_MAYBE_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "maybe", label: "Maybe" },
];

/* =============================================================================
   SECTION 4: UTILITY FUNCTIONS
============================================================================= */

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/* =============================================================================
   SECTION 5: REUSABLE COMPONENTS
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 5.1 AI Summary Badge - Healthcare Theme
// ─────────────────────────────────────────────────────────────────────────────

interface AISummaryBadgeProps {
  isDark?: boolean;
}

const AISummaryBadge: React.FC<AISummaryBadgeProps> = ({ isDark }) => {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
        "backdrop-blur-sm transition-all duration-200",
        isDark
          ? "bg-teal-500/20 text-teal-300 border border-teal-400/30"
          : "bg-gradient-to-r from-teal-500/10 to-cyan-500/10 text-teal-600 border border-teal-300/50",
      )}
    >
      <Sparkles size={10} />
      AI-generated
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.2 Progress Sidebar (from v1, Healthcare Theme)
// ─────────────────────────────────────────────────────────────────────────────

interface ProgressSidebarProps {
  currentSection: SurveySection;
  currentQuestionIndex: number;
  completedSections: Set<SurveySection>;
  onSectionClick: (section: SurveySection) => void;
  isDark?: boolean;
  sdmAnswers: SDMAnswers;
  dcsAnswers: DecisionalConflictAnswers;
  riskAnswers: RiskPerceptionAnswers;
  satisfactionAnswers: PatientSatisfactionAnswers;
}

const ProgressSidebar: React.FC<ProgressSidebarProps> = ({
  currentSection,
  currentQuestionIndex,
  completedSections,
  onSectionClick,
  isDark,
  sdmAnswers,
  dcsAnswers,
  riskAnswers,
  satisfactionAnswers,
}) => {
  const currentIndex = SURVEY_STEPS.indexOf(currentSection);

  // Calculate progress for each section
  const getSectionProgress = (section: SurveySection) => {
    switch (section) {
      case "sdm":
        const sdmAnswered = Object.values(sdmAnswers).filter(
          (v) => v !== null,
        ).length;
        return { answered: sdmAnswered, total: SDM_QUESTIONS.length };
      case "dcs":
        const dcsAnswered = Object.values(dcsAnswers).filter(
          (v) => v !== null,
        ).length;
        return { answered: dcsAnswered, total: DCS_QUESTIONS.length };
      case "risk":
        const riskAnswered = Object.values(riskAnswers).filter(
          (v) => v !== null,
        ).length;
        return { answered: riskAnswered, total: RISK_QUESTIONS.length };
      case "satisfaction":
        const satAnswered = Object.entries(satisfactionAnswers).filter(
          ([key, v]) => key !== "comments" && v !== null,
        ).length;
        return { answered: satAnswered, total: 4 }; // Excluding optional comments
      default:
        return { answered: 0, total: 0 };
    }
  };

  // Calculate overall progress
  const calculateOverallProgress = () => {
    const totalQuestions =
      SDM_QUESTIONS.length + DCS_QUESTIONS.length + RISK_QUESTIONS.length + 4; // 4 required satisfaction questions

    let answeredQuestions = 0;
    answeredQuestions += Object.values(sdmAnswers).filter(
      (v) => v !== null,
    ).length;
    answeredQuestions += Object.values(dcsAnswers).filter(
      (v) => v !== null,
    ).length;
    answeredQuestions += Object.values(riskAnswers).filter(
      (v) => v !== null,
    ).length;
    answeredQuestions += Object.entries(satisfactionAnswers).filter(
      ([key, v]) => key !== "comments" && v !== null,
    ).length;

    return { answered: answeredQuestions, total: totalQuestions };
  };

  const overallProgress = calculateOverallProgress();

  return (
    <div
      className={cx(
        "w-72 flex-shrink-0 p-6 border-r",
        isDark
          ? "bg-slate-900/80 border-slate-800"
          : "bg-gradient-to-b from-white to-gray-50/80 border-gray-200",
      )}
    >
      {/* Logo/Title */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className={cx(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            "bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/30",
          )}
        >
          <Heart size={20} className="text-white" />
        </div>
        <div>
          <h2
            className={cx(
              "text-sm font-bold",
              isDark ? "text-white" : "text-gray-900",
            )}
          >
            Follow-Up Survey
          </h2>
          <p
            className={cx(
              "text-xs",
              isDark ? "text-slate-500" : "text-gray-400",
            )}
          >
            Patient Dashboard
          </p>
        </div>
      </div>

      <h3
        className={cx(
          "text-xs font-bold uppercase tracking-wider mb-4",
          isDark ? "text-slate-500" : "text-gray-400",
        )}
      >
        Survey Progress
      </h3>

      <div className="space-y-2">
        {SURVEY_STEPS.map((step, index) => {
          const isCompleted = completedSections.has(step);
          const isCurrent = step === currentSection;
          const isPast = index < currentIndex;
          const isClickable = isPast || isCompleted || isCurrent;
          const progress = getSectionProgress(step);

          return (
            <button
              key={step}
              onClick={() => isClickable && onSectionClick(step)}
              disabled={!isClickable}
              className={cx(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200",
                isCurrent
                  ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/30"
                  : isCompleted || isPast
                    ? isDark
                      ? "text-slate-300 hover:bg-slate-800"
                      : "text-gray-700 hover:bg-gray-100"
                    : isDark
                      ? "text-slate-600 cursor-not-allowed"
                      : "text-gray-400 cursor-not-allowed",
              )}
            >
              <span
                className={cx(
                  "flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center",
                  isCurrent
                    ? "bg-white/20"
                    : isCompleted
                      ? isDark
                        ? "bg-emerald-900/50 text-emerald-400"
                        : "bg-emerald-100 text-emerald-600"
                      : isDark
                        ? "bg-slate-800 text-slate-500"
                        : "bg-gray-100 text-gray-400",
                )}
              >
                {isCompleted && !isCurrent ? (
                  <Check size={16} />
                ) : (
                  STEP_INFO[step].icon
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className={cx(
                    "text-sm font-semibold truncate",
                    isCurrent && "text-white",
                  )}
                >
                  {STEP_INFO[step].title}
                </div>
                <div
                  className={cx(
                    "text-xs truncate mt-0.5",
                    isCurrent
                      ? "text-white/70"
                      : isDark
                        ? "text-slate-500"
                        : "text-gray-400",
                  )}
                >
                  {progress.total > 0
                    ? `${progress.answered}/${progress.total} answered`
                    : STEP_INFO[step].description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Overall Progress Bar */}
      <div
        className={cx(
          "mt-8 pt-6 border-t",
          isDark ? "border-slate-800" : "border-gray-200",
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className={cx(
              "text-xs font-medium",
              isDark ? "text-slate-500" : "text-gray-400",
            )}
          >
            Overall Progress
          </span>
          <span
            className={cx(
              "text-sm font-bold",
              isDark ? "text-slate-300" : "text-gray-700",
            )}
          >
            {Math.round(
              (overallProgress.answered / overallProgress.total) * 100,
            )}
            %
          </span>
        </div>
        <div
          className={cx(
            "w-full h-2.5 rounded-full overflow-hidden",
            isDark ? "bg-slate-800" : "bg-gray-200",
          )}
        >
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all duration-500"
            style={{
              width: `${(overallProgress.answered / overallProgress.total) * 100}%`,
            }}
          />
        </div>
        <p
          className={cx(
            "text-xs mt-2 text-center",
            isDark ? "text-slate-500" : "text-gray-400",
          )}
        >
          {overallProgress.answered} of {overallProgress.total} questions
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.3 Collapsible Summary Card (for Risk Perception questions) - Healthcare Theme
// ─────────────────────────────────────────────────────────────────────────────

interface CollapsibleSummaryProps {
  topicName: string;
  aiSummary: string;
  extractedSentences?: string[];
  isExpanded: boolean;
  onToggle: () => void;
  isDark?: boolean;
}

const CollapsibleSummary: React.FC<CollapsibleSummaryProps> = ({
  topicName,
  aiSummary,
  extractedSentences = [],
  isExpanded,
  onToggle,
  isDark,
}) => {
  const colors = TOPIC_COLORS[topicName] || TOPIC_COLORS["Cancer Prognosis"];

  return (
    <div className="mt-6">
      {/* Toggle Button */}
      <button
        type="button"
        onClick={onToggle}
        className={cx(
          "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
          isDark
            ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
            : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm hover:shadow",
        )}
      >
        <MessageSquareText size={16} className="opacity-70" />
        <span>
          {isExpanded ? "Hide" : "View"} consultation summary for this topic
        </span>
        <AISummaryBadge isDark={isDark} />
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {/* Collapsible Content */}
      <div
        className={cx(
          "transition-all duration-300 ease-in-out overflow-hidden",
          isExpanded ? "max-h-[1000px] opacity-100 mt-4" : "max-h-0 opacity-0",
        )}
      >
        <div
          className={cx(
            "p-5 rounded-2xl border-l-4",
            isDark
              ? "bg-slate-800/60 border-l-teal-500 border-y border-r border-slate-700/50"
              : "bg-gradient-to-r border-l-teal-500 border-y border-r border-gray-100 shadow-sm",
            colors.gradient,
          )}
        >
          {/* Topic Label */}
          <div className="flex items-center gap-2 mb-3">
            <div
              className={cx(
                "w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold",
                "bg-gradient-to-br",
                colors.iconBg,
              )}
            >
              <FileText size={14} />
            </div>
            <span
              className={cx(
                "text-sm font-semibold",
                isDark ? "text-slate-200" : "text-gray-800",
              )}
            >
              {topicName}
            </span>
          </div>

          {/* AI Summary Text */}
          <p
            className={cx(
              "text-sm leading-relaxed",
              isDark ? "text-slate-300" : "text-gray-600",
            )}
          >
            {aiSummary}
          </p>

          {/* Extracted Sentences (if available) */}
          {extractedSentences.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700/30">
              <h5
                className={cx(
                  "text-xs font-bold uppercase tracking-wider mb-3",
                  isDark ? "text-slate-500" : "text-gray-400",
                )}
              >
                Relevant excerpts from your consultation
              </h5>
              <div className="space-y-2">
                {extractedSentences.map((sentence, idx) => (
                  <div
                    key={idx}
                    className={cx(
                      "p-3 rounded-lg",
                      isDark ? "bg-slate-900/50" : "bg-white/80",
                    )}
                  >
                    <p
                      className={cx(
                        "text-xs leading-relaxed italic",
                        isDark ? "text-slate-400" : "text-gray-500",
                      )}
                    >
                      "{sentence}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.4 Progress Bar (Bottom of each question) - Healthcare Theme
// ─────────────────────────────────────────────────────────────────────────────

interface ProgressBarProps {
  current: number;
  total: number;
  sectionName: string;
  isDark?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  sectionName,
  isDark,
}) => {
  const percentage = Math.round((current / total) * 100);

  return (
    <div
      className={cx(
        "w-full p-4 rounded-2xl border",
        isDark
          ? "bg-slate-800/50 border-slate-700"
          : "bg-white border-gray-200 shadow-sm",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={cx(
            "text-xs font-medium uppercase tracking-wider",
            isDark ? "text-slate-500" : "text-gray-400",
          )}
        >
          {sectionName}
        </span>
        <span
          className={cx(
            "text-sm font-bold",
            isDark ? "text-slate-300" : "text-gray-700",
          )}
        >
          Question {current} of {total}
        </span>
      </div>
      <div
        className={cx(
          "w-full h-2.5 rounded-full overflow-hidden",
          isDark ? "bg-slate-700" : "bg-gray-200",
        )}
      >
        <div
          className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-end mt-1">
        <span
          className={cx(
            "text-xs font-medium",
            isDark ? "text-slate-500" : "text-gray-400",
          )}
        >
          {percentage}% complete
        </span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.5 Single Question Card - Healthcare Theme
// ─────────────────────────────────────────────────────────────────────────────

interface SingleQuestionCardProps {
  questionNumber: number;
  questionText: string;
  children: React.ReactNode;
  isDark?: boolean;
  subtitle?: string;
  icon?: React.ReactNode;
}

const SingleQuestionCard: React.FC<SingleQuestionCardProps> = ({
  questionNumber,
  questionText,
  children,
  isDark,
  subtitle,
  icon,
}) => {
  return (
    <div
      className={cx(
        "w-full max-w-2xl mx-auto rounded-3xl overflow-hidden border",
        isDark
          ? "bg-slate-900/80 border-slate-700/50"
          : "bg-white border-gray-200 shadow-xl shadow-gray-200/50",
      )}
    >
      {/* Question Header - Healthcare Theme */}
      <div
        className={cx(
          "px-8 py-6",
          isDark
            ? "bg-gradient-to-r from-teal-900/40 to-cyan-900/40"
            : "bg-gradient-to-r from-teal-50 to-cyan-50",
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={cx(
              "flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg",
              "bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/30",
            )}
          >
            {icon || questionNumber}
          </div>
          <div className="flex-1 pt-1">
            {subtitle && (
              <span
                className={cx(
                  "text-xs font-semibold uppercase tracking-wider mb-2 block",
                  isDark ? "text-teal-400" : "text-teal-600",
                )}
              >
                {subtitle}
              </span>
            )}
            <h2
              className={cx(
                "text-xl font-bold leading-relaxed",
                isDark ? "text-white" : "text-gray-900",
              )}
            >
              {questionText}
            </h2>
          </div>
        </div>
      </div>

      {/* Answer Options */}
      <div className={cx("px-8 py-8", isDark ? "bg-slate-900/40" : "bg-white")}>
        {children}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.6 Answer Option Components - Healthcare Theme
// ─────────────────────────────────────────────────────────────────────────────

interface OptionButtonProps {
  value: string | number;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  isDark?: boolean;
}

const OptionButton: React.FC<OptionButtonProps> = ({
  value,
  label,
  isSelected,
  onSelect,
  isDark,
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        "w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200 border text-left",
        isSelected
          ? isDark
            ? "bg-teal-900/50 border-teal-500 ring-2 ring-teal-500/30"
            : "bg-teal-50 border-teal-400 ring-2 ring-teal-300/50"
          : isDark
            ? "bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600"
            : "bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300",
      )}
    >
      <span
        className={cx(
          "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
          isSelected
            ? "border-teal-500 bg-teal-500"
            : isDark
              ? "border-slate-500"
              : "border-gray-300",
        )}
      >
        {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
      </span>
      <span
        className={cx(
          "text-base font-medium",
          isSelected
            ? isDark
              ? "text-teal-300"
              : "text-teal-700"
            : isDark
              ? "text-slate-300"
              : "text-gray-700",
        )}
      >
        {label}
      </span>
    </button>
  );
};

interface TextAreaInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isDark?: boolean;
}

const TextAreaInput: React.FC<TextAreaInputProps> = ({
  value,
  onChange,
  placeholder,
  isDark,
}) => {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "Type your response here..."}
      rows={4}
      className={cx(
        "w-full p-4 rounded-xl border text-base transition-all duration-200 resize-none",
        isDark
          ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
          : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-300/50",
      )}
    />
  );
};

/* =============================================================================
   SECTION 6: STEP CONTENT COMPONENTS
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 6.1 Welcome Step - Healthcare Theme
// ─────────────────────────────────────────────────────────────────────────────

interface WelcomeStepProps {
  onNext: () => void;
  isDark?: boolean;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext, isDark }) => {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      {/* Icon - Healthcare Theme */}
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 bg-gradient-to-br from-teal-500 to-cyan-600 shadow-2xl shadow-teal-500/30">
        <Heart size={36} className="text-white" />
      </div>

      <h1
        className={cx(
          "text-3xl font-bold mb-4 tracking-tight",
          isDark ? "text-white" : "text-gray-900",
        )}
      >
        Follow-Up Survey
      </h1>

      {/* Protocol Explanation - Healthcare Theme */}
      <div
        className={cx(
          "relative overflow-hidden rounded-2xl p-6 mb-8 text-left",
          "backdrop-blur-xl border",
          isDark
            ? "bg-gradient-to-br from-teal-950/60 to-cyan-950/60 border-teal-500/20"
            : "bg-gradient-to-br from-white/80 to-teal-50/80 border-teal-200/50 shadow-xl shadow-teal-500/5",
        )}
      >
        {/* Decorative elements */}
        <div
          className={cx(
            "absolute -top-16 -right-16 w-32 h-32 rounded-full blur-2xl",
            isDark ? "bg-teal-500/20" : "bg-teal-300/30",
          )}
        />

        <div className="relative flex items-start gap-4">
          <div
            className={cx(
              "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center",
              "bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/30",
            )}
          >
            <Info size={22} className="text-white" />
          </div>
          <div className="flex-1">
            <h3
              className={cx(
                "text-lg font-bold mb-3",
                isDark ? "text-white" : "text-gray-900",
              )}
            >
              About This Survey
            </h3>
            <div
              className={cx(
                "space-y-3 text-sm leading-relaxed",
                isDark ? "text-teal-100/80" : "text-gray-600",
              )}
            >
              <p>
                This survey is part of your <strong>follow-up protocol</strong>{" "}
                after your second consultation visit. The purpose is to:
              </p>
              <ul className="space-y-2 ml-1">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-teal-500 mt-2" />
                  <span>
                    Assess your{" "}
                    <strong>understanding of treatment risks</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-teal-500 mt-2" />
                  <span>
                    Measure your <strong>risk perception</strong> for different
                    treatment options
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-teal-500 mt-2" />
                  <span>Help us improve future patient consultations</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* What to expect - Healthcare Theme */}
      <div
        className={cx(
          "p-5 rounded-2xl mb-8 text-left border",
          isDark
            ? "bg-slate-800/50 border-slate-700"
            : "bg-gray-50 border-gray-200",
        )}
      >
        <h3
          className={cx(
            "text-sm font-bold mb-4",
            isDark ? "text-slate-200" : "text-gray-800",
          )}
        >
          What to expect:
        </h3>
        <ul
          className={cx(
            "space-y-3 text-sm",
            isDark ? "text-slate-400" : "text-gray-600",
          )}
        >
          <li className="flex items-center gap-3">
            <Shield size={18} className="text-teal-500 flex-shrink-0" />
            <span>9 questions about shared decision making</span>
          </li>
          <li className="flex items-center gap-3">
            <HelpCircle size={18} className="text-cyan-500 flex-shrink-0" />
            <span>16 questions about your treatment decision</span>
          </li>
          <li className="flex items-center gap-3">
            <BarChart3 size={18} className="text-sky-500 flex-shrink-0" />
            <span>5 questions about risk perception</span>
          </li>
          <li className="flex items-center gap-3">
            <Smile size={18} className="text-emerald-500 flex-shrink-0" />
            <span>5 questions about your satisfaction</span>
          </li>
        </ul>
        <p
          className={cx(
            "mt-4 text-xs",
            isDark ? "text-slate-500" : "text-gray-400",
          )}
        >
          You'll answer one question at a time. Estimated time: 10-15 minutes
        </p>
      </div>

      <button
        onClick={onNext}
        className={cx(
          "inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold transition-all duration-200",
          "bg-gradient-to-r from-teal-500 to-cyan-600 text-white",
          "hover:from-teal-600 hover:to-cyan-700 shadow-lg shadow-teal-500/30 hover:shadow-xl",
        )}
      >
        Start Survey
        <ChevronRight size={20} />
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 6.2 Complete Step - Healthcare Theme
// ─────────────────────────────────────────────────────────────────────────────

interface CompleteStepProps {
  isDark?: boolean;
}

const CompleteStep: React.FC<CompleteStepProps> = ({ isDark }) => {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-2xl shadow-emerald-500/30">
        <CheckCircle size={36} className="text-white" />
      </div>

      <h1
        className={cx(
          "text-3xl font-bold mb-4 tracking-tight",
          isDark ? "text-white" : "text-gray-900",
        )}
      >
        Thank You!
      </h1>

      <p
        className={cx(
          "text-lg mb-8 leading-relaxed",
          isDark ? "text-slate-400" : "text-gray-600",
        )}
      >
        Your responses have been recorded successfully.
        <br />
        Your feedback helps us improve care for future patients.
      </p>

      <div
        className={cx(
          "p-5 rounded-2xl text-left border",
          isDark
            ? "bg-slate-800/50 border-slate-700"
            : "bg-gray-50 border-gray-200",
        )}
      >
        <p
          className={cx("text-sm", isDark ? "text-slate-400" : "text-gray-600")}
        >
          If you have any questions or concerns about your treatment options,
          please contact your healthcare provider. This survey is for research
          purposes and does not replace medical advice.
        </p>
      </div>
    </div>
  );
};

/* =============================================================================
   SECTION 7: MAIN COMPONENT
============================================================================= */

const PatientFollowUpReport: React.FC<PatientFollowUpReportProps> = ({
  isDarkMode = false,
}) => {
  // ─────────────────────────────────────────────────────────────────────────
  // 7.1 Hooks & API
  // ─────────────────────────────────────────────────────────────────────────
  const { patientId } = usePatientId();
  const { fileId } = useFileId();
  const { fetchSummaryDetail } = usePatientData();

  const currentFile = fileId || "quality-coded-nlp-pilot-sid-1.xlsx";
  const currentSpeaker = patientId || "Patient_quality-coded-nlp-pilot-sid-1";

  // ─────────────────────────────────────────────────────────────────────────
  // 7.2 State
  // ─────────────────────────────────────────────────────────────────────────

  // Current Section & Question Index
  const [currentSection, setCurrentSection] =
    useState<SurveySection>("welcome");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Completed Sections (for sidebar)
  const [completedSections, setCompletedSections] = useState<
    Set<SurveySection>
  >(new Set());

  // API State
  const [summaryData, setSummaryData] = useState<SummaryDetailResponse | null>(
    null,
  );
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Survey Answers
  const [sdmAnswers, setSdmAnswers] = useState<SDMAnswers>(INITIAL_SDM_ANSWERS);
  const [dcsAnswers, setDcsAnswers] =
    useState<DecisionalConflictAnswers>(INITIAL_DCS_ANSWERS);
  const [riskAnswers, setRiskAnswers] =
    useState<RiskPerceptionAnswers>(INITIAL_RISK_ANSWERS);
  const [satisfactionAnswers, setSatisfactionAnswers] =
    useState<PatientSatisfactionAnswers>(INITIAL_SATISFACTION_ANSWERS);

  // Submission State (per section)
  const [submittedSections, setSubmittedSections] = useState<
    Set<SurveySection>
  >(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Expanded summaries for Risk Perception
  const [expandedSummaries, setExpandedSummaries] = useState<
    Record<string, boolean>
  >({});

  // ─────────────────────────────────────────────────────────────────────────
  // 7.3 Load Summary Data
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadSummaryData = async () => {
      try {
        setApiLoading(true);
        setApiError(null);

        const result = await fetchSummaryDetail(currentFile, currentSpeaker);
        if (result) {
          setSummaryData(result);
        } else {
          setApiError("Failed to load summary data");
        }
      } catch (err) {
        console.error("Error loading summary:", err);
        setApiError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setApiLoading(false);
      }
    };

    loadSummaryData();
  }, [currentFile, currentSpeaker]);

  // ─────────────────────────────────────────────────────────────────────────
  // 7.4 Derived Data
  // ─────────────────────────────────────────────────────────────────────────

  const topicSummaries = useMemo((): TopicSummaryMap => {
    const summaries: TopicSummaryMap = {};

    if (summaryData?.summary?.classes) {
      summaryData.summary.classes.forEach((cls: ClassSummary) => {
        const topicName = CLASS_TO_TOPIC_MAP[cls.class_name];
        if (topicName) {
          summaries[topicName] = {
            aiSummary: cls.summary || "Summary not available.",
            extractedSentences: [],
          };
        }
      });
    }

    return summaries;
  }, [summaryData]);

  // Get current questions based on section
  const getCurrentSectionQuestions = useCallback(() => {
    switch (currentSection) {
      case "sdm":
        return SDM_QUESTIONS;
      case "dcs":
        return DCS_QUESTIONS;
      case "risk":
        return RISK_QUESTIONS;
      case "satisfaction":
        return SATISFACTION_QUESTIONS;
      default:
        return [];
    }
  }, [currentSection]);

  const currentQuestions = getCurrentSectionQuestions();
  const totalQuestionsInSection = currentQuestions.length;

  // Get current question answer
  const getCurrentAnswer = useCallback(() => {
    if (currentQuestions.length === 0) return null;
    const question = currentQuestions[currentQuestionIndex];

    switch (currentSection) {
      case "sdm":
        return sdmAnswers[question.id as keyof SDMAnswers];
      case "dcs":
        return dcsAnswers[question.id as keyof DecisionalConflictAnswers];
      case "risk":
        return riskAnswers[question.id as keyof RiskPerceptionAnswers];
      case "satisfaction":
        return satisfactionAnswers[
          question.id as keyof PatientSatisfactionAnswers
        ];
      default:
        return null;
    }
  }, [
    currentSection,
    currentQuestionIndex,
    currentQuestions,
    sdmAnswers,
    dcsAnswers,
    riskAnswers,
    satisfactionAnswers,
  ]);

  const currentAnswer = getCurrentAnswer();
  const isCurrentQuestionAnswered =
    currentAnswer !== null && currentAnswer !== "";

  // ─────────────────────────────────────────────────────────────────────────
  // 7.5 Navigation Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const getSectionInfo = (section: SurveySection) => {
    switch (section) {
      case "sdm":
        return { name: "Shared Decision Making", icon: <Shield size={18} /> };
      case "dcs":
        return { name: "Decisional Conflict", icon: <HelpCircle size={18} /> };
      case "risk":
        return { name: "Risk Perception", icon: <BarChart3 size={18} /> };
      case "satisfaction":
        return { name: "Patient Satisfaction", icon: <Smile size={18} /> };
      default:
        return { name: "", icon: null };
    }
  };

  const handleNext = async () => {
    // Track the answer
    trackingManager.recordEvent({
      eventType: "survey_answer",
      elementId: `${currentSection}_q${currentQuestionIndex + 1}`,
      timestamp: new Date().toISOString(),
      metadata: {
        section: currentSection,
        questionIndex: currentQuestionIndex,
        answer: currentAnswer,
      },
    });

    // Check if we're at the last question in the section
    if (currentQuestionIndex === totalQuestionsInSection - 1) {
      // Submit section data
      await handleSubmitSection();

      // Mark section as completed
      setCompletedSections((prev) => new Set([...prev, currentSection]));

      // Move to next section
      const sectionOrder: SurveySection[] = [
        "welcome",
        "sdm",
        "dcs",
        "risk",
        "satisfaction",
        "complete",
      ];
      const currentIndex = sectionOrder.indexOf(currentSection);
      if (currentIndex < sectionOrder.length - 1) {
        setCurrentSection(sectionOrder[currentIndex + 1]);
        setCurrentQuestionIndex(0);
      }
    } else {
      // Move to next question
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    } else {
      // Go back to previous section's last question
      const sectionOrder: SurveySection[] = [
        "welcome",
        "sdm",
        "dcs",
        "risk",
        "satisfaction",
        "complete",
      ];
      const currentIndex = sectionOrder.indexOf(currentSection);
      if (currentIndex > 1) {
        const prevSection = sectionOrder[currentIndex - 1];
        setCurrentSection(prevSection);

        // Set to last question of previous section
        switch (prevSection) {
          case "sdm":
            setCurrentQuestionIndex(SDM_QUESTIONS.length - 1);
            break;
          case "dcs":
            setCurrentQuestionIndex(DCS_QUESTIONS.length - 1);
            break;
          case "risk":
            setCurrentQuestionIndex(RISK_QUESTIONS.length - 1);
            break;
          case "satisfaction":
            setCurrentQuestionIndex(SATISFACTION_QUESTIONS.length - 1);
            break;
          default:
            setCurrentQuestionIndex(0);
        }
      } else if (currentIndex === 1) {
        setCurrentSection("welcome");
      }
    }
  };

  const handleSectionClick = (section: SurveySection) => {
    // Allow clicking on completed sections or current section
    const sectionOrder: SurveySection[] = [
      "welcome",
      "sdm",
      "dcs",
      "risk",
      "satisfaction",
      "complete",
    ];
    const targetIndex = sectionOrder.indexOf(section);
    const currentIndex = sectionOrder.indexOf(currentSection);

    if (targetIndex <= currentIndex || completedSections.has(section)) {
      setCurrentSection(section);
      setCurrentQuestionIndex(0);
    }
  };

  const handleSubmitSection = async () => {
    setIsSubmitting(true);
    try {
      let surveyType: string;
      let answers: any;

      switch (currentSection) {
        case "sdm":
          surveyType = "sdm";
          answers = sdmAnswers;
          break;
        case "dcs":
          surveyType = "dcs";
          answers = dcsAnswers;
          break;
        case "risk":
          surveyType = "risk_perception";
          answers = riskAnswers;
          break;
        case "satisfaction":
          surveyType = "satisfaction";
          answers = satisfactionAnswers;
          break;
        default:
          return;
      }

      await submitSurvey({
        survey_type: surveyType,
        file: currentFile,
        speaker: currentSpeaker,
        answers: answers,
      });

      setSubmittedSections((prev) => new Set([...prev, currentSection]));

      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: `${currentSection}_submit`,
        timestamp: new Date().toISOString(),
        metadata: { section: currentSection, answers },
      });
    } catch (error) {
      console.error("Section submission error:", error);
      alert("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 7.6 Answer Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleAnswerSelect = (value: any) => {
    const question = currentQuestions[currentQuestionIndex];

    switch (currentSection) {
      case "sdm":
        setSdmAnswers((prev) => ({ ...prev, [question.id]: value }));
        break;
      case "dcs":
        setDcsAnswers((prev) => ({ ...prev, [question.id]: value }));
        break;
      case "risk":
        setRiskAnswers((prev) => ({ ...prev, [question.id]: value }));
        break;
      case "satisfaction":
        setSatisfactionAnswers((prev) => ({ ...prev, [question.id]: value }));
        break;
    }
  };

  const handleToggleSummary = (questionId: string, topic: string) => {
    const isCurrentlyExpanded = expandedSummaries[questionId];
    setExpandedSummaries((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));

    trackingManager.recordEvent({
      eventType: "summary_toggle",
      elementId: `RiskSummary_${questionId}`,
      timestamp: new Date().toISOString(),
      metadata: {
        questionId,
        topic,
        expanded: !isCurrentlyExpanded,
      },
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 7.7 Render Question Content
  // ─────────────────────────────────────────────────────────────────────────

  const renderQuestionContent = () => {
    if (currentQuestions.length === 0) return null;

    const question = currentQuestions[currentQuestionIndex];
    const sectionInfo = getSectionInfo(currentSection);

    // Render SDM Questions
    if (currentSection === "sdm") {
      return (
        <SingleQuestionCard
          questionNumber={currentQuestionIndex + 1}
          questionText={question.text}
          subtitle={sectionInfo.name}
          isDark={isDarkMode}
        >
          <div className="space-y-3">
            {YES_NO_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                value={option.value}
                label={option.label}
                isSelected={currentAnswer === option.value}
                onSelect={() => handleAnswerSelect(option.value)}
                isDark={isDarkMode}
              />
            ))}
          </div>
        </SingleQuestionCard>
      );
    }

    // Render DCS Questions
    if (currentSection === "dcs") {
      return (
        <SingleQuestionCard
          questionNumber={currentQuestionIndex + 1}
          questionText={question.text}
          subtitle={sectionInfo.name}
          isDark={isDarkMode}
        >
          <div className="space-y-3">
            {LIKERT_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                value={option.value}
                label={option.label}
                isSelected={currentAnswer === option.value}
                onSelect={() => handleAnswerSelect(option.value)}
                isDark={isDarkMode}
              />
            ))}
          </div>
        </SingleQuestionCard>
      );
    }

    // Render Risk Perception Questions
    if (currentSection === "risk") {
      const riskQuestion = question as (typeof RISK_QUESTIONS)[0];
      const summaryData = topicSummaries[riskQuestion.topic];
      const colors =
        TOPIC_COLORS[riskQuestion.topic] || TOPIC_COLORS["Cancer Prognosis"];

      return (
        <SingleQuestionCard
          questionNumber={currentQuestionIndex + 1}
          questionText={riskQuestion.text}
          subtitle={`${sectionInfo.name} • ${riskQuestion.topic}`}
          isDark={isDarkMode}
        >
          <div className="space-y-3">
            {RISK_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                value={option.value}
                label={option.label}
                isSelected={currentAnswer === option.value}
                onSelect={() => handleAnswerSelect(option.value)}
                isDark={isDarkMode}
              />
            ))}
          </div>

          {/* Collapsible Summary */}
          {summaryData && (
            <CollapsibleSummary
              topicName={riskQuestion.topic}
              aiSummary={summaryData.aiSummary}
              extractedSentences={summaryData.extractedSentences}
              isExpanded={expandedSummaries[riskQuestion.id] || false}
              onToggle={() =>
                handleToggleSummary(riskQuestion.id, riskQuestion.topic)
              }
              isDark={isDarkMode}
            />
          )}
        </SingleQuestionCard>
      );
    }

    // Render Satisfaction Questions
    if (currentSection === "satisfaction") {
      const satQuestion = question as (typeof SATISFACTION_QUESTIONS)[0];

      if (satQuestion.type === "rating") {
        return (
          <SingleQuestionCard
            questionNumber={currentQuestionIndex + 1}
            questionText={satQuestion.text}
            subtitle={sectionInfo.name}
            isDark={isDarkMode}
          >
            <div className="space-y-3">
              {RATING_OPTIONS.map((option) => (
                <OptionButton
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  isSelected={currentAnswer === option.value}
                  onSelect={() => handleAnswerSelect(option.value)}
                  isDark={isDarkMode}
                />
              ))}
            </div>
          </SingleQuestionCard>
        );
      }

      if (satQuestion.type === "yesNoMaybe") {
        return (
          <SingleQuestionCard
            questionNumber={currentQuestionIndex + 1}
            questionText={satQuestion.text}
            subtitle={sectionInfo.name}
            isDark={isDarkMode}
          >
            <div className="space-y-3">
              {YES_NO_MAYBE_OPTIONS.map((option) => (
                <OptionButton
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  isSelected={currentAnswer === option.value}
                  onSelect={() => handleAnswerSelect(option.value)}
                  isDark={isDarkMode}
                />
              ))}
            </div>
          </SingleQuestionCard>
        );
      }

      if (satQuestion.type === "text") {
        return (
          <SingleQuestionCard
            questionNumber={currentQuestionIndex + 1}
            questionText={satQuestion.text}
            subtitle={sectionInfo.name}
            isDark={isDarkMode}
          >
            <TextAreaInput
              value={(currentAnswer as string) || ""}
              onChange={(value) => handleAnswerSelect(value)}
              placeholder="Share any additional thoughts or feedback..."
              isDark={isDarkMode}
            />
            <p
              className={cx(
                "mt-3 text-xs",
                isDarkMode ? "text-slate-500" : "text-gray-400",
              )}
            >
              This question is optional. You can leave it blank and continue.
            </p>
          </SingleQuestionCard>
        );
      }
    }

    return null;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 7.8 Loading State
  // ─────────────────────────────────────────────────────────────────────────

  if (apiLoading) {
    return (
      <div
        className={cx(
          "min-h-screen flex items-center justify-center",
          isDarkMode
            ? "bg-slate-950"
            : "bg-gradient-to-br from-slate-50 via-white to-gray-100",
        )}
      >
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-5">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          </div>
          <div
            className={cx(
              "text-lg font-medium",
              isDarkMode ? "text-slate-400" : "text-gray-600",
            )}
          >
            Loading survey...
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7.9 Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cx(
        "min-h-screen flex",
        isDarkMode
          ? "bg-slate-950"
          : "bg-gradient-to-br from-slate-50 via-white to-gray-100",
      )}
    >
      {/* Left Sidebar - Progress */}
      <ProgressSidebar
        currentSection={currentSection}
        currentQuestionIndex={currentQuestionIndex}
        completedSections={completedSections}
        onSectionClick={handleSectionClick}
        isDark={isDarkMode}
        sdmAnswers={sdmAnswers}
        dcsAnswers={dcsAnswers}
        riskAnswers={riskAnswers}
        satisfactionAnswers={satisfactionAnswers}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Header */}
        {currentSection !== "welcome" && currentSection !== "complete" && (
          <div
            className={cx(
              "px-8 py-6 border-b backdrop-blur-sm",
              isDarkMode
                ? "border-slate-800 bg-slate-900/80"
                : "border-gray-200 bg-white/80",
            )}
          >
            <div className="flex items-center gap-4">
              <div
                className={cx(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  "bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/30",
                )}
              >
                {getSectionInfo(currentSection).icon}
              </div>
              <div>
                <h2
                  className={cx(
                    "text-xl font-bold",
                    isDarkMode ? "text-white" : "text-gray-900",
                  )}
                >
                  {getSectionInfo(currentSection).name}
                </h2>
                <p
                  className={cx(
                    "text-sm mt-0.5",
                    isDarkMode ? "text-slate-400" : "text-gray-500",
                  )}
                >
                  Question {currentQuestionIndex + 1} of{" "}
                  {totalQuestionsInSection}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-8">
          {/* Welcome */}
          {currentSection === "welcome" && (
            <WelcomeStep
              onNext={() => {
                setCurrentSection("sdm");
                setCurrentQuestionIndex(0);
              }}
              isDark={isDarkMode}
            />
          )}

          {/* Complete */}
          {currentSection === "complete" && (
            <CompleteStep isDark={isDarkMode} />
          )}

          {/* Question Sections */}
          {currentSection !== "welcome" && currentSection !== "complete" && (
            <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
              {/* Question Card */}
              {renderQuestionContent()}

              {/* Progress Bar - At the bottom of each question */}
              <ProgressBar
                current={currentQuestionIndex + 1}
                total={totalQuestionsInSection}
                sectionName={getSectionInfo(currentSection).name}
                isDark={isDarkMode}
              />

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handleBack}
                  className={cx(
                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                    isDarkMode
                      ? "text-slate-300 hover:bg-slate-800 border border-slate-700"
                      : "text-gray-600 hover:bg-gray-100 border border-gray-200",
                  )}
                >
                  <ChevronLeft size={18} />
                  Back
                </button>

                <button
                  onClick={handleNext}
                  disabled={
                    !isCurrentQuestionAnswered &&
                    !(
                      currentSection === "satisfaction" &&
                      SATISFACTION_QUESTIONS[currentQuestionIndex]?.type ===
                        "text"
                    )
                  }
                  className={cx(
                    "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-200",
                    isCurrentQuestionAnswered ||
                      (currentSection === "satisfaction" &&
                        SATISFACTION_QUESTIONS[currentQuestionIndex]?.type ===
                          "text")
                      ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white hover:from-teal-600 hover:to-cyan-700 shadow-lg shadow-teal-500/30 hover:shadow-xl"
                      : isDarkMode
                        ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed",
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : currentQuestionIndex === totalQuestionsInSection - 1 ? (
                    currentSection === "satisfaction" ? (
                      <>
                        Complete Survey
                        <CheckCircle size={18} />
                      </>
                    ) : (
                      <>
                        Next Section
                        <ChevronRight size={18} />
                      </>
                    )
                  ) : (
                    <>
                      Next
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PatientFollowUpReport;
