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
exports.useClickPath = void 0;
var react_1 = require("react");
var posthog_1 = require("../lib/posthog");
var session_utils_1 = require("../utils/session.utils");
var tracking_config_1 = require("../config/tracking.config");
/**
 * 클릭 이벤트 추적 훅
 * 사용자가 어떤 순서로 무엇을 클릭했는지 추적
 */
exports.useClickPath = function () {
    var clickSequenceRef = react_1.useRef(0);
    var trackClick = react_1.useCallback(function (element, customProperties) {
        var _a;
        if (!element || !(element instanceof HTMLElement))
            return;
        clickSequenceRef.current += 1;
        var session = session_utils_1.getOrCreateSession();
        var properties = __assign({ timestamp: new Date().toISOString(), sessionId: session.sessionId, pageUrl: window.location.pathname, elementType: element.tagName.toLowerCase(), elementId: element.id || undefined, elementText: ((_a = element.textContent) === null || _a === void 0 ? void 0 : _a.substring(0, 50)) || undefined, clickSequence: clickSequenceRef.current }, customProperties);
        // 🎯 명확한 클릭 로그 출력
        console.log("\uD83D\uDDB1\uFE0F CLICK #" + clickSequenceRef.current + ":", "<" + properties.elementType + (properties.elementId ? "#" + properties.elementId : "") + ">", properties.elementText ? "\"" + properties.elementText + "\"" : "", "at " + properties.pageUrl);
        // PHI 필터링
        var sanitized = tracking_config_1.sanitizeEventData(properties);
        posthog_1.captureEvent("button_click", sanitized);
    }, []);
    return { trackClick: trackClick };
};
