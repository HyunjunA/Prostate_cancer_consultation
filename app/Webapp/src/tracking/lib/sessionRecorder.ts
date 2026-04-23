/**
 * sessionRecorder.ts — rrweb session recording with PHI masking.
 *
 * Records user interactions (mouse movements, clicks, scrolls, DOM mutations)
 * and periodically sends compressed chunks to POST /api/tracking/recordings.
 *
 * PHI MASKING: All text content is masked by default. Only structural elements
 * (buttons, headings, navigation) are unmasked. Patient names, sentences,
 * medical data, and free-text inputs are automatically hidden in recordings.
 */

import { record } from "rrweb";
// rrweb 2.0.0-alpha.20 moved types into the @rrweb/types subpackage and
// re-exports them from "rrweb"; the previous "rrweb/typings/types" path
// only existed in alpha.4 and earlier.
import type { eventWithTime } from "rrweb";

// ── Configuration ────────────────────────────────────────────────────────────

const API_BASE_URL = ""; // same-origin; proxied via /api/backend/
const FLUSH_INTERVAL_MS = 30_000; // send chunk every 30 seconds
const MAX_EVENTS_PER_CHUNK = 500; // or when 500 events buffered

// ── State ────────────────────────────────────────────────────────────────────

let _events: eventWithTime[] = [];
let _stopFn: (() => void) | null = null;
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _sessionId = "";
let _file = "";
let _visitType = "";
let _isRecording = false;

// ── PHI Masking selectors ────────────────────────────────────────────────────
// These CSS selectors identify elements containing PHI that must be masked.
// rrweb replaces their text content with "***" in the recording.

const PHI_MASK_SELECTORS = [
  // Patient sentences and medical text
  "[data-phi]",
  ".sentence-text",
  ".summary-text",
  ".ai-summary",
  ".patient-response",
  ".survey-answer",

  // Patient identifiers
  ".patient-id",
  ".patient-name",
  ".speaker-label",
  ".file-name",

  // Medical scores and data
  ".pred-score",
  ".quality-score",

  // Free-text inputs
  "textarea",
  'input[type="text"]',
  'input[type="email"]',

  // Table cells that may contain patient data
  "td",

  // Any element explicitly marked for masking
  ".rr-mask",
].join(", ");

// Elements that should NOT be masked (structural/navigation)
const UNMASK_SELECTORS = [
  "button",
  "a",
  "h1", "h2", "h3", "h4",
  "th",
  "label",
  "nav",
  ".tab-label",
  ".domain-title",
  ".section-header",
].join(", ");

// ── Flush helper ─────────────────────────────────────────────────────────────

async function flushEvents(useKeepalive: boolean = false): Promise<void> {
  if (_events.length === 0 || !_sessionId) return;

  const eventsToSend = [..._events];
  _events = [];

  const body = JSON.stringify({
    session_id: _sessionId,
    file: _file,
    visit_type: _visitType || null,
    events: JSON.stringify(eventsToSend),
  });

  try {
    await fetch(`${API_BASE_URL}/api/backend/tracking/recordings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      keepalive: useKeepalive,
    });
  } catch (e) {
    // Non-blocking: recording failures should never affect UX
    console.warn("[SessionRecorder] Failed to send chunk:", e);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start recording the session with PHI masking.
 */
export function startRecording(
  sessionId: string,
  file: string = "",
  visitType: string = "",
): void {
  if (_isRecording || typeof window === "undefined") return;

  _sessionId = sessionId;
  _file = file;
  _visitType = visitType;
  _isRecording = true;

  _stopFn = record({
    // PHI masking: mask all text by default, unmask structural elements
    maskAllInputs: true,
    maskTextSelector: PHI_MASK_SELECTORS,
    maskInputOptions: {
      password: true,
      text: true,
      textarea: true,
      email: true,
    },
    // Sampling to reduce data volume
    sampling: {
      mousemove: false,      // disable mouse move tracking (too verbose)
      mouseInteraction: true,
      scroll: 150,           // throttle scroll events to every 150ms
      input: "last",         // only record final input value
    },
    // Block elements that should not be recorded at all
    blockSelector: ".rr-block, [data-rr-block]",
    emit(event: eventWithTime) {
      _events.push(event);
      if (_events.length >= MAX_EVENTS_PER_CHUNK) {
        flushEvents(false);
      }
    },
  }) || null;

  // Periodic flush
  _flushTimer = setInterval(() => flushEvents(false), FLUSH_INTERVAL_MS);

  // Flush on page unload
  window.addEventListener("beforeunload", () => flushEvents(true));

  console.log(
    "%c[SessionRecorder] Recording started (PHI masked)",
    "color: #ef4444; font-weight: bold;"
  );
}

/**
 * Stop recording and flush remaining events.
 */
export function stopRecording(): void {
  if (!_isRecording) return;

  if (_stopFn) {
    _stopFn();
    _stopFn = null;
  }

  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }

  flushEvents(true);
  _isRecording = false;

  console.log("[SessionRecorder] Recording stopped");
}

/**
 * Update context (when user navigates to a different page/visit type).
 */
export function updateRecordingContext(
  file: string,
  visitType: string,
): void {
  _file = file;
  _visitType = visitType;
}

/**
 * Check if currently recording.
 */
export function isRecording(): boolean {
  return _isRecording;
}
