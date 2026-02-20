import React, { useState, useMemo } from "react";
import { Target, Clock, Heart, Droplets, Zap, Loader2 } from "lucide-react";

// ═══════════════════════════════════════════════════════════
// TopicRadarChart - 5 Topics Radar Visualization
// FIXED: Label positioning to prevent overlap
// ═══════════════════════════════════════════════════════════

type TopicName =
  | "Cancer Prognosis"
  | "Life Expectancy"
  | "Erectile Dysfunction"
  | "Urinary Incontinence"
  | "Irritative Symptoms";

interface TopicData {
  score: number | null;
  sentenceCount: number;
}

interface TopicRadarChartProps {
  data: Record<TopicName, TopicData>;
  selectedTopic: TopicName | null;
  onTopicClick: (topic: TopicName) => void;
  isDarkMode?: boolean;
  loading?: boolean;
}

const TOPICS: TopicName[] = [
  "Cancer Prognosis",
  "Life Expectancy",
  "Erectile Dysfunction",
  "Urinary Incontinence",
  "Irritative Symptoms",
];

// Even shorter labels
const TOPIC_SHORT_LABELS: Record<TopicName, string> = {
  "Cancer Prognosis": "Cancer",
  "Life Expectancy": "Life",
  "Erectile Dysfunction": "ED",
  "Urinary Incontinence": "UI",
  "Irritative Symptoms": "Irrit.",
};

const TOPIC_ICONS: Record<TopicName, React.ReactNode> = {
  "Cancer Prognosis": <Target className="w-3.5 h-3.5" />,
  "Life Expectancy": <Clock className="w-3.5 h-3.5" />,
  "Erectile Dysfunction": <Heart className="w-3.5 h-3.5" />,
  "Urinary Incontinence": <Droplets className="w-3.5 h-3.5" />,
  "Irritative Symptoms": <Zap className="w-3.5 h-3.5" />,
};

