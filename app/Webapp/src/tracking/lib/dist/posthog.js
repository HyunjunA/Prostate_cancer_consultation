"use strict";
exports.__esModule = true;
exports.captureEvent = exports.isPostHogEnabled = exports.getPostHog = exports.initializePostHog = void 0;
var posthog_js_1 = require("posthog-js");
var tracking_config_1 = require("../config/tracking.config");
/**
 * PostHog 초기화
 * localhost에서는 API 키 없이도 로컬 로그 모드로 작동
 */
exports.initializePostHog = function () {
    var config = tracking_config_1.getTrackingConfig();
    var isLocal = tracking_config_1.isLocalhost();
    if (!config.enabled) {
        tracking_config_1.debugLog("PostHog is DISABLED via environment variable");
        return false;
    }
    // 🏠 localhost에서는 API 키 없어도 로컬 로그 모드로 작동
    if (isLocal) {
        if (!config.apiKey) {
            console.log("🏠 [Tracking] Running in LOCAL LOG MODE (events logged to console only)");
            tracking_config_1.debugLog("✅ Local log mode enabled - no PostHog server connection");
            return true;
        }
        else {
            console.log("🏠 [Tracking] Running on localhost with PostHog API key");
        }
    }
    // 프로덕션에서는 API 키 필수
    if (!config.apiKey && !isLocal) {
        console.warn("[PostHog] API key not found. Tracking disabled.");
        return false;
    }
    // PostHog 초기화 (API 키가 있을 때만)
    if (config.apiKey) {
        try {
            posthog_js_1["default"].init(config.apiKey, {
                api_host: config.apiHost,
                // PHI 보호를 위한 설정
                mask_all_text: false,
                mask_all_element_attributes: false,
                capture_pageview: false,
                capture_pageleave: true,
                // 성능 최적화
                loaded: function (ph) {
                    tracking_config_1.debugLog("PostHog initialized successfully", {
                        apiHost: config.apiHost,
                        distinctId: ph.get_distinct_id()
                    });
                },
                // 쿠키 설정
                persistence: "localStorage",
                // 세션 리플레이는 의료 환경에서 비활성화 권장
                disable_session_recording: true
            });
            return true;
        }
        catch (error) {
            console.error("[PostHog] Initialization failed:", error);
            return false;
        }
    }
    return true;
};
/**
 * PostHog 인스턴스 가져오기
 */
exports.getPostHog = function () {
    var config = tracking_config_1.getTrackingConfig();
    return config.enabled ? posthog_js_1["default"] : null;
};
/**
 * PostHog가 활성화되어 있는지 확인
 */
exports.isPostHogEnabled = function () {
    var config = tracking_config_1.getTrackingConfig();
    if (!config.enabled)
        return false;
    var isLocal = tracking_config_1.isLocalhost();
    // localhost에서는 API 키 없어도 활성화로 간주
    if (isLocal)
        return true;
    // 프로덕션에서는 API 키 있고 로드되어야 함
    return config.apiKey !== undefined && posthog_js_1["default"].__loaded;
};
/**
 * 이벤트 전송
 * localhost에서는 PostHog 전송 없이 콘솔 로그만 출력
 */
exports.captureEvent = function (eventName, properties) {
    var config = tracking_config_1.getTrackingConfig();
    var isLocal = tracking_config_1.isLocalhost();
    if (!config.enabled) {
        tracking_config_1.debugLog("\u274C Event not sent (tracking disabled): " + eventName, properties);
        return;
    }
    // 🏠 localhost: 콘솔 로그만 출력 (PostHog 전송 안 함)
    if (isLocal && !config.apiKey) {
        console.log("%c\uD83D\uDCCA EVENT: " + eventName + "%c", "color: #10b981; font-weight: bold; font-size: 12px;", "color: inherit", properties);
        tracking_config_1.debugLog("\uD83D\uDCCA Event captured (local only): " + eventName, properties);
        return;
    }
    // PostHog API 키가 있으면 실제 전송
    if (config.apiKey) {
        try {
            posthog_js_1["default"].capture(eventName, properties);
            tracking_config_1.debugLog("\u2705 Event sent to PostHog: " + eventName, properties);
            // localhost에서는 콘솔에도 추가 표시
            if (isLocal) {
                console.log("%c\uD83D\uDCCA EVENT: " + eventName + "%c (sent to PostHog)", "color: #10b981; font-weight: bold; font-size: 12px;", "color: inherit", properties);
            }
        }
        catch (error) {
            console.error("[PostHog] Failed to capture event:", error);
            tracking_config_1.debugLog("\u274C Event failed: " + eventName, properties);
        }
    }
};
