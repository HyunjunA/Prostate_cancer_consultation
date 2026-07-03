"use client";

/**
 * PatientInitialVisitReportV40.tsx
 *
 * First Visit Patient Dashboard.
 *
 * ============================================================================
 * V40 CHANGES — 2026-06-02 Tuesday meeting, item A-1 (report screen)
 * ============================================================================
 * The Overview (screen 0) is now the read-only first-visit REPORT screen:
 *   - both dropdowns (AI summary + supporting sentences) default CLOSED so the
 *     patient clicks to open (open events tracked as a secondary outcome),
 *   - no Back/Next bar and no progress step nav (mobile sticky + desktop
 *     right rail) on this screen,
 *   - "How to Use This Report" keeps only item 1 (items 2 & 3 removed).
 * A-2 (survey mode, entered via ?mode=survey): skips Overview (starts at the
 * first domain cp; Back never returns to Overview), and on each domain screen
 * the AI summary defaults OPEN while supporting sentences stay click-to-open.
 * Search "[V40 / A-1]" and "[V40 / A-2]" for the exact edits.
 *
 * ============================================================================
 * V39 CHANGES (fix the side-effect domain display: ed/inc/ius)
 * ============================================================================
 * Side-effect domains return ONE DB row per treatment (ablation/radiation/
 * surgery). Each row carries its own source sentence, but the AI's reformat
 * summary is the SAME domain-level text duplicated on every row. V38 (a)
 * concatenated the summary across rows -> the same paragraph rendered N times,
 * and (b) showed only the FIRST treatment's supporting sentence.
 *   Fix 1 (summary): append only DISTINCT reformat text -> shown once.
 *   Fix 2 (sources): collect EVERY treatment's source -> all shown, each
 *                    labelled by treatment.
 * Frontend-only change (data + backend unchanged); cp/le (single row) behave
 * exactly as before.
 *
 * Cloned from V37 as the base for the 2026-05-19 meeting item 6-2
 * wizard rework: split the single page into 6 screens (1 overview +
 * 5 domain screens) with a progress bar, per-domain Submit, gated
 * Next button, and a ?step= deep-link query param. V37 is preserved
 * as the legacy fallback; only the active branch points at V38.
 *
 * This initial commit is a verbatim clone (no behavior change) — the
 * wizard restructuring lands in follow-up commits.
 *
 * ============================================================================
 * V35 CHANGES (based on 2026-03-17 team meeting feedback 2-4):
 * ============================================================================
 *
 * Feedback 2-4: Replace star rating with NIH PROMIS unipolar helpfulness scale
 *   - Old: 1-5 star rating (Confusing / Little new info / Neutral / Helpful / Very helpful)
 *   - New: 5-level unipolar scale per NIH PROMIS standards:
 *     1 = Not at all helpful
 *     2 = A little bit helpful
 *     3 = Somewhat helpful
 *     4 = Very helpful
 *     5 = Extremely helpful
 *
 * Changes from V33:
 *   - Star icons replaced with labeled radio-style buttons
 *   - Rating legend updated to reflect PROMIS scale
 *   - Instructions updated (wording adjusted for helpfulness scale)
 *   - Topic header shows helpfulness level text instead of star icons
 *
 * ============================================================================
 * IMPLEMENTATION STATUS
 * ============================================================================
 *
 * ✅ IMPLEMENTED:
 * - Single page layout with all 5 topic summaries
 * - [V35] NIH PROMIS unipolar helpfulness scale (replaces star rating)
 * - Rating progress indicator
 * - AI-generated summary label on each topic
 * - Evidence sentences toggle UI (Show/Hide button)
 * - Click tracking for evidence expand/collapse
 * - Rating persistence via updateSingleClassScore API
 * - All topics collapsed by default
 * - [V33] Rating moved to bottom, compact style
 * - [V33] Evidence sentences promoted to main content area
 *
 * ✅ IMPLEMENTED (2026-03-27):
 * - Evidence sentences data connection
 *   Connected to GET /api/patient/sentences/{file}/{speaker}
 *   Fetches top-scoring sentences per class from sentence_prediction
 *   Mapped by class → topic name in consultationTopics useMemo
 *
 * ============================================================================
 *
 * Requirements (B. First Visit Screen Requirements - AI Summary Evaluation):
 * 1) Single page layout - Display all 5 category AI summaries on one screen
 * 2) Category-specific AI summaries only (5 total) - No overall summary
 * 3) Patient evaluation UX: NIH PROMIS unipolar helpfulness scale (1-5)
 * 4) Evidence sentences: Show/Hide toggle to expand
 * 5) Evidence sentence usage measurement: Click tracking
 * 6) AI-generated content labeling: "AI-generated summary" label
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { usePatientData } from "@/hooks/usePatientData";
import { useFirstVisitAnswers } from "@/hooks/useFirstVisitAnswers";
import {
  AnswerItem,
  DomainAnswers,
} from "@/api/firstVisitAnswersApi";
import { QID, fieldQuestionId } from "@/lib/firstVisitQuestions";
import { usePatientId } from "@/stores/usePatientId";
import { useFileId } from "@/stores/useFileId";
import { sendTrackingEvents } from "@/api/trackingApi";
import { trackFirst, startSession, endSession, type Domain } from "@/tracking/track";
import { Slider } from "@/components/ui/slider";

// Display name → backend domain code (cp/le/ed/inc/ius)
const TOPIC_TO_DOMAIN: Record<string, Domain> = {
  "Cancer Prognosis": "cp",
  "Life Expectancy": "le",
  "Erectile Dysfunction": "ed",
  "Urinary Incontinence": "inc",
  "Irritative Urinary Symptoms": "ius",
};
import { getOrCreateSession } from "@/tracking/utils/session.utils";

import {
  Info,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileText,
  MessageSquareText,
  CheckCircle2,
} from "lucide-react";

/* =============================================================================
   SECTION 1: TRACKING SYSTEM (Click Behavior-Based Measurement)
============================================================================= */

interface TrackingEvent {
  eventType:
    | "proximity_enter"
    | "proximity_exit"
    | "scroll_depth"
    | "dwell_time"
    | "button_click"
    | "section_view"
    | "topic_expand"
    | "topic_collapse"
    | "evidence_expand"
    | "evidence_collapse"
    | "rating_click"
    | "page_enter"
    | "page_exit";
  elementId: string;
  timestamp: string;
  patientId?: string;
  visitId?: string;
  dimensionType?: string;
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

  /**
   * Evidence sentence click statistics (for research analysis)
   * - No click → Summary alone was likely sufficient
   * - Click → User likely wanted to verify/supplement the summary
   */
  getEvidenceInteractionStats(): {
    topicsExpanded: string[];
    topicsNotExpanded: string[];
    totalExpands: number;
    totalCollapses: number;
  } {
    const expandEvents = this.events.filter(
      (e) => e.eventType === "evidence_expand",
    );
    const collapseEvents = this.events.filter(
      (e) => e.eventType === "evidence_collapse",
    );
    const topicsExpanded = [
      ...new Set(expandEvents.map((e) => e.dimensionType)),
    ].filter(Boolean);

    const allTopics = [
      "Cancer Prognosis",
      "Life Expectancy",
      "Erectile Dysfunction",
      "Urinary Incontinence",
      "Irritative Urinary Symptoms",
    ];
    const topicsNotExpanded = allTopics.filter(
      (t) => !topicsExpanded.includes(t),
    );

    return {
      topicsExpanded: topicsExpanded as string[],
      topicsNotExpanded,
      totalExpands: expandEvents.length,
      totalCollapses: collapseEvents.length,
    };
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
  (window as any).trackingManager = trackingManager;
}

// Tracking Hooks
const useCursorProximityTracking = (
  config: ProximityConfig = { threshold: 150, debounceMs: 100 },
) => {
  const proximityStates = useRef<Map<string, boolean>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const calculateDistance = useCallback(
    (mouseX: number, mouseY: number, element: HTMLElement): number => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return Math.sqrt(
        Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2),
      );
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        const trackableElements = document.querySelectorAll(
          "[data-track-proximity]",
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
    [config.threshold, config.debounceMs, calculateDistance],
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
  config: ScrollDepthConfig = {
    thresholds: [25, 50, 75, 100],
    debounceMs: 200,
  },
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
  config: DwellTimeConfig = { minDwellTime: 2000, trackingInterval: 500 },
) => {
  const dwellTimers = useRef<Map<string, number>>(new Map());
  const dwellStartTimes = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkVisibility = useCallback(() => {
    const trackableElements = document.querySelectorAll(
      "[data-track-proximity]",
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
============================================================================= */

interface PatientReportProps {
  isDarkMode?: boolean;
  // Optional: when provided (combined-survey flow), advancing past the LAST
  // survey domain calls this instead of being a dead-end, so the parent can
  // hand off to the follow-up surveys. Undefined for the standalone
  // "1st · Survey" entry → behavior is unchanged (last-screen Next stays disabled).
  onComplete?: () => void;
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

/* =============================================================================
   SECTION 3: UTILITY FUNCTIONS & CONSTANTS
============================================================================= */

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

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
  // Short model keys (from sentence_prediction.model)
  "cp": "Cancer Prognosis",
  "le": "Life Expectancy",
  "ed": "Erectile Dysfunction",
  "inc": "Urinary Incontinence",
  "ius": "Irritative Urinary Symptoms",
  // Full domain name keys (from pipeline)
  "cancer_prognosis": "Cancer Prognosis",
  "continence": "Urinary Incontinence",
  "erectile_dysfunction_potency": "Erectile Dysfunction",
  "irritative_urinary_symptoms_frequency_urgency_nocturnia": "Irritative Urinary Symptoms",
  "life_expectancy": "Life Expectancy",
};

// Display name → backend `domain` value (matches patient_summary_domain.domain
// strings written by the original R/AI pipeline). Used by /api/patient/scoring.
const TOPIC_TO_BACKEND_DOMAIN: Record<string, string> = {
  "Cancer Prognosis": "cancer_prognosis",
  "Life Expectancy": "life_expectancy",
  "Erectile Dysfunction": "erectile_dysfunction_potency",
  "Urinary Incontinence": "continence",
  "Irritative Urinary Symptoms": "irritative_urinary_symptoms_frequency_urgency_nocturnia",
};

const TOPIC_ORDER = [
  "Cancer Prognosis",
  "Life Expectancy",
  "Erectile Dysfunction",
  "Urinary Incontinence",
  "Irritative Urinary Symptoms",
];

// Modern color palette for topics
const TOPIC_COLORS: Record<
  string,
  { gradient: string; iconBg: string; border: string }
> = {
  "Cancer Prognosis": {
    gradient: "from-rose-500/10 via-pink-500/10 to-fuchsia-500/10",
    iconBg: "from-rose-500 to-pink-500",
    border: "border-rose-200/50 dark:border-rose-500/20",
  },
  "Life Expectancy": {
    gradient: "from-violet-500/10 via-purple-500/10 to-indigo-500/10",
    iconBg: "from-violet-500 to-purple-500",
    border: "border-violet-200/50 dark:border-violet-500/20",
  },
  "Erectile Dysfunction": {
    gradient: "from-sky-500/10 via-cyan-500/10 to-teal-500/10",
    iconBg: "from-sky-500 to-cyan-500",
    border: "border-sky-200/50 dark:border-sky-500/20",
  },
  "Urinary Incontinence": {
    gradient: "from-emerald-500/10 via-green-500/10 to-teal-500/10",
    iconBg: "from-emerald-500 to-green-500",
    border: "border-emerald-200/50 dark:border-emerald-500/20",
  },
  "Irritative Urinary Symptoms": {
    gradient: "from-amber-500/10 via-orange-500/10 to-yellow-500/10",
    iconBg: "from-amber-500 to-orange-500",
    border: "border-amber-200/50 dark:border-amber-500/20",
  },
};

/**
 * Helpfulness Scale Labels (NIH PROMIS Unipolar Scale)
 * Requirement: Display rating definitions so patients understand ratings consistently
 * Based on NIH PROMIS standards — unipolar helpfulness scale
 */
const HELPFULNESS_LABELS: Record<number, string> = {
  1: "Not at all helpful",
  2: "A little bit helpful",
  3: "Somewhat helpful",
  4: "Very helpful",
  5: "Extremely helpful",
};

/**
 * Per-domain helpfulness question.
 * Each topic card asks the patient how helpful the AI summary was for that
 * specific domain. Wording uses "How helpful was this information about ..."
 * so the question is grammatically aligned with the helpfulness rating
 * scale ("Not at all helpful" → "Extremely helpful"). Falls back to a
 * generic phrasing if the topic name is not in the map.
 */
const TOPIC_QUESTIONS: Record<string, string> = {
  "Cancer Prognosis":
    "How helpful was this information about Cancer Prognosis?",
  "Life Expectancy":
    "How helpful was this information about Life Expectancy?",
  "Erectile Dysfunction":
    "How helpful was this information about Erectile Dysfunction?",
  "Urinary Incontinence":
    "How helpful was this information about Urinary Incontinence?",
  "Irritative Urinary Symptoms":
    "How helpful was this information about Irritative Urinary Symptoms?",
};

/* =============================================================================
   SECTION 4: UI COMPONENTS
============================================================================= */

// AI Summary Badge - Required for patient trust/accountability/ethics
interface AISummaryBadgeProps {
  isDark?: boolean;
}

const AISummaryBadge: React.FC<AISummaryBadgeProps> = ({ isDark }) => {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
        "backdrop-blur-sm transition-all duration-200",
        isDark
          ? "bg-violet-500/20 text-violet-300 border border-violet-400/30"
          : "bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 text-violet-600 border border-violet-300/50",
      )}
    >
      <Sparkles size={11} />
      AI-generated summary
    </span>
  );
};

/**
 * Helpfulness Rating Component (NIH PROMIS Unipolar Scale)
 * Requirement 3) Patient evaluation UX: Helpfulness scale
 * - Rate each category summary on a 1-5 unipolar helpfulness scale
 * - Labels: Not at all helpful → Extremely helpful
 */
interface HelpfulnessRatingProps {
  value: number;
  onChange: (v: number) => void;
  isDark?: boolean;
  trackingName?: string;
  disabled?: boolean;
  // Pattern A behavior tracking — when all three are provided, a
  // rating_click event is sent to /api/track/patient-first.
  trackFile?: string;
  trackSpeaker?: string;
  trackDomain?: Domain;
  // Stable per-question id, written to metadata.question_id so the aggregator
  // can tell apart multiple rating questions in the same domain. Defaults to
  // "{domain}_helpfulness" (today there is one rating per domain).
  questionId?: string;
  // The wizard page (screen) this rating is on, written to metadata.screen.
  screen?: string;
}

const HelpfulnessRating: React.FC<HelpfulnessRatingProps> = React.memo(({
  value,
  onChange,
  isDark,
  trackingName,
  disabled = false,
  trackFile,
  trackSpeaker,
  trackDomain,
  questionId,
  screen,
}) => {
  return (
    // flex-nowrap forces all 5 buttons onto a single row; whitespace-nowrap on
    // each button keeps multi-word labels ("Extremely helpful") from wrapping
    // inside the button. flex-1 + min-w-0 lets the row shrink to fit narrower
    // containers without "Extremely helpful" being pushed to a new line.
    <div className="flex flex-nowrap gap-2">
      {[1, 2, 3, 4, 5].map((i) => {
        const isSelected = value === i;
        return (
          <button
            key={i}
            type="button"
            aria-label={`Rate ${i} - ${HELPFULNESS_LABELS[i]}`}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                onChange(i);
                trackingManager.recordEvent({
                  eventType: "rating_click",
                  elementId: trackingName || "unknown",
                  timestamp: new Date().toISOString(),
                  metadata: {
                    rating: i,
                    ratingMeaning: HELPFULNESS_LABELS[i],
                  },
                });
                if (trackFile && trackSpeaker && trackDomain) {
                  trackFirst(trackFile, trackSpeaker, {
                    event_type: "rating_click",
                    domain: trackDomain,
                    rating: i,
                    metadata: {
                      rating_meaning: HELPFULNESS_LABELS[i],
                      question_id: questionId ?? `${trackDomain}_helpfulness`,
                      screen,
                    },
                  });
                }
              }
            }}
            className={cx(
              "flex-1 min-w-0 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl text-xs font-medium border transition-all duration-200 whitespace-nowrap text-center",
              disabled && "cursor-not-allowed opacity-50",
              isSelected
                ? isDark
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/30"
                  : "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/30"
                : isDark
                  ? "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:border-slate-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50 hover:border-gray-400",
            )}
          >
            {HELPFULNESS_LABELS[i]}
          </button>
        );
      })}
    </div>
  );
});

