import { useEffect, useRef } from "react";
import { captureEvent } from "../lib/posthog";
import { getOrCreateSession } from "../utils/session.utils";
import { sanitizeEventData, debugLog } from "../config/tracking.config";
import { CursorProximityEventProperties } from "../types/tracking.types";

interface TrackedElement {
  element: HTMLElement;
  componentName: string;
  distance: number;
  proximityLevel: string;
  hoverStartTime: number | null;
  lastEventTime: number;
}

interface GlobalCursorProximityOptions {
  /**
   * CSS selector for elements to track
   * Examples:
   * - "[data-track-proximity]" - elements with data-track-proximity attribute
   * - ".track-proximity" - elements with track-proximity class
   */
  selector?: string;

  /**
   * Distance thresholds in pixels
   */
  thresholds?: {
    veryClose?: number;
    near?: number;
    medium?: number;
  };

  /**
   * Throttle interval in milliseconds
   */
  throttleMs?: number;

  /**
   * Maximum tracking distance in pixels
   */
  maxTrackingDistance?: number;

  /**
   * Automatically track all buttons and links
   */
  autoTrackInteractive?: boolean;
}

/**
 * Global Cursor Proximity Tracking Hook
 * Automatically tracks cursor proximity to elements with tracking attributes
 */
export const useGlobalCursorProximity = (
  options?: GlobalCursorProximityOptions
) => {
  const {
    selector = "[data-track-proximity], .track-proximity",
    thresholds = {
      veryClose: 50,
      near: 150,
      medium: 300,
    },
    throttleMs = 500,
    maxTrackingDistance = 400,
    autoTrackInteractive = false,
  } = options || {};

  const trackedElementsRef = useRef<Map<HTMLElement, TrackedElement>>(
    new Map()
  );
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);

  /**
   * Calculate distance between two points
   */
  const calculateDistance = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number => {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  };

  /**
   * Get proximity level based on distance
   */
  const getProximityLevel = (
    distance: number
  ): "very-close" | "near" | "medium" | "far" => {
    if (distance <= thresholds.veryClose!) return "very-close";
    if (distance <= thresholds.near!) return "near";
    if (distance <= thresholds.medium!) return "medium";
    return "far";
  };

  /**
   * Get element center point
   */
  const getElementCenter = (element: HTMLElement): { x: number; y: number } => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  /**
   * Extract component name from element
   */
  const getComponentName = (element: HTMLElement): string | null => {
    // 1. data-track-proximity attribute
    const dataTrack = element.getAttribute("data-track-proximity");
    if (dataTrack) {
      console.log(`✅ Found tracking attribute: "${dataTrack}" on`, element);
      return dataTrack;
    }

    // 2. data-component-name attribute
    const dataComponent = element.getAttribute("data-component-name");
    if (dataComponent) {
      console.log(`✅ Found component-name: "${dataComponent}" on`, element);
      return dataComponent;
    }

    // 3. Auto-generate for interactive elements
    if (autoTrackInteractive) {
      const tagName = element.tagName.toLowerCase();
      const id = element.id;
      const text = element.textContent?.trim().substring(0, 20);

      if (id) return `${tagName}_${id}`;
      if (text) return `${tagName}_${text.replace(/\s+/g, "_")}`;
      return `${tagName}_${Math.random().toString(36).substring(7)}`;
    }

    return null;
  };

  /**
   * Find all trackable elements in DOM
   */
  const findTrackableElements = (): HTMLElement[] => {
    const elements: HTMLElement[] = [];

    // 1. Find elements matching selector
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const componentName = getComponentName(el);
      if (componentName) {
        elements.push(el);
        console.log(`🔍 Tracking element: "${componentName}"`, el);
      }
    });

    // 2. Auto-track interactive elements if enabled
    if (autoTrackInteractive) {
      document
        .querySelectorAll<HTMLElement>('button, a, [role="button"]')
        .forEach((el) => {
          if (!elements.includes(el)) {
            const componentName = getComponentName(el);
            if (componentName) {
              elements.push(el);
              console.log(`🔍 Auto-tracking: "${componentName}"`, el);
            }
          }
        });
    }

    console.log(`📊 Total trackable elements found: ${elements.length}`);
    return elements;
  };

  /**
   * Send proximity event to PostHog
   */
  const sendProximityEvent = (
    componentName: string,
    distance: number,
    proximityLevel: string,
    elementCenter: { x: number; y: number },
    hoverDuration?: number
  ) => {
    const session = getOrCreateSession();

    const properties: CursorProximityEventProperties = {
      timestamp: new Date().toISOString(),
      sessionId: session.sessionId,
      pageUrl: window.location.pathname,
      componentName,
      distance: Math.round(distance),
      proximityLevel: proximityLevel as any,
      cursorX: Math.round(mousePositionRef.current.x),
      cursorY: Math.round(mousePositionRef.current.y),
      componentCenter: {
        x: Math.round(elementCenter.x),
        y: Math.round(elementCenter.y),
      },
      ...(hoverDuration && { hoverDuration }),
    };

    const sanitized = sanitizeEventData(properties);
    captureEvent("cursor_proximity", sanitized);

    debugLog(
      `🎯 Global Cursor ${proximityLevel} to ${componentName} (${Math.round(
        distance
      )}px)`,
      { proximityLevel, distance: Math.round(distance) }
    );
  };

  /**
   * Update all tracked elements
   */
  const updateAllElements = () => {
    const now = Date.now();
    const cursorX = mousePositionRef.current.x;
    const cursorY = mousePositionRef.current.y;

    trackedElementsRef.current.forEach((tracked, element) => {
      // Check if element still exists in DOM
      if (!document.body.contains(element)) {
        trackedElementsRef.current.delete(element);
        return;
      }

      const elementCenter = getElementCenter(element);
      const distance = calculateDistance(
        cursorX,
        cursorY,
        elementCenter.x,
        elementCenter.y
      );

      // Beyond max tracking distance -> set to far
      if (distance > maxTrackingDistance) {
        // End hover if was tracking
        if (tracked.proximityLevel !== "far" && tracked.hoverStartTime) {
          const hoverDuration = now - tracked.hoverStartTime;

          captureEvent(
            "cursor_proximity_leave",
            sanitizeEventData({
              timestamp: new Date().toISOString(),
              sessionId: getOrCreateSession().sessionId,
              pageUrl: window.location.pathname,
              componentName: tracked.componentName,
              distance: 0,
              proximityLevel: "far",
              cursorX: 0,
              cursorY: 0,
              componentCenter: elementCenter,
              hoverDuration,
            })
          );

          tracked.hoverStartTime = null;
        }

        tracked.proximityLevel = "far";
        tracked.distance = distance;
        return;
      }

      const proximityLevel = getProximityLevel(distance);

      // Throttling: don't send too frequently
      if (now - tracked.lastEventTime < throttleMs) {
        return;
      }

      // Only send event when proximity level changes
      if (proximityLevel !== tracked.proximityLevel) {
        // Start hover
        if (proximityLevel !== "far" && !tracked.hoverStartTime) {
          tracked.hoverStartTime = now;
        }

        // End hover
        if (proximityLevel === "far" && tracked.hoverStartTime) {
          const hoverDuration = now - tracked.hoverStartTime;
          sendProximityEvent(
            tracked.componentName,
            distance,
            proximityLevel,
            elementCenter,
            hoverDuration
          );
          tracked.hoverStartTime = null;
        } else {
          sendProximityEvent(
            tracked.componentName,
            distance,
            proximityLevel,
            elementCenter
          );
        }

        tracked.proximityLevel = proximityLevel;
        tracked.lastEventTime = now;
      }

      tracked.distance = distance;
    });
  };

  /**
   * Schedule update using requestAnimationFrame
   */
  const scheduleUpdate = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      updateAllElements();
      rafIdRef.current = null;
    });
  };

  /**
   * Mouse move handler
   */
  const handleMouseMove = (event: MouseEvent) => {
    mousePositionRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    scheduleUpdate();
  };

  /**
   * Rescan DOM for trackable elements
   */
  const rescanElements = () => {
    const elements = findTrackableElements();

    elements.forEach((element) => {
      if (!trackedElementsRef.current.has(element)) {
        const componentName = getComponentName(element);
        if (componentName) {
          trackedElementsRef.current.set(element, {
            element,
            componentName,
            distance: Infinity,
            proximityLevel: "far",
            hoverStartTime: null,
            lastEventTime: 0,
          });
        }
      }
    });

    console.log(
      `📈 Tracking ${trackedElementsRef.current.size} elements after rescan`
    );
  };

  // Initialize and setup event listeners
  useEffect(() => {
    console.log(
      "%c🎯 GLOBAL CURSOR PROXIMITY INITIALIZED",
      "background: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;"
    );
    console.log(`📍 Selector: "${selector}"`);
    console.log(`🔘 Auto-track interactive: ${autoTrackInteractive}`);

    // Initial scan
    rescanElements();

    // Mouse move event
    document.addEventListener("mousemove", handleMouseMove, { passive: true });

    // MutationObserver to detect DOM changes
    const observer = new MutationObserver((mutations) => {
      // Only rescan if new elements were added
      const hasNewElements = mutations.some(
        (mutation) => mutation.addedNodes.length > 0
      );
      if (hasNewElements) {
        console.log("🔄 DOM changed, rescanning elements...");
        rescanElements();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log("[Global Cursor Proximity] 🎯 Tracking enabled");

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      observer.disconnect();

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

      // Send leave events for all tracked elements
      trackedElementsRef.current.forEach((tracked) => {
        if (tracked.hoverStartTime) {
          const hoverDuration = Date.now() - tracked.hoverStartTime;
          captureEvent(
            "cursor_proximity_leave",
            sanitizeEventData({
              timestamp: new Date().toISOString(),
              sessionId: getOrCreateSession().sessionId,
              pageUrl: window.location.pathname,
              componentName: tracked.componentName,
              distance: 0,
              proximityLevel: "far",
              cursorX: 0,
              cursorY: 0,
              componentCenter: getElementCenter(tracked.element),
              hoverDuration,
            })
          );
        }
      });
    };
  }, [selector, autoTrackInteractive, throttleMs, maxTrackingDistance]);

  return {
    trackedElementsCount: trackedElementsRef.current.size,
  };
};
