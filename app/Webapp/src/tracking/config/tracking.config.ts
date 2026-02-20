import { TrackingConfig } from "../types/tracking.types";

/**
 * localhost 환경인지 확인
 */
const isLocalhost = (): boolean => {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.endsWith(".local")
  );
};

/**
 * 환경변수에서 추적 설정을 가져옴
 * CRITICAL: PHI 데이터는 절대 추적하지 않음
 *
 * ⭐ localhost에서는 항상 enabled=true
 */
export const getTrackingConfig = (): TrackingConfig => {
  const envEnabled = process.env.REACT_APP_ENABLE_POSTHOG === "true";
  const isDebug = process.env.REACT_APP_TRACKING_DEBUG === "true";
  const isLocal = isLocalhost();

  // 🎯 localhost에서는 환경변수 관계없이 항상 활성화
  const enabled = isLocal ? true : envEnabled;

  if (isLocal && !envEnabled) {
    console.log(
      "🏠 [Tracking] Auto-enabled for localhost (no PostHog sending, logs only)"
    );
  }

  return {
    enabled,
    debug: isDebug || isLocal, // localhost면 디버그도 자동 활성화
    apiKey: process.env.REACT_APP_POSTHOG_API_KEY,
    apiHost: process.env.REACT_APP_POSTHOG_HOST || "https://app.posthog.com",
    sessionDuration: 30 * 60 * 1000, // 30분
    scrollThreshold: 25, // 25% 단위로 추적
    visibilityThreshold: 50, // 50% 이상 보일 때 추적
  };
};

/**
 * 디버그 로그 출력 - localhost에서는 항상 활성화
 */
export const debugLog = (message: string, data?: any) => {
  const config = getTrackingConfig();
  const isLocal = isLocalhost();

  // localhost이거나 debug 모드면 항상 로그 출력
  if (isLocal || config.debug) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c[Tracking ${timestamp}]%c ${message}`,
      "color: #2563eb; font-weight: bold",
      "color: inherit",
      data || ""
    );
  }
};

/**
 * PHI 필터링 - 민감한 정보 제거
 * CRITICAL: 프로덕션에서 PHI가 절대 추적되지 않도록 보장
 */
export const sanitizeEventData = (
  data: Record<string, any>
): Record<string, any> => {
  const phiKeywords = [
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

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    const containsPHI = phiKeywords.some((keyword) =>
      keyLower.includes(keyword)
    );

    if (!containsPHI) {
      sanitized[key] = value;
    } else {
      console.warn(`⚠️ PHI keyword detected and removed: ${key}`);
      debugLog(`⚠️ PHI keyword detected and removed: ${key}`);
    }
  }

  return sanitized;
};

/**
 * localhost 환경인지 확인하는 헬퍼 함수 (export)
 */
export { isLocalhost };
