import { useCallback, useRef } from "react";
import { ClickEventProperties } from "../types/tracking.types";
import { captureEvent } from "../lib/posthog";
import { getOrCreateSession } from "../utils/session.utils";
import { sanitizeEventData } from "../config/tracking.config";

/**
 * Click event tracking hook
 * Records what the user clicked, and in what order
 */
export const useClickPath = () => {
  const clickSequenceRef = useRef(0);

  const trackClick = useCallback(
    (
      element: HTMLElement | EventTarget | null,
      customProperties?: Record<string, any>
    ) => {
      if (!element || !(element instanceof HTMLElement)) return;

      clickSequenceRef.current += 1;

      const session = getOrCreateSession();

      const properties: ClickEventProperties = {
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        pageUrl: window.location.pathname,
        elementType: element.tagName.toLowerCase(),
        elementId: element.id || undefined,
        elementText: element.textContent?.substring(0, 50) || undefined,
        clickSequence: clickSequenceRef.current,
        ...customProperties,
      };

      // explicit click log
      console.log(
        `🖱️ CLICK #${clickSequenceRef.current}:`,
        `<${properties.elementType}${
          properties.elementId ? "#" + properties.elementId : ""
        }>`,
        properties.elementText ? `"${properties.elementText}"` : "",
        `at ${properties.pageUrl}`
      );

      // PHI filtering
      const sanitized = sanitizeEventData(properties);

      captureEvent("button_click", sanitized);
    },
    []
  );

  return { trackClick };
};
