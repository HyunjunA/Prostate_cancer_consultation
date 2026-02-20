"use strict";
exports.__esModule = true;
exports.useNavigationTracking = void 0;
var react_1 = require("react");
var navigation_1 = require("next/navigation");
var posthog_1 = require("../lib/posthog");
var session_utils_1 = require("../utils/session.utils");
var tracking_config_1 = require("../config/tracking.config");
/**
 * 페이지 네비게이션 추적 훅 (Next.js App Router용)
 * Next.js의 usePathname을 사용하여 페이지 이동 경로 추적
 */
exports.useNavigationTracking = function () {
    var pathname = navigation_1.usePathname();
    var searchParams = navigation_1.useSearchParams();
    var previousLocationRef = react_1.useRef("");
    var navigationStepRef = react_1.useRef(0);
    react_1.useEffect(function () {
        // URL 전체 경로 생성
        var search = searchParams === null || searchParams === void 0 ? void 0 : searchParams.toString();
        var currentPath = search ? pathname + "?" + search : pathname;
        var previousPath = previousLocationRef.current;
        // 첫 페이지 방문
        if (!previousPath) {
            navigationStepRef.current = 1;
            previousLocationRef.current = currentPath;
            var session = session_utils_1.getOrCreateSession();
            posthog_1.captureEvent("page_view", {
                timestamp: new Date().toISOString(),
                sessionId: session.sessionId,
                pageUrl: currentPath,
                navigationStep: navigationStepRef.current
            });
            return;
        }
        // 페이지 이동
        if (currentPath !== previousPath) {
            navigationStepRef.current += 1;
            var session = session_utils_1.getOrCreateSession();
            var properties = {
                timestamp: new Date().toISOString(),
                sessionId: session.sessionId,
                from: previousPath,
                to: currentPath,
                navigationStep: navigationStepRef.current
            };
            posthog_1.captureEvent("navigation", tracking_config_1.sanitizeEventData(properties));
            // 새 페이지 뷰도 기록
            posthog_1.captureEvent("page_view", {
                timestamp: new Date().toISOString(),
                sessionId: session.sessionId,
                pageUrl: currentPath,
                navigationStep: navigationStepRef.current
            });
            previousLocationRef.current = currentPath;
        }
    }, [pathname, searchParams]);
    return {
        currentPath: pathname,
        navigationStep: navigationStepRef.current
    };
};
