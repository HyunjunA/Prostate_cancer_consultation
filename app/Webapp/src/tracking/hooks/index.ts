import { useEffect } from "react";
import { useClickPath } from "./useClickPath";
import { useScrollDepth } from "./useScrollDepth";
import { useNavigationTracking } from "./useNavigationTracking";
import { useGlobalCursorProximity } from "./useGlobalCursorProximity"; // added
import { initializePostHog, captureEvent, setTrackingContext } from "../lib/posthog";
import { getOrCreateSession, endSession } from "../utils/session.utils";
import { getTrackingConfig } from "../config/tracking.config";

/**
 * Unified tracking hook
 * Enables user behavior tracking across the whole app
 *
 * On localhost it turns on automatically, with no env var needed
 * Cursor proximity tracking is enabled automatically
 *
 * @example
 * // use at the top level of App.tsx
 * function App() {
 *   useTracking();
 *   return <YourApp />;
 * }
 *
 * @example
 * // use with custom options
 * function App() {
 *   useTracking({
 *     cursorProximity: {
 *       enabled: true,
 *       autoTrackInteractive: true  // auto-track every button/link
 *     }
 *   });
 *   return <YourApp />;
 * }
 */

interface UseTrackingOptions {
  /** User role: "patient" | "physician" */
  role?: string;
  /** Patient file identifier */
  file?: string;
  /** Speaker/user identifier */
  speaker?: string;
  /** Visit type: "first" | "followup" */
  visitType?: string;
  /** Cursor proximity tracking options */
  cursorProximity?: {
    enabled?: boolean;
    autoTrackInteractive?: boolean;
    selector?: string;
    throttleMs?: number;
    maxTrackingDistance?: number;
  };
}

export const useTracking = (options?: UseTrackingOptions) => {
  const config = getTrackingConfig();
  const { trackClick } = useClickPath();
  const scrollDepth = useScrollDepth();
  const navigation = useNavigationTracking();

  // Set tracking context for the backend bridge (posthog.ts)
  useEffect(() => {
    setTrackingContext({
      role: options?.role || "patient",
      file: options?.file || "",
      speaker: options?.speaker || "",
      visitType: options?.visitType || "",
    });
  }, [options?.role, options?.file, options?.speaker, options?.visitType]);

  // Global cursor proximity tracking
  const cursorProximityConfig = {
    enabled: options?.cursorProximity?.enabled !== false, // default: true
    autoTrackInteractive:
      options?.cursorProximity?.autoTrackInteractive || false,
    selector:
      options?.cursorProximity?.selector ||
      "[data-track-proximity], .track-proximity",
    throttleMs: options?.cursorProximity?.throttleMs || 500,
    maxTrackingDistance: options?.cursorProximity?.maxTrackingDistance || 400,
  };

  // Enable global cursor proximity tracking
  const globalCursorProximity = useGlobalCursorProximity(
    cursorProximityConfig.enabled
      ? {
          selector: cursorProximityConfig.selector,
          autoTrackInteractive: cursorProximityConfig.autoTrackInteractive,
          throttleMs: cursorProximityConfig.throttleMs,
          maxTrackingDistance: cursorProximityConfig.maxTrackingDistance,
        }
      : undefined
  );

  // PostHog initialisation (once)
  useEffect(() => {
    if (!config.enabled) {
      console.log("[Tracking] Disabled via environment variable");
      return;
    }

    // Show localhost info
    console.log(
      "%c🏠 LOCALHOST TRACKING ENABLED",
      "background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;"
    );
    console.log("📝 All events will be logged to console");

    const initialized = initializePostHog();

    if (initialized) {
      const session = getOrCreateSession();

      // Session start event
      captureEvent("session_start", {
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        deviceType: session.deviceType,
        pageUrl: window.location.pathname,
      });

      console.log("[Tracking] Initialized successfully");

      // Cursor proximity tracking info
      if (cursorProximityConfig.enabled) {
        console.log(
          "%c🎯 CURSOR PROXIMITY TRACKING ENABLED",
          "background: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;"
        );
        console.log(`📍 Selector: "${cursorProximityConfig.selector}"`);
        console.log(
          `🔘 Auto-track interactive: ${cursorProximityConfig.autoTrackInteractive}`
        );
      }
    }

    // End the session when the app unmounts
    const handleBeforeUnload = () => {
      const session = getOrCreateSession();
      captureEvent("session_end", {
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        pageUrl: window.location.pathname,
      });
      endSession();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [config.enabled, cursorProximityConfig.enabled]);

  // Global click listener (automatic tracking)
  useEffect(() => {
    if (!config.enabled) return;

    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target;

      if (target instanceof HTMLElement) {
        // only track clickable elements
        const isClickable =
          target.tagName === "BUTTON" ||
          target.tagName === "A" ||
          target.onclick !== null ||
          target.getAttribute("role") === "button" ||
          target.classList.contains("clickable") ||
          target.closest('button, a, [role="button"]');

        if (isClickable) {
          const elementToTrack =
            (target.closest('button, a, [role="button"]') as HTMLElement) ||
            target;

          // click log
          console.log(
            `%c🖱️ CLICK%c <${elementToTrack.tagName.toLowerCase()}${
              elementToTrack.id ? "#" + elementToTrack.id : ""
            }> "${elementToTrack.textContent?.substring(0, 50) || ""}"`,
            "color: #f59e0b; font-weight: bold;",
            "color: #6b7280;"
          );

          trackClick(elementToTrack);
        }
      }
    };

    document.addEventListener("click", handleGlobalClick, true);
    console.log("[Tracking] 🎯 Global click tracking enabled");

    return () => {
      document.removeEventListener("click", handleGlobalClick, true);
    };
  }, [config.enabled, trackClick]);

  return {
    isEnabled: config.enabled,
    trackClick,
    scrollDepth,
    navigation,
    cursorProximity: {
      isEnabled: cursorProximityConfig.enabled,
      trackedElementsCount: globalCursorProximity?.trackedElementsCount || 0,
    },
  };
};

// Re-export every hook
export { useClickPath } from "./useClickPath";
export { useTimeOnComponent } from "./useTimeOnComponent";
export { useScrollDepth } from "./useScrollDepth";
export { useViewportTracking } from "./useViewportTracking";
export { useNavigationTracking } from "./useNavigationTracking";
// export { useCursorProximity } from "./useGlobalCursorProximity"; // when you want it individually
export { useGlobalCursorProximity } from "./useGlobalCursorProximity"; // global tracking
