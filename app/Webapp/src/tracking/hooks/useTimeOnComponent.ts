import { useEffect, useRef, useState } from 'react';
import { TimeOnComponentEventProperties } from '../types/tracking.types';
import { captureEvent } from '../lib/posthog';
import { getOrCreateSession } from '../utils/session.utils';
import { sanitizeEventData } from '../config/tracking.config';

interface UseTimeOnComponentOptions {
  componentName: string;
  minDuration?: number; // 최소 추적 시간 (밀리초)
  trackEngagement?: boolean; // 실제 인터랙션 추적 여부
}

/**
 * 컴포넌트 체류시간 추적 훅
 * 사용자가 특정 컴포넌트/페이지에 얼마나 머물렀는지 추적
 */
export const useTimeOnComponent = (options: UseTimeOnComponentOptions) => {
  const { componentName, minDuration = 1000, trackEngagement = true } = options;

  const startTimeRef = useRef<number>(Date.now());
  const engagementRef = useRef<boolean>(false);
  const [isActive, setIsActive] = useState(true);

  // 인터랙션 감지
  useEffect(() => {
    if (!trackEngagement) return;

    const handleInteraction = () => {
      engagementRef.current = true;
    };

    // 마우스 움직임, 클릭, 스크롤, 키보드 입력 감지
    const events = ['mousemove', 'click', 'scroll', 'keydown'];
    
    events.forEach((event) => {
      document.addEventListener(event, handleInteraction, { once: true });
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleInteraction);
      });
    };
  }, [trackEngagement]);

  // 컴포넌트 언마운트 시 체류시간 전송
  useEffect(() => {
    return () => {
      const duration = Date.now() - startTimeRef.current;

      // 최소 시간 미만이면 전송하지 않음
      if (duration < minDuration) return;

      const session = getOrCreateSession();

      const properties: TimeOnComponentEventProperties = {
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        pageUrl: window.location.pathname,
        componentName,
        duration,
        engaged: engagementRef.current,
      };

      const sanitized = sanitizeEventData(properties);
      captureEvent('time_on_component', sanitized);
    };
  }, [componentName, minDuration]);

  // 페이지 가시성 추적 (탭 전환 감지)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsActive(false);
        // 탭이 숨겨질 때 현재까지의 시간 기록
        const duration = Date.now() - startTimeRef.current;
        if (duration >= minDuration) {
          const session = getOrCreateSession();
          const properties: TimeOnComponentEventProperties = {
            timestamp: new Date().toISOString(),
            sessionId: session.sessionId,
            pageUrl: window.location.pathname,
            componentName: `${componentName}_before_hidden`,
            duration,
            engaged: engagementRef.current,
          };
          captureEvent('time_on_component', sanitizeEventData(properties));
        }
      } else {
        setIsActive(true);
        // 다시 돌아왔을 때 시작 시간 리셋
        startTimeRef.current = Date.now();
        engagementRef.current = false;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [componentName, minDuration]);

  return {
    isActive,
    getElapsedTime: () => Date.now() - startTimeRef.current,
  };
};