const getScoreColor = (score: number | null, isDarkMode: boolean): string => {
  if (score === null) return isDarkMode ? "#64748b" : "#94a3b8";
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

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const TopicRadarChart: React.FC<TopicRadarChartProps> = ({
  data,
  selectedTopic,
  onTopicClick,
  isDarkMode = false,
  loading = false,
}) => {
  const [hoveredTopic, setHoveredTopic] = useState<TopicName | null>(null);

  // Increased size for better spacing
  const size = 280;
  const center = size / 2;
  const maxRadius = 90;
  const levels = 5;
  const labelRadius = 130; // Distance for labels from center

  const getPoint = (index: number, value: number, total: number = 5) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const radius = (value / 5) * maxRadius;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  };

  // Get label position with more distance
  const getLabelPosition = (index: number) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    return {
      x: center + labelRadius * Math.cos(angle),
      y: center + labelRadius * Math.sin(angle),
    };
  };

  const dataPoints = useMemo(() => {
    return TOPICS.map((topic, i) => {
      const score = data[topic]?.score ?? 0;
      return getPoint(i, score);
    });
  }, [data]);

  const dataPath = useMemo(() => {
    if (dataPoints.length === 0) return "";
    return (
      dataPoints
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
        .join(" ") + " Z"
    );
  }, [dataPoints]);

  const colors = {
    gridLine: isDarkMode
      ? "rgba(148, 163, 184, 0.15)"
      : "rgba(148, 163, 184, 0.25)",
    axisLine: isDarkMode
      ? "rgba(148, 163, 184, 0.3)"
      : "rgba(148, 163, 184, 0.4)",
    dataFill: isDarkMode
      ? "rgba(34, 211, 238, 0.2)"
      : "rgba(6, 182, 212, 0.15)",
    dataStroke: isDarkMode ? "#22d3ee" : "#06b6d4",
    text: isDarkMode ? "#e2e8f0" : "#334155",
    textMuted: isDarkMode ? "#94a3b8" : "#64748b",
  };

  const avgScore = useMemo(() => {
    const scores = TOPICS.map((t) => data[t]?.score).filter(
      (s) => s !== null
    ) as number[];
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }, [data]);

  if (loading) {
    return (
      <div
        className={cx(
          "flex items-center justify-center rounded-2xl",
          isDarkMode ? "bg-slate-800" : "bg-slate-50"
        )}
        style={{ width: size, height: size }}
      >
        <Loader2
          className={cx(
            "w-8 h-8 animate-spin",
            isDarkMode ? "text-cyan-400" : "text-cyan-600"
          )}
        />
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Center average score */}
      <div
        className="absolute z-10 flex flex-col items-center justify-center"
        style={{
          left: center - 28,
          top: center - 28,
          width: 56,
          height: 56,
        }}
      >
        <div
          className={`text-xl font-bold ${
            isDarkMode ? "text-cyan-400" : "text-cyan-600"
          }`}
        >
          {avgScore !== null ? avgScore.toFixed(1) : "—"}
        </div>
        <div className={`text-[9px] ${colors.textMuted}`}>AVG</div>
      </div>

      <svg width={size} height={size} className="overflow-visible">
        {/* Background grid (5 levels) */}
        {Array.from({ length: levels }, (_, level) => {
          const points = Array.from({ length: 5 }, (_, i) =>
            getPoint(i, level + 1)
          );
          const d =
            points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
              .join(" ") + " Z";
          return (
            <path
              key={level}
              d={d}
              fill="none"
              stroke={colors.gridLine}
              strokeWidth="1"
            />
          );
        })}

        {/* Axis lines */}
        {TOPICS.map((_, i) => {
          const endPoint = getPoint(i, 5);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={endPoint.x}
              y2={endPoint.y}
              stroke={colors.axisLine}
              strokeWidth="1"
            />
          );
        })}

        {/* Data area */}
        <path
          d={dataPath}
          fill={colors.dataFill}
          stroke={colors.dataStroke}
          strokeWidth="2"
          className="transition-all duration-500"
        />

        {/* Data points */}
        {TOPICS.map((topic, i) => {
          const score = data[topic]?.score;
          const point = dataPoints[i];
          const isSelected = selectedTopic === topic;
          const isHovered = hoveredTopic === topic;
          const pointColor = getScoreColor(score, isDarkMode);

          return (
            <g key={topic}>
              {/* Click area */}
              <circle
                cx={point.x}
                cy={point.y}
                r={16}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onTopicClick(topic)}
                onMouseEnter={() => setHoveredTopic(topic)}
                onMouseLeave={() => setHoveredTopic(null)}
              />

              {/* Point */}
              <circle
                cx={point.x}
                cy={point.y}
                r={isSelected || isHovered ? 8 : 6}
                fill={pointColor}
                stroke={
                  isSelected ? (isDarkMode ? "#22d3ee" : "#0891b2") : "white"
                }
                strokeWidth={isSelected ? 3 : 2}
                className="transition-all duration-300 cursor-pointer"
                onClick={() => onTopicClick(topic)}
                onMouseEnter={() => setHoveredTopic(topic)}
                onMouseLeave={() => setHoveredTopic(null)}
              />

              {/* Score on hover */}
              {(isSelected || isHovered) && (
                <text
                  x={point.x}
                  y={point.y - 14}
                  textAnchor="middle"
                  className={`text-[10px] font-bold fill-current ${
                    isDarkMode ? "text-slate-100" : "text-slate-800"
                  }`}
                >
                  {score?.toFixed(1) ?? "N/A"}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* External labels - positioned outside SVG for better control */}
      {TOPICS.map((topic, i) => {
        const pos = getLabelPosition(i);
        const isSelected = selectedTopic === topic;
        const isHovered = hoveredTopic === topic;
        const sentenceCount = data[topic]?.sentenceCount ?? 0;
        const score = data[topic]?.score;

        // Adjust anchor based on position
        let translateX = "-50%";
        let translateY = "-50%";

        // Top
        if (i === 0) {
          translateY = "-100%";
        }
        // Right side
        else if (i === 1 || i === 2) {
          translateX = "0%";
          translateY = i === 1 ? "-30%" : "-70%";
        }
        // Left side
        else if (i === 3 || i === 4) {
          translateX = "-100%";
          translateY = i === 3 ? "-70%" : "-30%";
        }

        return (
          <button
            key={topic}
            onClick={() => onTopicClick(topic)}
            onMouseEnter={() => setHoveredTopic(topic)}
            onMouseLeave={() => setHoveredTopic(null)}
            className={cx(
              "absolute px-2 py-1.5 rounded-lg transition-all duration-200",
              isSelected
                ? isDarkMode
                  ? "bg-cyan-900/60 ring-1 ring-cyan-500"
                  : "bg-cyan-50 ring-1 ring-cyan-400"
                : isHovered
                ? isDarkMode
                  ? "bg-slate-700/80"
                  : "bg-slate-100"
                : ""
            )}
            style={{
              left: pos.x,
              top: pos.y,
              transform: `translate(${translateX}, ${translateY})`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className={cx(
                  "p-1 rounded",
                  isSelected
                    ? isDarkMode
                      ? "text-cyan-400"
                      : "text-cyan-600"
                    : isDarkMode
                    ? "text-slate-400"
                    : "text-slate-500"
                )}
              >
                {TOPIC_ICONS[topic]}
              </div>
              <div className="text-left">
                <div
                  className={`text-[10px] font-semibold leading-tight ${
                    isSelected
                      ? isDarkMode
                        ? "text-cyan-400"
                        : "text-cyan-600"
                      : isDarkMode
                      ? "text-slate-300"
                      : "text-slate-600"
                  }`}
                >
                  {TOPIC_SHORT_LABELS[topic]}
                </div>
                <div className={`text-[8px] ${colors.textMuted}`}>
                  {sentenceCount}s • {score?.toFixed(1) ?? "—"}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default TopicRadarChart;
