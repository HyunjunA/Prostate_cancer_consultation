"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
exports.__esModule = true;
exports.useGlobalCursorProximity = void 0;
var react_1 = require("react");
var posthog_1 = require("../lib/posthog");
var session_utils_1 = require("../utils/session.utils");
var tracking_config_1 = require("../config/tracking.config");
/**
 * Global Cursor Proximity Tracking Hook
 * Automatically tracks cursor proximity to elements with tracking attributes
 */
exports.useGlobalCursorProximity = function (options) {
    var _a = options || {}, _b = _a.selector, selector = _b === void 0 ? "[data-track-proximity], .track-proximity" : _b, _c = _a.thresholds, thresholds = _c === void 0 ? {
        veryClose: 50,
        near: 150,
        medium: 300
    } : _c, _d = _a.throttleMs, throttleMs = _d === void 0 ? 500 : _d, _e = _a.maxTrackingDistance, maxTrackingDistance = _e === void 0 ? 400 : _e, _f = _a.autoTrackInteractive, autoTrackInteractive = _f === void 0 ? false : _f;
    var trackedElementsRef = react_1.useRef(new Map());
    var mousePositionRef = react_1.useRef({ x: 0, y: 0 });
    var rafIdRef = react_1.useRef(null);
    /**
     * Calculate distance between two points
     */
    var calculateDistance = function (x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    };
    /**
     * Get proximity level based on distance
     */
    var getProximityLevel = function (distance) {
        if (distance <= thresholds.veryClose)
            return "very-close";
        if (distance <= thresholds.near)
            return "near";
        if (distance <= thresholds.medium)
            return "medium";
        return "far";
    };
    /**
     * Get element center point
     */
    var getElementCenter = function (element) {
        var rect = element.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    };
    /**
     * Extract component name from element
     */
    var getComponentName = function (element) {
        var _a;
        // 1. data-track-proximity attribute
        var dataTrack = element.getAttribute("data-track-proximity");
        if (dataTrack) {
            console.log("\u2705 Found tracking attribute: \"" + dataTrack + "\" on", element);
            return dataTrack;
        }
        // 2. data-component-name attribute
        var dataComponent = element.getAttribute("data-component-name");
        if (dataComponent) {
            console.log("\u2705 Found component-name: \"" + dataComponent + "\" on", element);
            return dataComponent;
        }
        // 3. Auto-generate for interactive elements
        if (autoTrackInteractive) {
            var tagName = element.tagName.toLowerCase();
            var id = element.id;
            var text = (_a = element.textContent) === null || _a === void 0 ? void 0 : _a.trim().substring(0, 20);
            if (id)
                return tagName + "_" + id;
            if (text)
                return tagName + "_" + text.replace(/\s+/g, "_");
            return tagName + "_" + Math.random().toString(36).substring(7);
        }
        return null;
    };
    /**
     * Find all trackable elements in DOM
     */
    var findTrackableElements = function () {
        var elements = [];
        // 1. Find elements matching selector
        document.querySelectorAll(selector).forEach(function (el) {
            var componentName = getComponentName(el);
            if (componentName) {
                elements.push(el);
                console.log("\uD83D\uDD0D Tracking element: \"" + componentName + "\"", el);
            }
        });
        // 2. Auto-track interactive elements if enabled
        if (autoTrackInteractive) {
            document
                .querySelectorAll('button, a, [role="button"]')
                .forEach(function (el) {
                if (!elements.includes(el)) {
                    var componentName = getComponentName(el);
                    if (componentName) {
                        elements.push(el);
                        console.log("\uD83D\uDD0D Auto-tracking: \"" + componentName + "\"", el);
                    }
                }
            });
        }
        console.log("\uD83D\uDCCA Total trackable elements found: " + elements.length);
        return elements;
    };
    /**
     * Send proximity event to PostHog
     */
    var sendProximityEvent = function (componentName, distance, proximityLevel, elementCenter, hoverDuration) {
        var session = session_utils_1.getOrCreateSession();
        var properties = __assign({ timestamp: new Date().toISOString(), sessionId: session.sessionId, pageUrl: window.location.pathname, componentName: componentName, distance: Math.round(distance), proximityLevel: proximityLevel, cursorX: Math.round(mousePositionRef.current.x), cursorY: Math.round(mousePositionRef.current.y), componentCenter: {
                x: Math.round(elementCenter.x),
                y: Math.round(elementCenter.y)
            } }, (hoverDuration && { hoverDuration: hoverDuration }));
        var sanitized = tracking_config_1.sanitizeEventData(properties);
        posthog_1.captureEvent("cursor_proximity", sanitized);
        tracking_config_1.debugLog("\uD83C\uDFAF Global Cursor " + proximityLevel + " to " + componentName + " (" + Math.round(distance) + "px)", { proximityLevel: proximityLevel, distance: Math.round(distance) });
    };
    /**
     * Update all tracked elements
     */
    var updateAllElements = function () {
        var now = Date.now();
        var cursorX = mousePositionRef.current.x;
        var cursorY = mousePositionRef.current.y;
        trackedElementsRef.current.forEach(function (tracked, element) {
            // Check if element still exists in DOM
            if (!document.body.contains(element)) {
                trackedElementsRef.current["delete"](element);
                return;
            }
            var elementCenter = getElementCenter(element);
            var distance = calculateDistance(cursorX, cursorY, elementCenter.x, elementCenter.y);
            // Beyond max tracking distance -> set to far
            if (distance > maxTrackingDistance) {
                // End hover if was tracking
                if (tracked.proximityLevel !== "far" && tracked.hoverStartTime) {
                    var hoverDuration = now - tracked.hoverStartTime;
                    posthog_1.captureEvent("cursor_proximity_leave", tracking_config_1.sanitizeEventData({
                        timestamp: new Date().toISOString(),
                        sessionId: session_utils_1.getOrCreateSession().sessionId,
                        pageUrl: window.location.pathname,
                        componentName: tracked.componentName,
                        distance: 0,
                        proximityLevel: "far",
                        cursorX: 0,
                        cursorY: 0,
                        componentCenter: elementCenter,
                        hoverDuration: hoverDuration
                    }));
                    tracked.hoverStartTime = null;
                }
                tracked.proximityLevel = "far";
                tracked.distance = distance;
                return;
            }
            var proximityLevel = getProximityLevel(distance);
            // Throttling: don't send too frequently
            if (now - tracked.lastEventTime < throttleMs) {
                return;
            }
            // Only send event when proximity level changes
            if (proximityLevel !== tracked.proximityLevel) {
                // Start hover
                if (proximityLevel !== "far" && !tracked.hoverStartTime) {
                    tracked.hoverStartTime = now;
                }
                // End hover
                if (proximityLevel === "far" && tracked.hoverStartTime) {
                    var hoverDuration = now - tracked.hoverStartTime;
                    sendProximityEvent(tracked.componentName, distance, proximityLevel, elementCenter, hoverDuration);
                    tracked.hoverStartTime = null;
                }
                else {
                    sendProximityEvent(tracked.componentName, distance, proximityLevel, elementCenter);
                }
                tracked.proximityLevel = proximityLevel;
                tracked.lastEventTime = now;
            }
            tracked.distance = distance;
        });
    };
    /**
     * Schedule update using requestAnimationFrame
     */
    var scheduleUpdate = function () {
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
        }
        rafIdRef.current = requestAnimationFrame(function () {
            updateAllElements();
            rafIdRef.current = null;
        });
    };
    /**
     * Mouse move handler
     */
    var handleMouseMove = function (event) {
        mousePositionRef.current = {
            x: event.clientX,
            y: event.clientY
        };
        scheduleUpdate();
    };
    /**
     * Rescan DOM for trackable elements
     */
    var rescanElements = function () {
        var elements = findTrackableElements();
        elements.forEach(function (element) {
            if (!trackedElementsRef.current.has(element)) {
                var componentName = getComponentName(element);
                if (componentName) {
                    trackedElementsRef.current.set(element, {
                        element: element,
                        componentName: componentName,
                        distance: Infinity,
                        proximityLevel: "far",
                        hoverStartTime: null,
                        lastEventTime: 0
                    });
                }
            }
        });
        console.log("\uD83D\uDCC8 Tracking " + trackedElementsRef.current.size + " elements after rescan");
    };
    // Initialize and setup event listeners
    react_1.useEffect(function () {
        console.log("%c🎯 GLOBAL CURSOR PROXIMITY INITIALIZED", "background: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;");
        console.log("\uD83D\uDCCD Selector: \"" + selector + "\"");
        console.log("\uD83D\uDD18 Auto-track interactive: " + autoTrackInteractive);
        // Initial scan
        rescanElements();
        // Mouse move event
        document.addEventListener("mousemove", handleMouseMove, { passive: true });
        // MutationObserver to detect DOM changes
        var observer = new MutationObserver(function (mutations) {
            // Only rescan if new elements were added
            var hasNewElements = mutations.some(function (mutation) { return mutation.addedNodes.length > 0; });
            if (hasNewElements) {
                console.log("🔄 DOM changed, rescanning elements...");
                rescanElements();
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        console.log("[Global Cursor Proximity] 🎯 Tracking enabled");
        return function () {
            document.removeEventListener("mousemove", handleMouseMove);
            observer.disconnect();
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
            }
            // Send leave events for all tracked elements
            trackedElementsRef.current.forEach(function (tracked) {
                if (tracked.hoverStartTime) {
                    var hoverDuration = Date.now() - tracked.hoverStartTime;
                    posthog_1.captureEvent("cursor_proximity_leave", tracking_config_1.sanitizeEventData({
                        timestamp: new Date().toISOString(),
                        sessionId: session_utils_1.getOrCreateSession().sessionId,
                        pageUrl: window.location.pathname,
                        componentName: tracked.componentName,
                        distance: 0,
                        proximityLevel: "far",
                        cursorX: 0,
                        cursorY: 0,
                        componentCenter: getElementCenter(tracked.element),
                        hoverDuration: hoverDuration
                    }));
                }
            });
        };
    }, [selector, autoTrackInteractive, throttleMs, maxTrackingDistance]);
    return {
        trackedElementsCount: trackedElementsRef.current.size
    };
};
