import React from "react";
import {
  X,
  Loader2,
  TrendingUp,
  ArrowRight,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════
// HistoryModal - Revision History & Score Progress
// z-index: 70 (above slide panel)
// ═══════════════════════════════════════════════════════════

interface RewriteHistoryItem {
  id?: number;
  file: string;
  i: number;
  i2: number;
  original_sentence: string;
  revised_sentence: string;
  score: number;
  class: string;
  speaker: string;
  selected: boolean;
  time: string;
}

interface RewriteHistoryResponse {
  file: string;
  i: number;
  i2: number;
  history: RewriteHistoryItem[];
  original_sentence?: string;
}

interface HistoryModalProps {
  isDarkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  historyData: RewriteHistoryResponse | null;
  loading: boolean;
  zIndex?: number;
  originalSentenceFromParent?: string;
}

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
};

const getScoreBadgeClass = (
  score: number | null,
  isDarkMode: boolean
): string => {
  if (score === null) {
    return isDarkMode
      ? "bg-slate-600 text-slate-300"
      : "bg-slate-400 text-white";
  }
  const roundedScore = Math.round(score);
  const classes: Record<number, string> = {
    0: isDarkMode ? "bg-slate-600 text-slate-300" : "bg-slate-400 text-white",
    1: isDarkMode ? "bg-red-600 text-red-100" : "bg-red-500 text-white",
    2: isDarkMode ? "bg-pink-600 text-pink-100" : "bg-pink-500 text-white",
    3: isDarkMode
      ? "bg-yellow-600 text-yellow-100"
      : "bg-yellow-500 text-white",
    4: isDarkMode ? "bg-green-600 text-green-100" : "bg-green-500 text-white",
    5: isDarkMode
      ? "bg-emerald-600 text-emerald-100"
      : "bg-emerald-500 text-white",
  };
  return classes[roundedScore] || classes[0];
};

