// HistoryModal.tsx
// Revision History Modal with Chart and Statistics

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { RewriteHistoryResponse } from "@/hooks/useDoctorData";

// ═══════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════
const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getScoreColor = (score: number, isDarkMode: boolean): string => {
  if (isDarkMode) {
    const darkColors: Record<number, string> = {
      0: "bg-gradient-to-br from-slate-700 to-slate-600 text-slate-300 border border-slate-600",
      1: "bg-gradient-to-br from-red-600 to-red-700 text-red-100 border border-red-500",
      2: "bg-gradient-to-br from-pink-600 to-pink-700 text-pink-100 border border-pink-500",
      3: "bg-gradient-to-br from-yellow-600 to-yellow-700 text-yellow-100 border border-yellow-500",
      4: "bg-gradient-to-br from-green-600 to-green-700 text-green-100 border border-green-500",
      5: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-emerald-100 border-2 border-emerald-400 font-semibold",
    };
    return darkColors[score] || darkColors[0];
  }
  const lightColors: Record<number, string> = {
    0: "bg-gradient-to-br from-slate-400 to-slate-500 text-white border border-slate-300",
    1: "bg-gradient-to-br from-red-500 to-red-600 text-white border border-red-400",
    2: "bg-gradient-to-br from-pink-500 to-pink-600 text-white border border-pink-400",
    3: "bg-gradient-to-br from-yellow-500 to-yellow-600 text-white border border-yellow-400",
    4: "bg-gradient-to-br from-green-500 to-green-600 text-white border border-green-400",
    5: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-emerald-400 font-semibold",
  };
  return lightColors[score] || lightColors[0];
};

const getScoreColorForValue = (
  score: number | null,
  isDarkMode: boolean
): string => {
  if (score === null) {
    return isDarkMode
      ? "bg-gradient-to-br from-slate-700 to-slate-600 text-slate-300 border border-slate-600"
      : "bg-gradient-to-br from-slate-400 to-slate-500 text-white border border-slate-300";
  }
  const roundedScore = Math.round(score);
  return getScoreColor(roundedScore, isDarkMode);
};

// ═══════════════════════════════════════════════════════════
// Loading Spinner
// ═══════════════════════════════════════════════════════════
const LoadingSpinner: React.FC<{
  size?: "sm" | "md" | "lg";
  isDarkMode: boolean;
}> = ({ size = "sm", isDarkMode }) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };
  return (
    <div
      className={cx(
        sizeClasses[size],
        "animate-spin rounded-full border-2 border-t-transparent",
        isDarkMode ? "border-cyan-400" : "border-cyan-600"
      )}
    />
  );
};

// ═══════════════════════════════════════════════════════════
// Props Interface
// ═══════════════════════════════════════════════════════════
interface HistoryModalProps {
  isDarkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  historyData: RewriteHistoryResponse | null;
  loading: boolean;
}

