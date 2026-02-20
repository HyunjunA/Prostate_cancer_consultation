import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface DiagnosisEvent {
  diagnosis_complete: number;
}

interface PatientData {
  [patientId: string]: DiagnosisEvent[];
}

interface DataCompletenessChartProps {
  data: PatientData;
  isDarkMode?: boolean;
}

const DataCompletenessChart: React.FC<DataCompletenessChartProps> = ({
  data,
  isDarkMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [completenessPercent, setCompletenessPercent] = useState(0);
  const [animatedPercent, setAnimatedPercent] = useState(0);

  useEffect(() => {
    const totalEvents = Object.values(data).flat().length;
    const completeEvents = Object.values(data)
      .flat()
      .filter((event) => event.diagnosis_complete === 2).length;

    const percent = totalEvents > 0 ? (completeEvents / totalEvents) * 100 : 0;
    setCompletenessPercent(percent);
  }, [data]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 400;
    const height = 300;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 80;
    const strokeWidth = 12;

    // Color scheme based on dark mode
    const textColor = isDarkMode ? "#e2e8f0" : "#2d3748";
    const secondaryTextColor = isDarkMode ? "#94a3b8" : "#6b7280";

    // Create gradients
    const defs = svg.append("defs");

    // Progress gradient
    const progressGradient = defs
      .append("linearGradient")
      .attr("id", "progressGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", width)
      .attr("y2", 0);

    progressGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#667eea");

    progressGradient
      .append("stop")
      .attr("offset", "50%")
      .attr("stop-color", "#764ba2");

    progressGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#f093fb");

    // Background gradient
    const bgGradient = defs
      .append("linearGradient")
      .attr("id", "bgGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", width)
      .attr("y2", height);

    bgGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", isDarkMode ? "#374151" : "#f3f4f6");

    bgGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", isDarkMode ? "#1f2937" : "#e5e7eb");

    // Glow filter
    const glowFilter = defs.append("filter").attr("id", "glow");

    glowFilter
      .append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "coloredBlur");

    const feMerge = glowFilter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Background circle
    svg
      .append("circle")
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", radius)
      .attr("fill", "none")
      .attr("stroke", "url(#bgGradient)")
      .attr("stroke-width", strokeWidth)
      .attr("opacity", 0.3);

    // Progress arc
    const arc = d3
      .arc()
      .innerRadius(radius - strokeWidth / 2)
      .outerRadius(radius + strokeWidth / 2)
      .startAngle(-Math.PI / 2)
      .endAngle(-Math.PI / 2);

    const progressArc = svg
      .append("path")
      .attr("transform", `translate(${centerX}, ${centerY})`)
      .attr("fill", "url(#progressGradient)")
      .attr("filter", "url(#glow)")
      .attr("d", arc);

    // Animated percentage text
    const percentText = svg
      .append("text")
      .attr("x", centerX)
      .attr("y", centerY - 10)
      .attr("text-anchor", "middle")
      .attr("font-size", "36px")
      .attr("font-weight", "bold")
      .attr("fill", textColor)
      .text("0%");

    const labelText = svg
      .append("text")
      .attr("x", centerX)
      .attr("y", centerY + 20)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "500")
      .attr("fill", secondaryTextColor)
      .text("Complete");

    // Animate the arc and percentage
    const animateProgress = () => {
      const endAngle = -Math.PI / 2 + (completenessPercent / 100) * 2 * Math.PI;

      progressArc
        .transition()
        .duration(2000)
        .ease(d3.easeElasticOut)
        .attrTween("d", function () {
          const interpolate = d3.interpolate(-Math.PI / 2, endAngle);
          return function (t) {
            const currentAngle = interpolate(t);
            return d3
              .arc()
              .innerRadius(radius - strokeWidth / 2)
              .outerRadius(radius + strokeWidth / 2)
              .startAngle(-Math.PI / 2)
              .endAngle(currentAngle)();
          };
        });

      // Animate percentage counter
      const percentCounter = { value: 0 };
      d3.select(percentCounter)
        .transition()
        .duration(2000)
        .ease(d3.easeElasticOut)
        .tween("text", function () {
          const interpolate = d3.interpolate(0, completenessPercent);
          return function (t) {
            const currentPercent = interpolate(t);
            setAnimatedPercent(currentPercent);
            percentText.text(`${Math.round(currentPercent)}%`);
          };
        });
    };

    // Start animation after a short delay
    setTimeout(animateProgress, 300);

    // Add interactive elements
    const hoverCircle = svg
      .append("circle")
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", radius + 20)
      .attr("fill", "transparent")
      .attr("cursor", "pointer")
      .on("mouseenter", function () {
        progressArc
          .transition()
          .duration(200)
          .attr("transform", `translate(${centerX}, ${centerY}) scale(1.05)`);

        percentText.transition().duration(200).attr("font-size", "40px");
      })
      .on("mouseleave", function () {
        progressArc
          .transition()
          .duration(200)
          .attr("transform", `translate(${centerX}, ${centerY}) scale(1)`);

        percentText.transition().duration(200).attr("font-size", "36px");
      });

    // Add decorative dots
    const numDots = 20;
    for (let i = 0; i < numDots; i++) {
      const angle = (i / numDots) * 2 * Math.PI;
      const dotRadius = radius + 35;
      const x = centerX + Math.cos(angle) * dotRadius;
      const y = centerY + Math.sin(angle) * dotRadius;

      svg
        .append("circle")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", 2)
        .attr("fill", isDarkMode ? "#4b5563" : "#d1d5db")
        .attr("opacity", 0.5)
        .transition()
        .delay(i * 50)
        .duration(1000)
        .attr("opacity", i / numDots < completenessPercent / 100 ? 1 : 0.2);
    }
  }, [completenessPercent, isDarkMode]);

  const totalEvents = Object.values(data).flat().length;
  const completeEvents = Object.values(data)
    .flat()
    .filter((event) => event.diagnosis_complete === 2).length;
  const incompleteEvents = totalEvents - completeEvents;

  return (
    <div className="relative w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-blue-900 dark:to-indigo-900 rounded-2xl shadow-2xl border border-white/20 backdrop-blur-sm p-6 overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-24 h-24 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full blur-2xl"></div>
      <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-pink-400/20 to-yellow-400/20 rounded-full blur-3xl"></div>

      {/* Header */}
      <div className="relative z-10 mb-6">
        <div className="text-center">
          <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Data Completeness
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Diagnosis completion status overview
          </p>
        </div>
      </div>

      {/* Main Chart Container */}
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
        {/* Circular Progress Chart */}
        <div className="relative bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl shadow-lg border border-white/30 p-6">
          <svg
            ref={svgRef}
            width="400"
            height="300"
            className="drop-shadow-sm"
            style={{ background: "transparent" }}
          />

          {/* Pulse animation for incomplete data warning */}
          {completenessPercent < 80 && (
            <div className="absolute top-4 right-4">
              <div className="relative">
                <div className="w-3 h-3 bg-red-400 rounded-full animate-ping"></div>
                <div className="absolute top-0 w-3 h-3 bg-red-500 rounded-full"></div>
              </div>
            </div>
          )}
        </div>

        {/* Statistics Panel */}
        <div className="flex flex-col gap-4 min-w-[250px]">
          {/* Complete Events */}
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl shadow-lg border border-white/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {completeEvents}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  Complete Events
                </div>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-green-600 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Incomplete Events */}
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl shadow-lg border border-white/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {incompleteEvents}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  Incomplete Events
                </div>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Total Events */}
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl shadow-lg border border-white/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {totalEvents}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  Total Events
                </div>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Completion Status */}
          <div
            className={`bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl shadow-lg border border-white/30 p-4 ${
              completenessPercent >= 90
                ? "ring-2 ring-green-500/50"
                : completenessPercent >= 70
                ? "ring-2 ring-yellow-500/50"
                : "ring-2 ring-red-500/50"
            }`}
          >
            <div className="text-center">
              <div
                className={`text-lg font-semibold ${
                  completenessPercent >= 90
                    ? "text-green-600 dark:text-green-400"
                    : completenessPercent >= 70
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {completenessPercent >= 90
                  ? "Excellent"
                  : completenessPercent >= 70
                  ? "Good"
                  : "Needs Attention"}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Data Quality Status
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar Alternative */}
      <div className="mt-8 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl shadow-lg border border-white/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Overall Completion
          </span>
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
            {Math.round(completenessPercent)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-2000 ease-out shadow-lg"
            style={{
              width: `${animatedPercent}%`,
              boxShadow: "0 0 10px rgba(59, 130, 246, 0.5)",
            }}
          ></div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
        <span>
          Hover over the chart for interactive effects • Based on
          diagnosis_complete field values
        </span>
      </div>
    </div>
  );
};

export default DataCompletenessChart;
