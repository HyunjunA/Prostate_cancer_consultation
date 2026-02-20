// RatingAnalytics.ts
// Utilities for analyzing and visualizing rating engagement data

export interface RatingEngagementData {
  topic: string;
  finalRating: number;
  ratingChangeHistory: number[];
  timeToRate: number;
  timeToFinalRating: number;
  starsHovered: number[];
  hoverDurations: { [star: number]: number };
  hoverSequence: Array<{ star: number; timestamp: number; duration: number }>;
  clickTimestamps: number[];
  hesitationTime: number;
  totalInteractionTime: number;
  recordedAt?: string;
}

export class RatingAnalytics {
  private data: RatingEngagementData[];

  constructor(data: RatingEngagementData[] = []) {
    this.data = data;
  }

  addData(newData: RatingEngagementData) {
    this.data.push(newData);
  }

  // Overall statistics
  getOverallStats() {
    if (this.data.length === 0) return null;

    return {
      totalRatings: this.data.length,
      averageRating: this.average(this.data.map((d) => d.finalRating)),
      averageTimeToRate: this.average(this.data.map((d) => d.timeToRate)),
      averageHesitation: this.average(this.data.map((d) => d.hesitationTime)),
      averageInteractionTime: this.average(
        this.data.map((d) => d.totalInteractionTime)
      ),
      ratingDistribution: this.getRatingDistribution(),
    };
  }

  // Rating distribution (how many 1-star, 2-star, etc.)
  getRatingDistribution() {
    const distribution: { [rating: number]: number } = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    this.data.forEach((d) => {
      distribution[d.finalRating] = (distribution[d.finalRating] || 0) + 1;
    });
    return distribution;
  }

  // Identify hesitant users (high hesitation time or many rating changes)
  getHesitationPatterns() {
    const hesitantUsers = this.data.filter(
      (d) => d.hesitationTime > 5 || d.ratingChangeHistory.length > 2
    );

    return {
      hesitantCount: hesitantUsers.length,
      percentageHesitant: (hesitantUsers.length / this.data.length) * 100,
      averageHesitationTime: this.average(
        hesitantUsers.map((d) => d.hesitationTime)
      ),
      topics: hesitantUsers.map((d) => ({
        topic: d.topic,
        hesitationTime: d.hesitationTime,
        changes: d.ratingChangeHistory.length,
      })),
    };
  }

  // Star exploration patterns (which stars do users hover over most?)
  getStarExplorationPatterns() {
    const starHoverCounts: { [star: number]: number } = {};
    const starHoverDurations: { [star: number]: number } = {};

    this.data.forEach((d) => {
      d.starsHovered.forEach((star) => {
        starHoverCounts[star] = (starHoverCounts[star] || 0) + 1;
      });
      Object.entries(d.hoverDurations).forEach(([star, duration]) => {
        const starNum = parseInt(star);
        starHoverDurations[starNum] =
          (starHoverDurations[starNum] || 0) + duration;
      });
    });

    return {
      hoverCounts: starHoverCounts,
      averageHoverDurations: Object.fromEntries(
        Object.entries(starHoverDurations).map(([star, total]) => [
          star,
          total / (starHoverCounts[parseInt(star)] || 1),
        ])
      ),
    };
  }

  // Rating change patterns (do users change their minds?)
  getRatingChangePatterns() {
    const ratingsWithChanges = this.data.filter(
      (d) => d.ratingChangeHistory.length > 1
    );

    const changePatterns = ratingsWithChanges.map((d) => {
      const history = d.ratingChangeHistory;
      return {
        topic: d.topic,
        initialRating: history[0],
        finalRating: history[history.length - 1],
        changeCount: history.length - 1,
        direction: history[history.length - 1] - history[0], // Positive = upgraded, negative = downgraded
      };
    });

    return {
      totalWithChanges: ratingsWithChanges.length,
      percentageWithChanges:
        (ratingsWithChanges.length / this.data.length) * 100,
      averageChanges: this.average(changePatterns.map((p) => p.changeCount)),
      upgradeCount: changePatterns.filter((p) => p.direction > 0).length,
      downgradeCount: changePatterns.filter((p) => p.direction < 0).length,
      patterns: changePatterns,
    };
  }

  // Topic-specific insights
  getTopicInsights(topic: string) {
    const topicData = this.data.filter((d) => d.topic === topic);
    if (topicData.length === 0) return null;

    return {
      topic,
      count: topicData.length,
      averageRating: this.average(topicData.map((d) => d.finalRating)),
      averageTimeToRate: this.average(topicData.map((d) => d.timeToRate)),
      averageHesitation: this.average(topicData.map((d) => d.hesitationTime)),
      ratingChanges: topicData.filter((d) => d.ratingChangeHistory.length > 1)
        .length,
    };
  }

