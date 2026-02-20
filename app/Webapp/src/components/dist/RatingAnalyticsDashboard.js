"use strict";
// RatingAnalyticsDashboard.tsx
// Visual dashboard for displaying rating engagement analytics
// Shows charts, heatmaps, and insights from user rating behavior
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
exports.RatingAnalyticsDashboard = void 0;
var react_1 = require("react");
var cx = function () {
    var classes = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        classes[_i] = arguments[_i];
    }
    return classes.filter(Boolean).join(" ");
};
exports.RatingAnalyticsDashboard = function (_a) {
    var data = _a.data, _b = _a.isDarkMode, isDarkMode = _b === void 0 ? false : _b;
    // Calculate statistics
    var stats = react_1.useMemo(function () {
        if (data.length === 0)
            return null;
        var totalRatings = data.length;
        var avgRating = data.reduce(function (sum, d) { return sum + d.finalRating; }, 0) / totalRatings;
        var avgTimeToRate = data.reduce(function (sum, d) { return sum + d.timeToRate; }, 0) / totalRatings;
        var avgHesitation = data.reduce(function (sum, d) { return sum + d.hesitationTime; }, 0) / totalRatings;
        var withChanges = data.filter(function (d) { return d.ratingChangeHistory.length > 1; });
        var changeRate = (withChanges.length / totalRatings) * 100;
        var ratingDist = {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0
        };
        data.forEach(function (d) {
            ratingDist[d.finalRating] = (ratingDist[d.finalRating] || 0) + 1;
        });
        // Star exploration patterns
        var starHoverCounts = {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0
        };
        data.forEach(function (d) {
            d.starsHovered.forEach(function (star) {
                starHoverCounts[star] = (starHoverCounts[star] || 0) + 1;
            });
        });
        return {
            totalRatings: totalRatings,
            avgRating: avgRating,
            avgTimeToRate: avgTimeToRate,
            avgHesitation: avgHesitation,
            changeRate: changeRate,
            ratingDist: ratingDist,
            starHoverCounts: starHoverCounts,
            withChanges: withChanges
        };
    }, [data]);
    if (!stats) {
        return (react_1["default"].createElement("div", { className: cx("p-8 rounded-lg text-center", isDarkMode
                ? "bg-slate-800 text-slate-300"
                : "bg-gray-100 text-gray-600") }, "No rating engagement data available yet."));
    }
    var maxRatingCount = Math.max.apply(Math, Object.values(stats.ratingDist));
    var maxHoverCount = Math.max.apply(Math, Object.values(stats.starHoverCounts));
    return (react_1["default"].createElement("div", { className: cx("p-6 rounded-xl space-y-6", isDarkMode ? "bg-slate-900 text-slate-200" : "bg-white text-gray-800") },
        react_1["default"].createElement("div", { className: "border-b pb-4", style: { borderColor: isDarkMode ? "#334155" : "#e5e7eb" } },
            react_1["default"].createElement("h2", { className: "text-2xl font-bold mb-2" }, "Rating Engagement Analytics"),
            react_1["default"].createElement("p", { className: cx("text-sm", isDarkMode ? "text-slate-400" : "text-gray-600") },
                "Passive engagement tracking insights from ",
                stats.totalRatings,
                " ratings")),
        react_1["default"].createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" },
            react_1["default"].createElement(MetricCard, { title: "Average Rating", value: stats.avgRating.toFixed(2), icon: "\u2B50", isDark: isDarkMode }),
            react_1["default"].createElement(MetricCard, { title: "Avg Time to Rate", value: stats.avgTimeToRate.toFixed(1) + "s", icon: "\u23F1\uFE0F", isDark: isDarkMode }),
            react_1["default"].createElement(MetricCard, { title: "Avg Hesitation", value: stats.avgHesitation.toFixed(1) + "s", icon: "\uD83E\uDD14", isDark: isDarkMode }),
            react_1["default"].createElement(MetricCard, { title: "Rating Changes", value: stats.changeRate.toFixed(0) + "%", icon: "\uD83D\uDD04", isDark: isDarkMode })),
        react_1["default"].createElement("div", { className: cx("p-6 rounded-lg", isDarkMode ? "bg-slate-800" : "bg-gray-50") },
            react_1["default"].createElement("h3", { className: "text-lg font-semibold mb-4" }, "Rating Distribution"),
            react_1["default"].createElement("div", { className: "space-y-3" }, [5, 4, 3, 2, 1].map(function (rating) {
                var count = stats.ratingDist[rating];
                var percentage = (count / stats.totalRatings) * 100;
                var barWidth = (count / maxRatingCount) * 100;
                return (react_1["default"].createElement("div", { key: rating, className: "flex items-center gap-3" },
                    react_1["default"].createElement("span", { className: "text-sm font-medium w-16" },
                        rating,
                        " stars"),
                    react_1["default"].createElement("div", { className: "flex-1 h-8 bg-opacity-20 rounded overflow-hidden relative", style: {
                            backgroundColor: isDarkMode ? "#475569" : "#cbd5e1"
                        } },
                        react_1["default"].createElement("div", { className: "h-full transition-all duration-500 flex items-center justify-end pr-2", style: {
                                width: barWidth + "%",
                                backgroundColor: rating >= 4
                                    ? "#10b981"
                                    : rating >= 3
                                        ? "#fbbf24"
                                        : "#ef4444"
                            } },
                            react_1["default"].createElement("span", { className: "text-xs font-bold text-white" }, count > 0 && count + " (" + percentage.toFixed(0) + "%)")))));
            }))),
        react_1["default"].createElement("div", { className: cx("p-6 rounded-lg", isDarkMode ? "bg-slate-800" : "bg-gray-50") },
            react_1["default"].createElement("h3", { className: "text-lg font-semibold mb-4" }, "Star Exploration Patterns"),
            react_1["default"].createElement("p", { className: cx("text-sm mb-4", isDarkMode ? "text-slate-400" : "text-gray-600") }, "Which stars do users hover over most?"),
            react_1["default"].createElement("div", { className: "flex items-center justify-center gap-4" }, [1, 2, 3, 4, 5].map(function (star) {
                var count = stats.starHoverCounts[star];
                var percentage = (count / stats.totalRatings) * 100;
                var intensity = count / maxHoverCount;
                return (react_1["default"].createElement("div", { key: star, className: "flex flex-col items-center gap-2" },
                    react_1["default"].createElement("div", { className: "w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300", style: {
                            backgroundColor: "rgba(59, 130, 246, " + (0.2 + intensity * 0.8) + ")",
                            border: "2px solid rgba(59, 130, 246, " + (0.3 + intensity * 0.7) + ")"
                        } }, "\u2605"),
                    react_1["default"].createElement("div", { className: "text-center" },
                        react_1["default"].createElement("div", { className: "text-lg font-bold" }, star),
                        react_1["default"].createElement("div", { className: cx("text-xs", isDarkMode ? "text-slate-400" : "text-gray-600") },
                            percentage.toFixed(0),
                            "%"))));
            }))),
        stats.withChanges.length > 0 && (react_1["default"].createElement("div", { className: cx("p-6 rounded-lg", isDarkMode ? "bg-slate-800" : "bg-gray-50") },
            react_1["default"].createElement("h3", { className: "text-lg font-semibold mb-4" }, "Rating Change Patterns"),
            react_1["default"].createElement("p", { className: cx("text-sm mb-4", isDarkMode ? "text-slate-400" : "text-gray-600") },
                stats.withChanges.length,
                " users changed their rating"),
            react_1["default"].createElement("div", { className: "space-y-2" }, stats.withChanges.slice(0, 5).map(function (d, idx) {
                var history = d.ratingChangeHistory;
                var direction = history[history.length - 1] - history[0];
                return (react_1["default"].createElement("div", { key: idx, className: cx("p-3 rounded flex items-center justify-between", isDarkMode ? "bg-slate-700" : "bg-white") },
                    react_1["default"].createElement("span", { className: "font-medium" }, d.topic),
                    react_1["default"].createElement("div", { className: "flex items-center gap-2" },
                        react_1["default"].createElement("span", { className: cx("text-sm", isDarkMode ? "text-slate-400" : "text-gray-600") }, history.join(" → ")),
                        react_1["default"].createElement("span", { className: cx("text-xs px-2 py-1 rounded", direction > 0
                                ? "bg-green-500/20 text-green-600"
                                : direction < 0
                                    ? "bg-red-500/20 text-red-600"
                                    : "bg-gray-500/20 text-gray-600") }, direction > 0
                            ? "↑ Upgraded"
                            : direction < 0
                                ? "↓ Downgraded"
                                : "→ Same"))));
            })))),
        react_1["default"].createElement("div", { className: "flex gap-3 justify-end pt-4 border-t", style: { borderColor: isDarkMode ? "#334155" : "#e5e7eb" } },
            react_1["default"].createElement("button", { onClick: function () {
                    var csv = generateCSV(data);
                    downloadFile(csv, "rating-engagement-data.csv", "text/csv");
                }, className: cx("px-4 py-2 rounded-lg text-sm font-medium transition", isDarkMode
                    ? "bg-slate-700 hover:bg-slate-600 text-slate-200"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-800") }, "\uD83D\uDCE5 Download CSV"),
            react_1["default"].createElement("button", { onClick: function () {
                    var json = JSON.stringify(data, null, 2);
                    downloadFile(json, "rating-engagement-data.json", "application/json");
                }, className: cx("px-4 py-2 rounded-lg text-sm font-medium transition", isDarkMode
                    ? "bg-blue-700 hover:bg-blue-600"
                    : "bg-blue-600 hover:bg-blue-700 text-white") }, "\uD83D\uDCE5 Download JSON"))));
};
// Metric Card Component
var MetricCard = function (_a) {
    var title = _a.title, value = _a.value, icon = _a.icon, isDark = _a.isDark;
    return (react_1["default"].createElement("div", { className: cx("p-4 rounded-lg", isDark
            ? "bg-slate-800 border border-slate-700"
            : "bg-gray-50 border border-gray-200") },
        react_1["default"].createElement("div", { className: "flex items-center gap-2 mb-2" },
            react_1["default"].createElement("span", { className: "text-2xl" }, icon),
            react_1["default"].createElement("span", { className: cx("text-sm", isDark ? "text-slate-400" : "text-gray-600") }, title)),
        react_1["default"].createElement("div", { className: "text-2xl font-bold" }, value)));
};
// Helper functions
var generateCSV = function (data) {
    var headers = [
        "topic",
        "finalRating",
        "timeToRate",
        "hesitationTime",
        "totalInteractionTime",
        "ratingChanges",
        "starsExplored",
    ];
    var rows = data.map(function (d) { return [
        d.topic,
        d.finalRating,
        d.timeToRate.toFixed(2),
        d.hesitationTime.toFixed(2),
        d.totalInteractionTime.toFixed(2),
        d.ratingChangeHistory.length - 1,
        d.starsHovered.length,
    ]; });
    return __spreadArrays([headers], rows).map(function (row) { return row.join(","); }).join("\n");
};
var downloadFile = function (content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
exports["default"] = exports.RatingAnalyticsDashboard;