// ═══════════════════════════════════════════════════════════
// History Modal Component
// ═══════════════════════════════════════════════════════════
const HistoryModal: React.FC<HistoryModalProps> = ({
  isDarkMode,
  isOpen,
  onClose,
  historyData,
  loading,
}) => {
  // Calculate statistics (including original score)
  const stats = useMemo(() => {
    if (!historyData || historyData.history.length === 0) return null;

    const revisionScores = historyData.history
      .map((r) => r.score)
      .filter((s): s is number => s !== null);

    if (revisionScores.length === 0) return null;

    // Include original_score in calculations
    const originalScore = historyData.original_score;
    const firstRevisionScore = revisionScores[0];
    const lastScore = revisionScores[revisionScores.length - 1];

    // Calculate improvement from original (if available) or first revision
    const baseScore = originalScore ?? firstRevisionScore;
    const improvement = lastScore - baseScore;

    // Average includes original score if available
    const allScores =
      originalScore !== null
        ? [originalScore, ...revisionScores]
        : revisionScores;
    const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const maxScore = Math.max(...allScores);
    const minScore = Math.min(...allScores);

    return {
      originalScore,
      firstRevisionScore,
      lastScore,
      improvement,
      avgScore,
      maxScore,
      minScore,
      totalRevisions: historyData.history.length,
    };
  }, [historyData]);

  // Prepare chart data (including Original as first point)
  const chartData = useMemo(() => {
    if (!historyData) return [];

    const data: Array<{
      revision: string;
      revisionNumber: number;
      score: number;
      time: string;
      fullTime: string;
      sentence: string;
      isOriginal?: boolean;
    }> = [];

    // Add Original score as first data point if available
    if (historyData.original_score !== null) {
      data.push({
        revision: "Original",
        revisionNumber: 0,
        score: historyData.original_score,
        time: "Original",
        fullTime: "Original Sentence",
        sentence:
          historyData.original_sentence.length > 50
            ? historyData.original_sentence.substring(0, 50) + "..."
            : historyData.original_sentence,
        isOriginal: true,
      });
    }

    // Add revision data points
    historyData.history.forEach((revision, idx) => {
      data.push({
        revision: `#${revision.revision_number}`,
        revisionNumber: revision.revision_number,
        score: revision.score ?? 0,
        time: revision.time
          ? new Date(revision.time).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : `Rev ${idx + 1}`,
        fullTime: formatDateTime(revision.time),
        sentence:
          revision.revised_sentence.length > 50
            ? revision.revised_sentence.substring(0, 50) + "..."
            : revision.revised_sentence,
        isOriginal: false,
      });
    });

    return data;
  }, [historyData]);

  // Bail out AFTER the hooks above: an early return placed before them makes
  // the useMemo calls conditional, so React would see a different hook count
  // between the closed and open renders and throw "Rendered more hooks than
  // during the previous render".
  if (!isOpen) return null;

  // Custom tooltip for chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isOriginal = data.isOriginal;

      return (
        <div
          className={cx(
            "p-3 rounded-lg shadow-lg border max-w-xs",
            isDarkMode
              ? "bg-slate-800 border-slate-600"
              : "bg-white border-slate-200"
          )}
        >
          <div
            className={cx(
              "font-semibold mb-1",
              isDarkMode ? "text-slate-100" : "text-slate-900"
            )}
          >
            {isOriginal
              ? "Original Sentence"
              : `Revision ${data.revisionNumber}`}
          </div>
          {!isOriginal && (
            <div
              className={cx(
                "text-xs mb-2",
                isDarkMode ? "text-slate-400" : "text-slate-500"
              )}
            >
              {data.fullTime}
            </div>
          )}
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cx(
                "text-xs",
                isDarkMode ? "text-slate-300" : "text-slate-600"
              )}
            >
              Score:
            </span>
            <span
              className={cx(
                "px-2 py-0.5 rounded text-xs font-bold",
                getScoreColorForValue(data.score, isDarkMode)
              )}
            >
              {data.score}
            </span>
          </div>
          <div
            className={cx(
              "text-xs italic",
              isDarkMode ? "text-slate-400" : "text-slate-600"
            )}
          >
            &quot;{data.sentence}&quot;
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cx(
          "relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl shadow-2xl",
          isDarkMode
            ? "bg-slate-800 border border-slate-700"
            : "bg-white border border-slate-200"
        )}
      >
        {/* Header */}
        <div
          className={cx(
            "flex items-center justify-between px-6 py-4 border-b",
            isDarkMode ? "border-slate-700" : "border-slate-200"
          )}
        >
          <div>
            <h3
              className={cx(
                "text-lg font-semibold",
                isDarkMode ? "text-slate-100" : "text-slate-900"
              )}
            >
              Revision History & Score Progress
            </h3>
            {historyData && (
              <p
                className={cx(
                  "text-sm mt-1",
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                )}
              >
                Sentence [{historyData.i}, {historyData.i2}] •{" "}
                {historyData.total_revisions} revision
                {historyData.total_revisions > 1 ? "s" : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className={cx(
              "p-2 rounded-lg transition-colors",
              isDarkMode
                ? "hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                : "hover:bg-slate-100 text-slate-500 hover:text-slate-700"
            )}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[75vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" isDarkMode={isDarkMode} />
              <span
                className={cx(
                  "ml-3",
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                )}
              >
                Loading history...
              </span>
            </div>
          ) : !historyData || historyData.history.length === 0 ? (
            <div
              className={cx(
                "text-center py-12",
                isDarkMode ? "text-slate-400" : "text-slate-600"
              )}
            >
              <div className="text-4xl mb-3">📝</div>
              <p>No revision history found for this sentence.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Statistics Cards */}
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* First → Last Score (Original → Latest) */}
                  <div
                    className={cx(
                      "p-4 rounded-lg border",
                      isDarkMode
                        ? "bg-slate-700/50 border-slate-600"
                        : "bg-slate-50 border-slate-200"
                    )}
                  >
                    <div
                      className={cx(
                        "text-xs font-medium uppercase tracking-wider mb-2",
                        isDarkMode ? "text-slate-400" : "text-slate-500"
                      )}
                    >
                      {stats.originalScore !== null
                        ? "Original → Latest"
                        : "First → Latest"}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-center">
                        {stats.originalScore !== null && (
                          <span
                            className={cx(
                              "text-[10px] mb-0.5",
                              isDarkMode ? "text-slate-500" : "text-slate-400"
                            )}
                          >
                            Original
                          </span>
                        )}
                        <span
                          className={cx(
                            "px-2 py-1 rounded text-sm font-bold",
                            getScoreColorForValue(
                              stats.originalScore ?? stats.firstRevisionScore,
                              isDarkMode
                            )
                          )}
                        >
                          {stats.originalScore ?? stats.firstRevisionScore}
                        </span>
                      </div>
                      <span
                        className={cx(
                          "text-lg",
                          isDarkMode ? "text-slate-400" : "text-slate-500"
                        )}
                      >
                        →
                      </span>
                      <div className="flex flex-col items-center">
                        {stats.originalScore !== null && (
                          <span
                            className={cx(
                              "text-[10px] mb-0.5",
                              isDarkMode ? "text-slate-500" : "text-slate-400"
                            )}
                          >
                            Latest
                          </span>
                        )}
                        <span
                          className={cx(
                            "px-2 py-1 rounded text-sm font-bold",
                            getScoreColorForValue(stats.lastScore, isDarkMode)
                          )}
                        >
                          {stats.lastScore}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Improvement */}
                  <div
                    className={cx(
                      "p-4 rounded-lg border",
                      stats.improvement > 0
                        ? isDarkMode
                          ? "bg-emerald-900/30 border-emerald-700"
                          : "bg-emerald-50 border-emerald-200"
                        : stats.improvement < 0
                        ? isDarkMode
                          ? "bg-red-900/30 border-red-700"
                          : "bg-red-50 border-red-200"
                        : isDarkMode
                        ? "bg-slate-700/50 border-slate-600"
                        : "bg-slate-50 border-slate-200"
                    )}
                  >
                    <div
                      className={cx(
                        "text-xs font-medium uppercase tracking-wider mb-2",
                        isDarkMode ? "text-slate-400" : "text-slate-500"
                      )}
                    >
                      Change
                    </div>
                    <div
                      className={cx(
                        "text-2xl font-bold",
                        stats.improvement > 0
                          ? isDarkMode
                            ? "text-emerald-400"
                            : "text-emerald-600"
                          : stats.improvement < 0
                          ? isDarkMode
                            ? "text-red-400"
                            : "text-red-600"
                          : isDarkMode
                          ? "text-slate-300"
                          : "text-slate-600"
                      )}
                    >
                      {stats.improvement > 0 ? "+" : ""}
                      {stats.improvement.toFixed(1)}
                      {stats.improvement > 0 && (
                        <span className="text-sm ml-1">↑</span>
                      )}
                      {stats.improvement < 0 && (
                        <span className="text-sm ml-1">↓</span>
                      )}
                    </div>
                  </div>

                  {/* Average Score */}
                  <div
                    className={cx(
                      "p-4 rounded-lg border",
                      isDarkMode
                        ? "bg-slate-700/50 border-slate-600"
                        : "bg-slate-50 border-slate-200"
                    )}
                  >
                    <div
                      className={cx(
                        "text-xs font-medium uppercase tracking-wider mb-2",
                        isDarkMode ? "text-slate-400" : "text-slate-500"
                      )}
                    >
                      Average
                    </div>
                    <div
                      className={cx(
                        "text-2xl font-bold",
                        isDarkMode ? "text-cyan-400" : "text-cyan-600"
                      )}
                    >
                      {stats.avgScore.toFixed(1)}
                    </div>
                  </div>

                  {/* Total Revisions */}
                  <div
                    className={cx(
                      "p-4 rounded-lg border",
                      isDarkMode
                        ? "bg-slate-700/50 border-slate-600"
                        : "bg-slate-50 border-slate-200"
                    )}
                  >
                    <div
                      className={cx(
                        "text-xs font-medium uppercase tracking-wider mb-2",
                        isDarkMode ? "text-slate-400" : "text-slate-500"
                      )}
                    >
                      Revisions
                    </div>
                    <div
                      className={cx(
                        "text-2xl font-bold",
                        isDarkMode ? "text-purple-400" : "text-purple-600"
                      )}
                    >
                      {stats.totalRevisions}
                    </div>
                  </div>
                </div>
              )}

              {/* Score Progress Chart - show if we have 2+ data points */}
              {chartData.length > 1 && (
                <div
                  className={cx(
                    "p-4 rounded-lg border",
                    isDarkMode
                      ? "bg-slate-700/30 border-slate-600"
                      : "bg-white border-slate-200"
                  )}
                >
                  <h4
                    className={cx(
                      "text-sm font-semibold uppercase tracking-wider mb-4",
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    )}
                  >
                    📈 Score Progress Over Time
                  </h4>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="scoreGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor={isDarkMode ? "#06b6d4" : "#0891b2"}
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="95%"
                              stopColor={isDarkMode ? "#06b6d4" : "#0891b2"}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={isDarkMode ? "#475569" : "#e2e8f0"}
                        />
                        <XAxis
                          dataKey="revision"
                          tick={{
                            fill: isDarkMode ? "#94a3b8" : "#64748b",
                            fontSize: 12,
                          }}
                          axisLine={{
                            stroke: isDarkMode ? "#475569" : "#cbd5e1",
                          }}
                        />
                        <YAxis
                          domain={[0, 5]}
                          ticks={[0, 1, 2, 3, 4, 5]}
                          tick={{
                            fill: isDarkMode ? "#94a3b8" : "#64748b",
                            fontSize: 12,
                          }}
                          axisLine={{
                            stroke: isDarkMode ? "#475569" : "#cbd5e1",
                          }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine
                          y={5}
                          stroke={isDarkMode ? "#10b981" : "#059669"}
                          strokeDasharray="5 5"
                          label={{
                            value: "Target",
                            position: "right",
                            fill: isDarkMode ? "#10b981" : "#059669",
                            fontSize: 10,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke={isDarkMode ? "#06b6d4" : "#0891b2"}
                          strokeWidth={3}
                          fill="url(#scoreGradient)"
                          dot={{
                            fill: isDarkMode ? "#06b6d4" : "#0891b2",
                            strokeWidth: 2,
                            r: 6,
                          }}
                          activeDot={{
                            r: 8,
                            fill: isDarkMode ? "#22d3ee" : "#06b6d4",
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Single data point - no chart needed */}
              {chartData.length <= 1 && (
                <div
                  className={cx(
                    "p-4 rounded-lg border text-center",
                    isDarkMode
                      ? "bg-slate-700/30 border-slate-600"
                      : "bg-slate-50 border-slate-200"
                  )}
                >
                  <div
                    className={cx(
                      "text-sm",
                      isDarkMode ? "text-slate-400" : "text-slate-600"
                    )}
                  >
                    📊 Chart will appear when there is progression data
                    (original + revisions)
                  </div>
                </div>
              )}

              {/* Original Sentence with Score */}
              <div
                className={cx(
                  "p-4 rounded-lg border-l-4 border-slate-400",
                  isDarkMode ? "bg-slate-700/50" : "bg-slate-50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={cx(
                      "text-xs font-semibold uppercase tracking-wider",
                      isDarkMode ? "text-slate-400" : "text-slate-500"
                    )}
                  >
                    Original Sentence
                  </div>
                  {historyData.original_score !== null && (
                    <div className="flex items-center gap-2">
                      <span
                        className={cx(
                          "text-xs",
                          isDarkMode ? "text-slate-400" : "text-slate-500"
                        )}
                      >
                        Score:
                      </span>
                      <span
                        className={cx(
                          "px-2 py-0.5 rounded text-xs font-bold",
                          getScoreColorForValue(
                            historyData.original_score,
                            isDarkMode
                          )
                        )}
                      >
                        {historyData.original_score}
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className={cx(
                    "text-sm",
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  )}
                >
                  &quot;{historyData.original_sentence}&quot;
                </div>
              </div>

              {/* Revision Timeline */}
              <div>
                <h4
                  className={cx(
                    "text-sm font-semibold uppercase tracking-wider mb-4",
                    isDarkMode ? "text-slate-300" : "text-slate-700"
                  )}
                >
                  Revision Timeline
                </h4>
                <div className="relative">
                  {/* Timeline line */}
                  <div
                    className={cx(
                      "absolute left-4 top-0 bottom-0 w-0.5",
                      isDarkMode ? "bg-slate-600" : "bg-slate-300"
                    )}
                  />

                  {historyData.history.map((revision, idx) => {
                    const isLatest = idx === historyData.history.length - 1;
                    const prevScore =
                      idx > 0 ? historyData.history[idx - 1].score : null;
                    const scoreDiff =
                      revision.score !== null && prevScore !== null
                        ? revision.score - prevScore
                        : null;

                    return (
                      <div key={idx} className="relative pl-10 pb-4">
                        {/* Timeline dot */}
                        <div
                          className={cx(
                            "absolute left-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                            isLatest
                              ? "bg-emerald-500 text-white ring-2 ring-emerald-300"
                              : isDarkMode
                              ? "bg-slate-600 text-slate-300"
                              : "bg-slate-300 text-slate-600"
                          )}
                        >
                          {revision.revision_number}
                        </div>

                        {/* Revision Card */}
                        <div
                          className={cx(
                            "p-4 rounded-lg border",
                            isLatest
                              ? isDarkMode
                                ? "bg-emerald-900/30 border-emerald-700"
                                : "bg-emerald-50 border-emerald-200"
                              : isDarkMode
                              ? "bg-slate-700/50 border-slate-600"
                              : "bg-white border-slate-200"
                          )}
                        >
                          {/* Meta info */}
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cx(
                                  "text-xs font-medium",
                                  isDarkMode
                                    ? "text-slate-400"
                                    : "text-slate-500"
                                )}
                              >
                                {formatDateTime(revision.time)}
                              </span>
                              {isLatest && (
                                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500 text-white font-medium">
                                  Latest
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Score change indicator */}
                              {scoreDiff !== null && scoreDiff !== 0 && (
                                <span
                                  className={cx(
                                    "text-xs font-medium px-2 py-0.5 rounded",
                                    scoreDiff > 0
                                      ? isDarkMode
                                        ? "bg-emerald-900/50 text-emerald-300"
                                        : "bg-emerald-100 text-emerald-700"
                                      : isDarkMode
                                      ? "bg-red-900/50 text-red-300"
                                      : "bg-red-100 text-red-700"
                                  )}
                                >
                                  {scoreDiff > 0 ? "+" : ""}
                                  {scoreDiff.toFixed(1)}
                                </span>
                              )}
                              <span
                                className={cx(
                                  "inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded text-xs font-bold",
                                  getScoreColorForValue(
                                    revision.score,
                                    isDarkMode
                                  )
                                )}
                              >
                                {revision.score ?? "N/A"}
                              </span>
                            </div>
                          </div>

                          {/* Revised sentence */}
                          <div
                            className={cx(
                              "text-sm",
                              isDarkMode ? "text-slate-200" : "text-slate-700"
                            )}
                          >
                            &quot;{revision.revised_sentence}&quot;
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={cx(
            "px-6 py-4 border-t",
            isDarkMode ? "border-slate-700" : "border-slate-200"
          )}
        >
          <button
            onClick={onClose}
            className={cx(
              "w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              isDarkMode
                ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
