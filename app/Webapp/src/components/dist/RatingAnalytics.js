"use strict";
// RatingAnalytics.ts
// Utilities for analyzing and visualizing rating engagement data
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
exports.generateRatingSummaryReport = exports.sendRatingDataToPostHog = exports.RatingAnalytics = void 0;
var RatingAnalytics = /** @class */ (function () {
    function RatingAnalytics(data) {
        if (data === void 0) { data = []; }
        this.data = data;
    }
    RatingAnalytics.prototype.addData = function (newData) {
        this.data.push(newData);
    };
    // Overall statistics
    RatingAnalytics.prototype.getOverallStats = function () {
        if (this.data.length === 0)
            return null;
        return {
            totalRatings: this.data.length,
            averageRating: this.average(this.data.map(function (d) { return d.finalRating; })),
            averageTimeToRate: this.average(this.data.map(function (d) { return d.timeToRate; })),
            averageHesitation: this.average(this.data.map(function (d) { return d.hesitationTime; })),
            averageInteractionTime: this.average(this.data.map(function (d) { return d.totalInteractionTime; })),
            ratingDistribution: this.getRatingDistribution()
        };
    };
    // Rating distribution (how many 1-star, 2-star, etc.)
    RatingAnalytics.prototype.getRatingDistribution = function () {
        var distribution = {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0
        };
        this.data.forEach(function (d) {
            distribution[d.finalRating] = (distribution[d.finalRating] || 0) + 1;
        });
        return distribution;
    };
    // Identify hesitant users (high hesitation time or many rating changes)
    RatingAnalytics.prototype.getHesitationPatterns = function () {
        var hesitantUsers = this.data.filter(function (d) { return d.hesitationTime > 5 || d.ratingChangeHistory.length > 2; });
        return {
            hesitantCount: hesitantUsers.length,
            percentageHesitant: (hesitantUsers.length / this.data.length) * 100,
            averageHesitationTime: this.average(hesitantUsers.map(function (d) { return d.hesitationTime; })),
            topics: hesitantUsers.map(function (d) { return ({
                topic: d.topic,
                hesitationTime: d.hesitationTime,
                changes: d.ratingChangeHistory.length
            }); })
        };
    };
    // Star exploration patterns (which stars do users hover over most?)
    RatingAnalytics.prototype.getStarExplorationPatterns = function () {
        var starHoverCounts = {};
        var starHoverDurations = {};
        this.data.forEach(function (d) {
            d.starsHovered.forEach(function (star) {
                starHoverCounts[star] = (starHoverCounts[star] || 0) + 1;
            });
            Object.entries(d.hoverDurations).forEach(function (_a) {
                var star = _a[0], duration = _a[1];
                var starNum = parseInt(star);
                starHoverDurations[starNum] =
                    (starHoverDurations[starNum] || 0) + duration;
            });
        });
        return {
            hoverCounts: starHoverCounts,
            averageHoverDurations: Object.fromEntries(Object.entries(starHoverDurations).map(function (_a) {
                var star = _a[0], total = _a[1];
                return [
                    star,
                    total / (starHoverCounts[parseInt(star)] || 1),
                ];
            }))
        };
    };
    // Rating change patterns (do users change their minds?)
    RatingAnalytics.prototype.getRatingChangePatterns = function () {
        var ratingsWithChanges = this.data.filter(function (d) { return d.ratingChangeHistory.length > 1; });
        var changePatterns = ratingsWithChanges.map(function (d) {
            var history = d.ratingChangeHistory;
            return {
                topic: d.topic,
                initialRating: history[0],
                finalRating: history[history.length - 1],
                changeCount: history.length - 1,
                direction: history[history.length - 1] - history[0]
            };
        });
        return {
            totalWithChanges: ratingsWithChanges.length,
            percentageWithChanges: (ratingsWithChanges.length / this.data.length) * 100,
            averageChanges: this.average(changePatterns.map(function (p) { return p.changeCount; })),
            upgradeCount: changePatterns.filter(function (p) { return p.direction > 0; }).length,
            downgradeCount: changePatterns.filter(function (p) { return p.direction < 0; }).length,
            patterns: changePatterns
        };
    };
    // Topic-specific insights
    RatingAnalytics.prototype.getTopicInsights = function (topic) {
        var topicData = this.data.filter(function (d) { return d.topic === topic; });
        if (topicData.length === 0)
            return null;
        return {
            topic: topic,
            count: topicData.length,
            averageRating: this.average(topicData.map(function (d) { return d.finalRating; })),
            averageTimeToRate: this.average(topicData.map(function (d) { return d.timeToRate; })),
            averageHesitation: this.average(topicData.map(function (d) { return d.hesitationTime; })),
            ratingChanges: topicData.filter(function (d) { return d.ratingChangeHistory.length > 1; })
                .length
        };
    };
    // Identify topics that are confusing (long time to rate, many changes)
    RatingAnalytics.prototype.getConfusingTopics = function (threshold) {
        var _this = this;
        if (threshold === void 0) { threshold = { timeToRate: 10, hesitation: 5 }; }
        var topicStats = new Map();
        this.data.forEach(function (d) {
            if (!topicStats.has(d.topic)) {
                topicStats.set(d.topic, { times: [], hesitations: [], changes: 0 });
            }
            var stats = topicStats.get(d.topic);
            stats.times.push(d.timeToRate);
            stats.hesitations.push(d.hesitationTime);
            if (d.ratingChangeHistory.length > 1)
                stats.changes++;
        });
        var confusingTopics = Array.from(topicStats.entries())
            .map(function (_a) {
            var topic = _a[0], stats = _a[1];
            return ({
                topic: topic,
                averageTimeToRate: _this.average(stats.times),
                averageHesitation: _this.average(stats.hesitations),
                changeRate: stats.changes / stats.times.length,
                isConfusing: _this.average(stats.times) > threshold.timeToRate ||
                    _this.average(stats.hesitations) > threshold.hesitation
            });
        })
            .filter(function (t) { return t.isConfusing; })
            .sort(function (a, b) { return b.averageTimeToRate - a.averageTimeToRate; });
        return confusingTopics;
    };
    // Export data for further analysis
    RatingAnalytics.prototype.exportToJSON = function () {
        return JSON.stringify(this.data, null, 2);
    };
    RatingAnalytics.prototype.exportToCSV = function () {
        if (this.data.length === 0)
            return "";
        var headers = [
            "topic",
            "finalRating",
            "timeToRate",
            "hesitationTime",
            "totalInteractionTime",
            "ratingChanges",
            "starsExplored",
            "recordedAt",
        ];
        var rows = this.data.map(function (d) { return [
            d.topic,
            d.finalRating,
            d.timeToRate.toFixed(2),
            d.hesitationTime.toFixed(2),
            d.totalInteractionTime.toFixed(2),
            d.ratingChangeHistory.length - 1,
            d.starsHovered.length,
            d.recordedAt || "",
        ]; });
        return __spreadArrays([headers], rows).map(function (row) { return row.join(","); }).join("\n");
    };
    // Helper methods
    RatingAnalytics.prototype.average = function (numbers) {
        if (numbers.length === 0)
            return 0;
        return numbers.reduce(function (sum, n) { return sum + n; }, 0) / numbers.length;
    };
    return RatingAnalytics;
}());
exports.RatingAnalytics = RatingAnalytics;
// Example usage and integration with PostHog
exports.sendRatingDataToPostHog = function (data) {
    if (typeof window !== "undefined" && window.posthog) {
        window.posthog.capture("rating_engagement", {
            topic: data.topic,
            final_rating: data.finalRating,
            time_to_rate: data.timeToRate,
            hesitation_time: data.hesitationTime,
            rating_changes: data.ratingChangeHistory.length - 1,
            stars_explored: data.starsHovered.length,
            total_interaction_time: data.totalInteractionTime,
            changed_mind: data.ratingChangeHistory.length > 1,
            rating_direction: data.ratingChangeHistory.length > 1
                ? data.finalRating - data.ratingChangeHistory[0]
                : 0
        });
    }
};
// Example of creating a summary report
exports.generateRatingSummaryReport = function (analytics) {
    var overall = analytics.getOverallStats();
    var hesitation = analytics.getHesitationPatterns();
    var changes = analytics.getRatingChangePatterns();
    var confusing = analytics.getConfusingTopics();
    if (!overall)
        return "No rating data available.";
    return "\n\uD83D\uDCCA RATING ENGAGEMENT SUMMARY REPORT\n====================================\n\nOverall Statistics:\n- Total Ratings: " + overall.totalRatings + "\n- Average Rating: " + overall.averageRating.toFixed(2) + " stars\n- Average Time to Rate: " + overall.averageTimeToRate.toFixed(2) + "s\n- Average Hesitation: " + overall.averageHesitation.toFixed(2) + "s\n\nUser Behavior:\n- Hesitant Users: " + hesitation.percentageHesitant.toFixed(1) + "%\n- Rating Changes: " + changes.percentageWithChanges.toFixed(1) + "%\n- Average Changes per Rating: " + changes.averageChanges.toFixed(2) + "\n\nRating Distribution:\n" + Object.entries(overall.ratingDistribution)
        .map(function (_a) {
        var rating = _a[0], count = _a[1];
        return "  " + rating + " stars: " + count + " (" + ((count / overall.totalRatings) *
            100).toFixed(1) + "%)";
    })
        .join("\n") + "\n\nPotentially Confusing Topics:\n" + (confusing.length > 0
        ? confusing
            .map(function (t) { return "  - " + t.topic + " (avg time: " + t.averageTimeToRate.toFixed(1) + "s)"; })
            .join("\n")
        : "  None identified") + "\n  ";
};
