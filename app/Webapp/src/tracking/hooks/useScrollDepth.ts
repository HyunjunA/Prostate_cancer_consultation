import { useEffect, useRef, useCallback } from 'react';
import { ScrollDepthEventProperties } from '../types/tracking.types';
import { captureEvent } from '../lib/posthog';
import { getOrCreateSession } from '../utils/session.utils';
import { getTrackingConfig, sanitizeEventData } from '../config/tracking.config';

/**
 * Scroll depth tracking hook
 * Records how far down the page the user scrolled
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
    const threshold = config.scrollThreshold; // 25% by default

    // update the deepest scroll seen so far
    if (currentDepth > maxScrollDepthRef.current) {
      maxScrollDepthRef.current = currentDepth;
    }

    // threshold checks (25%, 50%, 75%, 100%)
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

    // scroll listener (debounced)
    window.addEventListener('scroll', handleScroll, { passive: true });

    // record the initial scroll position
    trackScrollDepth();

    return () => {
      window.removeEventListener('scroll', handleScroll);

      // send the final scroll depth on unmount
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
