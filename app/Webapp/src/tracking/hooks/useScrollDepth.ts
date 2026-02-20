import { useEffect, useRef, useCallback } from 'react';
import { ScrollDepthEventProperties } from '../types/tracking.types';
import { captureEvent } from '../lib/posthog';
import { getOrCreateSession } from '../utils/session.utils';
import { getTrackingConfig, sanitizeEventData } from '../config/tracking.config';

/**
 * 스크롤 깊이 추적 훅
 * 사용자가 페이지를 얼마나 스크롤했는지 추적
 */
export const useScrollDepth = () => {
  const maxScrollDepthRef = useRef(0);
  const lastScrollDepthRef = useRef(0);
  const thresholdsReachedRef = useRef<Set<number>>(new Set());

  const calculateScrollDepth = useCallback((): number => {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;

    const scrollableHeight = documentHeight - windowHeight;
    if (scrollableHeight <= 0) return 100;

    const scrollPercentage = (scrollTop / scrollableHeight) * 100;
    return Math.min(Math.round(scrollPercentage), 100);
  }, []);

  const trackScrollDepth = useCallback(() => {
    const currentDepth = calculateScrollDepth();
    const config = getTrackingConfig();
    const threshold = config.scrollThreshold; // 기본 25%

    // 최대 스크롤 깊이 업데이트
    if (currentDepth > maxScrollDepthRef.current) {
      maxScrollDepthRef.current = currentDepth;
    }

    // 임계값 도달 체크 (25%, 50%, 75%, 100%)
    const thresholds = [25, 50, 75, 100];
    thresholds.forEach((t) => {
      if (
        currentDepth >= t &&
        !thresholdsReachedRef.current.has(t) &&
        t % threshold === 0
      ) {
        thresholdsReachedRef.current.add(t);

        const session = getOrCreateSession();
        const scrollDirection =
          currentDepth > lastScrollDepthRef.current ? 'down' : 'up';

        const properties: ScrollDepthEventProperties = {
          timestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          pageUrl: window.location.pathname,
          scrollDepth: t,
          maxScrollDepth: maxScrollDepthRef.current,
          scrollDirection,
        };

        captureEvent('scroll_depth', sanitizeEventData(properties));
      }
    });

    lastScrollDepthRef.current = currentDepth;
  }, [calculateScrollDepth]);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          trackScrollDepth();
          ticking = false;
        });
        ticking = true;
      }
    };

    // 스크롤 이벤트 리스너 (디바운싱 적용)
    window.addEventListener('scroll', handleScroll, { passive: true });

    // 초기 스크롤 위치 기록
    trackScrollDepth();

    return () => {
      window.removeEventListener('scroll', handleScroll);

      // 컴포넌트 언마운트 시 최종 스크롤 깊이 전송
      if (maxScrollDepthRef.current > 0) {
        const session = getOrCreateSession();
        const properties: ScrollDepthEventProperties = {
          timestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          pageUrl: window.location.pathname,
          scrollDepth: lastScrollDepthRef.current,
          maxScrollDepth: maxScrollDepthRef.current,
          scrollDirection: 'down',
        };
        captureEvent('scroll_depth_final', sanitizeEventData(properties));
      }
    };
  }, [trackScrollDepth]);

  return {
    getCurrentDepth: calculateScrollDepth,
    getMaxDepth: () => maxScrollDepthRef.current,
  };
};
