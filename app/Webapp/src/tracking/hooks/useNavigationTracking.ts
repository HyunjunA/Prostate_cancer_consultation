import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NavigationEventProperties } from "../types/tracking.types";
import { captureEvent } from "../lib/posthog";
import { getOrCreateSession } from "../utils/session.utils";
import { sanitizeEventData } from "../config/tracking.config";

/**
 * Page navigation tracking hook (for the Next.js App Router)
 * Uses Next.js usePathname to record the navigation path
 */
export const useNavigationTracking = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousLocationRef = useRef<string>("");
  const navigationStepRef = useRef(0);

  useEffect(() => {
    // build the full URL path
    const search = searchParams?.toString();
    const currentPath = search ? `${pathname}?${search}` : pathname;
    const previousPath = previousLocationRef.current;

    // first page visit
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

    // navigation
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

      // also record the new page view
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
