"use client";

/**
 * PatientReport.tsx
 *
 * A comprehensive patient consultation report component with:
 * - Passive engagement tracking (cursor proximity, scroll depth, dwell time)
 * - Topic-based consultation summaries
 * - Shared Decision Making (SDM) questionnaire
 * - Baseline Information demographic survey
 * - Patient feedback questions
 *
 * Structure:
 * 1. Tracking System
 * 2. Types & Interfaces
 * 3. Utility Functions
 * 4. Reusable UI Components
 * 5. Question Components (SDM, Baseline)
 * 6. Main PatientReport Component
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
    | "baseline_answer";
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
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 2.1 Component Props
// ─────────────────────────────────────────────────────────────────────────────

interface PatientReportProps {
  isDarkMode?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.2 SDM Types
// ─────────────────────────────────────────────────────────────────────────────

type YesNoAnswer = "yes" | "no" | null;
type ScaleAnswer = "a_lot" | "some" | "a_little" | "not_at_all" | null;

interface SDMAnswers {
  q1: YesNoAnswer;
  q2: ScaleAnswer;
  q3: ScaleAnswer;
  q4: YesNoAnswer;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.3 Baseline Information Types
// ─────────────────────────────────────────────────────────────────────────────

type SexAtBirthAnswer = "male" | "female" | "prefer_not_to_say" | null;

type EducationAnswer =
  | "eighth_grade_or_less"
  | "some_high_school"
  | "high_school_graduate"
  | "some_college"
  | "associates_degree"
  | "bachelors_degree"
  | "masters_or_above"
  | null;

type MaritalStatusAnswer = "single" | "married" | "widowed" | "divorced" | null;

interface BaselineAnswers {
  sexAtBirth: SexAtBirthAnswer;
  race: string[];
  education: EducationAnswer;
  maritalStatus: MaritalStatusAnswer;
  employment: string[];
  employmentOther: string;
}

/* =============================================================================
   SECTION 3: UTILITY FUNCTIONS
============================================================================= */

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/* =============================================================================
   SECTION 4: REUSABLE UI COMPONENTS
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 4.1 StarRating Component
// ─────────────────────────────────────────────────────────────────────────────

interface StarRatingProps {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  isDark?: boolean;
  trackingName?: string;
}

const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  label,
  isDark,
  trackingName,
}) => {
  return (
    <div className="flex items-center gap-3">
      {label && (
        <span
          className={cx(
            "text-sm font-medium",
            isDark ? "text-slate-300" : "text-gray-700"
          )}
        >
          {label}
        </span>
      )}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Rate ${i}`}
            onClick={() => {
              onChange(i);
              trackingManager.recordEvent({
                eventType: "rating_click",
                elementId: trackingName || "unknown",
                timestamp: new Date().toISOString(),
                metadata: { rating: i, starNumber: i },
              });
            }}
            data-track-proximity={
              trackingName ? `${trackingName}_Star${i}` : undefined
            }
            className={cx(
              "w-8 h-8 rounded-full grid place-items-center border transition",
              isDark
                ? "border-slate-700 hover:bg-slate-800"
                : "border-gray-300 hover:bg-gray-100",
              value >= i
                ? isDark
                  ? "bg-blue-700 text-blue-100"
                  : "bg-blue-600 text-white"
                : isDark
                ? "text-slate-400"
                : "text-gray-500"
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
// 4.2 SectionHeader Component
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
    <div className="mb-8">
      <div className="flex items-center mb-3">
        <div
          className={cx(
            "flex items-center justify-center w-14 h-14 rounded-full mr-4",
            iconBgColor,
            iconBorderColor
          )}
        >
          {icon}
        </div>
        <h3
          className={cx(
            "text-2xl font-semibold tracking-wide",
            isDark ? "text-slate-100" : "text-gray-900"
          )}
        >
          {title}
        </h3>
      </div>
      {description && (
        <p
          className={cx(
            "text-base mb-6",
            isDark ? "text-slate-300" : "text-gray-600"
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4.3 SubmitButton Component
// ─────────────────────────────────────────────────────────────────────────────

interface SubmitButtonProps {
  onClick: () => void;
  label: string;
  trackingName: string;
  colorScheme: "green" | "purple" | "amber" | "blue";
  isDark?: boolean;
}

const SubmitButton: React.FC<SubmitButtonProps> = ({
  onClick,
  label,
  trackingName,
  colorScheme,
  isDark,
}) => {
  const colorClasses = {
    green: isDark
      ? "bg-green-700 text-green-100 hover:bg-green-600"
      : "bg-green-600 text-white hover:bg-green-700",
    purple: isDark
      ? "bg-purple-700 text-purple-100 hover:bg-purple-600"
      : "bg-purple-600 text-white hover:bg-purple-700",
    amber: isDark
      ? "bg-amber-700 text-amber-100 hover:bg-amber-600"
      : "bg-amber-600 text-white hover:bg-amber-700",
    blue: isDark
      ? "bg-blue-700 text-blue-100 hover:bg-blue-600"
      : "bg-blue-600 text-white hover:bg-blue-700",
  };

  return (
    <div className="mt-10 flex justify-center">
      <button
        onClick={onClick}
        data-track-proximity={trackingName}
        className={cx(
          "px-8 py-4 rounded-lg text-lg font-semibold transition-all shadow-lg hover:shadow-xl",
          colorClasses[colorScheme]
        )}
      >
        {label}
      </button>
    </div>
  );
};

/* =============================================================================
   SECTION 5: QUESTION COMPONENTS
============================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// 5.1 SDM Components
// ─────────────────────────────────────────────────────────────────────────────

interface YesNoQuestionProps {
  questionNumber: number;
  questionText: string;
  value: YesNoAnswer;
  onChange: (value: YesNoAnswer) => void;
  isDark?: boolean;
  trackingName: string;
}

const YesNoQuestion: React.FC<YesNoQuestionProps> = ({
  questionNumber,
  questionText,
  value,
  onChange,
  isDark,
  trackingName,
}) => {
  const handleChange = (answer: YesNoAnswer) => {
    onChange(answer);
    trackingManager.recordEvent({
      eventType: "sdm_answer",
      elementId: trackingName,
      timestamp: new Date().toISOString(),
      metadata: { questionNumber, answer, questionType: "yes_no" },
    });
  };

  return (
    <div
      data-track-proximity={trackingName}
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark
          ? "bg-slate-800 border-slate-700 hover:border-purple-600"
          : "bg-white border-gray-200 hover:border-purple-400"
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cx(
            "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0",
            isDark
              ? "bg-purple-900 text-purple-300 border border-purple-700"
              : "bg-purple-100 text-purple-700 border border-purple-200"
          )}
        >
          {questionNumber}
        </span>
        <div className="flex-1">
          <p
            className={cx(
              "text-base font-medium mb-4",
              isDark ? "text-slate-200" : "text-gray-800"
            )}
          >
            {questionText}
          </p>
          <div className="flex gap-6">
            {[
              { value: "yes" as const, label: "Yes" },
              { value: "no" as const, label: "No" },
            ].map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <div
                  className={cx(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                    value === option.value
                      ? isDark
                        ? "border-purple-500 bg-purple-600"
                        : "border-purple-600 bg-purple-600"
                      : isDark
                      ? "border-slate-500 group-hover:border-purple-400"
                      : "border-gray-400 group-hover:border-purple-500"
                  )}
                  onClick={() => handleChange(option.value)}
                >
                  {value === option.value && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <span
                  className={cx(
                    "text-sm font-medium",
                    isDark ? "text-slate-300" : "text-gray-700"
                  )}
                >
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ScaleQuestionProps {
  questionNumber: number;
  questionText: string;
  value: ScaleAnswer;
  onChange: (value: ScaleAnswer) => void;
  isDark?: boolean;
  trackingName: string;
}

const ScaleQuestion: React.FC<ScaleQuestionProps> = ({
  questionNumber,
  questionText,
  value,
  onChange,
  isDark,
  trackingName,
}) => {
  const options: { value: ScaleAnswer; label: string }[] = [
    { value: "a_lot", label: "A lot" },
    { value: "some", label: "Some" },
    { value: "a_little", label: "A little" },
    { value: "not_at_all", label: "Not at all" },
  ];

  const handleChange = (answer: ScaleAnswer) => {
    onChange(answer);
    trackingManager.recordEvent({
      eventType: "sdm_answer",
      elementId: trackingName,
      timestamp: new Date().toISOString(),
      metadata: { questionNumber, answer, questionType: "scale" },
    });
  };

  return (
    <div
      data-track-proximity={trackingName}
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark
          ? "bg-slate-800 border-slate-700 hover:border-purple-600"
          : "bg-white border-gray-200 hover:border-purple-400"
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cx(
            "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0",
            isDark
              ? "bg-purple-900 text-purple-300 border border-purple-700"
              : "bg-purple-100 text-purple-700 border border-purple-200"
          )}
        >
          {questionNumber}
        </span>
        <div className="flex-1">
          <p
            className={cx(
              "text-base font-medium mb-4",
              isDark ? "text-slate-200" : "text-gray-800"
            )}
          >
            {questionText}
          </p>
          <div className="flex flex-wrap gap-4">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <div
                  className={cx(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                    value === option.value
                      ? isDark
                        ? "border-purple-500 bg-purple-600"
                        : "border-purple-600 bg-purple-600"
                      : isDark
                      ? "border-slate-500 group-hover:border-purple-400"
                      : "border-gray-400 group-hover:border-purple-500"
                  )}
                  onClick={() => handleChange(option.value)}
                >
                  {value === option.value && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <span
                  className={cx(
                    "text-sm font-medium",
                    isDark ? "text-slate-300" : "text-gray-700"
                  )}
                >
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.2 Baseline Information Components
// ─────────────────────────────────────────────────────────────────────────────

interface BaselineRadioGroupProps {
  questionText: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
  isDark?: boolean;
  trackingName: string;
}

const BaselineRadioGroup: React.FC<BaselineRadioGroupProps> = ({
  questionText,
  options,
  value,
  onChange,
  isDark,
  trackingName,
}) => {
  const handleChange = (answer: string) => {
    onChange(answer);
    trackingManager.recordEvent({
      eventType: "baseline_answer",
      elementId: trackingName,
      timestamp: new Date().toISOString(),
      metadata: { answer, questionType: "radio" },
    });
  };

  return (
    <div
      data-track-proximity={trackingName}
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark
          ? "bg-slate-800 border-slate-700 hover:border-amber-600"
          : "bg-white border-gray-200 hover:border-amber-400"
      )}
    >
      <p
        className={cx(
          "text-base font-medium mb-4",
          isDark ? "text-slate-200" : "text-gray-800"
        )}
      >
        {questionText}
      </p>
      <div className="flex flex-wrap gap-4">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div
              className={cx(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                value === option.value
                  ? isDark
                    ? "border-amber-500 bg-amber-600"
                    : "border-amber-600 bg-amber-600"
                  : isDark
                  ? "border-slate-500 group-hover:border-amber-400"
                  : "border-gray-400 group-hover:border-amber-500"
              )}
              onClick={() => handleChange(option.value)}
            >
              {value === option.value && (
                <div className="w-2 h-2 rounded-full bg-white" />
              )}
            </div>
            <span
              className={cx(
                "text-sm",
                isDark ? "text-slate-300" : "text-gray-700"
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

interface BaselineCheckboxGroupProps {
  questionText: string;
  options: { value: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
  isDark?: boolean;
  trackingName: string;
}

const BaselineCheckboxGroup: React.FC<BaselineCheckboxGroupProps> = ({
  questionText,
  options,
  values,
  onChange,
  isDark,
  trackingName,
}) => {
  const handleToggle = (optionValue: string) => {
    const newValues = values.includes(optionValue)
      ? values.filter((v) => v !== optionValue)
      : [...values, optionValue];
    onChange(newValues);
    trackingManager.recordEvent({
      eventType: "baseline_answer",
      elementId: trackingName,
      timestamp: new Date().toISOString(),
      metadata: { selectedValues: newValues, questionType: "checkbox" },
    });
  };

  return (
    <div
      data-track-proximity={trackingName}
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark
          ? "bg-slate-800 border-slate-700 hover:border-amber-600"
          : "bg-white border-gray-200 hover:border-amber-400"
      )}
    >
      <p
        className={cx(
          "text-base font-medium mb-4",
          isDark ? "text-slate-200" : "text-gray-800"
        )}
      >
        {questionText}
      </p>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div
              className={cx(
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                values.includes(option.value)
                  ? isDark
                    ? "border-amber-500 bg-amber-600"
                    : "border-amber-600 bg-amber-600"
                  : isDark
                  ? "border-slate-500 group-hover:border-amber-400"
                  : "border-gray-400 group-hover:border-amber-500"
              )}
              onClick={() => handleToggle(option.value)}
            >
              {values.includes(option.value) && (
                <svg
                  className="w-3 h-3 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
            <span
              className={cx(
                "text-sm",
                isDark ? "text-slate-300" : "text-gray-700"
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

interface BaselineTextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isDark?: boolean;
}

const BaselineTextInput: React.FC<BaselineTextInputProps> = ({
  label,
  value,
  onChange,
  placeholder = "Please specify...",
  isDark,
}) => {
  return (
    <div
      className={cx(
        "p-6 rounded-xl border transition-all",
        isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
      )}
    >
      <label
        className={cx(
          "block text-base font-medium mb-3",
          isDark ? "text-slate-200" : "text-gray-800"
        )}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(
          "w-full px-4 py-3 rounded-lg border transition-colors",
          isDark
            ? "bg-slate-900 border-slate-600 text-slate-200 placeholder-slate-500 focus:border-amber-500"
            : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500"
        )}
      />
    </div>
  );
};

/* =============================================================================
   SECTION 6: QUESTION DATA CONSTANTS
============================================================================= */

