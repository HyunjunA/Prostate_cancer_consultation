"use client";

/**
 * PatientInitialVisitReportV33.tsx
 *
 * First Visit Patient Dashboard - Single Page Layout
 * AI Summary Evaluation Screen
 *
 * ============================================================================
 * V33 CHANGES (based on Tim's feedback):
 * ============================================================================
 *
 * Tim's feedback:
 *   1. Star rating itself is good — "good"
 *   2. But star rating should NOT dominate the screen — "should not command everything"
 *   3. Star rating should move to the bottom — "at the end or whatever"
 *   4. Sentence dropdown should take the area where star ratings used to be —
 *      "in the area where the star ratings is now"
 *
 * Changes from V31:
 *   - Star rating moved from prominent center position to compact bottom section
 *   - Evidence sentences dropdown moved UP to where star rating used to be
 *   - Star rating is now inline/compact (not a large centered block)
 *   - Overall: Summary → Sentences dropdown → Star rating (bottom, subtle)
 *
 * ============================================================================
 * IMPLEMENTATION STATUS
 * ============================================================================
 *
 * ✅ IMPLEMENTED:
 * - Single page layout with all 5 topic summaries
 * - Star ratings (1-5) with rating labels/cheat sheet
 * - Rating progress indicator
 * - AI-generated summary label on each topic
 * - Evidence sentences toggle UI (Show/Hide button)
 * - Click tracking for evidence expand/collapse
 * - Rating persistence via updateSingleClassScore API
 * - All topics collapsed by default
 * - [V33] Star rating moved to bottom, compact style
 * - [V33] Evidence sentences promoted to main content area
 *
 * ❌ NOT YET IMPLEMENTED (TODO):
 * - Evidence sentences data connection
 *   Currently `extractedSentences` is always an empty array.
 *   Need to:
 *   1. Identify the API endpoint that returns supporting sentences per class
 *   2. Fetch the sentences data (possibly from a separate API or included in summary response)
 *   3. Map the sentences to each topic in the `consultationTopics` useMemo
 *   Example expected data structure:
 *   {
 *     class_name: "1",
 *     sentences: ["sentence1", "sentence2", ...] // 7 sentences per topic
 *   }
 *
 * ============================================================================
 *
 * Requirements (B. First Visit Screen Requirements - AI Summary Evaluation):
 * 1) Single page layout - Display all 5 category AI summaries on one screen
 * 2) Category-specific AI summaries only (5 total) - No overall summary
 * 3) Patient evaluation UX: Star rating (1-5) + rating definition cheat sheet
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
import { usePatientId } from "@/stores/usePatientId";
import { useFileId } from "@/stores/useFileId";

import {
  Info,
  ChevronDown,
  ChevronUp,
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
    | "rating_click";
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

const TOPIC_TO_CLASS_NUMBER: Record<string, 1 | 2 | 3 | 4 | 5> = {
  "Cancer Prognosis": 1,
  "Life Expectancy": 2,
  "Erectile Dysfunction": 3,
  "Urinary Incontinence": 4,
  "Irritative Urinary Symptoms": 5,
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
 * Star Rating Labels (Cheat Sheet)
 * Requirement: Display rating definitions so patients understand ratings consistently
 * - 1 star: Confusing / not helpful ("confusing / confusing me more")
 * - 2 star: Little new information added
 * - 3-5 star: Progressively positive meanings
 */
const STAR_RATING_LABELS: Record<number, string> = {
  1: "Confusing / Not helpful",
  2: "Little new information",
  3: "Neutral",
  4: "Helpful",
  5: "Very helpful",
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
 * Star Rating Component
 * Requirement 3) Patient evaluation UX: Star rating
 * - Rate each category summary on a 1-5 scale for usefulness
 * - Minimum is 1 star (no 0 star option)
 */
interface StarRatingProps {
  value: number;
  onChange: (v: number) => void;
  isDark?: boolean;
  trackingName?: string;
  disabled?: boolean;
}

