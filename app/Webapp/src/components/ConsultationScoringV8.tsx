import React, { useMemo, useState } from "react";
import { CheckCircle2, FileText, RefreshCw } from "lucide-react";

// ═══════════════════════════════════════════════════════════
// ConsultationScoring V8 - Enhanced Visualization
// FIXED: All overlapping issues
// - Dots in separate area above scale bar
// - Scale labels properly spaced
// - Topic label doesn't overlap with dots
// ═══════════════════════════════════════════════════════════

interface SentenceItem {
  sentence: string;
  hasRewrite?: boolean;
  revisedSentence?: string;
  score?: number;
  revisedScore?: number;
}

interface ConsultationScoringProps {
  title?: string;
  subtitle?: string;
  sentences?: SentenceItem[];
  highlightPosition?: number;
  leftLabel?: string;
  maxSentenceChars?: number;
  isDarkMode?: boolean;
  selectedIdx?: number;
  onSentenceClick?: (idx: number) => void;
}

const getScoreColor = (
  score: number | null | undefined,
  isDarkMode: boolean
): string => {
  if (score === null || score === undefined) {
    return isDarkMode ? "#64748b" : "#94a3b8";
  }
  const roundedScore = Math.round(score);
  const colors: Record<number, string> = {
    0: isDarkMode ? "#64748b" : "#94a3b8",
    1: isDarkMode ? "#ef4444" : "#f87171",
    2: isDarkMode ? "#ec4899" : "#f472b6",
    3: isDarkMode ? "#eab308" : "#facc15",
    4: isDarkMode ? "#22c55e" : "#4ade80",
    5: isDarkMode ? "#10b981" : "#34d399",
  };
  return colors[roundedScore] || colors[0];
};

