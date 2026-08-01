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
  CheckCircle,
  FileText,
  Shield,
  HelpCircle,
  BarChart3,
  Smile,
  Check,
} from "lucide-react";

// V1 (legacy, no REDCap mapping) — preserved for reference / rollback only.
// Inline question wording ("What is the chance of having ... after treatment?")
// and the shared 6-option Very Low / Low / Moderate / High / Very High / Not
// Sure radio set are NOT aligned with REDCap's `risk_perception` form, so
// submissions through V1 cannot be mirrored to REDCap.
// import RiskPerceptionWithSummary, {
//   type TopicSummaryMap,
// } from "@/components/RiskPerceptionWithSummary";

// V2 (active) — REDCap-aligned. Question text and choices match the
// `risk_perception` instrument 1:1, ids equal the keys in
// RiskPerceptionAnswers, and Q1 sends the raw 0–100 slider integer (no
// sliderToCategory compression), so the backend mapping in
// routes_surveys.py mirrors every answer to REDCap unchanged.
import RiskPerceptionWithSummary, {
  type TopicSummaryMap,
} from "@/components/RiskPerceptionWithSummaryV2";
// Combined "Total Survey" Risk step renders the V41 first-visit component — this is
// "Risk Perception 2" (survey_type=risk_perception_2, the 5-domain risk survey).
// The non-combined follow-up flow uses the one-way RiskPerceptionWithSummary above.
// import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV41";
import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV42";

import { submitSurvey, fetchSurveySubmissions } from "@/api/surveyApi";
import { useDebounce } from "@/hooks/useDebounce";
import { sendTrackingEvents } from "@/api/trackingApi";
import { trackFollowup, startSession, endSession } from "@/tracking/track";
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
  // "risk" — Risk Perception step intentionally hidden from the follow-up flow.
  // Kept in the SurveyStep type / STEP_INFO so the (now unreachable) render block
  // and handlers still type-check; simply removing it here drops it from the
  // sidebar nav, progress bar, and next/back navigation.
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
  // Numeric keys (legacy)
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
  // Full domain name keys (from pipeline)
  "cancer_prognosis": "Cancer Prognosis",
  "continence": "Urinary Incontinence",
  "erectile_dysfunction_potency": "Erectile Dysfunction",
  "irritative_urinary_symptoms_frequency_urgency_nocturnia": "Irritative Urinary Symptoms",
  "life_expectancy": "Life Expectancy",
};

/* =============================================================================
   SECTION 3: UTILITY FUNCTIONS
============================================================================= */

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

// Risk Perception data, theme colours, and `TopicSummaryMap` type now live
// in `@/components/RiskPerceptionWithSummary` — see the import block above.