const HistoryModal: React.FC<HistoryModalProps> = ({
  isDarkMode,
  isOpen,
  onClose,
  historyData,
  loading,
  zIndex = 70,
  originalSentenceFromParent,
}) => {
  if (!isOpen) return null;

  const colors = {
    bg: isDarkMode ? "bg-slate-900" : "bg-white",
    border: isDarkMode ? "border-slate-700" : "border-slate-200",
    title: isDarkMode ? "text-slate-100" : "text-slate-900",
    subtitle: isDarkMode ? "text-slate-400" : "text-slate-600",
    cardBg: isDarkMode ? "bg-slate-800" : "bg-slate-50",
    muted: isDarkMode ? "text-slate-500" : "text-slate-400",
  };

  const history = historyData?.history || [];
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );

  const findOriginalSentence = (): string => {
    if (originalSentenceFromParent && originalSentenceFromParent.trim()) {
      return originalSentenceFromParent;
    }
    if (
      historyData?.original_sentence &&
      historyData.original_sentence.trim()
    ) {
      return historyData.original_sentence;
    }
    if (sortedHistory.length > 0) {
      const oldest = sortedHistory[sortedHistory.length - 1];
      if (oldest.original_sentence && oldest.original_sentence.trim()) {
        return oldest.original_sentence;
      }
    }
    for (const item of history) {
      if (item.original_sentence && item.original_sentence.trim()) {
        return item.original_sentence;
      }
    }
    return "";
  };

  const originalSentence = findOriginalSentence();

  const getOriginalScore = (): number | null => {
    if (sortedHistory.length === 0) return null;
    const oldest = sortedHistory[sortedHistory.length - 1];
    return oldest?.score ?? null;
  };

  const originalScore = getOriginalScore();
  const latestScore = sortedHistory.length > 0 ? sortedHistory[0]?.score : null;
  const scoreChange =
    originalScore !== null && latestScore !== null
      ? latestScore - originalScore
      : null;
  const avgScore =
    sortedHistory.length > 0
      ? sortedHistory.reduce((sum, item) => sum + (item.score ?? 0), 0) /
        sortedHistory.length
      : null;

  return (
    <>
      {/* Backdrop - z-index: 70 */}
      <div
        className={cx(
          "fixed inset-0 transition-opacity duration-300",
          isDarkMode ? "bg-black/70" : "bg-black/50"
        )}
        style={{ zIndex }}
        onClick={onClose}
      />

      {/* Modal - z-index: 71, centered */}
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: zIndex + 1 }}
      >
        <div
          className={cx(
            "w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col",
            colors.bg
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className={`px-6 py-4 border-b ${colors.border} flex items-center justify-between`}
          >
            <div className="flex items-center gap-3">
              <div
                className={cx(
                  "p-2 rounded-lg",
                  isDarkMode ? "bg-purple-900/50" : "bg-purple-100"
                )}
              >
                <TrendingUp
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-purple-400" : "text-purple-600"
                  }`}
                />
              </div>
              <div>
                <h2 className={`text-lg font-bold ${colors.title}`}>
                  Revision History & Score Progress
                </h2>
                {historyData && (
                  <p className={`text-sm ${colors.subtitle}`}>
                    Sentence [{historyData.i}, {historyData.i2}] •{" "}
                    {sortedHistory.length} revision
                    {sortedHistory.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className={cx(
                "p-2 rounded-lg transition-colors",
                isDarkMode
                  ? "hover:bg-slate-800 text-slate-400"
                  : "hover:bg-slate-100 text-slate-500"
              )}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2
                  className={`w-8 h-8 animate-spin ${
                    isDarkMode ? "text-cyan-400" : "text-cyan-600"
                  }`}
                />
                <p className={`mt-3 text-sm ${colors.subtitle}`}>
                  Loading history...
                </p>
              </div>
            ) : sortedHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <FileText className={`w-12 h-12 ${colors.muted}`} />
                <p className={`mt-3 text-sm ${colors.subtitle}`}>
                  No revision history found.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Score Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div
                    className={`p-4 rounded-xl ${colors.cardBg} border ${colors.border}`}
                  >
                    <div
                      className={`text-xs font-medium uppercase tracking-wider mb-2 ${colors.subtitle}`}
                    >
                      Original → Latest
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 rounded text-sm font-bold ${getScoreBadgeClass(
                          originalScore,
                          isDarkMode
                        )}`}
                      >
                        {originalScore?.toFixed(0) ?? "—"}
                      </span>
                      <ArrowRight className={`w-4 h-4 ${colors.subtitle}`} />
                      <span
                        className={`px-2 py-1 rounded text-sm font-bold ${getScoreBadgeClass(
                          latestScore,
                          isDarkMode
                        )}`}
                      >
                        {latestScore?.toFixed(0) ?? "—"}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-xl ${colors.cardBg} border ${colors.border}`}
                  >
                    <div
                      className={`text-xs font-medium uppercase tracking-wider mb-2 ${colors.subtitle}`}
                    >
                      Change
                    </div>
                    <div
                      className={cx(
                        "text-2xl font-bold",
                        scoreChange !== null && scoreChange > 0
                          ? isDarkMode
                            ? "text-emerald-400"
                            : "text-emerald-600"
                          : scoreChange !== null && scoreChange < 0
                          ? isDarkMode
                            ? "text-red-400"
                            : "text-red-600"
                          : colors.subtitle
                      )}
                    >
                      {scoreChange !== null
                        ? `${scoreChange > 0 ? "+" : ""}${scoreChange.toFixed(
                            1
                          )}`
                        : "—"}
                      {scoreChange !== null && scoreChange > 0 && (
                        <span className="text-sm ml-1">↑</span>
                      )}
                      {scoreChange !== null && scoreChange < 0 && (
                        <span className="text-sm ml-1">↓</span>
                      )}
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-xl ${colors.cardBg} border ${colors.border}`}
                  >
                    <div
                      className={`text-xs font-medium uppercase tracking-wider mb-2 ${colors.subtitle}`}
                    >
                      Average
                    </div>
                    <div className={`text-2xl font-bold ${colors.title}`}>
                      {avgScore !== null ? avgScore.toFixed(1) : "—"}
                    </div>
                  </div>
                </div>

                {/* Original Sentence */}
                <div
                  className={`p-4 rounded-xl ${colors.cardBg} border ${colors.border}`}
                >
                  <div
                    className={`text-xs font-medium uppercase tracking-wider mb-2 ${colors.subtitle}`}
                  >
                    Original Sentence
                  </div>
                  {originalSentence ? (
                    <p className={`text-sm ${colors.title} leading-relaxed`}>
                      "{originalSentence}"
                    </p>
                  ) : (
                    <div
                      className={`flex items-center gap-2 text-sm ${colors.muted}`}
                    >
                      <AlertCircle className="w-4 h-4" />
                      <span>Original sentence not available</span>
                    </div>
                  )}
                </div>

                {/* Revision Timeline */}
                <div>
                  <div
                    className={`text-sm font-semibold mb-3 flex items-center gap-2 ${colors.title}`}
                  >
                    <Clock className="w-4 h-4" />
                    Revision Timeline
                  </div>
                  <div className="space-y-3">
                    {sortedHistory.map((item, idx) => {
                      const isLatest = idx === 0;
                      const revisedText = item.revised_sentence || "(No text)";

                      return (
                        <div
                          key={item.id || idx}
                          className={cx(
                            "relative pl-8 pb-4",
                            idx !== sortedHistory.length - 1 && "border-l-2",
                            isDarkMode ? "border-slate-700" : "border-slate-200"
                          )}
                          style={{ marginLeft: "0.5rem" }}
                        >
                          <div
                            className={cx(
                              "absolute left-0 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                              isLatest
                                ? isDarkMode
                                  ? "bg-cyan-500 text-cyan-950"
                                  : "bg-cyan-500 text-white"
                                : isDarkMode
                                ? "bg-slate-700 text-slate-300"
                                : "bg-slate-200 text-slate-600"
                            )}
                          >
                            {sortedHistory.length - idx}
                          </div>

                          <div
                            className={cx(
                              "p-4 rounded-lg border",
                              isLatest
                                ? isDarkMode
                                  ? "bg-cyan-900/20 border-cyan-800"
                                  : "bg-cyan-50 border-cyan-200"
                                : `${colors.cardBg} ${colors.border}`
                            )}
                          >
                            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs ${colors.subtitle}`}>
                                  {formatDateTime(item.time)}
                                </span>
                                {isLatest && (
                                  <span
                                    className={cx(
                                      "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium",
                                      isDarkMode
                                        ? "bg-cyan-500 text-cyan-950"
                                        : "bg-cyan-500 text-white"
                                    )}
                                  >
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    Latest
                                  </span>
                                )}
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded text-sm font-bold ${getScoreBadgeClass(
                                  item.score,
                                  isDarkMode
                                )}`}
                              >
                                {item.score}
                              </span>
                            </div>
                            <p
                              className={`text-sm ${colors.title} leading-relaxed`}
                            >
                              "{revisedText}"
                            </p>
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
          <div className={`px-6 py-4 border-t ${colors.border}`}>
            <button
              onClick={onClose}
              className={cx(
                "w-full py-2.5 rounded-lg font-medium transition-colors",
                isDarkMode
                  ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default HistoryModal;
