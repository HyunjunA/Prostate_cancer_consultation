// ──────────────────────────────────────────────────────────────────────────────
// posthog.ts — Backend API Bridge
//
// Replaces the disabled PostHog integration with a buffered sender that
// delivers global hook events (clicks, scrolls, navigation, cursor proximity)
// to POST /api/tracking/events via trackingApi.sendTrackingEvents().
//
// Module-level context is set once by useTracking() so individual hooks
// (useClickPath, useScrollDepth, etc.) don't need signature changes.
// ──────────────────────────────────────────────────────────────────────────────

import { sendTrackingEvents } from "@/api/trackingApi";
import { getOrCreateSession } from "../utils/session.utils";

// ── Context store (set by useTracking via setTrackingContext) ────────────────

interface TrackingContext {
  role: string;
  file: string;
  speaker: string;
  visitType: string;
}

let _ctx: TrackingContext = { role: "", file: "", speaker: "", visitType: "" };

export function setTrackingContext(ctx: Partial<TrackingContext>): void {
  _ctx = { ..._ctx, ...ctx };
}

// ── Event buffer ────────────────────────────────────────────────────────────

interface BufferedEvent {
  eventType: string;
  elementId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

let _buffer: BufferedEvent[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;

const FLUSH_INTERVAL_MS = 10_000; // flush every 10 seconds
const MAX_BUFFER_SIZE = 50;       // or when 50 events buffered

function flushEvents(useKeepalive: boolean): void {
  if (_buffer.length === 0 || !_ctx.file) return;

  const events = [..._buffer];
  _buffer = [];

  const session = getOrCreateSession();

  sendTrackingEvents(
    session.sessionId,
    _ctx.role || "patient",
    _ctx.file,
    _ctx.speaker,
    session.deviceType,
    events,
    useKeepalive,
    _ctx.visitType,
  );
}

// ── Public API (same signatures as old posthog.ts) ──────────────────────────

/**
 * Initialize the tracking bridge — sets up periodic flush and unload handler.
 * Called by useTracking() on mount.
 */
export const initializePostHog = (): boolean => {
  if (typeof window === "undefined") return false;

  // Already initialized
  if (_flushTimer) return true;

  // Periodic flush
  _flushTimer = setInterval(() => flushEvents(false), FLUSH_INTERVAL_MS);

  // Flush on page unload (keepalive for reliable delivery)
  window.addEventListener("beforeunload", () => flushEvents(true));

  console.log(
    "%c[Tracking] Backend bridge initialized",
    "color: #10b981; font-weight: bold;"
  );
  return true;
};

/**
 * Get PostHog instance — returns null (PostHog removed).
 */
export const getPostHog = () => null;

/**
 * Check if tracking is enabled.
 */
export const isPostHogEnabled = (): boolean => true;

/**
 * Capture an event — buffers it for batch sending to Backend API.
 * All global hooks (useClickPath, useScrollDepth, etc.) call this.
 */
export const captureEvent = (
  eventName: string,
  properties?: Record<string, any>,
): void => {
  const event: BufferedEvent = {
    eventType: eventName,
    elementId:
      properties?.elementId ||
      properties?.componentName ||
      properties?.pageUrl ||
      "",
    timestamp: properties?.timestamp || new Date().toISOString(),
    metadata: properties,
  };

  _buffer.push(event);

  // Flush if buffer is full
  if (_buffer.length >= MAX_BUFFER_SIZE) {
    flushEvents(false);
  }
};