const StarRating: React.FC<StarRatingProps> = React.memo(({
  value,
  onChange,
  isDark,
  trackingName,
  disabled = false,
}) => {
  const ratingLabel = value
    ? STAR_RATING_LABELS[value]
    : "Click to rate";

  return (
    <div className="flex items-center gap-2">
      {/* Stars rendered in reverse order + flex-row-reverse = CSS-only hover fill */}
      {/* Hover is handled entirely by CSS (no React state, no re-renders) */}
      <style dangerouslySetInnerHTML={{ __html: `
        .star-group { display: flex; flex-direction: row-reverse; justify-content: flex-end; gap: 2px; }
        .star-btn { position: relative; width: 2rem; height: 2rem; border-radius: 0.5rem; display: grid; place-items: center; font-size: 1.25rem; cursor: pointer; border: none; background: none; padding: 0; }
        .star-btn:disabled { cursor: not-allowed; opacity: 0.5; }
        .star-btn .star-icon { filter: drop-shadow(0 1px 1px rgba(0,0,0,0.05)); }
        .star-btn:active:not(:disabled) { transform: scale(0.95); }
        /* Hover: highlight hovered star + all stars after it (which are visually before due to row-reverse) */
        .star-group .star-btn:hover ~ .star-btn .star-icon,
        .star-group .star-btn:hover .star-icon { color: #fbbf24; transform: scale(1.1); }
      `}} />
      <div className="star-group">
        {[5, 4, 3, 2, 1].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Rate ${i} - ${STAR_RATING_LABELS[i]}`}
            disabled={disabled}
            className="star-btn"
            onClick={() => {
              if (!disabled) {
                onChange(i);
                trackingManager.recordEvent({
                  eventType: "rating_click",
                  elementId: trackingName || "unknown",
                  timestamp: new Date().toISOString(),
                  metadata: {
                    rating: i,
                    starNumber: i,
                    ratingMeaning: STAR_RATING_LABELS[i],
                  },
                });
              }
            }}
          >
            <span
              className="star-icon"
              style={{ color: value >= i ? "#fbbf24" : (isDark ? "#475569" : "#d1d5db") }}
            >
              ★
            </span>
          </button>
        ))}
      </div>
      {/* Rating label — only updates on click, not hover */}
      <div
        className={cx(
          "px-3 py-1 rounded-full text-xs font-semibold",
          value >= 4
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
            : value === 3
              ? "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400"
              : value >= 1
                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                : "bg-gray-50 text-gray-400 dark:bg-slate-800 dark:text-slate-500",
        )}
      >
        {ratingLabel}
      </div>
    </div>
  );
});

StarRating.displayName = "StarRating";

/**
 * Star Rating Legend (Cheat Sheet)
 * Requirement: Display rating definitions on screen
 */
interface StarRatingLegendProps {
  isDark?: boolean;
}

const StarRatingLegend: React.FC<StarRatingLegendProps> = ({ isDark }) => {
  return (
    <div
      className={cx(
        "rounded-2xl p-4 mb-6 border",
        isDark
          ? "bg-slate-900/50 border-slate-800/50"
          : "bg-white/60 border-gray-200/50 shadow-sm",
      )}
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span
          className={cx(
            "text-xs font-semibold mr-2",
            isDark ? "text-slate-400" : "text-gray-500",
          )}
        >
          Rating Guide:
        </span>
        {[1, 2, 3, 4, 5].map((star) => (
          <div
            key={star}
            className={cx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs",
              isDark ? "bg-slate-800/80" : "bg-gray-100/80",
            )}
          >
            <span className="text-amber-400 text-sm">{"★".repeat(star)}</span>
            <span className={isDark ? "text-slate-400" : "text-gray-500"}>
              {STAR_RATING_LABELS[star]}
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
}

const InstructionsBox: React.FC<InstructionsBoxProps> = ({ isDark }) => {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-3xl p-6 mb-8",
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
            "flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center",
            "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30",
          )}
        >
          <Info size={26} className="text-white" />
        </div>
        <div className="flex-1">
          <h3
            className={cx(
              "text-xl font-bold mb-4",
              isDark ? "text-white" : "text-gray-900",
            )}
          >
            How to Use This Report
          </h3>
          <div
            className={cx(
              "space-y-3 text-sm leading-relaxed",
              isDark ? "text-indigo-100/80" : "text-gray-600",
            )}
          >
            <p className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span>
                Click on each topic below to expand and read the{" "}
                <strong>AI-generated summary</strong> of that discussion.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                2
              </span>
              <span>
                <strong>Rate each summary</strong> using the stars (1-5) based
                on how helpful it was for understanding your consultation.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                3
              </span>
              <span>
                Optionally, click <strong>"View relevant sentences"</strong> to
                see original conversation excerpts that support the summary.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Topic Card Component - With Star Rating
interface TopicCardProps {
  topicName: string;
  topicIndex: number;
  aiSummary: string;
  extractedSentences: string[];
  rating: number;
  onRatingChange: (rating: number) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  showEvidence: boolean;
  onToggleEvidence: () => void;
  isDark?: boolean;
  patientId?: string;
  visitId?: string;
}

const TopicCard: React.FC<TopicCardProps> = ({
  topicName,
  topicIndex,
  aiSummary,
  extractedSentences,
  rating,
  onRatingChange,
  isExpanded,
  onToggleExpand,
  showEvidence,
  onToggleEvidence,
  isDark,
  patientId,
  visitId,
}) => {
  const topicId = topicName.replace(/\s+/g, "");
  const colors = TOPIC_COLORS[topicName] || TOPIC_COLORS["Cancer Prognosis"];

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
          "w-full px-6 py-5 flex items-center justify-between text-left transition-all duration-200",
          "bg-gradient-to-r",
          colors.gradient,
          !isExpanded && "hover:opacity-90",
        )}
      >
        <div className="flex items-center gap-4">
          <div
            className={cx(
              "flex items-center justify-center w-11 h-11 rounded-xl text-base font-bold text-white",
              "bg-gradient-to-br shadow-lg",
              colors.iconBg,
            )}
          >
            {topicIndex + 1}
          </div>
          <div>
            <h3
              className={cx(
                "text-lg font-semibold",
                isDark ? "text-white" : "text-gray-900",
              )}
            >
              {topicName}
            </h3>
            {/* Rating completion indicator */}
            {rating > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-amber-400 text-sm">
                  {"★".repeat(rating)}
                </span>
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span
                  className={cx(
                    "text-xs",
                    isDark ? "text-slate-400" : "text-gray-500",
                  )}
                >
                  rated
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AISummaryBadge isDark={isDark} />
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

      {/* Topic Content (Collapsible) */}
      <div
        className={cx(
          "transition-all duration-300 ease-in-out overflow-hidden",
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div
          className={cx(
            "px-6 pb-6 pt-5",
            isDark ? "bg-slate-900/40" : "bg-gray-50/50",
          )}
        >
          {/* AI Summary Text */}
          <div
            className={cx(
              "p-5 rounded-2xl mb-6 border",
              isDark
                ? "bg-slate-800/60 border-slate-700/50"
                : "bg-white border-gray-100 shadow-sm",
            )}
          >
            <p
              className={cx(
                "text-base leading-relaxed",
                isDark ? "text-slate-300" : "text-gray-600",
              )}
            >
              {aiSummary}
            </p>
          </div>

          {/* [V33] Evidence Sentences — moved UP to where star rating used to be */}
          {/* Tim: "in the area where the star ratings is now" */}
          {/* Always show the toggle button, even when no sentences available yet */}
          <div className="mb-6">
            <button
              type="button"
              onClick={onToggleEvidence}
              data-track-proximity={`EvidenceToggle_${topicId}`}
              className={cx(
                "w-full flex items-center justify-between gap-2 px-5 py-4 rounded-xl text-sm font-semibold transition-all duration-200",
                isDark
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
              {showEvidence ? (
                <ChevronUp size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>

            {showEvidence && (
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
                  Excerpts from your consultation
                </h4>
                {extractedSentences && extractedSentences.length > 0 ? (
                  extractedSentences.map((sentence, idx) => (
                    <div
                      key={idx}
                      className={cx(
                        "p-4 rounded-xl border-l-4 transition-all duration-200",
                        isDark
                          ? "bg-slate-800/50 border-l-indigo-500 border-y border-r border-slate-700/50"
                          : "bg-white border-l-indigo-500 border-y border-r border-gray-100 shadow-sm",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cx(
                            "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                            isDark
                              ? "bg-indigo-500/20 text-indigo-300"
                              : "bg-indigo-100 text-indigo-600",
                          )}
                        >
                          {idx + 1}
                        </div>
                        <p
                          className={cx(
                            "flex-1 text-sm leading-relaxed italic",
                            isDark ? "text-slate-300" : "text-gray-600",
                          )}
                        >
                          &ldquo;{sentence}&rdquo;
                        </p>
                      </div>
                    </div>
                  ))
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
            )}
          </div>

          {/* [V33] Star Rating — moved to BOTTOM, compact inline style */}
          {/* Tim: "should not command everything", "at the end or whatever" */}
          <div
            className={cx(
              "flex items-center justify-between py-3 px-4 rounded-xl border",
              isDark
                ? "bg-slate-800/30 border-slate-700/30"
                : "bg-gray-50/80 border-gray-200/30",
            )}
          >
            <span
              className={cx(
                "text-sm font-medium",
                isDark ? "text-slate-400" : "text-gray-500",
              )}
            >
              Rate this summary:
            </span>
            <StarRating
              value={rating}
              onChange={onRatingChange}
              isDark={isDark}
              trackingName={`TopicRating_${topicId}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
   SECTION 5: MAIN COMPONENT
============================================================================= */

const PatientReportFirstVisit: React.FC<PatientReportProps> = ({
  isDarkMode = false,
}) => {
  const { patientId } = usePatientId();
  const { fileId } = useFileId();

  const { fetchSummaryDetail, updateSingleClassScore } = usePatientData();

  usePassiveTracking({
    proximity: { threshold: 150, debounceMs: 100 },
    scrollDepth: { thresholds: [25, 50, 75, 100], debounceMs: 200 },
    dwellTime: { minDwellTime: 2000, trackingInterval: 500 },
  });

  // State Management
  const [summaryData, setSummaryData] = useState<SummaryDetailResponse | null>(
    null,
  );
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const currentFile = fileId || "quality-coded-nlp-pilot-sid-1.xlsx";
  const currentSpeaker = patientId || "Patient_quality-coded-nlp-pilot-sid-1";
  const visitId = `visit_${currentFile}_${Date.now()}`;

  // All topics collapsed by default
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>(
    {},
  );
  const [showEvidenceStates, setShowEvidenceStates] = useState<
    Record<string, boolean>
  >({});
  // Rating state management
  const [ratings, setRatings] = useState<Record<string, number>>({});

  // Load API Data
  useEffect(() => {
    const loadSummaryData = async () => {
      try {
        setApiLoading(true);
        setApiError(null);

        const result = await fetchSummaryDetail(currentFile, currentSpeaker);

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

          // All topics collapsed by default
          setExpandedTopics({});
          setShowEvidenceStates({});
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

  // Derived Data
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
            // TODO: Connect evidence sentences data here
            // Currently empty - need to fetch from API
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

  // Event Handlers

  /**
   * Rating change handler
   * - Updates local state
   * - Saves to server via API call
   */
  const handleRatingChange = async (topic: string, newRating: number) => {
    setRatings((prev) => ({ ...prev, [topic]: newRating }));

    const classNumber = TOPIC_TO_CLASS_NUMBER[topic];

    if (classNumber) {
      try {
        await updateSingleClassScore(
          currentFile,
          currentSpeaker,
          classNumber,
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
  };

  /**
   * Evidence sentence toggle - Key usefulness measurement point
   * Requirement 5) Measure usage through click tracking
   * - No click → Summary alone was likely sufficient
   * - Click → User likely wanted to verify/supplement the summary
   */
  const handleToggleEvidence = (topic: string) => {
    const isCurrentlyShown = showEvidenceStates[topic];
    setShowEvidenceStates((prev) => ({ ...prev, [topic]: !prev[topic] }));

    trackingManager.recordEvent({
      eventType: isCurrentlyShown ? "evidence_collapse" : "evidence_expand",
      elementId: `Evidence_${topic.replace(/\s+/g, "")}`,
      timestamp: new Date().toISOString(),
      patientId: currentSpeaker,
      visitId,
      dimensionType: topic,
      metadata: {
        topic,
        action: isCurrentlyShown ? "collapse" : "expand",
        summaryRatingAtExpand: ratings[topic] || null,
      },
    });
  };

  // Rating Progress calculation
  const ratingProgress = useMemo(() => {
    const rated = TOPIC_ORDER.filter((topic) => ratings[topic] > 0).length;
    return {
      rated,
      total: TOPIC_ORDER.length,
      percentage: Math.round((rated / TOPIC_ORDER.length) * 100),
    };
  }, [ratings]);

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

  // Loading State
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
          "min-h-screen flex items-center justify-center p-8",
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
        "min-h-screen",
        isDarkMode
          ? "bg-slate-950"
          : "bg-gradient-to-br from-slate-50 via-white to-gray-100",
      )}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12" id="report-content">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-500/30">
            <FileText className="w-10 h-10 text-white" />
          </div>

          <h1
            className={cx(
              "text-4xl font-bold mb-3 tracking-tight",
              isDarkMode ? "text-white" : "text-gray-900",
            )}
          >
            Your Consultation Summary
          </h1>
          <p
            className={cx(
              "text-xl",
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
        <InstructionsBox isDark={isDarkMode} />

        {/* Star Rating Legend (Cheat Sheet) - Requirement: Display rating definitions on screen */}
        <StarRatingLegend isDark={isDarkMode} />

        {/* Rating Progress Indicator */}
        <div
          className={cx(
            "mb-8 p-6 rounded-2xl border",
            isDarkMode
              ? "bg-slate-900/50 border-slate-800/50"
              : "bg-white/80 border-gray-200/50 shadow-lg shadow-gray-500/5",
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <span
              className={cx(
                "text-base font-bold",
                isDarkMode ? "text-white" : "text-gray-800",
              )}
            >
              Rating Progress
            </span>
            <span
              className={cx(
                "text-sm font-bold px-4 py-1.5 rounded-full",
                ratingProgress.percentage === 100
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : isDarkMode
                    ? "bg-slate-800 text-slate-400"
                    : "bg-gray-100 text-gray-600",
              )}
            >
              {ratingProgress.rated} / {ratingProgress.total}
            </span>
          </div>
          <div
            className={cx(
              "w-full h-3 rounded-full overflow-hidden",
              isDarkMode ? "bg-slate-800" : "bg-gray-200",
            )}
          >
            <div
              className={cx(
                "h-full rounded-full transition-all duration-700 ease-out",
                ratingProgress.percentage === 100
                  ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                  : "bg-gradient-to-r from-indigo-500 to-violet-500",
              )}
              style={{ width: `${ratingProgress.percentage}%` }}
            />
          </div>
          {ratingProgress.percentage === 100 && (
            <p className="mt-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 size={18} />
              Thank you for rating all topics!
            </p>
          )}
        </div>

        {/* Topic Cards - All 5 dimensions displayed, collapsed by default */}
        <div className="space-y-4">
          {TOPIC_ORDER.map((topic, index) => {
            const topicData = consultationTopics[topic];
            return (
              <TopicCard
                key={topic}
                topicName={topic}
                topicIndex={index}
                aiSummary={topicData?.aiSummary || "Summary not available."}
                extractedSentences={topicData?.extractedSentences || []}
                rating={ratings[topic] || 0}
                onRatingChange={(rating) => handleRatingChange(topic, rating)}
                isExpanded={expandedTopics[topic] || false}
                onToggleExpand={() => handleToggleExpand(topic)}
                showEvidence={showEvidenceStates[topic] || false}
                onToggleEvidence={() => handleToggleEvidence(topic)}
                isDark={isDarkMode}
                patientId={currentSpeaker}
                visitId={visitId}
              />
            );
          })}
        </div>

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
    </div>
  );
};

export default PatientReportFirstVisit;
