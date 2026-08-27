import { useEffect, useRef, useCallback, useState } from "react";
import { captureEvent } from "../lib/posthog";
import { getOrCreateSession } from "../utils/session.utils";
import { sanitizeEventData, debugLog } from "../config/tracking.config";
import { BaseEventProperties } from "../types/tracking.types";

interface CursorProximityEventProperties extends BaseEventProperties {
  componentName: string;
  distance: number; // distance in pixels
  proximityLevel: "near" | "medium" | "far" | "very-close";
  cursorX: number;
  cursorY: number;
  componentCenter: { x: number; y: number };
  hoverDuration?: number; // time spent nearby (milliseconds)
}

interface UseCursorProximityOptions {
  componentName: string;
  /**
   * Distance thresholds (pixels)
   * very-close: 0-50px
   * near: 50-150px
   * medium: 150-300px
   * far: 300px+
   */
  thresholds?: {
    veryClose?: number;
    near?: number;
    medium?: number;
  };
  /**
   * Throttle interval for outgoing events (milliseconds)
   * Default: 500ms, so events are not sent too often
   */
  throttleMs?: number;
  /**
   * Only track while within this distance
   * Default: 300px
   */
  maxTrackingDistance?: number;
  /**
   * Whether to track hover duration
   * Default: true
   */
  trackHoverDuration?: boolean;
  /**
   * Debug mode — draw a visual overlay
   * Default: false
   */
  debug?: boolean;
}

/**
 * Hook that tracks how close the cursor is to a component
 *
 * @example
 * function ImportantButton() {
 *   const buttonRef = useCursorProximity<HTMLButtonElement>({
 *     componentName: 'ExportButton',
 *     thresholds: { veryClose: 50, near: 150, medium: 300 },
 *     throttleMs: 500,
 *     trackHoverDuration: true
 *   });
 *
 *   return (
 *     <button ref={buttonRef}>Export Data</button>
 *   );
 * }
 */
