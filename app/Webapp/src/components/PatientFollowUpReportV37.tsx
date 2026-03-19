"use client";

/**
 * PatientFollowUpReport.tsx
 *
 * Second Visit 환자 페이지 - 설문 전용 컴포넌트
 * Uses MODIFIED Survey components with one-question-at-a-time navigation
 * Healthcare Theme (Teal/Cyan/Sky/Emerald/Blue color scheme)
 */

import React, { useState, useEffect } from "react";

import { usePatientId } from "@/stores/usePatientId";
import { useFileId } from "@/stores/useFileId";
import { usePatientData } from "@/hooks/usePatientData";

// Survey Components & Types - Using MODIFIED components
import {
  SDMSurvey,
  INITIAL_SDM_ANSWERS,
  SDM_QUESTIONS,
  type YesNoAnswer,
  type ScaleAnswer,
  type SDMAnswers,
  DecisionalConflictSurvey,
  INITIAL_DCS_ANSWERS,
  DCS_QUESTIONS,
  type DecisionalConflictAnswers,
  type LikertAnswer,
  RiskPerceptionSurvey,
  INITIAL_RISK_ANSWERS,
  type RiskPerceptionAnswers,
  PatientSatisfactionSurvey,
  INITIAL_SATISFACTION_ANSWERS,
  type PatientSatisfactionAnswers,
} from "@/components/surveysSecondVersion";

import {
  ChevronRight,
  CheckCircle,
  FileText,
  Shield,
  HelpCircle,
  BarChart3,
  Smile,
  Check,
  Info,
} from "lucide-react";

import { submitSurvey } from "@/api/surveyApi";
import { sendTrackingEvents } from "@/api/trackingApi";
import { getOrCreateSession } from "@/tracking/utils/session.utils";

/* =============================================================================
   SECTION 1: TRACKING SYSTEM
============================================================================= */

