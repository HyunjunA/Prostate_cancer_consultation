"use client";

/**
 * PatientReportModifiedV14.tsx
 *
 * A comprehensive patient consultation report component with:
 * - API integration for summary data (fetchSummaryDetail)
 * - API integration for scoring (updateScoring)
 * - Passive engagement tracking (cursor proximity, scroll depth, dwell time)
 * - Topic-based consultation summaries
 * - Shared Decision Making (SDM) questionnaire
 * - Baseline Information demographic survey
 * - Decisional Conflict Survey (16 items)
 * - Risk Perception Survey (5 items)
 * - Patient Satisfaction Survey (4 items + feedback)
 * - Patient feedback questions
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import * as XLSX from "xlsx";
import { usePatientData } from "@/hooks/usePatientData";

import { usePatientId } from "@/stores/usePatientId";
import { useFileId } from "@/stores/useFileId";

// ⭐ Import from components/questions (existing)
import {
  // SDM Components & Types
  YesNoQuestion,
  ScaleQuestion,
  SDM_QUESTIONS,
  type YesNoAnswer,
  type ScaleAnswer,
  type SDMAnswers,
  // Baseline Components & Types
  BaselineRadioGroup,
  BaselineCheckboxGroup,
  BaselineTextInput,
  BASELINE_OPTIONS,
  type BaselineAnswers,
} from "@/components/surveys";

import {
  // Decisional Conflict Survey
  DecisionalConflictSurvey,
  INITIAL_DCS_ANSWERS,
  type DecisionalConflictAnswers,
  type LikertAnswer,
  // Risk Perception Survey
  RiskPerceptionSurvey,
  INITIAL_RISK_ANSWERS,
  type RiskPerceptionAnswers,
  // Patient Satisfaction Survey
  PatientSatisfactionSurvey,
  INITIAL_SATISFACTION_ANSWERS,
  type PatientSatisfactionAnswers,
} from "@/components/surveys";

import {
  Info,
  CheckCircle,
  HelpCircle,
  BarChart3,
  Smile,
  MessageCircle,
  Check,
} from "lucide-react";

import { submitSurvey } from "@/api/surveyApi";

/* =============================================================================
   SECTION 1: TRACKING SYSTEM
   - TrackingEventManager class
   - Tracking hooks (proximity, scroll, dwell time)
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 1.1 Tracking Types
// ─────────────────────────────────────────────────────────────────────────────

interface TrackingEvent {
  eventType:
    | "proximity_enter"
    | "proximity_exit"
    | "scroll_depth"
    | "dwell_time"
    | "rating_click"
    | "button_click"
    | "section_view"
    | "question_answer"
    | "sdm_answer"
    | "baseline_answer"
    | "dcs_answer"
    | "risk_perception_answer"
    | "satisfaction_answer";
  elementId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface ProximityConfig {
  threshold: number;
  debounceMs: number;
}

interface ScrollDepthConfig {
  thresholds: number[];
  debounceMs: number;
}

interface DwellTimeConfig {
  minDwellTime: number;
  trackingInterval: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.2 TrackingEventManager (Singleton)
// ─────────────────────────────────────────────────────────────────────────────

class TrackingEventManager {
  private events: TrackingEvent[] = [];
  private listeners: ((event: TrackingEvent) => void)[] = [];

  recordEvent(event: TrackingEvent) {
    this.events.push(event);
    console.log(`📊 [Tracking Event]`, event);
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

  getEventsByType(type: TrackingEvent["eventType"]): TrackingEvent[] {
    return this.events.filter((e) => e.eventType === type);
  }

  clear() {
    this.events = [];
  }

  exportEvents(): string {
    return JSON.stringify(this.events, null, 2);
  }
}

const trackingManager = new TrackingEventManager();

// Make trackingManager accessible from browser console for debugging
if (typeof window !== "undefined") {
  (window as any).trackingManager = trackingManager;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.3 Tracking Hooks
// ─────────────────────────────────────────────────────────────────────────────

const useCursorProximityTracking = (
  config: ProximityConfig = { threshold: 150, debounceMs: 100 }
) => {
  const proximityStates = useRef<Map<string, boolean>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const calculateDistance = useCallback(
    (mouseX: number, mouseY: number, element: HTMLElement): number => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return Math.sqrt(
        Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2)
      );
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        const trackableElements = document.querySelectorAll(
          "[data-track-proximity]"
        );

        trackableElements.forEach((element) => {
          const htmlElement = element as HTMLElement;
          const elementId = htmlElement.getAttribute("data-track-proximity");
          if (!elementId) return;

          const distance = calculateDistance(e.clientX, e.clientY, htmlElement);
          const isNear = distance <= config.threshold;
          const wasNear = proximityStates.current.get(elementId) || false;

          if (isNear && !wasNear) {
            proximityStates.current.set(elementId, true);
            trackingManager.recordEvent({
              eventType: "proximity_enter",
              elementId,
              timestamp: new Date().toISOString(),
              metadata: {
                distance: Math.round(distance),
                threshold: config.threshold,
              },
            });
          } else if (!isNear && wasNear) {
            proximityStates.current.set(elementId, false);
            trackingManager.recordEvent({
              eventType: "proximity_exit",
              elementId,
              timestamp: new Date().toISOString(),
              metadata: {
                distance: Math.round(distance),
                threshold: config.threshold,
              },
            });
          }
        });
      }, config.debounceMs);
    },
    [config.threshold, config.debounceMs, calculateDistance]
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [handleMouseMove]);
};

const useScrollDepthTracking = (
  config: ScrollDepthConfig = { thresholds: [25, 50, 75, 100], debounceMs: 200 }
) => {
  const triggeredThresholds = useRef<Set<number>>(new Set());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleScroll = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollableHeight = scrollHeight - clientHeight;
      const scrollPercentage =
        scrollableHeight > 0 ? (scrollTop / scrollableHeight) * 100 : 100;

      config.thresholds.forEach((threshold) => {
        if (
          scrollPercentage >= threshold &&
          !triggeredThresholds.current.has(threshold)
        ) {
          triggeredThresholds.current.add(threshold);
          trackingManager.recordEvent({
            eventType: "scroll_depth",
            elementId: `page_scroll_${threshold}%`,
            timestamp: new Date().toISOString(),
            metadata: {
              threshold,
              currentScrollPercentage: Math.round(scrollPercentage),
              scrollTop: Math.round(scrollTop),
              scrollHeight,
              clientHeight,
            },
          });
        }
      });
    }, config.debounceMs);
  }, [config.thresholds, config.debounceMs]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [handleScroll]);
};

const useDwellTimeTracking = (
  config: DwellTimeConfig = { minDwellTime: 2000, trackingInterval: 500 }
) => {
  const dwellTimers = useRef<Map<string, number>>(new Map());
  const dwellStartTimes = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkVisibility = useCallback(() => {
    const trackableElements = document.querySelectorAll(
      "[data-track-proximity]"
    );

    trackableElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      const elementId = htmlElement.getAttribute("data-track-proximity");
      if (!elementId) return;

      const rect = htmlElement.getBoundingClientRect();
      const isVisible =
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0;
      const currentTime = Date.now();

      if (isVisible) {
        if (!dwellStartTimes.current.has(elementId)) {
          dwellStartTimes.current.set(elementId, currentTime);
        }

        const startTime = dwellStartTimes.current.get(elementId)!;
        const dwellTime = currentTime - startTime;
        const previousDwellTime = dwellTimers.current.get(elementId) || 0;
        dwellTimers.current.set(elementId, dwellTime);

        if (
          dwellTime >= config.minDwellTime &&
          previousDwellTime < config.minDwellTime
        ) {
          trackingManager.recordEvent({
            eventType: "dwell_time",
            elementId,
            timestamp: new Date().toISOString(),
            metadata: {
              dwellTimeMs: dwellTime,
              minDwellTime: config.minDwellTime,
            },
          });
        }
      } else {
        dwellStartTimes.current.delete(elementId);
      }
    });
  }, [config.minDwellTime]);

  useEffect(() => {
    intervalRef.current = setInterval(checkVisibility, config.trackingInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkVisibility, config.trackingInterval]);
};

const usePassiveTracking = (config?: {
  proximity?: ProximityConfig;
  scrollDepth?: ScrollDepthConfig;
  dwellTime?: DwellTimeConfig;
}) => {
  useCursorProximityTracking(config?.proximity);
  useScrollDepthTracking(config?.scrollDepth);
  useDwellTimeTracking(config?.dwellTime);

  return { trackingManager };
};

/* =============================================================================
   SECTION 2: TYPES & INTERFACES
   ⭐ NOTE: SDM, Baseline, DCS, Risk, Satisfaction types are imported
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 2.1 Component Props
// ─────────────────────────────────────────────────────────────────────────────

interface PatientReportProps {
  isDarkMode?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.2 API Response Types
// ─────────────────────────────────────────────────────────────────────────────

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

/* =============================================================================
   SECTION 3: UTILITY FUNCTIONS
============================================================================= */

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/* =============================================================================
   SECTION 4: CONSTANTS - Topic Mapping
============================================================================= */

