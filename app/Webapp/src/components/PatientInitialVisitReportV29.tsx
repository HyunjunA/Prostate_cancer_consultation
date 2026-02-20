"use client";

/**
 * PatientReportFirstVisit.tsx
 *
 * First Visit Patient Dashboard - Single Page Layout
 * Modern & Refined Design
 *
 * Requirements implemented:
 * - Single page layout with all 5 topic summaries
 * - Instructions at top explaining how to use
 * - No overall summary (per protocol)
 * - 5 topic summaries with collapsible/toggle design (ALL CLOSED by default)
 * - Star ratings (1-5) with anchoring guidelines
 * - 'AI Summary' label for clarity
 * - Show/Hide toggle for evidence sentences (7-sentence chunks)
 * - Click tracking for research metrics
 * - Modern, refined color scheme
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
  CheckCircle2,
} from "lucide-react";

/* =============================================================================
   SECTION 1: TRACKING SYSTEM
============================================================================= */

interface TrackingEvent {
  eventType:
    | "proximity_enter"
    | "proximity_exit"
    | "scroll_depth"
    | "dwell_time"
    | "rating_click"
    | "button_click"
    | "section_view"
    | "topic_expand"
    | "topic_collapse"
    | "evidence_expand"
    | "evidence_collapse";
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

  getEvidenceInteractionStats(): {
    topicsExpanded: string[];
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
      ...new Set(expandEvents.map((e) => e.metadata?.topic)),
    ].filter(Boolean);

    return {
      topicsExpanded: topicsExpanded as string[],
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

const STAR_RATING_LABELS: Record<number, string> = {
  1: "Confusing",
  2: "Not helpful",
  3: "Neutral",
  4: "Helpful",
  5: "Very helpful",
};

/* =============================================================================
   SECTION 4: UI COMPONENTS
============================================================================= */

// AI Summary Badge - Modern glassmorphism design
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
      AI Summary
    </span>
  );
};

// Star Rating Component - Modern interactive design
interface StarRatingProps {
  value: number;
  onChange: (v: number) => void;
  isDark?: boolean;
  trackingName?: string;
  disabled?: boolean;
}

const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  isDark,
  trackingName,
  disabled = false,
}) => {
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);

  const displayRating = hoveredStar || value;
  const ratingLabel = displayRating
    ? STAR_RATING_LABELS[displayRating]
    : "Click to rate";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Rate ${i} - ${STAR_RATING_LABELS[i]}`}
            disabled={disabled}
            onMouseEnter={() => setHoveredStar(i)}
            onMouseLeave={() => setHoveredStar(null)}
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
            data-track-proximity={
              trackingName ? `${trackingName}_Star${i}` : undefined
            }
            className={cx(
              "relative w-11 h-11 rounded-xl grid place-items-center transition-all duration-200 text-2xl",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              (hoveredStar !== null ? i <= hoveredStar : value >= i)
                ? "text-amber-400 transform scale-110"
                : isDark
                  ? "text-slate-600 hover:text-slate-500 hover:scale-105"
                  : "text-gray-300 hover:text-gray-400 hover:scale-105",
              !disabled && "active:scale-95",
            )}
          >
            <span className="drop-shadow-sm">★</span>
          </button>
        ))}
      </div>
      <div
        className={cx(
          "px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200",
          displayRating >= 4
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
            : displayRating === 3
              ? "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400"
              : displayRating >= 1
                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                : "bg-gray-50 text-gray-400 dark:bg-slate-800 dark:text-slate-500",
        )}
      >
        {ratingLabel}
      </div>
    </div>
  );
};

// Instructions Box - Modern glass card design
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
                on how helpful it was.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                3
              </span>
              <span>
                Optionally, click <strong>"View supporting evidence"</strong> to
                see original conversation excerpts.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Star Rating Legend - Modern compact pills
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
          Rating Scale:
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

// Topic Card Component - Modern collapsible card
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

          {/* Star Rating Section */}
          <div
            className={cx(
              "flex flex-col items-center py-6 rounded-2xl mb-6 border",
              isDark
                ? "bg-slate-800/40 border-slate-700/30"
                : "bg-gradient-to-r from-amber-50/80 to-orange-50/80 border-amber-200/30",
            )}
          >
            <span
              className={cx(
                "text-sm font-medium mb-4",
                isDark ? "text-slate-400" : "text-gray-500",
              )}
            >
              How helpful was this summary?
            </span>
            <StarRating
              value={rating}
              onChange={onRatingChange}
              isDark={isDark}
              trackingName={`TopicRating_${topicId}`}
            />
          </div>

          {/* Evidence Sentences Toggle */}
          {extractedSentences && extractedSentences.length > 0 && (
            <div>
              <button
                type="button"
                onClick={onToggleEvidence}
                data-track-proximity={`EvidenceToggle_${topicId}`}
                className={cx(
                  "flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
                  isDark
                    ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                    : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm hover:shadow",
                )}
              >
                <FileText size={16} className="opacity-70" />
                <span>
                  {showEvidence ? "Hide" : "View"} supporting evidence
                </span>
                {showEvidence ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>

              {showEvidence && (
                <div
                  data-track-proximity={`EvidenceContent_${topicId}`}
                  className="mt-5 space-y-3"
                >
                  <h4
                    className={cx(
                      "text-xs font-bold uppercase tracking-wider px-1",
                      isDark ? "text-slate-500" : "text-gray-400",
                    )}
                  >
                    Excerpts from your consultation
                  </h4>
                  {extractedSentences.map((sentence, idx) => (
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
                          "{sentence}"
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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

  // ★ ALL TOPICS CLOSED BY DEFAULT (empty object = all false)
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>(
    {},
  );
  const [showEvidenceStates, setShowEvidenceStates] = useState<
    Record<string, boolean>
  >({});
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

          const initialRatings: Record<string, number> = {};

          result.summary?.classes?.forEach((cls: ClassSummary) => {
            const topicName = CLASS_TO_TOPIC_MAP[cls.class_name];
            if (topicName && cls.score !== null) {
              initialRatings[topicName] = cls.score;
            }
          });

          setRatings(initialRatings);
          // ★ All topics closed by default
          setExpandedTopics({});
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
      metadata: { topic },
    });
  };

  const handleToggleEvidence = (topic: string) => {
    const isCurrentlyShown = showEvidenceStates[topic];
    setShowEvidenceStates((prev) => ({ ...prev, [topic]: !prev[topic] }));

    trackingManager.recordEvent({
      eventType: isCurrentlyShown ? "evidence_collapse" : "evidence_expand",
      elementId: `Evidence_${topic.replace(/\s+/g, "")}`,
      timestamp: new Date().toISOString(),
      metadata: {
        topic,
        action: isCurrentlyShown ? "collapse" : "expand",
        summaryRatingAtExpand: ratings[topic] || null,
      },
    });
  };

  // Progress calculation
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
            Loading your summary...
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
            <svg
              className="w-10 h-10 text-white"
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
          <div
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
              <span className="font-semibold">Date:</span> September 4, 2025
            </span>
          </div>
        </div>

        {/* Instructions */}
        <InstructionsBox isDark={isDarkMode} />

        {/* Star Rating Legend */}
        <StarRatingLegend isDark={isDarkMode} />

        {/* Progress Indicator */}
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

        {/* Topic Cards - ★ ALL CLOSED BY DEFAULT */}
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
              />
            );
          })}
        </div>

        {/* Footer */}
        <div
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
            This summary was generated by AI to help you remember your
            consultation.
            <br />
            If you have questions, please contact your healthcare provider.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PatientReportFirstVisit;
