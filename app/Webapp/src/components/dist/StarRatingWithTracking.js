"use strict";
// StarRatingWithTracking.tsx
// Enhanced Star Rating component with comprehensive passive engagement tracking
// Tracks: clicks, hovers, hover durations, rating changes, time to rate, hesitation patterns
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
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
exports.StarRatingWithTracking = void 0;
var react_1 = require("react");
var cx = function () {
    var classes = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        classes[_i] = arguments[_i];
    }
    return classes.filter(Boolean).join(" ");
};
exports.StarRatingWithTracking = function (_a) {
    var value = _a.value, onChange = _a.onChange, label = _a.label, isDark = _a.isDark, trackingName = _a.trackingName, topicName = _a.topicName, onEngagementData = _a.onEngagementData;
    // Engagement tracking state
    var _b = react_1.useState({
        topic: topicName,
        finalRating: 0,
        ratingChangeHistory: [],
        timeToRate: 0,
        timeToFinalRating: 0,
        starsHovered: [],
        hoverDurations: {},
        hoverSequence: [],
        clickTimestamps: [],
        hesitationTime: 0,
        totalInteractionTime: 0
    }), engagementData = _b[0], setEngagementData = _b[1];
    // Refs for tracking
    var mountTimeRef = react_1.useRef(Date.now());
    var firstHoverTimeRef = react_1.useRef(null);
    var firstClickTimeRef = react_1.useRef(null);
    var lastClickTimeRef = react_1.useRef(null);
    var hoverStartTimeRef = react_1.useRef({});
    var currentHoverStarRef = react_1.useRef(null);
    // Handle star hover start
    var handleStarHoverStart = react_1.useCallback(function (star) {
        var now = Date.now();
        // Record first hover time
        if (!firstHoverTimeRef.current) {
            firstHoverTimeRef.current = now;
        }
        // Start tracking hover time for this star
        hoverStartTimeRef.current[star] = now;
        currentHoverStarRef.current = star;
        // Add to hovered stars list if not already present
        setEngagementData(function (prev) {
            if (!prev.starsHovered.includes(star)) {
                return __assign(__assign({}, prev), { starsHovered: __spreadArrays(prev.starsHovered, [star]) });
            }
            return prev;
        });
    }, []);
    // Handle star hover end
    var handleStarHoverEnd = react_1.useCallback(function (star) {
        var now = Date.now();
        var startTime = hoverStartTimeRef.current[star];
        if (startTime) {
            var duration_1 = (now - startTime) / 1000; // Convert to seconds
            setEngagementData(function (prev) {
                var _a;
                var currentDuration = prev.hoverDurations[star] || 0;
                return __assign(__assign({}, prev), { hoverDurations: __assign(__assign({}, prev.hoverDurations), (_a = {}, _a[star] = currentDuration + duration_1, _a)), hoverSequence: __spreadArrays(prev.hoverSequence, [
                        { star: star, timestamp: startTime, duration: duration_1 },
                    ]) });
            });
            delete hoverStartTimeRef.current[star];
        }
        currentHoverStarRef.current = null;
    }, []);
    // Handle star click (rating change)
    var handleRatingChange = react_1.useCallback(function (newRating) {
        var now = Date.now();
        // Record first click time
        if (!firstClickTimeRef.current) {
            firstClickTimeRef.current = now;
            // Calculate hesitation time (time between first hover and first click)
            var hesitationTime_1 = firstHoverTimeRef.current
                ? (now - firstHoverTimeRef.current) / 1000
                : 0;
            var timeToRate_1 = (now - mountTimeRef.current) / 1000;
            setEngagementData(function (prev) { return (__assign(__assign({}, prev), { timeToRate: timeToRate_1,
                hesitationTime: hesitationTime_1 })); });
        }
        // Update last click time
        lastClickTimeRef.current = now;
        // Update engagement data
        setEngagementData(function (prev) {
            var newData = __assign(__assign({}, prev), { finalRating: newRating, ratingChangeHistory: __spreadArrays(prev.ratingChangeHistory, [newRating]), clickTimestamps: __spreadArrays(prev.clickTimestamps, [now]), timeToFinalRating: (now - mountTimeRef.current) / 1000, totalInteractionTime: firstHoverTimeRef.current
                    ? (now - firstHoverTimeRef.current) / 1000
                    : 0 });
            // Send tracking data via callback
            if (onEngagementData) {
                onEngagementData(newData);
            }
            return newData;
        });
        // Call original onChange
        onChange(newRating);
    }, [onChange, onEngagementData]);
    // Cleanup on unmount - finalize any ongoing hover tracking
    react_1.useEffect(function () {
        return function () {
            if (currentHoverStarRef.current !== null) {
                handleStarHoverEnd(currentHoverStarRef.current);
            }
        };
    }, [handleStarHoverEnd]);
    return (react_1["default"].createElement("div", { className: "flex items-center gap-3" },
        label && (react_1["default"].createElement("span", { className: cx("text-sm font-medium", isDark ? "text-slate-300" : "text-gray-700") }, label)),
        react_1["default"].createElement("div", { className: "flex items-center gap-1" }, [1, 2, 3, 4, 5].map(function (i) { return (react_1["default"].createElement("button", { key: i, type: "button", "aria-label": "Rate " + i, onClick: function () { return handleRatingChange(i); }, onMouseEnter: function () { return handleStarHoverStart(i); }, onMouseLeave: function () { return handleStarHoverEnd(i); }, "data-track-proximity": trackingName ? trackingName + "_Star" + i : undefined, className: cx("w-8 h-8 rounded-full grid place-items-center border transition", isDark
                ? "border-slate-700 hover:bg-slate-800"
                : "border-gray-300 hover:bg-gray-100", value >= i
                ? isDark
                    ? "bg-blue-700 text-blue-100"
                    : "bg-blue-600 text-white"
                : isDark
                    ? "text-slate-400"
                    : "text-gray-500") }, "\u2605")); }))));
};
exports["default"] = exports.StarRatingWithTracking;