const SDM_QUESTIONS = [
  {
    id: "q1",
    type: "yesno" as const,
    text: "Did the health care provider explain there were choices in what you could do to treat your condition? OR Did the health care provider talk about [intervention] as an option for you?",
  },
  {
    id: "q2",
    type: "scale" as const,
    text: "How much did you and the health care provider talk about the reasons you might want to have [intervention]?",
  },
  {
    id: "q3",
    type: "scale" as const,
    text: "How much did you and the health care provider talk about the reasons you might not want to have [intervention]?",
  },
  {
    id: "q4",
    type: "yesno" as const,
    text: "Did the health care provider ask you whether or not you wanted to have [intervention]?",
  },
];

const BASELINE_OPTIONS = {
  sexAtBirth: [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "prefer_not_to_say", label: "Prefer not to say" },
  ],
  race: [
    { value: "american_indian", label: "American Indian or Alaska Native" },
    { value: "asian", label: "Asian" },
    { value: "black", label: "Black or African American" },
    {
      value: "pacific_islander",
      label: "Native Hawaiian or Other Pacific Islander",
    },
    { value: "white", label: "White" },
    { value: "unknown", label: "Unknown or Not Reported" },
    { value: "prefer_not_to_answer", label: "Prefer not to answer" },
  ],
  education: [
    { value: "eighth_grade_or_less", label: "Eighth grade or less" },
    { value: "some_high_school", label: "Completed some high school" },
    {
      value: "high_school_graduate",
      label: "High school graduate (includes equivalency)",
    },
    { value: "some_college", label: "Some college, no degree" },
    { value: "associates_degree", label: "Associate's degree" },
    { value: "bachelors_degree", label: "Bachelor's degree" },
    {
      value: "masters_or_above",
      label: "Master's degree or other advanced degree",
    },
  ],
  maritalStatus: [
    { value: "single", label: "Single, never married" },
    {
      value: "married",
      label: "Married, domestic partnership, or long-term relationship",
    },
    { value: "widowed", label: "Widowed" },
    { value: "divorced", label: "Divorced or separated" },
  ],
  employment: [
    { value: "unemployed", label: "Unemployed" },
    { value: "homemaker", label: "Homemaker" },
    {
      value: "full_time",
      label: "Full-time employment or full-time student (40+ hrs/week)",
    },
    {
      value: "part_time",
      label: "Part-time employment or part-time student (<40 hrs/week)",
    },
    { value: "retired", label: "Retired" },
    { value: "unable_to_work", label: "Unable to work or on disability" },
    { value: "leave_of_absence", label: "On leave of absence from work" },
    { value: "military", label: "Military" },
    { value: "other", label: "Other" },
  ],
};

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
   SECTION 7: SAMPLE DATA GENERATOR
