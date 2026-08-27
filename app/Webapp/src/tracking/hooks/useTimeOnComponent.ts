import { useEffect, useRef, useState } from 'react';
import { TimeOnComponentEventProperties } from '../types/tracking.types';
import { captureEvent } from '../lib/posthog';
import { getOrCreateSession } from '../utils/session.utils';
import { sanitizeEventData } from '../config/tracking.config';

interface UseTimeOnComponentOptions {
  componentName: string;
  minDuration?: number; // minimum tracked duration (milliseconds)
  trackEngagement?: boolean; // whether to track real interactions
}

/**
 * Component dwell-time tracking hook
 * Records how long the user stayed on a component/page
 */
export const useTimeOnComponent = (options: UseTimeOnComponentOptions) => {
  const { componentName, minDuration = 1000, trackEngagement = true } = options;

  const startTimeRef = useRef<number>(Date.now());
  const engagementRef = useRef<boolean>(false);
  const [isActive, setIsActive] = useState(true);

  // interaction detection
  useEffect(() => {
    if (!trackEngagement) return;

    const handleInteraction = () => {
      engagementRef.current = true;
    };

    // detect mouse move, click, scroll and key input
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

  // send the dwell time on unmount
  useEffect(() => {
    return () => {
      const duration = Date.now() - startTimeRef.current;

      // skip if below the minimum duration
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

  // page visibility tracking (tab switches)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsActive(false);
        // record elapsed time when the tab is hidden
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
        // reset the start time when the user comes back
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