/* =============================================================================
   SECTION 4: REUSABLE COMPONENTS
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// AISummaryBadge and CollapsibleSummary now live in
// `@/components/RiskPerceptionWithSummary` (extracted alongside the Risk
// Perception step that was their only consumer).
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 4.3 Progress Sidebar
// ─────────────────────────────────────────────────────────────────────────────

interface ProgressSidebarProps {
  currentStep: SurveyStep;
  completedSteps: Set<SurveyStep>;
  isDark?: boolean;
  steps: SurveyStep[];
  // V38 one-way flow: only COMPLETED (already-submitted) steps are clickable, so
  // a patient can go back to review a finished section. Not-yet-reached steps stay
  // non-interactive (no forward skipping). Omit to keep every row display-only.
  onStepClick?: (step: SurveyStep) => void;
}

// V38 one-way flow: the forward control is each section's own submit button.
// The sidebar lets patients click a COMPLETED section to review it, but never
// jump ahead to an unreached section.
const ProgressSidebar: React.FC<ProgressSidebarProps> = ({
  currentStep,
  completedSteps,
  isDark,
  steps,
  onStepClick,
}) => {
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div
      className={cx(
        "hidden md:block w-48 lg:w-64 flex-shrink-0 p-4 lg:p-6 border-r",
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
        {steps.map((step, index) => {
          const isCompleted = completedSteps.has(step);
          const isCurrent = step === currentStep;
          const isPast = index < currentIndex;
          // Completed sections can be revisited; Welcome (the intro) is always
          // reachable so the patient can return to it from any survey step.
          const isClickable =
            !!onStepClick &&
            !isCurrent &&
            (isCompleted || step === "welcome");

          return (
            <div
              key={step}
              {...(isClickable
                ? {
                    role: "button" as const,
                    tabIndex: 0,
                    onClick: () => onStepClick!(step),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onStepClick!(step);
                      }
                    },
                  }
                : {})}
              className={cx(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left",
                isClickable &&
                  cx(
                    "cursor-pointer",
                    isDark ? "hover:bg-slate-800" : "hover:bg-gray-100",
                  ),
                isCurrent
                  ? isDark
                    ? "bg-blue-600 text-white"
                    : "bg-blue-600 text-white"
                  : isCompleted || isPast
                    ? isDark
                      ? "text-slate-300"
                      : "text-gray-700"
                    : isDark
                      ? "text-slate-500"
                      : "text-gray-400",
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
            </div>
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
            {Math.round((currentIndex / (steps.length - 1)) * 100)}%
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
              width: `${(currentIndex / (steps.length - 1)) * 100}%`,
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
//
// V38 one-way flow: the shared per-section "Back / Continue to Next Section"
// NavigationButtons component was removed. Section advancement is automatic on
// submit (see the handleSubmit* handlers), and each survey's own final submit
// button is the single forward control — there is no Back button anywhere.

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
    <div className="max-w-2xl mx-auto text-center py-6 sm:py-8 lg:py-12">
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
          "text-xl sm:text-2xl font-semibold mb-3",
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
          "inline-flex items-center gap-2 px-6 py-2.5 sm:px-8 sm:py-3 rounded-lg text-sm sm:text-base font-medium transition-colors",
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
    <div className="max-w-2xl mx-auto text-center py-6 sm:py-8 lg:py-12">
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
          "text-xl sm:text-2xl font-semibold mb-3",
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

      <p
        className={cx(
          "text-base font-medium mb-8",
          isDark ? "text-slate-200" : "text-gray-800",
        )}
      >
        You may now safely close this window.
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
          provider or our support team at ella.tetrault@cshs.org.
        </p>
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
  const patientId = usePatientId((state) => state.patientId);
  const fileId = useFileId((state) => state.fileId);
  const { fetchAISummary } = usePatientData();

  const currentFile = fileId || "Input_Keystrokes REC001 (SID 14).xlsx";
  const currentSpeaker = patientId || "Patient_Input_Keystrokes REC001 (SID 14)";

  // ─────────────────────────────────────────────────────────────────────────
  // 7.2 State
  // ─────────────────────────────────────────────────────────────────────────

  // Navigation State
  const [currentStep, setCurrentStep] = useState<SurveyStep>("welcome");

  // Total Survey (combined) flow: re-enable the Risk step in the step list.
  // In V38 the Risk step uses the same one-way RiskPerceptionWithSummary
  // component as the non-combined flow. Read once on mount from ?combined=1.
  const [combined] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("combined") === "1",
  );
  const steps: SurveyStep[] = combined
    ? ["welcome", "sdm", "dcs", "risk", "satisfaction", "complete"]
    : SURVEY_STEPS;
  const [completedSteps, setCompletedSteps] = useState<Set<SurveyStep>>(
    new Set(),
  );

  // API State
  const [aiSummaryData, setAiSummaryData] = useState<any | null>(null);
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

  // Submit-success popup: message shown in a modal on submit, dismissed with OK.
  // Replaces the old persistent inline "submitted successfully" boxes.
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  // True once the mount-time restore fetch has resolved. Auto-save waits for this
  // so it never re-saves the just-restored values (and works for a fresh patient).
  const [surveyHydrated, setSurveyHydrated] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // 7.3 Load Summary Data
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadSummaryData = async () => {
      try {
        setApiLoading(true);
        setApiError(null);

        // Summaries come from the AI pipeline (fetchAISummary); the old
        // patient_summary_domain read (fetchSummaryDetail) was removed with that table.
        const aiResult = await fetchAISummary(currentFile);

        // Store AI summary data for GPT-4o reformat sentences
        if (aiResult?.source === "ai_pipeline_gpt4o" && aiResult.domains?.length > 0) {
          setAiSummaryData(aiResult);
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
  // 7.3a Restore previous survey submissions on page load
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const restoreSurveyState = async () => {
      try {
        const submissions = await fetchSurveySubmissions(currentFile, currentSpeaker);
        if (!submissions || submissions.total_submissions === 0) return;

        const restored = new Set<SurveyStep>();

        // Restore each survey type. Answers come from the LATEST row (partial or
        // final) so in-progress auto-saved input is restored; the submitted flag /
        // completed step is set ONLY when a FINAL (partial:false) row exists, so an
        // auto-saved partial does not falsely light the green check.
        const isFinal = (r: { extra_data?: Record<string, any> | null }) =>
          r.extra_data?.partial === false;

        const sdmRows = submissions.submissions_by_type["sdm"];
        if (sdmRows?.length) {
          setSdmAnswers(sdmRows[0].answers as SDMAnswers);
          if (sdmRows.some(isFinal)) {
            setSdmSubmitted(true);
            restored.add("sdm");
          }
        }

        const dcsRows = submissions.submissions_by_type["dcs"];
        if (dcsRows?.length) {
          setDcsAnswers(dcsRows[0].answers as DecisionalConflictAnswers);
          if (dcsRows.some(isFinal)) {
            setDcsSubmitted(true);
            restored.add("dcs");
          }
        }

        // Risk completion can be stored under either survey_type:
        //  - "risk_perception"   : the standalone follow-up Risk survey.
        //  - "risk_perception_2" : the Total-survey Risk step, which renders the
        //    V41 first-visit component (see the `combined` branch below). V41 owns
        //    its own answers via useFirstVisitAnswers, so here we only need to mark
        //    the step complete so the progress checkmark survives a refresh.
        const riskRows = submissions.submissions_by_type["risk_perception"];
        const riskV41Rows = submissions.submissions_by_type["risk_perception_2"];
        if (riskRows?.length) {
          setRiskAnswers(riskRows[0].answers as RiskPerceptionAnswers);
        }
        // Only a FINAL submit lights the Risk checkmark — risk_perception_2 now
        // accumulates partial auto-saves (V41), which must not mark it complete.
        if (riskRows?.some(isFinal) || riskV41Rows?.some(isFinal)) {
          setRiskSubmitted(true);
          restored.add("risk");
        }

        const satRows = submissions.submissions_by_type["satisfaction"];
        if (satRows?.length) {
          // Merge over the initial shape so a restored/legacy row missing
          // feedbackText never leaves it undefined (PatientSatisfactionSurvey
          // reads feedbackText.trim()).
          setSatisfactionAnswers({
            ...INITIAL_SATISFACTION_ANSWERS,
            ...(satRows[0].answers as PatientSatisfactionAnswers),
          });
          if (satRows.some(isFinal)) {
            setSatisfactionSubmitted(true);
            restored.add("satisfaction");
          }
        }

        if (restored.size > 0) {
          setCompletedSteps(restored);
          // If every survey in this flow has been submitted, land back on the
          // Thank-You ("complete") page on refresh instead of resetting to
          // "welcome" — otherwise the completion screen (and its green check)
          // vanishes after a reload.
          const requiredSurveys = steps.filter(
            (s) => s !== "welcome" && s !== "complete",
          );
          if (
            requiredSurveys.length > 0 &&
            requiredSurveys.every((s) => restored.has(s))
          ) {
            setCurrentStep("complete");
          }
          console.log(`Restored ${restored.size} survey submissions from DB`);
        }
      } catch (err) {
        console.error("Error restoring survey state:", err);
      } finally {
        // Restore fetch resolved (with or without prior data) — enable auto-save.
        setSurveyHydrated(true);
      }
    };

    restoreSurveyState();
  }, [currentFile, currentSpeaker]);

  // ─────────────────────────────────────────────────────────────────────────
  // 7.3b Track time spent on report page (Feedback 2-9)
  //       + Send tracking events to backend on page unload / visibility change
  // ─────────────────────────────────────────────────────────────────────────
  const pageLoadTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    trackFollowup(currentFile, currentSpeaker, {
      event_type: "page_view",
      metadata: { page: "patient_followup_report" },
    });
    return () => {
      trackFollowup(currentFile, currentSpeaker, {
        event_type: "session_end",
        metadata: { page: "patient_followup_report" },
      });
    };
  }, [currentFile, currentSpeaker]);

  // Pattern A: page-lifetime session — mount-only.
  useEffect(() => {
    startSession();
    return () => endSession();
  }, []);

  useEffect(() => {
    const flushEvents = (useKeepalive: boolean = false) => {
      const events = trackingManager.getEvents();
      if (events.length === 0) return;

      const session = getOrCreateSession();
      sendTrackingEvents(
        session.sessionId,
        "patient",
        currentFile,
        currentSpeaker,
        session.deviceType,
        events,
        useKeepalive,
        "followup",
      );
      trackingManager.clear();
    };

    const recordTimeSpent = () => {
      const durationMs = Date.now() - pageLoadTimeRef.current;
      if (durationMs < 1000) return;
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
        flushEvents(true);
        pageLoadTimeRef.current = Date.now();
      }
    };

    const handleBeforeUnload = () => {
      recordTimeSpent();
      flushEvents(true);
    };

    const periodicFlushTimer = setInterval(() => flushEvents(false), 10_000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(periodicFlushTimer);
      recordTimeSpent();
      flushEvents(true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [currentFile, currentSpeaker]);

  // ─────────────────────────────────────────────────────────────────────────
  // 7.4 Derived Data
  // ─────────────────────────────────────────────────────────────────────────

  // Build AI summary lookup from GPT-4o results
  const aiSummaryByTopic = useMemo(() => {
    const map: Record<string, string> = {};
    if (aiSummaryData?.domains) {
      const domainToTopic: Record<string, string> = {
        "Cancer Prognosis": "Cancer Prognosis",
        "Life Expectancy": "Life Expectancy",
        "Erectile Dysfunction": "Erectile Dysfunction",
        "Urinary Incontinence": "Urinary Incontinence",
        "Irritative Urinary Symptoms": "Irritative Urinary Symptoms",
      };
      for (const d of aiSummaryData.domains) {
        const topic = domainToTopic[d.domain_name] || d.domain_name;
        if (map[topic] && d.reformat_sentence) {
          map[topic] += "\n\n" + d.reformat_sentence;
        } else if (d.reformat_sentence) {
          map[topic] = d.reformat_sentence;
        }
      }
    }
    return map;
  }, [aiSummaryData]);

  const topicSummaries = useMemo((): TopicSummaryMap => {
    // Built from the AI pipeline summaries (keyed by topic). The old
    // patient_summary_domain-driven loop was removed with that table.
    const summaries: TopicSummaryMap = {};
    Object.keys(aiSummaryByTopic).forEach((topicName) => {
      summaries[topicName] = {
        aiSummary: aiSummaryByTopic[topicName] || "Summary not available.",
        extractedSentences: [],
      };
    });
    return summaries;
  }, [aiSummaryByTopic]);

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
    // Section-entry survey_step_view removed (2026-07-02): the per-question
    // views (onQuestionView) already mark entry into each section. The outer
    // section event (no question_id, step_number = section index) was redundant
    // and confusing in the admin follow-up view.
  };

  const goNext = () => {
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      goToStep(steps[currentIndex + 1]);
    }
  };

  // V38 one-way flow: no goBack — navigation is forward-only.

  // ─────────────────────────────────────────────────────────────────────────
  // 7.6 Survey Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleSDMChange = (
    questionId: keyof SDMAnswers,
    value: YesNoAnswer | ScaleAnswer,
  ) => {
    setSdmAnswers((prev) => ({ ...prev, [questionId]: value }));
    trackFollowup(currentFile, currentSpeaker, {
      event_type: "survey_answer",
      survey_type: "sdm",
      question_id: String(questionId),
    });
  };

  const handleDCSChange = (
    questionId: keyof DecisionalConflictAnswers,
    value: LikertAnswer,
  ) => {
    setDcsAnswers((prev) => ({ ...prev, [questionId]: value }));
    trackFollowup(currentFile, currentSpeaker, {
      event_type: "survey_answer",
      survey_type: "dcs",
      question_id: String(questionId),
    });
  };

  const handleRiskChange = (
    questionId: keyof RiskPerceptionAnswers,
    value: string | number,
  ) => {
    setRiskAnswers((prev) => ({ ...prev, [questionId]: value }));
    trackFollowup(currentFile, currentSpeaker, {
      event_type: "survey_answer",
      survey_type: "risk_perception",
      question_id: String(questionId),
    });
  };

  const handleSatisfactionChange = (
    field: keyof PatientSatisfactionAnswers,
    value: any,
  ) => {
    setSatisfactionAnswers((prev) => ({ ...prev, [field]: value }));
    // feedbackText is a free-text field: its onChange fires per keystroke, so
    // tracking survey_answer here would emit one row per character. Skip it on
    // change — it is emitted once at submit (handleSubmitSatisfaction). Rating
    // fields still fire once per selection.
    if (field !== "feedbackText") {
      trackFollowup(currentFile, currentSpeaker, {
        event_type: "survey_answer",
        survey_type: "satisfaction",
        question_id: String(field),
      });
    }
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

      trackFollowup(currentFile, currentSpeaker, {
        event_type: "survey_complete",
        survey_type: "sdm",
        metadata: { answer_count: Object.keys(sdmAnswers).length },
      });

      setSdmSubmitted(true);
      // Show the success modal; advancing to the next section happens only when
      // the patient acknowledges it with OK (see the success modal handler below).
      setSuccessMsg("Responses submitted successfully!");
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

      trackFollowup(currentFile, currentSpeaker, {
        event_type: "survey_complete",
        survey_type: "dcs",
        metadata: { answer_count: Object.keys(dcsAnswers).length },
      });

      setDcsSubmitted(true);
      // Advance happens on OK in the success modal (one-way, acknowledged).
      setSuccessMsg("Responses submitted successfully!");
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

      trackFollowup(currentFile, currentSpeaker, {
        event_type: "survey_complete",
        survey_type: "risk_perception",
        metadata: { answer_count: Object.keys(riskAnswers).length },
      });

      setRiskSubmitted(true);
      // Advance happens on OK in the success modal (one-way, acknowledged).
      setSuccessMsg("Responses submitted successfully!");
    } catch (error) {
      console.error("Risk submission error:", error);
      alert("Failed to submit. Please try again.");
    } finally {
      setIsSubmittingRisk(false);
    }
  };

  const handleSubmitSatisfaction = async () => {
    setIsSubmittingSatisfaction(true);
    // feedbackText is tracked once here (not per keystroke) — only if the
    // patient actually entered feedback.
    if ((satisfactionAnswers.feedbackText ?? "").trim().length > 0) {
      trackFollowup(currentFile, currentSpeaker, {
        event_type: "survey_answer",
        survey_type: "satisfaction",
        question_id: "feedbackText",
      });
    }
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

      trackFollowup(currentFile, currentSpeaker, {
        event_type: "survey_complete",
        survey_type: "satisfaction",
        metadata: { answer_count: Object.keys(satisfactionAnswers).length },
      });

      setSatisfactionSubmitted(true);
      // Satisfaction is the last survey. The success modal's OK handler advances
      // to the Thank-You ("complete") step (goNext marks satisfaction complete).
      setSuccessMsg("Feedback submitted successfully!");
    } catch (error) {
      console.error("Satisfaction submission error:", error);
      alert("Failed to submit. Please try again.");
    } finally {
      setIsSubmittingSatisfaction(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 7.7b Progress Save (auto-save on Next click)
  // ─────────────────────────────────────────────────────────────────────────

  const saveSDMProgress = () => {
    submitSurvey({
      survey_type: "sdm",
      file: currentFile,
      speaker: currentSpeaker,
      answers: sdmAnswers,
      metadata: { partial: true },
    }).catch((err) => console.error("SDM progress save failed:", err));
  };

  const saveDCSProgress = () => {
    submitSurvey({
      survey_type: "dcs",
      file: currentFile,
      speaker: currentSpeaker,
      answers: dcsAnswers,
      metadata: { partial: true },
    }).catch((err) => console.error("DCS progress save failed:", err));
  };

  const saveRiskProgress = () => {
    submitSurvey({
      survey_type: "risk_perception",
      file: currentFile,
      speaker: currentSpeaker,
      answers: riskAnswers,
      metadata: { partial: true },
    }).catch((err) => console.error("Risk progress save failed:", err));
  };

  const saveSatisfactionProgress = () => {
    submitSurvey({
      survey_type: "satisfaction",
      file: currentFile,
      speaker: currentSpeaker,
      answers: satisfactionAnswers,
      metadata: { partial: true },
    }).catch((err) => console.error("Satisfaction progress save failed:", err));
  };

  // ── Auto-save: persist in-progress answers (partial:true) shortly after the
  // patient stops editing, so a refresh restores unsubmitted input (like the
  // first-visit Risk survey). Gated on surveyHydrated so the just-restored values
  // are not re-saved; a per-survey baseline skips the first post-restore settle.
  // The baseline is primed from the CURRENT (restored) answers — NOT the debounced
  // signal, which still lags at its pre-restore value when hydration flips true. Using
  // the debounced value here would treat the restored answers settling in as an "edit"
  // and fire a spurious partial save on every page load.
  const sdmDebounced = useDebounce(JSON.stringify(sdmAnswers), 800);
  const sdmAutoSaveBaseline = useRef<string | null>(null);
  useEffect(() => {
    if (!surveyHydrated) return;
    if (sdmAutoSaveBaseline.current === null) {
      sdmAutoSaveBaseline.current = JSON.stringify(sdmAnswers);
      return;
    }
    if (sdmDebounced === sdmAutoSaveBaseline.current) return;
    sdmAutoSaveBaseline.current = sdmDebounced;
    saveSDMProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdmDebounced, surveyHydrated]);

  const dcsDebounced = useDebounce(JSON.stringify(dcsAnswers), 800);
  const dcsAutoSaveBaseline = useRef<string | null>(null);
  useEffect(() => {
    if (!surveyHydrated) return;
    if (dcsAutoSaveBaseline.current === null) {
      dcsAutoSaveBaseline.current = JSON.stringify(dcsAnswers);
      return;
    }
    if (dcsDebounced === dcsAutoSaveBaseline.current) return;
    dcsAutoSaveBaseline.current = dcsDebounced;
    saveDCSProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dcsDebounced, surveyHydrated]);

  const satisfactionDebounced = useDebounce(JSON.stringify(satisfactionAnswers), 800);
  const satisfactionAutoSaveBaseline = useRef<string | null>(null);
  useEffect(() => {
    if (!surveyHydrated) return;
    if (satisfactionAutoSaveBaseline.current === null) {
      satisfactionAutoSaveBaseline.current = JSON.stringify(satisfactionAnswers);
      return;
    }
    if (satisfactionDebounced === satisfactionAutoSaveBaseline.current) return;
    satisfactionAutoSaveBaseline.current = satisfactionDebounced;
    saveSatisfactionProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satisfactionDebounced, surveyHydrated]);

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
        "min-h-screen flex flex-col",
        isDarkMode ? "bg-slate-950" : "bg-gray-50",
      )}
    >
      {/* Submit-success modal — shown on Submit, dismissed with OK. */}
      {successMsg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setSuccessMsg(null);
            // Acknowledging the success message is the one-way forward control:
            // advance to the next section (goNext handles satisfaction → complete).
            goNext();
          }}
        >
          <div
            className={cx(
              "w-full max-w-sm rounded-2xl p-6 text-center shadow-xl",
              isDarkMode ? "bg-slate-900" : "bg-white",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={cx(
                "w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center",
                isDarkMode ? "bg-green-900/50" : "bg-green-50",
              )}
            >
              <CheckCircle
                size={28}
                className={isDarkMode ? "text-green-400" : "text-green-600"}
              />
            </div>
            <p
              className={cx(
                "text-base font-medium mb-6",
                isDarkMode ? "text-slate-100" : "text-gray-900",
              )}
            >
              {successMsg}
            </p>
            <button
              type="button"
              onClick={() => {
            setSuccessMsg(null);
            // Acknowledging the success message is the one-way forward control:
            // advance to the next section (goNext handles satisfaction → complete).
            goNext();
          }}
              className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* COMPASS header — brand name on top with the full mixed-case
          expansion underneath, matching the Patient first-visit welcome
          card so returning patients see consistent branding. */}
      <div
        className={cx(
          "border-b px-4 py-3",
          isDarkMode
            ? "border-slate-800 bg-slate-950"
            : "border-gray-100 bg-white",
        )}
      >
        <h2
          className={cx(
            "text-base font-bold tracking-tight",
            isDarkMode ? "text-slate-100" : "text-gray-900",
          )}
        >
          COMPASS
        </h2>
        <p
          className={cx(
            "text-xs italic mt-0.5",
            isDarkMode ? "text-slate-400" : "text-gray-500",
          )}
        >
          <span className="font-semibold">Com</span>munication of{" "}
          <span className="font-semibold">P</span>rognosis,{" "}
          <span className="font-semibold">A</span>lternatives, and{" "}
          <span className="font-semibold">S</span>ide Effects for{" "}
          <span className="font-semibold">S</span>hared Decision Making
          <span className="not-italic mx-2">·</span>
          <span className="not-italic uppercase tracking-wider">
            Follow-up Survey
          </span>
        </p>
      </div>

      <div className="flex flex-1">
      {/* Sidebar */}
      <ProgressSidebar
        currentStep={currentStep}
        completedSteps={completedSteps}
        isDark={isDarkMode}
        steps={steps}
        onStepClick={goToStep}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div
          className={cx("min-h-full", isDarkMode ? "bg-slate-900" : "bg-white")}
        >
          {/* Header */}
          <div
            className={cx(
              "px-4 sm:px-6 lg:px-8 py-4 sm:py-6 border-b",
              isDarkMode ? "border-slate-800" : "border-gray-200",
            )}
          >
            <h2
              className={cx(
                "text-lg sm:text-xl font-semibold",
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
          <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
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
                  locked={sdmSubmitted}
                  onProgressSave={saveSDMProgress}
                  isDark={isDarkMode}
                  interventionName="treatment"
                  oneWay
                  onTrackEvent={handleTrackEvent}
                  onQuestionView={(qid, idx) =>
                    trackFollowup(currentFile, currentSpeaker, {
                      event_type: "survey_step_view",
                      survey_type: "sdm",
                      question_id: qid,
                      step_number: idx + 1,
                    })
                  }
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
                  locked={dcsSubmitted}
                  onProgressSave={saveDCSProgress}
                  isDark={isDarkMode}
                  oneWay
                  onTrackEvent={handleTrackEvent}
                  onQuestionView={(qid, idx) =>
                    trackFollowup(currentFile, currentSpeaker, {
                      event_type: "survey_step_view",
                      survey_type: "dcs",
                      question_id: qid,
                      step_number: idx + 1,
                    })
                  }
                />
              </div>
            )}

            {/* Risk Perception step.
                - Combined "Total Survey": render the V41 first-visit component =
                  "Risk Perception 2" (5-domain risk survey, survey_type
                  risk_perception_2). It drives its own navigation and calls
                  onComplete to advance to Satisfaction.
                - Non-combined follow-up: the one-way RiskPerceptionWithSummary. */}
            {currentStep === "risk" &&
              (combined ? (
                <PatientReportFirstVisit
                  forceSurveyMode
                  trackToFollowup
                  oneWay
                  isDarkMode={isDarkMode}
                  onComplete={goNext}
                />
              ) : (
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
                  locked={riskSubmitted}
                  onProgressSave={saveRiskProgress}
                  isSubmitting={isSubmittingRisk}
                  summaries={topicSummaries}
                  isDark={isDarkMode}
                  oneWay
                  trackingManager={trackingManager}
                  onTrackEvent={handleTrackEvent}
                  onQuestionView={(qid, idx) =>
                    trackFollowup(currentFile, currentSpeaker, {
                      event_type: "survey_step_view",
                      survey_type: "risk_perception",
                      question_id: qid,
                      step_number: idx + 1,
                    })
                  }
                />
              </div>
              ))}

            {/* Satisfaction */}
            {currentStep === "satisfaction" && (
              <div className="max-w-2xl mx-auto">
                <PatientSatisfactionSurvey
                  answers={satisfactionAnswers}
                  onChange={handleSatisfactionChange}
                  onSubmit={handleSubmitSatisfaction}
                  locked={satisfactionSubmitted}
                  isDark={isDarkMode}
                  oneWay
                  onTrackEvent={handleTrackEvent}
                />
              </div>
            )}

            {/* Complete */}
            {currentStep === "complete" && <CompleteStep isDark={isDarkMode} />}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default PatientSurvey;
