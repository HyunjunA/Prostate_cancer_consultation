import { SessionInfo } from '../types/tracking.types';
import { getTrackingConfig } from '../config/tracking.config';

const SESSION_KEY = 'patient_dashboard_session';

/**
 * Generate a session id
 */
export const generateSessionId = (): string => {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Detect the device type
 */
export const getDeviceType = (): 'desktop' | 'tablet' | 'mobile' => {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

/**
 * Get the current session, creating one if needed
 */
export const getOrCreateSession = (): SessionInfo => {
  const config = getTrackingConfig();
  const stored = localStorage.getItem(SESSION_KEY);

  if (stored) {
    try {
      const session: SessionInfo = JSON.parse(stored);
      const sessionAge = Date.now() - new Date(session.startTime).getTime();

      // the session is still valid
      if (sessionAge < config.sessionDuration) {
        return session;
      }
    } catch (error) {
      console.error('Failed to parse session:', error);
    }
  }

  // create a new session
  const newSession: SessionInfo = {
    sessionId: generateSessionId(),
    startTime: new Date().toISOString(),
    deviceType: getDeviceType(),
    userAgent: navigator.userAgent,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
  return newSession;
};

/**
 * Update the session record
 */
export const updateSession = (updates: Partial<SessionInfo>): void => {
  const session = getOrCreateSession();
  const updated = { ...session, ...updates };
  localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
};

/**
 * End the session
 */
export const endSession = (): void => {
  localStorage.removeItem(SESSION_KEY);
};