export const useCursorProximity = <T extends HTMLElement>(
  options: UseCursorProximityOptions
) => {
  const {
    componentName,
    thresholds = {
      veryClose: 50,
      near: 150,
      medium: 300,
    },
    throttleMs = 500,
    maxTrackingDistance = 300,
    trackHoverDuration = true,
    debug = false,
  } = options;

  const elementRef = useRef<T>(null);
  const lastEventTimeRef = useRef<number>(0);
  const lastProximityLevelRef = useRef<string>("");
  const hoverStartTimeRef = useRef<number | null>(null);
  const debugOverlayRef = useRef<HTMLDivElement | null>(null);

  // current distance (for debugging)
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);

  /**
   * Distance between two points (Euclidean distance)
   */
  const calculateDistance = useCallback(
    (x1: number, y1: number, x2: number, y2: number): number => {
      return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    },
    []
  );

  /**
   * Map a distance to a proximity level
   */
  const getProximityLevel = useCallback(
    (distance: number): "very-close" | "near" | "medium" | "far" => {
      if (distance <= thresholds.veryClose!) return "very-close";
      if (distance <= thresholds.near!) return "near";
      if (distance <= thresholds.medium!) return "medium";
      return "far";
    },
    [thresholds]
  );

  /**
   * Centre point of the component
   */
  const getElementCenter = useCallback(
    (element: HTMLElement): { x: number; y: number } => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    },
    []
  );

  /**
   * Update the debug overlay
   */
  const updateDebugOverlay = useCallback(
    (distance: number, level: string) => {
      if (!debug || !elementRef.current) return;

      if (!debugOverlayRef.current) {
        debugOverlayRef.current = document.createElement("div");
        debugOverlayRef.current.style.cssText = `
        position: absolute;
        top: -30px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-family: monospace;
        pointer-events: none;
        z-index: 10000;
        white-space: nowrap;
      `;
        elementRef.current.style.position = "relative";
        elementRef.current.appendChild(debugOverlayRef.current);
      }

      const color =
        level === "very-close"
          ? "#ef4444"
          : level === "near"
          ? "#f59e0b"
          : level === "medium"
          ? "#3b82f6"
          : "#6b7280";

      debugOverlayRef.current.style.background = color;
      debugOverlayRef.current.textContent = `${Math.round(
        distance
      )}px - ${level}`;
    },
    [debug]
  );

  /**
   * Send a proximity event
   */
  const trackProximity = useCallback(
    (
      distance: number,
      cursorX: number,
      cursorY: number,
      componentCenter: { x: number; y: number }
    ) => {
      const now = Date.now();
      const proximityLevel = getProximityLevel(distance);

      // update the debug overlay
      if (debug) {
        updateDebugOverlay(distance, proximityLevel);
      }

      // Throttling: do not send too often
      if (now - lastEventTimeRef.current < throttleMs) {
        return;
      }

      // skip if the level is unchanged (only send on level transitions)
      if (proximityLevel === lastProximityLevelRef.current) {
        return;
      }

      // record when hovering started
      if (proximityLevel !== "far" && !hoverStartTimeRef.current) {
        hoverStartTimeRef.current = now;
      }

      // compute the hover duration
      let hoverDuration: number | undefined;
      if (
        proximityLevel === "far" &&
        hoverStartTimeRef.current &&
        trackHoverDuration
      ) {
        hoverDuration = now - hoverStartTimeRef.current;
        hoverStartTimeRef.current = null;
      }

      const session = getOrCreateSession();

      const properties: CursorProximityEventProperties = {
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        pageUrl: window.location.pathname,
        componentName,
        distance: Math.round(distance),
        proximityLevel,
        cursorX: Math.round(cursorX),
        cursorY: Math.round(cursorY),
        componentCenter: {
          x: Math.round(componentCenter.x),
          y: Math.round(componentCenter.y),
        },
        ...(hoverDuration && { hoverDuration }),
      };

      const sanitized = sanitizeEventData(properties);
      captureEvent("cursor_proximity", sanitized);

      debugLog(
        `🎯 Cursor ${proximityLevel} to ${componentName} (${Math.round(
          distance
        )}px)`,
        { proximityLevel, distance: Math.round(distance), hoverDuration }
      );

      lastEventTimeRef.current = now;
      lastProximityLevelRef.current = proximityLevel;
    },
    [
      componentName,
      getProximityLevel,
      throttleMs,
      trackHoverDuration,
      debug,
      updateDebugOverlay,
    ]
  );

  /**
   * Mouse-move handler
   */
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const element = elementRef.current;
      if (!element) return;

      const cursorX = event.clientX;
      const cursorY = event.clientY;
      const componentCenter = getElementCenter(element);

      const distance = calculateDistance(
        cursorX,
        cursorY,
        componentCenter.x,
        componentCenter.y
      );

      // update state (for debugging)
      setCurrentDistance(distance);

      // ignore anything beyond the maximum tracking distance
      if (distance > maxTrackingDistance) {
        // fall back to the "far" state (ends the hover)
        if (lastProximityLevelRef.current !== "far") {
          trackProximity(distance, cursorX, cursorY, componentCenter);
        }
        return;
      }

      trackProximity(distance, cursorX, cursorY, componentCenter);
    },
    [calculateDistance, getElementCenter, maxTrackingDistance, trackProximity]
  );

  /**
   * Mouse-leave handler (cursor left the component entirely)
   */
  const handleMouseLeave = useCallback(() => {
    if (hoverStartTimeRef.current && trackHoverDuration) {
      const hoverDuration = Date.now() - hoverStartTimeRef.current;

      const session = getOrCreateSession();
      const element = elementRef.current;
      if (!element) return;

      const componentCenter = getElementCenter(element);

      const properties: CursorProximityEventProperties = {
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        pageUrl: window.location.pathname,
        componentName,
        distance: 0,
        proximityLevel: "far",
        cursorX: 0,
        cursorY: 0,
        componentCenter: {
          x: Math.round(componentCenter.x),
          y: Math.round(componentCenter.y),
        },
        hoverDuration,
      };

      captureEvent("cursor_proximity_leave", sanitizeEventData(properties));
      debugLog(`🎯 Cursor left ${componentName} (hover: ${hoverDuration}ms)`);

      hoverStartTimeRef.current = null;
    }

    lastProximityLevelRef.current = "";
    setCurrentDistance(null);

    // remove the debug overlay
    if (debugOverlayRef.current) {
      debugOverlayRef.current.remove();
      debugOverlayRef.current = null;
    }
  }, [componentName, getElementCenter, trackHoverDuration]);

  // register the event listeners
  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);

    const element = elementRef.current;
    if (element) {
      element.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (element) {
        element.removeEventListener("mouseleave", handleMouseLeave);
      }

      // clean up the debug overlay
      if (debugOverlayRef.current) {
        debugOverlayRef.current.remove();
      }
    };
  }, [handleMouseMove, handleMouseLeave]);

  return {
    ref: elementRef,
    currentDistance,
    currentProximityLevel: currentDistance
      ? getProximityLevel(currentDistance)
      : null,
  };
};
