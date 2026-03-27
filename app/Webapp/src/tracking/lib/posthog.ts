// ──────────────────────────────────────────────────────────────────────────────
// PostHog disabled — not currently in use.
// All PostHog initialization, capture, and helper functions commented out.
// Stub exports kept so existing imports don't break at build time.
// ──────────────────────────────────────────────────────────────────────────────

// import posthog from "posthog-js";
// import {
//   getTrackingConfig,
//   debugLog,
//   isLocalhost,
// } from "../config/tracking.config";

/**
 * PostHog 초기화 (disabled)
 */
export const initializePostHog = (): boolean => {
  // const config = getTrackingConfig();
  // const isLocal = isLocalhost();
  //
  // if (!config.enabled) {
  //   debugLog("PostHog is DISABLED via environment variable");
  //   return false;
  // }
  //
  // if (isLocal) {
  //   if (!config.apiKey) {
  //     console.log(
  //       "🏠 [Tracking] Running in LOCAL LOG MODE (events logged to console only)"
  //     );
  //     debugLog("✅ Local log mode enabled - no PostHog server connection");
  //     return true;
  //   } else {
  //     console.log("🏠 [Tracking] Running on localhost with PostHog API key");
  //   }
  // }
  //
  // if (!config.apiKey && !isLocal) {
  //   console.warn("[PostHog] API key not found. Tracking disabled.");
  //   return false;
  // }
  //
  // if (config.apiKey) {
  //   try {
  //     posthog.init(config.apiKey, {
  //       api_host: config.apiHost,
  //       mask_all_text: false,
  //       mask_all_element_attributes: false,
  //       capture_pageview: false,
  //       capture_pageleave: true,
  //       loaded: (ph) => {
  //         debugLog("PostHog initialized successfully", {
  //           apiHost: config.apiHost,
  //           distinctId: ph.get_distinct_id(),
  //         });
  //       },
  //       persistence: "localStorage",
  //       disable_session_recording: true,
  //     });
  //     return true;
  //   } catch (error) {
  //     console.error("[PostHog] Initialization failed:", error);
  //     return false;
  //   }
  // }
  //
  // return true;
  return false;
};

/**
 * PostHog 인스턴스 가져오기 (disabled)
 */
export const getPostHog = () => {
  // const config = getTrackingConfig();
  // return config.enabled ? posthog : null;
  return null;
};

/**
 * PostHog가 활성화되어 있는지 확인 (disabled)
 */
export const isPostHogEnabled = (): boolean => {
  // const config = getTrackingConfig();
  // if (!config.enabled) return false;
  // const isLocal = isLocalhost();
  // if (isLocal) return true;
  // return config.apiKey !== undefined && posthog.__loaded;
  return false;
};

/**
 * 이벤트 전송 (disabled — no-op)
 */
export const captureEvent = (
  eventName: string,
  properties?: Record<string, any>
): void => {
  // const config = getTrackingConfig();
  // const isLocal = isLocalhost();
  //
  // if (!config.enabled) {
  //   debugLog(`❌ Event not sent (tracking disabled): ${eventName}`, properties);
  //   return;
  // }
  //
  // if (isLocal && !config.apiKey) {
  //   console.log(
  //     `%c📊 EVENT: ${eventName}%c`,
  //     "color: #10b981; font-weight: bold; font-size: 12px;",
  //     "color: inherit",
  //     properties
  //   );
  //   debugLog(`📊 Event captured (local only): ${eventName}`, properties);
  //   return;
  // }
  //
  // if (config.apiKey) {
  //   try {
  //     posthog.capture(eventName, properties);
  //     debugLog(`✅ Event sent to PostHog: ${eventName}`, properties);
  //     if (isLocal) {
  //       console.log(
  //         `%c📊 EVENT: ${eventName}%c (sent to PostHog)`,
  //         "color: #10b981; font-weight: bold; font-size: 12px;",
  //         "color: inherit",
  //         properties
  //       );
  //     }
  //   } catch (error) {
  //     console.error("[PostHog] Failed to capture event:", error);
  //     debugLog(`❌ Event failed: ${eventName}`, properties);
  //   }
  // }
};