============================================================================= */

const generateSamplePatientData = () => {
  return {
    patientName: "Patient A",
    patientId: "P001",
    consultationDate: "September 4, 2025",
    physicianName: "Dr. Smith",
    overallSummary:
      "You have an intermediate-risk prostate cancer, on the higher end of the scale. Although the 15-year mortality risk (about 12%) is relatively low, your young age and long life expectancy make active treatment advisable. Surgery offers strong local control and future treatment options if needed. There is a 40–50% chance of recovering baseline erectile function, though recovery may take time and supportive therapies are available. Most patients regain bladder control within a year, and only a few require further procedures. Since you currently have minimal urinary symptoms, surgery may help avoid bladder irritation that can occur with radiation. Overall, proactive treatment provides the best long-term outlook.",
    consultationTopics: {
      "Cancer Prognosis": {
        extractedSentences: [
          "So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things",
          "but it's a little bit too high for doctors, so 1 in 10 chance",
          "actually 1.2 in 10 chance of dying of prostate cancer is too much",
          "We would treat with surgery or radiation",
          "For the majority of these unfavorable risks, I do recommend treatment",
        ],
        aiSummary:
          "Based on your situation, you have a tumor that is considered intermediate-risk, on the higher end. Given your young age, surgery offers good local control and options for future therapy if needed. While the long-term risk is not negligible, planning for the long term helps ensure the best outcomes.",
      },
      "Life Expectancy": {
        extractedSentences: [
          "like i said, you've got 40 years ahead of you",
          "so that's a good thing for a patient who has a lot of years ahead of them",
          "but for a person like you who is young and has, you know, you know, you've got 40 years ahead of you",
          "but for you, having many years ahead of you, you have an intermediate-risk tumor that's kind of on the high end of the intermediate-risk scale",
          "but personally, i think, you know, you're a young man, you've got a ton of years ahead of you, surgery gives you good local control, and it gives you the options for salvage therapy if you need it in the future",
        ],
        aiSummary:
          "Your care team emphasized that you have many productive years ahead. This influences planning: there is enough time for cancer to progress if untreated, but also strong capacity to benefit from treatment and recovery.",
      },
      "Erectile Dysfunction": {
        extractedSentences: [
          "For erectile function, again, I quoted you a 40-50% chance",
          "of getting to your baseline function",
          "Surgery gives you good local control",
          "Recovery may take time",
          "There are various treatment options available",
        ],
        aiSummary:
          "There is an estimated 40–50% chance of maintaining baseline erectile function. Recovery is gradual, and supportive options are available to help along the way.",
      },
      "Urinary Incontinence": {
        extractedSentences: [
          "But by a year 90% of men will not need a pad beyond a year",
          "and only 5% of men would need potentially a surgery",
          "to correct a lot of leakage",
          "Temporary incontinence may occur",
          "Most patients improve over time",
        ],
        aiSummary:
          "Most patients recover bladder control within a year. A small minority need additional procedures; your team will monitor and support recovery.",
      },
      "Irritative Urinary Symptoms": {
        extractedSentences: [
          "You don't really have many urinary symptoms now",
          "no urgency, frequency, but those symptoms get worse after radiation",
          "because the beam hits the bladder and makes the bladder irritable",
          "Surgery may have fewer such symptoms",
          "Most symptoms improve over time",
        ],
        aiSummary:
          "You have few urinary symptoms now. Radiation can temporarily irritate the bladder; surgical approaches often have fewer irritative symptoms. Any changes typically improve with healing.",
      },
    },
  };
};

