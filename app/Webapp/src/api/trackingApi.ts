/**
 * trackingApi.ts
 *
 * Sends batched interaction events from TrackingEventManager to the backend.
 * Uses fetch with keepalive for reliable delivery on page unload.
 */

// ══════════════════════════════════════════════════════════════════════════════
// Configuration
// ══════════════════════════════════════════════════════════════════════════════

const API_BASE_URL = ""; // same-origin; proxied via /api/backend/

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface TrackingEvent {
  eventType: string;
  elementId: string;
  timestamp: string;
  patientId?: string;
  visitId?: string;
  dimensionType?: string;
  metadata?: Record<string, any>;
}

interface TrackingEventBatch {
  session_id: string;
  role: string;
  visit_type?: string;
  file: string;
  speaker: string;
  device_type: string;
  events: Array<{
    event_type: string;
    element_id: string | null;
    timestamp: string;
    metadata: Record<string, any> | null;
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Helper: Convert frontend event format to API format
// ══════════════════════════════════════════════════════════════════════════════

function toApiEvent(event: TrackingEvent) {
  return {
    event_type: event.eventType,
    element_id: event.elementId || null,
    timestamp: event.timestamp,
    metadata: {
      ...event.metadata,
      ...(event.patientId && { patientId: event.patientId }),
      ...(event.visitId && { visitId: event.visitId }),
      ...(event.dimensionType && { dimensionType: event.dimensionType }),
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Main: Send events to backend
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Send a batch of tracking events to the backend.
 *
 * @param sessionId - Browser session identifier
 * @param role - "patient" or "physician"
 * @param file - Patient file identifier
 * @param speaker - Patient/user identifier
 * @param deviceType - desktop | tablet | mobile
 * @param events - Array of TrackingEvent objects from TrackingEventManager
 * @param useKeepalive - Use keepalive flag (for page unload scenarios)
 * @returns true if successful, false otherwise
 */
export async function sendTrackingEvents(
  sessionId: string,
  role: string,
  file: string,
  speaker: string,
  deviceType: string,
  events: TrackingEvent[],
  useKeepalive: boolean = false,
  visitType: string = "",
): Promise<boolean> {
  // FREEZE: legacy POST disabled during Pattern A migration.
  // The 244 component call sites still buffer events in memory, but nothing
  // is sent over the network. Phase 4 will replace call sites with the new
  // trackFirst/Followup/Doctor helpers; Phase 6 deletes this file entirely.
  return true;

  if (!events || events.length === 0) return true;

  const batch: TrackingEventBatch = {
    session_id: sessionId,
    role,
    ...(visitType && { visit_type: visitType }),
    file,
    speaker,
    device_type: deviceType,
    events: events.map(toApiEvent),
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/backend/tracking/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
      keepalive: useKeepalive,
    });

    if (!response.ok) {
      console.error(
        `[Tracking API] Failed to send events: HTTP ${response.status}`,
      );
      return false;
    }

    console.log(
      `[Tracking API] Sent ${events.length} events for session=${sessionId}`,
    );
    return true;
  } catch (error) {
    // Non-blocking: tracking failures should never affect UX
    console.error("[Tracking API] Error sending events:", error);
    return false;
  }
}

export default { sendTrackingEvents };