const getScoreBadgeClass = (
  score: number | null | undefined,
  isDarkMode: boolean
): string => {
  if (score === null || score === undefined) {
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

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const ConsultationScoringV8: React.FC<ConsultationScoringProps> = ({
  title = "Consultation Scoring",
  subtitle = "Quality of Risk Communication",
  sentences = [],
  highlightPosition = 3,
  leftLabel = "Topic",
  maxSentenceChars = 150,
  isDarkMode = false,
  selectedIdx = 0,
  onSentenceClick,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Shorter labels to prevent overlap
  const scaleItems = [
    { value: 0, label: "None" },
    { value: 1, label: "Name" },
    { value: 2, label: "General" },
    { value: 3, label: "Imprecise" },
    { value: 4, label: "Specific" },
    { value: 5, label: "Patient" },
  ];

  // Process sentences
  const displaySentences = useMemo(() => {
    return sentences.map((item, idx) => {
      const displayText =
        item.hasRewrite && item.revisedSentence
          ? item.revisedSentence
          : item.sentence;
      const currentScore = item.hasRewrite ? item.revisedScore : item.score;
      const needsTrunc = displayText.length > maxSentenceChars;

      return {
        idx,
        originalText: item.sentence,
        displayText,
        truncatedText: needsTrunc
          ? `${displayText.slice(0, maxSentenceChars)}…`
          : displayText,
        hasRewrite: item.hasRewrite || false,
        score: currentScore,
        originalScore: item.score,
        revisedScore: item.revisedScore,
        position: currentScore !== undefined ? (currentScore / 5) * 100 : 50,
      };
    });
  }, [sentences, maxSentenceChars]);

  // Colors
  const colors = {
    bg: isDarkMode ? "bg-slate-900" : "bg-white",
    cardBg: isDarkMode ? "bg-slate-800" : "bg-slate-50",
    border: isDarkMode ? "border-slate-700" : "border-slate-200",
    title: isDarkMode ? "text-slate-100" : "text-slate-800",
    subtitle: isDarkMode ? "text-slate-400" : "text-slate-600",
    label: isDarkMode ? "text-slate-300" : "text-slate-700",
    muted: isDarkMode ? "text-slate-500" : "text-slate-400",
    barBg: isDarkMode ? "bg-slate-700" : "bg-slate-200",
  };

  return (
    <div className={`w-full ${colors.bg} rounded-2xl p-6`}>
      <div className="flex gap-6">
        {/* Left: Scale visualization */}
        <div className="flex-1 min-w-0">
          {/* Section 1: Topic Label (isolated) */}
          <div className={`text-sm font-semibold ${colors.label} mb-6`}>
            {leftLabel.replace(/\n/g, " ")}
          </div>

          {/* Section 2: Sentence Dots Area (separate from scale) */}
          {displaySentences.length > 0 && (
            <div
              className={cx(
                "relative rounded-xl p-4 mb-4",
                isDarkMode ? "bg-slate-800/50" : "bg-slate-100/50"
              )}
              style={{ minHeight: "80px" }}
            >
              <div className={`text-xs ${colors.muted} mb-3`}>
                Click dots to select sentence
              </div>

              {/* Dots container */}
              <div className="relative h-12">
                {displaySentences.map((s, idx) => {
                  const isSelected = idx === selectedIdx;
                  const isHovered = idx === hoveredIdx;
                  const color = getScoreColor(s.score, isDarkMode);

                  // Distribute dots in rows to avoid overlap
                  const row = idx % 3;
                  const topPosition = row * 16;

                  return (
                    <button
                      key={idx}
                      onClick={() => onSentenceClick?.(idx)}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      className="absolute transform -translate-x-1/2 transition-all duration-200"
                      style={{
                        left: `${Math.max(5, Math.min(95, s.position))}%`,
                        top: `${topPosition}px`,
                        zIndex: isSelected || isHovered ? 30 : 10 + idx,
                      }}
                      title={`Sentence ${idx + 1}: Score ${
                        s.score?.toFixed(1) ?? "N/A"
                      }`}
                    >
                      {/* Tooltip */}
                      {(isHovered || isSelected) && (
                        <div
                          className={cx(
                            "absolute left-1/2 -translate-x-1/2 -top-7 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shadow-lg",
                            isDarkMode
                              ? "bg-slate-700 text-white"
                              : "bg-slate-800 text-white"
                          )}
                        >
                          #{idx + 1}: {s.score?.toFixed(1) ?? "N/A"}
                        </div>
                      )}

                      {/* Dot */}
                      <div
                        className={cx(
                          "w-5 h-5 rounded-full border-2 transition-all duration-200 relative",
                          isSelected && "ring-2 ring-offset-1 ring-cyan-500",
                          (isSelected || isHovered) && "scale-125"
                        )}
                        style={{
                          backgroundColor: color,
                          borderColor: "white",
                          boxShadow:
                            isSelected || isHovered
                              ? "0 4px 12px rgba(0,0,0,0.3)"
                              : "0 2px 4px rgba(0,0,0,0.2)",
                        }}
                      >
                        {s.hasRewrite && (
                          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-white" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Position reference line */}
              <div className="flex justify-between mt-2 px-1">
                <span className={`text-[9px] ${colors.muted}`}>0</span>
                <span className={`text-[9px] ${colors.muted}`}>1</span>
                <span className={`text-[9px] ${colors.muted}`}>2</span>
                <span className={`text-[9px] ${colors.muted}`}>3</span>
                <span className={`text-[9px] ${colors.muted}`}>4</span>
                <span className={`text-[9px] ${colors.muted}`}>5</span>
              </div>
            </div>
          )}

          {/* Section 3: Scale Bar */}
          <div className="relative mt-4">
            {/* The bar itself */}
            <div
              className={`h-4 ${colors.barBg} rounded-full relative overflow-hidden`}
            >
              {/* Gradient fill showing current score */}
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                style={{
                  width: `${(highlightPosition / 5) * 100}%`,
                  background:
                    "linear-gradient(to right, #ef4444, #f59e0b, #eab308, #84cc16, #22c55e, #10b981)",
                }}
              />

              {/* Tick marks */}
              {[0, 1, 2, 3, 4, 5].map((val) => (
                <div
                  key={val}
                  className="absolute top-0 bottom-0 w-0.5"
                  style={{
                    left: `${(val / 5) * 100}%`,
                    backgroundColor: isDarkMode
                      ? "rgba(255,255,255,0.2)"
                      : "rgba(0,0,0,0.15)",
                  }}
                />
              ))}
            </div>

            {/* Current score badge */}
            <div
              className="absolute -bottom-8 transform -translate-x-1/2 transition-all duration-500"
              style={{ left: `${(highlightPosition / 5) * 100}%` }}
            >
              <div
                className={cx(
                  "px-2.5 py-1 rounded-lg text-sm font-bold shadow-lg",
                  isDarkMode
                    ? "bg-cyan-500 text-cyan-950"
                    : "bg-cyan-500 text-white"
                )}
              >
                {highlightPosition.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Section 4: Scale Labels (with proper spacing) */}
          <div className="grid grid-cols-6 gap-1 mt-12 text-center">
            {scaleItems.map((item) => (
              <div key={item.value} className="px-1">
                <div className={`text-base font-bold ${colors.title}`}>
                  {item.value}
                </div>
                <div
                  className={`text-[10px] leading-tight ${colors.muted} mt-0.5`}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Sentence list */}
        <div
          className={`w-80 ${colors.cardBg} rounded-xl border ${colors.border} overflow-hidden flex-shrink-0`}
        >
          {/* List header */}
          <div
            className={cx(
              "px-4 py-3 border-b",
              colors.border,
              isDarkMode ? "bg-slate-800" : "bg-slate-100"
            )}
          >
            <div className="flex items-center justify-between">
              <span className={`text-sm font-semibold ${colors.title}`}>
                Sentences ({displaySentences.length})
              </span>
            </div>
          </div>

          {/* Sentence list */}
          <div className="max-h-72 overflow-y-auto">
            {displaySentences.length > 0 ? (
              <div className="p-2 space-y-2">
                {displaySentences.map((item, idx) => {
                  const isSelected = idx === selectedIdx;
                  const isHovered = idx === hoveredIdx;

                  return (
                    <div
                      key={idx}
                      onClick={() => onSentenceClick?.(idx)}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      className={cx(
                        "p-3 rounded-lg border cursor-pointer transition-all duration-200",
                        isSelected
                          ? isDarkMode
                            ? "bg-cyan-900/40 border-cyan-500 ring-1 ring-cyan-500/50"
                            : "bg-cyan-50 border-cyan-400 ring-1 ring-cyan-400/50"
                          : isHovered
                          ? isDarkMode
                            ? "bg-slate-700 border-slate-600"
                            : "bg-slate-100 border-slate-300"
                          : isDarkMode
                          ? "bg-slate-800 border-slate-700"
                          : "bg-white border-slate-200",
                        item.hasRewrite && "border-l-4 border-l-emerald-500"
                      )}
                    >
                      {/* Header row */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded text-xs font-bold ${getScoreBadgeClass(
                            item.score,
                            isDarkMode
                          )}`}
                        >
                          {item.score?.toFixed(1) ?? "N/A"}
                        </span>

                        {item.hasRewrite && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500 text-white font-medium">
                            <RefreshCw className="w-2.5 h-2.5" />
                            Rewritten
                          </span>
                        )}

                        {isSelected && (
                          <span
                            className={cx(
                              "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium",
                              isDarkMode
                                ? "bg-cyan-500 text-cyan-950"
                                : "bg-cyan-500 text-white"
                            )}
                          >
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Selected
                          </span>
                        )}
                      </div>

                      {/* Sentence text */}
                      {item.hasRewrite ? (
                        <div className="space-y-1">
                          <div
                            className={`text-[11px] line-through ${colors.muted}`}
                          >
                            "
                            {item.originalText.length > 60
                              ? item.originalText.slice(0, 60) + "…"
                              : item.originalText}
                            "
                          </div>
                          <div
                            className={`text-xs ${
                              isDarkMode
                                ? "text-emerald-400"
                                : "text-emerald-600"
                            }`}
                          >
                            "{item.truncatedText}"
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`text-xs leading-relaxed ${colors.label}`}
                        >
                          "{item.truncatedText}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`p-8 text-center ${colors.muted}`}>
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <div className="text-sm">No sentences available</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsultationScoringV8;
