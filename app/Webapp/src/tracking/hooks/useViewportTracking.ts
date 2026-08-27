import { useEffect, useRef, RefObject } from 'react';
import { ViewportEventProperties } from '../types/tracking.types';
import { captureEvent } from '../lib/posthog';
import { getOrCreateSession } from '../utils/session.utils';
import { getTrackingConfig, sanitizeEventData } from '../config/tracking.config';

interface UseViewportTrackingOptions {
  componentName: string;
  threshold?: number; // 0-1, how much must be visible before we track
  triggerOnce?: boolean; // whether to track only once
  minViewDuration?: number; // minimum exposure time (milliseconds)
}

/**
 * Component viewport-exposure tracking hook
 * Records whether the user actually saw a given component
 */
export const useViewportTracking = <T extends HTMLElement>(
  options: UseViewportTrackingOptions
): RefObject<T> => {
  const {
    componentName,
    threshold = 0.5, // 50% by default
    triggerOnce = false,
    minViewDuration = 1000, // 1 second by default
  } = options;

  const elementRef = useRef<T>(null);
  const viewStartTimeRef = useRef<number | null>(null);
  const hasTriggeredRef = useRef(false);
  const maxVisibilityRef = useRef(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const config = getTrackingConfig();
    const thresholdValue = config.visibilityThreshold / 100 || threshold;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const visibilityPercentage = Math.round(
            entry.intersectionRatio * 100
          );

          // update the highest visibility seen
          if (visibilityPercentage > maxVisibilityRef.current) {
            maxVisibilityRef.current = visibilityPercentage;
          }

          if (entry.isIntersecting && entry.intersectionRatio >= thresholdValue) {
            // entered the viewport
            if (!viewStartTimeRef.current) {
              viewStartTimeRef.current = Date.now();
            }
          } else {
            // left the viewport
            if (viewStartTimeRef.current) {
              const viewDuration = Date.now() - viewStartTimeRef.current;

              // minimum exposure time check
              if (viewDuration >= minViewDuration) {
                if (!triggerOnce || !hasTriggeredRef.current) {
                  const session = getOrCreateSession();

                  const properties: ViewportEventProperties = {
                    timestamp: new Date().toISOString(),
                    sessionId: session.sessionId,
                    pageUrl: window.location.pathname,
                    componentName,
                    visibilityPercentage: maxVisibilityRef.current,
                    viewDuration,
                    wasFullyVisible: maxVisibilityRef.current >= 95,
                  };

                  captureEvent('component_view', sanitizeEventData(properties));
                  hasTriggeredRef.current = true;
                }
              }

              // reset
              viewStartTimeRef.current = null;
              maxVisibilityRef.current = 0;
            }
          }
        });
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
        rootMargin: '0px',
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();

      // handle the still-visible case on unmount
      if (viewStartTimeRef.current) {
        const viewDuration = Date.now() - viewStartTimeRef.current;
        if (viewDuration >= minViewDuration) {
          const session = getOrCreateSession();
          const properties: ViewportEventProperties = {
            timestamp: new Date().toISOString(),
            sessionId: session.sessionId,
            pageUrl: window.location.pathname,
            componentName: `${componentName}_unmount`,
            visibilityPercentage: maxVisibilityRef.current,
            viewDuration,
            wasFullyVisible: maxVisibilityRef.current >= 95,
          };
          captureEvent('component_view', sanitizeEventData(properties));
        }
      }
    };
  }, [componentName, threshold, triggerOnce, minViewDuration]);

  return elementRef;
};