  // Identify topics that are confusing (long time to rate, many changes)
  getConfusingTopics(threshold = { timeToRate: 10, hesitation: 5 }) {
    const topicStats = new Map<
      string,
      { times: number[]; hesitations: number[]; changes: number }
    >();

    this.data.forEach((d) => {
      if (!topicStats.has(d.topic)) {
        topicStats.set(d.topic, { times: [], hesitations: [], changes: 0 });
      }
      const stats = topicStats.get(d.topic)!;
      stats.times.push(d.timeToRate);
      stats.hesitations.push(d.hesitationTime);
      if (d.ratingChangeHistory.length > 1) stats.changes++;
    });

    const confusingTopics = Array.from(topicStats.entries())
      .map(([topic, stats]) => ({
        topic,
        averageTimeToRate: this.average(stats.times),
        averageHesitation: this.average(stats.hesitations),
        changeRate: stats.changes / stats.times.length,
        isConfusing:
          this.average(stats.times) > threshold.timeToRate ||
          this.average(stats.hesitations) > threshold.hesitation,
      }))
      .filter((t) => t.isConfusing)
      .sort((a, b) => b.averageTimeToRate - a.averageTimeToRate);

    return confusingTopics;
  }

  // Export data for further analysis
  exportToJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  exportToCSV() {
    if (this.data.length === 0) return "";

    const headers = [
      "topic",
      "finalRating",
      "timeToRate",
      "hesitationTime",
      "totalInteractionTime",
      "ratingChanges",
      "starsExplored",
      "recordedAt",
    ];

    const rows = this.data.map((d) => [
      d.topic,
      d.finalRating,
      d.timeToRate.toFixed(2),
      d.hesitationTime.toFixed(2),
      d.totalInteractionTime.toFixed(2),
      d.ratingChangeHistory.length - 1,
      d.starsHovered.length,
      d.recordedAt || "",
    ]);

    return [headers, ...rows].map((row) => row.join(",")).join("\n");
  }

  // Helper methods
  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }
}

// Example usage and integration with PostHog
export const sendRatingDataToPostHog = (data: RatingEngagementData) => {
  if (typeof window !== "undefined" && (window as any).posthog) {
    (window as any).posthog.capture("rating_engagement", {
      topic: data.topic,
      final_rating: data.finalRating,
      time_to_rate: data.timeToRate,
      hesitation_time: data.hesitationTime,
      rating_changes: data.ratingChangeHistory.length - 1,
      stars_explored: data.starsHovered.length,
      total_interaction_time: data.totalInteractionTime,
      changed_mind: data.ratingChangeHistory.length > 1,
      rating_direction:
        data.ratingChangeHistory.length > 1
          ? data.finalRating - data.ratingChangeHistory[0]
          : 0,
    });
  }
};

// Example of creating a summary report
export const generateRatingSummaryReport = (analytics: RatingAnalytics) => {
  const overall = analytics.getOverallStats();
  const hesitation = analytics.getHesitationPatterns();
  const changes = analytics.getRatingChangePatterns();
  const confusing = analytics.getConfusingTopics();

  if (!overall) return "No rating data available.";

  return `
📊 RATING ENGAGEMENT SUMMARY REPORT
====================================

Overall Statistics:
- Total Ratings: ${overall.totalRatings}
- Average Rating: ${overall.averageRating.toFixed(2)} stars
- Average Time to Rate: ${overall.averageTimeToRate.toFixed(2)}s
- Average Hesitation: ${overall.averageHesitation.toFixed(2)}s

User Behavior:
- Hesitant Users: ${hesitation.percentageHesitant.toFixed(1)}%
- Rating Changes: ${changes.percentageWithChanges.toFixed(1)}%
- Average Changes per Rating: ${changes.averageChanges.toFixed(2)}

Rating Distribution:
${Object.entries(overall.ratingDistribution)
  .map(
    ([rating, count]) =>
      `  ${rating} stars: ${count} (${(
        (count / overall.totalRatings) *
        100
      ).toFixed(1)}%)`
  )
  .join("\n")}

Potentially Confusing Topics:
${
  confusing.length > 0
    ? confusing
        .map(
          (t) => `  - ${t.topic} (avg time: ${t.averageTimeToRate.toFixed(1)}s)`
        )
        .join("\n")
    : "  None identified"
}
  `;
};
