"use strict";
exports.__esModule = true;
exports.isLocalhost = exports.sanitizeEventData = exports.debugLog = exports.getTrackingConfig = void 0;
/**
 * localhost 환경인지 확인
 */
var isLocalhost = function () {
    if (typeof window === "undefined")
        return false;
    var hostname = window.location.hostname;
    return (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.endsWith(".local"));
};
exports.isLocalhost = isLocalhost;
/**
 * 환경변수에서 추적 설정을 가져옴
 * CRITICAL: PHI 데이터는 절대 추적하지 않음
 *
 * ⭐ localhost에서는 항상 enabled=true
 */
exports.getTrackingConfig = function () {
    var envEnabled = process.env.REACT_APP_ENABLE_POSTHOG === "true";
    var isDebug = process.env.REACT_APP_TRACKING_DEBUG === "true";
    var isLocal = isLocalhost();
    // 🎯 localhost에서는 환경변수 관계없이 항상 활성화
    var enabled = isLocal ? true : envEnabled;
    if (isLocal && !envEnabled) {
        console.log("🏠 [Tracking] Auto-enabled for localhost (no PostHog sending, logs only)");
    }
    return {
        enabled: enabled,
        debug: isDebug || isLocal,
        apiKey: process.env.REACT_APP_POSTHOG_API_KEY,
        apiHost: process.env.REACT_APP_POSTHOG_HOST || "https://app.posthog.com",
        sessionDuration: 30 * 60 * 1000,
        scrollThreshold: 25,
        visibilityThreshold: 50
    };
};
/**
 * 디버그 로그 출력 - localhost에서는 항상 활성화
 */
exports.debugLog = function (message, data) {
    var config = exports.getTrackingConfig();
    var isLocal = isLocalhost();
    // localhost이거나 debug 모드면 항상 로그 출력
    if (isLocal || config.debug) {
        var timestamp = new Date().toLocaleTimeString();
        console.log("%c[Tracking " + timestamp + "]%c " + message, "color: #2563eb; font-weight: bold", "color: inherit", data || "");
    }
};
/**
 * PHI 필터링 - 민감한 정보 제거
 * CRITICAL: 프로덕션에서 PHI가 절대 추적되지 않도록 보장
 */
exports.sanitizeEventData = function (data) {
    var phiKeywords = [
        "patient",
        "mrn",
        "ssn",
        "phone",
        "email",
        "name",
        "dob",
        "birth",
        "address",
        "diagnosis",
        "medication",
        "insurance",
    ];
    var sanitized = {};
    var _loop_1 = function (key, value) {
        var keyLower = key.toLowerCase();
        var containsPHI = phiKeywords.some(function (keyword) {
            return keyLower.includes(keyword);
        });
        if (!containsPHI) {
            sanitized[key] = value;
        }
        else {
            console.warn("\u26A0\uFE0F PHI keyword detected and removed: " + key);
            exports.debugLog("\u26A0\uFE0F PHI keyword detected and removed: " + key);
        }
    };
    for (var _i = 0, _a = Object.entries(data); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        _loop_1(key, value);
    }
    return sanitized;
};
