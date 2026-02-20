// StarRatingWithTracking.tsx
// Enhanced Star Rating component with comprehensive passive engagement tracking
// Tracks: clicks, hovers, hover durations, rating changes, time to rate, hesitation patterns

import React, { useState, useEffect, useRef, useCallback } from "react";

interface RatingEngagementData {
  topic: string;
  finalRating: number;
  ratingChangeHistory: number[]; // All rating values user clicked through
  timeToRate: number; // Seconds from component mount to first rating
  timeToFinalRating: number; // Seconds to last rating change
  starsHovered: number[]; // Which stars were hovered over
  hoverDurations: { [star: number]: number }; // Total hover time per star in seconds
  hoverSequence: Array<{ star: number; timestamp: number; duration: number }>; // Detailed hover timeline
  clickTimestamps: number[]; // When each rating click occurred
  hesitationTime: number; // Time spent hovering before first click
  totalInteractionTime: number; // Total time from first hover to last click
}

interface StarRatingWithTrackingProps {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  isDark?: boolean;
  trackingName?: string; // For proximity tracking
  topicName: string; // For engagement tracking
  onEngagementData?: (data: RatingEngagementData) => void; // Callback for tracking data
}

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

export const StarRatingWithTracking: React.FC<StarRatingWithTrackingProps> = ({
  value,
  onChange,
  label,
  isDark,
  trackingName,
  topicName,
  onEngagementData,
}) => {
  // Engagement tracking state
  const [engagementData, setEngagementData] = useState<RatingEngagementData>({
    topic: topicName,
    finalRating: 0,
    ratingChangeHistory: [],
    timeToRate: 0,
    timeToFinalRating: 0,
    starsHovered: [],
    hoverDurations: {},
    hoverSequence: [],
    clickTimestamps: [],
    hesitationTime: 0,
    totalInteractionTime: 0,
  });

  // Refs for tracking
  const mountTimeRef = useRef<number>(Date.now());
  const firstHoverTimeRef = useRef<number | null>(null);
  const firstClickTimeRef = useRef<number | null>(null);
  const lastClickTimeRef = useRef<number | null>(null);
  const hoverStartTimeRef = useRef<{ [star: number]: number }>({});
  const currentHoverStarRef = useRef<number | null>(null);

  // Handle star hover start
  const handleStarHoverStart = useCallback((star: number) => {
    const now = Date.now();

    // Record first hover time
    if (!firstHoverTimeRef.current) {
      firstHoverTimeRef.current = now;
    }

    // Start tracking hover time for this star
    hoverStartTimeRef.current[star] = now;
    currentHoverStarRef.current = star;

    // Add to hovered stars list if not already present
    setEngagementData((prev) => {
      if (!prev.starsHovered.includes(star)) {
        return {
          ...prev,
          starsHovered: [...prev.starsHovered, star],
        };
      }
      return prev;
    });
  }, []);

  // Handle star hover end
  const handleStarHoverEnd = useCallback((star: number) => {
    const now = Date.now();
    const startTime = hoverStartTimeRef.current[star];

    if (startTime) {
      const duration = (now - startTime) / 1000; // Convert to seconds

      setEngagementData((prev) => {
        const currentDuration = prev.hoverDurations[star] || 0;
        return {
          ...prev,
          hoverDurations: {
            ...prev.hoverDurations,
            [star]: currentDuration + duration,
          },
          hoverSequence: [
            ...prev.hoverSequence,
            { star, timestamp: startTime, duration },
          ],
        };
      });

      delete hoverStartTimeRef.current[star];
    }

    currentHoverStarRef.current = null;
  }, []);

  // Handle star click (rating change)
  const handleRatingChange = useCallback(
    (newRating: number) => {
      const now = Date.now();

      // Record first click time
      if (!firstClickTimeRef.current) {
        firstClickTimeRef.current = now;

        // Calculate hesitation time (time between first hover and first click)
        const hesitationTime = firstHoverTimeRef.current
          ? (now - firstHoverTimeRef.current) / 1000
          : 0;

        const timeToRate = (now - mountTimeRef.current) / 1000;

        setEngagementData((prev) => ({
          ...prev,
          timeToRate,
          hesitationTime,
        }));
      }

      // Update last click time
      lastClickTimeRef.current = now;

      // Update engagement data
      setEngagementData((prev) => {
        const newData = {
          ...prev,
          finalRating: newRating,
          ratingChangeHistory: [...prev.ratingChangeHistory, newRating],
          clickTimestamps: [...prev.clickTimestamps, now],
          timeToFinalRating: (now - mountTimeRef.current) / 1000,
          totalInteractionTime: firstHoverTimeRef.current
            ? (now - firstHoverTimeRef.current) / 1000
            : 0,
        };

        // Send tracking data via callback
        if (onEngagementData) {
          onEngagementData(newData);
        }

        return newData;
      });

      // Call original onChange
      onChange(newRating);
    },
    [onChange, onEngagementData]
  );

  // Cleanup on unmount - finalize any ongoing hover tracking
  useEffect(() => {
    return () => {
      if (currentHoverStarRef.current !== null) {
        handleStarHoverEnd(currentHoverStarRef.current);
      }
    };
  }, [handleStarHoverEnd]);

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
            onClick={() => handleRatingChange(i)}
            onMouseEnter={() => handleStarHoverStart(i)}
            onMouseLeave={() => handleStarHoverEnd(i)}
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

export default StarRatingWithTracking;
