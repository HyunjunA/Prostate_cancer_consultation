import React, { useMemo, useState } from "react";

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
}

const ConsultationScoring: React.FC<ConsultationScoringProps> = ({
  title = "Consultation Scoring: 3 (Imprecise Quantification)",
  subtitle = "Quality of Risk Communication",
  highlightedQuote,
  sentences = [],
  highlightPosition = 3,
  leftLabel = "Cancer\nPrognosis",
  maxSentenceChars = 80,
  isDarkMode = false,
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
    // If new sentences array is provided, use it
    if (sentences && sentences.length > 0) {
      return sentences.map((item) => {
        // Use revised sentence if available, otherwise original
        const text =
          item.hasRewrite && item.revisedSentence
            ? item.revisedSentence
            : item.sentence;
        const needsTrunc = text.length > maxSentenceChars;
        const truncated = needsTrunc
          ? `${text.slice(0, maxSentenceChars)}\u2026`
          : text;
        return {
          fullText: text,
          truncatedText: truncated,
          isTruncated: needsTrunc,
          hasRewrite: item.hasRewrite,
        };
      });
    }

    // Fallback to legacy highlightedQuote (single string)
    if (highlightedQuote) {
      const needsTrunc = highlightedQuote.length > maxSentenceChars;
      const truncated = needsTrunc
        ? `${highlightedQuote.slice(0, maxSentenceChars)}\u2026`
        : highlightedQuote;
      return [
        {
          fullText: highlightedQuote,
          truncatedText: truncated,
          isTruncated: needsTrunc,
          hasRewrite: false,
        },
      ];
    }

    return [];
  }, [sentences, highlightedQuote, maxSentenceChars]);

  const [showTooltip, setShowTooltip] = useState(false);

  // Check if any sentence is truncated (for tooltip)
  const hasAnyTruncation = displaySentences.some((s) => s.isTruncated);

  // --- Color palette swaps based on isDarkMode ---
  const outerBg = isDarkMode ? "bg-gray-900" : "bg-white";
  const titleColor = isDarkMode ? "text-gray-100" : "text-gray-800";
  const leftLabelColor = isDarkMode ? "text-gray-200" : "text-gray-700";
  const numberColor = isDarkMode ? "text-gray-100" : "text-gray-800";
  const labelColor = isDarkMode ? "text-gray-300" : "text-gray-700";
  const subtitleColor = isDarkMode ? "text-gray-200" : "text-gray-700";
  const barColor = isDarkMode ? "bg-blue-400" : "bg-blue-600";
  const quoteBg = isDarkMode ? "bg-amber-400" : "bg-yellow-300";
  const quoteText = isDarkMode ? "text-gray-900" : "text-gray-800";
  const tooltipBg = isDarkMode
    ? "bg-gray-800 border-gray-700"
    : "bg-white border-gray-200";
  const tooltipText = isDarkMode ? "text-gray-100" : "text-gray-900";
  const caretClass = isDarkMode ? "border-t-amber-400" : "border-t-yellow-300";
  const tickColor = isDarkMode
    ? "#93c5fd" /* blue-300 */
    : "#2563eb"; /* blue-600 */
  const rewrittenColor = isDarkMode ? "text-emerald-700" : "text-emerald-700";
  const bulletColor = isDarkMode ? "text-gray-700" : "text-gray-600";

  return (
    <div className={`w-full max-w-6xl mx-auto p-12 ${outerBg}`}>
      {/* Title */}
      <div className="text-center" style={{ marginBottom: "8rem" }}>
        <h1 className={`text-2xl font-semibold ${titleColor}`}>{title}</h1>
      </div>

      <div className="flex items-start gap-8">
        {/* Left label */}
        <div
          className={`text-lg font-semibold ${leftLabelColor} text-right min-w-24 pt-24`}
        >
          <div className="whitespace-pre-line ">{leftLabel}</div>
        </div>

        {/* Scale area */}
        <div className="flex-1 relative">
          {/* Quote Bubble - Now shows all sentences as bullet points */}
          <div
            className="absolute -top-24 group"
            style={{
              left: `${pct}%`,
              transform: "translateX(-50%)",
              // Adjust top position based on number of sentences
              top:
                displaySentences.length > 2
                  ? `-${6 + (displaySentences.length - 1) * 1.5}rem`
                  : "-6rem",
            }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <div
              className={`${quoteBg} rounded-xl p-4 text-sm ${quoteText} shadow-lg`}
              style={{
                minWidth: "200px",
                maxWidth: "320px",
                maxHeight: "200px",
                overflowY: "auto",
              }}
            >
              {displaySentences.length > 0 ? (
                <ul className="space-y-2">
                  {displaySentences.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span
                        className={`${bulletColor} font-bold flex-shrink-0`}
                      >
                        •
                      </span>
                      <span
                        className={`leading-tight ${
                          item.hasRewrite ? rewrittenColor + " font-medium" : ""
                        }`}
                      >
                        "{item.truncatedText}"
                        {item.hasRewrite && (
                          <span className="ml-1 text-xs bg-emerald-600 text-white px-1 py-0.5 rounded">
                            revised
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="font-medium leading-tight italic text-gray-500">
                  No sentences available
                </div>
              )}
            </div>
            {/* caret */}
            <div
              className={`mx-auto w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent ${caretClass}`}
            ></div>

            {/* Custom hover tooltip with full text */}
            {hasAnyTruncation && (
              <div
                className={
                  `absolute left-1/2 -translate-x-1/2 mt-3 z-50 ` +
                  `${
                    showTooltip
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-95 pointer-events-none"
                  }`
                }
                style={{ minWidth: "20rem", maxWidth: "32rem" }}
              >
                <div className={`rounded-xl border ${tooltipBg} shadow-xl p-4`}>
                  <ul className="space-y-3">
                    {displaySentences.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span
                          className={`${tooltipText} font-bold flex-shrink-0`}
                        >
                          •
                        </span>
                        <span
                          className={`text-sm ${tooltipText} leading-snug ${
                            item.hasRewrite ? "font-medium" : ""
                          }`}
                        >
                          "{item.fullText}"
                          {item.hasRewrite && (
                            <span className="ml-1 text-xs bg-emerald-500 text-white px-1 py-0.5 rounded">
                              revised
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Blue horizontal line */}
          <div className={`relative h-2 ${barColor} rounded-full mt-24`}>
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

          {/* Scale labels */}
          <div className="relative mt-8">
            {scaleItems.map((item, index) => (
              <div
                key={item.value}
                className="absolute text-center"
                style={{
                  left: `${(index / 5) * 100}%`,
                  transform: "translateX(-50%)",
                  width: "120px",
                }}
              >
                <div className={`text-xl font-bold ${numberColor} mb-2`}>
                  {item.value}
                </div>
                <div
                  className={`text-sm ${labelColor} whitespace-pre-line leading-tight`}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subtitle */}
      <div className="text-center mt-16">
        <h2 className={`text-xl font-semibold ${subtitleColor}`}>{subtitle}</h2>
      </div>
    </div>
  );
};

export default ConsultationScoring;
