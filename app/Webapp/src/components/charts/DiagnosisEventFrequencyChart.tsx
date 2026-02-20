import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface DiagnosisEvent {
  redcap_event_name: string;
  redcap_repeat_instance: number;
}

interface PatientData {
  [patientId: string]: DiagnosisEvent[];
}

interface DiagnosisEventFrequencyChartProps {
  data: PatientData;
  isDarkMode?: boolean;
}

const DiagnosisEventFrequencyChart: React.FC<
  DiagnosisEventFrequencyChartProps
> = ({ data, isDarkMode = false }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredBar, setHoveredBar] = useState<any>(null);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const newWidth = Math.max(600, Math.min(containerWidth - 32, 1200));
        const newHeight = Math.max(450, newWidth * 0.75);
        setDimensions({ width: newWidth, height: newHeight });
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dimensions;
    const margin = { top: 80, right: 100, bottom: 80, left: 200 }; // 원래대로 복원하고 right를 증가

    // Color scheme based on dark mode
    const textColor = isDarkMode ? "#e2e8f0" : "#2d3748";
    const axisColor = isDarkMode ? "#94a3b8" : "#4a5568";

    const eventsData = Object.values(data).flat();

    if (eventsData.length === 0) return;

    // Process data
    const frequencyData = d3
      .rollups(
        eventsData,
        (v) => v.length,
        (d) => d.redcap_event_name
      )
      .sort((a, b) => d3.descending(a[1], b[1])); // Sort by frequency

    // Create gradients and patterns
    const defs = svg.append("defs");

    // Bar gradient
    const barGradient = defs
      .append("linearGradient")
      .attr("id", "barGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", width)
      .attr("y2", 0);

    barGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#667eea");

    barGradient
      .append("stop")
      .attr("offset", "50%")
      .attr("stop-color", "#764ba2");

    barGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#f093fb");

    // Hover gradient
    const hoverGradient = defs
      .append("linearGradient")
      .attr("id", "hoverGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", width)
      .attr("y2", 0);

    hoverGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#f093fb");

    hoverGradient
      .append("stop")
      .attr("offset", "50%")
      .attr("stop-color", "#f5576c");

    hoverGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#4facfe");

    // Background pattern
    const pattern = defs
      .append("pattern")
      .attr("id", "bgPattern")
      .attr("width", 40)
      .attr("height", 40)
      .attr("patternUnits", "userSpaceOnUse");

    pattern
      .append("path")
      .attr("d", "M 40 0 L 0 0 0 40")
      .attr("fill", "none")
      .attr(
        "stroke",
        isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"
      )
      .attr("stroke-width", 1);

    // Background
    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#bgPattern)");

    // Scales
    const xScale = d3
      .scaleLinear()
      .domain([0, d3.max(frequencyData, (d) => d[1]) as number])
      .nice()
      .range([margin.left, width - margin.right]);

    const yScale = d3
      .scaleBand()
      .domain(frequencyData.map((d) => d[0]))
      .range([margin.top, height - margin.bottom])
      .padding(0.15);

    // Grid lines
    svg
      .append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${margin.top})`)
      .call(
        d3
          .axisTop(xScale)
          .tickSize(-height + margin.top + margin.bottom)
          .tickFormat(() => "")
      )
      .style("stroke-dasharray", "3,3")
      .style("opacity", 0.3);

    // Create bars
    const bars = svg
      .selectAll(".bar")
      .data(frequencyData)
      .enter()
      .append("g")
      .attr("class", "bar");

    // Background bars for animation
    bars
      .append("rect")
      .attr("y", (d) => yScale(d[0])!)
      .attr("x", margin.left)
      .attr("width", width - margin.left - margin.right)
      .attr("height", yScale.bandwidth())
      .attr("fill", isDarkMode ? "#374151" : "#f3f4f6")
      .attr("rx", 8)
      .attr("opacity", 0.3);

    // Main bars
    bars
      .append("rect")
      .attr("y", (d) => yScale(d[0])!)
      .attr("x", margin.left)
      .attr("width", 0)
      .attr("height", yScale.bandwidth())
      .attr("fill", "url(#barGradient)")
      .attr("rx", 8)
      .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.1))")
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("fill", "url(#hoverGradient)")
          .style("filter", "drop-shadow(0 8px 16px rgba(0,0,0,0.2))")
          .attr("transform", "scale(1.02)");

        setHoveredBar({
          eventName: d[0],
          frequency: d[1],
          x: event.pageX,
          y: event.pageY,
        });
      })
      .on("mouseout", function () {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("fill", "url(#barGradient)")
          .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.1))")
          .attr("transform", "scale(1)");

        setHoveredBar(null);
      })
      .on("mousemove", function (event) {
        if (hoveredBar) {
          setHoveredBar((prev) =>
            prev
              ? {
                  ...prev,
                  x: event.pageX,
                  y: event.pageY,
                }
              : null
          );
        }
      })
      .transition()
      .duration(1500)
      .delay((d, i) => i * 100)
      .ease(d3.easeElasticOut)
      .attr("width", (d) => xScale(d[1]) - margin.left);

    // Value labels on bars
    bars
      .append("text")
      .attr("y", (d) => yScale(d[0])! + yScale.bandwidth() / 2)
      .attr("x", margin.left - 10 + 10) // 시작점 조정
      .attr("dominant-baseline", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "600")
      .attr("fill", "white")
      .attr("opacity", 0)
      .text((d) => d[1])
      .transition()
      .duration(1000)
      .delay((d, i) => i * 100 + 800)
      .attr("opacity", 1)
      .attr("x", (d) => Math.max(margin.left - 10 + 10, xScale(d[1]) - 40)); // 위치 계산 조정

    // Enhanced axes
    const xAxis = svg
      .append("g")
      .attr("transform", `translate(0,${margin.top})`)
      .call(d3.axisTop(xScale).ticks(8).tickSizeOuter(0));

    xAxis
      .selectAll("text")
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("fill", axisColor);

    const yAxis = svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).tickSizeOuter(0));

    yAxis
      .selectAll("text")
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("fill", textColor)
      .style("text-anchor", "end"); // 텍스트를 오른쪽 정렬로 변경

    // Axis lines
    svg
      .selectAll(".domain")
      .style("stroke", axisColor)
      .style("stroke-width", 2);

    svg.selectAll(".tick line").style("stroke", axisColor);

    // Labels
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "600")
      .attr("fill", textColor)
      .text("Event Frequency");

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 20)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "600")
      .attr("fill", textColor)
      .text("Event Names");

    // Add rank indicators - 위치를 더 왼쪽으로 이동
    bars
      .append("circle")
      .attr("cx", margin.left - 80) // -50에서 -80으로 더 왼쪽으로
      .attr("cy", (d) => yScale(d[0])! + yScale.bandwidth() / 2)
      .attr("r", 0)
      .attr("fill", (d, i) => (i < 3 ? "#fbbf24" : "#6b7280"))
      .attr("stroke", "white")
      .attr("stroke-width", 3)
      .style("filter", "drop-shadow(0 3px 6px rgba(0,0,0,0.3))")
      .transition()
      .duration(800)
      .delay((d, i) => i * 100 + 1000)
      .attr("r", 14);

    bars
      .append("text")
      .attr("x", margin.left - 80) // -50에서 -80으로 더 왼쪽으로
      .attr("y", (d) => yScale(d[0])! + yScale.bandwidth() / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("fill", "white")
      .attr("opacity", 0)
      .style("text-shadow", "0 1px 2px rgba(0,0,0,0.5)")
      .text((d, i) => i + 1)
      .transition()
      .duration(500)
      .delay((d, i) => i * 100 + 1300)
      .attr("opacity", 1);
  }, [data, dimensions, isDarkMode]);

  const totalEvents = Object.values(data).flat().length;
  const uniqueEventNames = new Set(
    Object.values(data)
      .flat()
      .map((d) => d.redcap_event_name)
  ).size;
  const eventsData = Object.values(data).flat();
  const frequencyData = d3.rollups(
    eventsData,
    (v) => v.length,
    (d) => d.redcap_event_name
  );
  const maxFrequency =
    frequencyData.length > 0 ? d3.max(frequencyData, (d) => d[1]) || 0 : 0;
  const avgFrequency =
    frequencyData.length > 0 ? d3.mean(frequencyData, (d) => d[1]) || 0 : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-blue-900 dark:to-indigo-900 rounded-2xl shadow-2xl border border-white/20 backdrop-blur-sm p-6 overflow-hidden"
    >
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-40 h-40 bg-gradient-to-tl from-pink-400/20 to-yellow-400/20 rounded-full blur-3xl"></div>

      {/* Header */}
      <div className="relative z-10 mb-6">
        <div className="text-center mb-4">
          <h3 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Event Frequency Analysis
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
            Diagnosis event occurrence patterns and distribution
          </p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap justify-center gap-4 text-sm">
          <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
            <span className="text-gray-600 dark:text-gray-400">
              Total Events:
            </span>
            <span className="ml-2 font-bold text-blue-600 dark:text-blue-400">
              {totalEvents}
            </span>
          </div>
          <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
            <span className="text-gray-600 dark:text-gray-400">
              Event Types:
            </span>
            <span className="ml-2 font-bold text-green-600 dark:text-green-400">
              {uniqueEventNames}
            </span>
          </div>
          <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
            <span className="text-gray-600 dark:text-gray-400">
              Max Frequency:
            </span>
            <span className="ml-2 font-bold text-purple-600 dark:text-purple-400">
              {maxFrequency}
            </span>
          </div>
          <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
            <span className="text-gray-600 dark:text-gray-400">
              Avg Frequency:
            </span>
            <span className="ml-2 font-bold text-orange-600 dark:text-orange-400">
              {avgFrequency.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Chart container */}
      <div className="relative bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl shadow-lg border border-white/30 p-4">
        <svg
          ref={svgRef}
          className="w-full h-auto drop-shadow-sm"
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          style={{ background: "transparent" }}
        />
      </div>

      {/* Custom Tooltip */}
      {hoveredBar && (
        <div
          className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{
            left: hoveredBar.x,
            top: hoveredBar.y - 10,
          }}
        >
          <div className="bg-gradient-to-r from-gray-900 to-blue-900 text-white px-4 py-3 rounded-lg shadow-xl border border-white/20 backdrop-blur-sm max-w-xs">
            <div className="text-sm font-semibold text-blue-200">
              {hoveredBar.eventName}
            </div>
            <div className="text-xs opacity-90 mt-1">
              Frequency: {hoveredBar.frequency} events
            </div>
            <div className="text-xs opacity-90">
              Percentage:{" "}
              {((hoveredBar.frequency / totalEvents) * 100).toFixed(1)}%
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap justify-center gap-6 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
          <span>Top 3 Events</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
          <span>Other Events</span>
        </div>
        <span>Hover bars for details • Events ranked by frequency</span>
      </div>
    </div>
  );
};

export default DiagnosisEventFrequencyChart;