/* =============================================================================
   SECTION 8: MAIN COMPONENT
============================================================================= */

const PatientReport: React.FC<PatientReportProps> = ({
  isDarkMode = false,
}) => {
  // ─────────────────────────────────────────────────────────────────────────
  // 8.1 Hooks & API Calls
  // ─────────────────────────────────────────────────────────────────────────

  const {
    fetchFiles: fetchPatientFiles,
    fetchSummariesAll,
    fetchSummariesFiltered,
    fetchSummaryDetail,
    fetchScoringAll,
    fetchScoringFiltered,
    fetchResponsesAll,
    fetchResponsesFiltered,
  } = usePatientData();

  useEffect(() => {
    fetchScoringAll();
    fetchResponsesAll();
  }, []);

  useEffect(() => {
    fetchScoringFiltered(
      "quality-coded-nlp-pilot-sid-1.xlsx",
      "Patient_quality-coded-nlp-pilot-sid-1"
    );
    fetchResponsesFiltered(
      "quality-coded-nlp-pilot-sid-1.xlsx",
      "Patient_quality-coded-nlp-pilot-sid-1"
    );
  }, []);

  // Initialize passive tracking
  usePassiveTracking({
    proximity: { threshold: 150, debounceMs: 100 },
    scrollDepth: { thresholds: [25, 50, 75, 100], debounceMs: 200 },
    dwellTime: { minDwellTime: 2000, trackingInterval: 500 },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8.2 State Management
  // ─────────────────────────────────────────────────────────────────────────

  const [patientData, setPatientData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // ─────────────────────────────────────────────────────────────────────────
  // 8.3 Event Handlers
  // ─────────────────────────────────────────────────────────────────────────

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

  const handleSubmitQuestions = () => {
    console.log("📝 [Patient Questions Submitted]", questionAnswers);
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
  };

  const handleSDMAnswerChange = (
    questionId: keyof SDMAnswers,
    value: YesNoAnswer | ScaleAnswer
  ) => {
    setSdmAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmitSDM = () => {
    console.log("📋 [SDM Responses Submitted]", sdmAnswers);
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
    alert(
      "Thank you! Your Shared Decision Making responses have been recorded."
    );
  };

  const handleBaselineChange = (field: keyof BaselineAnswers, value: any) => {
    setBaselineAnswers((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitBaseline = () => {
    console.log("📋 [Baseline Information Submitted]", baselineAnswers);
    trackingManager.recordEvent({
      eventType: "button_click",
      elementId: "Baseline_Submit_Button",
      timestamp: new Date().toISOString(),
      metadata: { answers: baselineAnswers },
    });
    alert("Thank you! Your baseline information has been recorded.");
  };

  const toggleKeyVisibility = (topic: string) =>
    setShowKeys((s) => ({ ...s, [topic]: !s[topic] }));

  const setTopicRating = (topic: string, v: number) =>
    setRatings((r) => ({ ...r, [topic]: v }));

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
  // 8.4 Data Loading
  // ─────────────────────────────────────────────────────────────────────────

  const loadPatientData = async () => {
    try {
      setLoading(true);
      try {
        const response = await (window as any).fs.readFile(
          "nlpextractedsentences_subset.xlsx"
        );
        const workbook = XLSX.read(response, {
          cellStyles: true,
          cellFormulas: true,
          cellDates: true,
          cellNF: true,
          sheetStubs: true,
        });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        setPatientData(generateSamplePatientData());
      } catch (fileError) {
        console.log("Excel file not found. Using sample data.");
        setPatientData(generateSamplePatientData());
      }
    } catch (err: any) {
      setError("Error loading consultation data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatientData();

    // Print styles
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
  // 8.5 Derived State
  // ─────────────────────────────────────────────────────────────────────────

  const topicKeys: string[] = useMemo(
    () => (patientData ? Object.keys(patientData.consultationTopics) : []),
    [patientData]
  );

  const currentTopicData = activeTab
    ? patientData?.consultationTopics?.[activeTab]
    : null;

  const isQuestionsTab = activeTab === "Patient Questions";
  const isSDMTab = activeTab === "Shared Decision Making (SDM)";
  const isBaselineTab = activeTab === "Baseline Information";

  // ─────────────────────────────────────────────────────────────────────────
  // 8.6 Loading & Error States
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
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
              "animate-spin rounded-full h-12 w-12 border-b-2 mb-4 mx-auto",
              isDarkMode ? "border-blue-400" : "border-blue-600"
            )}
          />
          <div
            className={cx(
              "text-lg font-medium",
              isDarkMode ? "text-slate-300" : "text-gray-700"
            )}
          >
            Loading consultation summary...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cx(
          "min-h-screen flex items-center justify-center p-8",
          isDarkMode ? "bg-slate-950" : "bg-gray-50"
        )}
      >
        <div
          className={cx(
            "max-w-md w-full p-8 rounded-xl shadow-2xl",
            isDarkMode
              ? "bg-red-950 border border-red-800"
              : "bg-white border border-red-200"
          )}
        >
          <div className="text-center">
            <div
              className={cx(
                "w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center",
                isDarkMode ? "bg-red-900" : "bg-red-100"
              )}
            >
              <svg
                className={cx(
                  "w-8 h-8",
                  isDarkMode ? "text-red-400" : "text-red-600"
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
                "text-xl font-semibold mb-2",
                isDarkMode ? "text-red-100" : "text-red-900"
              )}
            >
              Unable to Load Report
            </h2>
            <p
              className={cx(
                "mb-6 text-sm",
                isDarkMode ? "text-red-200" : "text-red-700"
              )}
            >
              {error}
            </p>
            <button
              onClick={loadPatientData}
              className={cx(
                "px-6 py-2 rounded-lg text-sm font-medium transition-colors",
                isDarkMode
                  ? "bg-red-800 text-red-100 hover:bg-red-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              )}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!patientData) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // 8.7 Main Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cx("min-h-screen", isDarkMode ? "bg-slate-950" : "bg-gray-50")}
    >
      <div className="max-w-6xl mx-auto" id="report-content">
        {/* ═══════════════════════════════════════════════════════════════════
            HEADER SECTION
        ═══════════════════════════════════════════════════════════════════ */}
        <div
          className={cx(
            isDarkMode
              ? "bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700"
              : "bg-gradient-to-r from-white to-gray-50 border-b border-gray-200",
            "shadow-lg"
          )}
        >
          <div className="px-12 py-10">
            <div className="text-center">
              {/* Logo Icon */}
              <div
                className={cx(
                  "inline-flex items-center justify-center w-16 h-16 rounded-full mb-6",
                  isDarkMode
                    ? "bg-blue-900 border-2 border-blue-700"
                    : "bg-blue-100 border-2 border-blue-300"
                )}
              >
                <svg
                  className={cx(
                    "w-8 h-8",
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
                  "text-4xl font-light mb-3 tracking-wide",
                  isDarkMode ? "text-slate-100" : "text-gray-900"
                )}
              >
                PATIENT CONSULTATION REPORT
              </h1>
              <div
                className={cx(
                  "text-sm font-medium tracking-wider uppercase mb-8",
                  isDarkMode ? "text-slate-400" : "text-gray-500"
                )}
              >
                Prostate Cancer Treatment Discussion Summary
              </div>

              {/* Print Button */}
              <div className="mb-8 no-print">
                <button
                  onClick={handleDownloadPdf}
                  data-track-proximity="PDFDownload_Button"
                  className={cx(
                    "inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                    isDarkMode
                      ? "bg-blue-700 text-blue-100 hover:bg-blue-600 shadow-lg hover:shadow-xl"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl"
                  )}
                >
                  <svg
                    className="w-5 h-5"
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

              {/* View Mode Toggle */}
              <div className="mb-8 no-print">
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
                      "px-6 py-2 text-sm font-medium rounded-md transition-colors",
                      viewMode === "topics"
                        ? isDarkMode
                          ? "bg-blue-700 text-blue-100"
                          : "bg-blue-600 text-white"
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
                      "px-6 py-2 text-sm font-medium rounded-md transition-colors",
                      viewMode === "full"
                        ? isDarkMode
                          ? "bg-blue-700 text-blue-100"
                          : "bg-blue-600 text-white"
                        : isDarkMode
                        ? "text-slate-400 hover:text-slate-200"
                        : "text-gray-600 hover:text-gray-800"
                    )}
                  >
                    Full Report
                  </button>
                </div>
                <div
                  className={cx(
                    "text-xs mt-2 text-center",
                    isDarkMode ? "text-slate-500" : "text-gray-500"
                  )}
                >
                  {viewMode === "topics"
                    ? "Start with the overall summary, then explore topics."
                    : "View all topics continuously."}
                </div>
              </div>

              {/* Patient Info */}
              <div
                className={cx(
                  "grid grid-cols-1 md:grid-cols-3 gap-6 text-center",
                  isDarkMode ? "text-slate-200" : "text-gray-700"
                )}
              >
                <div>
                  <div
                    className={cx(
                      "text-xs font-semibold uppercase tracking-wider mb-1",
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    )}
                  >
                    Patient
                  </div>
                  <div className="text-lg font-medium">
                    {patientData.patientName}
                  </div>
                  <div
                    className={cx(
                      "text-sm",
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    )}
                  >
                    ID: {patientData.patientId}
                  </div>
                </div>
                <div>
                  <div
                    className={cx(
                      "text-xs font-semibold uppercase tracking-wider mb-1",
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    )}
                  >
                    Consultation Date
                  </div>
                  <div className="text-lg font-medium">
                    {patientData.consultationDate}
                  </div>
                </div>
                <div>
                  <div
                    className={cx(
                      "text-xs font-semibold uppercase tracking-wider mb-1",
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    )}
                  >
                    Attending Physician
                  </div>
                  <div className="text-lg font-medium">
                    {patientData.physicianName}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            BODY SECTION - TOPICS MODE
        ═══════════════════════════════════════════════════════════════════ */}
        {viewMode === "topics" ? (
          <div
            className={cx(
              isDarkMode ? "bg-slate-900" : "bg-white",
              "shadow-xl min-h-screen"
            )}
          >
            <div className="px-6 lg:px-12 py-12 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-10">
              {/* Main Content Column */}
              <div>
                {/* Overall Summary - Landing */}
                {activeTab === null && (
                  <section
                    data-track-proximity="OverallSummary_Card"
                    className={cx(
                      "p-8 rounded-xl mb-10",
                      isDarkMode
                        ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                        : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <h2
                        className={cx(
                          "text-2xl font-semibold",
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
                        label="Was this helpful?"
                        isDark={isDarkMode}
                        trackingName="OverallSummary_Rating"
                      />
                    </div>
                    <p
                      className={cx(
                        "text-lg leading-relaxed",
                        isDarkMode ? "text-slate-300" : "text-gray-700"
                      )}
                    >
                      {patientData.overallSummary}
                    </p>
                  </section>
                )}

                {/* Baseline Information Section */}
                {isBaselineTab && (
                  <section data-track-proximity="Baseline_Section">
                    <SectionHeader
                      title="Baseline Information"
                      description="According to Cedars-Sinai Medical Center policy, we are required to collect additional demographic information for research purposes."
                      icon={
                        <svg
                          className={cx(
                            "w-8 h-8",
                            isDarkMode ? "text-amber-300" : "text-amber-700"
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
                      iconBgColor={isDarkMode ? "bg-amber-900" : "bg-amber-100"}
                      iconBorderColor={
                        isDarkMode
                          ? "border-2 border-amber-700"
                          : "border-2 border-amber-300"
                      }
                      isDark={isDarkMode}
                    />

                    <div className="space-y-6">
                      <BaselineRadioGroup
                        questionText="What is your assigned sex at birth?"
                        options={BASELINE_OPTIONS.sexAtBirth}
                        value={baselineAnswers.sexAtBirth}
                        onChange={(v) => handleBaselineChange("sexAtBirth", v)}
                        isDark={isDarkMode}
                        trackingName="Baseline_SexAtBirth"
                      />

                      <BaselineCheckboxGroup
                        questionText="What is your Race? (select all that apply)"
                        options={BASELINE_OPTIONS.race}
                        values={baselineAnswers.race}
                        onChange={(v) => handleBaselineChange("race", v)}
                        isDark={isDarkMode}
                        trackingName="Baseline_Race"
                      />

                      <BaselineRadioGroup
                        questionText="What is the highest degree or level of education you have completed?"
                        options={BASELINE_OPTIONS.education}
                        value={baselineAnswers.education}
                        onChange={(v) => handleBaselineChange("education", v)}
                        isDark={isDarkMode}
                        trackingName="Baseline_Education"
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
                      />

                      <BaselineCheckboxGroup
                        questionText="What is your employment status? (select all that apply)"
                        options={BASELINE_OPTIONS.employment}
                        values={baselineAnswers.employment}
                        onChange={(v) => handleBaselineChange("employment", v)}
                        isDark={isDarkMode}
                        trackingName="Baseline_Employment"
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
                      colorScheme="amber"
                      isDark={isDarkMode}
                    />
                  </section>
                )}

                {/* SDM Section */}
                {isSDMTab && (
                  <section data-track-proximity="SDM_Section">
                    <SectionHeader
                      title="Shared Decision Making (SDM)"
                      description="Please answer the following questions about your experience with shared decision making during your consultation."
                      icon={
                        <svg
                          className={cx(
                            "w-8 h-8",
                            isDarkMode ? "text-purple-300" : "text-purple-700"
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
                      iconBgColor={
                        isDarkMode ? "bg-purple-900" : "bg-purple-100"
                      }
                      iconBorderColor={
                        isDarkMode
                          ? "border-2 border-purple-700"
                          : "border-2 border-purple-300"
                      }
                      isDark={isDarkMode}
                    />

                    <div className="space-y-6">
                      <YesNoQuestion
                        questionNumber={1}
                        questionText={SDM_QUESTIONS[0].text}
                        value={sdmAnswers.q1}
                        onChange={(v) => handleSDMAnswerChange("q1", v)}
                        isDark={isDarkMode}
                        trackingName="SDM_Q1"
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
                      />
                      <YesNoQuestion
                        questionNumber={4}
                        questionText={SDM_QUESTIONS[3].text}
                        value={sdmAnswers.q4}
                        onChange={(v) => handleSDMAnswerChange("q4", v)}
                        isDark={isDarkMode}
                        trackingName="SDM_Q4"
                      />
                    </div>

                    <SubmitButton
                      onClick={handleSubmitSDM}
                      label="Submit SDM Responses"
                      trackingName="SDM_Submit_Button"
                      colorScheme="purple"
                      isDark={isDarkMode}
                    />
                  </section>
                )}

                {/* Patient Questions Section */}
                {isQuestionsTab && (
                  <section data-track-proximity="PatientQuestions_Section">
                    <SectionHeader
                      title="Questions for You"
                      description="We'd love to hear from you. Please take a moment to answer these questions to help us better understand your needs."
                      icon={
                        <svg
                          className={cx(
                            "w-8 h-8",
                            isDarkMode ? "text-green-300" : "text-green-700"
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
                      iconBgColor={isDarkMode ? "bg-green-900" : "bg-green-100"}
                      iconBorderColor={
                        isDarkMode
                          ? "border-2 border-green-700"
                          : "border-2 border-green-300"
                      }
                      isDark={isDarkMode}
                    />

                    <div className="space-y-6">
                      {PATIENT_QUESTIONS.map((question, index) => (
                        <div
                          key={index}
                          data-track-proximity={`Question_${index + 1}_Input`}
                          className={cx(
                            "p-6 rounded-xl border transition-all",
                            isDarkMode
                              ? "bg-slate-800 border-slate-700 hover:border-green-600"
                              : "bg-white border-gray-200 hover:border-green-400"
                          )}
                        >
                          <label
                            className={cx(
                              "block text-base font-medium mb-3",
                              isDarkMode ? "text-slate-200" : "text-gray-800"
                            )}
                          >
                            <span
                              className={cx(
                                "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mr-2",
                                isDarkMode
                                  ? "bg-green-900 text-green-300 border border-green-700"
                                  : "bg-green-100 text-green-700 border border-green-200"
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
                            rows={3}
                            className={cx(
                              "w-full px-4 py-3 rounded-lg border transition-colors resize-none",
                              isDarkMode
                                ? "bg-slate-900 border-slate-600 text-slate-200 placeholder-slate-500 focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                                : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                            )}
                          />
                        </div>
                      ))}
                    </div>

                    <SubmitButton
                      onClick={handleSubmitQuestions}
                      label="Submit Your Responses"
                      trackingName="Questions_Submit_Button"
                      colorScheme="green"
                      isDark={isDarkMode}
                    />
                  </section>
                )}

                {/* Topic Detail Section */}
                {activeTab !== null &&
                  !isQuestionsTab &&
                  !isSDMTab &&
                  !isBaselineTab && (
                    <section>
                      <div className="mb-8">
                        <div className="flex items-center mb-3">
                          <div
                            className={cx(
                              "flex items-center justify-center w-14 h-14 rounded-full mr-4",
                              isDarkMode
                                ? "bg-blue-900 border-2 border-blue-700"
                                : "bg-blue-100 border-2 border-blue-300"
                            )}
                          >
                            <span
                              className={cx(
                                "text-xl font-bold",
                                isDarkMode ? "text-blue-300" : "text-blue-700"
                              )}
                            >
                              {topicKeys.indexOf(activeTab) + 1 || 1}
                            </span>
                          </div>
                          <h3
                            className={cx(
                              "text-2xl font-semibold tracking-wide",
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
                          "p-8 rounded-xl mb-6",
                          isDarkMode
                            ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                            : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4 mb-6">
                          <h4
                            className={cx(
                              "text-xl font-semibold",
                              isDarkMode ? "text-slate-200" : "text-gray-800"
                            )}
                          >
                            Summary for {activeTab}
                          </h4>
                          <StarRating
                            value={ratings[activeTab] || 0}
                            onChange={(v) => setTopicRating(activeTab, v)}
                            label="Rate clarity"
                            isDark={isDarkMode}
                            trackingName={`TopicRating_${activeTab?.replace(
                              /\s+/g,
                              ""
                            )}`}
                          />
                        </div>
                        <p
                          className={cx(
                            "text-lg leading-relaxed",
                            isDarkMode ? "text-slate-300" : "text-gray-700"
                          )}
                        >
                          {currentTopicData?.aiSummary}
                        </p>
                      </div>

                      <div className="mb-8">
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility(activeTab)}
                          data-track-proximity={`ToggleKeyStatements_${activeTab?.replace(
                            /\s+/g,
                            ""
                          )}`}
                          className={cx(
                            "px-4 py-2 rounded-lg text-sm font-medium mb-4",
                            isDarkMode
                              ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
                                "text-lg font-semibold mb-5",
                                isDarkMode ? "text-slate-200" : "text-gray-800"
                              )}
                            >
                              Key Statements from Consultation
                            </h4>
                            <div className="space-y-3">
                              {currentTopicData?.extractedSentences?.map(
                                (sentence: string, idx: number) => (
                                  <div
                                    key={idx}
                                    className={cx(
                                      "group relative p-4 rounded-lg transition-all duration-200",
                                      isDarkMode
                                        ? "bg-slate-800 border border-slate-700 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-900/20"
                                        : "bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md"
                                    )}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div
                                        className={cx(
                                          "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                                          isDarkMode
                                            ? "bg-blue-900 text-blue-300 border border-blue-700"
                                            : "bg-blue-100 text-blue-700 border border-blue-200"
                                        )}
                                      >
                                        {idx + 1}
                                      </div>
                                      <div
                                        className={cx(
                                          "flex-shrink-0 text-2xl leading-none mt-1 opacity-40",
                                          isDarkMode
                                            ? "text-blue-400"
                                            : "text-blue-500"
                                        )}
                                      >
                                        &quot;
                                      </div>
                                      <p
                                        className={cx(
                                          "flex-1 text-base leading-relaxed",
                                          isDarkMode
                                            ? "text-slate-300"
                                            : "text-gray-700"
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
                    </section>
                  )}
              </div>

              {/* ═══════════════════════════════════════════════════════════════
                  SIDEBAR NAVIGATION
              ═══════════════════════════════════════════════════════════════ */}
              <aside className={cx("lg:sticky lg:top-6 h-max no-print")}>
                <div
                  className={cx(
                    "rounded-2xl p-4",
                    isDarkMode
                      ? "bg-slate-800 border border-slate-700"
                      : "bg-white border border-gray-200 shadow-sm"
                  )}
                >
                  <h3
                    className={cx(
                      "text-sm font-semibold mb-3",
                      isDarkMode ? "text-slate-200" : "text-gray-800"
                    )}
                  >
                    Navigate
                  </h3>
                  <div className="space-y-2">
                    {/* Overall Summary Button */}
                    <button
                      type="button"
                      onClick={() => setActiveTab(null)}
                      data-track-proximity="Nav_OverallSummary"
                      className={cx(
                        "w-full text-left px-3 py-2 rounded-lg text-sm font-medium",
                        activeTab === null
                          ? isDarkMode
                            ? "bg-blue-700 text-blue-100"
                            : "bg-blue-600 text-white"
                          : isDarkMode
                          ? "text-slate-300 hover:bg-slate-700"
                          : "text-gray-700 hover:bg-gray-100"
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
                          "w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2",
                          activeTab === topic
                            ? isDarkMode
                              ? "bg-blue-700 text-blue-100"
                              : "bg-blue-600 text-white"
                            : isDarkMode
                            ? "text-slate-300 hover:bg-slate-700"
                            : "text-gray-700 hover:bg-gray-100"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                            activeTab === topic
                              ? isDarkMode
                                ? "bg-blue-800 text-blue-200"
                                : "bg-blue-500 text-white"
                              : isDarkMode
                              ? "bg-slate-700 text-slate-300"
                              : "bg-gray-200 text-gray-700"
                          )}
                        >
                          {idx + 1}
                        </span>
                        {topic}
                      </button>
                    ))}

                    {/* Feedback Section Divider */}
                    <div
                      className={cx(
                        "pt-2 mt-2 border-t",
                        isDarkMode ? "border-slate-700" : "border-gray-200"
                      )}
                    >
                      <div
                        className={cx(
                          "text-xs font-semibold uppercase tracking-wider mb-2 px-3",
                          isDarkMode ? "text-slate-500" : "text-gray-500"
                        )}
                      >
                        Surveys
                      </div>

                      {/* Baseline Information Button */}
                      <button
                        type="button"
                        onClick={() => setActiveTab("Baseline Information")}
                        data-track-proximity="Nav_Baseline"
                        className={cx(
                          "w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2",
                          isBaselineTab
                            ? isDarkMode
                              ? "bg-amber-700 text-amber-100"
                              : "bg-amber-600 text-white"
                            : isDarkMode
                            ? "text-slate-300 hover:bg-slate-700"
                            : "text-gray-700 hover:bg-gray-100"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                            isBaselineTab
                              ? isDarkMode
                                ? "bg-amber-800 text-amber-200"
                                : "bg-amber-500 text-white"
                              : isDarkMode
                              ? "bg-slate-700 text-slate-300"
                              : "bg-gray-200 text-gray-700"
                          )}
                        >
                          ℹ
                        </span>
                        Baseline Info
                      </button>

                      {/* SDM Button */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTab("Shared Decision Making (SDM)")
                        }
                        data-track-proximity="Nav_SDM"
                        className={cx(
                          "w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 mt-2",
                          isSDMTab
                            ? isDarkMode
                              ? "bg-purple-700 text-purple-100"
                              : "bg-purple-600 text-white"
                            : isDarkMode
                            ? "text-slate-300 hover:bg-slate-700"
                            : "text-gray-700 hover:bg-gray-100"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                            isSDMTab
                              ? isDarkMode
                                ? "bg-purple-800 text-purple-200"
                                : "bg-purple-500 text-white"
                              : isDarkMode
                              ? "bg-slate-700 text-slate-300"
                              : "bg-gray-200 text-gray-700"
                          )}
                        >
                          ✓
                        </span>
                        SDM Questions
                      </button>

                      {/* Patient Questions Button */}
                      <button
                        type="button"
                        onClick={() => setActiveTab("Patient Questions")}
                        data-track-proximity="Nav_PatientQuestions"
                        className={cx(
                          "w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 mt-2",
                          isQuestionsTab
                            ? isDarkMode
                              ? "bg-green-700 text-green-100"
                              : "bg-green-600 text-white"
                            : isDarkMode
                            ? "text-slate-300 hover:bg-slate-700"
                            : "text-gray-700 hover:bg-gray-100"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                            isQuestionsTab
                              ? isDarkMode
                                ? "bg-green-800 text-green-200"
                                : "bg-green-500 text-white"
                              : isDarkMode
                              ? "bg-slate-700 text-slate-300"
                              : "bg-gray-200 text-gray-700"
                          )}
                        >
                          ?
                        </span>
                        Questions for You
                      </button>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        ) : (
          /* ═══════════════════════════════════════════════════════════════════
              BODY SECTION - FULL MODE
          ═══════════════════════════════════════════════════════════════════ */
          <div
            className={cx(
              isDarkMode ? "bg-slate-900" : "bg-white",
              "shadow-xl min-h-screen"
            )}
          >
            <div className="px-12 py-12">
              <div className="text-center mb-12">
                <h2
                  className={cx(
                    "text-3xl font-semibold tracking-wide mb-4",
                    isDarkMode ? "text-slate-100" : "text-gray-900"
                  )}
                >
                  Complete Consultation Summary
                </h2>
                <div
                  className={cx(
                    "text-sm font-medium uppercase tracking-wider",
                    isDarkMode ? "text-slate-400" : "text-gray-500"
                  )}
                >
                  All Discussion Topics
                </div>
              </div>

              {/* Overall Summary */}
              <section
                data-track-proximity="FullMode_OverallSummary"
                className={cx(
                  "p-8 rounded-xl mb-12",
                  isDarkMode
                    ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                    : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-6">
                  <h3
                    className={cx(
                      "text-2xl font-semibold",
                      isDarkMode ? "text-slate-100" : "text-gray-900"
                    )}
                  >
                    Overall Summary
                  </h3>
                  <StarRating
                    value={ratings.overall || 0}
                    onChange={(v) => setRatings((r) => ({ ...r, overall: v }))}
                    label="Was this helpful?"
                    isDark={isDarkMode}
                    trackingName="FullMode_OverallRating"
                  />
                </div>
                <p
                  className={cx(
                    "text-lg leading-relaxed",
                    isDarkMode ? "text-slate-300" : "text-gray-700"
                  )}
                >
                  {patientData.overallSummary}
                </p>
              </section>

              <div className="py-8">
                <div
                  className={cx(
                    "border-t-2",
                    isDarkMode ? "border-slate-700" : "border-gray-300"
                  )}
                />
              </div>

              {/* All Topics */}
              {Object.entries<any>(patientData.consultationTopics).map(
                ([topicName, topicData], index) => (
                  <div key={topicName} className="relative">
                    <div className="flex items-center mb-6">
                      <div
                        className={cx(
                          "flex items-center justify-center w-12 h-12 rounded-full mr-6",
                          isDarkMode
                            ? "bg-blue-900 border-2 border-blue-700"
                            : "bg-blue-100 border-2 border-blue-300"
                        )}
                      >
                        <span
                          className={cx(
                            "text-lg font-bold",
                            isDarkMode ? "text-blue-300" : "text-blue-700"
                          )}
                        >
                          {index + 1}
                        </span>
                      </div>
                      <h2
                        className={cx(
                          "text-2xl font-semibold tracking-wide",
                          isDarkMode ? "text-slate-100" : "text-gray-900"
                        )}
                      >
                        {topicName}
                      </h2>
                    </div>

                    <div
                      className={cx(
                        "p-8 rounded-xl mb-6",
                        isDarkMode
                          ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                          : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4 mb-6">
                        <h3
                          className={cx(
                            "text-lg font-semibold",
                            isDarkMode ? "text-slate-200" : "text-gray-800"
                          )}
                        >
                          Summary
                        </h3>
                        <StarRating
                          value={ratings[topicName] || 0}
                          onChange={(v) => setTopicRating(topicName, v)}
                          label="Rate clarity"
                          isDark={isDarkMode}
                          trackingName={`FullMode_Rating_${topicName.replace(
                            /\s+/g,
                            ""
                          )}`}
                        />
                      </div>
                      <p
                        className={cx(
                          "text-base leading-relaxed",
                          isDarkMode ? "text-slate-300" : "text-gray-700"
                        )}
                      >
                        {topicData.aiSummary}
                      </p>
                    </div>

                    {index <
                      Object.keys(patientData.consultationTopics).length -
                        1 && (
                      <div className="py-8">
                        <div
                          className={cx(
                            "border-t-2",
                            isDarkMode ? "border-slate-700" : "border-gray-300"
                          )}
                        />
                      </div>
                    )}
                  </div>
                )
              )}

              {/* Full Mode - Survey Sections would go here */}
              {/* For brevity, using similar pattern as topics mode */}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className={cx(
            isDarkMode
              ? "bg-gradient-to-r from-slate-900 to-slate-800 border-t border-slate-700"
              : "bg-gradient-to-r from-gray-100 to-gray-50 border-t border-gray-200",
            "shadow-lg"
          )}
        />
      </div>
    </div>
  );
};

export default PatientReport;
