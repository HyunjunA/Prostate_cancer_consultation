import { useEffect } from "react";
import { useClickPath } from "./useClickPath";
import { useScrollDepth } from "./useScrollDepth";
import { useNavigationTracking } from "./useNavigationTracking";
import { useGlobalCursorProximity } from "./useGlobalCursorProximity"; // 🆕 추가
import { initializePostHog, captureEvent, setTrackingContext } from "../lib/posthog";
import { getOrCreateSession, endSession } from "../utils/session.utils";
import { getTrackingConfig } from "../config/tracking.config";

/**
 * 통합 추적 훅
 * 앱 전체에서 사용자 행동 추적을 활성화
 *
 * ⭐ localhost에서는 환경변수 설정 없이 자동으로 활성화됨
 * 🆕 커서 근접도 추적 자동 활성화!
 *
 * @example
 * // App.tsx 최상위에서 사용
 * function App() {
 *   useTracking();
 *   return <YourApp />;
 * }
 *
 * @example
 * // 커스텀 설정으로 사용
 * function App() {
 *   useTracking({
 *     cursorProximity: {
 *       enabled: true,
 *       autoTrackInteractive: true  // 모든 버튼/링크 자동 추적
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
  /** 커서 근접도 추적 설정 */
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

  // 전역 커서 근접도 추적
  const cursorProximityConfig = {
    enabled: options?.cursorProximity?.enabled !== false, // 기본값: true
    autoTrackInteractive:
      options?.cursorProximity?.autoTrackInteractive || false,
    selector:
      options?.cursorProximity?.selector ||
      "[data-track-proximity], .track-proximity",
    throttleMs: options?.cursorProximity?.throttleMs || 500,
    maxTrackingDistance: options?.cursorProximity?.maxTrackingDistance || 400,
  };

  // 🎯 전역 커서 근접도 추적 활성화
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

  // PostHog 초기화 (최초 1회)
  useEffect(() => {
    if (!config.enabled) {
      console.log("[Tracking] Disabled via environment variable");
      return;
    }

    // 🏠 localhost 정보 표시
    console.log(
      "%c🏠 LOCALHOST TRACKING ENABLED",
      "background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;"
    );
    console.log("📝 All events will be logged to console");

    const initialized = initializePostHog();

    if (initialized) {
      const session = getOrCreateSession();

      // 세션 시작 이벤트
      captureEvent("session_start", {
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        deviceType: session.deviceType,
        pageUrl: window.location.pathname,
      });

      console.log("[Tracking] Initialized successfully");

      // 🆕 커서 근접도 추적 정보
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

    // 앱 종료 시 세션 종료
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

  // 🎯 전역 클릭 이벤트 리스너 (자동 추적)
  useEffect(() => {
    if (!config.enabled) return;

    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target;

      if (target instanceof HTMLElement) {
        // 클릭 가능한 요소들만 추적
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

          // 🖱️ 클릭 로그
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

// 모든 훅을 export
export { useClickPath } from "./useClickPath";
export { useTimeOnComponent } from "./useTimeOnComponent";
export { useScrollDepth } from "./useScrollDepth";
export { useViewportTracking } from "./useViewportTracking";
export { useNavigationTracking } from "./useNavigationTracking";
// export { useCursorProximity } from "./useGlobalCursorProximity"; // 개별 사용을 원할 때
export { useGlobalCursorProximity } from "./useGlobalCursorProximity"; // 🆕 전역 추적
