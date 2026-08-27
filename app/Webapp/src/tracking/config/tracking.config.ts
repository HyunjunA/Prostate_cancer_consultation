import { TrackingConfig } from "../types/tracking.types";

/**
 * Check whether we are running on localhost
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
 * Read the tracking configuration from environment variables
 * CRITICAL: PHI is never tracked
 *
 * On localhost, enabled is always true
 */
export const getTrackingConfig = (): TrackingConfig => {
  const envEnabled = process.env.REACT_APP_ENABLE_POSTHOG === "true";
  const isDebug = process.env.REACT_APP_TRACKING_DEBUG === "true";
  const isLocal = isLocalhost();

  // On localhost, always enabled regardless of the env var
  const enabled = isLocal ? true : envEnabled;

  if (isLocal && !envEnabled) {
    console.log(
      "🏠 [Tracking] Auto-enabled for localhost (no PostHog sending, logs only)"
    );
  }

  return {
    enabled,
    debug: isDebug || isLocal, // debug turns on automatically on localhost
    apiKey: process.env.REACT_APP_POSTHOG_API_KEY,
    apiHost: process.env.REACT_APP_POSTHOG_HOST || "https://app.posthog.com",
    sessionDuration: 30 * 60 * 1000, // 30 minutes
    scrollThreshold: 25, // track in 25% steps
    visibilityThreshold: 50, // track once at least 50% is visible
  };
};

/**
 * Debug logging — always on for localhost
 */
export const debugLog = (message: string, data?: any) => {
  const config = getTrackingConfig();
  const isLocal = isLocalhost();

  // always log on localhost or in debug mode
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
 * PHI filtering — strip sensitive fields
 * CRITICAL: guarantees PHI is never tracked in production
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
 * Exported helper: are we running on localhost?
 */
export { isLocalhost };
