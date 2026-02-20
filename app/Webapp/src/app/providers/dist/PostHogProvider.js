"use client";
"use strict";
exports.__esModule = true;
exports.PostHogProvider = void 0;
var posthog_js_1 = require("posthog-js");
var react_1 = require("posthog-js/react");
var react_2 = require("react");
function PostHogProvider(_a) {
    var children = _a.children;
    react_2.useEffect(function () {
        // Initialize PostHog
        posthog_js_1["default"].init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
            // Configuration options
            capture_pageview: false,
            autocapture: false,
            // Session recording (optional - be careful with PHI)
            session_recording: {
                recordCrossOriginIframes: false,
                maskAllInputs: true,
                maskTextSelector: ".sensitive"
            },
            // Disable in development
            loaded: function (posthog) {
                if (process.env.NODE_ENV === "development") {
                    posthog.opt_out_capturing();
                }
            }
        });
    }, []);
    return React.createElement(react_1.PostHogProvider, { client: posthog_js_1["default"] }, children);
}
exports.PostHogProvider = PostHogProvider;
