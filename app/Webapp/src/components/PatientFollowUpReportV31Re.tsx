"use client";

/**
 * PatientSurvey.tsx
 *
 * A dedicated survey page component for post-second-visit surveys.
 * Completely separate from PatientReport to avoid confusion.
 *
 * UPDATED: Risk Perception now shows one question at a time with collapsible summary
 *
 * Key Features:
 * - Multi-step survey flow
 * - One question at a time for ALL surveys (SDM, DCS, Risk, Satisfaction)
 * - Risk Perception: Each question has optional collapsible summary below
 * - Reusable summary module with sentence toggle
 * - Passive engagement tracking
 * - Individual survey submit buttons with Next navigation
 *
 * Survey Flow:
 * 1. Welcome/Introduction
 * 2. SDM - Shared Decision Making (one at a time)
 * 3. Decisional Conflict Survey (one at a time)
 * 4. Risk Perception Survey (one at a time WITH collapsible summaries)
 * 5. Patient Satisfaction (one at a time)
 * 6. Completion/Thank You
 */

import React, { useState, useEffect, useMemo, useRef } from "react";

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
} from "@/components/surveysSecondVersion";

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
} from "lucide-react";

import { submitSurvey } from "@/api/surveyApi";
import { sendTrackingEvents } from "@/api/trackingApi";
import { getOrCreateSession } from "@/tracking/utils/session.utils";

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

