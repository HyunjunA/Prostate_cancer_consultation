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
    if (sentences && sentences.length > 0) {
      return sentences.map((item) => {
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

  // --- Color palette ---
  const outerBg = isDarkMode ? "bg-gray-900" : "bg-white";
  const titleColor = isDarkMode ? "text-gray-100" : "text-gray-800";
  const leftLabelColor = isDarkMode ? "text-gray-200" : "text-gray-700";
  const numberColor = isDarkMode ? "text-gray-100" : "text-gray-800";
  const labelColor = isDarkMode ? "text-gray-300" : "text-gray-700";
  const subtitleColor = isDarkMode ? "text-gray-200" : "text-gray-700";
  const barColor = isDarkMode ? "bg-blue-400" : "bg-blue-600";
  const quoteBg = isDarkMode ? "bg-amber-400" : "bg-yellow-300";
  const quoteText = isDarkMode ? "text-gray-900" : "text-gray-800";
  const caretClass = isDarkMode ? "border-t-amber-400" : "border-t-yellow-300";
  const tickColor = isDarkMode ? "#93c5fd" : "#2563eb";
  const rewrittenColor = "text-emerald-700";
  const bulletColor = isDarkMode ? "text-gray-700" : "text-gray-600";

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
          style={{ marginTop: "120px" }} // Align with scale bar
        >
          <div className="whitespace-pre-line">{leftLabel}</div>
        </div>

        {/* Scale area container */}
        <div className="flex-1 flex flex-col">
          {/* Bubble area - fixed height */}
          <div className="relative" style={{ height: "120px" }}>
            <div
              className="absolute"
              style={{
                left: `${pct}%`,
                transform: "translateX(-50%)",
                bottom: "8px",
              }}
            >
              <div
                className={`${quoteBg} rounded-xl p-3 text-sm ${quoteText} shadow-lg`}
                style={{
                  width: "280px",
                  maxHeight: "100px",
                  overflowY: "auto",
                }}
              >
                {displaySentences.length > 0 ? (
                  <ul className="space-y-1">
                    {displaySentences.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span
                          className={`${bulletColor} font-bold flex-shrink-0`}
                        >
                          •
                        </span>
                        <span
                          className={`leading-tight text-xs ${
                            item.hasRewrite
                              ? rewrittenColor + " font-medium"
                              : ""
                          }`}
                        >
                          "{item.truncatedText}"
                          {item.hasRewrite && (
                            <span className="ml-1 text-[10px] bg-emerald-600 text-white px-1 py-0.5 rounded">
                              revised
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="font-medium leading-tight italic text-gray-500 text-xs">
                    No sentences available
                  </div>
                )}
              </div>
              {/* Caret */}
              <div
                className={`mx-auto w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent ${caretClass}`}
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
