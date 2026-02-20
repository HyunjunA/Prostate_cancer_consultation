"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize PostHog
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",

      // Configuration options
      capture_pageview: false, // We'll manually track pageviews
      autocapture: false, // Disable automatic click tracking (for HIPAA compliance)

      // Session recording (optional - be careful with PHI)
      session_recording: {
        recordCrossOriginIframes: false,
        maskAllInputs: true, // Mask all input fields
        maskTextSelector: ".sensitive", // Mask elements with this class
      },

      // Disable in development
      loaded: (posthog) => {
        if (process.env.NODE_ENV === "development") {
          posthog.opt_out_capturing();
        }
      },
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
