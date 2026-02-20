import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NavigationEventProperties } from "../types/tracking.types";
import { captureEvent } from "../lib/posthog";
import { getOrCreateSession } from "../utils/session.utils";
import { sanitizeEventData } from "../config/tracking.config";

/**
 * 페이지 네비게이션 추적 훅 (Next.js App Router용)
 * Next.js의 usePathname을 사용하여 페이지 이동 경로 추적
 */
export const useNavigationTracking = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousLocationRef = useRef<string>("");
  const navigationStepRef = useRef(0);

  useEffect(() => {
    // URL 전체 경로 생성
    const search = searchParams?.toString();
    const currentPath = search ? `${pathname}?${search}` : pathname;
    const previousPath = previousLocationRef.current;

    // 첫 페이지 방문
    if (!previousPath) {
      navigationStepRef.current = 1;
      previousLocationRef.current = currentPath;

      const session = getOrCreateSession();
      captureEvent("page_view", {
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        pageUrl: currentPath,
        navigationStep: navigationStepRef.current,
      });
      return;
    }

    // 페이지 이동
    if (currentPath !== previousPath) {
      navigationStepRef.current += 1;

      const session = getOrCreateSession();
      const properties: NavigationEventProperties = {
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        from: previousPath,
        to: currentPath,
        navigationStep: navigationStepRef.current,
      };

      captureEvent("navigation", sanitizeEventData(properties));

      // 새 페이지 뷰도 기록
      captureEvent("page_view", {
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        pageUrl: currentPath,
        navigationStep: navigationStepRef.current,
      });

      previousLocationRef.current = currentPath;
    }
  }, [pathname, searchParams]);

  return {
    currentPath: pathname,
    navigationStep: navigationStepRef.current,
  };
};
