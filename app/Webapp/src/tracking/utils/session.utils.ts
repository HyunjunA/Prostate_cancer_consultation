import { SessionInfo } from '../types/tracking.types';
import { getTrackingConfig } from '../config/tracking.config';

const SESSION_KEY = 'patient_dashboard_session';

/**
 * 세션 ID 생성
 */
export const generateSessionId = (): string => {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * 디바이스 타입 감지
 */
export const getDeviceType = (): 'desktop' | 'tablet' | 'mobile' => {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

/**
 * 세션 정보 가져오기 또는 생성
 */
export const getOrCreateSession = (): SessionInfo => {
  const config = getTrackingConfig();
  const stored = localStorage.getItem(SESSION_KEY);

  if (stored) {
    try {
      const session: SessionInfo = JSON.parse(stored);
      const sessionAge = Date.now() - new Date(session.startTime).getTime();

      // 세션이 아직 유효한 경우
      if (sessionAge < config.sessionDuration) {
        return session;
      }
    } catch (error) {
      console.error('Failed to parse session:', error);
    }
  }

  // 새 세션 생성
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
 * 세션 정보 업데이트
 */
export const updateSession = (updates: Partial<SessionInfo>): void => {
  const session = getOrCreateSession();
  const updated = { ...session, ...updates };
  localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
};

/**
 * 세션 종료
 */
export const endSession = (): void => {
  localStorage.removeItem(SESSION_KEY);
};
