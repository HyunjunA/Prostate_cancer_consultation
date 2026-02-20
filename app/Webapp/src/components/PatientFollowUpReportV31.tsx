"use client";

/**
 * PatientSurvey.tsx
 *
 * A dedicated survey page component for post-second-visit surveys.
 * Completely separate from PatientReport to avoid confusion.
 *
 * Key Features:
 * - Multi-step survey flow
 * - Two-panel layout for Risk Perception (summary on left, questions on right)
 * - Single-panel layout for SDM, DCS, Satisfaction, Baseline
 * - Reusable summary module with sentence toggle
 * - Passive engagement tracking
 * - Individual survey submit buttons with Next navigation
 *
 * Survey Flow:
 * 1. Welcome/Introduction
 * 2. SDM - Shared Decision Making (no summary)
 * 3. Decisional Conflict Survey (no summary)
 * 4. Risk Perception Survey (WITH domain-specific summaries)
 * 5. Patient Satisfaction (no summary)
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
// 4.1 Summary Card with Sentence Toggle
// ─────────────────────────────────────────────────────────────────────────────

interface SummaryCardProps {
  topicName: string;
  aiSummary: string;
  extractedSentences?: string[];
  isDark?: boolean;
  trackingPrefix?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  topicName,
  aiSummary,
  extractedSentences = [],
  isDark,
  trackingPrefix = "Summary",
}) => {
  const [showSentences, setShowSentences] = useState(false);

  const handleToggle = () => {
    const newState = !showSentences;
    setShowSentences(newState);
    trackingManager.recordEvent({
      eventType: "summary_toggle",
      elementId: `${trackingPrefix}_${topicName.replace(/\s+/g, "")}`,
      timestamp: new Date().toISOString(),
      metadata: { topic: topicName, expanded: newState },
    });
  };

  return (
    <div
      className={cx(
        "rounded-lg border p-5",
        isDark
          ? "bg-slate-800/50 border-slate-700"
          : "bg-gray-50 border-gray-200",
      )}
    >
      {/* Topic Header */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className={cx(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            isDark ? "bg-blue-900/50" : "bg-blue-50",
          )}
        >
          <FileText
            size={16}
            className={isDark ? "text-blue-400" : "text-blue-600"}
          />
        </div>
        <h4
          className={cx(
            "text-sm font-semibold",
            isDark ? "text-slate-200" : "text-gray-800",
          )}
        >
          {topicName}
        </h4>
      </div>

      {/* AI Summary */}
      <p
        className={cx(
          "text-sm leading-relaxed mb-3",
          isDark ? "text-slate-300" : "text-gray-600",
        )}
      >
        {aiSummary}
      </p>

      {/* Sentence Toggle */}
      {extractedSentences.length > 0 && (
        <div>
          <button
            type="button"
            onClick={handleToggle}
            className={cx(
              "flex items-center gap-1.5 text-xs font-medium transition-colors",
              isDark
                ? "text-blue-400 hover:text-blue-300"
                : "text-blue-600 hover:text-blue-700",
            )}
          >
            {showSentences ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
            {showSentences
              ? "Hide supporting statements"
              : "Show supporting statements from your consultation"}
          </button>

          {showSentences && (
            <div className="mt-3 space-y-2">
              {extractedSentences.map((sentence, idx) => (
                <div
                  key={idx}
                  className={cx(
                    "p-3 rounded-lg border-l-2",
                    isDark
                      ? "bg-slate-900/50 border-l-blue-500"
                      : "bg-white border-l-blue-400",
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
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4.2 Progress Sidebar
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
// 4.3 Navigation Buttons (Updated: removed submit, added nextDisabled)
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
   SECTION 6: RISK PERCEPTION WITH SUMMARY (Two-Panel Layout)
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
  // Group questions by topic for better UX
  const groupedQuestions = useMemo(() => {
    const groups: {
      topic: string;
      questions: typeof RISK_QUESTIONS;
    }[] = [];

    const topicOrder = [
      "Cancer Prognosis",
      "Erectile Dysfunction",
      "Urinary Incontinence",
      "Irritative Urinary Symptoms",
    ];

    topicOrder.forEach((topic) => {
      const questionsForTopic = RISK_QUESTIONS.filter((q) => q.topic === topic);
      if (questionsForTopic.length > 0) {
        groups.push({ topic, questions: questionsForTopic });
      }
    });

    return groups;
  }, []);

  const answeredCount = Object.values(answers).filter((v) => v !== null).length;
  const totalCount = 5;
  const isComplete = answeredCount === totalCount;

  return (
    <div className="space-y-8">
      {/* Progress indicator */}
      <div
        className={cx(
          "p-4 rounded-lg border",
          isDark
            ? "bg-slate-800/50 border-slate-700"
            : "bg-gray-50 border-gray-200",
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className={cx(
              "text-sm",
              isDark ? "text-slate-400" : "text-gray-500",
            )}
          >
            Risk Perception Progress
          </span>
          <span
            className={cx(
              "text-sm font-medium",
              answeredCount === totalCount
                ? "text-green-600"
                : isDark
                  ? "text-slate-300"
                  : "text-gray-700",
            )}
          >
            {answeredCount}/{totalCount} answered
          </span>
        </div>
        <div
          className={cx(
            "w-full h-1.5 rounded-full overflow-hidden",
            isDark ? "bg-slate-700" : "bg-gray-200",
          )}
        >
          <div
            className={cx(
              "h-full rounded-full transition-all duration-300",
              answeredCount === totalCount ? "bg-green-500" : "bg-blue-500",
            )}
            style={{ width: `${(answeredCount / totalCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Questions grouped by topic with summary on left */}
      {groupedQuestions.map(({ topic, questions }) => {
        const summaryData = summaries[topic];

        return (
          <div
            key={topic}
            className={cx(
              "rounded-xl border overflow-hidden",
              isDark ? "border-slate-700" : "border-gray-200",
            )}
          >
            {/* Topic Header */}
            <div
              className={cx(
                "px-5 py-3 border-b",
                isDark
                  ? "bg-slate-800 border-slate-700"
                  : "bg-gray-100 border-gray-200",
              )}
            >
              <h3
                className={cx(
                  "text-sm font-semibold",
                  isDark ? "text-slate-200" : "text-gray-800",
                )}
              >
                {topic}
              </h3>
            </div>

            {/* Two-Panel Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-700">
              {/* Left Panel: Summary */}
              <div
                className={cx("p-5", isDark ? "bg-slate-900/50" : "bg-white")}
              >
                <div className="mb-3">
                  <span
                    className={cx(
                      "text-xs font-medium uppercase tracking-wider",
                      isDark ? "text-slate-500" : "text-gray-400",
                    )}
                  >
                    Your Consultation Summary
                  </span>
                </div>
                {summaryData ? (
                  <SummaryCard
                    topicName={topic}
                    aiSummary={summaryData.aiSummary}
                    extractedSentences={summaryData.extractedSentences}
                    isDark={isDark}
                    trackingPrefix="RiskSurvey"
                  />
                ) : (
                  <p
                    className={cx(
                      "text-sm italic",
                      isDark ? "text-slate-500" : "text-gray-400",
                    )}
                  >
                    Summary not available for this topic.
                  </p>
                )}
              </div>

              {/* Right Panel: Questions */}
              <div
                className={cx("p-5", isDark ? "bg-slate-800/30" : "bg-gray-50")}
              >
                <div className="mb-3">
                  <span
                    className={cx(
                      "text-xs font-medium uppercase tracking-wider",
                      isDark ? "text-slate-500" : "text-gray-400",
                    )}
                  >
                    Questions
                  </span>
                </div>
                <div className="space-y-5">
                  {questions.map((question, qIdx) => {
                    const questionKey =
                      question.id as keyof RiskPerceptionAnswers;
                    const currentValue = answers[questionKey];

                    return (
                      <div
                        key={question.id}
                        className={cx(
                          "p-4 rounded-lg border",
                          isDark
                            ? "bg-slate-800/50 border-slate-700"
                            : "bg-white border-gray-200",
                        )}
                      >
                        <p
                          className={cx(
                            "text-sm font-medium mb-3",
                            isDark ? "text-slate-200" : "text-gray-800",
                          )}
                        >
                          <span
                            className={cx(
                              "inline-flex items-center justify-center w-5 h-5 rounded text-xs font-medium mr-2",
                              isDark
                                ? "bg-slate-700 text-slate-300"
                                : "bg-gray-100 text-gray-600",
                            )}
                          >
                            {RISK_QUESTIONS.findIndex(
                              (q) => q.id === question.id,
                            ) + 1}
                          </span>
                          {question.text}
                        </p>

                        {/* Answer Options */}
                        <div className="space-y-2">
                          {[
                            { value: "very_low", label: "Very Low (0-10%)" },
                            { value: "low", label: "Low (11-30%)" },
                            { value: "moderate", label: "Moderate (31-50%)" },
                            { value: "high", label: "High (51-70%)" },
                            {
                              value: "very_high",
                              label: "Very High (71-100%)",
                            },
                            { value: "not_sure", label: "Not Sure" },
                          ].map((option) => (
                            <label
                              key={option.value}
                              className={cx(
                                "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                currentValue === option.value
                                  ? isDark
                                    ? "bg-blue-900/30 border border-blue-500"
                                    : "bg-blue-50 border border-blue-300"
                                  : isDark
                                    ? "hover:bg-slate-700"
                                    : "hover:bg-gray-50",
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
                                  "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                  currentValue === option.value
                                    ? "border-blue-500 bg-blue-500"
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
                                  "text-sm",
                                  isDark ? "text-slate-300" : "text-gray-700",
                                )}
                              >
                                {option.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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
              "px-8 py-4 rounded-lg text-lg font-semibold transition-all shadow-lg",
              isComplete && !isSubmitting
                ? isDark
                  ? "bg-rose-700 text-rose-100 hover:bg-rose-600 hover:shadow-xl"
                  : "bg-rose-600 text-white hover:bg-rose-700 hover:shadow-xl"
                : isDark
                  ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed",
            )}
          >
            {isSubmitting
              ? "Submitting..."
              : isComplete
                ? "Submit Responses"
                : `Answer all ${totalCount} questions`}
          </button>
        </div>
      )}
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

  // Submission State (separate: isSubmitting for loading, isSubmitted for completion)
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
  // 7.7 Individual Submit Handlers (only submit, don't navigate)
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

            {/* SDM - FIXED: Added mx-auto for center alignment */}
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

                {/* Submitted Success Message */}
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

            {/* DCS - FIXED: Added mx-auto for center alignment */}
            {currentStep === "dcs" && (
              <div className="max-w-3xl mx-auto">
                <DecisionalConflictSurvey
                  answers={dcsAnswers}
                  onChange={handleDCSChange}
                  onSubmit={handleSubmitDCS}
                  isDark={isDarkMode}
                  onTrackEvent={handleTrackEvent}
                />

                {/* Submitted Success Message */}
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

            {/* Risk Perception - TWO PANEL LAYOUT */}
            {currentStep === "risk" && (
              <div>
                <div
                  className={cx(
                    "mb-6 p-4 rounded-lg",
                    isDarkMode ? "bg-blue-900/20" : "bg-blue-50",
                  )}
                >
                  <p
                    className={cx(
                      "text-sm",
                      isDarkMode ? "text-blue-300" : "text-blue-700",
                    )}
                  >
                    <strong>Note:</strong> For each question below, we've
                    included the relevant summary from your consultation on the
                    left for your reference. This may help you recall what was
                    discussed during your visit.
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

                {/* Submitted Success Message */}
                {riskSubmitted && (
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
                  nextDisabled={!riskSubmitted}
                  nextLabel="Continue to Next Section"
                  isDark={isDarkMode}
                />
              </div>
            )}

            {/* Satisfaction - FIXED: Added mx-auto for center alignment */}
            {currentStep === "satisfaction" && (
              <div className="max-w-2xl mx-auto">
                <PatientSatisfactionSurvey
                  answers={satisfactionAnswers}
                  onChange={handleSatisfactionChange}
                  onSubmit={handleSubmitSatisfaction}
                  isDark={isDarkMode}
                  onTrackEvent={handleTrackEvent}
                />

                {/* Submitted Success Message */}
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
