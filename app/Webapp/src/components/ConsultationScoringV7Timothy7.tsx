// ConsultationScoringV7.tsx
// Enhanced with AI Rewrite and Improvement Suggestions

import React, { useMemo, useState } from "react";

// ═══════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════

// Sentence item interface for displaying in the bubble
interface SentenceItem {
  sentence: string;
  hasRewrite?: boolean;
  revisedSentence?: string;
  score?: number;
  revisedScore?: number;
}

// Improvement suggestion interface
interface ImprovementSuggestion {
  targetScore: number;
  suggestion: string;
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
  /** Suggestions for improvement */
  suggestions?: ImprovementSuggestion[];
  /** Callback when a suggestion is clicked */
  onSuggestionClick?: (suggestion: ImprovementSuggestion) => void;
  /** Full context text (with representative sentence to highlight) */
  fullContext?: string;
  /** AI Re-write text */
  aiRewriteText?: string;
  /** AI Re-write loading state */
  aiRewriteLoading?: boolean;
  /** Callback when Generate AI Re-write button is clicked */
  onGenerateAIRewrite?: () => void;
  /** Callback when Use AI Re-write button is clicked */
  onUseAIRewrite?: (rewrittenText: string) => void;
}

// Score color utility function
const getScoreBadgeColor = (
  score: number | null | undefined,
  isDarkMode: boolean,
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
  suggestions = [],
  onSuggestionClick,
  fullContext,
  aiRewriteText,
  aiRewriteLoading = false,
  onGenerateAIRewrite,
  onUseAIRewrite,
}) => {
  // State for collapsible sections
  const [isContextExpanded, setIsContextExpanded] = useState(false);

  const scaleItems = [
    { value: 0, label: "No\nmention" },
    { value: 1, label: "Name\nOnly" },
    { value: 2, label: 'Generalization\n("High"/"Low")' },
    { value: 3, label: "Imprecise\nQuantification" },
    { value: 4, label: "Specific\nQuantification" },
    { value: 5, label: "Patient-\ncentered\nEstimate" },
  ];

  const pct = (highlightPosition / 5) * 100;

  // Get the selected sentence for highlighting in full context
  const selectedSentence = useMemo(() => {
    if (sentences && sentences.length > 0 && sentences[selectedIdx]) {
      return sentences[selectedIdx].sentence;
    }
    return highlightedQuote || "";
  }, [sentences, selectedIdx, highlightedQuote]);

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

  // Highlight the selected sentence in full context
  const highlightedContext = useMemo(() => {
    if (!fullContext || !selectedSentence) return null;

    const index = fullContext
      .toLowerCase()
      .indexOf(selectedSentence.toLowerCase());
    if (index === -1) return fullContext;

    const before = fullContext.slice(0, index);
    const match = fullContext.slice(index, index + selectedSentence.length);
    const after = fullContext.slice(index + selectedSentence.length);

    return { before, match, after };
  }, [fullContext, selectedSentence]);

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

  // Suggestion & AI Rewrite colors
  const sectionBg = isDarkMode ? "bg-slate-800" : "bg-slate-50";
  const sectionBorder = isDarkMode ? "border-slate-600" : "border-slate-200";
  const aiRewriteBg = isDarkMode ? "bg-emerald-800" : "bg-emerald-100";
  const aiRewriteBorder = isDarkMode
    ? "border-emerald-600"
    : "border-emerald-300";
  const aiRewriteTextColor = isDarkMode
    ? "text-emerald-100"
    : "text-emerald-900";
  const highlightBg = isDarkMode ? "bg-yellow-600/50" : "bg-yellow-200";

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
              {/* Expanded bubble with paragraph style */}
              <div
                className={`${bubbleBg} ${bubbleText} rounded-xl shadow-lg border ${bubbleBorder}`}
                style={{
                  width: "560px",
                  maxHeight: "160px",
                  overflowY: "auto",
                }}
              >
                {displaySentences.length > 0 ? (
                  <div className="p-3 text-sm leading-relaxed flex gap-3">
                    {/* Left: Selected sentence info panel */}
                    {displaySentences[selectedIdx] && (
                      <div
                        className={`
                          flex-shrink-0 pr-3 border-r flex flex-col items-center gap-1.5
                          ${
                            isDarkMode ? "border-slate-600" : "border-slate-200"
                          }
                        `}
                        style={{ minWidth: "60px" }}
                      >
                        {/* Score Badge */}
                        <span
                          className={`
                            inline-flex items-center justify-center 
                            w-8 h-8 rounded text-sm font-bold
                            ${getScoreBadgeColor(
                              displaySentences[selectedIdx].score,
                              isDarkMode,
                            )}
                          `}
                        >
                          {displaySentences[selectedIdx].score ?? "N/A"}
                        </span>

                        {displaySentences[selectedIdx].hasRewrite && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500 text-white font-medium">
                            Rewritten
                          </span>
                        )}

                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500 text-white font-medium">
                          Selected
                        </span>

                        <span
                          className={`text-[9px] text-center ${
                            isDarkMode ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          {selectedIdx + 1} / {displaySentences.length}
                        </span>
                      </div>
                    )}

                    {/* Right: Paragraph text */}
                    <div className="flex-1">
                      {displaySentences.map((item, idx) => {
                        const isSelected = idx === selectedIdx;

                        // Determine underline color based on state
                        const underlineColor = item.hasRewrite
                          ? isDarkMode
                            ? "border-emerald-500"
                            : "border-emerald-400"
                          : isDarkMode
                            ? "border-slate-500"
                            : "border-slate-400";

                        // Highlight background for selected
                        const highlightStyle = isSelected
                          ? isDarkMode
                            ? "bg-cyan-900/50 rounded px-1"
                            : "bg-cyan-100 rounded px-1"
                          : "hover:bg-slate-200/50 rounded px-0.5";

                        return (
                          <span key={idx} className="inline">
                            {/* The sentence text with underline */}
                            <span
                              onClick={() => onSentenceClick?.(idx)}
                              className={`
                                cursor-pointer transition-all
                                border-b-2 border-dashed ${underlineColor}
                                ${highlightStyle}
                                ${
                                  item.hasRewrite
                                    ? isDarkMode
                                      ? "text-emerald-400"
                                      : "text-emerald-600"
                                    : ""
                                }
                              `}
                            >
                              {item.hasRewrite
                                ? item.displayText
                                : item.originalText}
                            </span>
                            {/* Space between sentences */}
                            {idx < displaySentences.length - 1 && " "}
                          </span>
                        );
                      })}

                      {/* Show original if rewritten - below paragraph */}
                      {displaySentences[selectedIdx]?.hasRewrite && (
                        <div
                          className={`mt-2 pt-2 border-t text-[10px] line-through ${
                            isDarkMode ? "border-slate-600" : "border-slate-200"
                          } ${originalTextColor}`}
                        >
                          Original Chunk: "
                          {displaySentences[selectedIdx].originalText.length >
                          80
                            ? displaySentences[selectedIdx].originalText.slice(
                                0,
                                80,
                              ) + "…"
                            : displaySentences[selectedIdx].originalText}
                          "
                        </div>
                      )}
                    </div>
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

      <div className="text-center mt-4">
        <h2 className={`text-xl font-semibold ${subtitleColor}`}>{subtitle}</h2>
      </div>

      {suggestions && suggestions.length > 0 && (
        <div
          className={`mt-6 rounded-lg border ${sectionBorder} ${sectionBg} p-4`}
        >
          <div className="flex items-center gap-2 mb-3">
            <h3
              className={`text-sm font-semibold uppercase tracking-wider ${titleColor}`}
            >
              Rubric Guidance
            </h3>
            <span
              className={`text-xs font-normal px-1.5 py-0.5 rounded ${
                isDarkMode
                  ? "bg-slate-700 text-slate-400"
                  : "bg-slate-200 text-slate-500"
              }`}
              title="Source: Rubric-based scoring criteria"
            >
              Rubric
            </span>
          </div>
          <ul className="space-y-2">
            {suggestions.map((suggestion, idx) => (
              <li
                key={idx}
                onClick={() => onSuggestionClick?.(suggestion)}
                className={`
                  flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                  ${sectionBorder} ${itemHoverBg}
                  ${isDarkMode ? "text-slate-300" : "text-slate-700"}
                `}
              >
                <span
                  className={`
                    inline-flex items-center justify-center 
                    min-w-[2rem] px-2 py-1 rounded text-xs font-bold
                    ${getScoreBadgeColor(suggestion.targetScore, isDarkMode)}
                  `}
                >
                  {suggestion.targetScore}
                </span>

                <div className="flex-1">
                  <span
                    className={`text-xs font-medium ${
                      isDarkMode ? "text-amber-400" : "text-amber-600"
                    }`}
                  >
                    To reach Score {suggestion.targetScore}:
                  </span>
                  <p className="text-sm leading-relaxed mt-1">
                    {suggestion.suggestion}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* {(onGenerateAIRewrite || aiRewriteText) && (
        <div
          className={`mt-4 rounded-lg border ${sectionBorder} ${sectionBg} p-4 opacity-60`}
        >
          <div className="flex items-center gap-2 mb-3">
            <h3
              className={`text-sm font-semibold uppercase tracking-wider ${titleColor}`}
            >
              AI Re-write
            </h3>
            <span
              className={`text-xs font-normal px-1.5 py-0.5 rounded ${
                isDarkMode
                  ? "bg-purple-900/50 text-purple-300"
                  : "bg-purple-100 text-purple-600"
              }`}
              title="Source: AI-generated suggestions"
            >
              AI
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded ${
                isDarkMode
                  ? "bg-amber-900/50 text-amber-300"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              Phase 2 — Coming Soon
            </span>
          </div>

          <p
            className={`text-sm mb-3 ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}
          >
            AI-powered rewriting assistance will be available in a future
            update. For now, please use the manual rewrite feature below.
          </p>

          {aiRewriteText && (
            <div
              className={`${aiRewriteBg} ${aiRewriteTextColor} rounded-lg border ${aiRewriteBorder} px-4 py-3 mb-4`}
            >
              <div className="text-sm leading-relaxed">"{aiRewriteText}"</div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              disabled={true}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
                cursor-not-allowed
                ${
                  isDarkMode
                    ? "bg-slate-700 text-slate-500"
                    : "bg-slate-200 text-slate-400"
                }
              `}
            >
              Generate (Disabled)
            </button>

            {aiRewriteText && onUseAIRewrite && (
              <button
                onClick={() => onUseAIRewrite(aiRewriteText)}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${
                    isDarkMode
                      ? "bg-cyan-700 text-cyan-100 hover:bg-cyan-600"
                      : "bg-cyan-500 text-white hover:bg-cyan-600"
                  }
                `}
              >
                Use This
              </button>
            )}
          </div>
        </div>
      )} */}

      {/* ═══════════════════════════════════════════════════════════
          NEW: Full Context Section (Collapsible)
          ═══════════════════════════════════════════════════════════ */}
      {fullContext && (
        <div className={`mt-4 rounded-lg border ${sectionBorder} ${sectionBg}`}>
          {/* Header - clickable to expand/collapse */}
          <button
            onClick={() => setIsContextExpanded(!isContextExpanded)}
            className={`
              w-full flex items-center justify-between p-4 text-left
              ${isDarkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}
              rounded-lg transition-all
            `}
          >
            <h3
              className={`text-sm font-semibold uppercase tracking-wider ${titleColor}`}
            >
              Full Context
            </h3>
            <span
              className={`transform transition-transform ${
                isContextExpanded ? "rotate-180" : ""
              }`}
            >
              <svg
                className={`w-5 h-5 ${
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </span>
          </button>

          {/* Expanded content */}
          {isContextExpanded && (
            <div className="px-4 pb-4">
              <div
                className={`text-sm leading-relaxed ${
                  isDarkMode ? "text-slate-300" : "text-slate-700"
                }`}
              >
                {highlightedContext &&
                typeof highlightedContext === "object" ? (
                  <>
                    {highlightedContext.before}
                    <span
                      className={`${highlightBg} font-semibold px-1 rounded`}
                    >
                      {highlightedContext.match}
                    </span>
                    {highlightedContext.after}
                  </>
                ) : (
                  fullContext
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConsultationScoring;
