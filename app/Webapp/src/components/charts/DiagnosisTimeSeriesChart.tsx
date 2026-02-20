import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Activity, Calendar, BarChart3 } from "lucide-react";

interface DiagnosisEvent {
  diagnosis_date: string;
  diagnosis_disease_class: number;
}

interface PatientData {
  [patientId: string]: DiagnosisEvent[];
}

interface DiagnosisTimeSeriesChartProps {
  data: PatientData;
  isDarkMode: boolean;
}

const DiagnosisTimeSeriesChart: React.FC<DiagnosisTimeSeriesChartProps> = ({
  data,
  isDarkMode,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(450);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, peak: 0, avgPerMonth: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newWidth = Math.max(400, rect.width - 32); // Account for padding
        const newHeight = Math.max(300, Math.min(500, newWidth * 0.6)); // Responsive height

        setContainerWidth(newWidth);
        setContainerHeight(newHeight);
      }
    };

    // Use ResizeObserver for better performance
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Initial size calculation
    updateDimensions();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    setIsLoading(true);
    setTimeout(() => {
      drawChart();
      setIsLoading(false);
    }, 500);
  }, [data, containerWidth, containerHeight, isDarkMode]);

  const drawChart = () => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const diagnosisData = Object.values(data).flat();
    if (diagnosisData.length === 0) return;

    const parsedData = diagnosisData.map((d) => ({
      date: new Date(d.diagnosis_date),
      class: d.diagnosis_disease_class,
    }));

    const timeData = d3
      .rollups(
        parsedData,
        (v) => v.length,
        (d) => d3.timeMonth(d.date)
      )
      .sort((a, b) => d3.ascending(a[0], b[0]));

    if (timeData.length === 0) return;

    // Calculate stats
    const total = diagnosisData.length;
    const peak = d3.max(timeData, (d) => d[1]) || 0;
    const avgPerMonth = Math.round((total / timeData.length || 0) * 10) / 10;
    setStats({ total, peak, avgPerMonth });

    // Responsive sizing
    const width = containerWidth;
    const height = containerHeight;
    const margin = {
      top: Math.max(40, height * 0.1),
      right: Math.max(30, width * 0.05),
      bottom: Math.max(60, height * 0.15),
      left: Math.max(50, width * 0.08),
    };

    // Responsive font and element sizes
    const baseFontSize = Math.max(10, Math.min(14, width / 60));
    const dotRadius = Math.max(4, Math.min(8, width / 120));
    const lineWidth = Math.max(2, Math.min(4, width / 200));

    // Enhanced gradients and effects
    const defs = svg.append("defs");

    // Multiple gradient options
    const lineGradient = defs
      .append("linearGradient")
      .attr("id", "lineGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0)
      .attr("y1", height)
      .attr("x2", 0)
      .attr("y2", 0);

    lineGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", isDarkMode ? "#3B82F6" : "#1E40AF")
      .attr("stop-opacity", 0.8);

    lineGradient
      .append("stop")
      .attr("offset", "50%")
      .attr("stop-color", isDarkMode ? "#8B5CF6" : "#7C3AED")
      .attr("stop-opacity", 0.9);

    lineGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", isDarkMode ? "#EC4899" : "#BE185D")
      .attr("stop-opacity", 1);

    // Area gradient
    const areaGradient = defs
      .append("linearGradient")
      .attr("id", "areaGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0)
      .attr("y1", height)
      .attr("x2", 0)
      .attr("y2", 0);

    areaGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", isDarkMode ? "#3B82F6" : "#60A5FA")
      .attr("stop-opacity", 0.1);

    areaGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", isDarkMode ? "#8B5CF6" : "#A78BFA")
      .attr("stop-opacity", 0.3);

    // Glow effect
    const filter = defs.append("filter").attr("id", "glow");
    filter
      .append("feGaussianBlur")
      .attr("stdDeviation", "4")
      .attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Scales with proper domain
    const dateExtent = d3.extent(timeData, (d) => d[0]) as [Date, Date];

    const xScale = d3
      .scaleTime()
      .domain(dateExtent)
      .range([margin.left, width - margin.right]);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(timeData, (d) => d[1]) as number])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Line and area generators
    const line = d3
      .line<[Date, number]>()
      .x((d) => xScale(d[0]))
      .y((d) => yScale(d[1]))
      .curve(d3.curveCatmullRom.alpha(0.5));

    const area = d3
      .area<[Date, number]>()
      .x((d) => xScale(d[0]))
      .y0(height - margin.bottom)
      .y1((d) => yScale(d[1]))
      .curve(d3.curveCatmullRom.alpha(0.5));

    // Date formatting for grid
    const monthsDiff = d3.timeMonth.count(dateExtent[0], dateExtent[1]);
    let tickInterval;

    if (monthsDiff <= 6) {
      tickInterval = d3.timeMonth.every(2);
    } else if (monthsDiff <= 12) {
      tickInterval = d3.timeMonth.every(3);
    } else if (monthsDiff <= 24) {
      tickInterval = d3.timeMonth.every(4);
    } else {
      tickInterval = d3.timeMonth.every(6);
    }

    // Year-only formatting for x-axis
    const xAxisYear = d3
      .axisBottom(xScale)
      .ticks(d3.timeYear.every(1))
      .tickFormat(d3.timeFormat("%Y"));

    const xAxisGrid = d3
      .axisBottom(xScale)
      .ticks(tickInterval)
      .tickFormat("")
      .tickSize(-height + margin.top + margin.bottom);

    const yAxisGrid = d3
      .axisLeft(yScale)
      .ticks(6)
      .tickFormat("")
      .tickSize(-width + margin.left + margin.right);

    const yAxis = d3.axisLeft(yScale).ticks(6);

    // Add grid first (no text labels)
    const gridX = svg
      .append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(xAxisGrid);

    gridX
      .selectAll("line")
      .attr("stroke", isDarkMode ? "#374151" : "#E5E7EB")
      .attr("stroke-width", 1)
      .attr("opacity", 0)
      .transition()
      .delay(300)
      .duration(800)
      .attr("opacity", 0.4);

    // Remove any text from grid
    gridX.selectAll("text").remove();

    const gridY = svg
      .append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(yAxisGrid);

    gridY
      .selectAll("line")
      .attr("stroke", isDarkMode ? "#374151" : "#E5E7EB")
      .attr("stroke-width", 1)
      .attr("opacity", 0)
      .transition()
      .delay(300)
      .duration(800)
      .attr("opacity", 0.4);

    // Remove any text from grid
    gridY.selectAll("text").remove();

    // Area with entrance animation
    svg
      .append("path")
      .datum(timeData)
      .attr("fill", "url(#areaGradient)")
      .attr("d", area)
      .style("opacity", 0)
      .transition()
      .delay(600)
      .duration(1200)
      .style("opacity", 1);

    // Main line with drawing animation
    const linePath = svg
      .append("path")
      .datum(timeData)
      .attr("fill", "none")
      .attr("stroke", "url(#lineGradient)")
      .attr("stroke-width", lineWidth)
      .attr("stroke-linecap", "round")
      .attr("d", line)
      .style("filter", "url(#glow)");

    const totalLength = linePath.node()?.getTotalLength() || 0;
    linePath
      .attr("stroke-dasharray", totalLength + " " + totalLength)
      .attr("stroke-dashoffset", totalLength)
      .transition()
      .delay(800)
      .duration(2000)
      .ease(d3.easeLinear)
      .attr("stroke-dashoffset", 0);

    // Enhanced interactive data points
    const tooltip = d3.select(tooltipRef.current);

    svg
      .selectAll(".dot")
      .data(timeData)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", (d) => xScale(d[0]))
      .attr("cy", (d) => yScale(d[1]))
      .attr("r", 0)
      .attr("fill", isDarkMode ? "#60A5FA" : "#3B82F6")
      .attr("stroke", isDarkMode ? "#1E293B" : "#FFFFFF")
      .attr("stroke-width", 3)
      .style("filter", "drop-shadow(0px 4px 8px rgba(0,0,0,0.2))")
      .style("cursor", "pointer")
      .transition()
      .delay((d, i) => 2500 + i * 100)
      .duration(600)
      .ease(d3.easeElastic)
      .attr("r", dotRadius)
      .on("end", function () {
        d3.select(this)
          .on("mouseover", function (event, d) {
            d3.select(this)
              .transition()
              .duration(200)
              .attr("r", dotRadius * 1.7)
              .attr("stroke-width", 4)
              .style("filter", "drop-shadow(0px 6px 12px rgba(0,0,0,0.3))");

            tooltip
              .style("opacity", 1)
              .style("left", event.pageX + 15 + "px")
              .style("top", event.pageY - 15 + "px").html(`
                <div class="text-sm font-semibold mb-1">${d3.timeFormat(
                  "%B %Y"
                )(d[0])}</div>
                <div class="text-xs text-gray-500 mb-2">${d3.timeFormat(
                  "%Y-%m-%d"
                )(d[0])}</div>
                <div class="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  ${d[1]} diagnoses
                </div>
                <div class="text-xs text-gray-500 mt-1">Click for details</div>
              `);
          })
          .on("mouseout", function () {
            d3.select(this)
              .transition()
              .duration(200)
              .attr("r", dotRadius)
              .attr("stroke-width", 3)
              .style("filter", "drop-shadow(0px 4px 8px rgba(0,0,0,0.2))");

            tooltip.style("opacity", 0);
          })
          .on("click", function (event, d) {
            // Ripple effect on click
            svg
              .append("circle")
              .attr("cx", xScale(d[0]))
              .attr("cy", yScale(d[1]))
              .attr("r", dotRadius)
              .attr("fill", "none")
              .attr("stroke", isDarkMode ? "#60A5FA" : "#3B82F6")
              .attr("stroke-width", 2)
              .attr("opacity", 0.8)
              .transition()
              .duration(800)
              .attr("r", dotRadius * 4)
              .attr("opacity", 0)
              .remove();
          });
      });

    // Add x-axis with years only
    const xAxisGroup = svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(xAxisYear);

    // Style year text
    xAxisGroup
      .selectAll("text")
      .attr("class", isDarkMode ? "fill-gray-200" : "fill-gray-700")
      .style("font-size", `${baseFontSize + 2}px`)
      .style("font-weight", "600")
      .style("text-anchor", "middle");

    // Add y-axis
    const yAxisGroup = svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(yAxis);

    yAxisGroup
      .selectAll("text")
      .attr("class", isDarkMode ? "fill-gray-200" : "fill-gray-700")
      .style("font-size", `${baseFontSize}px`)
      .style("font-weight", "600");

    // Clean axis styling
    svg
      .selectAll(".domain")
      .attr("stroke", isDarkMode ? "#4B5563" : "#9CA3AF")
      .attr("stroke-width", 2);

    svg
      .selectAll(".tick line")
      .attr("stroke", isDarkMode ? "#4B5563" : "#9CA3AF");

    // Enhanced axis labels
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height - 10)
      .attr("text-anchor", "middle")
      .attr("class", isDarkMode ? "fill-gray-400" : "fill-gray-500")
      .style("font-size", `${baseFontSize + 1}px`)
      .style("font-weight", "600")
      .text("Timeline");

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", 25)
      .attr("text-anchor", "middle")
      .attr("class", isDarkMode ? "fill-gray-400" : "fill-gray-500")
      .style("font-size", `${baseFontSize + 1}px`)
      .style("font-weight", "600")
      .text("Diagnoses Count");
  };

  return (
    <div
      className={`relative p-6 rounded-2xl transition-all duration-700 ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 border border-gray-700/50"
          : "bg-gradient-to-br from-white via-blue-50/20 to-white border border-gray-200/50 shadow-2xl"
      }`}
    >
      {/* Stats Section */}
      <div className="mb-6">
        {/* Enhanced Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div
            className={`group relative overflow-hidden p-5 rounded-xl transition-all duration-500 hover:scale-105 hover:-translate-y-1 ${
              isDarkMode
                ? "bg-gradient-to-br from-gray-800/60 to-gray-800/30 border border-gray-700/50"
                : "bg-gradient-to-br from-white/80 to-gray-50/80 border border-gray-200/50 shadow-lg"
            }`}
          >
            <div className="flex items-center gap-3 relative z-10">
              <div
                className={`p-2 rounded-lg ${
                  isDarkMode ? "bg-emerald-500/20" : "bg-emerald-100"
                }`}
              >
                <Activity
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-emerald-400" : "text-emerald-600"
                  }`}
                />
              </div>
              <div>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  Total Diagnoses
                </p>
                <p
                  className={`text-2xl font-bold ${
                    isDarkMode ? "text-gray-100" : "text-gray-900"
                  }`}
                >
                  {stats.total.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </div>

          <div
            className={`group relative overflow-hidden p-5 rounded-xl transition-all duration-500 hover:scale-105 hover:-translate-y-1 ${
              isDarkMode
                ? "bg-gradient-to-br from-gray-800/60 to-gray-800/30 border border-gray-700/50"
                : "bg-gradient-to-br from-white/80 to-gray-50/80 border border-gray-200/50 shadow-lg"
            }`}
          >
            <div className="flex items-center gap-3 relative z-10">
              <div
                className={`p-2 rounded-lg ${
                  isDarkMode ? "bg-orange-500/20" : "bg-orange-100"
                }`}
              >
                <BarChart3
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-orange-400" : "text-orange-600"
                  }`}
                />
              </div>
              <div>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  Peak Month
                </p>
                <p
                  className={`text-2xl font-bold ${
                    isDarkMode ? "text-gray-100" : "text-gray-900"
                  }`}
                >
                  {stats.peak}
                </p>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </div>

          <div
            className={`group relative overflow-hidden p-5 rounded-xl transition-all duration-500 hover:scale-105 hover:-translate-y-1 ${
              isDarkMode
                ? "bg-gradient-to-br from-gray-800/60 to-gray-800/30 border border-gray-700/50"
                : "bg-gradient-to-br from-white/80 to-gray-50/80 border border-gray-200/50 shadow-lg"
            }`}
          >
            <div className="flex items-center gap-3 relative z-10">
              <div
                className={`p-2 rounded-lg ${
                  isDarkMode ? "bg-purple-500/20" : "bg-purple-100"
                }`}
              >
                <Calendar
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-purple-400" : "text-purple-600"
                  }`}
                />
              </div>
              <div>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  Monthly Average
                </p>
                <p
                  className={`text-2xl font-bold ${
                    isDarkMode ? "text-gray-100" : "text-gray-900"
                  }`}
                >
                  {stats.avgPerMonth}
                </p>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </div>
        </div>
      </div>

      {/* Enhanced Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-sm rounded-2xl z-20">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div
                className={`w-12 h-12 border-4 border-t-transparent rounded-full animate-spin ${
                  isDarkMode ? "border-blue-400" : "border-blue-600"
                }`}
              />
              <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-purple-500 rounded-full animate-spin animation-delay-150" />
            </div>
            <div className="text-center">
              <p
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-gray-200" : "text-gray-800"
                }`}
              >
                Analyzing Data
              </p>
              <p
                className={`text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Generating insights...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chart Container */}
      <div
        ref={containerRef}
        className={`relative rounded-xl p-4 transition-all duration-500 ${
          isDarkMode
            ? "bg-gray-800/20 border border-gray-700/30"
            : "bg-white/40 border border-gray-200/30 shadow-inner"
        }`}
      >
        <svg
          ref={svgRef}
          width="100%"
          height={containerHeight}
          viewBox={`0 0 ${containerWidth} ${containerHeight}`}
          className="overflow-visible"
          style={{ maxWidth: "100%", height: "auto" }}
        />
      </div>

      {/* Enhanced Tooltip */}
      <div
        ref={tooltipRef}
        className={`absolute pointer-events-none opacity-0 transition-all duration-300 z-30 px-4 py-3 rounded-xl backdrop-blur-md ${
          isDarkMode
            ? "bg-gray-800/95 border border-gray-700/50 text-gray-100 shadow-2xl"
            : "bg-white/95 border border-gray-200/50 text-gray-900 shadow-2xl"
        }`}
        style={{
          transform: "translateY(-10px)",
        }}
      />

      {/* Interactive Footer */}
      <div
        className={`mt-4 pt-4 border-t ${
          isDarkMode ? "border-gray-700/30" : "border-gray-200/30"
        }`}
      >
        <div className="flex items-center justify-between">
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Hover for details • Click points for insights • Responsive design
          </p>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full animate-pulse ${
                isDarkMode ? "bg-green-400" : "bg-green-500"
              }`}
            />
            <span
              className={`text-xs ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Real-time
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiagnosisTimeSeriesChart;
