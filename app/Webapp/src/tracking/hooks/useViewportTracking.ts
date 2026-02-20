import { useEffect, useRef, RefObject } from 'react';
import { ViewportEventProperties } from '../types/tracking.types';
import { captureEvent } from '../lib/posthog';
import { getOrCreateSession } from '../utils/session.utils';
import { getTrackingConfig, sanitizeEventData } from '../config/tracking.config';

interface UseViewportTrackingOptions {
  componentName: string;
  threshold?: number; // 0-1, 얼마나 보여야 추적할지
  triggerOnce?: boolean; // 한 번만 추적할지 여부
  minViewDuration?: number; // 최소 노출 시간 (밀리초)
}

/**
 * 컴포넌트 화면 노출 추적 훅
 * 사용자가 특정 컴포넌트를 실제로 봤는지 추적
 */
export const useViewportTracking = <T extends HTMLElement>(
  options: UseViewportTrackingOptions
): RefObject<T> => {
  const {
    componentName,
    threshold = 0.5, // 기본 50%
    triggerOnce = false,
    minViewDuration = 1000, // 기본 1초
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

          // 최대 가시성 업데이트
          if (visibilityPercentage > maxVisibilityRef.current) {
            maxVisibilityRef.current = visibilityPercentage;
          }

          if (entry.isIntersecting && entry.intersectionRatio >= thresholdValue) {
            // 화면에 들어옴
            if (!viewStartTimeRef.current) {
              viewStartTimeRef.current = Date.now();
            }
          } else {
            // 화면에서 나감
            if (viewStartTimeRef.current) {
              const viewDuration = Date.now() - viewStartTimeRef.current;

              // 최소 노출 시간 체크
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

              // 리셋
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

      // 언마운트 시 아직 보고 있던 경우 처리
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