HelpfulnessRating.displayName = "HelpfulnessRating";

/**
 * Helpfulness Scale Legend
 * Requirement: Display rating definitions on screen (NIH PROMIS unipolar scale)
 */
interface HelpfulnessLegendProps {
  isDark?: boolean;
}

const HelpfulnessLegend: React.FC<HelpfulnessLegendProps> = ({ isDark }) => {
  return (
    <div
      className={cx(
        "rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 border",
        isDark
          ? "bg-slate-900/50 border-slate-800/50"
          : "bg-white/60 border-gray-200/50 shadow-sm",
      )}
    >
      <div className="flex flex-nowrap items-center justify-center gap-2 overflow-x-auto">
        <span
          className={cx(
            "text-xs font-semibold mr-2 whitespace-nowrap shrink-0",
            isDark ? "text-slate-400" : "text-gray-500",
          )}
        >
          Helpfulness Scale:
        </span>
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className={cx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0",
              isDark ? "bg-slate-800/80" : "bg-gray-100/80",
            )}
          >
            <span
              className={cx(
                "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                isDark
                  ? "bg-indigo-500/30 text-indigo-300"
                  : "bg-indigo-100 text-indigo-600",
              )}
            >
              {level}
            </span>
            <span className={isDark ? "text-slate-400" : "text-gray-500"}>
              {HELPFULNESS_LABELS[level]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Instructions Box - Information-only guidance
interface InstructionsBoxProps {
  isDark?: boolean;
  // [V40 / A-1·A-2] "report" (1st-visit Overview) shows tool-usage only;
  // "survey" (2nd-visit per-domain) shows how-to-answer + navigation.
  variant?: "report" | "survey";
}

const InstructionsBox: React.FC<InstructionsBoxProps> = ({
  isDark,
  variant = "report",
}) => {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-3xl p-4 sm:p-5 lg:p-6 mb-4 sm:mb-6 lg:mb-8",
        "backdrop-blur-xl border",
        isDark
          ? "bg-gradient-to-br from-indigo-950/60 to-violet-950/60 border-indigo-500/20"
          : "bg-gradient-to-br from-white/80 to-indigo-50/80 border-indigo-200/50 shadow-xl shadow-indigo-500/5",
      )}
    >
      {/* Decorative elements */}
      <div
        className={cx(
          "absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl",
          isDark ? "bg-indigo-500/20" : "bg-indigo-300/30",
        )}
      />
      <div
        className={cx(
          "absolute -bottom-16 -left-16 w-32 h-32 rounded-full blur-2xl",
          isDark ? "bg-violet-500/20" : "bg-violet-300/20",
        )}
      />

      <div className="relative flex items-start gap-5">
        <div
          className={cx(
            "flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center",
            "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30",
          )}
        >
          <Info size={26} className="text-white" />
        </div>
        <div className="flex-1">
          <h3
            className={cx(
              "text-base sm:text-lg lg:text-xl font-bold mb-3 sm:mb-4",
              isDark ? "text-white" : "text-gray-900",
            )}
          >
            {variant === "survey"
              ? "How to Answer These Questions"
              : "How to Use This Report"}
          </h3>
          <div
            className={cx(
              "space-y-3 text-sm leading-relaxed",
              isDark ? "text-indigo-100/80" : "text-gray-600",
            )}
          >
            {variant === "report" ? (
              // [V40 / A-1] Report (Overview) screen: tool-usage only.
              <p className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <span>
                  Click each category card to <strong>open it</strong> and
                  review the <strong>AI-generated summary</strong> and the
                  supporting sentences from your visit.
                </span>
              </p>
            ) : (
              // [V40 / A-2] Survey (per-domain) screen: how-to-answer +
              // navigation — the items moved off the report screen.
              <>
                <p className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  <span>
                    <strong>Answer the questions</strong> for this category,
                    then click <strong>Submit</strong>. The AI summary and
                    supporting sentences stay available on the same screen.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  <span>
                    Move between categories with <strong>Back / Next</strong>.
                    Your progress is shown on the side.
                  </span>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Topic Card Component - With Helpfulness Rating
interface TopicCardProps {
  topicName: string;
  topicIndex: number;
  aiSummary: string;
  extractedSentences: Array<{
    sentence: string;
    context: string | null;
    pred_score: number;
    score: number | null;
    is_in_summary: boolean;
  }>;
  /** [DEBUG] domain-level ai_scores (0–5) as stored — one entry per row/treatment. */
  aiScores?: Array<number | null>;
  aiSourceSentence?: string;  // original sentence used to generate AI Summary
  aiSourceContext?: string | null;  // surrounding context with <main>...</main> around the focus sentence
  // [V39] one entry per treatment (side-effect domains) so every supporting
  // sentence is shown, each labelled by treatment. Falls back to the single
  // aiSourceSentence/aiSourceContext above when empty.
  aiSources?: Array<{ treatment: string | null; sentence: string | null; context: string | null }>;
  rating: number;
  onRatingChange: (rating: number) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  showEvidence: boolean;
  onToggleEvidence: () => void;
  // [V40] Sub-domain (treatment) breakdown. When a domain has >= 2 distinct
  // treatments, the card renders one section per treatment — each with its
  // own ai_score and its own "View relevant sentences" toggle. The
  // AI-Generated Summary stays domain-level (it is stored identically on
  // every treatment row). Domains with 0-1 treatments keep the single layout
  // and ignore these props.
  aiSubDomains?: Array<{
    treatment: string | null;
    aiScore: number | null;
    sources: Array<{ sentence: string | null; context: string | null }>;
  }>;
  // Per-treatment evidence toggle state/handler, keyed by treatment in the
  // parent so each sub-domain's "relevant sentences" opens independently.
  isSubEvidenceShown?: (treatment: string | null) => boolean;
  onToggleSubEvidence?: (treatment: string | null) => void;
  isSubmitted: boolean;
  onSubmit: () => void;
  /**
   * [V38] When false, the per-domain question UI (VAS sliders, radios,
   * factor multi-select) and the Submit button are hidden — the card
   * shows only the AI summary, helpfulness rating, and the "View
   * relevant sentences" toggle. Used on the wizard's Overview screen
   * so all 5 cards can be browsed without an answering UI. Defaults
   * to true to keep V37 call-sites behaving unchanged.
   */
  showQuestions?: boolean;
  /**
   * [V38] Whether the AI-Generated Summary panel is expanded. Lifted
   * to the parent so the wizard can enforce per-screen defaults (open
   * on Overview, closed on per-domain). Defaults to true so existing
   * V37 call-sites continue to render the summary inline.
   */
  showAiSummary?: boolean;
  onToggleAiSummary?: () => void;
  /** Server-side persisted answers for this domain (keyed by question_id),
   * used to prefill state on mount. */
  prefill?: DomainAnswers | null;
  /**
   * Persistence callback. Called with this domain's answers (one entry per
   * question_id) when the patient clicks Submit. If it resolves, the parent
   * will call onSubmit() to flip the submittedDomains flag; if it rejects,
   * the flag stays unchanged so progress reflects the server-confirmed state.
   */
  onSave?: (answers: AnswerItem[]) => Promise<void>;
  isDark?: boolean;
  patientId?: string;
  visitId?: string;
  trackFile?: string;
  trackSpeaker?: string;
  trackDomain?: Domain;
  /** The wizard page (screen) this card is rendered on — written to
   * metadata.screen on every event from this card so the admin can tell which
   * page an action happened on (Overview vs the per-category detail). */
  trackScreen?: string;
}

// [V40] Renders one source sentence with the <main>...</main> focus-sentence
// highlight. Extracted so the per-sub-domain evidence sections reuse the exact
// same highlight treatment as the single-domain evidence list above.
const SourceQuote: React.FC<{
  sentence: string | null;
  context: string | null;
  isDark: boolean;
}> = ({ sentence, context, isDark }) => (
  <p
    className={cx(
      "text-sm leading-relaxed italic",
      isDark ? "text-slate-300" : "text-gray-600",
    )}
  >
    &ldquo;
    {context && context.includes("<main>") ? (
      <>
        {context.split("<main>").map((part, pidx) => {
          if (pidx === 0) return <span key={pidx}>{part}</span>;
          const [highlighted, rest] = part.split("</main>");
          return (
            <span key={pidx}>
              <span
                className={cx(
                  "font-bold underline",
                  isDark ? "text-cyan-300" : "text-cyan-700",
                )}
              >
                {highlighted}
              </span>
              {rest}
            </span>
          );
        })}
      </>
    ) : (
      sentence
    )}
    &rdquo;
  </p>
);

const TopicCard: React.FC<TopicCardProps> = ({
  topicName,
  topicIndex,
  aiSummary,
  extractedSentences,
  aiScores,
  aiSourceSentence,
  aiSourceContext,
  aiSources,
  rating,
  onRatingChange,
  isExpanded,
  onToggleExpand,
  showEvidence,
  onToggleEvidence,
  aiSubDomains,
  isSubEvidenceShown,
  onToggleSubEvidence,
  isSubmitted,
  onSubmit,
  showQuestions = true,
  showAiSummary = true,
  onToggleAiSummary,
  prefill,
  onSave,
  isDark,
  patientId,
  visitId,
  trackFile,
  trackSpeaker,
  trackDomain,
  trackScreen,
}) => {
  const topicId = topicName.replace(/\s+/g, "");
  const colors = TOPIC_COLORS[topicName] || TOPIC_COLORS["Cancer Prognosis"];

  // [V40] A domain is rendered per sub-domain only when it has >= 2 distinct
  // treatments (e.g. ED = radiation + surgery). 0-1 treatments (cp/le, or a
  // side-effect domain with a single treatment) keep the single-domain layout.
  const hasSubDomains = (aiSubDomains?.length ?? 0) >= 2;

  // [V40 / feedback #1] Single-domain card (cp/le or a single-treatment domain):
  // "not discussed" when the (single) treatment's ai_score === 0. Mirrors the
  // per-sub-domain rule. null / score > 0 behave normally.
  const singleNotDiscussed =
    !hasSubDomains &&
    (aiSubDomains?.length ?? 0) >= 1 &&
    (aiSubDomains ?? []).every((s) => s.aiScore === 0);

  // [V38] Slider-interaction tracking. Each `slider_moved` event records one
  // settled value the patient committed: its slider_name, the value, and (via
  // trackFirst's client_timestamp) when. The behavior log therefore holds the
  // full change history — including re-edits AFTER Submit — so analysis can
  // reconstruct the trajectory (e.g. 50 → 70 → 65) and count revisions. The
  // "answered vs left at default 50" signal still falls out of this: any
  // slider_moved event at all means the patient touched that slider.
  //
  // Fired from the slider's onValueCommit (drag end / keyboard commit / track
  // click), NOT onValueChange, so a single drag yields one event per settle
  // instead of one per pixel.
  const trackSliderCommit = (sliderName: string, value: number) => {
    if (!trackFile || !trackSpeaker || !trackDomain) return;
    trackFirst(trackFile, trackSpeaker, {
      event_type: "slider_moved",
      domain: trackDomain,
      // question_id unifies the slider with every other question type; for
      // sliders it equals slider_name. slider_name is kept for backward
      // compatibility (validation + older rows / the "answered" signal).
      metadata: { slider_name: sliderName, question_id: sliderName, value, screen: trackScreen },
    });
  };

  // [V38] Per-selection tracking for the non-slider questions. Sliders and the
  // helpfulness rating already emit an event on each interaction; this does the
  // same for the timeline radio and the factor multi-select, so every question
  // type records its change history. `field` is "timeline" (carries `value`)
  // or "factors" (carries the full `factors` snapshot after the toggle).
  const trackAnswerChange = (
    field: "timeline" | "factors",
    extra: { value?: string; factors?: string[] },
    // Stable per-question id. Defaults to "{domain}_{field}" (today there is
    // one timeline + one factors question per domain). To place a second
    // question of the same type in a domain, pass a distinct id here and the
    // aggregator keeps the two apart.
    questionId?: string,
  ) => {
    if (!trackFile || !trackSpeaker || !trackDomain) return;
    trackFirst(trackFile, trackSpeaker, {
      event_type: "answer_changed",
      domain: trackDomain,
      metadata: {
        field,
        question_id: questionId ?? fieldQuestionId(trackDomain, field),
        screen: trackScreen,
        ...extra,
      },
    });
  };

  // [V37] Cancer Prognosis (Experimental arm) — three additional questions
  // are rendered directly below the AI Summary for this topic only. Other
  // topics ignore these state slots. Local state only; backend persistence
  // will be wired in a follow-up.
  // Default to 50 (slider midpoint) so an untouched slider submits the
  // value the patient actually saw — see Radix Slider's `value` prop on
  // line ~1275 which falls back to 50 visually. Initializing state to
  // null caused silent data loss (visible 50, persisted NULL) when the
  // patient submitted without dragging.
  const [cpRiskWithoutTreatment, setCpRiskWithoutTreatment] = React.useState<
    number | null
  >(50);
  const [cpRiskWithTreatment, setCpRiskWithTreatment] = React.useState<
    number | null
  >(50);
  const [cpTimePeriod, setCpTimePeriod] = React.useState<string | null>(null);

  // [V37] Life Expectancy (Experimental arm) — two questions placed
  // directly under the AI Summary for the Life Expectancy topic only.
  // q1 is single-select (one of 5 ranges); q2 is multi-select (any
  // subset of 5 factors). Local state only.
  const [leProjectedLE, setLeProjectedLE] = React.useState<string | null>(
    null,
  );
  const [leFactors, setLeFactors] = React.useState<string[]>([]);
  const toggleLeFactor = (factor: string) => {
    const next = leFactors.includes(factor)
      ? leFactors.filter((f) => f !== factor)
      : [...leFactors, factor];
    setLeFactors(next);
    trackAnswerChange("factors", { factors: next });
  };

  // [V37] Erectile Dysfunction (Experimental arm) — three questions:
  // (1) VAS 0-100 slider for likelihood of returning to baseline.
  // (2) Single-select radio across 5 time-period options.
  // (3) Multi-select factor checklist (any subset of 5 factors).
  const [edBaselineReturn, setEdBaselineReturn] = React.useState<
    number | null
  >(50);
  const [edTimePeriod, setEdTimePeriod] = React.useState<string | null>(null);
  const [edFactors, setEdFactors] = React.useState<string[]>([]);
  const toggleEdFactor = (factor: string) => {
    const next = edFactors.includes(factor)
      ? edFactors.filter((f) => f !== factor)
      : [...edFactors, factor];
    setEdFactors(next);
    trackAnswerChange("factors", { factors: next });
  };

  // [V37] Urinary Incontinence (Experimental arm) — three questions:
  // (1) VAS 0-100 slider for the patient's understanding of their risk.
  // (2) Single-select radio across 5 timeline options.
  // (3) Multi-select factor checklist (any subset of 5 factors).
  const [incRisk, setIncRisk] = React.useState<number | null>(50);
  const [incTimeline, setIncTimeline] = React.useState<string | null>(null);
  const [incFactors, setIncFactors] = React.useState<string[]>([]);
  const toggleIncFactor = (factor: string) => {
    const next = incFactors.includes(factor)
      ? incFactors.filter((f) => f !== factor)
      : [...incFactors, factor];
    setIncFactors(next);
    trackAnswerChange("factors", { factors: next });
  };

  // [V37] Irritative Urinary Symptoms (Experimental arm) — three Qs:
  // (1) VAS 0-100 slider for risk of irritative lower urinary tract sx.
  // (2) Single-select radio across 5 timeline options.
  // (3) Multi-select factor checklist (any subset of 5 factors).
  const [iusRisk, setIusRisk] = React.useState<number | null>(50);
  const [iusTimeline, setIusTimeline] = React.useState<string | null>(null);
  const [iusFactors, setIusFactors] = React.useState<string[]>([]);
  const toggleIusFactor = (factor: string) => {
    const next = iusFactors.includes(factor)
      ? iusFactors.filter((f) => f !== factor)
      : [...iusFactors, factor];
    setIusFactors(next);
    trackAnswerChange("factors", { factors: next });
  };

  // [V37] Per-domain Submit-time validation popup. VAS sliders default
  // to 50 so they are always considered answered; factors are optional
  // (zero is a valid response). Only the timeline radio is required.
  const [incompleteDialog, setIncompleteDialog] = React.useState<{
    open: boolean;
    missing: string[];
  }>({ open: false, missing: [] });

  // [V38] Hydrate the per-domain state slots from the server's persisted
  // answers exactly once — when prefill arrives non-null. prefill is keyed by
  // question_id; each helper pulls the value for one question with the right
  // type. Each domain only touches its own slots.
  const hasHydrated = React.useRef(false);
  React.useEffect(() => {
    if (hasHydrated.current || !prefill) return;
    hasHydrated.current = true;
    const numOf = (qid: string): number | null => {
      const v = prefill[qid]?.value;
      return typeof v === "number" ? v : null;
    };
    const strOf = (qid: string): string | null => {
      const v = prefill[qid]?.value;
      return typeof v === "string" ? v : null;
    };
    const arrOf = (qid: string): string[] | null => {
      const v = prefill[qid]?.value;
      return Array.isArray(v) ? (v as string[]) : null;
    };
    switch (trackDomain) {
      case "cp": {
        const a = numOf(QID.cp.riskWithoutTreatment); if (a != null) setCpRiskWithoutTreatment(a);
        const b = numOf(QID.cp.riskWithTreatment); if (b != null) setCpRiskWithTreatment(b);
        const t = strOf(QID.cp.timeline); if (t) setCpTimePeriod(t);
        break;
      }
      case "le": {
        const t = strOf(QID.le.timeline); if (t) setLeProjectedLE(t);
        const f = arrOf(QID.le.factors); if (f) setLeFactors(f);
        break;
      }
      case "ed": {
        const a = numOf(QID.ed.baselineReturn); if (a != null) setEdBaselineReturn(a);
        const t = strOf(QID.ed.timeline); if (t) setEdTimePeriod(t);
        const f = arrOf(QID.ed.factors); if (f) setEdFactors(f);
        break;
      }
      case "inc": {
        const a = numOf(QID.inc.risk); if (a != null) setIncRisk(a);
        const t = strOf(QID.inc.timeline); if (t) setIncTimeline(t);
        const f = arrOf(QID.inc.factors); if (f) setIncFactors(f);
        break;
      }
      case "ius": {
        const a = numOf(QID.ius.risk); if (a != null) setIusRisk(a);
        const t = strOf(QID.ius.timeline); if (t) setIusTimeline(t);
        const f = arrOf(QID.ius.factors); if (f) setIusFactors(f);
        break;
      }
    }
  }, [prefill, trackDomain]);

  // [V38] Build this domain's answers (one entry per question_id) for the PUT
  // body. Each question carries its question_id + field, so the backend stores
  // one row per question and re-Submits overwrite the matching rows. VAS values
  // are always included (default 50 is what the patient saw); timeline only
  // when set (required, validated before submit); factors always for domains
  // that have them, so clearing all selections persists as an empty list.
  const buildAnswers = (): AnswerItem[] => {
    const out: AnswerItem[] = [];
    const vas = (qid: string, v: number | null) => {
      if (v != null) out.push({ question_id: qid, field: "vas", value: v });
    };
    const timeline = (qid: string, v: string | null) => {
      if (v != null) out.push({ question_id: qid, field: "timeline", value: v });
    };
    const factors = (qid: string, v: string[]) => {
      out.push({ question_id: qid, field: "factors", value: v });
    };
    switch (trackDomain) {
      case "cp":
        vas(QID.cp.riskWithoutTreatment, cpRiskWithoutTreatment);
        vas(QID.cp.riskWithTreatment, cpRiskWithTreatment);
        timeline(QID.cp.timeline, cpTimePeriod);
        break;
      case "le":
        timeline(QID.le.timeline, leProjectedLE);
        factors(QID.le.factors, leFactors);
        break;
      case "ed":
        vas(QID.ed.baselineReturn, edBaselineReturn);
        timeline(QID.ed.timeline, edTimePeriod);
        factors(QID.ed.factors, edFactors);
        break;
      case "inc":
        vas(QID.inc.risk, incRisk);
        timeline(QID.inc.timeline, incTimeline);
        factors(QID.inc.factors, incFactors);
        break;
      case "ius":
        vas(QID.ius.risk, iusRisk);
        timeline(QID.ius.timeline, iusTimeline);
        factors(QID.ius.factors, iusFactors);
        break;
      default:
        return [];
    }
    return out;
  };

  // [V37] Per-domain required-field check. Returns the user-facing
  // labels of any unanswered required questions for the current domain.
  // Sliders default to 50 (always considered answered); factors are
  // optional (zero selections is a valid response). Only the timeline
  // radio is required across every domain.
  const getMissingRequired = (): string[] => {
    switch (trackDomain) {
      case "cp":
        return cpTimePeriod
          ? []
          : ["Time period when you would expect to see the cancer prognosis"];
      case "le":
        return leProjectedLE ? [] : ["Your projected life expectancy"];
      case "ed":
        return edTimePeriod
          ? []
          : ["Time period for return to baseline erectile function"];
      case "inc":
        return incTimeline
          ? []
          : ["Time period for urinary incontinence to develop"];
      case "ius":
        return iusTimeline
          ? []
          : ["Time period for irritative urinary symptoms to develop"];
      default:
        return [];
    }
  };

  // [V37] Submit click handler — validate first, then persist. On any
  // missing required field, open the incomplete-questions popup and
  // skip onSave entirely so nothing lands in the DB. If onSave is not
  // wired (test rigs / pages without backend access) fall back to the
  // legacy local-only behaviour.
  const handleSubmitClick = async () => {
    const missing = getMissingRequired();
    if (missing.length > 0) {
      setIncompleteDialog({ open: true, missing });
      return;
    }
    if (!onSave) {
      onSubmit();
      return;
    }
    const answers = buildAnswers();
    if (answers.length === 0) {
      onSubmit();
      return;
    }
    try {
      await onSave(answers);
      // [V38] Record one domain_submitted behavior event per successful
      // Submit, carrying the question_id-keyed answer snapshot persisted this
      // time. This makes each Submit — and each re-Submit after editing — show
      // up in the admin as its own row, alongside the final answers.
      if (trackFile && trackSpeaker && trackDomain) {
        trackFirst(trackFile, trackSpeaker, {
          event_type: "domain_submitted",
          domain: trackDomain,
          metadata: { answers, screen: trackScreen },
        });
      }
      onSubmit();
    } catch {
      // Hook surfaces the error; the card stays in its un-submitted
      // visual state so progress reflects only persisted Submits.
    }
  };

  return (
    <div
      data-track-proximity={`TopicCard_${topicId}`}
      className={cx(
        "rounded-2xl overflow-hidden transition-all duration-300 border",
        isDark
          ? "bg-slate-900/60 border-slate-700/50 hover:border-slate-600/70"
          : "bg-white border-gray-200/80 hover:border-gray-300 shadow-sm hover:shadow-md",
        isExpanded &&
          (isDark
            ? "ring-2 ring-indigo-500/30 border-indigo-500/30"
            : "ring-2 ring-indigo-300/50 border-indigo-300/50 shadow-lg"),
      )}
    >
      {/* Topic Header */}
      <button
        type="button"
        onClick={onToggleExpand}
        data-track-proximity={`TopicHeader_${topicId}`}
        className={cx(
          "w-full px-4 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5 flex items-center justify-between text-left transition-all duration-200",
          "bg-gradient-to-r",
          colors.gradient,
          !isExpanded && "hover:opacity-90",
        )}
      >
        <div className="flex items-center gap-4">
          <div
            className={cx(
              "flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 lg:w-11 lg:h-11 rounded-xl text-base font-bold text-white",
              "bg-gradient-to-br shadow-lg",
              colors.iconBg,
            )}
          >
            {topicIndex + 1}
          </div>
          <div>
            <h3
              className={cx(
                "text-base sm:text-lg font-semibold",
                isDark ? "text-white" : "text-gray-900",
              )}
            >
              {topicName}
            </h3>
            {/* Rating completion indicator */}
            {rating > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span
                  className={cx(
                    "text-xs font-medium",
                    isDark ? "text-slate-400" : "text-gray-500",
                  )}
                >
                  {HELPFULNESS_LABELS[rating]}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cx(
              "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300",
              isDark ? "bg-slate-800/80" : "bg-white/80 shadow-sm",
              isExpanded && "rotate-180",
            )}
          >
            <ChevronDown
              size={20}
              className={isDark ? "text-slate-400" : "text-gray-500"}
            />
          </div>
        </div>
      </button>

      {/* Topic Content (Collapsible)
          With the V37 Cancer Prognosis / LE / ED / Inc / IUS sub-question
          blocks added, each card's inner content can be 1200 px+ tall.
          `max-h-0 + overflow-hidden` clips the content visually but the
          children are still rendered at their natural geometry, which
          extends document.scrollHeight by the full sum of every collapsed
          card's children — that's where the "empty space below the footer" bug
          came from. Fix: only mount the children when expanded. The
          smooth slide-down animation is sacrificed; users still get the
          fade via opacity-0 on the wrapper for the brief unmount frame. */}
      <div
        className={cx(
          "transition-all duration-300 ease-in-out overflow-hidden",
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {isExpanded && (
        <div
          className={cx(
            "px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4 lg:px-6 lg:pb-6 lg:pt-5",
            isDark ? "bg-slate-900/40" : "bg-gray-50/50",
          )}
        >
          {/* [V38] AI-Generated Summary — collapsible to match the
              "View/Hide relevant sentences from your visit" toggle.
              Same button chrome (rounded-xl, neutral border/bg, icon
              + label + chevron) so the card now has a consistent
              pattern across both expandable sections. The expanded
              content keeps the V35 violet card so AI provenance is
              still visually distinct from consultation text. */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => onToggleAiSummary?.()}
              data-track-proximity={`AiSummaryToggle_${topicId}`}
              className={cx(
                "w-full flex items-center justify-between gap-2 px-3 py-3 sm:px-4 sm:py-3.5 lg:px-5 lg:py-4 rounded-xl text-sm font-semibold transition-all duration-200",
                isDark
                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                  : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm hover:shadow",
              )}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="opacity-70" />
                <span>
                  {showAiSummary ? "Hide" : "View"} AI-Generated Summary
                </span>
              </div>
              {showAiSummary ? (
                <ChevronUp size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>

            {showAiSummary && (
              <div
                className={cx(
                  "mt-4 p-3 sm:p-4 lg:p-5 rounded-2xl border-l-4",
                  isDark
                    ? "bg-violet-950/30 border-l-violet-500 border-y border-r border-violet-500/20"
                    : "bg-gradient-to-r from-violet-50 to-indigo-50 border-l-violet-500 border-y border-r border-violet-200/50 shadow-sm",
                )}
              >
                {/* [V39] Split the summary into one line per sentence
                    (= one per treatment for side-effect domains) so the
                    ablation / radiation / surgery statements are visually
                    separated instead of running together in one block.
                    Splits on existing newlines first, then on sentence
                    boundaries (". " before a capital letter or quote). */}
                <div
                  className={cx(
                    "text-base leading-relaxed space-y-2",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  {aiSummary
                    .split(/\n+/)
                    .flatMap((seg) => seg.split(/(?<=\.)\s+(?=["A-Z])/))
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0)
                    .map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* [V40] Sub-domain (treatment) sections — rendered only when the
              domain has >= 2 distinct treatments (e.g. ED = radiation +
              surgery). The domain-level AI-Generated Summary above stays
              shared; each treatment gets its own ai_score and its own
              "View relevant sentences" toggle. */}
          {hasSubDomains && (
            <div className="mb-6 space-y-4">
              {(aiSubDomains ?? []).map((sub, subIdx) => {
                // Real treatment -> show its name as a header. "<missing>" ->
                // the AI found a relevant sentence but could NOT tie it to a
                // specific treatment; show an explanatory note instead of a
                // misleading badge. (null treatments do not reach here, since a
                // multi-treatment domain has named treatments.)
                const treatmentLabel =
                  sub.treatment && sub.treatment !== "<missing>"
                    ? sub.treatment
                    : null;
                const isUnspecifiedTreatment = sub.treatment === "<missing>";
                const subShown = isSubEvidenceShown?.(sub.treatment) || false;
                // [V40 / feedback #1] ai_score === 0 means the doctor did not
                // discuss this treatment, so its supporting sentences are
                // unrelated to the topic and must NOT be shown. The toggle is
                // disabled and replaced with a "not discussed" note. null /
                // score > 0 behave normally.
                const subNotDiscussed = sub.aiScore === 0;
                return (
                  <div
                    key={subIdx}
                    className={cx(
                      "p-3 sm:p-4 rounded-xl border",
                      isDark
                        ? "bg-slate-800/40 border-slate-700"
                        : "bg-white border-gray-200 shadow-sm",
                    )}
                  >
                    {/* Sub-domain header: treatment name. The internal ai_score
                        is NOT shown to the patient; it only drives the score=0
                        "not discussed" disable below. */}
                    {treatmentLabel ? (
                      <p
                        className={cx(
                          "mb-3 text-xs font-bold uppercase tracking-wide",
                          isDark ? "text-violet-300" : "text-violet-700",
                        )}
                      >
                        {treatmentLabel}
                      </p>
                    ) : isUnspecifiedTreatment ? (
                      <p
                        className={cx(
                          "mb-3 text-xs italic",
                          isDark ? "text-slate-500" : "text-gray-400",
                        )}
                      >
                        No specific treatment identified
                      </p>
                    ) : null}

                    {/* Per-treatment "View relevant sentences" toggle.
                        Disabled (greyed, non-clickable) when ai_score === 0. */}
                    <button
                      type="button"
                      disabled={subNotDiscussed}
                      onClick={
                        subNotDiscussed
                          ? undefined
                          : () => onToggleSubEvidence?.(sub.treatment)
                      }
                      aria-disabled={subNotDiscussed}
                      data-track-proximity={`EvidenceToggle_${topicId}_${subIdx}`}
                      className={cx(
                        "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                        subNotDiscussed
                          ? isDark
                            ? "bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed"
                            : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                          : isDark
                            ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                            : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm hover:shadow",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquareText size={16} className="opacity-70" />
                        <span>
                          {subShown ? "Hide" : "View"} relevant sentences from
                          your visit
                        </span>
                      </div>
                      {subNotDiscussed ? null : subShown ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>

                    {subNotDiscussed ? (
                      <p
                        className={cx(
                          "mt-2 flex items-center gap-1.5 px-1 text-xs",
                          isDark ? "text-slate-500" : "text-gray-400",
                        )}
                      >
                        <Info size={13} className="shrink-0" />
                        This topic was not discussed in your visit.
                      </p>
                    ) : (
                      subShown && (
                        <div className="mt-3 space-y-3">
                          {sub.sources.length > 0 ? (
                            sub.sources.map((src, sidx) => (
                              <div
                                key={sidx}
                                className={cx(
                                  "p-4 rounded-xl border-l-4 transition-all duration-200",
                                  isDark
                                    ? "bg-indigo-900/20 border-l-violet-500 border-y border-r border-violet-700/30"
                                    : "bg-violet-50/50 border-l-violet-500 border-y border-r border-violet-200",
                                )}
                              >
                                <SourceQuote
                                  sentence={src.sentence}
                                  context={src.context}
                                  isDark={isDark ?? false}
                                />
                              </div>
                            ))
                          ) : (
                            <p
                              className={cx(
                                "text-sm italic px-1",
                                isDark ? "text-slate-500" : "text-gray-400",
                              )}
                            >
                              No relevant sentences were recorded for this
                              treatment.
                            </p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* [V38] Relevant sentences toggle — moved here (directly under
              the AI summary toggle) per the 2026-05-21 layout request, so
              both review panels sit together above the questions. Single-
              domain layout: cp/le and single-treatment side-effect domains. */}
          {!hasSubDomains && (
          <div className="mb-6">
            <button
              type="button"
              disabled={singleNotDiscussed}
              onClick={singleNotDiscussed ? undefined : onToggleEvidence}
              aria-disabled={singleNotDiscussed}
              data-track-proximity={`EvidenceToggle_${topicId}`}
              className={cx(
                "w-full flex items-center justify-between gap-2 px-3 py-3 sm:px-4 sm:py-3.5 lg:px-5 lg:py-4 rounded-xl text-sm font-semibold transition-all duration-200",
                singleNotDiscussed
                  ? isDark
                    ? "bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed"
                    : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                  : isDark
                    ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                    : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm hover:shadow",
              )}
            >
              <div className="flex items-center gap-2">
                <MessageSquareText size={16} className="opacity-70" />
                <span>
                  {showEvidence ? "Hide" : "View"} relevant sentences from
                  your visit
                </span>
              </div>
              {singleNotDiscussed ? null : showEvidence ? (
                <ChevronUp size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>

            {singleNotDiscussed ? (
              <p
                className={cx(
                  "mt-2 flex items-center gap-1.5 px-1 text-xs",
                  isDark ? "text-slate-500" : "text-gray-400",
                )}
              >
                <Info size={13} className="shrink-0" />
                This topic was not discussed in your visit.
              </p>
            ) : showEvidence ? (
              <div
                data-track-proximity={`EvidenceContent_${topicId}`}
                className="mt-4 space-y-3"
              >
                <h4
                  className={cx(
                    "text-xs font-bold uppercase tracking-wider px-1",
                    isDark ? "text-slate-500" : "text-gray-400",
                  )}
                >
                  From your consultation
                </h4>
                {aiSources && aiSources.length > 0 ? (
                  aiSources.map((src, sidx) => {
                    const ctx = src.context;
                    // [V39] Real treatment -> show its name as a badge.
                    // "<missing>" -> the AI found a relevant side-effect
                    // sentence but could NOT tie it to a specific treatment;
                    // show an explanatory note in the label spot (not a
                    // misleading treatment badge) so the absence is clear.
                    // treatment === null (cp/le, no treatment concept) stays
                    // unlabelled.
                    const treatmentLabel =
                      src.treatment && src.treatment !== "<missing>"
                        ? src.treatment
                        : null;
                    const isUnspecifiedTreatment =
                      src.treatment === "<missing>";
                    return (
                      <div
                        key={sidx}
                        className={cx(
                          "p-4 rounded-xl border-l-4 transition-all duration-200",
                          isDark
                            ? "bg-indigo-900/20 border-l-violet-500 border-y border-r border-violet-700/30"
                            : "bg-violet-50/50 border-l-violet-500 border-y border-r border-violet-200",
                        )}
                      >
                        {treatmentLabel ? (
                          <p
                            className={cx(
                              "text-xs font-bold uppercase tracking-wide mb-1.5",
                              isDark ? "text-violet-300" : "text-violet-700",
                            )}
                          >
                            {treatmentLabel}
                          </p>
                        ) : isUnspecifiedTreatment ? (
                          <p
                            className={cx(
                              "text-xs italic mb-1.5",
                              isDark ? "text-slate-500" : "text-gray-400",
                            )}
                          >
                            No specific treatment was identified for this
                            sentence, so it is not labelled by treatment.
                          </p>
                        ) : null}
                        <p
                          className={cx(
                            "text-sm leading-relaxed italic",
                            isDark ? "text-slate-300" : "text-gray-600",
                          )}
                        >
                          &ldquo;
                          {ctx && ctx.includes("<main>") ? (
                            <>
                              {ctx.split("<main>").map((part, pidx) => {
                                if (pidx === 0)
                                  return <span key={pidx}>{part}</span>;
                                const [highlighted, rest] =
                                  part.split("</main>");
                                return (
                                  <span key={pidx}>
                                    <span
                                      className={cx(
                                        "font-bold underline",
                                        isDark
                                          ? "text-cyan-300"
                                          : "text-cyan-700",
                                      )}
                                    >
                                      {highlighted}
                                    </span>
                                    {rest}
                                  </span>
                                );
                              })}
                            </>
                          ) : (
                            src.sentence
                          )}
                          &rdquo;
                        </p>
                      </div>
                    );
                  })
                ) : aiSourceSentence ? (
                  <div
                    className={cx(
                      "p-4 rounded-xl border-l-4 transition-all duration-200",
                      isDark
                        ? "bg-indigo-900/20 border-l-violet-500 border-y border-r border-violet-700/30"
                        : "bg-violet-50/50 border-l-violet-500 border-y border-r border-violet-200",
                    )}
                  >
                    <p
                      className={cx(
                        "text-sm leading-relaxed italic",
                        isDark ? "text-slate-300" : "text-gray-600",
                      )}
                    >
                      &ldquo;
                      {aiSourceContext && aiSourceContext.includes("<main>") ? (
                        <>
                          {aiSourceContext.split("<main>").map((part, pidx) => {
                            if (pidx === 0) return <span key={pidx}>{part}</span>;
                            const [highlighted, rest] = part.split("</main>");
                            return (
                              <span key={pidx}>
                                <span
                                  className={cx(
                                    "font-bold underline",
                                    isDark ? "text-cyan-300" : "text-cyan-700",
                                  )}
                                >
                                  {highlighted}
                                </span>
                                {rest}
                              </span>
                            );
                          })}
                        </>
                      ) : (
                        aiSourceSentence
                      )}
                      &rdquo;
                    </p>
                  </div>
                ) : (
                  <div
                    className={cx(
                      "p-4 rounded-xl text-sm text-center",
                      isDark
                        ? "bg-slate-800/50 text-slate-500 border border-slate-700/50"
                        : "bg-gray-50 text-gray-400 border border-gray-200/50",
                    )}
                  >
                    Relevant sentences will appear here once connected to the analysis pipeline.
                  </div>
                )}
              </div>
            ) : null}
          </div>
          )}

          {/* [V37] Cancer Prognosis — Experimental arm sub-questions
              Sits directly under the AI Summary so the wording
              ("the AI summary from your consultation is above") is
              true. Other topics skip this block entirely. */}
          {showQuestions && topicName === "Cancer Prognosis" && (
            <div
              className={cx(
                "p-4 sm:p-5 rounded-xl border mb-6 space-y-6",
                isDark
                  ? "bg-slate-800/30 border-slate-700/30"
                  : "bg-white border-gray-200",
              )}
            >
              {/* [V38] Shared preamble — shown once per domain instead of
                  repeated in every question (meeting item 6-4). */}
              <p
                className={cx(
                  "text-sm font-semibold",
                  isDark ? "text-slate-200" : "text-gray-800",
                )}
              >
                The AI summary from your consultation is above.
              </p>
              {/* (1) VAS — risk of dying WITHOUT treatment */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(1)</span> Based on the AI summary
                  and/or what you remember from your consultation, what is
                  your understanding of the risk of dying of cancer{" "}
                  <strong>without treatment</strong>?
                </p>
                {/* Native <input type="range"> renders a thumb whose center
                    moves between THUMB_R (=8px) and (track_width - THUMB_R).
                    To make the floating bubble + ticks + 0/50/100 anchor
                    labels line up with the thumb at every value, the inner
                    elements get `mx-2` (8px L/R) so they span the same
                    range as the thumb. The bubble's `left` is computed as
                    calc(8px + (100% - 16px) * value/100). */}
                <div>
                  {/* Top anchor labels: 0 / 50 / 100. Absolute-positioned
                      with -translate-x-1/2 so each label's CENTRE sits at
                      its target percent, matching the thumb centre. The
                      `mx-2` defines the inner range (8px → W-8px) where
                      0% maps to thumb-at-0 and 100% to thumb-at-100. */}
                  <div className="relative h-4 mb-1.5 mx-2">
                    {[
                      { v: 0, label: "0" },
                      { v: 50, label: "50" },
                      { v: 100, label: "100" },
                    ].map((t) => (
                      <span
                        key={t.v}
                        className={cx(
                          "absolute top-0 -translate-x-1/2 text-[11px] font-medium tabular-nums",
                          isDark ? "text-slate-400" : "text-gray-500",
                        )}
                        style={{ left: `${t.v}%` }}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                  {/* shadcn Slider — thumb fixed at 16px (h-4 w-4),
                      so the floating bubble's calc(8px + (100% - 16px) *
                      v/100) and the mx-2 ticks line up exactly. */}
                  <div className="relative pt-6">
                    {cpRiskWithoutTreatment !== null && (
                      <span
                        className="absolute top-0 -translate-x-1/2 px-1.5 py-0.5 rounded text-xs font-bold tabular-nums bg-sky-500 text-white shadow-sm"
                        style={{
                          left: `calc(8px + (100% - 16px) * ${cpRiskWithoutTreatment} / 100)`,
                        }}
                      >
                        {cpRiskWithoutTreatment}
                      </span>
                    )}
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[cpRiskWithoutTreatment ?? 50]}
                      onValueChange={(v) => setCpRiskWithoutTreatment(v[0] ?? 0)}
                      onValueCommit={(v) =>
                        trackSliderCommit(QID.cp.riskWithoutTreatment, v[0] ?? 0)
                      }
                      aria-label="Risk of dying of cancer without treatment, 0 to 100"
                    />
                  </div>
                  {/* 10-unit ticks + numbers — absolute positioning so
                      each tick's CENTRE (line + number) sits exactly on
                      the thumb's centre at the matching value. h-6 holds
                      the 8px tick line + a small gap + the 10px number. */}
                  <div className="relative h-6 mt-1.5 mx-2">
                    {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
                      <div
                        key={n}
                        className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                        style={{ left: `${n}%` }}
                      >
                        <span
                          className={cx(
                            "w-px h-2",
                            isDark ? "bg-slate-500" : "bg-gray-400",
                          )}
                        />
                        <span
                          className={cx(
                            "text-[10px] leading-none mt-0.5 tabular-nums",
                            isDark ? "text-slate-400" : "text-gray-500",
                          )}
                        >
                          {n}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* (2) VAS — risk of dying WITH treatment */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(2)</span> Based on the AI summary
                  and/or what you remember from your consultation, what is
                  your understanding of the risk of dying of cancer{" "}
                  <strong>with treatment</strong>?
                </p>
                <div>
                  <div className="relative h-4 mb-1.5 mx-2">
                    {[
                      { v: 0, label: "0" },
                      { v: 50, label: "50" },
                      { v: 100, label: "100" },
                    ].map((t) => (
                      <span
                        key={t.v}
                        className={cx(
                          "absolute top-0 -translate-x-1/2 text-[11px] font-medium tabular-nums",
                          isDark ? "text-slate-400" : "text-gray-500",
                        )}
                        style={{ left: `${t.v}%` }}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                  <div className="relative pt-6">
                    {cpRiskWithTreatment !== null && (
                      <span
                        className="absolute top-0 -translate-x-1/2 px-1.5 py-0.5 rounded text-xs font-bold tabular-nums bg-sky-500 text-white shadow-sm"
                        style={{
                          left: `calc(8px + (100% - 16px) * ${cpRiskWithTreatment} / 100)`,
                        }}
                      >
                        {cpRiskWithTreatment}
                      </span>
                    )}
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[cpRiskWithTreatment ?? 50]}
                      onValueChange={(v) => setCpRiskWithTreatment(v[0] ?? 0)}
                      onValueCommit={(v) =>
                        trackSliderCommit(QID.cp.riskWithTreatment, v[0] ?? 0)
                      }
                      aria-label="Risk of dying of cancer with treatment, 0 to 100"
                    />
                  </div>
                  <div className="relative h-6 mt-1.5 mx-2">
                    {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
                      <div
                        key={n}
                        className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                        style={{ left: `${n}%` }}
                      >
                        <span
                          className={cx(
                            "w-px h-2",
                            isDark ? "bg-slate-500" : "bg-gray-400",
                          )}
                        />
                        <span
                          className={cx(
                            "text-[10px] leading-none mt-0.5 tabular-nums",
                            isDark ? "text-slate-400" : "text-gray-500",
                          )}
                        >
                          {n}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* (3) Radio — time period */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(3)</span> Based on the AI summary
                  and/or what you remember from your consultation, over
                  what time period was the risk of cancer death quoted
                  (choose one)?
                </p>
                <div className="space-y-2">
                  {[
                    // Use the human-readable label as the persisted
                    // value so cp matches every other domain's
                    // timeline column in the DB. Without this cp
                    // would store opaque codes like "A", "B" while
                    // le/ed/inc/ius store "Less than 5 years",
                    // "3 months after treatment", etc.
                    { value: "Over my lifetime", label: "Over my lifetime" },
                    { value: "Over next 5 years", label: "Over next 5 years" },
                    { value: "Over next 5-10 years", label: "Over next 5-10 years" },
                    { value: "Over next 11-15 years", label: "Over next 11-15 years" },
                    { value: "Over next 16-20 years", label: "Over next 16-20 years" },
                    { value: "Over next 20-30 years", label: "Over next 20-30 years" },
                  ].map((opt, idx) => (
                    <label
                      key={opt.value}
                      className={cx(
                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border-2",
                        cpTimePeriod === opt.value
                          ? isDark
                            ? "bg-sky-900/30 border-sky-500"
                            : "bg-sky-50 border-sky-400"
                          : isDark
                            ? "border-slate-700 hover:bg-slate-700/30"
                            : "border-gray-200 hover:bg-gray-50",
                      )}
                    >
                      <input
                        type="radio"
                        name={`cpTimePeriod_${topicId}`}
                        value={opt.value}
                        checked={cpTimePeriod === opt.value}
                        onChange={() => {
                          setCpTimePeriod(opt.value);
                          trackAnswerChange("timeline", { value: opt.value });
                        }}
                        className="sr-only"
                      />
                      <span
                        className={cx(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                          cpTimePeriod === opt.value
                            ? "border-sky-500 bg-sky-500"
                            : isDark
                              ? "border-slate-500"
                              : "border-gray-300",
                        )}
                      >
                        {cpTimePeriod === opt.value && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      <span
                        className={cx(
                          "text-sm font-medium",
                          isDark ? "text-slate-200" : "text-gray-700",
                        )}
                      >
                        <span className="font-semibold mr-2">
                          ({opt.value})
                        </span>
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* [V37] Life Expectancy — Experimental arm sub-questions
              Same placement rule as Cancer Prognosis: directly under
              the AI Summary, only on the Life Expectancy card.
              (1) Single-select radio across 5 lifetime ranges.
              (2) Multi-select factor checklist — patients can mark any
              combination of items. */}
          {showQuestions && topicName === "Life Expectancy" && (
            <div
              className={cx(
                "p-4 sm:p-5 rounded-xl border mb-6 space-y-6",
                isDark
                  ? "bg-slate-800/30 border-slate-700/30"
                  : "bg-white border-gray-200",
              )}
            >
              {/* [V38] Shared preamble — shown once per domain instead of
                  repeated in every question (meeting item 6-4). */}
              <p
                className={cx(
                  "text-sm font-semibold",
                  isDark ? "text-slate-200" : "text-gray-800",
                )}
              >
                The AI summary from your consultation is above.
              </p>
              {/* (1) Radio — projected life expectancy */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(1)</span> Based on the AI summary
                  and/or what you remember from your consultation, what is
                  your understanding of your projected life expectancy?
                </p>
                <div className="space-y-2">
                  {[
                    "Less than 5 years",
                    "5-10 years",
                    "11-15 years",
                    "16-20 years",
                    "More than 20 years",
                  ].map((opt, idx) => (
                    <label
                      key={opt}
                      className={cx(
                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border-2",
                        leProjectedLE === opt
                          ? isDark
                            ? "bg-sky-900/30 border-sky-500"
                            : "bg-sky-50 border-sky-400"
                          : isDark
                            ? "border-slate-700 hover:bg-slate-700/30"
                            : "border-gray-200 hover:bg-gray-50",
                      )}
                    >
                      <input
                        type="radio"
                        name={`leProjectedLE_${topicId}`}
                        value={opt}
                        checked={leProjectedLE === opt}
                        onChange={() => {
                          setLeProjectedLE(opt);
                          trackAnswerChange("timeline", { value: opt });
                        }}
                        className="sr-only"
                      />
                      <span
                        className={cx(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                          leProjectedLE === opt
                            ? "border-sky-500 bg-sky-500"
                            : isDark
                              ? "border-slate-500"
                              : "border-gray-300",
                        )}
                      >
                        {leProjectedLE === opt && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      <span
                        className={cx(
                          "text-sm font-medium",
                          isDark ? "text-slate-200" : "text-gray-700",
                        )}
                      >
                        <span className="font-semibold mr-2">
                          ({String.fromCharCode(65 + idx)})
                        </span>
                        {opt}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* (2) Multi-select — factors considered */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(2)</span> Based on the AI summary
                  and/or what you remember from your consultation, what
                  factors were considered by your doctor in making this
                  estimate?{" "}
                  <span
                    className={cx(
                      "italic font-normal",
                      isDark ? "text-slate-500" : "text-gray-500",
                    )}
                  >
                    (select all that apply)
                  </span>
                </p>
                <div className="space-y-2">
                  {[
                    "Tumor grade",
                    "Age",
                    "Marital status",
                    "Health conditions or comorbidities",
                    "Tumor stage",
                  ].map((factor, idx) => {
                    const checked = leFactors.includes(factor);
                    return (
                      <label
                        key={factor}
                        className={cx(
                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border-2",
                          checked
                            ? isDark
                              ? "bg-sky-900/30 border-sky-500"
                              : "bg-sky-50 border-sky-400"
                            : isDark
                              ? "border-slate-700 hover:bg-slate-700/30"
                              : "border-gray-200 hover:bg-gray-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLeFactor(factor)}
                          className="sr-only"
                        />
                        <span
                          className={cx(
                            "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                            checked
                              ? "border-sky-500 bg-sky-500"
                              : isDark
                                ? "border-slate-500"
                                : "border-gray-300",
                          )}
                        >
                          {checked && (
                            <svg
                              viewBox="0 0 16 16"
                              className="w-3 h-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={3}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 8 7 12 13 4" />
                            </svg>
                          )}
                        </span>
                        <span
                          className={cx(
                            "text-sm font-medium",
                            isDark ? "text-slate-200" : "text-gray-700",
                          )}
                        >
                          <span className="font-semibold mr-2">
                            ({String.fromCharCode(65 + idx)})
                          </span>
                          {factor}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* [V37] Erectile Dysfunction — Experimental arm sub-questions
              (1) VAS slider — likelihood of returning to baseline ED.
              (2) Single-select radio — 5 time-period options.
              (3) Multi-select factor checklist (any subset of 5). */}
          {showQuestions && topicName === "Erectile Dysfunction" && (
            <div
              className={cx(
                "p-4 sm:p-5 rounded-xl border mb-6 space-y-6",
                isDark
                  ? "bg-slate-800/30 border-slate-700/30"
                  : "bg-white border-gray-200",
              )}
            >
              {/* [V38] Shared preamble — shown once per domain instead of
                  repeated in every question (meeting item 6-4). */}
              <p
                className={cx(
                  "text-sm font-semibold",
                  isDark ? "text-slate-200" : "text-gray-800",
                )}
              >
                The AI summary from your consultation is above.
              </p>
              {/* (1) VAS — likelihood of returning to baseline */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(1)</span> Based on the AI summary
                  and/or what you remember from your consultation, how
                  likely is it that you will return to your{" "}
                  <strong>
                    baseline erectile function (firmness of penis for sex)
                  </strong>{" "}
                  after radical prostatectomy?
                </p>
                <div>
                  {/* Top anchor labels */}
                  <div className="relative h-4 mb-1.5 mx-2">
                    {[
                      { v: 0, label: "0" },
                      { v: 50, label: "50" },
                      { v: 100, label: "100" },
                    ].map((t) => (
                      <span
                        key={t.v}
                        className={cx(
                          "absolute top-0 -translate-x-1/2 text-[11px] font-medium tabular-nums",
                          isDark ? "text-slate-400" : "text-gray-500",
                        )}
                        style={{ left: `${t.v}%` }}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                  {/* shadcn Slider with floating value bubble */}
                  <div className="relative pt-6">
                    {edBaselineReturn !== null && (
                      <span
                        className="absolute top-0 -translate-x-1/2 px-1.5 py-0.5 rounded text-xs font-bold tabular-nums bg-sky-500 text-white shadow-sm"
                        style={{
                          left: `calc(8px + (100% - 16px) * ${edBaselineReturn} / 100)`,
                        }}
                      >
                        {edBaselineReturn}
                      </span>
                    )}
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[edBaselineReturn ?? 50]}
                      onValueChange={(v) => setEdBaselineReturn(v[0] ?? 0)}
                      onValueCommit={(v) =>
                        trackSliderCommit(QID.ed.baselineReturn, v[0] ?? 0)
                      }
                      aria-label="Likelihood of returning to baseline erectile function, 0 to 100"
                    />
                  </div>
                  {/* 10-unit ticks + numbers */}
                  <div className="relative h-6 mt-1.5 mx-2">
                    {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
                      <div
                        key={n}
                        className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                        style={{ left: `${n}%` }}
                      >
                        <span
                          className={cx(
                            "w-px h-2",
                            isDark ? "bg-slate-500" : "bg-gray-400",
                          )}
                        />
                        <span
                          className={cx(
                            "text-[10px] leading-none mt-0.5 tabular-nums",
                            isDark ? "text-slate-400" : "text-gray-500",
                          )}
                        >
                          {n}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* (2) Radio — time period quoted */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(2)</span> Based on the AI summary
                  and/or what you remember from your consultation, over
                  what time period was this risk quoted?
                </p>
                <div className="space-y-2">
                  {[
                    "3 months after treatment",
                    "6 months after treatment",
                    "12 months after treatment",
                    "24 months after treatment",
                    "Lifetime",
                  ].map((opt, idx) => (
                    <label
                      key={opt}
                      className={cx(
                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border-2",
                        edTimePeriod === opt
                          ? isDark
                            ? "bg-sky-900/30 border-sky-500"
                            : "bg-sky-50 border-sky-400"
                          : isDark
                            ? "border-slate-700 hover:bg-slate-700/30"
                            : "border-gray-200 hover:bg-gray-50",
                      )}
                    >
                      <input
                        type="radio"
                        name={`edTimePeriod_${topicId}`}
                        value={opt}
                        checked={edTimePeriod === opt}
                        onChange={() => {
                          setEdTimePeriod(opt);
                          trackAnswerChange("timeline", { value: opt });
                        }}
                        className="sr-only"
                      />
                      <span
                        className={cx(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                          edTimePeriod === opt
                            ? "border-sky-500 bg-sky-500"
                            : isDark
                              ? "border-slate-500"
                              : "border-gray-300",
                        )}
                      >
                        {edTimePeriod === opt && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      <span
                        className={cx(
                          "text-sm font-medium",
                          isDark ? "text-slate-200" : "text-gray-700",
                        )}
                      >
                        <span className="font-semibold mr-2">
                          ({String.fromCharCode(65 + idx)})
                        </span>
                        {opt}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* (3) Multi-select — factors considered */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(3)</span> Based on the AI summary
                  and/or what you remember from your consultation, what
                  factors were considered by your doctor in making this
                  estimate?{" "}
                  <span
                    className={cx(
                      "italic font-normal",
                      isDark ? "text-slate-500" : "text-gray-500",
                    )}
                  >
                    (select all that apply)
                  </span>
                </p>
                <div className="space-y-2">
                  {[
                    "Tumor grade",
                    "Age",
                    "Tumor stage",
                    "Health conditions or comorbidities",
                    "Baseline function",
                  ].map((factor, idx) => {
                    const checked = edFactors.includes(factor);
                    return (
                      <label
                        key={factor}
                        className={cx(
                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border-2",
                          checked
                            ? isDark
                              ? "bg-sky-900/30 border-sky-500"
                              : "bg-sky-50 border-sky-400"
                            : isDark
                              ? "border-slate-700 hover:bg-slate-700/30"
                              : "border-gray-200 hover:bg-gray-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEdFactor(factor)}
                          className="sr-only"
                        />
                        <span
                          className={cx(
                            "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                            checked
                              ? "border-sky-500 bg-sky-500"
                              : isDark
                                ? "border-slate-500"
                                : "border-gray-300",
                          )}
                        >
                          {checked && (
                            <svg
                              viewBox="0 0 16 16"
                              className="w-3 h-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={3}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 8 7 12 13 4" />
                            </svg>
                          )}
                        </span>
                        <span
                          className={cx(
                            "text-sm font-medium",
                            isDark ? "text-slate-200" : "text-gray-700",
                          )}
                        >
                          <span className="font-semibold mr-2">
                            ({String.fromCharCode(65 + idx)})
                          </span>
                          {factor}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* [V37] Urinary Incontinence — Experimental arm sub-questions
              (1) VAS slider — risk of urinary incontinence.
              (2) Single-select radio — 5 timeline options.
              (3) Multi-select factor checklist (any subset of 5). */}
          {showQuestions && topicName === "Urinary Incontinence" && (
            <div
              className={cx(
                "p-4 sm:p-5 rounded-xl border mb-6 space-y-6",
                isDark
                  ? "bg-slate-800/30 border-slate-700/30"
                  : "bg-white border-gray-200",
              )}
            >
              {/* [V38] Shared preamble — shown once per domain instead of
                  repeated in every question (meeting item 6-4). */}
              <p
                className={cx(
                  "text-sm font-semibold",
                  isDark ? "text-slate-200" : "text-gray-800",
                )}
              >
                The AI summary from your consultation is above.
              </p>
              {/* (1) VAS — risk of urinary incontinence */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(1)</span> Based on the AI summary
                  and/or what you remember from your consultation, what is
                  your understanding of your{" "}
                  <strong>risk of urinary incontinence</strong>?
                </p>
                <div>
                  {/* Top anchor labels */}
                  <div className="relative h-4 mb-1.5 mx-2">
                    {[
                      { v: 0, label: "0" },
                      { v: 50, label: "50" },
                      { v: 100, label: "100" },
                    ].map((t) => (
                      <span
                        key={t.v}
                        className={cx(
                          "absolute top-0 -translate-x-1/2 text-[11px] font-medium tabular-nums",
                          isDark ? "text-slate-400" : "text-gray-500",
                        )}
                        style={{ left: `${t.v}%` }}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                  {/* shadcn Slider with floating value bubble */}
                  <div className="relative pt-6">
                    {incRisk !== null && (
                      <span
                        className="absolute top-0 -translate-x-1/2 px-1.5 py-0.5 rounded text-xs font-bold tabular-nums bg-sky-500 text-white shadow-sm"
                        style={{
                          left: `calc(8px + (100% - 16px) * ${incRisk} / 100)`,
                        }}
                      >
                        {incRisk}
                      </span>
                    )}
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[incRisk ?? 50]}
                      onValueChange={(v) => setIncRisk(v[0] ?? 0)}
                      onValueCommit={(v) => trackSliderCommit(QID.inc.risk, v[0] ?? 0)}
                      aria-label="Risk of urinary incontinence, 0 to 100"
                    />
                  </div>
                  {/* 10-unit ticks + numbers */}
                  <div className="relative h-6 mt-1.5 mx-2">
                    {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
                      <div
                        key={n}
                        className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                        style={{ left: `${n}%` }}
                      >
                        <span
                          className={cx(
                            "w-px h-2",
                            isDark ? "bg-slate-500" : "bg-gray-400",
                          )}
                        />
                        <span
                          className={cx(
                            "text-[10px] leading-none mt-0.5 tabular-nums",
                            isDark ? "text-slate-400" : "text-gray-500",
                          )}
                        >
                          {n}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* (2) Radio — timeline quoted */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(2)</span> Based on the AI summary
                  and/or what you remember from your consultation, over
                  what timeline was this risk quoted?
                </p>
                <div className="space-y-2">
                  {[
                    "3 months",
                    "6 months",
                    "9 months",
                    "1 year",
                    "2 years",
                  ].map((opt, idx) => (
                    <label
                      key={opt}
                      className={cx(
                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border-2",
                        incTimeline === opt
                          ? isDark
                            ? "bg-sky-900/30 border-sky-500"
                            : "bg-sky-50 border-sky-400"
                          : isDark
                            ? "border-slate-700 hover:bg-slate-700/30"
                            : "border-gray-200 hover:bg-gray-50",
                      )}
                    >
                      <input
                        type="radio"
                        name={`incTimeline_${topicId}`}
                        value={opt}
                        checked={incTimeline === opt}
                        onChange={() => {
                          setIncTimeline(opt);
                          trackAnswerChange("timeline", { value: opt });
                        }}
                        className="sr-only"
                      />
                      <span
                        className={cx(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                          incTimeline === opt
                            ? "border-sky-500 bg-sky-500"
                            : isDark
                              ? "border-slate-500"
                              : "border-gray-300",
                        )}
                      >
                        {incTimeline === opt && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      <span
                        className={cx(
                          "text-sm font-medium",
                          isDark ? "text-slate-200" : "text-gray-700",
                        )}
                      >
                        <span className="font-semibold mr-2">
                          ({String.fromCharCode(65 + idx)})
                        </span>
                        {opt}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* (3) Multi-select — factors considered */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(3)</span> Based on the AI summary
                  and/or what you remember from your consultation, what
                  factors were considered by your doctor in making this
                  estimate?{" "}
                  <span
                    className={cx(
                      "italic font-normal",
                      isDark ? "text-slate-500" : "text-gray-500",
                    )}
                  >
                    (select all that apply)
                  </span>
                </p>
                <div className="space-y-2">
                  {[
                    "Tumor grade",
                    "Age",
                    "Tumor stage",
                    "Health conditions or comorbidities",
                    "Baseline function",
                  ].map((factor, idx) => {
                    const checked = incFactors.includes(factor);
                    return (
                      <label
                        key={factor}
                        className={cx(
                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border-2",
                          checked
                            ? isDark
                              ? "bg-sky-900/30 border-sky-500"
                              : "bg-sky-50 border-sky-400"
                            : isDark
                              ? "border-slate-700 hover:bg-slate-700/30"
                              : "border-gray-200 hover:bg-gray-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleIncFactor(factor)}
                          className="sr-only"
                        />
                        <span
                          className={cx(
                            "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                            checked
                              ? "border-sky-500 bg-sky-500"
                              : isDark
                                ? "border-slate-500"
                                : "border-gray-300",
                          )}
                        >
                          {checked && (
                            <svg
                              viewBox="0 0 16 16"
                              className="w-3 h-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={3}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 8 7 12 13 4" />
                            </svg>
                          )}
                        </span>
                        <span
                          className={cx(
                            "text-sm font-medium",
                            isDark ? "text-slate-200" : "text-gray-700",
                          )}
                        >
                          <span className="font-semibold mr-2">
                            ({String.fromCharCode(65 + idx)})
                          </span>
                          {factor}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* [V37] Irritative Urinary Symptoms — Experimental arm
              sub-questions
              (1) VAS slider — risk of irritative lower urinary tract sx.
              (2) Single-select radio — 5 timeline options.
              (3) Multi-select factor checklist (any subset of 5). */}
          {showQuestions && topicName === "Irritative Urinary Symptoms" && (
            <div
              className={cx(
                "p-4 sm:p-5 rounded-xl border mb-6 space-y-6",
                isDark
                  ? "bg-slate-800/30 border-slate-700/30"
                  : "bg-white border-gray-200",
              )}
            >
              {/* [V38] Shared preamble — shown once per domain instead of
                  repeated in every question (meeting item 6-4). */}
              <p
                className={cx(
                  "text-sm font-semibold",
                  isDark ? "text-slate-200" : "text-gray-800",
                )}
              >
                The AI summary from your consultation is above.
              </p>
              {/* (1) VAS — risk of irritative lower urinary tract sx */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(1)</span> Based on the AI summary
                  and/or what you remember from your consultation, what is
                  your understanding of your{" "}
                  <strong>
                    risk of irritative lower urinary tract symptoms
                  </strong>
                  ?
                </p>
                <div>
                  {/* Top anchor labels */}
                  <div className="relative h-4 mb-1.5 mx-2">
                    {[
                      { v: 0, label: "0" },
                      { v: 50, label: "50" },
                      { v: 100, label: "100" },
                    ].map((t) => (
                      <span
                        key={t.v}
                        className={cx(
                          "absolute top-0 -translate-x-1/2 text-[11px] font-medium tabular-nums",
                          isDark ? "text-slate-400" : "text-gray-500",
                        )}
                        style={{ left: `${t.v}%` }}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                  {/* shadcn Slider with floating value bubble */}
                  <div className="relative pt-6">
                    {iusRisk !== null && (
                      <span
                        className="absolute top-0 -translate-x-1/2 px-1.5 py-0.5 rounded text-xs font-bold tabular-nums bg-sky-500 text-white shadow-sm"
                        style={{
                          left: `calc(8px + (100% - 16px) * ${iusRisk} / 100)`,
                        }}
                      >
                        {iusRisk}
                      </span>
                    )}
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[iusRisk ?? 50]}
                      onValueChange={(v) => setIusRisk(v[0] ?? 0)}
                      onValueCommit={(v) => trackSliderCommit(QID.ius.risk, v[0] ?? 0)}
                      aria-label="Risk of irritative lower urinary tract symptoms, 0 to 100"
                    />
                  </div>
                  {/* 10-unit ticks + numbers */}
                  <div className="relative h-6 mt-1.5 mx-2">
                    {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
                      <div
                        key={n}
                        className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                        style={{ left: `${n}%` }}
                      >
                        <span
                          className={cx(
                            "w-px h-2",
                            isDark ? "bg-slate-500" : "bg-gray-400",
                          )}
                        />
                        <span
                          className={cx(
                            "text-[10px] leading-none mt-0.5 tabular-nums",
                            isDark ? "text-slate-400" : "text-gray-500",
                          )}
                        >
                          {n}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* (2) Radio — timeline quoted */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(2)</span> Based on the
                  AI summary above and/or what you remember from your
                  consultation, over what timeline was this risk quoted?
                </p>
                <div className="space-y-2">
                  {[
                    "1 month",
                    "3-6 months",
                    "1 year",
                    "2 years",
                    "Lifetime",
                  ].map((opt, idx) => (
                    <label
                      key={opt}
                      className={cx(
                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border-2",
                        iusTimeline === opt
                          ? isDark
                            ? "bg-sky-900/30 border-sky-500"
                            : "bg-sky-50 border-sky-400"
                          : isDark
                            ? "border-slate-700 hover:bg-slate-700/30"
                            : "border-gray-200 hover:bg-gray-50",
                      )}
                    >
                      <input
                        type="radio"
                        name={`iusTimeline_${topicId}`}
                        value={opt}
                        checked={iusTimeline === opt}
                        onChange={() => {
                          setIusTimeline(opt);
                          trackAnswerChange("timeline", { value: opt });
                        }}
                        className="sr-only"
                      />
                      <span
                        className={cx(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                          iusTimeline === opt
                            ? "border-sky-500 bg-sky-500"
                            : isDark
                              ? "border-slate-500"
                              : "border-gray-300",
                        )}
                      >
                        {iusTimeline === opt && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      <span
                        className={cx(
                          "text-sm font-medium",
                          isDark ? "text-slate-200" : "text-gray-700",
                        )}
                      >
                        <span className="font-semibold mr-2">
                          ({String.fromCharCode(65 + idx)})
                        </span>
                        {opt}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* (3) Multi-select — factors considered */}
              <div>
                <p
                  className={cx(
                    "text-sm leading-relaxed mb-3",
                    isDark ? "text-slate-300" : "text-gray-700",
                  )}
                >
                  <span className="font-semibold">(3)</span> Based on the AI summary
                  and/or what you remember from your consultation, what
                  factors were considered by your doctor in making this
                  estimate?{" "}
                  <span
                    className={cx(
                      "italic font-normal",
                      isDark ? "text-slate-500" : "text-gray-500",
                    )}
                  >
                    (select all that apply)
                  </span>
                </p>
                <div className="space-y-2">
                  {[
                    "Tumor grade",
                    "Age",
                    "Tumor stage",
                    "Health conditions or comorbidities",
                    "Baseline function",
                  ].map((factor, idx) => {
                    const checked = iusFactors.includes(factor);
                    return (
                      <label
                        key={factor}
                        className={cx(
                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border-2",
                          checked
                            ? isDark
                              ? "bg-sky-900/30 border-sky-500"
                              : "bg-sky-50 border-sky-400"
                            : isDark
                              ? "border-slate-700 hover:bg-slate-700/30"
                              : "border-gray-200 hover:bg-gray-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleIusFactor(factor)}
                          className="sr-only"
                        />
                        <span
                          className={cx(
                            "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                            checked
                              ? "border-sky-500 bg-sky-500"
                              : isDark
                                ? "border-slate-500"
                                : "border-gray-300",
                          )}
                        >
                          {checked && (
                            <svg
                              viewBox="0 0 16 16"
                              className="w-3 h-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={3}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 8 7 12 13 4" />
                            </svg>
                          )}
                        </span>
                        <span
                          className={cx(
                            "text-sm font-medium",
                            isDark ? "text-slate-200" : "text-gray-700",
                          )}
                        >
                          <span className="font-semibold mr-2">
                            ({String.fromCharCode(65 + idx)})
                          </span>
                          {factor}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* [V37] Helpfulness Rating block commented out per request —
              "How helpful was this information about ..." question and
              the rating selector are hidden for now. Restore by un-
              commenting the block below if/when the rating returns.

          <div
            className={cx(
              "py-4 px-4 rounded-xl border mb-6",
              isDark
                ? "bg-slate-800/30 border-slate-700/30"
                : "bg-gray-50/80 border-gray-200/30",
            )}
          >
            <span
              className={cx(
                "text-sm font-medium block mb-3",
                isDark ? "text-slate-400" : "text-gray-500",
              )}
            >
              {TOPIC_QUESTIONS[topicName] ||
                `How helpful was this information about ${topicName}?`}
            </span>
            <HelpfulnessRating
              value={rating}
              onChange={onRatingChange}
              isDark={isDark}
              trackingName={`TopicRating_${topicId}`}
              trackFile={trackFile}
              trackSpeaker={trackSpeaker}
              trackDomain={trackDomain}
              questionId={trackDomain ? QID[trackDomain].helpfulness : undefined}
              screen={trackScreen}
            />
            {rating === 0 && (
              <p
                className={cx(
                  "mt-2 text-xs italic",
                  isDark ? "text-slate-500" : "text-gray-400",
                )}
              >
                Please select one of the options above to rate this summary.
              </p>
            )}
          </div>

          */}

          {/* Helpfulness Rating — relocated above to sit right under AI Summary. */}

          {/* Per-domain Submit button. Marks this topic as completed in the
              parent's submittedDomains map so Submission Progress can advance.
              Re-clicking after submission is allowed: inputs stay editable
              and the button label switches to an "Update" affordance.
              [V38] Hidden when showQuestions=false (Overview screen). */}
          {showQuestions && (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleSubmitClick}
                data-track-proximity={`SubmitTopic_${topicId}`}
                className={cx(
                  "w-full px-6 py-3 rounded-xl text-sm font-bold transition-all duration-200 border-2",
                  isSubmitted
                    ? isDark
                      ? "bg-emerald-900/30 text-emerald-300 border-emerald-600 hover:bg-emerald-900/40"
                      : "bg-emerald-50 text-emerald-700 border-emerald-400 hover:bg-emerald-100"
                    : isDark
                      ? "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-500 shadow-lg shadow-indigo-500/30"
                      : "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30",
                )}
              >
                {isSubmitted ? "Submitted ✓ — Click to update" : "Submit"}
              </button>
            </div>
          )}
        </div>
        )}
      </div>

      {/* [V37] Incomplete-questions popup. Only renders when validation
          fails so it stays out of the layout flow otherwise. Plain
          Tailwind modal (no Radix) — single-purpose, low ceremony.
          Backdrop click and OK button both close the dialog; nothing
          is persisted to the backend. */}
      {incompleteDialog.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="v37-incomplete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setIncompleteDialog({ open: false, missing: [] })}
        >
          <div
            className={cx(
              "w-full max-w-md rounded-2xl shadow-2xl p-6",
              isDark
                ? "bg-slate-900 border border-slate-700 text-slate-100"
                : "bg-white border border-gray-200 text-gray-900",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="v37-incomplete-title"
              className="text-lg font-semibold mb-3"
            >
              Please complete all questions
            </h3>
            <p
              className={cx(
                "text-sm mb-3",
                isDark ? "text-slate-300" : "text-gray-600",
              )}
            >
              You haven&apos;t answered the following question
              {incompleteDialog.missing.length > 1 ? "s" : ""} for this
              section:
            </p>
            <ul
              className={cx(
                "list-disc pl-5 mb-4 text-sm space-y-1",
                isDark ? "text-slate-200" : "text-gray-800",
              )}
            >
              {incompleteDialog.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p
              className={cx(
                "text-sm mb-5",
                isDark ? "text-slate-300" : "text-gray-600",
              )}
            >
              Please review the section and answer{" "}
              {incompleteDialog.missing.length > 1 ? "them" : "it"} before
              submitting.
            </p>
            <button
              type="button"
              autoFocus
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 transition-colors"
              onClick={() =>
                setIncompleteDialog({ open: false, missing: [] })
              }
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   SECTION 5: MAIN COMPONENT
============================================================================= */

const PatientReportFirstVisitV40: React.FC<PatientReportProps> = ({
  isDarkMode = false,
  onComplete,
}) => {
  const patientId = usePatientId((state) => state.patientId);
  const fileId = useFileId((state) => state.fileId);

  const { fetchSummaryDetail, fetchAISummary, fetchSentencesByClass, updateSingleClassScore } = usePatientData();

  usePassiveTracking({
    proximity: { threshold: 150, debounceMs: 100 },
    scrollDepth: { thresholds: [25, 50, 75, 100], debounceMs: 200 },
    dwellTime: { minDwellTime: 2000, trackingInterval: 500 },
  });

  // Pattern A: page-lifetime session — mount-only.
  useEffect(() => {
    startSession();
    return () => endSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [Feedback #9] Track total time spent on this report page
  useEffect(() => {
    const pageEnteredAt = Date.now();
    trackingManager.recordEvent({
      eventType: "page_enter",
      elementId: "patient_report_page",
      metadata: { timestamp: new Date().toISOString() },
    });

    trackFirst(currentFile, currentSpeaker, {
      event_type: "page_view",
      metadata: { page: "patient_first_visit_report" },
    });

    const handleBeforeUnload = () => {
      const timeSpentMs = Date.now() - pageEnteredAt;
      trackingManager.recordEvent({
        eventType: "page_exit",
        elementId: "patient_report_page",
        metadata: {
          timeSpentMs,
          timeSpentSeconds: Math.round(timeSpentMs / 1000),
          timestamp: new Date().toISOString(),
        },
      });

      trackFirst(currentFile, currentSpeaker, {
        event_type: "session_end",
        metadata: { time_spent_seconds: Math.round(timeSpentMs / 1000) },
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      handleBeforeUnload();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // State Management
  const [aiSummaryData, setAiSummaryData] = useState<any | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryDetailResponse | null>(
    null,
  );
  const [evidenceSentences, setEvidenceSentences] = useState<Record<string, Array<{
    sentence: string;
    context: string | null;
    pred_score: number;
    score: number | null;
    is_in_summary: boolean;
  }>>>({});
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const currentFile = fileId || "Input_Keystrokes REC001 (SID 14).xlsx";
  const currentSpeaker = patientId || "Patient_Input_Keystrokes REC001 (SID 14)";
  const visitId = `visit_${currentFile}_${Date.now()}`;

  // [V37] Persistence — fetch any previously-submitted answers on mount
  // so the page restores after reload, and expose saveDomain() for the
  // per-domain Submit click in TopicCard.
  const firstVisit = useFirstVisitAnswers(currentFile, currentSpeaker);

  // First topic (Cancer Prognosis) expanded by default, rest collapsed
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>(
    { [TOPIC_ORDER[0]]: true },
  );
  const [showEvidenceStates, setShowEvidenceStates] = useState<
    Record<string, boolean>
  >({});
  // [V38] Per-topic toggle for the AI-Generated Summary panel. Lifted
  // from TopicCard so the wizard can enforce per-screen defaults via
  // the currentScreen useEffect below.
  const [showAiSummaryStates, setShowAiSummaryStates] = useState<
    Record<string, boolean>
  >({});
  // Rating state management
  const [ratings, setRatings] = useState<Record<string, number>>({});

  // Per-domain Submit state. Each entry maps a topic name to whether
  // the patient has a confirmed-persisted submission for that domain.
  // Drives Submission Progress. Initialised empty; reconciled with the
  // server cache once useFirstVisitResponses hydrates (effect below).
  const [submittedDomains, setSubmittedDomains] = useState<
    Record<string, boolean>
  >({});

  // [V38] Wizard navigation state (2026-05-19 meeting item 6-2 multi-screen rework).
  // Screen 0 is Overview (5 cards, no questions UI). Screens 1-5 each show a
  // single domain's full card with questions. Visibility is toggled with
  // display:none on each card wrapper so per-domain state stays mounted —
  // submitted answers survive Back/Next navigation without a refetch.
  const STEP_KEYS = ["overview", "cp", "le", "ed", "inc", "ius"] as const;
  const SCREEN_LABELS = [
    "Overview",
    "Cancer Prognosis",
    "Life Expectancy",
    "Erectile Dysfunction",
    "Urinary Incontinence",
    "Irritative Urinary Symptoms",
  ] as const;
  const TOTAL_SCREENS = STEP_KEYS.length;
  const [currentScreen, setCurrentScreen] = useState<number>(0);

  // [V40 / A-2] Survey mode — entered via ?mode=survey. Skips the
  // Overview (report) screen entirely: starts at the first domain (cp)
  // and Back never returns to Overview. Read once on mount.
  const [surveyMode] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("mode") === "survey",
  );

  // [V38] Hydrate currentScreen from ?step= on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const step = params.get("step");
    const idx = step
      ? STEP_KEYS.indexOf(step as (typeof STEP_KEYS)[number])
      : -1;
    // [V40 / A-2] Survey mode never shows Overview — clamp entry to >= 1 (cp).
    if (surveyMode) {
      setCurrentScreen(idx >= 1 && idx < TOTAL_SCREENS ? idx : 1);
      return;
    }
    if (!step) return;
    if (idx >= 0 && idx < TOTAL_SCREENS) setCurrentScreen(idx);
    // STEP_KEYS / TOTAL_SCREENS are constants; mount-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [V38] Mirror currentScreen back to ?step= so refresh / share preserves
  // position. Uses replaceState so it does not push to browser history on
  // every Next click.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("step", STEP_KEYS[currentScreen]);
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen]);

  // [V38] On per-domain screens (1-5) auto-expand the active card so the
  // patient does not have to click into it. Overview (screen 0) keeps the
  // V37 default (first topic expanded, others collapsed) so the user can
  // browse via the dropdowns as requested in the meeting notes.
  useEffect(() => {
    if (currentScreen === 0) return;
    const topic = TOPIC_ORDER[currentScreen - 1];
    if (!topic) return;
    setExpandedTopics((prev) =>
      prev[topic] ? prev : { ...prev, [topic]: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen]);

  // [V38] Per-screen defaults for the AI-Generated Summary and Relevant
  // Sentences toggles. The patient gets a consistent baseline each time
  // they navigate:
  //   Overview (screen 0): both panels OPEN for all topics so the entire
  //     report can be skimmed at once.
  //   Per-domain (screens 1-5): both panels CLOSED for the active topic
  //     so the questions are the visual focus; the patient can still
  //     re-open either toggle while on that screen if they want to
  //     re-check the summary or sentences.
  // The reset fires on every currentScreen change, so manual toggles
  // are session-only — leaving and re-entering a screen restores the
  // default. Gated on apiLoading so the writes happen after the
  // loadSummaryData reset of showEvidenceStates to {}.
  useEffect(() => {
    if (apiLoading) return;
    if (currentScreen === 0) {
      // [V40 / A-1] Report screen (Overview): BOTH dropdowns default CLOSED so the
      // patient must click to open each one. The open events are tracked as a
      // secondary outcome (which categories they explore first / most).
      setShowEvidenceStates(() =>
        Object.fromEntries(TOPIC_ORDER.map((t) => [t, false])),
      );
      setShowAiSummaryStates(() =>
        Object.fromEntries(TOPIC_ORDER.map((t) => [t, false])),
      );
    } else {
      // [V40 / A-2] Survey per-domain screen: AI summary OPEN by default
      // so the patient answers using the numbers without clicking; supporting
      // sentences stay CLOSED (click-to-open, tracked).
      const topic = TOPIC_ORDER[currentScreen - 1];
      if (!topic) return;
      setShowEvidenceStates((prev) => ({ ...prev, [topic]: false }));
      setShowAiSummaryStates((prev) => ({ ...prev, [topic]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen, apiLoading]);

  // [V37] After mount-time GET resolves, mark any domain that already
  // has a persisted row as submitted so the progress indicator and
  // each card's button reflect the patient's prior session.
  useEffect(() => {
    if (!firstVisit.isHydrated) return;
    const initial: Record<string, boolean> = {};
    for (const topic of TOPIC_ORDER) {
      const domain = TOPIC_TO_DOMAIN[topic];
      // responses[domain] is always present ({} when nothing submitted) — a
      // domain counts as submitted only once it has at least one answer.
      const answers = domain ? firstVisit.responses[domain] : undefined;
      if (answers && Object.keys(answers).length > 0) {
        initial[topic] = true;
      }
    }
    setSubmittedDomains(initial);
  }, [firstVisit.isHydrated, firstVisit.responses]);

  // [V35] Scroll indicator state
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  // Load API Data
  useEffect(() => {
    const loadSummaryData = async () => {
      try {
        setApiLoading(true);
        setApiError(null);

        // Fetch summary, AI summary, and evidence sentences in parallel
        const [result, aiResult, sentencesResult] = await Promise.all([
          fetchSummaryDetail(currentFile, currentSpeaker),
          fetchAISummary(currentFile),
          fetchSentencesByClass(currentFile),
        ]);

        // Store AI summary if available (GPT-4o reformat sentences)
        if (aiResult?.source === "ai_pipeline_gpt4o" && aiResult.domains?.length > 0) {
          setAiSummaryData(aiResult);
          console.log("[V35] AI Summary loaded:", aiResult.total_domains, "domains");
        }

        if (result) {
          setSummaryData(result);

          // Load previously saved ratings
          const initialRatings: Record<string, number> = {};
          result.summary?.classes?.forEach((cls: ClassSummary) => {
            const topicName = CLASS_TO_TOPIC_MAP[cls.class_name];
            if (topicName && cls.score !== null) {
              initialRatings[topicName] = cls.score;
            }
          });
          setRatings(initialRatings);

          // First topic expanded by default
          setExpandedTopics({ [TOPIC_ORDER[0]]: true });
          setShowEvidenceStates({});
        } else {
          setApiError("Failed to load summary data");
        }

        // Map evidence sentences by class → topic name (with pred_score, score, is_in_summary)
        if (sentencesResult?.by_class) {
          const mapped: Record<string, Array<{sentence: string; context: string | null; pred_score: number; score: number | null; is_in_summary: boolean}>> = {};
          for (const [cls, sentences] of Object.entries(sentencesResult.by_class)) {
            const topicName = CLASS_TO_TOPIC_MAP[cls];
            if (topicName) {
              mapped[topicName] = (sentences as any[]).map((s: any) => ({
                sentence: s.sentence,
                context: s.context ?? null,
                pred_score: s.pred_score,
                score: s.score,
                is_in_summary: s.is_in_summary || false,
              }));
            }
          }
          console.log("[evidenceSentences] Mapped:", mapped);
          setEvidenceSentences(mapped);
        }
      } catch (err) {
        console.error("Error loading summary data:", err);
        setApiError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setApiLoading(false);
      }
    };

    loadSummaryData();
  }, [currentFile, currentSpeaker, fileId, patientId]);

  // Build AI summary + source-sentence + source-context lookups by topic.
  const {
    aiSummaryByTopic,
    aiSourceByTopic,
    aiSourceContextByTopic,
    aiSourceListByTopic,
    aiScoreListByTopic,
    aiSubDomainsByTopic,
  } = useMemo(() => {
    const summaryMap: Record<string, string> = {};
    // [V39] track reformat text already added per topic, so identical
    // per-treatment rows collapse to a single copy (no N-times repeat).
    const summarySeen: Record<string, Set<string>> = {};
    const sourceMap: Record<string, string> = {};
    const sourceCtxMap: Record<string, string> = {};
    // [V39] every treatment's source, in order, so all are shown (not just first).
    const sourceListMap: Record<
      string,
      Array<{ treatment: string | null; sentence: string | null; context: string | null }>
    > = {};
    // [DEBUG] every row's ai_score per topic, as stored (one per treatment row).
    const scoreListMap: Record<string, Array<number | null>> = {};
    // [V40] Sub-domain (treatment) grouping. Rows are grouped by treatment so a
    // domain with >= 2 distinct treatments can be shown per sub-domain, each
    // with its own ai_score and its own source sentences. Insertion order of
    // treatments is preserved; historical duplicate rows are de-duplicated.
    const subDomainMap: Record<
      string,
      Array<{
        treatment: string | null;
        aiScore: number | null;
        sources: Array<{ sentence: string | null; context: string | null }>;
      }>
    > = {};
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
        // [DEBUG] collect this row's ai_score as-is (one entry per row/treatment).
        if (!scoreListMap[topic]) scoreListMap[topic] = [];
        scoreListMap[topic].push(d.ai_score ?? null);
        // [V40] group this row under its treatment (sub-domain).
        {
          const treatment: string | null = d.treatment ?? null;
          const tKey = treatment ?? "<null>";
          if (!subDomainMap[topic]) subDomainMap[topic] = [];
          let sub = subDomainMap[topic].find(
            (s) => (s.treatment ?? "<null>") === tKey,
          );
          if (!sub) {
            sub = { treatment, aiScore: d.ai_score ?? null, sources: [] };
            subDomainMap[topic].push(sub);
          } else if (sub.aiScore === null && d.ai_score != null) {
            sub.aiScore = d.ai_score;
          }
          if (d.source_sentence || d.source_context) {
            const sentence: string | null = d.source_sentence ?? null;
            const context: string | null = d.source_context ?? null;
            const dup = sub.sources.some(
              (x) => x.sentence === sentence && x.context === context,
            );
            if (!dup) sub.sources.push({ sentence, context });
          }
        }
        // [V39] Fix 1 — summary: the AI stores ONE domain-level reformat
        // duplicated on every treatment row. Append only DISTINCT text so the
        // panel shows it once. (If a domain ever produced genuinely different
        // per-treatment summaries, the distinct ones still join with a blank
        // line; identical copies are dropped.)
        if (d.reformat_sentence) {
          if (!summarySeen[topic]) summarySeen[topic] = new Set();
          if (!summarySeen[topic].has(d.reformat_sentence)) {
            summarySeen[topic].add(d.reformat_sentence);
            summaryMap[topic] = summaryMap[topic]
              ? summaryMap[topic] + "\n\n" + d.reformat_sentence
              : d.reformat_sentence;
          }
        }
        // [V39] Fix 2 — sources: collect EVERY treatment's source (not just the
        // first). source_context carries the <main>...</main> focus markers.
        if (d.source_sentence || d.source_context) {
          if (!sourceListMap[topic]) sourceListMap[topic] = [];
          sourceListMap[topic].push({
            treatment: d.treatment ?? null,
            sentence: d.source_sentence ?? null,
            context: d.source_context ?? null,
          });
        }
        // First-source fields kept for backward compatibility / fallback.
        if (d.source_sentence && !sourceMap[topic]) {
          sourceMap[topic] = d.source_sentence;
        }
        if (d.source_context && !sourceCtxMap[topic]) {
          sourceCtxMap[topic] = d.source_context;
        }
      }
    }
    return {
      aiSummaryByTopic: summaryMap,
      aiSourceByTopic: sourceMap,
      aiSourceContextByTopic: sourceCtxMap,
      aiSourceListByTopic: sourceListMap,
      aiScoreListByTopic: scoreListMap,
      aiSubDomainsByTopic: subDomainMap,
    };
  }, [aiSummaryData]);

  // Derived Data — aiSourceContext now comes straight from the AI summary's
  // source_context (persisted WITH <main>...</main> markers). No matching
  // against sentence_prediction is needed.
  const consultationTopics = useMemo(() => {
    const topics: Record<
      string,
      {
        aiSummary: string;
        aiScores: Array<number | null>;
        aiSubDomains: Array<{ treatment: string | null; aiScore: number | null; sources: Array<{ sentence: string | null; context: string | null }> }>;
        aiSourceContext: string | null;
        aiSourceList: Array<{ treatment: string | null; sentence: string | null; context: string | null }>;
        extractedSentences: Array<{sentence: string; context: string | null; pred_score: number; score: number | null; is_in_summary: boolean}>;
      }
    > = {};

    if (summaryData?.summary?.classes) {
      summaryData.summary.classes.forEach((cls: ClassSummary) => {
        const topicName = CLASS_TO_TOPIC_MAP[cls.class_name];
        if (topicName) {
          // Use GPT-4o AI summary if available, fallback to existing rewriter summary
          const aiText = aiSummaryByTopic[topicName];
          topics[topicName] = {
            aiSummary: aiText || cls.summary || "Summary not available.",
            aiScores: aiScoreListByTopic[topicName] || [],
            aiSubDomains: aiSubDomainsByTopic[topicName] || [],
            aiSourceContext: aiSourceContextByTopic[topicName] ?? null,
            aiSourceList: aiSourceListByTopic[topicName] || [],
            extractedSentences: evidenceSentences[topicName] || [],
          };
        }
      });
    }

    TOPIC_ORDER.forEach((topic) => {
      if (!topics[topic]) {
        const aiText = aiSummaryByTopic[topic];
        topics[topic] = {
          aiSummary: aiText || "Summary not available for this topic.",
          aiScores: aiScoreListByTopic[topic] || [],
          aiSubDomains: aiSubDomainsByTopic[topic] || [],
          aiSourceContext: aiSourceContextByTopic[topic] ?? null,
          aiSourceList: aiSourceListByTopic[topic] || [],
          extractedSentences: evidenceSentences[topic] || [],
        };
      }
    });

    return topics;
  }, [summaryData, evidenceSentences, aiSummaryByTopic, aiSourceContextByTopic, aiSourceListByTopic, aiScoreListByTopic, aiSubDomainsByTopic]);

  // Event Handlers

  /**
   * Submit handler for the per-domain Submit button.
   * Marks this topic as submitted so Submission Progress can advance.
   * Re-clicking after submission is a no-op for the count (already true).
   */
  const handleSubmitDomain = (topic: string): void => {
    setSubmittedDomains((prev: Record<string, boolean>) => ({
      ...prev,
      [topic]: true,
    }));
  };

  /**
   * Rating change handler
   * - Updates local state
   * - Saves to server via API call
   */
  const handleRatingChange = async (topic: string, newRating: number) => {
    setRatings((prev) => ({ ...prev, [topic]: newRating }));

    const backendDomain = TOPIC_TO_BACKEND_DOMAIN[topic];

    if (backendDomain) {
      try {
        await updateSingleClassScore(
          currentFile,
          currentSpeaker,
          backendDomain,
          newRating,
        );
      } catch (err) {
        console.error("❌ Error updating score:", err);
      }
    }
  };

  const handleToggleExpand = (topic: string) => {
    const isCurrentlyExpanded = expandedTopics[topic];
    setExpandedTopics((prev) => ({ ...prev, [topic]: !prev[topic] }));

    trackingManager.recordEvent({
      eventType: isCurrentlyExpanded ? "topic_collapse" : "topic_expand",
      elementId: `Topic_${topic.replace(/\s+/g, "")}`,
      timestamp: new Date().toISOString(),
      patientId: currentSpeaker,
      visitId,
      dimensionType: topic,
      metadata: { topic },
    });

    const domain = TOPIC_TO_DOMAIN[topic];
    if (domain) {
      trackFirst(currentFile, currentSpeaker, {
        event_type: isCurrentlyExpanded ? "topic_close" : "topic_open",
        domain,
        metadata: { topic, screen: STEP_KEYS[currentScreen] },
      });
    }
  };

  /**
   * Evidence sentence toggle - Key usefulness measurement point
   * Requirement 5) Measure usage through click tracking
   * - No click → Summary alone was likely sufficient
   * - Click → User likely wanted to verify/supplement the summary
   */
  const handleToggleEvidence = (key: string) => {
    // [V40] `key` is either a plain topic (single-domain card) or a compound
    // `topic::treatment` key (one per sub-domain). State is stored under the
    // full key so each sub-domain toggles independently; tracking resolves the
    // base topic so the domain/dimension fields stay correct.
    const sep = key.indexOf("::");
    const baseTopic = sep >= 0 ? key.slice(0, sep) : key;
    const treatment = sep >= 0 ? key.slice(sep + 2) : null;
    const isCurrentlyShown = showEvidenceStates[key];
    setShowEvidenceStates((prev) => ({ ...prev, [key]: !prev[key] }));

    trackingManager.recordEvent({
      eventType: isCurrentlyShown ? "evidence_collapse" : "evidence_expand",
      elementId: `Evidence_${baseTopic.replace(/\s+/g, "")}`,
      timestamp: new Date().toISOString(),
      patientId: currentSpeaker,
      visitId,
      dimensionType: baseTopic,
      metadata: {
        topic: baseTopic,
        treatment,
        action: isCurrentlyShown ? "collapse" : "expand",
        summaryRatingAtExpand: ratings[baseTopic] || null,
      },
    });

    const topic = baseTopic;
    const domain = TOPIC_TO_DOMAIN[topic];
    if (domain) {
      trackFirst(currentFile, currentSpeaker, {
        event_type: isCurrentlyShown ? "evidence_close" : "evidence_open",
        domain,
        metadata: {
          topic,
          screen: STEP_KEYS[currentScreen],
          summary_rating_at_expand: ratings[topic] || null,
        },
      });
    }
  };

  /**
   * [V38] AI-Generated Summary toggle. Mirrors handleToggleEvidence so
   * both expandable sections behave consistently; state lives in the
   * parent so the wizard's currentScreen useEffect can enforce per-
   * screen defaults (open on Overview, closed on per-domain).
   */
  const handleToggleAiSummary = (topic: string) => {
    const isCurrentlyShown = showAiSummaryStates[topic];
    setShowAiSummaryStates((prev) => ({ ...prev, [topic]: !prev[topic] }));

    // [V38] Track the AI-summary panel toggle, mirroring evidence. screen
    // records which page (Overview vs the domain detail) it happened on, so
    // the same card on two screens is distinguishable.
    const domain = TOPIC_TO_DOMAIN[topic];
    if (domain) {
      trackFirst(currentFile, currentSpeaker, {
        event_type: isCurrentlyShown ? "summary_close" : "summary_open",
        domain,
        metadata: { topic, screen: STEP_KEYS[currentScreen] },
      });
    }
  };

  // Print Styles
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @media print {
        body * { visibility: hidden; }
        #report-content, #report-content * { visibility: visible; }
        #report-content { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
        @page { size: A4; margin: 1.5cm; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // [V35] Track time spent on report page (Feedback 2-9)
  const pageLoadTimeRef = useRef<number>(Date.now());

  // [V35] Send tracking events to backend on page unload / visibility change
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
        "first",
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
        metadata: { dwellTimeMs: durationMs, page: "first_visit" },
      } as TrackingEvent);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        recordTimeSpent();
        flushEvents(true); // keepalive for background tab
        pageLoadTimeRef.current = Date.now();
      }
    };

    const handleBeforeUnload = () => {
      recordTimeSpent();
      flushEvents(true); // keepalive for page unload
    };

    // Periodic flush every 10 seconds (keepalive=false for normal operation)
    const periodicFlushTimer = setInterval(() => flushEvents(false), 10_000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(periodicFlushTimer);
      recordTimeSpent();
      flushEvents(true); // keepalive on unmount
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [currentFile, currentSpeaker]);

  // [V35] Scroll indicator — hide after 15% scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollableHeight = scrollHeight - clientHeight;
      const scrollPercentage =
        scrollableHeight > 0 ? (scrollTop / scrollableHeight) * 100 : 100;

      setShowScrollIndicator(scrollPercentage <= 95);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Loading State
  if (apiLoading) {
    return (
      <div
        className={cx(
          // Same pattern as the error state — flex-1 instead of
          // min-h-screen so the loading wrapper exactly fills the
          // remaining viewport space inside page.tsx's column flex.
          "flex-1 flex items-center justify-center",
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
            Loading your consultation summary...
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (apiError) {
    return (
      <div
        className={cx(
          // `flex-1` (not min-h-screen) so the error wrapper grows to
          // exactly fill page.tsx's flex-col viewport allotment without
          // adding a tall empty band below the footer. `flex flex-col`
          // + `justify-center` keeps the card vertically centred. Same
          // pattern matches what the loading state does above.
          "flex-1 flex flex-col items-center justify-center p-8",
          isDarkMode
            ? "bg-slate-950"
            : "bg-gradient-to-br from-slate-50 via-white to-gray-100",
        )}
      >
        <div
          className={cx(
            "max-w-md w-full p-8 rounded-3xl border shadow-2xl",
            isDarkMode
              ? "bg-slate-900 border-slate-800"
              : "bg-white border-gray-200",
          )}
        >
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/30">
              <svg
                className="w-8 h-8 text-white"
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
                "text-2xl font-bold mb-3",
                isDarkMode ? "text-white" : "text-gray-900",
              )}
            >
              Unable to Load
            </h2>
            <p
              className={cx(
                "mb-8 text-sm",
                isDarkMode ? "text-slate-400" : "text-gray-500",
              )}
            >
              {apiError}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-lg shadow-indigo-500/30 hover:shadow-xl"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Render
  return (
    <div
      className={cx(
        // `flex-1 flex flex-col` (no min-h-screen) so V37 takes exactly
        // page.tsx's column-flex allotment — which is `viewport height
        // minus DashboardFooter height`. This guarantees the page total
        // equals the viewport whenever V37 content is shorter than the
        // viewport, so no empty band appears below the footer. When
        // content is taller, the wrapper just grows naturally.
        "flex-1 flex flex-col",
        isDarkMode
          ? "bg-slate-950"
          : "bg-gradient-to-br from-slate-50 via-white to-gray-100",
      )}
    >
      {/* The inner gets `flex-1 w-full` so it absorbs V37 outer's
          remaining vertical space (matching V31Re's `flex flex-1`
          pattern). Without this, when V37 content is shorter than the
          viewport, the gradient leaves a tall empty band beneath the
          content cards which reads visually as "footer is long". */}
      <div className="w-full flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12" id="report-content">
        {/* COMPASS branding card — first impression for patients arriving via SMS / email link */}
        <div
          className={cx(
            "mb-6 rounded-2xl p-5 sm:p-6 border text-center",
            isDarkMode
              ? "bg-violet-950/30 border-violet-800"
              : "bg-violet-50/60 border-violet-200",
          )}
        >
          <h2
            className={cx(
              "text-2xl sm:text-3xl font-bold tracking-tight",
              isDarkMode ? "text-violet-100" : "text-violet-900",
            )}
          >
            COMPASS
          </h2>
          <p
            className={cx(
              "text-xs sm:text-sm italic mt-1",
              isDarkMode ? "text-violet-300" : "text-violet-700",
            )}
          >
            <span className="font-semibold">Com</span>munication of{" "}
            <span className="font-semibold">P</span>rognosis,{" "}
            <span className="font-semibold">A</span>lternatives, and{" "}
            <span className="font-semibold">S</span>ide Effects for{" "}
            <span className="font-semibold">S</span>hared Decision Making
          </p>
        </div>

        {/* [V38] Wizard progress — mobile / tablet (≤lg-1).
            Horizontal bar that floats at the top of the viewport while
            scrolling via `sticky top-0`. On desktop (≥lg) this is hidden
            and the floating right sidebar (rendered just below) takes
            over with a richer vertical step list. */}
        <div
          className={cx(
            // [V40 / A-1] hidden on the report screen — no progress UI there.
            currentScreen === 0 && "hidden",
            "lg:hidden sticky top-0 z-30 mb-4 sm:mb-6 p-4 sm:p-5 rounded-2xl border backdrop-blur-md",
            isDarkMode
              ? "bg-slate-900/85 border-slate-800/60"
              : "bg-white/90 border-gray-200/70 shadow-sm",
          )}
          data-track-proximity="WizardProgress"
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className={cx(
                "text-sm sm:text-base font-bold",
                isDarkMode ? "text-white" : "text-gray-800",
              )}
            >
              Step {surveyMode ? currentScreen : currentScreen + 1} of{" "}
              {surveyMode ? TOTAL_SCREENS - 1 : TOTAL_SCREENS}:{" "}
              {SCREEN_LABELS[currentScreen]}
            </span>
            <span
              className={cx(
                "text-xs sm:text-sm font-bold px-3 py-1 rounded-full",
                isDarkMode
                  ? "bg-slate-800 text-slate-400"
                  : "bg-gray-100 text-gray-600",
              )}
            >
              {surveyMode ? currentScreen : currentScreen + 1} /{" "}
              {surveyMode ? TOTAL_SCREENS - 1 : TOTAL_SCREENS}
            </span>
          </div>
          <div className="flex gap-1.5">
            {Array.from({
              length: surveyMode ? TOTAL_SCREENS - 1 : TOTAL_SCREENS,
            }).map((_, k) => {
              // Survey omits Overview, so segment k maps to screen k+1.
              const screenIdx = surveyMode ? k + 1 : k;
              const filled = screenIdx <= currentScreen;
              // [V40 / A-5] Filled segment uses its category card colour.
              const catBg =
                screenIdx > 0
                  ? TOPIC_COLORS[SCREEN_LABELS[screenIdx]]?.iconBg
                  : null;
              return (
                <div
                  key={k}
                  className={cx(
                    "h-2 flex-1 rounded-full transition-colors duration-300",
                    filled
                      ? catBg
                        ? `bg-gradient-to-r ${catBg}`
                        : "bg-gradient-to-r from-indigo-500 to-violet-500"
                      : isDarkMode
                        ? "bg-slate-800"
                        : "bg-gray-200",
                  )}
                />
              );
            })}
          </div>
        </div>

        {/* [V38] Wizard progress — desktop (≥lg).
            Floating right-side vertical step list, fixed to viewport so
            the patient always sees where they are without consuming
            content space at the top. Display-only (no click-to-jump)
            per the 2026-05-19 meeting decision: navigation is Back/Next
            only. Submitted domains carry a ✓ check mark. */}
        <aside
          aria-label="Wizard progress"
          className={cx(
            // [V40 / A-1] hidden on the report screen; desktop-only on survey screens.
            currentScreen === 0 ? "hidden" : "hidden lg:block",
            "fixed right-6 top-24 z-30 w-56",
          )}
          data-track-proximity="WizardProgress"
        >
          <div
            className={cx(
              "rounded-2xl border p-4 backdrop-blur-md",
              isDarkMode
                ? "bg-slate-900/85 border-slate-800/60 shadow-lg shadow-black/30"
                : "bg-white/90 border-gray-200/70 shadow-lg shadow-gray-500/10",
            )}
          >
            <div
              className={cx(
                "text-[11px] font-semibold uppercase tracking-wider mb-3",
                isDarkMode ? "text-slate-400" : "text-gray-500",
              )}
            >
              {/* [V40 / A-2] Survey skips Overview → "Step X of 5"; otherwise 6. */}
              Step {surveyMode ? currentScreen : currentScreen + 1} of{" "}
              {surveyMode ? TOTAL_SCREENS - 1 : TOTAL_SCREENS}
            </div>
            <ol className="space-y-1.5">
              {SCREEN_LABELS.map((label, i) => {
                // [V40 / A-2] Survey mode omits the Overview step (index 0).
                if (surveyMode && i === 0) return null;
                const isCurrent = i === currentScreen;
                const topic = i > 0 ? TOPIC_ORDER[i - 1] : null;
                const isDone = topic ? !!submittedDomains[topic] : false;
                // [V40 / A-5] Each category step uses its CARD colour
                // (TOPIC_COLORS) so the panel matches the cards.
                const catBg = i > 0 ? TOPIC_COLORS[label]?.iconBg : null;
                const stepNo = surveyMode ? i : i + 1;
                return (
                  <li
                    key={i}
                    aria-current={isCurrent ? "step" : undefined}
                    className={cx(
                      "flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors",
                      isCurrent
                        ? isDarkMode
                          ? "bg-white/5 text-white font-semibold"
                          : "bg-gray-100 text-gray-900 font-semibold"
                        : isDarkMode
                          ? "text-slate-400"
                          : "text-gray-500",
                    )}
                  >
                    <span
                      className={cx(
                        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 text-white",
                        catBg
                          ? `bg-gradient-to-r ${catBg}`
                          : "bg-gradient-to-r from-indigo-500 to-violet-500",
                        isCurrent
                          ? "ring-2 ring-offset-1 ring-violet-400 dark:ring-offset-slate-900 shadow"
                          : isDone
                            ? ""
                            : "opacity-40",
                      )}
                    >
                      {isDone ? "✓" : stepNo}
                    </span>
                    <span className="leading-tight">{label}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>

        {/* Header */}
        <div className="text-center mb-6 sm:mb-8 lg:mb-12">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 rounded-3xl mb-6 bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-500/30">
            <FileText className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-white" />
          </div>

          <h1
            className={cx(
              "text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 tracking-tight",
              isDarkMode ? "text-white" : "text-gray-900",
            )}
          >
            {/* [V40 / A-1] Survey screen reads "Survey" so the title matches
                the task (answering questions), not just viewing a summary. */}
            {surveyMode ? "Your Consultation Survey" : "Your Consultation Summary"}
          </h1>
          <p
            className={cx(
              "text-base sm:text-lg lg:text-xl",
              isDarkMode ? "text-slate-400" : "text-gray-500",
            )}
          >
            Prostate Cancer Treatment Discussion
          </p>

          {/* Patient Info Pill */}
          {/* <div
            className={cx(
              "mt-6 inline-flex items-center gap-4 px-6 py-3 rounded-full text-sm",
              isDarkMode
                ? "bg-slate-800/80 border border-slate-700/50"
                : "bg-white/90 border border-gray-200/80 shadow-lg shadow-gray-500/5",
            )}
          >
            <span className={isDarkMode ? "text-slate-300" : "text-gray-600"}>
              <span className="font-semibold">Patient:</span>{" "}
              {patientId || currentSpeaker}
            </span>
            <span className={isDarkMode ? "text-slate-600" : "text-gray-300"}>
              •
            </span>
            <span className={isDarkMode ? "text-slate-300" : "text-gray-600"}>
              <span className="font-semibold">Visit Date:</span>{" "}
              {new Date().toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div> */}
        </div>

        {/* Instructions */}
        <InstructionsBox
          isDark={isDarkMode}
          variant={currentScreen === 0 ? "report" : "survey"}
        />

        {/* [V37] Helpfulness Scale Legend (1-5: Not at all helpful → Extremely helpful)
            commented out per request — restore by un-commenting if the scale returns.
        <HelpfulnessLegend isDark={isDarkMode} />
        */}

        {/* [V38] Submission Progress indicator removed across all screens
            per user request — the wizard's top progress bar already shows
            the patient's position, and per-card "Submitted ✓" feedback
            covers per-domain status. */}

        {/* Topic Cards — V38 wizard: render all 5 always (state preserved
            via display:none) so answers entered on one domain screen survive
            Back/Next navigation. Visibility per screen:
              screen 0 (Overview): all 5 visible
              screens 1-5: only the matching domain visible */}
        <div className="space-y-4">
          {TOPIC_ORDER.map((topic, index) => {
            const topicData = consultationTopics[topic];
            const isVisible =
              currentScreen === 0 || index + 1 === currentScreen;
            // Overview (screen 0) shows all 5 cards with the question UI
            // hidden. Per-domain screens (1-5) show the matching card with
            // questions enabled.
            const showQuestions = currentScreen !== 0;
            return (
              <div
                key={topic}
                style={{ display: isVisible ? "block" : "none" }}
              >
                <TopicCard
                  topicName={topic}
                  topicIndex={index}
                  aiSummary={topicData?.aiSummary || "Summary not available."}
                  extractedSentences={topicData?.extractedSentences || []}
                  aiScores={topicData?.aiScores || []}
                  aiSourceSentence={aiSourceByTopic[topic]}
                  aiSourceContext={topicData?.aiSourceContext || null}
                  aiSources={topicData?.aiSourceList}
                  rating={ratings[topic] || 0}
                  onRatingChange={(rating) => handleRatingChange(topic, rating)}
                  isExpanded={expandedTopics[topic] || false}
                  onToggleExpand={() => handleToggleExpand(topic)}
                  showEvidence={showEvidenceStates[topic] || false}
                  onToggleEvidence={() => handleToggleEvidence(topic)}
                  aiSubDomains={topicData?.aiSubDomains || []}
                  isSubEvidenceShown={(treatment) =>
                    showEvidenceStates[`${topic}::${treatment ?? "<null>"}`] ||
                    false
                  }
                  onToggleSubEvidence={(treatment) =>
                    handleToggleEvidence(`${topic}::${treatment ?? "<null>"}`)
                  }
                  showAiSummary={showAiSummaryStates[topic] ?? true}
                  onToggleAiSummary={() => handleToggleAiSummary(topic)}
                  isSubmitted={!!submittedDomains[topic]}
                  onSubmit={() => handleSubmitDomain(topic)}
                  showQuestions={showQuestions}
                  prefill={firstVisit.responses[TOPIC_TO_DOMAIN[topic]] ?? null}
                  onSave={(answers) =>
                    firstVisit.saveDomain(TOPIC_TO_DOMAIN[topic], answers)
                  }
                  isDark={isDarkMode}
                  patientId={currentSpeaker}
                  visitId={visitId}
                  trackFile={currentFile}
                  trackSpeaker={currentSpeaker}
                  trackDomain={TOPIC_TO_DOMAIN[topic]}
                  trackScreen={STEP_KEYS[currentScreen]}
                />
              </div>
            );
          })}
        </div>

        {/* [V38] Wizard navigation — Back / Next.
            Next is gated on the current domain having been Submitted (per
            the 2026-05-19 6-2 design: answers → Submit → Next). On Overview
            (screen 0) Next is always enabled. On the last screen (ius)
            Next is disabled because there is nowhere to advance to. */}
        {(() => {
          // [V40 / A-1] Report (Overview, screen 0) is a read-only single
          // page — no Back/Next wizard bar. Navigation appears only on the
          // survey (per-domain) screens.
          if (currentScreen === 0) return null;
          const currentTopic =
            currentScreen > 0 ? TOPIC_ORDER[currentScreen - 1] : null;
          const isLastScreen = currentScreen >= TOTAL_SCREENS - 1;
          const needsSubmit =
            currentTopic !== null && !submittedDomains[currentTopic];
          // Combined-survey flow: on the last domain, once it is submitted,
          // the Next button becomes a "Continue" action that hands off to the
          // follow-up surveys via onComplete(). Standalone (onComplete undefined)
          // keeps the original behavior (Next disabled on the last screen).
          const isContinueToFollowup = !!onComplete && isLastScreen && !needsSubmit;
          const nextDisabled = isContinueToFollowup
            ? false
            : isLastScreen || needsSubmit;
          return (
            <div
              className={cx(
                "mt-6 sm:mt-8 flex items-center justify-between gap-3 p-4 rounded-2xl border",
                isDarkMode
                  ? "bg-slate-900/50 border-slate-800/50"
                  : "bg-white/80 border-gray-200/50 shadow-lg shadow-gray-500/5",
              )}
            >
              <button
                type="button"
                disabled={currentScreen <= (surveyMode ? 1 : 0)}
                onClick={() =>
                  setCurrentScreen((s) => Math.max(surveyMode ? 1 : 0, s - 1))
                }
                data-track-proximity="WizardBack"
                className={cx(
                  "inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 border",
                  currentScreen <= (surveyMode ? 1 : 0)
                    ? isDarkMode
                      ? "bg-slate-800/40 text-slate-600 border-slate-800 cursor-not-allowed"
                      : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : isDarkMode
                      ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                      : "bg-white text-gray-700 border-gray-200 shadow-sm hover:bg-gray-50",
                )}
              >
                <ChevronLeft size={16} />
                Back
              </button>

              <span
                className={cx(
                  "hidden sm:inline text-xs sm:text-sm text-center px-2",
                  needsSubmit
                    ? isDarkMode
                      ? "text-amber-300"
                      : "text-amber-700"
                    : isDarkMode
                      ? "text-slate-400"
                      : "text-gray-500",
                )}
              >
                {needsSubmit
                  ? "Submit this section to continue"
                  : SCREEN_LABELS[currentScreen]}
              </span>

              <button
                type="button"
                disabled={nextDisabled}
                onClick={() => {
                  if (isContinueToFollowup) {
                    onComplete!();
                  } else {
                    setCurrentScreen((s) => Math.min(TOTAL_SCREENS - 1, s + 1));
                  }
                }}
                data-track-proximity="WizardNext"
                className={cx(
                  "inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 border text-white",
                  nextDisabled
                    ? "bg-gray-300 dark:bg-slate-700 border-transparent cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-500 to-violet-500 border-transparent shadow hover:from-indigo-600 hover:to-violet-600",
                )}
              >
                {isContinueToFollowup ? "Continue to Follow-up" : "Next"}
                <ChevronRight size={16} />
              </button>
            </div>
          );
        })()}

        {/* Footer */}
        {/* <div
          className={cx(
            "mt-12 pt-8 border-t text-center",
            isDarkMode ? "border-slate-800" : "border-gray-200",
          )}
        >
          <p
            className={cx(
              "text-sm leading-relaxed",
              isDarkMode ? "text-slate-500" : "text-gray-400",
            )}
          >
            These summaries were generated by AI based on your consultation.
            <br />
            They are intended to help you review the discussion, not replace
            medical advice.
            <br />
            If you have questions, please contact your healthcare provider.
          </p>
        </div> */}
      </div>

      {/* [V35] Scroll Indicator — "there's more below" */}
      {showScrollIndicator && (
        <div
          className="fixed bottom-20 left-0 right-0 flex justify-center z-30 pointer-events-none"
        >
          <div
            className={cx(
              "flex items-center gap-2 px-3 py-2 sm:px-5 sm:py-3 rounded-full shadow-lg border backdrop-blur-md cursor-pointer pointer-events-auto animate-bounce",
              isDarkMode
                ? "bg-slate-800/90 border-slate-700 text-slate-300"
                : "bg-white/90 border-gray-200 text-gray-600 shadow-gray-300/50",
            )}
            onClick={() => {
              window.scrollBy({ top: 300, behavior: "smooth" });
            }}
          >
            <ChevronDown size={18} className="opacity-70" />
            <span className="text-sm font-medium">More topics below</span>
            <ChevronDown size={18} className="opacity-70" />
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientReportFirstVisitV40;
