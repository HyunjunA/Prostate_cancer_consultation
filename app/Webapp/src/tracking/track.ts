/**
 * track.ts — Pattern A behavior tracking helpers (3-area split).
 *
 * Replaces the legacy TrackingEventManager + sendTrackingEvents pipeline.
 * Each helper enforces an area-specific event vocabulary at the type level
 * and POSTs to the matching backend endpoint.
 *
 * Backend endpoints:
 *   POST /api/backend/track/patient-first
 *   POST /api/backend/track/patient-followup
 *   POST /api/backend/track/doctor
 */

// ── Page-lifetime session id ─────────────────────────────────────────────────
//
// One session_id per page mount: the active page calls startSession() on
// mount and endSession() on unmount. All trackXxx calls in between share
// that id. localStorage is intentionally NOT used so that revisiting the
// same URL or refreshing produces a fresh session.

let _activeSessionId: string | null = null;

// Session-level entry mode for the first-visit page: "report" (1st visit) or
// "survey" (2nd visit). Set once per mount via setFirstMode() so every
// trackFirst event in the session carries it without threading it through
// each call site. null until set (older callers / pre-split).
let _activeFirstMode: "report" | "survey" | null = null;

/** Tag the active first-visit session as report (1st) or survey (2nd). */
export function setFirstMode(mode: "report" | "survey"): void {
  _activeFirstMode = mode;
}

function _generate(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 13);
  return `session_${ts}_${rand}`;
}

export function startSession(): string {
  _activeSessionId = _generate();
  return _activeSessionId;
}

export function endSession(): void {
  _activeSessionId = null;
  _activeFirstMode = null;
}

function getSessionId(): string {
  if (!_activeSessionId) {
    // Lazy-init in case a tracking call fires before the page mounts (rare).
    _activeSessionId = _generate();
  }
  return _activeSessionId;
}

// ── Type-level event vocabularies (must mirror backend Literal unions) ───────

export type PatientFirstEventType =
  | "page_view"
  | "topic_open"
  | "topic_close"
  | "evidence_open"
  | "evidence_close"
  | "summary_open"
  | "summary_close"
  | "rating_click"
  | "slider_moved"
  | "answer_changed"
  | "domain_submitted"
  | "session_end";

export type PatientFollowupEventType =
  | "page_view"
  | "survey_step_view"
  | "survey_answer"
  | "survey_complete"
  | "session_end";

export type DoctorEventType =
  | "page_view"
  | "view_change"
  | "patient_select"
  | "topic_select"
  | "sentence_select"
  | "rewrite_open"
  | "rewrite_input"
  | "rewrite_apply"
  | "rubric_open"
  | "rubric_close"
  | "rubric_score_lock"
  | "tour_open"
  | "tour_end"
  | "session_end";

export type Domain = "cp" | "le" | "ed" | "inc" | "ius";
export type SurveyType = "sdm" | "dcs" | "risk_perception" | "satisfaction";
export type DoctorTargetType = "patient" | "topic" | "sentence";

// ── Event payload shapes (sent to backend) ───────────────────────────────────

export interface PatientFirstEvent {
  event_type: PatientFirstEventType;
  domain?: Domain;
  rating?: number;
  metadata?: Record<string, unknown>;
  device_type?: string;
  client_timestamp: string;
}

export interface PatientFollowupEvent {
  event_type: PatientFollowupEventType;
  survey_type?: SurveyType;
  question_id?: string;
  step_number?: number;
  metadata?: Record<string, unknown>;
  device_type?: string;
  client_timestamp: string;
}

export interface DoctorEvent {
  event_type: DoctorEventType;
  target_type?: DoctorTargetType;
  target_id?: string;
  metadata?: Record<string, unknown>;
  device_type?: string;
  client_timestamp: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const API_BASE = ""; // same-origin proxy via /api/backend

function detectDeviceType(): string {
  if (typeof window === "undefined") return "unknown";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function isoNow(): string {
  return new Date().toISOString();
}

async function postEvents(url: string, body: unknown): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (e) {
    // Non-blocking: tracking failures must never affect UX.
    console.warn("[track] POST failed:", e);
  }
}

// ── Public API: trackFirst / trackFollowup / trackDoctor ─────────────────────

/**
 * Record a single patient first-visit behavior event.
 *
 * Auto-fills client_timestamp and device_type if omitted; reads session_id
 * from localStorage. Caller MUST supply file and speaker (per-page state).
 */
export async function trackFirst(
  file: string,
  speaker: string,
  event: PatientFirstEvent | Omit<PatientFirstEvent, "client_timestamp" | "device_type">,
): Promise<void> {
  const fullEvent: PatientFirstEvent = {
    client_timestamp: isoNow(),
    device_type: detectDeviceType(),
    ...event,
  };
  await postEvents(`${API_BASE}/api/backend/track/patient-first`, {
    session_id: getSessionId(),
    file,
    speaker,
    mode: _activeFirstMode,
    events: [fullEvent],
  });
}

/**
 * Record a single patient follow-up survey behavior event.
 *
 * Note: this records BEHAVIOR metadata only (timing, ordering). The
 * canonical answer payload still goes to /api/surveys/submit which
 * persists to survey_submission_log.
 */
export async function trackFollowup(
  file: string,
  speaker: string,
  event: PatientFollowupEvent | Omit<PatientFollowupEvent, "client_timestamp" | "device_type">,
): Promise<void> {
  const fullEvent: PatientFollowupEvent = {
    client_timestamp: isoNow(),
    device_type: detectDeviceType(),
    ...event,
  };
  await postEvents(`${API_BASE}/api/backend/track/patient-followup`, {
    session_id: getSessionId(),
    file,
    speaker,
    events: [fullEvent],
  });
}

/**
 * Record a single doctor consultation behavior event.
 *
 * file may be null when the doctor is on the dashboard list view.
 */
export async function trackDoctor(
  speaker: string,
  file: string | null,
  event: DoctorEvent | Omit<DoctorEvent, "client_timestamp" | "device_type">,
): Promise<void> {
  const fullEvent: DoctorEvent = {
    client_timestamp: isoNow(),
    device_type: detectDeviceType(),
    ...event,
  };
  await postEvents(`${API_BASE}/api/backend/track/doctor`, {
    session_id: getSessionId(),
    file,
    speaker,
    events: [fullEvent],
  });
}