// class_name → Topic Name 매핑
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

// Topic Name → class number 매핑 (for API update)
const TOPIC_TO_CLASS_NUMBER: Record<string, 1 | 2 | 3 | 4 | 5> = {
  "Cancer Prognosis": 1,
  "Life Expectancy": 2,
  "Erectile Dysfunction": 3,
  "Urinary Incontinence": 4,
  "Irritative Urinary Symptoms": 5,
};

// 토픽 순서 정의
const TOPIC_ORDER = [
  "Cancer Prognosis",
  "Life Expectancy",
  "Erectile Dysfunction",
  "Urinary Incontinence",
  "Irritative Urinary Symptoms",
];

/* =============================================================================
   SECTION 5: REUSABLE UI COMPONENTS
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 5.1 StarRating Component - UPDATED: Simplified styling
// ─────────────────────────────────────────────────────────────────────────────

interface StarRatingProps {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  isDark?: boolean;
  trackingName?: string;
  disabled?: boolean;
}

const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  label,
  isDark,
  trackingName,
  disabled = false,
}) => {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span
          className={cx("text-sm", isDark ? "text-slate-400" : "text-gray-500")}
        >
          {label}
        </span>
      )}
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Rate ${i}`}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                onChange(i);
                trackingManager.recordEvent({
                  eventType: "rating_click",
                  elementId: trackingName || "unknown",
                  timestamp: new Date().toISOString(),
                  metadata: { rating: i, starNumber: i },
                });
              }
            }}
            data-track-proximity={
              trackingName ? `${trackingName}_Star${i}` : undefined
            }
            className={cx(
              "w-7 h-7 rounded grid place-items-center transition-colors",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              isDark ? "hover:bg-slate-700" : "hover:bg-gray-100",
              value >= i
                ? "text-blue-500"
                : isDark
                ? "text-slate-500"
                : "text-gray-300"
            )}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.2 SectionHeader Component - UPDATED: Smaller icon, cleaner look
// ─────────────────────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  iconBgColor: string;
  iconBorderColor: string;
  isDark?: boolean;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  icon,
  iconBgColor,
  iconBorderColor,
  isDark,
}) => {
  return (
    <div className="mb-6">
      <div className="flex items-center mb-2">
        <div
          className={cx(
            "flex items-center justify-center w-10 h-10 rounded-lg mr-3",
            iconBgColor
          )}
        >
          {icon}
        </div>
        <h3
          className={cx(
            "text-xl font-semibold",
            isDark ? "text-slate-100" : "text-gray-900"
          )}
        >
          {title}
        </h3>
      </div>
      {description && (
        <p
          className={cx(
            "text-sm ml-13 pl-13",
            isDark ? "text-slate-400" : "text-gray-500"
          )}
          style={{ marginLeft: "52px" }}
        >
          {description}
        </p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.3 SubmitButton Component - UPDATED: Single blue color, cleaner
// ─────────────────────────────────────────────────────────────────────────────

interface SubmitButtonProps {
  onClick: () => void;
  label: string;
  trackingName: string;
  colorScheme:
    | "green"
    | "purple"
    | "amber"
    | "blue"
    | "teal"
    | "rose"
    | "indigo";
  isDark?: boolean;
}

const SubmitButton: React.FC<SubmitButtonProps> = ({
  onClick,
  label,
  trackingName,
  colorScheme,
  isDark,
}) => {
  // Unified blue color for all buttons
  return (
    <div className="mt-8 flex justify-center">
      <button
        onClick={onClick}
        data-track-proximity={trackingName}
        className={cx(
          "px-6 py-3 rounded-lg text-base font-medium transition-colors",
          isDark
            ? "bg-blue-600 text-white hover:bg-blue-500"
            : "bg-blue-600 text-white hover:bg-blue-700"
        )}
      >
        {label}
      </button>
    </div>
  );
};

/* =============================================================================
   SECTION 6: QUESTION DATA CONSTANTS
============================================================================= */

const PATIENT_QUESTIONS = [
  "q1: How are you?",
  "q2: What do you like?",
  "q3: What is your favorite color?",
  "q4: What do you do for fun?",
  "q5: Where are you from?",
  "q6: What is your hobby?",
  "q7: What do you enjoy most?",
  "q8: What makes you happy?",
  "q9: What is your goal?",
  "q10: What would you like to know more about?",
];

/* =============================================================================
   SECTION 7: MAIN COMPONENT
============================================================================= */

