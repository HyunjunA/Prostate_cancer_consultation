import React, { useMemo } from "react";

// Sentence item interface for displaying in the bubble
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
  /** @deprecated Use `sentences` instead for multiple bullet points */
  highlightedQuote?: string;
  /** Array of sentences to display as bullet points in the bubble */
  sentences?: SentenceItem[];
  highlightPosition?: number; // 0..5
  leftLabel?: string;
  /** Max characters to show per sentence before truncating */
  maxSentenceChars?: number;
  /** Dark-mode toggle: when provided, colors adapt accordingly */
  isDarkMode?: boolean;
  /** Selected sentence index for highlighting */
  selectedIdx?: number;
  /** Callback when a sentence is clicked */
  onSentenceClick?: (idx: number) => void;
}

// Score color utility function
const getScoreBadgeColor = (
  score: number | null | undefined,
  isDarkMode: boolean
): string => {
  if (score === null || score === undefined) {
    return isDarkMode
      ? "bg-slate-600 text-slate-300"
      : "bg-slate-400 text-white";
  }
  const roundedScore = Math.round(score);
  const colors: Record<number, string> = {
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
  return colors[roundedScore] || colors[0];
};

const ConsultationScoring: React.FC<ConsultationScoringProps> = ({
  title = "Consultation Scoring: 3 (Imprecise Quantification)",
  subtitle = "Quality of Risk Communication",
  highlightedQuote,
  sentences = [],
  highlightPosition = 3,
  leftLabel = "Cancer\nPrognosis",
  maxSentenceChars = 120,
  isDarkMode = false,
  selectedIdx = 0,
  onSentenceClick,
}) => {
  const scaleItems = [
    { value: 0, label: "No\nmention" },
    { value: 1, label: "Name\nOnly" },
    { value: 2, label: 'Generalization\n("High"/"Low")' },
    { value: 3, label: "Imprecise\nQuantification" },
    { value: 4, label: "Specific\nQuantification" },
    { value: 5, label: "Patient-\ncentered\nEstimate" },
  ];

  const pct = (highlightPosition / 5) * 100;

  // Process sentences for display
  const displaySentences = useMemo(() => {
    if (sentences && sentences.length > 0) {
      return sentences.map((item) => {
        const displayText =
          item.hasRewrite && item.revisedSentence
            ? item.revisedSentence
            : item.sentence;
        const needsTrunc = displayText.length > maxSentenceChars;
        const truncated = needsTrunc
          ? `${displayText.slice(0, maxSentenceChars)}…`
          : displayText;
        return {
          originalText: item.sentence,
          displayText: displayText,
          truncatedText: truncated,
          isTruncated: needsTrunc,
          hasRewrite: item.hasRewrite,
          score: item.hasRewrite ? item.revisedScore : item.score,
          originalScore: item.score,
          revisedScore: item.revisedScore,
        };
      });
    }

    if (highlightedQuote) {
      const needsTrunc = highlightedQuote.length > maxSentenceChars;
      const truncated = needsTrunc
        ? `${highlightedQuote.slice(0, maxSentenceChars)}…`
        : highlightedQuote;
      return [
        {
          originalText: highlightedQuote,
          displayText: highlightedQuote,
          truncatedText: truncated,
          isTruncated: needsTrunc,
          hasRewrite: false,
          score: undefined,
          originalScore: undefined,
          revisedScore: undefined,
        },
      ];
    }

    return [];
  }, [sentences, highlightedQuote, maxSentenceChars]);

  // --- Color palette ---
  const outerBg = isDarkMode ? "bg-gray-900" : "bg-white";
  const titleColor = isDarkMode ? "text-gray-100" : "text-gray-800";
  const leftLabelColor = isDarkMode ? "text-gray-200" : "text-gray-700";
  const numberColor = isDarkMode ? "text-gray-100" : "text-gray-800";
  const labelColor = isDarkMode ? "text-gray-300" : "text-gray-700";
  const subtitleColor = isDarkMode ? "text-gray-200" : "text-gray-700";
  const barColor = isDarkMode ? "bg-blue-400" : "bg-blue-600";
  const tickColor = isDarkMode ? "#93c5fd" : "#2563eb";

  // Improved bubble colors - softer, more professional
  const bubbleBg = isDarkMode ? "bg-slate-700" : "bg-slate-50";
  const bubbleBorder = isDarkMode ? "border-slate-600" : "border-slate-200";
  const bubbleText = isDarkMode ? "text-slate-200" : "text-slate-700";
  const caretClass = isDarkMode ? "border-t-slate-700" : "border-t-slate-50";

  // Sentence item colors
  const itemBg = isDarkMode ? "bg-slate-800" : "bg-white";
  const itemBorder = isDarkMode ? "border-slate-600" : "border-slate-200";
  const itemHoverBg = isDarkMode ? "hover:bg-slate-700" : "hover:bg-slate-100";
  const selectedBg = isDarkMode
    ? "bg-cyan-900/50 border-cyan-500"
    : "bg-cyan-50 border-cyan-400";
  const rewrittenBorder = isDarkMode
    ? "border-l-emerald-500"
    : "border-l-emerald-500";
  const originalTextColor = isDarkMode ? "text-slate-500" : "text-slate-400";
  const rewrittenTextColor = isDarkMode
    ? "text-emerald-400"
    : "text-emerald-600";

  return (
    <div className={`w-full max-w-6xl mx-auto p-8 ${outerBg}`}>
      {/* Title */}
      <div className="text-center mb-8">
        <h1 className={`text-2xl font-semibold ${titleColor}`}>{title}</h1>
      </div>

      {/* Main content area - uses flexbox for alignment */}
      <div className="flex items-start gap-8">
        {/* Left label */}
        <div
          className={`text-lg font-semibold ${leftLabelColor} text-right min-w-24`}
          style={{ marginTop: "160px" }} // Adjusted for larger bubble
        >
          <div className="whitespace-pre-line">{leftLabel}</div>
        </div>

        {/* Scale area container */}
        <div className="flex-1 flex flex-col">
          {/* Expanded Bubble area */}
          <div className="relative" style={{ minHeight: "180px" }}>
            <div
              className="absolute"
              style={{
                left: `${pct}%`,
                transform: "translateX(-50%)",
                bottom: "8px",
              }}
            >
              {/* Expanded bubble with sentence list */}
              <div
                className={`${bubbleBg} ${bubbleText} rounded-xl shadow-lg border ${bubbleBorder}`}
                style={{
                  width: "380px",
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                {displaySentences.length > 0 ? (
                  <div className="p-2 space-y-2">
                    {displaySentences.map((item, idx) => {
                      const isSelected = idx === selectedIdx;
                      const currentScore = item.score;

                      return (
                        <div
                          key={idx}
                          onClick={() => onSentenceClick?.(idx)}
                          className={`
                            p-2 rounded-lg border cursor-pointer transition-all
                            ${
                              isSelected
                                ? selectedBg
                                : `${itemBg} ${itemBorder} ${itemHoverBg}`
                            }
                            ${
                              item.hasRewrite
                                ? `border-l-4 ${rewrittenBorder}`
                                : ""
                            }
                          `}
                        >
                          {/* Header row: Score badge + status tags */}
                          <div className="flex items-center gap-2 mb-1">
                            {/* Score Badge */}
                            <span
                              className={`
                                inline-flex items-center justify-center 
                                min-w-[1.75rem] px-1.5 py-0.5 rounded text-xs font-bold
                                ${getScoreBadgeColor(currentScore, isDarkMode)}
                              `}
                            >
                              {currentScore ?? "N/A"}
                            </span>

                            {item.hasRewrite && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500 text-white font-medium">
                                Rewritten
                              </span>
                            )}

                            {isSelected && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500 text-white font-medium">
                                Selected
                              </span>
                            )}
                          </div>

                          {/* Sentence content */}
                          {item.hasRewrite ? (
                            <div className="space-y-0.5">
                              <div
                                className={`text-[10px] line-through ${originalTextColor}`}
                              >
                                "
                                {item.originalText.length > 60
                                  ? item.originalText.slice(0, 60) + "…"
                                  : item.originalText}
                                "
                              </div>
                              <div className={`text-xs ${rewrittenTextColor}`}>
                                "{item.truncatedText}"
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs leading-tight">
                              "{item.truncatedText}"
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm italic text-slate-500">
                    No sentences available
                  </div>
                )}
              </div>

              {/* Caret */}
              <div
                className={`mx-auto w-0 h-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent ${caretClass}`}
              />
            </div>
          </div>

          {/* Scale bar */}
          <div className="relative">
            <div className={`h-2 ${barColor} rounded-full`}>
              {/* Ticks */}
              {scaleItems.map((_, index) => (
                <div
                  key={index}
                  className="absolute -top-2 h-6"
                  style={{
                    left: `${(index / 5) * 100}%`,
                    transform: "translateX(-50%)",
                    borderLeft: `2px dashed ${tickColor}`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Scale numbers and labels */}
          <div className="relative mt-4" style={{ height: "80px" }}>
            {scaleItems.map((item, index) => (
              <div
                key={item.value}
                className="absolute text-center"
                style={{
                  left: `${(index / 5) * 100}%`,
                  transform: "translateX(-50%)",
                  width: "100px",
                }}
              >
                <div className={`text-lg font-bold ${numberColor} mb-1`}>
                  {item.value}
                </div>
                <div
                  className={`text-xs ${labelColor} whitespace-pre-line leading-tight`}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subtitle - separate from scale area with enough margin */}
      <div className="text-center mt-4">
        <h2 className={`text-xl font-semibold ${subtitleColor}`}>{subtitle}</h2>
      </div>
    </div>
  );
};

export default ConsultationScoring;
