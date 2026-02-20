"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
exports.__esModule = true;
exports.useTracking = void 0;
var react_1 = require("react");
var useClickPath_1 = require("./useClickPath");
var useScrollDepth_1 = require("./useScrollDepth");
var useNavigationTracking_1 = require("./useNavigationTracking");
var useGlobalCursorProximity_1 = require("./useGlobalCursorProximity"); // 🆕 추가
var posthog_1 = require("../lib/posthog");
var session_utils_1 = require("../utils/session.utils");
var tracking_config_1 = require("../config/tracking.config");
exports.useTracking = function (options) {
    var _a, _b, _c, _d, _e;
    var config = tracking_config_1.getTrackingConfig();
    var trackClick = useClickPath_1.useClickPath().trackClick;
    var scrollDepth = useScrollDepth_1.useScrollDepth();
    var navigation = useNavigationTracking_1.useNavigationTracking();
    // 🆕 전역 커서 근접도 추적
    var cursorProximityConfig = {
        enabled: ((_a = options === null || options === void 0 ? void 0 : options.cursorProximity) === null || _a === void 0 ? void 0 : _a.enabled) !== false,
        autoTrackInteractive: ((_b = options === null || options === void 0 ? void 0 : options.cursorProximity) === null || _b === void 0 ? void 0 : _b.autoTrackInteractive) || false,
        selector: ((_c = options === null || options === void 0 ? void 0 : options.cursorProximity) === null || _c === void 0 ? void 0 : _c.selector) ||
            "[data-track-proximity], .track-proximity",
        throttleMs: ((_d = options === null || options === void 0 ? void 0 : options.cursorProximity) === null || _d === void 0 ? void 0 : _d.throttleMs) || 500,
        maxTrackingDistance: ((_e = options === null || options === void 0 ? void 0 : options.cursorProximity) === null || _e === void 0 ? void 0 : _e.maxTrackingDistance) || 400
    };
    // 🎯 전역 커서 근접도 추적 활성화
    var globalCursorProximity = useGlobalCursorProximity_1.useGlobalCursorProximity(cursorProximityConfig.enabled
        ? {
            selector: cursorProximityConfig.selector,
            autoTrackInteractive: cursorProximityConfig.autoTrackInteractive,
            throttleMs: cursorProximityConfig.throttleMs,
            maxTrackingDistance: cursorProximityConfig.maxTrackingDistance
        }
        : undefined);
    // PostHog 초기화 (최초 1회)
    react_1.useEffect(function () {
        if (!config.enabled) {
            console.log("[Tracking] Disabled via environment variable");
            return;
        }
        // 🏠 localhost 정보 표시
        console.log("%c🏠 LOCALHOST TRACKING ENABLED", "background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;");
        console.log("📝 All events will be logged to console");
        var initialized = posthog_1.initializePostHog();
        if (initialized) {
            var session = session_utils_1.getOrCreateSession();
            // 세션 시작 이벤트
            posthog_1.captureEvent("session_start", {
                timestamp: new Date().toISOString(),
                sessionId: session.sessionId,
                deviceType: session.deviceType,
                pageUrl: window.location.pathname
            });
            console.log("[Tracking] Initialized successfully");
            // 🆕 커서 근접도 추적 정보
            if (cursorProximityConfig.enabled) {
                console.log("%c🎯 CURSOR PROXIMITY TRACKING ENABLED", "background: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;");
                console.log("\uD83D\uDCCD Selector: \"" + cursorProximityConfig.selector + "\"");
                console.log("\uD83D\uDD18 Auto-track interactive: " + cursorProximityConfig.autoTrackInteractive);
            }
        }
        // 앱 종료 시 세션 종료
        var handleBeforeUnload = function () {
            var session = session_utils_1.getOrCreateSession();
            posthog_1.captureEvent("session_end", {
                timestamp: new Date().toISOString(),
                sessionId: session.sessionId,
                pageUrl: window.location.pathname
            });
            session_utils_1.endSession();
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return function () {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [config.enabled, cursorProximityConfig.enabled]);
    // 🎯 전역 클릭 이벤트 리스너 (자동 추적)
    react_1.useEffect(function () {
        if (!config.enabled)
            return;
        var handleGlobalClick = function (event) {
            var _a;
            var target = event.target;
            if (target instanceof HTMLElement) {
                // 클릭 가능한 요소들만 추적
                var isClickable = target.tagName === "BUTTON" ||
                    target.tagName === "A" ||
                    target.onclick !== null ||
                    target.getAttribute("role") === "button" ||
                    target.classList.contains("clickable") ||
                    target.closest('button, a, [role="button"]');
                if (isClickable) {
                    var elementToTrack = target.closest('button, a, [role="button"]') ||
                        target;
                    // 🖱️ 클릭 로그
                    console.log("%c\uD83D\uDDB1\uFE0F CLICK%c <" + elementToTrack.tagName.toLowerCase() + (elementToTrack.id ? "#" + elementToTrack.id : "") + "> \"" + (((_a = elementToTrack.textContent) === null || _a === void 0 ? void 0 : _a.substring(0, 50)) || "") + "\"", "color: #f59e0b; font-weight: bold;", "color: #6b7280;");
                    trackClick(elementToTrack);
                }
            }
        };
        document.addEventListener("click", handleGlobalClick, true);
        console.log("[Tracking] 🎯 Global click tracking enabled");
        return function () {
            document.removeEventListener("click", handleGlobalClick, true);
        };
    }, [config.enabled, trackClick]);
    return {
        isEnabled: config.enabled,
        trackClick: trackClick,
        scrollDepth: scrollDepth,
        navigation: navigation,
        cursorProximity: {
            isEnabled: cursorProximityConfig.enabled,
            trackedElementsCount: (globalCursorProximity === null || globalCursorProximity === void 0 ? void 0 : globalCursorProximity.trackedElementsCount) || 0
        }
    };
};
// 모든 훅을 export
var useClickPath_2 = require("./useClickPath");
__createBinding(exports, useClickPath_2, "useClickPath");
var useTimeOnComponent_1 = require("./useTimeOnComponent");
__createBinding(exports, useTimeOnComponent_1, "useTimeOnComponent");
var useScrollDepth_2 = require("./useScrollDepth");
__createBinding(exports, useScrollDepth_2, "useScrollDepth");
var useViewportTracking_1 = require("./useViewportTracking");
__createBinding(exports, useViewportTracking_1, "useViewportTracking");
var useNavigationTracking_2 = require("./useNavigationTracking");
__createBinding(exports, useNavigationTracking_2, "useNavigationTracking");
// export { useCursorProximity } from "./useGlobalCursorProximity"; // 개별 사용을 원할 때
var useGlobalCursorProximity_2 = require("./useGlobalCursorProximity"); // 🆕 전역 추적
__createBinding(exports, useGlobalCursorProximity_2, "useGlobalCursorProximity");
