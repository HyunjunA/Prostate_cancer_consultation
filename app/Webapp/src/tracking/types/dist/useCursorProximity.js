"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
exports.__esModule = true;
exports.useCursorProximity = void 0;
var react_1 = require("react");
var posthog_1 = require("../lib/posthog");
var session_utils_1 = require("../utils/session.utils");
var tracking_config_1 = require("../config/tracking.config");
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
exports.useCursorProximity = function (options) {
    var componentName = options.componentName, _a = options.thresholds, thresholds = _a === void 0 ? {
        veryClose: 50,
        near: 150,
        medium: 300
    } : _a, _b = options.throttleMs, throttleMs = _b === void 0 ? 500 : _b, _c = options.maxTrackingDistance, maxTrackingDistance = _c === void 0 ? 300 : _c, _d = options.trackHoverDuration, trackHoverDuration = _d === void 0 ? true : _d, _e = options.debug, debug = _e === void 0 ? false : _e;
    var elementRef = react_1.useRef(null);
    var lastEventTimeRef = react_1.useRef(0);
    var lastProximityLevelRef = react_1.useRef("");
    var hoverStartTimeRef = react_1.useRef(null);
    var debugOverlayRef = react_1.useRef(null);
    // 현재 거리 상태 (디버깅용)
    var _f = react_1.useState(null), currentDistance = _f[0], setCurrentDistance = _f[1];
    /**
     * 두 점 사이의 거리 계산 (Euclidean distance)
     */
    var calculateDistance = react_1.useCallback(function (x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }, []);
    /**
     * 거리에 따른 근접도 레벨 결정
     */
    var getProximityLevel = react_1.useCallback(function (distance) {
        if (distance <= thresholds.veryClose)
            return "very-close";
        if (distance <= thresholds.near)
            return "near";
        if (distance <= thresholds.medium)
            return "medium";
        return "far";
    }, [thresholds]);
    /**
     * 컴포넌트의 중심점 계산
     */
    var getElementCenter = react_1.useCallback(function (element) {
        var rect = element.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }, []);
    /**
     * 디버그 오버레이 업데이트
     */
    var updateDebugOverlay = react_1.useCallback(function (distance, level) {
        if (!debug || !elementRef.current)
            return;
        if (!debugOverlayRef.current) {
            debugOverlayRef.current = document.createElement("div");
            debugOverlayRef.current.style.cssText = "\n        position: absolute;\n        top: -30px;\n        left: 50%;\n        transform: translateX(-50%);\n        background: rgba(0, 0, 0, 0.8);\n        color: white;\n        padding: 4px 8px;\n        border-radius: 4px;\n        font-size: 12px;\n        font-family: monospace;\n        pointer-events: none;\n        z-index: 10000;\n        white-space: nowrap;\n      ";
            elementRef.current.style.position = "relative";
            elementRef.current.appendChild(debugOverlayRef.current);
        }
        var color = level === "very-close"
            ? "#ef4444"
            : level === "near"
                ? "#f59e0b"
                : level === "medium"
                    ? "#3b82f6"
                    : "#6b7280";
        debugOverlayRef.current.style.background = color;
        debugOverlayRef.current.textContent = Math.round(distance) + "px - " + level;
    }, [debug]);
    /**
     * 근접도 이벤트 전송
     */
    var trackProximity = react_1.useCallback(function (distance, cursorX, cursorY, componentCenter) {
        var now = Date.now();
        var proximityLevel = getProximityLevel(distance);
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
        var hoverDuration;
        if (proximityLevel === "far" &&
            hoverStartTimeRef.current &&
            trackHoverDuration) {
            hoverDuration = now - hoverStartTimeRef.current;
            hoverStartTimeRef.current = null;
        }
        var session = session_utils_1.getOrCreateSession();
        var properties = __assign({ timestamp: new Date().toISOString(), sessionId: session.sessionId, pageUrl: window.location.pathname, componentName: componentName, distance: Math.round(distance), proximityLevel: proximityLevel, cursorX: Math.round(cursorX), cursorY: Math.round(cursorY), componentCenter: {
                x: Math.round(componentCenter.x),
                y: Math.round(componentCenter.y)
            } }, (hoverDuration && { hoverDuration: hoverDuration }));
        var sanitized = tracking_config_1.sanitizeEventData(properties);
        posthog_1.captureEvent("cursor_proximity", sanitized);
        tracking_config_1.debugLog("\uD83C\uDFAF Cursor " + proximityLevel + " to " + componentName + " (" + Math.round(distance) + "px)", { proximityLevel: proximityLevel, distance: Math.round(distance), hoverDuration: hoverDuration });
        lastEventTimeRef.current = now;
        lastProximityLevelRef.current = proximityLevel;
    }, [
        componentName,
        getProximityLevel,
        throttleMs,
        trackHoverDuration,
        debug,
        updateDebugOverlay,
    ]);
    /**
     * 마우스 무브 핸들러
     */
    var handleMouseMove = react_1.useCallback(function (event) {
        var element = elementRef.current;
        if (!element)
            return;
        var cursorX = event.clientX;
        var cursorY = event.clientY;
        var componentCenter = getElementCenter(element);
        var distance = calculateDistance(cursorX, cursorY, componentCenter.x, componentCenter.y);
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
    }, [calculateDistance, getElementCenter, maxTrackingDistance, trackProximity]);
    /**
     * 마우스 리브 핸들러 (컴포넌트에서 완전히 벗어남)
     */
    var handleMouseLeave = react_1.useCallback(function () {
        if (hoverStartTimeRef.current && trackHoverDuration) {
            var hoverDuration = Date.now() - hoverStartTimeRef.current;
            var session = session_utils_1.getOrCreateSession();
            var element = elementRef.current;
            if (!element)
                return;
            var componentCenter = getElementCenter(element);
            var properties = {
                timestamp: new Date().toISOString(),
                sessionId: session.sessionId,
                pageUrl: window.location.pathname,
                componentName: componentName,
                distance: 0,
                proximityLevel: "far",
                cursorX: 0,
                cursorY: 0,
                componentCenter: {
                    x: Math.round(componentCenter.x),
                    y: Math.round(componentCenter.y)
                },
                hoverDuration: hoverDuration
            };
            posthog_1.captureEvent("cursor_proximity_leave", tracking_config_1.sanitizeEventData(properties));
            tracking_config_1.debugLog("\uD83C\uDFAF Cursor left " + componentName + " (hover: " + hoverDuration + "ms)");
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
    react_1.useEffect(function () {
        document.addEventListener("mousemove", handleMouseMove);
        var element = elementRef.current;
        if (element) {
            element.addEventListener("mouseleave", handleMouseLeave);
        }
        return function () {
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
        currentDistance: currentDistance,
        currentProximityLevel: currentDistance
            ? getProximityLevel(currentDistance)
            : null
    };
};
