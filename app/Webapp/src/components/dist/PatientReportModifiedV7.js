// PatientReport_Enhanced.tsx
// Example of how to integrate StarRatingWithTracking into existing PatientReport
// This shows the modifications needed without changing the original structure
"use client";
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
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
var react_1 = require("react");
/* ---------------------------------------------
   Rating Engagement Analytics Hook
   Collects and manages all rating engagement data
---------------------------------------------- */
var useRatingEngagementAnalytics = function () {
    var _a = react_1.useState([]), allRatingData = _a[0], setAllRatingData = _a[1];
    var recordRatingEngagement = function (data) {
        setAllRatingData(function (prev) { return __spreadArrays(prev, [
            __assign(__assign({}, data), { recordedAt: new Date().toISOString() }),
        ]); });
        // Send to analytics service (PostHog, Google Analytics, etc.)
        console.log("📊 Rating Engagement Data:", data);
        // Example: Send to PostHog
        if (typeof window !== "undefined" && window.posthog) {
            window.posthog.capture("rating_engagement", {
                topic: data.topic,
                finalRating: data.finalRating,
                timeToRate: data.timeToRate,
                hesitationTime: data.hesitationTime,
                ratingChanges: data.ratingChangeHistory.length,
                starsExplored: data.starsHovered.length,
                totalInteractionTime: data.totalInteractionTime
            });
        }
    };
    var getRatingAnalytics = function () {
        if (allRatingData.length === 0)
            return null;
        return {
            totalRatings: allRatingData.length,
            averageTimeToRate: allRatingData.reduce(function (sum, d) { return sum + d.timeToRate; }, 0) /
                allRatingData.length,
            averageHesitation: allRatingData.reduce(function (sum, d) { return sum + d.hesitationTime; }, 0) /
                allRatingData.length,
            topicsWithChanges: allRatingData.filter(function (d) { return d.ratingChangeHistory.length > 1; }).length,
            averageRating: allRatingData.reduce(function (sum, d) { return sum + d.finalRating; }, 0) /
                allRatingData.length
        };
    };
    return {
        allRatingData: allRatingData,
        recordRatingEngagement: recordRatingEngagement,
        getRatingAnalytics: getRatingAnalytics
    };
};
/* ---------------------------------------------
   EXAMPLE INTEGRATION IN MAIN COMPONENT
---------------------------------------------- */
var PatientReport = function (_a) {
    var _b = _a.isDarkMode, isDarkMode = _b === void 0 ? false : _b;
    // Original states
    var _c = react_1.useState(null), patientData = _c[0], setPatientData = _c[1];
    var _d = react_1.useState(true), loading = _d[0], setLoading = _d[1];
    var _e = react_1.useState(null), error = _e[0], setError = _e[1];
    var _f = react_1.useState(null), activeTab = _f[0], setActiveTab = _f[1];
    var _g = react_1.useState("topics"), viewMode = _g[0], setViewMode = _g[1];
    var _h = react_1.useState({
        overall: 0
    }), ratings = _h[0], setRatings = _h[1];
    var _j = react_1.useState({}), showKeys = _j[0], setShowKeys = _j[1];
    // NEW: Rating engagement analytics
    var _k = useRatingEngagementAnalytics(), recordRatingEngagement = _k.recordRatingEngagement, getRatingAnalytics = _k.getRatingAnalytics;
    // Original functions
    var toggleKeyVisibility = function (topic) {
        return setShowKeys(function (s) {
            var _a;
            return (__assign(__assign({}, s), (_a = {}, _a[topic] = !s[topic], _a)));
        });
    };
    var setTopicRating = function (topic, v) {
        return setRatings(function (r) {
            var _a;
            return (__assign(__assign({}, r), (_a = {}, _a[topic] = v, _a)));
        });
    };
    // NEW: Enhanced rating handler with engagement tracking
    var handleRatingWithEngagement = function (topic, value, engagementData) {
        setTopicRating(topic, value);
        recordRatingEngagement(engagementData);
    };
    // Example of how to use the enhanced component in render
    // Replace original StarRating with StarRatingWithTracking:
    /*
    // BEFORE:
    <StarRating
      value={ratings[activeTab] || 0}
      onChange={(v) => setTopicRating(activeTab, v)}
      label="Rate clarity"
      isDark={isDarkMode}
      trackingName={`TopicRating_${activeTab?.replace(/\s+/g, "")}`}
    />
  
    // AFTER:
    <StarRatingWithTracking
      value={ratings[activeTab] || 0}
      onChange={(v) => setTopicRating(activeTab, v)}
      label="Rate clarity"
      isDark={isDarkMode}
      trackingName={`TopicRating_${activeTab?.replace(/\s+/g, "")}`}
      topicName={activeTab || ""}
      onEngagementData={(data) => recordRatingEngagement(data)}
    />
    */
    return (react_1["default"].createElement("div", null));
};
exports["default"] = PatientReport;
