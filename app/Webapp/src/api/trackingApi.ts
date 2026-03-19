/**
 * trackingApi.ts
 *
 * Sends batched interaction events from TrackingEventManager to the backend.
 * Uses fetch with keepalive for reliable delivery on page unload.
 */

// ══════════════════════════════════════════════════════════════════════════════
// Configuration
// ══════════════════════════════════════════════════════════════════════════════

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
 * @param file - Patient file identifier
 * @param speaker - Patient/user identifier
 * @param deviceType - desktop | tablet | mobile
 * @param events - Array of TrackingEvent objects from TrackingEventManager
 * @param useKeepalive - Use keepalive flag (for page unload scenarios)
 * @returns true if successful, false otherwise
 */
export async function sendTrackingEvents(
  sessionId: string,
  file: string,
  speaker: string,
  deviceType: string,
  events: TrackingEvent[],
  useKeepalive: boolean = false,
): Promise<boolean> {
  if (!events || events.length === 0) return true;

  const batch: TrackingEventBatch = {
    session_id: sessionId,
    file,
    speaker,
    device_type: deviceType,
    events: events.map(toApiEvent),
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/tracking/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.NEXT_PUBLIC_API_KEY && {
          "X-API-Key": process.env.NEXT_PUBLIC_API_KEY,
        }),
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
