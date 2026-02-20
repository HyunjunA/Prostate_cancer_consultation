"use client";

/**
 * PatientFollowUpReport.tsx
 *
 * Second Visit 환자 페이지 - 설문 전용 컴포넌트
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
 * [오픈 이슈 - Tim 확인 필요]
 * - Second visit 정의 불명확 (어떤 이벤트를 second visit으로 간주하는지)
 * - Summary 포함 여부 미확정 (현재 Risk Perception에 포함되어 있으나 확정 아님)
 * - Baseline 설문 부재 (사전지식 측정 없음 - 연구 설계 우려사항)
 *
 * [명시적으로 제외된 것]
 * - 첫 방문 요약 5개 재평가 기능
 * - 근거 문장 클릭 트래킹 (First visit 기능)
 * - 별점 rating (필수 요구사항 아님)
 *
 * ============================================================================
 *
 * Survey Flow:
 * 1. Welcome/Introduction (목적 및 프로토콜 안내)
 * 2. SDM - Shared Decision Making
 * 3. Decisional Conflict Survey
 * 4. Risk Perception Survey (TODO: Summary 포함 여부 확정 필요 - 현재 collapsible로 구현)
 * 5. Patient Satisfaction
 * 6. Completion/Thank You
 */

import React, { useState, useEffect, useMemo } from "react";

import { usePatientId } from "@/stores/usePatientId";
import { useFileId } from "@/stores/useFileId";
import { usePatientData } from "@/hooks/usePatientData";

// Survey Components & Types
import {
  SDMSurvey,
  INITIAL_SDM_ANSWERS,
  type YesNoAnswer,
  type ScaleAnswer,
  type SDMAnswers,
  DecisionalConflictSurvey,
  INITIAL_DCS_ANSWERS,
  type DecisionalConflictAnswers,
  type LikertAnswer,
  INITIAL_RISK_ANSWERS,
  type RiskPerceptionAnswers,
  PatientSatisfactionSurvey,
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
  Check,
  Sparkles,
  MessageSquareText,
  Info,
} from "lucide-react";

import { submitSurvey } from "@/api/surveyApi";

/* =============================================================================
   SECTION 1: TRACKING SYSTEM (Same as PatientReport)
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

// Survey Steps
type SurveyStep =
  | "welcome"
  | "sdm"
  | "dcs"
  | "risk"
  | "satisfaction"
  | "complete";

const SURVEY_STEPS: SurveyStep[] = [
  "welcome",
  "sdm",
  "dcs",
  "risk",
  "satisfaction",
  "complete",
];

const STEP_INFO: Record<
  SurveyStep,
  { title: string; description: string; icon: React.ReactNode }
> = {
  welcome: {
    title: "Welcome",
    description: "Introduction to the survey",
    icon: <FileText size={18} />,
  },
  sdm: {
    title: "Shared Decision Making",
    description: "Your consultation experience",
    icon: <Shield size={18} />,
  },
  dcs: {
    title: "Decisional Conflict",
    description: "Your treatment decision",
    icon: <HelpCircle size={18} />,
  },
  risk: {
    title: "Risk Perception",
    description: "Understanding of risks",
    icon: <BarChart3 size={18} />,
  },
  satisfaction: {
    title: "Satisfaction",
    description: "Your feedback",
    icon: <Smile size={18} />,
  },
  complete: {
    title: "Complete",
    description: "Thank you",
    icon: <CheckCircle size={18} />,
  },
};

// Topic Mapping (same as PatientReport)
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

// Risk Perception Question → Topic Mapping
const RISK_QUESTION_TO_TOPIC: Record<string, string> = {
  q1: "Cancer Prognosis",
  q2: "Cancer Prognosis",
  q3: "Erectile Dysfunction",
  q4: "Urinary Incontinence",
  q5: "Irritative Urinary Symptoms",
};

// Risk Perception Questions (for reference display)
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

// Topic Colors (aligned with PatientReportFirstVisit.tsx)
const TOPIC_COLORS: Record<
  string,
  { gradient: string; iconBg: string; border: string; light: string }
> = {
  "Cancer Prognosis": {
    gradient: "from-rose-500/10 via-pink-500/10 to-fuchsia-500/10",
    iconBg: "from-rose-500 to-pink-500",
    border: "border-rose-200/50 dark:border-rose-500/20",
    light: "bg-rose-50 border-rose-200",
  },
  "Life Expectancy": {
    gradient: "from-violet-500/10 via-purple-500/10 to-indigo-500/10",
    iconBg: "from-violet-500 to-purple-500",
    border: "border-violet-200/50 dark:border-violet-500/20",
    light: "bg-violet-50 border-violet-200",
  },
  "Erectile Dysfunction": {
    gradient: "from-sky-500/10 via-cyan-500/10 to-teal-500/10",
    iconBg: "from-sky-500 to-cyan-500",
    border: "border-sky-200/50 dark:border-sky-500/20",
    light: "bg-sky-50 border-sky-200",
  },
  "Urinary Incontinence": {
    gradient: "from-emerald-500/10 via-green-500/10 to-teal-500/10",
    iconBg: "from-emerald-500 to-green-500",
    border: "border-emerald-200/50 dark:border-emerald-500/20",
    light: "bg-emerald-50 border-emerald-200",
  },
  "Irritative Urinary Symptoms": {
    gradient: "from-amber-500/10 via-orange-500/10 to-yellow-500/10",
    iconBg: "from-amber-500 to-orange-500",
    border: "border-amber-200/50 dark:border-amber-500/20",
    light: "bg-amber-50 border-amber-200",
  },
};

/* =============================================================================
   SECTION 3: UTILITY FUNCTIONS
============================================================================= */

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

