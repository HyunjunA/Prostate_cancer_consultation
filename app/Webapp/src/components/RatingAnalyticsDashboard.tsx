// RatingAnalyticsDashboard.tsx
// Visual dashboard for displaying rating engagement analytics
// Shows charts, heatmaps, and insights from user rating behavior

import React, { useMemo } from "react";
import { RatingEngagementData } from "./RatingAnalytics";

interface RatingAnalyticsDashboardProps {
  data: RatingEngagementData[];
  isDarkMode?: boolean;
}

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

export const RatingAnalyticsDashboard: React.FC<
  RatingAnalyticsDashboardProps
> = ({ data, isDarkMode = false }) => {
  // Calculate statistics
  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const totalRatings = data.length;
    const avgRating =
      data.reduce((sum, d) => sum + d.finalRating, 0) / totalRatings;
    const avgTimeToRate =
      data.reduce((sum, d) => sum + d.timeToRate, 0) / totalRatings;
    const avgHesitation =
      data.reduce((sum, d) => sum + d.hesitationTime, 0) / totalRatings;

    const withChanges = data.filter((d) => d.ratingChangeHistory.length > 1);
    const changeRate = (withChanges.length / totalRatings) * 100;

    const ratingDist: { [k: number]: number } = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    data.forEach((d) => {
      ratingDist[d.finalRating] = (ratingDist[d.finalRating] || 0) + 1;
    });

    // Star exploration patterns
    const starHoverCounts: { [k: number]: number } = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    data.forEach((d) => {
      d.starsHovered.forEach((star) => {
        starHoverCounts[star] = (starHoverCounts[star] || 0) + 1;
      });
    });

    return {
      totalRatings,
      avgRating,
      avgTimeToRate,
      avgHesitation,
      changeRate,
      ratingDist,
      starHoverCounts,
      withChanges,
    };
  }, [data]);

  if (!stats) {
    return (
      <div
        className={cx(
          "p-8 rounded-lg text-center",
          isDarkMode
            ? "bg-slate-800 text-slate-300"
            : "bg-gray-100 text-gray-600"
        )}
      >
        No rating engagement data available yet.
      </div>
    );
  }

  const maxRatingCount = Math.max(...Object.values(stats.ratingDist));
  const maxHoverCount = Math.max(...Object.values(stats.starHoverCounts));

  return (
    <div
      className={cx(
        "p-6 rounded-xl space-y-6",
        isDarkMode ? "bg-slate-900 text-slate-200" : "bg-white text-gray-800"
      )}
    >
      {/* Header */}
      <div
        className="border-b pb-4"
        style={{ borderColor: isDarkMode ? "#334155" : "#e5e7eb" }}
      >
        <h2 className="text-2xl font-bold mb-2">Rating Engagement Analytics</h2>
        <p
          className={cx(
            "text-sm",
            isDarkMode ? "text-slate-400" : "text-gray-600"
          )}
        >
          Passive engagement tracking insights from {stats.totalRatings} ratings
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Average Rating"
          value={stats.avgRating.toFixed(2)}
          icon="⭐"
          isDark={isDarkMode}
        />
        <MetricCard
          title="Avg Time to Rate"
          value={`${stats.avgTimeToRate.toFixed(1)}s`}
          icon="⏱️"
          isDark={isDarkMode}
        />
        <MetricCard
          title="Avg Hesitation"
          value={`${stats.avgHesitation.toFixed(1)}s`}
          icon="🤔"
          isDark={isDarkMode}
        />
        <MetricCard
          title="Rating Changes"
          value={`${stats.changeRate.toFixed(0)}%`}
          icon="🔄"
          isDark={isDarkMode}
        />
      </div>

      {/* Rating Distribution */}
      <div
        className={cx(
          "p-6 rounded-lg",
          isDarkMode ? "bg-slate-800" : "bg-gray-50"
        )}
      >
        <h3 className="text-lg font-semibold mb-4">Rating Distribution</h3>
        <div className="space-y-3">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = stats.ratingDist[rating];
            const percentage = (count / stats.totalRatings) * 100;
            const barWidth = (count / maxRatingCount) * 100;

            return (
              <div key={rating} className="flex items-center gap-3">
                <span className="text-sm font-medium w-16">{rating} stars</span>
                <div
                  className="flex-1 h-8 bg-opacity-20 rounded overflow-hidden relative"
                  style={{
                    backgroundColor: isDarkMode ? "#475569" : "#cbd5e1",
                  }}
                >
                  <div
                    className="h-full transition-all duration-500 flex items-center justify-end pr-2"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor:
                        rating >= 4
                          ? "#10b981"
                          : rating >= 3
                          ? "#fbbf24"
                          : "#ef4444",
                    }}
                  >
                    <span className="text-xs font-bold text-white">
                      {count > 0 && `${count} (${percentage.toFixed(0)}%)`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Star Exploration Heatmap */}
      <div
        className={cx(
          "p-6 rounded-lg",
          isDarkMode ? "bg-slate-800" : "bg-gray-50"
        )}
      >
        <h3 className="text-lg font-semibold mb-4">
          Star Exploration Patterns
        </h3>
        <p
          className={cx(
            "text-sm mb-4",
            isDarkMode ? "text-slate-400" : "text-gray-600"
          )}
        >
          Which stars do users hover over most?
        </p>
        <div className="flex items-center justify-center gap-4">
          {[1, 2, 3, 4, 5].map((star) => {
            const count = stats.starHoverCounts[star];
            const percentage = (count / stats.totalRatings) * 100;
            const intensity = count / maxHoverCount;

            return (
              <div key={star} className="flex flex-col items-center gap-2">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300"
                  style={{
                    backgroundColor: `rgba(59, 130, 246, ${
                      0.2 + intensity * 0.8
                    })`,
                    border: `2px solid rgba(59, 130, 246, ${
                      0.3 + intensity * 0.7
                    })`,
                  }}
                >
                  ★
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold">{star}</div>
                  <div
                    className={cx(
                      "text-xs",
                      isDarkMode ? "text-slate-400" : "text-gray-600"
                    )}
                  >
                    {percentage.toFixed(0)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rating Changes Analysis */}
      {stats.withChanges.length > 0 && (
        <div
          className={cx(
            "p-6 rounded-lg",
            isDarkMode ? "bg-slate-800" : "bg-gray-50"
          )}
        >
          <h3 className="text-lg font-semibold mb-4">Rating Change Patterns</h3>
          <p
            className={cx(
              "text-sm mb-4",
              isDarkMode ? "text-slate-400" : "text-gray-600"
            )}
          >
            {stats.withChanges.length} users changed their rating
          </p>
          <div className="space-y-2">
            {stats.withChanges.slice(0, 5).map((d, idx) => {
              const history = d.ratingChangeHistory;
              const direction = history[history.length - 1] - history[0];

              return (
                <div
                  key={idx}
                  className={cx(
                    "p-3 rounded flex items-center justify-between",
                    isDarkMode ? "bg-slate-700" : "bg-white"
                  )}
                >
                  <span className="font-medium">{d.topic}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        "text-sm",
                        isDarkMode ? "text-slate-400" : "text-gray-600"
                      )}
                    >
                      {history.join(" → ")}
                    </span>
                    <span
                      className={cx(
                        "text-xs px-2 py-1 rounded",
                        direction > 0
                          ? "bg-green-500/20 text-green-600"
                          : direction < 0
                          ? "bg-red-500/20 text-red-600"
                          : "bg-gray-500/20 text-gray-600"
                      )}
                    >
                      {direction > 0
                        ? "↑ Upgraded"
                        : direction < 0
                        ? "↓ Downgraded"
                        : "→ Same"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Download Options */}
      <div
        className="flex gap-3 justify-end pt-4 border-t"
        style={{ borderColor: isDarkMode ? "#334155" : "#e5e7eb" }}
      >
        <button
          onClick={() => {
            const csv = generateCSV(data);
            downloadFile(csv, "rating-engagement-data.csv", "text/csv");
          }}
          className={cx(
            "px-4 py-2 rounded-lg text-sm font-medium transition",
            isDarkMode
              ? "bg-slate-700 hover:bg-slate-600 text-slate-200"
              : "bg-gray-200 hover:bg-gray-300 text-gray-800"
          )}
        >
          📥 Download CSV
        </button>
        <button
          onClick={() => {
            const json = JSON.stringify(data, null, 2);
            downloadFile(
              json,
              "rating-engagement-data.json",
              "application/json"
            );
          }}
          className={cx(
            "px-4 py-2 rounded-lg text-sm font-medium transition",
            isDarkMode
              ? "bg-blue-700 hover:bg-blue-600"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          )}
        >
          📥 Download JSON
        </button>
      </div>
    </div>
  );
};

// Metric Card Component
const MetricCard: React.FC<{
  title: string;
  value: string;
  icon: string;
  isDark?: boolean;
}> = ({ title, value, icon, isDark }) => (
  <div
    className={cx(
      "p-4 rounded-lg",
      isDark
        ? "bg-slate-800 border border-slate-700"
        : "bg-gray-50 border border-gray-200"
    )}
  >
    <div className="flex items-center gap-2 mb-2">
      <span className="text-2xl">{icon}</span>
      <span
        className={cx("text-sm", isDark ? "text-slate-400" : "text-gray-600")}
      >
        {title}
      </span>
    </div>
    <div className="text-2xl font-bold">{value}</div>
  </div>
);

// Helper functions
const generateCSV = (data: RatingEngagementData[]) => {
  const headers = [
    "topic",
    "finalRating",
    "timeToRate",
    "hesitationTime",
    "totalInteractionTime",
    "ratingChanges",
    "starsExplored",
  ];

  const rows = data.map((d) => [
    d.topic,
    d.finalRating,
    d.timeToRate.toFixed(2),
    d.hesitationTime.toFixed(2),
    d.totalInteractionTime.toFixed(2),
    d.ratingChangeHistory.length - 1,
    d.starsHovered.length,
  ]);

  return [headers, ...rows].map((row) => row.join(",")).join("\n");
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default RatingAnalyticsDashboard;