const PatientReport: React.FC<PatientReportProps> = ({
  isDarkMode = false,
}) => {
  // ─────────────────────────────────────────────────────────────────────────
  // 7.1 Hooks & API Calls
  // ─────────────────────────────────────────────────────────────────────────
  const { patientId } = usePatientId();
  const { fileId } = useFileId();

  const {
    fetchFiles: fetchPatientFiles,
    fetchSummariesAll,
    fetchSummariesFiltered,
    fetchSummaryDetail,
    fetchScoringAll,
    fetchScoringFiltered,
    fetchResponsesAll,
    fetchResponsesFiltered,
    // PUT APIs
    updateScoring,
    updateSingleClassScore,
  } = usePatientData();

  // Initialize passive tracking
  usePassiveTracking({
    proximity: { threshold: 150, debounceMs: 100 },
    scrollDepth: { thresholds: [25, 50, 75, 100], debounceMs: 200 },
    dwellTime: { minDwellTime: 2000, trackingInterval: 500 },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7.2 State Management
  // ─────────────────────────────────────────────────────────────────────────

  // API Data State
  const [summaryData, setSummaryData] = useState<SummaryDetailResponse | null>(
    null
  );
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Current file/speaker for API calls
  const currentFile = fileId || "quality-coded-nlp-pilot-sid-1.xlsx";
  const currentSpeaker = patientId || "Patient_quality-coded-nlp-pilot-sid-1";

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"topics" | "full">("topics");
  const [ratings, setRatings] = useState<{
    overall: number;
    [k: string]: number;
  }>({ overall: 0 });
  const [showKeys, setShowKeys] = useState<{ [k: string]: boolean }>({});

  // Patient Questions State
  const [questionAnswers, setQuestionAnswers] = useState<{
    [key: string]: string;
  }>({});

  // SDM State
  const [sdmAnswers, setSdmAnswers] = useState<SDMAnswers>({
    q1: null,
    q2: null,
    q3: null,
    q4: null,
  });

  // Baseline Information State
  const [baselineAnswers, setBaselineAnswers] = useState<BaselineAnswers>({
    sexAtBirth: null,
    race: [],
    education: null,
    maritalStatus: null,
    employment: [],
    employmentOther: "",
  });

  // Decisional Conflict Survey State
  const [dcsAnswers, setDcsAnswers] =
    useState<DecisionalConflictAnswers>(INITIAL_DCS_ANSWERS);

  // Risk Perception Survey State
  const [riskAnswers, setRiskAnswers] =
    useState<RiskPerceptionAnswers>(INITIAL_RISK_ANSWERS);

  // Patient Satisfaction Survey State
  const [satisfactionAnswers, setSatisfactionAnswers] =
    useState<PatientSatisfactionAnswers>(INITIAL_SATISFACTION_ANSWERS);

  // Survey Submission Status
  const [submittedSurveys, setSubmittedSurveys] = useState({
    sdm: false,
    baseline: false,
    dcs: false,
    risk: false,
    satisfaction: false,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7.3 Load API Data
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadSummaryData = async () => {
      try {
        setApiLoading(true);
        setApiError(null);

        console.log("📡 Fetching summary detail...");
        const result = await fetchSummaryDetail(currentFile, currentSpeaker);

        if (result) {
          console.log("✅ Summary data loaded:", result);
          setSummaryData(result);

          const initialRatings: { overall: number; [k: string]: number } = {
            overall: 0,
          };

          result.summary?.classes?.forEach((cls: ClassSummary) => {
            const topicName = CLASS_TO_TOPIC_MAP[cls.class_name];
            if (topicName && cls.score !== null) {
              initialRatings[topicName] = cls.score;
            }
          });

          console.log("⭐ Initial ratings from API:", initialRatings);
          setRatings(initialRatings);
        } else {
          setApiError("Failed to load summary data");
        }
      } catch (err) {
        console.error("❌ Error loading summary data:", err);
        setApiError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setApiLoading(false);
      }
    };

    loadSummaryData();
  }, [currentFile, currentSpeaker, fileId, patientId]);

  // ─────────────────────────────────────────────────────────────────────────
  // 7.4 Derived Data from API
  // ─────────────────────────────────────────────────────────────────────────

  const overallSummary = useMemo(() => {
    if (summaryData?.summary?.entire_summary) {
      return summaryData.summary.entire_summary;
    }
    return "Your consultation summary is being prepared. Please check back later for a complete overview of your treatment discussion.";
  }, [summaryData]);

  const consultationTopics = useMemo(() => {
    const topics: Record<
      string,
      { aiSummary: string; extractedSentences: string[] }
    > = {};

    if (summaryData?.summary?.classes) {
      summaryData.summary.classes.forEach((cls: ClassSummary) => {
        const topicName = CLASS_TO_TOPIC_MAP[cls.class_name];
        if (topicName) {
          topics[topicName] = {
            aiSummary: cls.summary || "Summary not available.",
            extractedSentences: [],
          };
        }
      });
    }

    TOPIC_ORDER.forEach((topic) => {
      if (!topics[topic]) {
        topics[topic] = {
          aiSummary: "Summary not available for this topic.",
          extractedSentences: [],
        };
      }
    });

    return topics;
  }, [summaryData]);

  const topicKeys = useMemo(() => TOPIC_ORDER, []);

  // ─────────────────────────────────────────────────────────────────────────
  // 7.5 Event Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleRatingChange = async (topic: string, newRating: number) => {
    setRatings((prev) => ({ ...prev, [topic]: newRating }));

    const classNumber = TOPIC_TO_CLASS_NUMBER[topic];

    if (classNumber) {
      try {
        console.log(
          `📤 Updating score for ${topic} (class ${classNumber}): ${newRating}`
        );
        const result = await updateSingleClassScore(
          currentFile,
          currentSpeaker,
          classNumber,
          newRating
        );

        if (result) {
          console.log("✅ Score updated successfully:", result);
        } else {
          console.error("❌ Failed to update score");
        }
      } catch (err) {
        console.error("❌ Error updating score:", err);
      }
    }

    trackingManager.recordEvent({
      eventType: "rating_click",
      elementId: `TopicRating_${topic.replace(/\s+/g, "")}`,
      timestamp: new Date().toISOString(),
      metadata: { topic, rating: newRating, classNumber },
    });
  };

  const handleAnswerChange = (questionIndex: number, answer: string) => {
    const questionKey = `q${questionIndex + 1}`;
    setQuestionAnswers((prev) => ({ ...prev, [questionKey]: answer }));

    if (answer.length > 0) {
      trackingManager.recordEvent({
        eventType: "question_answer",
        elementId: `Question_${questionIndex + 1}`,
        timestamp: new Date().toISOString(),
        metadata: {
          questionNumber: questionIndex + 1,
          answerLength: answer.length,
          question: PATIENT_QUESTIONS[questionIndex],
        },
      });
    }
  };

  const handleSubmitQuestions = async () => {
    try {
      const result = await submitSurvey({
        survey_type: "questions",
        file: currentFile,
        speaker: patientId || currentSpeaker,
        answers: questionAnswers,
      });
      console.log("📝 [Patient Questions Submitted]", result);
      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: "Questions_Submit_Button",
        timestamp: new Date().toISOString(),
        metadata: {
          answeredQuestions: Object.keys(questionAnswers).length,
          totalQuestions: PATIENT_QUESTIONS.length,
        },
      });
      alert("Thank you! Your responses have been recorded.");
    } catch (error) {
      console.error("❌ Questions 제출 실패:", error);
      alert("Failed to submit. Please try again.");
    }
  };

  const handleSDMAnswerChange = (
    questionId: keyof SDMAnswers,
    value: YesNoAnswer | ScaleAnswer
  ) => {
    setSdmAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmitSDM = async () => {
    try {
      const result = await submitSurvey({
        survey_type: "sdm",
        file: currentFile,
        speaker: patientId || currentSpeaker,
        answers: sdmAnswers,
      });
      console.log("📋 [SDM Responses Submitted]", result);
      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: "SDM_Submit_Button",
        timestamp: new Date().toISOString(),
        metadata: {
          answers: sdmAnswers,
          answeredCount: Object.values(sdmAnswers).filter((v) => v !== null)
            .length,
          totalQuestions: 4,
        },
      });
      setSubmittedSurveys((prev) => ({ ...prev, sdm: true }));
      alert(
        "Thank you! Your Shared Decision Making responses have been recorded."
      );
    } catch (error) {
      console.error("❌ SDM 제출 실패:", error);
      alert("Failed to submit. Please try again.");
    }
  };

  const handleBaselineChange = (field: keyof BaselineAnswers, value: any) => {
    setBaselineAnswers((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitBaseline = async () => {
    try {
      const result = await submitSurvey({
        survey_type: "baseline",
        file: currentFile,
        speaker: patientId || currentSpeaker,
        answers: baselineAnswers,
      });
      console.log("📋 [Baseline Information Submitted]", result);
      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: "Baseline_Submit_Button",
        timestamp: new Date().toISOString(),
        metadata: { answers: baselineAnswers },
      });
      setSubmittedSurveys((prev) => ({ ...prev, baseline: true }));
      alert("Thank you! Your baseline information has been recorded.");
    } catch (error) {
      console.error("❌ Baseline 제출 실패:", error);
      alert("Failed to submit. Please try again.");
    }
  };

  const handleDCSChange = (
    questionId: keyof DecisionalConflictAnswers,
    value: LikertAnswer
  ) => {
    setDcsAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmitDCS = async () => {
    try {
      const result = await submitSurvey({
        survey_type: "dcs",
        file: currentFile,
        speaker: patientId || currentSpeaker,
        answers: dcsAnswers,
      });
      console.log("📋 [DCS Responses Submitted]", result);
      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: "DCS_Submit_Button",
        timestamp: new Date().toISOString(),
        metadata: {
          answers: dcsAnswers,
          answeredCount: Object.values(dcsAnswers).filter((v) => v !== null)
            .length,
          totalQuestions: 16,
        },
      });
      setSubmittedSurveys((prev) => ({ ...prev, dcs: true }));
      alert(
        "Thank you! Your Decisional Conflict Survey responses have been recorded."
      );
    } catch (error) {
      console.error("❌ DCS 제출 실패:", error);
      alert("Failed to submit. Please try again.");
    }
  };

  const handleRiskChange = (
    questionId: keyof RiskPerceptionAnswers,
    value: string
  ) => {
    setRiskAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmitRisk = async () => {
    try {
      const result = await submitSurvey({
        survey_type: "risk_perception",
        file: currentFile,
        speaker: patientId || currentSpeaker,
        answers: riskAnswers,
      });
      console.log("📋 [Risk Perception Submitted]", result);
      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: "RiskPerception_Submit_Button",
        timestamp: new Date().toISOString(),
        metadata: {
          answers: riskAnswers,
          answeredCount: Object.values(riskAnswers).filter((v) => v !== null)
            .length,
          totalQuestions: 5,
        },
      });
      setSubmittedSurveys((prev) => ({ ...prev, risk: true }));
      alert("Thank you! Your Risk Perception responses have been recorded.");
    } catch (error) {
      console.error("❌ Risk Perception 제출 실패:", error);
      alert("Failed to submit. Please try again.");
    }
  };

  const handleSatisfactionChange = (
    field: keyof PatientSatisfactionAnswers,
    value: any
  ) => {
    setSatisfactionAnswers((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitSatisfaction = async () => {
    try {
      const result = await submitSurvey({
        survey_type: "satisfaction",
        file: currentFile,
        speaker: patientId || currentSpeaker,
        answers: satisfactionAnswers,
      });
      console.log("📋 [Patient Satisfaction Submitted]", result);
      trackingManager.recordEvent({
        eventType: "button_click",
        elementId: "Satisfaction_Submit_Button",
        timestamp: new Date().toISOString(),
        metadata: { answers: satisfactionAnswers },
      });
      setSubmittedSurveys((prev) => ({ ...prev, satisfaction: true }));
      alert("Thank you! Your satisfaction feedback has been recorded.");
    } catch (error) {
      console.error("❌ Satisfaction 제출 실패:", error);
      alert("Failed to submit. Please try again.");
    }
  };

  const handleTrackEvent = (eventData: {
    eventType: string;
    elementId: string;
    metadata?: Record<string, any>;
  }) => {
    trackingManager.recordEvent({
      ...eventData,
      timestamp: new Date().toISOString(),
    } as TrackingEvent);
  };

  const toggleKeyVisibility = (topic: string) =>
    setShowKeys((s) => ({ ...s, [topic]: !s[topic] }));

  const handleDownloadPdf = async () => {
    const originalViewMode = viewMode;
    const originalActiveTab = activeTab;
    setViewMode("full");
    setActiveTab(null);
    await new Promise((resolve) => setTimeout(resolve, 500));
    window.print();
    setTimeout(() => {
      setViewMode(originalViewMode);
      setActiveTab(originalActiveTab);
    }, 1000);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 7.6 Print Styles Setup
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @media print {
        body * { visibility: hidden; }
        #report-content, #report-content * { visibility: visible; }
        #report-content { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
        button { display: none !important; }
        @page { size: A4; margin: 1.5cm; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // 7.7 Derived State for Tabs
  // ─────────────────────────────────────────────────────────────────────────

  const currentTopicData = activeTab ? consultationTopics[activeTab] : null;

  const isQuestionsTab = activeTab === "Patient Questions";
  const isSDMTab = activeTab === "Shared Decision Making (SDM)";
  const isBaselineTab = activeTab === "Baseline Information";
  const isDCSTab = activeTab === "Decisional Conflict";
  const isRiskTab = activeTab === "Risk Perception";
  const isSatisfactionTab = activeTab === "Patient Satisfaction";

  // ─────────────────────────────────────────────────────────────────────────
  // 7.7.1 Survey Progress Calculation
  // ─────────────────────────────────────────────────────────────────────────

  const surveyProgress = useMemo(() => {
    const sdmAnswered = Object.values(sdmAnswers).filter(
      (v) => v !== null
    ).length;
    const sdmTotal = 4;

    const dcsAnswered = Object.values(dcsAnswers).filter(
      (v) => v !== null
    ).length;
    const dcsTotal = 16;

    const riskAnswered = Object.values(riskAnswers).filter(
      (v) => v !== null
    ).length;
    const riskTotal = 5;

    const satAnswered = satisfactionAnswers.q1 !== null ? 1 : 0;
    const satTotal = 1;

    const totalAnswered =
      sdmAnswered + dcsAnswered + riskAnswered + satAnswered;
    const totalQuestions = sdmTotal + dcsTotal + riskTotal + satTotal;
    const percentage = Math.round((totalAnswered / totalQuestions) * 100);

    return {
      sdm: { answered: sdmAnswered, total: sdmTotal },
      dcs: { answered: dcsAnswered, total: dcsTotal },
      risk: { answered: riskAnswered, total: riskTotal },
      satisfaction: { answered: satAnswered, total: satTotal },
      total: { answered: totalAnswered, total: totalQuestions, percentage },
    };
  }, [sdmAnswers, dcsAnswers, riskAnswers, satisfactionAnswers]);

  // ─────────────────────────────────────────────────────────────────────────
  // 7.8 Loading & Error States
  // ─────────────────────────────────────────────────────────────────────────

  if (apiLoading) {
    return (
      <div
        className={cx(
          "min-h-screen flex items-center justify-center",
          isDarkMode ? "bg-slate-950" : "bg-gray-50"
        )}
      >
        <div className="text-center">
          <div
            className={cx(
              "animate-spin rounded-full h-10 w-10 border-2 border-t-transparent mb-4 mx-auto",
              isDarkMode ? "border-blue-400" : "border-blue-600"
            )}
          />
          <div
            className={cx(
              "text-base",
              isDarkMode ? "text-slate-400" : "text-gray-600"
            )}
          >
            Loading consultation summary...
          </div>
        </div>
      </div>
    );
  }

  if (apiError) {
    return (
      <div
        className={cx(
          "min-h-screen flex items-center justify-center p-8",
          isDarkMode ? "bg-slate-950" : "bg-gray-50"
        )}
      >
        <div
          className={cx(
            "max-w-md w-full p-6 rounded-lg border",
            isDarkMode
              ? "bg-slate-900 border-slate-800"
              : "bg-white border-gray-200"
          )}
        >
          <div className="text-center">
            <div
              className={cx(
                "w-12 h-12 mx-auto mb-4 rounded-lg flex items-center justify-center",
                isDarkMode ? "bg-red-900/50" : "bg-red-50"
              )}
            >
              <svg
                className={cx(
                  "w-6 h-6",
                  isDarkMode ? "text-red-400" : "text-red-500"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h2
              className={cx(
                "text-lg font-semibold mb-2",
                isDarkMode ? "text-slate-100" : "text-gray-900"
              )}
            >
              Unable to Load Report
            </h2>
            <p
              className={cx(
                "mb-4 text-sm",
                isDarkMode ? "text-slate-400" : "text-gray-500"
              )}
            >
              {apiError}
            </p>
            <button
              onClick={() => window.location.reload()}
              className={cx(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isDarkMode
                  ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7.9 Main Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cx("min-h-screen", isDarkMode ? "bg-slate-950" : "bg-gray-50")}
    >
      <div className="max-w-6xl mx-auto" id="report-content">
        {/* ═══════════════════════════════════════════════════════════════════
            HEADER SECTION - UPDATED: Clean, minimal
        ═══════════════════════════════════════════════════════════════════ */}
        <div
          className={cx(
            isDarkMode
              ? "bg-slate-900 border-b border-slate-800"
              : "bg-white border-b border-gray-200"
          )}
        >
          <div className="px-8 lg:px-12 py-8">
            <div className="text-center">
              {/* Logo Icon - Smaller */}
              <div
                className={cx(
                  "inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4",
                  isDarkMode ? "bg-blue-900/50" : "bg-blue-50"
                )}
              >
                <svg
                  className={cx(
                    "w-6 h-6",
                    isDarkMode ? "text-blue-400" : "text-blue-600"
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>

              <h1
                className={cx(
                  "text-2xl font-semibold mb-1",
                  isDarkMode ? "text-slate-100" : "text-gray-900"
                )}
              >
                Patient Consultation Report
              </h1>
              <div
                className={cx(
                  "text-sm mb-6",
                  isDarkMode ? "text-slate-400" : "text-gray-500"
                )}
              >
                Prostate Cancer Treatment Discussion Summary
              </div>

              {/* Print Button - Simplified */}
              <div className="mb-6 no-print">
                <button
                  onClick={handleDownloadPdf}
                  data-track-proximity="PDFDownload_Button"
                  className={cx(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    isDarkMode
                      ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    />
                  </svg>
                  <span>Print / Save as PDF</span>
                </button>
              </div>

              {/* View Mode Toggle - Cleaner */}
              <div className="mb-6 no-print">
                <div
                  className={cx(
                    "inline-flex rounded-lg p-1",
                    isDarkMode ? "bg-slate-800" : "bg-gray-100"
                  )}
                >
                  <button
                    onClick={() => setViewMode("topics")}
                    data-track-proximity="ViewMode_Topics"
                    className={cx(
                      "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                      viewMode === "topics"
                        ? isDarkMode
                          ? "bg-slate-700 text-slate-100"
                          : "bg-white text-gray-900 shadow-sm"
                        : isDarkMode
                        ? "text-slate-400 hover:text-slate-200"
                        : "text-gray-600 hover:text-gray-800"
                    )}
                  >
                    Summary & Topics
                  </button>
                  <button
                    onClick={() => setViewMode("full")}
                    data-track-proximity="ViewMode_Full"
                    className={cx(
                      "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                      viewMode === "full"
                        ? isDarkMode
                          ? "bg-slate-700 text-slate-100"
                          : "bg-white text-gray-900 shadow-sm"
                        : isDarkMode
                        ? "text-slate-400 hover:text-slate-200"
                        : "text-gray-600 hover:text-gray-800"
                    )}
                  >
                    Full Report
                  </button>
                </div>
              </div>

              {/* Patient Info - Simplified */}
              <div
                className={cx(
                  "grid grid-cols-1 md:grid-cols-3 gap-4 text-center",
                  isDarkMode ? "text-slate-200" : "text-gray-700"
                )}
              >
                <div>
                  <div
                    className={cx(
                      "text-xs uppercase tracking-wider mb-0.5",
                      isDarkMode ? "text-slate-500" : "text-gray-400"
                    )}
                  >
                    Patient
                  </div>
                  <div className="text-sm font-medium">Patient A</div>
                  <div
                    className={cx(
                      "text-xs",
                      isDarkMode ? "text-slate-500" : "text-gray-400"
                    )}
                  >
                    ID: {patientId || currentSpeaker}
                  </div>
                </div>
                <div>
                  <div
                    className={cx(
                      "text-xs uppercase tracking-wider mb-0.5",
                      isDarkMode ? "text-slate-500" : "text-gray-400"
                    )}
                  >
                    Consultation Date
                  </div>
                  <div className="text-sm font-medium">September 4, 2025</div>
                </div>
                <div>
                  <div
                    className={cx(
                      "text-xs uppercase tracking-wider mb-0.5",
                      isDarkMode ? "text-slate-500" : "text-gray-400"
                    )}
                  >
                    Attending Physician
                  </div>
                  <div className="text-sm font-medium">Dr. Smith</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            BODY SECTION - TOPICS MODE - UPDATED: Clean styling
        ═══════════════════════════════════════════════════════════════════ */}
        {viewMode === "topics" ? (
          <div
            className={cx(
              isDarkMode ? "bg-slate-900" : "bg-white",
              "min-h-screen"
            )}
          >
            <div className="px-6 lg:px-12 py-8 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
              {/* Main Content Column */}
              <div>
                {/* Overall Summary - Landing - UPDATED */}
                {activeTab === null && (
                  <section
                    data-track-proximity="OverallSummary_Card"
                    className={cx(
                      "p-6 rounded-lg border mb-8",
                      isDarkMode
                        ? "bg-slate-800/50 border-slate-700"
                        : "bg-gray-50 border-gray-200"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <h2
                        className={cx(
                          "text-lg font-semibold",
                          isDarkMode ? "text-slate-100" : "text-gray-900"
                        )}
                      >
                        Overall Summary
                      </h2>
                      <StarRating
                        value={ratings.overall || 0}
                        onChange={(v) =>
                          setRatings((r) => ({ ...r, overall: v }))
                        }
                        label="Helpful?"
                        isDark={isDarkMode}
                        trackingName="OverallSummary_Rating"
                      />
                    </div>
                    <p
                      className={cx(
                        "text-base leading-relaxed",
                        isDarkMode ? "text-slate-300" : "text-gray-600"
                      )}
                    >
                      {overallSummary}
                    </p>
                  </section>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    BASELINE INFORMATION SECTION - UPDATED
                ═══════════════════════════════════════════════════════════ */}
                {isBaselineTab && (
                  <section data-track-proximity="Baseline_Section">
                    <SectionHeader
                      title="Baseline Information"
                      description="According to Cedars-Sinai Medical Center policy, we are required to collect additional demographic information for research purposes."
                      icon={
                        <svg
                          className={cx(
                            "w-5 h-5",
                            isDarkMode ? "text-blue-400" : "text-blue-600"
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      }
                      iconBgColor={isDarkMode ? "bg-blue-900/50" : "bg-blue-50"}
                      iconBorderColor=""
                      isDark={isDarkMode}
                    />

                    <div className="space-y-5">
                      <BaselineRadioGroup
                        questionText="What is your assigned sex at birth?"
                        options={BASELINE_OPTIONS.sexAtBirth}
                        value={baselineAnswers.sexAtBirth}
                        onChange={(v) => handleBaselineChange("sexAtBirth", v)}
                        isDark={isDarkMode}
                        trackingName="Baseline_SexAtBirth"
                        onTrackEvent={handleTrackEvent}
                      />

                      <BaselineCheckboxGroup
                        questionText="What is your Race? (select all that apply)"
                        options={BASELINE_OPTIONS.race}
                        values={baselineAnswers.race}
                        onChange={(v) => handleBaselineChange("race", v)}
                        isDark={isDarkMode}
                        trackingName="Baseline_Race"
                        onTrackEvent={handleTrackEvent}
                      />

                      <BaselineRadioGroup
                        questionText="What is the highest degree or level of education you have completed?"
                        options={BASELINE_OPTIONS.education}
                        value={baselineAnswers.education}
                        onChange={(v) => handleBaselineChange("education", v)}
                        isDark={isDarkMode}
                        trackingName="Baseline_Education"
                        onTrackEvent={handleTrackEvent}
                      />

                      <BaselineRadioGroup
                        questionText="What is your current marital status?"
                        options={BASELINE_OPTIONS.maritalStatus}
                        value={baselineAnswers.maritalStatus}
                        onChange={(v) =>
                          handleBaselineChange("maritalStatus", v)
                        }
                        isDark={isDarkMode}
                        trackingName="Baseline_MaritalStatus"
                        onTrackEvent={handleTrackEvent}
                      />

                      <BaselineCheckboxGroup
                        questionText="What is your employment status? (select all that apply)"
                        options={BASELINE_OPTIONS.employment}
                        values={baselineAnswers.employment}
                        onChange={(v) => handleBaselineChange("employment", v)}
                        isDark={isDarkMode}
                        trackingName="Baseline_Employment"
                        onTrackEvent={handleTrackEvent}
                      />

                      {baselineAnswers.employment.includes("other") && (
                        <BaselineTextInput
                          label="Please specify employment status:"
                          value={baselineAnswers.employmentOther}
                          onChange={(v) =>
                            handleBaselineChange("employmentOther", v)
                          }
                          isDark={isDarkMode}
                        />
                      )}
                    </div>

                    <SubmitButton
                      onClick={handleSubmitBaseline}
                      label="Submit Baseline Information"
                      trackingName="Baseline_Submit_Button"
                      colorScheme="blue"
                      isDark={isDarkMode}
                    />
                  </section>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    SDM SECTION - UPDATED
                ═══════════════════════════════════════════════════════════ */}
                {isSDMTab && (
                  <section data-track-proximity="SDM_Section">
                    <SectionHeader
                      title="Shared Decision Making (SDM)"
                      description="Please answer the following questions about your experience with shared decision making during your consultation."
                      icon={
                        <svg
                          className={cx(
                            "w-5 h-5",
                            isDarkMode ? "text-blue-400" : "text-blue-600"
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                          />
                        </svg>
                      }
                      iconBgColor={isDarkMode ? "bg-blue-900/50" : "bg-blue-50"}
                      iconBorderColor=""
                      isDark={isDarkMode}
                    />

                    {/* SDM Progress Bar - UPDATED */}
                    <div
                      className={cx(
                        "mb-6 p-4 rounded-lg border",
                        isDarkMode
                          ? "bg-slate-800/50 border-slate-700"
                          : "bg-gray-50 border-gray-200"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={cx(
                            "text-sm",
                            isDarkMode ? "text-slate-400" : "text-gray-500"
                          )}
                        >
                          Progress
                        </span>
                        <span
                          className={cx(
                            "text-sm font-medium",
                            surveyProgress.sdm.answered ===
                              surveyProgress.sdm.total
                              ? "text-green-600"
                              : isDarkMode
                              ? "text-slate-300"
                              : "text-gray-700"
                          )}
                        >
                          {surveyProgress.sdm.answered}/
                          {surveyProgress.sdm.total} (
                          {Math.round(
                            (surveyProgress.sdm.answered /
                              surveyProgress.sdm.total) *
                              100
                          )}
                          %)
                        </span>
                      </div>
                      <div
                        className={cx(
                          "w-full h-1.5 rounded-full overflow-hidden",
                          isDarkMode ? "bg-slate-700" : "bg-gray-200"
                        )}
                      >
                        <div
                          className={cx(
                            "h-full rounded-full transition-all duration-300",
                            surveyProgress.sdm.answered ===
                              surveyProgress.sdm.total
                              ? "bg-green-500"
                              : "bg-blue-500"
                          )}
                          style={{
                            width: `${
                              (surveyProgress.sdm.answered /
                                surveyProgress.sdm.total) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-5">
                      <YesNoQuestion
                        questionNumber={1}
                        questionText={SDM_QUESTIONS[0].text}
                        value={sdmAnswers.q1}
                        onChange={(v) => handleSDMAnswerChange("q1", v)}
                        isDark={isDarkMode}
                        trackingName="SDM_Q1"
                        onTrackEvent={handleTrackEvent}
                      />
                      <ScaleQuestion
                        questionNumber={2}
                        questionText={SDM_QUESTIONS[1].text}
                        value={sdmAnswers.q2}
                        onChange={(v) =>
                          handleSDMAnswerChange("q2", v as ScaleAnswer)
                        }
                        isDark={isDarkMode}
                        trackingName="SDM_Q2"
                        onTrackEvent={handleTrackEvent}
                      />
                      <ScaleQuestion
                        questionNumber={3}
                        questionText={SDM_QUESTIONS[2].text}
                        value={sdmAnswers.q3}
                        onChange={(v) =>
                          handleSDMAnswerChange("q3", v as ScaleAnswer)
                        }
                        isDark={isDarkMode}
                        trackingName="SDM_Q3"
                        onTrackEvent={handleTrackEvent}
                      />
                      <YesNoQuestion
                        questionNumber={4}
                        questionText={SDM_QUESTIONS[3].text}
                        value={sdmAnswers.q4}
                        onChange={(v) => handleSDMAnswerChange("q4", v)}
                        isDark={isDarkMode}
                        trackingName="SDM_Q4"
                        onTrackEvent={handleTrackEvent}
                      />
                    </div>

                    <SubmitButton
                      onClick={handleSubmitSDM}
                      label="Submit SDM Responses"
                      trackingName="SDM_Submit_Button"
                      colorScheme="blue"
                      isDark={isDarkMode}
                    />
                  </section>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    DECISIONAL CONFLICT SURVEY SECTION - UPDATED
                ═══════════════════════════════════════════════════════════ */}
                {isDCSTab && (
                  <section data-track-proximity="DCS_Section">
                    <SectionHeader
                      title="Decisional Conflict Survey"
                      description="Please rate how strongly you agree or disagree with each of the following statements about your treatment decision."
                      icon={
                        <svg
                          className={cx(
                            "w-5 h-5",
                            isDarkMode ? "text-blue-400" : "text-blue-600"
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      }
                      iconBgColor={isDarkMode ? "bg-blue-900/50" : "bg-blue-50"}
                      iconBorderColor=""
                      isDark={isDarkMode}
                    />

                    <DecisionalConflictSurvey
                      answers={dcsAnswers}
                      onChange={handleDCSChange}
                      onSubmit={handleSubmitDCS}
                      isDark={isDarkMode}
                      onTrackEvent={handleTrackEvent}
                    />
                  </section>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    RISK PERCEPTION SURVEY SECTION - UPDATED
                ═══════════════════════════════════════════════════════════ */}
                {isRiskTab && (
                  <section data-track-proximity="RiskPerception_Section">
                    <SectionHeader
                      title="Risk Perception Survey"
                      description="Please select the answer that best represents your understanding of the risks associated with your treatment options."
                      icon={
                        <svg
                          className={cx(
                            "w-5 h-5",
                            isDarkMode ? "text-blue-400" : "text-blue-600"
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                          />
                        </svg>
                      }
                      iconBgColor={isDarkMode ? "bg-blue-900/50" : "bg-blue-50"}
                      iconBorderColor=""
                      isDark={isDarkMode}
                    />

                    <RiskPerceptionSurvey
                      answers={riskAnswers}
                      onChange={handleRiskChange}
                      onSubmit={handleSubmitRisk}
                      isDark={isDarkMode}
                      variant="post"
                      onTrackEvent={handleTrackEvent}
                    />
                  </section>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    PATIENT SATISFACTION SURVEY SECTION - UPDATED
                ═══════════════════════════════════════════════════════════ */}
                {isSatisfactionTab && (
                  <section data-track-proximity="Satisfaction_Section">
                    <SectionHeader
                      title="Patient Satisfaction Survey"
                      description="Your feedback helps us improve the quality of our consultation reports and patient care."
                      icon={
                        <svg
                          className={cx(
                            "w-5 h-5",
                            isDarkMode ? "text-blue-400" : "text-blue-600"
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      }
                      iconBgColor={isDarkMode ? "bg-blue-900/50" : "bg-blue-50"}
                      iconBorderColor=""
                      isDark={isDarkMode}
                    />

                    {/* Satisfaction Progress Bar - UPDATED */}
                    <div
                      className={cx(
                        "mb-6 p-4 rounded-lg border",
                        isDarkMode
                          ? "bg-slate-800/50 border-slate-700"
                          : "bg-gray-50 border-gray-200"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={cx(
                            "text-sm",
                            isDarkMode ? "text-slate-400" : "text-gray-500"
                          )}
                        >
                          Progress
                        </span>
                        <span
                          className={cx(
                            "text-sm font-medium",
                            surveyProgress.satisfaction.answered ===
                              surveyProgress.satisfaction.total
                              ? "text-green-600"
                              : isDarkMode
                              ? "text-slate-300"
                              : "text-gray-700"
                          )}
                        >
                          {surveyProgress.satisfaction.answered}/
                          {surveyProgress.satisfaction.total} (
                          {Math.round(
                            (surveyProgress.satisfaction.answered /
                              surveyProgress.satisfaction.total) *
                              100
                          )}
                          %)
                        </span>
                      </div>
                      <div
                        className={cx(
                          "w-full h-1.5 rounded-full overflow-hidden",
                          isDarkMode ? "bg-slate-700" : "bg-gray-200"
                        )}
                      >
                        <div
                          className={cx(
                            "h-full rounded-full transition-all duration-300",
                            surveyProgress.satisfaction.answered ===
                              surveyProgress.satisfaction.total
                              ? "bg-green-500"
                              : "bg-blue-500"
                          )}
                          style={{
                            width: `${
                              (surveyProgress.satisfaction.answered /
                                surveyProgress.satisfaction.total) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    <PatientSatisfactionSurvey
                      answers={satisfactionAnswers}
                      onChange={handleSatisfactionChange}
                      onSubmit={handleSubmitSatisfaction}
                      isDark={isDarkMode}
                      onTrackEvent={handleTrackEvent}
                    />
                  </section>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    PATIENT QUESTIONS SECTION - UPDATED
                ═══════════════════════════════════════════════════════════ */}
                {isQuestionsTab && (
                  <section data-track-proximity="PatientQuestions_Section">
                    <SectionHeader
                      title="Questions for You"
                      description="We'd love to hear from you. Please take a moment to answer these questions to help us better understand your needs."
                      icon={
                        <svg
                          className={cx(
                            "w-5 h-5",
                            isDarkMode ? "text-blue-400" : "text-blue-600"
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      }
                      iconBgColor={isDarkMode ? "bg-blue-900/50" : "bg-blue-50"}
                      iconBorderColor=""
                      isDark={isDarkMode}
                    />

                    <div className="space-y-4">
                      {PATIENT_QUESTIONS.map((question, index) => (
                        <div
                          key={index}
                          data-track-proximity={`Question_${index + 1}_Input`}
                          className={cx(
                            "p-4 rounded-lg border transition-colors",
                            isDarkMode
                              ? "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                              : "bg-white border-gray-200 hover:border-gray-300"
                          )}
                        >
                          <label
                            className={cx(
                              "block text-sm font-medium mb-2",
                              isDarkMode ? "text-slate-200" : "text-gray-700"
                            )}
                          >
                            <span
                              className={cx(
                                "inline-flex items-center justify-center w-5 h-5 rounded text-xs font-medium mr-2",
                                isDarkMode
                                  ? "bg-slate-700 text-slate-300"
                                  : "bg-gray-100 text-gray-600"
                              )}
                            >
                              {index + 1}
                            </span>
                            {question}
                          </label>
                          <textarea
                            value={questionAnswers[`q${index + 1}`] || ""}
                            onChange={(e) =>
                              handleAnswerChange(index, e.target.value)
                            }
                            placeholder="Type your answer here..."
                            rows={2}
                            className={cx(
                              "w-full px-3 py-2 rounded-lg border text-sm transition-colors resize-none",
                              isDarkMode
                                ? "bg-slate-900 border-slate-600 text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            )}
                          />
                        </div>
                      ))}
                    </div>

                    <SubmitButton
                      onClick={handleSubmitQuestions}
                      label="Submit Your Responses"
                      trackingName="Questions_Submit_Button"
                      colorScheme="blue"
                      isDark={isDarkMode}
                    />
                  </section>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    TOPIC DETAIL SECTION - UPDATED
                ═══════════════════════════════════════════════════════════ */}
                {activeTab !== null &&
                  !isQuestionsTab &&
                  !isSDMTab &&
                  !isBaselineTab &&
                  !isDCSTab &&
                  !isRiskTab &&
                  !isSatisfactionTab && (
                    <section>
                      <div className="mb-6">
                        <div className="flex items-center mb-2">
                          <div
                            className={cx(
                              "flex items-center justify-center w-10 h-10 rounded-lg mr-3",
                              isDarkMode ? "bg-blue-900/50" : "bg-blue-50"
                            )}
                          >
                            <span
                              className={cx(
                                "text-base font-semibold",
                                isDarkMode ? "text-blue-400" : "text-blue-600"
                              )}
                            >
                              {topicKeys.indexOf(activeTab) + 1 || 1}
                            </span>
                          </div>
                          <h3
                            className={cx(
                              "text-xl font-semibold",
                              isDarkMode ? "text-slate-100" : "text-gray-900"
                            )}
                          >
                            {activeTab}
                          </h3>
                        </div>
                      </div>

                      <div
                        data-track-proximity={`TopicSummary_${activeTab?.replace(
                          /\s+/g,
                          ""
                        )}`}
                        className={cx(
                          "p-6 rounded-lg border mb-6",
                          isDarkMode
                            ? "bg-slate-800/50 border-slate-700"
                            : "bg-gray-50 border-gray-200"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <h4
                            className={cx(
                              "text-base font-medium",
                              isDarkMode ? "text-slate-200" : "text-gray-800"
                            )}
                          >
                            Summary
                          </h4>
                          <StarRating
                            value={ratings[activeTab] || 0}
                            onChange={(v) => handleRatingChange(activeTab, v)}
                            label="Rate"
                            isDark={isDarkMode}
                            trackingName={`TopicRating_${activeTab?.replace(
                              /\s+/g,
                              ""
                            )}`}
                          />
                        </div>
                        <p
                          className={cx(
                            "text-base leading-relaxed",
                            isDarkMode ? "text-slate-300" : "text-gray-600"
                          )}
                        >
                          {currentTopicData?.aiSummary}
                        </p>
                      </div>

                      {/* Key Statements (if available) */}
                      {currentTopicData?.extractedSentences &&
                        currentTopicData.extractedSentences.length > 0 && (
                          <div className="mb-6">
                            <button
                              type="button"
                              onClick={() => toggleKeyVisibility(activeTab)}
                              data-track-proximity={`ToggleKeyStatements_${activeTab?.replace(
                                /\s+/g,
                                ""
                              )}`}
                              className={cx(
                                "px-3 py-1.5 rounded text-sm font-medium mb-4",
                                isDarkMode
                                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              )}
                            >
                              {showKeys[activeTab]
                                ? "Hide key statements"
                                : "Show key statements"}
                            </button>

                            {showKeys[activeTab] && (
                              <div
                                data-track-proximity={`KeyStatements_${activeTab?.replace(
                                  /\s+/g,
                                  ""
                                )}`}
                              >
                                <h4
                                  className={cx(
                                    "text-sm font-medium mb-3",
                                    isDarkMode
                                      ? "text-slate-300"
                                      : "text-gray-700"
                                  )}
                                >
                                  Key Statements from Consultation
                                </h4>
                                <div className="space-y-2">
                                  {currentTopicData?.extractedSentences?.map(
                                    (sentence: string, idx: number) => (
                                      <div
                                        key={idx}
                                        className={cx(
                                          "p-3 rounded-lg border",
                                          isDarkMode
                                            ? "bg-slate-800/50 border-slate-700"
                                            : "bg-white border-gray-200"
                                        )}
                                      >
                                        <div className="flex items-start gap-2">
                                          <div
                                            className={cx(
                                              "flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-medium",
                                              isDarkMode
                                                ? "bg-slate-700 text-slate-300"
                                                : "bg-gray-100 text-gray-600"
                                            )}
                                          >
                                            {idx + 1}
                                          </div>
                                          <p
                                            className={cx(
                                              "flex-1 text-sm leading-relaxed",
                                              isDarkMode
                                                ? "text-slate-300"
                                                : "text-gray-600"
                                            )}
                                          >
                                            {sentence}
                                          </p>
                                        </div>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                    </section>
                  )}
              </div>

              {/* ═══════════════════════════════════════════════════════════════
                  SIDEBAR NAVIGATION - UPDATED: Clean, unified colors
              ═══════════════════════════════════════════════════════════════ */}
              <aside
                className={cx("lg:sticky lg:top-6 no-print")}
                style={{ maxHeight: "calc(100vh - 3rem)" }}
              >
                <div
                  className={cx(
                    "rounded-lg p-4 overflow-y-auto border",
                    isDarkMode
                      ? "bg-slate-800/50 border-slate-700"
                      : "bg-white border-gray-200"
                  )}
                  style={{ maxHeight: "calc(100vh - 4rem)" }}
                >
                  <h3
                    className={cx(
                      "text-xs font-semibold uppercase tracking-wider mb-3",
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    )}
                  >
                    Navigate
                  </h3>
                  <div className="space-y-1">
                    {/* Overall Summary Button */}
                    <button
                      type="button"
                      onClick={() => setActiveTab(null)}
                      data-track-proximity="Nav_OverallSummary"
                      className={cx(
                        "w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors",
                        activeTab === null
                          ? isDarkMode
                            ? "bg-blue-600 text-white"
                            : "bg-blue-600 text-white"
                          : isDarkMode
                          ? "text-slate-300 hover:bg-slate-700"
                          : "text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      Overall Summary
                    </button>

                    {/* Topic Buttons */}
                    {topicKeys.map((topic, idx) => (
                      <button
                        type="button"
                        key={topic}
                        onClick={() => setActiveTab(topic)}
                        data-track-proximity={`Nav_Topic_${topic.replace(
                          /\s+/g,
                          ""
                        )}`}
                        className={cx(
                          "w-full text-left px-3 py-2 rounded text-sm font-medium flex items-center gap-2 transition-colors",
                          activeTab === topic
                            ? isDarkMode
                              ? "bg-blue-600 text-white"
                              : "bg-blue-600 text-white"
                            : isDarkMode
                            ? "text-slate-300 hover:bg-slate-700"
                            : "text-gray-600 hover:bg-gray-100"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-5 h-5 rounded text-xs font-medium",
                            activeTab === topic
                              ? "bg-blue-500 text-white"
                              : isDarkMode
                              ? "bg-slate-700 text-slate-400"
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          {idx + 1}
                        </span>
                        <span className="flex-1 truncate">{topic}</span>
                        {ratings[topic] > 0 && (
                          <span className="text-xs text-blue-500">
                            {"★".repeat(ratings[topic])}
                          </span>
                        )}
                      </button>
                    ))}

                    {/* Surveys Section Divider */}
                    <div
                      className={cx(
                        "pt-3 mt-3 border-t",
                        isDarkMode ? "border-slate-700" : "border-gray-200"
                      )}
                    >
                      <div
                        className={cx(
                          "text-xs font-semibold uppercase tracking-wider mb-2 px-3",
                          isDarkMode ? "text-slate-500" : "text-gray-400"
                        )}
                      >
                        Surveys
                      </div>

                      {/* Survey Progress Summary - UPDATED */}
                      <div
                        className={cx(
                          "mx-1 mb-3 p-3 rounded-lg",
                          isDarkMode ? "bg-slate-900/50" : "bg-gray-50"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={cx(
                              "text-xs",
                              isDarkMode ? "text-slate-500" : "text-gray-400"
                            )}
                          >
                            Progress
                          </span>
                          <span
                            className={cx(
                              "text-xs font-medium",
                              surveyProgress.total.percentage === 100
                                ? "text-green-600"
                                : isDarkMode
                                ? "text-slate-300"
                                : "text-gray-600"
                            )}
                          >
                            {surveyProgress.total.answered}/
                            {surveyProgress.total.total} (
                            {surveyProgress.total.percentage}%)
                          </span>
                        </div>
                        <div
                          className={cx(
                            "w-full h-1.5 rounded-full overflow-hidden",
                            isDarkMode ? "bg-slate-700" : "bg-gray-200"
                          )}
                        >
                          <div
                            className={cx(
                              "h-full rounded-full transition-all duration-300",
                              surveyProgress.total.percentage === 100
                                ? "bg-green-500"
                                : "bg-blue-500"
                            )}
                            style={{
                              width: `${surveyProgress.total.percentage}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* SDM Button - UPDATED */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTab("Shared Decision Making (SDM)")
                        }
                        data-track-proximity="Nav_SDM"
                        className={cx(
                          "w-full text-left px-3 py-2 rounded text-sm font-medium flex items-center gap-2 mt-1 transition-colors",
                          isSDMTab
                            ? isDarkMode
                              ? "bg-blue-600 text-white"
                              : "bg-blue-600 text-white"
                            : isDarkMode
                            ? "text-slate-300 hover:bg-slate-700"
                            : "text-gray-600 hover:bg-gray-100"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-5 h-5 rounded",
                            isSDMTab
                              ? "bg-blue-500 text-white"
                              : isDarkMode
                              ? "bg-slate-700 text-slate-400"
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          <CheckCircle size={12} />
                        </span>
                        <span className="flex-1">
                          SDM ({surveyProgress.sdm.answered}/
                          {surveyProgress.sdm.total})
                        </span>
                        {submittedSurveys.sdm && (
                          <Check
                            size={14}
                            className={cx(
                              isSDMTab ? "text-white" : "text-green-500"
                            )}
                          />
                        )}
                      </button>

                      {/* Decisional Conflict Button - UPDATED */}
                      <button
                        type="button"
                        onClick={() => setActiveTab("Decisional Conflict")}
                        data-track-proximity="Nav_DCS"
                        className={cx(
                          "w-full text-left px-3 py-2 rounded text-sm font-medium flex items-center gap-2 mt-1 transition-colors",
                          isDCSTab
                            ? isDarkMode
                              ? "bg-blue-600 text-white"
                              : "bg-blue-600 text-white"
                            : isDarkMode
                            ? "text-slate-300 hover:bg-slate-700"
                            : "text-gray-600 hover:bg-gray-100"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-5 h-5 rounded",
                            isDCSTab
                              ? "bg-blue-500 text-white"
                              : isDarkMode
                              ? "bg-slate-700 text-slate-400"
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          <HelpCircle size={12} />
                        </span>
                        <span className="flex-1">
                          Decisional Conflict ({surveyProgress.dcs.answered}/
                          {surveyProgress.dcs.total})
                        </span>
                        {submittedSurveys.dcs && (
                          <Check
                            size={14}
                            className={cx(
                              isDCSTab ? "text-white" : "text-green-500"
                            )}
                          />
                        )}
                      </button>

                      {/* Risk Perception Button - UPDATED */}
                      <button
                        type="button"
                        onClick={() => setActiveTab("Risk Perception")}
                        data-track-proximity="Nav_Risk"
                        className={cx(
                          "w-full text-left px-3 py-2 rounded text-sm font-medium flex items-center gap-2 mt-1 transition-colors",
                          isRiskTab
                            ? isDarkMode
                              ? "bg-blue-600 text-white"
                              : "bg-blue-600 text-white"
                            : isDarkMode
                            ? "text-slate-300 hover:bg-slate-700"
                            : "text-gray-600 hover:bg-gray-100"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-5 h-5 rounded",
                            isRiskTab
                              ? "bg-blue-500 text-white"
                              : isDarkMode
                              ? "bg-slate-700 text-slate-400"
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          <BarChart3 size={12} />
                        </span>
                        <span className="flex-1">
                          Risk Perception ({surveyProgress.risk.answered}/
                          {surveyProgress.risk.total})
                        </span>
                        {submittedSurveys.risk && (
                          <Check
                            size={14}
                            className={cx(
                              isRiskTab ? "text-white" : "text-green-500"
                            )}
                          />
                        )}
                      </button>

                      {/* Patient Satisfaction Button - UPDATED */}
                      <button
                        type="button"
                        onClick={() => setActiveTab("Patient Satisfaction")}
                        data-track-proximity="Nav_Satisfaction"
                        className={cx(
                          "w-full text-left px-3 py-2 rounded text-sm font-medium flex items-center gap-2 mt-1 transition-colors",
                          isSatisfactionTab
                            ? isDarkMode
                              ? "bg-blue-600 text-white"
                              : "bg-blue-600 text-white"
                            : isDarkMode
                            ? "text-slate-300 hover:bg-slate-700"
                            : "text-gray-600 hover:bg-gray-100"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-5 h-5 rounded",
                            isSatisfactionTab
                              ? "bg-blue-500 text-white"
                              : isDarkMode
                              ? "bg-slate-700 text-slate-400"
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          <Smile size={12} />
                        </span>
                        <span className="flex-1">
                          Satisfaction ({surveyProgress.satisfaction.answered}/
                          {surveyProgress.satisfaction.total})
                        </span>
                        {submittedSurveys.satisfaction && (
                          <Check
                            size={14}
                            className={cx(
                              isSatisfactionTab
                                ? "text-white"
                                : "text-green-500"
                            )}
                          />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        ) : (
          /* ═══════════════════════════════════════════════════════════════════
              BODY SECTION - FULL MODE - UPDATED
          ═══════════════════════════════════════════════════════════════════ */
          <div
            className={cx(
              isDarkMode ? "bg-slate-900" : "bg-white",
              "min-h-screen"
            )}
          >
            <div className="px-8 lg:px-12 py-8">
              <div className="text-center mb-8">
                <h2
                  className={cx(
                    "text-xl font-semibold mb-2",
                    isDarkMode ? "text-slate-100" : "text-gray-900"
                  )}
                >
                  Complete Consultation Summary
                </h2>
                <div
                  className={cx(
                    "text-sm",
                    isDarkMode ? "text-slate-400" : "text-gray-500"
                  )}
                >
                  All Discussion Topics
                </div>
              </div>

              {/* Overall Summary - UPDATED */}
              <section
                data-track-proximity="FullMode_OverallSummary"
                className={cx(
                  "p-6 rounded-lg border mb-8",
                  isDarkMode
                    ? "bg-slate-800/50 border-slate-700"
                    : "bg-gray-50 border-gray-200"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h3
                    className={cx(
                      "text-lg font-semibold",
                      isDarkMode ? "text-slate-100" : "text-gray-900"
                    )}
                  >
                    Overall Summary
                  </h3>
                  <StarRating
                    value={ratings.overall || 0}
                    onChange={(v) => setRatings((r) => ({ ...r, overall: v }))}
                    label="Helpful?"
                    isDark={isDarkMode}
                    trackingName="FullMode_OverallRating"
                  />
                </div>
                <p
                  className={cx(
                    "text-base leading-relaxed",
                    isDarkMode ? "text-slate-300" : "text-gray-600"
                  )}
                >
                  {overallSummary}
                </p>
              </section>

              <div className="py-6">
                <div
                  className={cx(
                    "border-t",
                    isDarkMode ? "border-slate-800" : "border-gray-200"
                  )}
                />
              </div>

              {/* All Topics from API - UPDATED */}
              {topicKeys.map((topicName, index) => {
                const topicData = consultationTopics[topicName];
                return (
                  <div key={topicName} className="relative">
                    <div className="flex items-center mb-4">
                      <div
                        className={cx(
                          "flex items-center justify-center w-10 h-10 rounded-lg mr-4",
                          isDarkMode ? "bg-blue-900/50" : "bg-blue-50"
                        )}
                      >
                        <span
                          className={cx(
                            "text-base font-semibold",
                            isDarkMode ? "text-blue-400" : "text-blue-600"
                          )}
                        >
                          {index + 1}
                        </span>
                      </div>
                      <h2
                        className={cx(
                          "text-lg font-semibold",
                          isDarkMode ? "text-slate-100" : "text-gray-900"
                        )}
                      >
                        {topicName}
                      </h2>
                    </div>

                    <div
                      className={cx(
                        "p-6 rounded-lg border mb-4",
                        isDarkMode
                          ? "bg-slate-800/50 border-slate-700"
                          : "bg-gray-50 border-gray-200"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <h3
                          className={cx(
                            "text-base font-medium",
                            isDarkMode ? "text-slate-200" : "text-gray-800"
                          )}
                        >
                          Summary
                        </h3>
                        <StarRating
                          value={ratings[topicName] || 0}
                          onChange={(v) => handleRatingChange(topicName, v)}
                          label="Rate"
                          isDark={isDarkMode}
                          trackingName={`FullMode_Rating_${topicName.replace(
                            /\s+/g,
                            ""
                          )}`}
                        />
                      </div>
                      <p
                        className={cx(
                          "text-sm leading-relaxed",
                          isDarkMode ? "text-slate-300" : "text-gray-600"
                        )}
                      >
                        {topicData?.aiSummary}
                      </p>
                    </div>

                    {index < topicKeys.length - 1 && (
                      <div className="py-6">
                        <div
                          className={cx(
                            "border-t",
                            isDarkMode ? "border-slate-800" : "border-gray-200"
                          )}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer - UPDATED: Minimal */}
        <div
          className={cx("h-px", isDarkMode ? "bg-slate-800" : "bg-gray-200")}
        />
      </div>
    </div>
  );
};

export default PatientReport;