// Type alias for summaries
type TopicSummaryMap = Record<
  string,
  { aiSummary: string; extractedSentences: string[] }
>;

/* =============================================================================
   SECTION 4: REUSABLE COMPONENTS (Aligned with PatientReportFirstVisit.tsx)
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 4.1 AI Summary Badge - Required for patient trust/accountability/ethics
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
          ? "bg-violet-500/20 text-violet-300 border border-violet-400/30"
          : "bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 text-violet-600 border border-violet-300/50",
      )}
    >
      <Sparkles size={10} />
      AI-generated
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4.2 Collapsible Summary Card (for Risk Perception questions)
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
    <div className="mt-4">
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
              ? "bg-slate-800/60 border-l-indigo-500 border-y border-r border-slate-700/50"
              : "bg-gradient-to-r border-l-indigo-500 border-y border-r border-gray-100 shadow-sm",
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
// 4.3 Progress Sidebar (Updated design)
// ─────────────────────────────────────────────────────────────────────────────

interface ProgressSidebarProps {
  currentStep: SurveyStep;
  completedSteps: Set<SurveyStep>;
  onStepClick: (step: SurveyStep) => void;
  isDark?: boolean;
}

const ProgressSidebar: React.FC<ProgressSidebarProps> = ({
  currentStep,
  completedSteps,
  onStepClick,
  isDark,
}) => {
  const currentIndex = SURVEY_STEPS.indexOf(currentStep);

  return (
    <div
      className={cx(
        "w-72 flex-shrink-0 p-6 border-r",
        isDark
          ? "bg-slate-900/80 border-slate-800"
          : "bg-gradient-to-b from-white to-gray-50/80 border-gray-200",
      )}
    >
      <h3
        className={cx(
          "text-xs font-bold uppercase tracking-wider mb-6",
          isDark ? "text-slate-500" : "text-gray-400",
        )}
      >
        Survey Progress
      </h3>

      <div className="space-y-2">
        {SURVEY_STEPS.map((step, index) => {
          const isCompleted = completedSteps.has(step);
          const isCurrent = step === currentStep;
          const isPast = index < currentIndex;
          const isClickable = isPast || isCompleted || isCurrent;

          return (
            <button
              key={step}
              onClick={() => isClickable && onStepClick(step)}
              disabled={!isClickable}
              className={cx(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200",
                isCurrent
                  ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30"
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
                        ? "bg-green-900/50 text-green-400"
                        : "bg-green-100 text-green-600"
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
                  {STEP_INFO[step].description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Progress Bar */}
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
            {Math.round((currentIndex / (SURVEY_STEPS.length - 1)) * 100)}%
          </span>
        </div>
        <div
          className={cx(
            "w-full h-2 rounded-full overflow-hidden",
            isDark ? "bg-slate-800" : "bg-gray-200",
          )}
        >
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full transition-all duration-500"
            style={{
              width: `${(currentIndex / (SURVEY_STEPS.length - 1)) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4.4 Navigation Buttons
// ─────────────────────────────────────────────────────────────────────────────

interface NavigationButtonsProps {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  showBack?: boolean;
  showNext?: boolean;
  nextDisabled?: boolean;
  isDark?: boolean;
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  onBack,
  onNext,
  backLabel = "Back",
  nextLabel = "Continue",
  showBack = true,
  showNext = true,
  nextDisabled = false,
  isDark,
}) => {
  return (
    <div
      className={cx(
        "flex items-center justify-between mt-10 pt-6 border-t",
        isDark ? "border-slate-700" : "border-gray-200",
      )}
    >
      {showBack ? (
        <button
          onClick={onBack}
          className={cx(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            isDark
              ? "text-slate-300 hover:bg-slate-800 border border-slate-700"
              : "text-gray-600 hover:bg-gray-100 border border-gray-200",
          )}
        >
          <ChevronLeft size={18} />
          {backLabel}
        </button>
      ) : (
        <div />
      )}

      {showNext ? (
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className={cx(
            "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-200",
            nextDisabled
              ? isDark
                ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-lg shadow-indigo-500/30 hover:shadow-xl",
          )}
        >
          {nextLabel}
          <ChevronRight size={18} />
        </button>
      ) : (
        <div />
      )}
    </div>
  );
};

/* =============================================================================
   SECTION 5: STEP CONTENT COMPONENTS
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 5.1 Welcome Step (Updated with protocol explanation per requirements)
// ─────────────────────────────────────────────────────────────────────────────

interface WelcomeStepProps {
  onNext: () => void;
  isDark?: boolean;
  patientName?: string;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({
  onNext,
  isDark,
  patientName,
}) => {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      {/* Icon */}
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-500/30">
        <FileText size={36} className="text-white" />
      </div>

      <h1
        className={cx(
          "text-3xl font-bold mb-4 tracking-tight",
          isDark ? "text-white" : "text-gray-900",
        )}
      >
        Follow-Up Survey
      </h1>

      {/* Protocol Explanation (Required per specification) */}
      <div
        className={cx(
          "relative overflow-hidden rounded-2xl p-6 mb-8 text-left",
          "backdrop-blur-xl border",
          isDark
            ? "bg-gradient-to-br from-indigo-950/60 to-violet-950/60 border-indigo-500/20"
            : "bg-gradient-to-br from-white/80 to-indigo-50/80 border-indigo-200/50 shadow-xl shadow-indigo-500/5",
        )}
      >
        {/* Decorative elements */}
        <div
          className={cx(
            "absolute -top-16 -right-16 w-32 h-32 rounded-full blur-2xl",
            isDark ? "bg-indigo-500/20" : "bg-indigo-300/30",
          )}
        />

        <div className="relative flex items-start gap-4">
          <div
            className={cx(
              "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center",
              "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30",
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
                isDark ? "text-indigo-100/80" : "text-gray-600",
              )}
            >
              <p>
                This survey is part of your <strong>follow-up protocol</strong>{" "}
                after your second consultation visit. The purpose of this survey
                is to:
              </p>
              <ul className="space-y-2 ml-1">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2" />
                  <span>
                    Assess your{" "}
                    <strong>understanding of treatment risks</strong> discussed
                    during your consultation
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2" />
                  <span>
                    Measure your <strong>risk perception</strong> for different
                    treatment options
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2" />
                  <span>
                    Help us understand if the AI summary helped you ask more
                    informed questions
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* What to expect */}
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
          <li className="flex items-start gap-3">
            <span
              className={cx(
                "flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold",
                isDark
                  ? "bg-slate-700 text-slate-300"
                  : "bg-gray-200 text-gray-600",
              )}
            >
              1
            </span>
            <span>Questions about your consultation experience</span>
          </li>
          <li className="flex items-start gap-3">
            <span
              className={cx(
                "flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold",
                isDark
                  ? "bg-slate-700 text-slate-300"
                  : "bg-gray-200 text-gray-600",
              )}
            >
              2
            </span>
            <span>Your feelings about making a treatment decision</span>
          </li>
          <li className="flex items-start gap-3">
            <span
              className={cx(
                "flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold",
                isDark
                  ? "bg-slate-700 text-slate-300"
                  : "bg-gray-200 text-gray-600",
              )}
            >
              3
            </span>
            <span>
              Your understanding of treatment risks (with optional AI summaries
              for reference)
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span
              className={cx(
                "flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold",
                isDark
                  ? "bg-slate-700 text-slate-300"
                  : "bg-gray-200 text-gray-600",
              )}
            >
              4
            </span>
            <span>Your overall satisfaction with the consultation</span>
          </li>
        </ul>
        <p
          className={cx(
            "mt-4 text-xs",
            isDark ? "text-slate-500" : "text-gray-400",
          )}
        >
          Estimated time: 10-15 minutes
        </p>
      </div>

      <button
        onClick={onNext}
        className={cx(
          "inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold transition-all duration-200",
          "bg-gradient-to-r from-indigo-500 to-violet-600 text-white",
          "hover:from-indigo-600 hover:to-violet-700 shadow-lg shadow-indigo-500/30 hover:shadow-xl",
        )}
      >
        Start Survey
        <ChevronRight size={20} />
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.2 Complete Step
// ─────────────────────────────────────────────────────────────────────────────

interface CompleteStepProps {
  isDark?: boolean;
}

const CompleteStep: React.FC<CompleteStepProps> = ({ isDark }) => {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 bg-gradient-to-br from-green-500 to-emerald-600 shadow-2xl shadow-green-500/30">
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
   SECTION 6: RISK PERCEPTION WITH COLLAPSIBLE SUMMARY PER QUESTION
============================================================================= */

interface RiskPerceptionWithCollapsibleSummaryProps {
  answers: RiskPerceptionAnswers;
  onChange: (questionId: keyof RiskPerceptionAnswers, value: string) => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  summaries: TopicSummaryMap;
  isDark?: boolean;
  onTrackEvent?: (event: any) => void;
}

const RiskPerceptionWithCollapsibleSummary: React.FC<
  RiskPerceptionWithCollapsibleSummaryProps
> = ({
  answers,
  onChange,
  onSubmit,
  isSubmitting = false,
  summaries,
  isDark,
  onTrackEvent,
}) => {
  // Track which summaries are expanded (all collapsed by default)
  const [expandedSummaries, setExpandedSummaries] = useState<
    Record<string, boolean>
  >({});

  const handleToggleSummary = (questionId: string, topic: string) => {
    const isCurrentlyExpanded = expandedSummaries[questionId];
    setExpandedSummaries((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));

    // Track the toggle event
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

  const answeredCount = Object.values(answers).filter((v) => v !== null).length;
  const totalCount = 5;
  const isComplete = answeredCount === totalCount;

  const answerOptions = [
    { value: "very_low", label: "Very Low (0-10%)" },
    { value: "low", label: "Low (11-30%)" },
    { value: "moderate", label: "Moderate (31-50%)" },
    { value: "high", label: "High (51-70%)" },
    { value: "very_high", label: "Very High (71-100%)" },
    { value: "not_sure", label: "Not Sure" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Progress indicator */}
      <div
        className={cx(
          "p-5 rounded-2xl border",
          isDark
            ? "bg-slate-800/50 border-slate-700"
            : "bg-white border-gray-200 shadow-sm",
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className={cx(
              "text-sm font-medium",
              isDark ? "text-slate-400" : "text-gray-500",
            )}
          >
            Questions Answered
          </span>
          <span
            className={cx(
              "text-sm font-bold",
              answeredCount === totalCount
                ? "text-green-500"
                : isDark
                  ? "text-slate-300"
                  : "text-gray-700",
            )}
          >
            {answeredCount} / {totalCount}
          </span>
        </div>
        <div
          className={cx(
            "w-full h-2 rounded-full overflow-hidden",
            isDark ? "bg-slate-700" : "bg-gray-200",
          )}
        >
          <div
            className={cx(
              "h-full rounded-full transition-all duration-500",
              answeredCount === totalCount
                ? "bg-gradient-to-r from-green-500 to-emerald-500"
                : "bg-gradient-to-r from-indigo-500 to-violet-600",
            )}
            style={{ width: `${(answeredCount / totalCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Questions - Each with collapsible summary below */}
      {RISK_QUESTIONS.map((question, index) => {
        const questionKey = question.id as keyof RiskPerceptionAnswers;
        const currentValue = answers[questionKey];
        const summaryData = summaries[question.topic];
        const colors =
          TOPIC_COLORS[question.topic] || TOPIC_COLORS["Cancer Prognosis"];
        const isAnswered = currentValue !== null;

        return (
          <div
            key={question.id}
            data-track-proximity={`RiskQuestion_${question.id}`}
            className={cx(
              "rounded-2xl overflow-hidden border transition-all duration-300",
              isDark
                ? "bg-slate-900/60 border-slate-700/50"
                : "bg-white border-gray-200 shadow-sm",
              isAnswered &&
                (isDark
                  ? "ring-2 ring-green-500/30 border-green-500/30"
                  : "ring-2 ring-green-300/50 border-green-300/50"),
            )}
          >
            {/* Question Header */}
            <div className={cx("px-6 py-5 bg-gradient-to-r", colors.gradient)}>
              <div className="flex items-start gap-4">
                <div
                  className={cx(
                    "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold",
                    "bg-gradient-to-br",
                    colors.iconBg,
                  )}
                >
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p
                    className={cx(
                      "text-base font-semibold leading-relaxed",
                      isDark ? "text-white" : "text-gray-900",
                    )}
                  >
                    {question.text}
                  </p>
                  <span
                    className={cx(
                      "inline-flex items-center gap-1 mt-2 text-xs font-medium",
                      isDark ? "text-slate-400" : "text-gray-500",
                    )}
                  >
                    Topic: {question.topic}
                  </span>
                </div>
                {isAnswered && (
                  <div className="flex-shrink-0">
                    <CheckCircle
                      size={24}
                      className={isDark ? "text-green-400" : "text-green-500"}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Answer Options */}
            <div
              className={cx(
                "px-6 py-5",
                isDark ? "bg-slate-900/40" : "bg-gray-50/50",
              )}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {answerOptions.map((option) => (
                  <label
                    key={option.value}
                    className={cx(
                      "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 border",
                      currentValue === option.value
                        ? isDark
                          ? "bg-indigo-900/40 border-indigo-500 ring-2 ring-indigo-500/30"
                          : "bg-indigo-50 border-indigo-400 ring-2 ring-indigo-300/50"
                        : isDark
                          ? "bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600"
                          : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300",
                    )}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={option.value}
                      checked={currentValue === option.value}
                      onChange={() => {
                        onChange(questionKey, option.value);
                        onTrackEvent?.({
                          eventType: "survey_answer",
                          elementId: `RiskPerception_${question.id}`,
                          metadata: {
                            questionId: question.id,
                            answer: option.value,
                            topic: question.topic,
                          },
                        });
                      }}
                      className="sr-only"
                    />
                    <span
                      className={cx(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                        currentValue === option.value
                          ? "border-indigo-500 bg-indigo-500"
                          : isDark
                            ? "border-slate-500"
                            : "border-gray-300",
                      )}
                    >
                      {currentValue === option.value && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <span
                      className={cx(
                        "text-sm font-medium",
                        currentValue === option.value
                          ? isDark
                            ? "text-indigo-300"
                            : "text-indigo-700"
                          : isDark
                            ? "text-slate-300"
                            : "text-gray-700",
                      )}
                    >
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>

              {/* Collapsible Summary (TODO: Summary inclusion pending Tim confirmation) */}
              {summaryData && (
                <CollapsibleSummary
                  topicName={question.topic}
                  aiSummary={summaryData.aiSummary}
                  extractedSentences={summaryData.extractedSentences}
                  isExpanded={expandedSummaries[question.id] || false}
                  onToggle={() =>
                    handleToggleSummary(question.id, question.topic)
                  }
                  isDark={isDark}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* Submit Button */}
      {onSubmit && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={onSubmit}
            disabled={!isComplete || isSubmitting}
            data-track-proximity="RiskPerception_Submit_Button"
            className={cx(
              "px-10 py-4 rounded-xl text-lg font-bold transition-all duration-200",
              isComplete && !isSubmitting
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-lg shadow-indigo-500/30 hover:shadow-xl"
                : isDark
                  ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed",
            )}
          >
            {isSubmitting
              ? "Submitting..."
              : isComplete
                ? "Submit Responses"
                : `Answer all ${totalCount} questions to continue`}
          </button>
        </div>
      )}
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

  // Navigation State
  const [currentStep, setCurrentStep] = useState<SurveyStep>("welcome");
  const [completedSteps, setCompletedSteps] = useState<Set<SurveyStep>>(
    new Set(),
  );

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

  // Submission State
  const [isSubmittingSDM, setIsSubmittingSDM] = useState(false);
  const [sdmSubmitted, setSdmSubmitted] = useState(false);

  const [isSubmittingDCS, setIsSubmittingDCS] = useState(false);
  const [dcsSubmitted, setDcsSubmitted] = useState(false);

  const [isSubmittingRisk, setIsSubmittingRisk] = useState(false);
  const [riskSubmitted, setRiskSubmitted] = useState(false);

  const [isSubmittingSatisfaction, setIsSubmittingSatisfaction] =
    useState(false);
  const [satisfactionSubmitted, setSatisfactionSubmitted] = useState(false);

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
            extractedSentences: [], // TODO: Add extracted sentences when available
          };
        }
      });
    }

    return summaries;
  }, [summaryData]);

  // ─────────────────────────────────────────────────────────────────────────
  // 7.5 Navigation Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const goToStep = (step: SurveyStep) => {
    setCurrentStep(step);
    trackingManager.recordEvent({
      eventType: "survey_step_view",
      elementId: `Step_${step}`,
      timestamp: new Date().toISOString(),
      metadata: { step },
    });
  };

  const goNext = () => {
    const currentIndex = SURVEY_STEPS.indexOf(currentStep);
    if (currentIndex < SURVEY_STEPS.length - 1) {
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      goToStep(SURVEY_STEPS[currentIndex + 1]);
    }
  };

  const goBack = () => {
    const currentIndex = SURVEY_STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      goToStep(SURVEY_STEPS[currentIndex - 1]);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 7.6 Survey Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleSDMChange = (
    questionId: keyof SDMAnswers,
    value: YesNoAnswer | ScaleAnswer,
  ) => {
    setSdmAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleDCSChange = (
    questionId: keyof DecisionalConflictAnswers,
    value: LikertAnswer,
  ) => {
    setDcsAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleRiskChange = (
    questionId: keyof RiskPerceptionAnswers,
    value: string,
  ) => {
    setRiskAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSatisfactionChange = (
    field: keyof PatientSatisfactionAnswers,
    value: any,
  ) => {
    setSatisfactionAnswers((prev) => ({ ...prev, [field]: value }));
  };

  const handleTrackEvent = (eventData: any) => {
    trackingManager.recordEvent({
      ...eventData,
      timestamp: new Date().toISOString(),
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 7.7 Individual Submit Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleSubmitSDM = async () => {
    setIsSubmittingSDM(true);
    try {
      await submitSurvey({
        survey_type: "sdm",
        file: currentFile,
        speaker: currentSpeaker,
        answers: sdmAnswers,
      });

      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: "SDM_Submit",
        timestamp: new Date().toISOString(),
        metadata: { answers: sdmAnswers },
      });

      setSdmSubmitted(true);
    } catch (error) {
      console.error("SDM submission error:", error);
      alert("Failed to submit. Please try again.");
    } finally {
      setIsSubmittingSDM(false);
    }
  };

  const handleSubmitDCS = async () => {
    setIsSubmittingDCS(true);
    try {
      await submitSurvey({
        survey_type: "dcs",
        file: currentFile,
        speaker: currentSpeaker,
        answers: dcsAnswers,
      });

      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: "DCS_Submit",
        timestamp: new Date().toISOString(),
        metadata: { answers: dcsAnswers },
      });

      setDcsSubmitted(true);
    } catch (error) {
      console.error("DCS submission error:", error);
      alert("Failed to submit. Please try again.");
    } finally {
      setIsSubmittingDCS(false);
    }
  };

  const handleSubmitRisk = async () => {
    setIsSubmittingRisk(true);
    try {
      await submitSurvey({
        survey_type: "risk_perception",
        file: currentFile,
        speaker: currentSpeaker,
        answers: riskAnswers,
      });

      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: "Risk_Submit",
        timestamp: new Date().toISOString(),
        metadata: { answers: riskAnswers },
      });

      setRiskSubmitted(true);
    } catch (error) {
      console.error("Risk submission error:", error);
      alert("Failed to submit. Please try again.");
    } finally {
      setIsSubmittingRisk(false);
    }
  };

  const handleSubmitSatisfaction = async () => {
    setIsSubmittingSatisfaction(true);
    try {
      await submitSurvey({
        survey_type: "satisfaction",
        file: currentFile,
        speaker: currentSpeaker,
        answers: satisfactionAnswers,
      });

      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: "Satisfaction_Submit",
        timestamp: new Date().toISOString(),
        metadata: { answers: satisfactionAnswers },
      });

      setSatisfactionSubmitted(true);
    } catch (error) {
      console.error("Satisfaction submission error:", error);
      alert("Failed to submit. Please try again.");
    } finally {
      setIsSubmittingSatisfaction(false);
    }
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
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 animate-pulse" />
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
      {/* Sidebar */}
      <ProgressSidebar
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={goToStep}
        isDark={isDarkMode}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div
          className={cx(
            "min-h-full",
            isDarkMode ? "bg-slate-900/50" : "bg-white/50",
          )}
        >
          {/* Header */}
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
                  "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30",
                )}
              >
                {STEP_INFO[currentStep].icon}
              </div>
              <div>
                <h2
                  className={cx(
                    "text-xl font-bold",
                    isDarkMode ? "text-white" : "text-gray-900",
                  )}
                >
                  {STEP_INFO[currentStep].title}
                </h2>
                <p
                  className={cx(
                    "text-sm mt-0.5",
                    isDarkMode ? "text-slate-400" : "text-gray-500",
                  )}
                >
                  {STEP_INFO[currentStep].description}
                </p>
              </div>
            </div>
          </div>

          {/* Step Content */}
          <div className="px-8 py-8">
            {/* Welcome */}
            {currentStep === "welcome" && (
              <WelcomeStep onNext={goNext} isDark={isDarkMode} />
            )}

            {/* SDM */}
            {currentStep === "sdm" && (
              <div className="max-w-2xl mx-auto">
                <SDMSurvey
                  answers={sdmAnswers}
                  onChange={handleSDMChange}
                  onSubmit={handleSubmitSDM}
                  isDark={isDarkMode}
                  interventionName="treatment"
                  onTrackEvent={handleTrackEvent}
                />

                {sdmSubmitted && (
                  <div
                    className={cx(
                      "mt-6 p-4 rounded-xl flex items-center gap-3",
                      isDarkMode
                        ? "bg-green-900/30 border border-green-700"
                        : "bg-green-50 border border-green-200",
                    )}
                  >
                    <CheckCircle
                      size={20}
                      className={
                        isDarkMode ? "text-green-400" : "text-green-600"
                      }
                    />
                    <span
                      className={cx(
                        "text-sm font-medium",
                        isDarkMode ? "text-green-300" : "text-green-700",
                      )}
                    >
                      Responses submitted successfully!
                    </span>
                  </div>
                )}

                <NavigationButtons
                  onBack={goBack}
                  onNext={goNext}
                  showNext={true}
                  nextDisabled={!sdmSubmitted}
                  nextLabel="Continue to Next Section"
                  isDark={isDarkMode}
                />
              </div>
            )}

            {/* DCS */}
            {currentStep === "dcs" && (
              <div className="max-w-3xl mx-auto">
                <DecisionalConflictSurvey
                  answers={dcsAnswers}
                  onChange={handleDCSChange}
                  onSubmit={handleSubmitDCS}
                  isDark={isDarkMode}
                  onTrackEvent={handleTrackEvent}
                />

                {dcsSubmitted && (
                  <div
                    className={cx(
                      "mt-6 p-4 rounded-xl flex items-center gap-3",
                      isDarkMode
                        ? "bg-green-900/30 border border-green-700"
                        : "bg-green-50 border border-green-200",
                    )}
                  >
                    <CheckCircle
                      size={20}
                      className={
                        isDarkMode ? "text-green-400" : "text-green-600"
                      }
                    />
                    <span
                      className={cx(
                        "text-sm font-medium",
                        isDarkMode ? "text-green-300" : "text-green-700",
                      )}
                    >
                      Responses submitted successfully!
                    </span>
                  </div>
                )}

                <NavigationButtons
                  onBack={goBack}
                  onNext={goNext}
                  showNext={true}
                  nextDisabled={!dcsSubmitted}
                  nextLabel="Continue to Next Section"
                  isDark={isDarkMode}
                />
              </div>
            )}

            {/* Risk Perception - NEW: Collapsible Summary per Question */}
            {currentStep === "risk" && (
              <div>
                {/* Info Banner */}
                <div
                  className={cx(
                    "max-w-3xl mx-auto mb-8 p-5 rounded-2xl border",
                    isDarkMode
                      ? "bg-indigo-950/40 border-indigo-500/20"
                      : "bg-indigo-50/80 border-indigo-200/50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Info
                      size={20}
                      className={
                        isDarkMode ? "text-indigo-400" : "text-indigo-600"
                      }
                    />
                    <div>
                      <p
                        className={cx(
                          "text-sm font-medium",
                          isDarkMode ? "text-indigo-300" : "text-indigo-700",
                        )}
                      >
                        For each question, you can optionally view the relevant
                        AI-generated summary from your consultation by clicking
                        the toggle button below the answer options.
                      </p>
                    </div>
                  </div>
                </div>

                <RiskPerceptionWithCollapsibleSummary
                  answers={riskAnswers}
                  onChange={handleRiskChange}
                  onSubmit={handleSubmitRisk}
                  isSubmitting={isSubmittingRisk}
                  summaries={topicSummaries}
                  isDark={isDarkMode}
                  onTrackEvent={handleTrackEvent}
                />

                {riskSubmitted && (
                  <div
                    className={cx(
                      "max-w-3xl mx-auto mt-6 p-4 rounded-xl flex items-center gap-3",
                      isDarkMode
                        ? "bg-green-900/30 border border-green-700"
                        : "bg-green-50 border border-green-200",
                    )}
                  >
                    <CheckCircle
                      size={20}
                      className={
                        isDarkMode ? "text-green-400" : "text-green-600"
                      }
                    />
                    <span
                      className={cx(
                        "text-sm font-medium",
                        isDarkMode ? "text-green-300" : "text-green-700",
                      )}
                    >
                      Responses submitted successfully!
                    </span>
                  </div>
                )}

                <div className="max-w-3xl mx-auto">
                  <NavigationButtons
                    onBack={goBack}
                    onNext={goNext}
                    showNext={true}
                    nextDisabled={!riskSubmitted}
                    nextLabel="Continue to Next Section"
                    isDark={isDarkMode}
                  />
                </div>
              </div>
            )}

            {/* Satisfaction */}
            {currentStep === "satisfaction" && (
              <div className="max-w-2xl mx-auto">
                <PatientSatisfactionSurvey
                  answers={satisfactionAnswers}
                  onChange={handleSatisfactionChange}
                  onSubmit={handleSubmitSatisfaction}
                  isDark={isDarkMode}
                  onTrackEvent={handleTrackEvent}
                />

                {satisfactionSubmitted && (
                  <div
                    className={cx(
                      "mt-6 p-4 rounded-xl flex items-center gap-3",
                      isDarkMode
                        ? "bg-green-900/30 border border-green-700"
                        : "bg-green-50 border border-green-200",
                    )}
                  >
                    <CheckCircle
                      size={20}
                      className={
                        isDarkMode ? "text-green-400" : "text-green-600"
                      }
                    />
                    <span
                      className={cx(
                        "text-sm font-medium",
                        isDarkMode ? "text-green-300" : "text-green-700",
                      )}
                    >
                      Feedback submitted successfully!
                    </span>
                  </div>
                )}

                <NavigationButtons
                  onBack={goBack}
                  onNext={() => {
                    setCompletedSteps(
                      (prev) => new Set([...prev, "satisfaction"]),
                    );
                    goToStep("complete");
                  }}
                  showNext={true}
                  nextDisabled={!satisfactionSubmitted}
                  nextLabel="Complete Survey"
                  isDark={isDarkMode}
                />
              </div>
            )}

            {/* Complete */}
            {currentStep === "complete" && <CompleteStep isDark={isDarkMode} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientFollowUpReport;
