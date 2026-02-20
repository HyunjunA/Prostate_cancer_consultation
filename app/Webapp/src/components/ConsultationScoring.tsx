import React, { useMemo, useState } from "react";

interface ConsultationScoringProps {
  title?: string;
  subtitle?: string;
  highlightedQuote?: string;
  highlightPosition?: number; // 0..5
  leftLabel?: string;
  /** Max characters to show before truncating with an ellipsis */
  maxQuoteChars?: number;
  /** Dark-mode toggle: when provided, colors adapt accordingly */
  isDarkMode?: boolean;
}

const ConsultationScoring: React.FC<ConsultationScoringProps> = ({
  title = "Consultation Scoring: 3 (Imprecise Quantification)",
  subtitle = "Quality of Risk Communication",
  highlightedQuote = "So 1.2% risk of death from prostate cancer at 15 years is small in the grand scheme of things but it's a little but too high for doctors. 1 in 10 chance of dying of prostate cancer, is too much.",
  highlightPosition = 3,
  leftLabel = "Cancer\nPrognosis",
  maxQuoteChars = 140,
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

  const { isTruncated, truncatedText } = useMemo(() => {
    if (!highlightedQuote) return { isTruncated: false, truncatedText: "" };
    const needsTrunc = highlightedQuote.length > maxQuoteChars;
    const safe = highlightedQuote.slice(0, Math.max(0, maxQuoteChars));
    return {
      isTruncated: needsTrunc,
      truncatedText: needsTrunc ? `${safe}\u2026` : highlightedQuote,
    };
  }, [highlightedQuote, maxQuoteChars]);

  const [showTooltip, setShowTooltip] = useState(false);

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
          {/* Quote Bubble */}
          <div
            className="absolute -top-24 group"
            style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <div
              className={`${quoteBg} rounded-xl p-4 text-sm ${quoteText} shadow-lg max-w-sm`}
              title={highlightedQuote} // fallback tooltip
            >
              <div className="font-medium leading-tight">
                {isTruncated ? `"${truncatedText}"` : `"${highlightedQuote}"`}
              </div>
            </div>
            {/* caret */}
            <div
              className={`mx-auto w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent ${caretClass}`}
            ></div>

            {/* Custom hover tooltip with full text */}
            {isTruncated && (
              <div
                className={
                  `absolute left-1/2 -translate-x-1/2 mt-3 z-50 ` +
                  `${
                    showTooltip
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-95 pointer-events-none"
                  }`
                }
                style={{ minWidth: "16rem", maxWidth: "28rem" }}
              >
                <div className={`rounded-xl border ${tooltipBg} shadow-xl p-4`}>
                  <div
                    className={`text-sm ${tooltipText} leading-snug whitespace-pre-wrap`}
                  >
                    {highlightedQuote}
                  </div>
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
