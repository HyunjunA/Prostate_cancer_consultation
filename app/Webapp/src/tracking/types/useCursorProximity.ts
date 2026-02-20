import { useEffect, useRef, useCallback, useState } from "react";
import { captureEvent } from "../lib/posthog";
import { getOrCreateSession } from "../utils/session.utils";
import { sanitizeEventData, debugLog } from "../config/tracking.config";
import { BaseEventProperties } from "../types/tracking.types";

interface CursorProximityEventProperties extends BaseEventProperties {
  componentName: string;
  distance: number; // 픽셀 단위 거리
  proximityLevel: "near" | "medium" | "far" | "very-close";
  cursorX: number;
  cursorY: number;
  componentCenter: { x: number; y: number };
  hoverDuration?: number; // 근처에 머문 시간 (밀리초)
}

interface UseCursorProximityOptions {
  componentName: string;
  /**
   * 거리 임계값 설정 (픽셀)
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
   * 이벤트 전송 빈도 조절 (밀리초)
   * 기본값: 500ms (너무 자주 전송하지 않도록)
   */
  throttleMs?: number;
  /**
   * 특정 거리 이내일 때만 추적
   * 기본값: 300px
   */
  maxTrackingDistance?: number;
  /**
   * hover 시간 추적 여부
   * 기본값: true
   */
  trackHoverDuration?: boolean;
  /**
   * 디버그 모드 - 시각적 표시
   * 기본값: false
   */
  debug?: boolean;
}

/**
 * 커서가 컴포넌트에 얼마나 가까운지 추적하는 Hook
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

  // 현재 거리 상태 (디버깅용)
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);

  /**
   * 두 점 사이의 거리 계산 (Euclidean distance)
   */
  const calculateDistance = useCallback(
    (x1: number, y1: number, x2: number, y2: number): number => {
      return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    },
    []
  );

  /**
   * 거리에 따른 근접도 레벨 결정
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
   * 컴포넌트의 중심점 계산
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
   * 디버그 오버레이 업데이트
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
   * 근접도 이벤트 전송
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

      // 디버그 오버레이 업데이트
      if (debug) {
        updateDebugOverlay(distance, proximityLevel);
      }

      // Throttling: 너무 자주 전송하지 않기
      if (now - lastEventTimeRef.current < throttleMs) {
        return;
      }

      // 같은 레벨이면 전송하지 않기 (레벨 변경 시에만 전송)
      if (proximityLevel === lastProximityLevelRef.current) {
        return;
      }

      // hover 시작 시간 기록
      if (proximityLevel !== "far" && !hoverStartTimeRef.current) {
        hoverStartTimeRef.current = now;
      }

      // hover 종료 시간 계산
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
   * 마우스 무브 핸들러
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

      // 상태 업데이트 (디버깅용)
      setCurrentDistance(distance);

      // 최대 추적 거리를 벗어나면 무시
      if (distance > maxTrackingDistance) {
        // far 상태로 전환 (hover 종료 처리)
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
   * 마우스 리브 핸들러 (컴포넌트에서 완전히 벗어남)
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

    // 디버그 오버레이 제거
    if (debugOverlayRef.current) {
      debugOverlayRef.current.remove();
      debugOverlayRef.current = null;
    }
  }, [componentName, getElementCenter, trackHoverDuration]);

  // 이벤트 리스너 등록
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

      // 디버그 오버레이 정리
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