interface TrackingEvent {
  eventType: string;
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
  { title: string; description: string; icon: React.ReactNode; color: string }
> = {
  welcome: {
    title: "Welcome",
    description: "Introduction to the survey",
    icon: <FileText size={18} />,
    color: "teal",
  },
  sdm: {
    title: "Shared Decision Making",
    description: "Your consultation experience",
    icon: <Shield size={18} />,
    color: "teal",
  },
  dcs: {
    title: "Decisional Conflict",
    description: "Your treatment decision",
    icon: <HelpCircle size={18} />,
    color: "sky",
  },
  risk: {
    title: "Risk Perception",
    description: "Understanding of risks",
    icon: <BarChart3 size={18} />,
    color: "emerald",
  },
  satisfaction: {
    title: "Satisfaction",
    description: "Your feedback",
    icon: <Smile size={18} />,
    color: "blue",
  },
  complete: {
    title: "Complete",
    description: "Thank you",
    icon: <CheckCircle size={18} />,
    color: "emerald",
  },
};

// Question counts
const QUESTION_COUNTS = {
  sdm: SDM_QUESTIONS.length,
  dcs: DCS_QUESTIONS.length,
  risk: 5,
  satisfaction: 1,
};

/* =============================================================================
   SECTION 3: UTILITY
============================================================================= */

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/* =============================================================================
   SECTION 4: PROGRESS SIDEBAR
============================================================================= */

interface ProgressSidebarProps {
  currentStep: SurveyStep;
  completedSteps: Set<SurveyStep>;
  onStepClick: (step: SurveyStep) => void;
  isDark?: boolean;
  overallProgress: { current: number; total: number };
}

const ProgressSidebar: React.FC<ProgressSidebarProps> = ({
  currentStep,
  completedSteps,
  onStepClick,
  isDark,
  overallProgress,
}) => {
  const currentIndex = SURVEY_STEPS.indexOf(currentStep);
  const progressPercent = Math.round(
    (overallProgress.current / overallProgress.total) * 100,
  );

  return (
    <div
      className={cx(
        "w-72 flex-shrink-0 p-6 border-r h-full flex flex-col",
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

      <div className="space-y-2 flex-1">
        {SURVEY_STEPS.map((step, index) => {
          const isCompleted = completedSteps.has(step);
          const isCurrent = step === currentStep;
          const isPast = index < currentIndex;
          const isClickable = isPast || isCompleted || isCurrent;
          const info = STEP_INFO[step];

          return (
            <button
              key={step}
              onClick={() => isClickable && onStepClick(step)}
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
                {isCompleted && !isCurrent ? <Check size={16} /> : info.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className={cx(
                    "text-sm font-semibold truncate",
                    isCurrent && "text-white",
                  )}
                >
                  {info.title}
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
                  {info.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Overall Progress */}
      <div
        className={cx(
          "mt-6 pt-6 border-t",
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
            {progressPercent}%
          </span>
        </div>
        <div
          className={cx(
            "w-full h-2 rounded-full overflow-hidden",
            isDark ? "bg-slate-800" : "bg-gray-200",
          )}
        >
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-cyan-600 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p
          className={cx(
            "text-xs mt-2",
            isDark ? "text-slate-500" : "text-gray-400",
          )}
        >
          {overallProgress.current} of {overallProgress.total} questions
        </p>
      </div>
    </div>
  );
};

/* =============================================================================
   SECTION 5: WELCOME STEP
============================================================================= */

interface WelcomeStepProps {
  onNext: () => void;
  isDark?: boolean;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext, isDark }) => {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 bg-gradient-to-br from-teal-500 to-cyan-600 shadow-2xl shadow-teal-500/30">
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

      <div
        className={cx(
          "relative overflow-hidden rounded-2xl p-6 mb-8 text-left backdrop-blur-xl border",
          isDark
            ? "bg-gradient-to-br from-teal-950/60 to-cyan-950/60 border-teal-500/20"
            : "bg-gradient-to-br from-white/80 to-teal-50/80 border-teal-200/50 shadow-xl shadow-teal-500/5",
        )}
      >
        <div
          className={cx(
            "absolute -top-16 -right-16 w-32 h-32 rounded-full blur-2xl",
            isDark ? "bg-teal-500/20" : "bg-teal-300/30",
          )}
        />

        <div className="relative flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/30">
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
            <span>4 questions about shared decision making</span>
          </li>
          <li className="flex items-center gap-3">
            <HelpCircle size={18} className="text-sky-500 flex-shrink-0" />
            <span>16 questions about your treatment decision</span>
          </li>
          <li className="flex items-center gap-3">
            <BarChart3 size={18} className="text-emerald-500 flex-shrink-0" />
            <span>5 questions about risk perception</span>
          </li>
          <li className="flex items-center gap-3">
            <Smile size={18} className="text-blue-500 flex-shrink-0" />
            <span>1 feedback question about your satisfaction</span>
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
        className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 bg-gradient-to-r from-teal-500 to-cyan-600 text-white hover:from-teal-600 hover:to-cyan-700 shadow-lg shadow-teal-500/30 hover:shadow-xl"
      >
        Start Survey <ChevronRight size={20} />
      </button>
    </div>
  );
};

/* =============================================================================
   SECTION 6: COMPLETE STEP
============================================================================= */

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
  const { patientId } = usePatientId();
  const { fileId } = useFileId();
  const { fetchSummaryDetail } = usePatientData();

  const currentFile = fileId || "quality-coded-nlp-pilot-sid-1.xlsx";
  const currentSpeaker = patientId || "Patient_quality-coded-nlp-pilot-sid-1";

  // Navigation State
  const [currentStep, setCurrentStep] = useState<SurveyStep>("welcome");
  const [completedSteps, setCompletedSteps] = useState<Set<SurveyStep>>(
    new Set(),
  );

  // Question indices for each section
  const [sdmQuestionIndex, setSdmQuestionIndex] = useState(0);
  const [dcsQuestionIndex, setDcsQuestionIndex] = useState(0);
  const [riskQuestionIndex, setRiskQuestionIndex] = useState(0);
  const [satisfactionQuestionIndex, setSatisfactionQuestionIndex] = useState(0);

  // Survey Answers
  const [sdmAnswers, setSdmAnswers] = useState<SDMAnswers>(INITIAL_SDM_ANSWERS);
  const [dcsAnswers, setDcsAnswers] =
    useState<DecisionalConflictAnswers>(INITIAL_DCS_ANSWERS);
  const [riskAnswers, setRiskAnswers] =
    useState<RiskPerceptionAnswers>(INITIAL_RISK_ANSWERS);
  const [satisfactionAnswers, setSatisfactionAnswers] =
    useState<PatientSatisfactionAnswers>(INITIAL_SATISFACTION_ANSWERS);

  // Submission State
  const [sdmSubmitted, setSdmSubmitted] = useState(false);
  const [dcsSubmitted, setDcsSubmitted] = useState(false);
  const [riskSubmitted, setRiskSubmitted] = useState(false);
  const [satisfactionSubmitted, setSatisfactionSubmitted] = useState(false);

  // API State
  const [apiLoading, setApiLoading] = useState(true);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchSummaryDetail(currentFile, currentSpeaker);
      } catch (err) {
        console.error("Error loading summary:", err);
      } finally {
        setApiLoading(false);
      }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile, currentSpeaker]);

  // Send tracking events to backend on page unload / visibility change
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
        true,
      );
      trackingManager.clear();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushEvents();
      }
    };

    const handleBeforeUnload = () => {
      flushEvents();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      flushEvents();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [currentFile, currentSpeaker]);

  // Calculate overall progress
  const calculateProgress = () => {
    const total =
      QUESTION_COUNTS.sdm +
      QUESTION_COUNTS.dcs +
      QUESTION_COUNTS.risk +
      QUESTION_COUNTS.satisfaction;
    let current = 0;
    current += Object.values(sdmAnswers).filter((v) => v !== null).length;
    current += Object.values(dcsAnswers).filter((v) => v !== null).length;
    current += Object.values(riskAnswers).filter((v) => v !== null).length;
    current += satisfactionAnswers.feedbackText.trim().length > 0 ? 1 : 0;
    return { current, total };
  };

  // Navigation handlers
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

  // Submit handlers
  const handleSubmitSDM = async () => {
    try {
      await submitSurvey({
        survey_type: "sdm",
        file: currentFile,
        speaker: currentSpeaker,
        answers: sdmAnswers,
      });
      setSdmSubmitted(true);
      goNext();
    } catch (error) {
      console.error("SDM submission error:", error);
      alert("Failed to submit. Please try again.");
    }
  };

  const handleSubmitDCS = async () => {
    try {
      await submitSurvey({
        survey_type: "dcs",
        file: currentFile,
        speaker: currentSpeaker,
        answers: dcsAnswers,
      });
      setDcsSubmitted(true);
      goNext();
    } catch (error) {
      console.error("DCS submission error:", error);
      alert("Failed to submit. Please try again.");
    }
  };

  const handleSubmitRisk = async () => {
    try {
      await submitSurvey({
        survey_type: "risk_perception",
        file: currentFile,
        speaker: currentSpeaker,
        answers: riskAnswers,
      });
      setRiskSubmitted(true);
      goNext();
    } catch (error) {
      console.error("Risk submission error:", error);
      alert("Failed to submit. Please try again.");
    }
  };

  const handleSubmitSatisfaction = async () => {
    try {
      await submitSurvey({
        survey_type: "satisfaction",
        file: currentFile,
        speaker: currentSpeaker,
        answers: satisfactionAnswers,
      });
      setSatisfactionSubmitted(true);
      setCompletedSteps((prev) => new Set([...prev, "satisfaction"]));
      goToStep("complete");
    } catch (error) {
      console.error("Satisfaction submission error:", error);
      alert("Failed to submit. Please try again.");
    }
  };

  // Track event handler
  const handleTrackEvent = (eventData: any) => {
    trackingManager.recordEvent({
      ...eventData,
      timestamp: new Date().toISOString(),
    });
  };

  // Loading state
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

  // Main render
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
        overallProgress={calculateProgress()}
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
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/30">
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
            {currentStep === "welcome" && (
              <WelcomeStep onNext={goNext} isDark={isDarkMode} />
            )}

            {currentStep === "sdm" && (
              <div className="max-w-2xl mx-auto">
                <SDMSurvey
                  answers={sdmAnswers}
                  onChange={(qId, val) =>
                    setSdmAnswers((prev) => ({ ...prev, [qId]: val }))
                  }
                  onSubmit={handleSubmitSDM}
                  isDark={isDarkMode}
                  interventionName="treatment"
                  onTrackEvent={handleTrackEvent}
                  currentQuestionIndex={sdmQuestionIndex}
                  onNext={() =>
                    setSdmQuestionIndex((prev) =>
                      Math.min(prev + 1, QUESTION_COUNTS.sdm - 1),
                    )
                  }
                  onBack={() =>
                    sdmQuestionIndex === 0
                      ? goBack()
                      : setSdmQuestionIndex((prev) => prev - 1)
                  }
                  showNavigation={true}
                />
              </div>
            )}

            {currentStep === "dcs" && (
              <div className="max-w-3xl mx-auto">
                <DecisionalConflictSurvey
                  answers={dcsAnswers}
                  onChange={(qId, val) =>
                    setDcsAnswers((prev) => ({ ...prev, [qId]: val }))
                  }
                  onSubmit={handleSubmitDCS}
                  isDark={isDarkMode}
                  onTrackEvent={handleTrackEvent}
                  currentQuestionIndex={dcsQuestionIndex}
                  onNext={() =>
                    setDcsQuestionIndex((prev) =>
                      Math.min(prev + 1, QUESTION_COUNTS.dcs - 1),
                    )
                  }
                  onBack={() =>
                    dcsQuestionIndex === 0
                      ? goBack()
                      : setDcsQuestionIndex((prev) => prev - 1)
                  }
                  showNavigation={true}
                />
              </div>
            )}

            {currentStep === "risk" && (
              <div className="max-w-3xl mx-auto">
                <RiskPerceptionSurvey
                  answers={riskAnswers}
                  onChange={(qId, val) =>
                    setRiskAnswers((prev) => ({ ...prev, [qId]: val }))
                  }
                  onSubmit={handleSubmitRisk}
                  isDark={isDarkMode}
                  onTrackEvent={handleTrackEvent}
                  currentQuestionIndex={riskQuestionIndex}
                  onNext={() =>
                    setRiskQuestionIndex((prev) =>
                      Math.min(prev + 1, QUESTION_COUNTS.risk - 1),
                    )
                  }
                  onBack={() =>
                    riskQuestionIndex === 0
                      ? goBack()
                      : setRiskQuestionIndex((prev) => prev - 1)
                  }
                  showNavigation={true}
                />
              </div>
            )}

            {currentStep === "satisfaction" && (
              <div className="max-w-2xl mx-auto">
                <PatientSatisfactionSurvey
                  answers={satisfactionAnswers}
                  onChange={(field, val) =>
                    setSatisfactionAnswers((prev) => ({
                      ...prev,
                      [field]: val,
                    }))
                  }
                  onSubmit={handleSubmitSatisfaction}
                  isDark={isDarkMode}
                  onTrackEvent={handleTrackEvent}
                  currentQuestionIndex={satisfactionQuestionIndex}
                  onBack={goBack}
                  showNavigation={true}
                />
              </div>
            )}

            {currentStep === "complete" && <CompleteStep isDark={isDarkMode} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientFollowUpReport;