interface PatientSurveyProps {
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

// Topic Colors (from PatientFollowUpReport)
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

const RISK_ANSWER_OPTIONS = [
  { value: "very_low", label: "Very Low (0-10%)" },
  { value: "low", label: "Low (11-30%)" },
  { value: "moderate", label: "Moderate (31-50%)" },
  { value: "high", label: "High (51-70%)" },
  { value: "very_high", label: "Very High (71-100%)" },
  { value: "not_sure", label: "Not Sure" },
];

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
   SECTION 4: REUSABLE COMPONENTS
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 4.1 AI Summary Badge (from PatientFollowUpReport)
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
// 4.2 Collapsible Summary (from PatientFollowUpReport)
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
// 4.3 Progress Sidebar
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
        "w-64 flex-shrink-0 p-6 border-r",
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200",
      )}
    >
      <h3
        className={cx(
          "text-xs font-semibold uppercase tracking-wider mb-4",
          isDark ? "text-slate-400" : "text-gray-500",
        )}
      >
        Survey Progress
      </h3>

      <div className="space-y-1">
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
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                isCurrent
                  ? isDark
                    ? "bg-blue-600 text-white"
                    : "bg-blue-600 text-white"
                  : isCompleted || isPast
                    ? isDark
                      ? "text-slate-300 hover:bg-slate-800"
                      : "text-gray-700 hover:bg-gray-100"
                    : isDark
                      ? "text-slate-500 cursor-not-allowed"
                      : "text-gray-400 cursor-not-allowed",
              )}
            >
              <span
                className={cx(
                  "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
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
                  <Check size={14} />
                ) : (
                  STEP_INFO[step].icon
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className={cx(
                    "text-sm font-medium truncate",
                    isCurrent && "text-white",
                  )}
                >
                  {STEP_INFO[step].title}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div className="mt-6 pt-6 border-t border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <span
            className={cx(
              "text-xs",
              isDark ? "text-slate-500" : "text-gray-400",
            )}
          >
            Progress
          </span>
          <span
            className={cx(
              "text-xs font-medium",
              isDark ? "text-slate-300" : "text-gray-600",
            )}
          >
            {Math.round((currentIndex / (SURVEY_STEPS.length - 1)) * 100)}%
          </span>
        </div>
        <div
          className={cx(
            "w-full h-1.5 rounded-full overflow-hidden",
            isDark ? "bg-slate-800" : "bg-gray-200",
          )}
        >
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
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
        "flex items-center justify-between mt-8 pt-6 border-t",
        isDark ? "border-slate-700" : "border-gray-200",
      )}
    >
      {showBack ? (
        <button
          onClick={onBack}
          className={cx(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            isDark
              ? "text-slate-300 hover:bg-slate-800"
              : "text-gray-600 hover:bg-gray-100",
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
            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors",
            nextDisabled
              ? isDark
                ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
              : isDark
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "bg-blue-600 text-white hover:bg-blue-700",
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
// 5.1 Welcome Step
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
      <div
        className={cx(
          "w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center",
          isDark ? "bg-blue-900/50" : "bg-blue-50",
        )}
      >
        <FileText
          size={32}
          className={isDark ? "text-blue-400" : "text-blue-600"}
        />
      </div>

      <h1
        className={cx(
          "text-2xl font-semibold mb-3",
          isDark ? "text-slate-100" : "text-gray-900",
        )}
      >
        Welcome to Your Follow-Up Survey
      </h1>

      <p
        className={cx(
          "text-base mb-8 leading-relaxed",
          isDark ? "text-slate-400" : "text-gray-600",
        )}
      >
        Thank you for taking the time to complete this survey. Your feedback
        helps us improve the quality of our consultation reports and patient
        care.
        <br />
        <br />
        This survey will take approximately <strong>10-15 minutes</strong> to
        complete.
      </p>

      <div
        className={cx(
          "p-4 rounded-lg mb-8 text-left",
          isDark ? "bg-slate-800/50" : "bg-gray-50",
        )}
      >
        <h3
          className={cx(
            "text-sm font-semibold mb-3",
            isDark ? "text-slate-200" : "text-gray-800",
          )}
        >
          What to expect:
        </h3>
        <ul
          className={cx(
            "space-y-2 text-sm",
            isDark ? "text-slate-400" : "text-gray-600",
          )}
        >
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            Questions about your consultation experience
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            Your feelings about making a treatment decision
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            Your understanding of treatment risks (with consultation summaries
            for reference)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            Your overall satisfaction with the consultation report
          </li>
        </ul>
      </div>

      <button
        onClick={onNext}
        className={cx(
          "inline-flex items-center gap-2 px-8 py-3 rounded-lg text-base font-medium transition-colors",
          isDark
            ? "bg-blue-600 text-white hover:bg-blue-500"
            : "bg-blue-600 text-white hover:bg-blue-700",
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
      <div
        className={cx(
          "w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center",
          isDark ? "bg-green-900/50" : "bg-green-50",
        )}
      >
        <CheckCircle
          size={32}
          className={isDark ? "text-green-400" : "text-green-600"}
        />
      </div>

      <h1
        className={cx(
          "text-2xl font-semibold mb-3",
          isDark ? "text-slate-100" : "text-gray-900",
        )}
      >
        Thank You!
      </h1>

      <p
        className={cx(
          "text-base mb-8 leading-relaxed",
          isDark ? "text-slate-400" : "text-gray-600",
        )}
      >
        Your responses have been recorded successfully.
        <br />
        <br />
        Your feedback is invaluable in helping us improve the consultation
        experience for future patients.
      </p>

      <div
        className={cx(
          "p-4 rounded-lg text-left",
          isDark ? "bg-slate-800/50" : "bg-gray-50",
        )}
      >
        <p
          className={cx("text-sm", isDark ? "text-slate-400" : "text-gray-600")}
        >
          If you have any questions or concerns, please contact your healthcare
          provider or our support team.
        </p>
      </div>
    </div>
  );
};

/* =============================================================================
   SECTION 6: RISK PERCEPTION WITH SUMMARY (ONE QUESTION AT A TIME)
============================================================================= */

interface RiskPerceptionWithSummaryProps {
  answers: RiskPerceptionAnswers;
  onChange: (questionId: keyof RiskPerceptionAnswers, value: string) => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  summaries: TopicSummaryMap;
  isDark?: boolean;
  onTrackEvent?: (event: any) => void;
}

const RiskPerceptionWithSummary: React.FC<RiskPerceptionWithSummaryProps> = ({
  answers,
  onChange,
  onSubmit,
  isSubmitting = false,
  summaries,
  isDark,
  onTrackEvent,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);
  const [expandedSummaries, setExpandedSummaries] = React.useState<
    Record<string, boolean>
  >({});

  const totalQuestions = RISK_QUESTIONS.length;
  const currentQuestion = RISK_QUESTIONS[currentQuestionIndex];
  const currentAnswer =
    answers[currentQuestion.id as keyof RiskPerceptionAnswers];
  const isCurrentAnswered = currentAnswer !== null;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
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

  const summaryData = summaries[currentQuestion.topic];
  const colors =
    TOPIC_COLORS[currentQuestion.topic] || TOPIC_COLORS["Cancer Prognosis"];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Topic Badge */}
      <div className="flex items-center gap-2">
        <div
          className={cx(
            "w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br",
            colors.iconBg,
          )}
        >
          {currentQuestionIndex + 1}
        </div>
        <span
          className={cx(
            "text-xs font-medium px-2 py-1 rounded-full",
            isDark
              ? "bg-slate-800 text-slate-400"
              : "bg-gray-100 text-gray-500",
          )}
        >
          {currentQuestion.topic}
        </span>
      </div>

      {/* Question Card */}
      <div
        className={cx(
          "p-6 rounded-xl border",
          isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200",
        )}
      >
        <p
          className={cx(
            "text-lg font-semibold mb-6 leading-relaxed",
            isDark ? "text-white" : "text-gray-900",
          )}
        >
          {currentQuestion.text}
        </p>

        {/* Answer Options */}
        <div className="space-y-3">
          {RISK_ANSWER_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cx(
                "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border-2",
                currentAnswer === option.value
                  ? isDark
                    ? "bg-blue-900/30 border-blue-500"
                    : "bg-blue-50 border-blue-400"
                  : isDark
                    ? "border-slate-700 hover:bg-slate-700"
                    : "border-gray-200 hover:bg-gray-50",
              )}
            >
              <input
                type="radio"
                name={currentQuestion.id}
                value={option.value}
                checked={currentAnswer === option.value}
                onChange={() => {
                  onChange(
                    currentQuestion.id as keyof RiskPerceptionAnswers,
                    option.value,
                  );
                  onTrackEvent?.({
                    eventType: "survey_answer",
                    elementId: `RiskPerception_${currentQuestion.id}`,
                    metadata: {
                      questionId: currentQuestion.id,
                      answer: option.value,
                      topic: currentQuestion.topic,
                    },
                  });
                }}
                className="sr-only"
              />
              <span
                className={cx(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                  currentAnswer === option.value
                    ? "border-blue-500 bg-blue-500"
                    : isDark
                      ? "border-slate-500"
                      : "border-gray-300",
                )}
              >
                {currentAnswer === option.value && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </span>
              <span
                className={cx(
                  "text-sm font-medium",
                  isDark ? "text-slate-300" : "text-gray-700",
                )}
              >
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Collapsible Summary */}
      {summaryData && (
        <CollapsibleSummary
          topicName={currentQuestion.topic}
          aiSummary={summaryData.aiSummary}
          extractedSentences={summaryData.extractedSentences}
          isExpanded={expandedSummaries[currentQuestion.id] || false}
          onToggle={() =>
            handleToggleSummary(currentQuestion.id, currentQuestion.topic)
          }
          isDark={isDark}
        />
      )}

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span
            className={cx(
              "text-sm font-medium",
              isDark ? "text-slate-300" : "text-gray-600",
            )}
          >
            Question {currentQuestionIndex + 1} of {totalQuestions}
          </span>
          <span
            className={cx(
              "text-sm font-medium",
              isDark ? "text-rose-400" : "text-rose-600",
            )}
          >
            {Math.round(((currentQuestionIndex + 1) / totalQuestions) * 100)}%
          </span>
        </div>
        <div
          className={cx(
            "w-full h-2 rounded-full",
            isDark ? "bg-slate-700" : "bg-gray-200",
          )}
        >
          <div
            className="h-2 rounded-full bg-rose-500 transition-all duration-300"
            style={{
              width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-end">
        {!isLastQuestion ? (
          <button
            onClick={handleNext}
            disabled={!isCurrentAnswered}
            className={cx(
              "px-6 py-3 rounded-lg text-sm font-semibold transition-all",
              isCurrentAnswered
                ? isDark
                  ? "bg-rose-700 text-rose-100 hover:bg-rose-600"
                  : "bg-rose-600 text-white hover:bg-rose-700"
                : isDark
                  ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed",
            )}
          >
            Next
          </button>
        ) : (
          onSubmit && (
            <button
              onClick={onSubmit}
              disabled={!isCurrentAnswered || isSubmitting}
              data-track-proximity="RiskPerception_Submit_Button"
              className={cx(
                "px-8 py-3 rounded-lg text-sm font-semibold transition-all shadow-lg",
                isCurrentAnswered && !isSubmitting
                  ? isDark
                    ? "bg-rose-700 text-rose-100 hover:bg-rose-600 hover:shadow-xl"
                    : "bg-rose-600 text-white hover:bg-rose-700 hover:shadow-xl"
                  : isDark
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed",
              )}
            >
              {isSubmitting ? "Submitting..." : "Submit Responses"}
            </button>
          )
        )}
      </div>
    </div>
  );
};

/* =============================================================================
   SECTION 7: MAIN COMPONENT
============================================================================= */

const PatientSurvey: React.FC<PatientSurveyProps> = ({
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
  // 7.3b Track time spent on report page (Feedback 2-9)
  //       + Send tracking events to backend on page unload / visibility change
  // ─────────────────────────────────────────────────────────────────────────
  const pageLoadTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const flushEvents = () => {
      const events = trackingManager.getEvents();
      if (events.length === 0) return;

      const session = getOrCreateSession();
      sendTrackingEvents(
        session.sessionId,
        currentFile,
        currentSpeaker,
        session.deviceType,
        events,
        true, // keepalive for unload
      );
      trackingManager.clear();
    };

    const recordTimeSpent = () => {
      const durationMs = Date.now() - pageLoadTimeRef.current;
      if (durationMs < 1000) return; // ignore < 1s visits
      trackingManager.recordEvent({
        eventType: "dwell_time",
        elementId: "page_total_time",
        timestamp: new Date().toISOString(),
        metadata: { dwellTimeMs: durationMs, page: "followup_visit" },
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        recordTimeSpent();
        flushEvents();
        pageLoadTimeRef.current = Date.now();
      }
    };

    const handleBeforeUnload = () => {
      recordTimeSpent();
      flushEvents();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      recordTimeSpent();
      flushEvents(); // flush on unmount
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
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
    trackingManager.recordEvent({
      eventType: "survey_answer",
      elementId: `SDM_${String(questionId)}`,
      timestamp: new Date().toISOString(),
      metadata: { survey: "sdm", questionId: String(questionId), answer: value },
    });
  };

  const handleDCSChange = (
    questionId: keyof DecisionalConflictAnswers,
    value: LikertAnswer,
  ) => {
    setDcsAnswers((prev) => ({ ...prev, [questionId]: value }));
    trackingManager.recordEvent({
      eventType: "survey_answer",
      elementId: `DCS_${String(questionId)}`,
      timestamp: new Date().toISOString(),
      metadata: { survey: "dcs", questionId: String(questionId), answer: value },
    });
  };

  const handleRiskChange = (
    questionId: keyof RiskPerceptionAnswers,
    value: string,
  ) => {
    setRiskAnswers((prev) => ({ ...prev, [questionId]: value }));
    trackingManager.recordEvent({
      eventType: "survey_answer",
      elementId: `Risk_${String(questionId)}`,
      timestamp: new Date().toISOString(),
      metadata: { survey: "risk_perception", questionId: String(questionId), answer: value },
    });
  };

  const handleSatisfactionChange = (
    field: keyof PatientSatisfactionAnswers,
    value: any,
  ) => {
    setSatisfactionAnswers((prev) => ({ ...prev, [field]: value }));
    trackingManager.recordEvent({
      eventType: "survey_answer",
      elementId: `Satisfaction_${String(field)}`,
      timestamp: new Date().toISOString(),
      metadata: { survey: "satisfaction", questionId: String(field), answer: typeof value === "string" ? value : JSON.stringify(value) },
    });
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
          isDarkMode ? "bg-slate-950" : "bg-gray-50",
        )}
      >
        <div className="text-center">
          <div
            className={cx(
              "animate-spin rounded-full h-10 w-10 border-2 border-t-transparent mb-4 mx-auto",
              isDarkMode ? "border-blue-400" : "border-blue-600",
            )}
          />
          <div
            className={cx(
              "text-base",
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
        isDarkMode ? "bg-slate-950" : "bg-gray-50",
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
          className={cx("min-h-full", isDarkMode ? "bg-slate-900" : "bg-white")}
        >
          {/* Header */}
          <div
            className={cx(
              "px-8 py-6 border-b",
              isDarkMode ? "border-slate-800" : "border-gray-200",
            )}
          >
            <h2
              className={cx(
                "text-xl font-semibold",
                isDarkMode ? "text-slate-100" : "text-gray-900",
              )}
            >
              {STEP_INFO[currentStep].title}
            </h2>
            <p
              className={cx(
                "text-sm mt-1",
                isDarkMode ? "text-slate-400" : "text-gray-500",
              )}
            >
              {STEP_INFO[currentStep].description}
            </p>
          </div>

          {/* Step Content */}
          <div className="px-8 py-6">
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
                      "mt-6 p-4 rounded-lg flex items-center gap-3",
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
                      "mt-6 p-4 rounded-lg flex items-center gap-3",
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

            {/* Risk Perception - ONE QUESTION AT A TIME WITH COLLAPSIBLE SUMMARY */}
            {currentStep === "risk" && (
              <div>
                <div
                  className={cx(
                    "mb-6 p-4 rounded-lg max-w-2xl mx-auto",
                    isDarkMode ? "bg-blue-900/20" : "bg-blue-50",
                  )}
                >
                  <p
                    className={cx(
                      "text-sm",
                      isDarkMode ? "text-blue-300" : "text-blue-700",
                    )}
                  >
                    <strong>Note:</strong> For each question, you can optionally
                    view the relevant summary from your consultation below the
                    question.
                  </p>
                </div>

                <RiskPerceptionWithSummary
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
                      "mt-6 p-4 rounded-lg flex items-center gap-3 max-w-2xl mx-auto",
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

                <div className="max-w-2xl mx-auto">
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
                      "mt-6 p-4 rounded-lg flex items-center gap-3",
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

export default PatientSurvey;
