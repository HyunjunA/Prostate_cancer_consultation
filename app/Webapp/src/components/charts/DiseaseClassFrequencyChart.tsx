import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface DiagnosisEvent {
  diagnosis_disease_class: number | null;
}

interface PatientData {
  [patientId: string]: DiagnosisEvent[];
}

interface DiseaseClassFrequencyChartProps {
  data: PatientData;
  isDarkMode?: boolean;
}

const DiseaseClassFrequencyChart: React.FC<DiseaseClassFrequencyChartProps> = ({
  data,
  isDarkMode = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredBar, setHoveredBar] = useState<{
    class: string;
    frequency: number;
    x: number;
    y: number;
  } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  // Handle responsive dimensions
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const newWidth = Math.max(400, Math.min(containerWidth - 32, 1200));
        const newHeight = Math.max(300, newWidth * 0.5);
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
    const margin = { top: 60, right: 40, bottom: 80, left: 90 };

    // Color scheme based on dark mode
    const textColor = isDarkMode ? "#e2e8f0" : "#2d3748";
    const axisColor = isDarkMode ? "#94a3b8" : "#4a5568";
    const barLabelColor = isDarkMode ? "#1f2937" : "white";

    // Process data
    const allClasses = Object.values(data).flatMap((events) =>
      events.map((event) => event.diagnosis_disease_class)
    );

    const frequencyData = d3
      .rollups(
        allClasses,
        (v) => v.length,
        (d) => (d === null ? "Unknown" : String(d))
      )
      .sort((a, b) => d3.descending(a[1], b[1]));

    if (frequencyData.length === 0) return;

    // Scales
    const xScale = d3
      .scaleBand()
      .domain(frequencyData.map((d) => String(d[0])))
      .range([margin.left, width - margin.right])
      .padding(0.2);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(frequencyData, (d) => d[1]) as number])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Create gradients
    const defs = svg.append("defs");

    // Main gradient
    const gradient = defs
      .append("linearGradient")
      .attr("id", "barGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0)
      .attr("y1", height)
      .attr("x2", 0)
      .attr("y2", 0);

    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#667eea");

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#764ba2");

    // Hover gradient
    const hoverGradient = defs
      .append("linearGradient")
      .attr("id", "barHoverGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0)
      .attr("y1", height)
      .attr("x2", 0)
      .attr("y2", 0);

    hoverGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#f093fb");

    hoverGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#f5576c");

    // Background pattern
    const pattern = defs
      .append("pattern")
      .attr("id", "gridPattern")
      .attr("width", 20)
      .attr("height", 20)
      .attr("patternUnits", "userSpaceOnUse");

    pattern
      .append("path")
      .attr("d", "M 20 0 L 0 0 0 20")
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.1)")
      .attr("stroke-width", 0.5);

    // Background
    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#gridPattern)")
      .attr("opacity", 0.3);

    // Grid lines
    svg
      .append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickSize(-height + margin.top + margin.bottom)
          .tickFormat(() => "")
      )
      .style("stroke-dasharray", "3,3")
      .style("opacity", 0.3);

    svg
      .append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-width + margin.left + margin.right)
          .tickFormat(() => "")
      )
      .style("stroke-dasharray", "3,3")
      .style("opacity", 0.3);

    // Bars with animations
    const bars = svg
      .selectAll(".bar")
      .data(frequencyData)
      .enter()
      .append("g")
      .attr("class", "bar");

    bars
      .append("rect")
      .attr("x", (d) => xScale(String(d[0])) || 0)
      .attr("y", height - margin.bottom)
      .attr("width", xScale.bandwidth())
      .attr("height", 0)
      .attr("fill", "url(#barGradient)")
      .attr("rx", 8)
      .attr("ry", 8)
      .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.1))")
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("fill", "url(#barHoverGradient)")
          .style("filter", "drop-shadow(0 8px 16px rgba(0,0,0,0.2))")
          .attr("transform", "scale(1.05)");

        setHoveredBar({
          class: String(d[0]),
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
      .duration(1000)
      .delay((d, i) => i * 100)
      .attr("y", (d) => yScale(d[1]))
      .attr("height", (d) => height - margin.bottom - yScale(d[1]));

    // Value labels on bars
    bars
      .append("text")
      .attr("x", (d) => (xScale(String(d[0])) || 0) + xScale.bandwidth() / 2)
      .attr("y", height - margin.bottom)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .attr("fill", barLabelColor)
      .attr("opacity", 0)
      .text((d) => d[1])
      .transition()
      .duration(1000)
      .delay((d, i) => i * 100 + 500)
      .attr("y", (d) => yScale(d[1]) - 10)
      .attr("opacity", 1);

    // Axes with styling
    const xAxis = svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).tickSizeOuter(0));

    xAxis
      .selectAll("text")
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("fill", axisColor);

    const yAxis = svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale));

    yAxis
      .selectAll("text")
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("fill", axisColor);

    // Axis lines and ticks
    svg.selectAll(".domain").style("stroke", axisColor);
    svg.selectAll(".tick line").style("stroke", axisColor);

    // Labels
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height - 20)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "600")
      .attr("fill", textColor)
      .text("Disease Class");

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 20)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "600")
      .attr("fill", textColor)
      .text("Frequency");
  }, [data, dimensions, isDarkMode]);

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
        <div className="text-center">
          <h3 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
            {/* Disease Class Frequency Distribution */}
          </h3>
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
          <div className="bg-gradient-to-r from-gray-900 to-blue-900 text-white px-4 py-3 rounded-lg shadow-xl border border-white/20 backdrop-blur-sm">
            <div className="text-sm font-semibold">
              Disease Class {hoveredBar.class}
            </div>
            <div className="text-xs opacity-90">
              Frequency: {hoveredBar.frequency} cases
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}

      {/* Stats footer */}
      <div className="mt-4 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-4">
          <span>
            Total Classes:{" "}
            {Object.values(data).flatMap((events) =>
              events.map((e) => e.diagnosis_disease_class)
            ).length > 0
              ? new Set(
                  Object.values(data).flatMap((events) =>
                    events.map((e) =>
                      e.diagnosis_disease_class === null
                        ? "Unknown"
                        : String(e.diagnosis_disease_class)
                    )
                  )
                ).size
              : 0}
          </span>
          <span>
            Total Cases:{" "}
            {Object.values(data).flatMap((events) => events).length}
          </span>
        </div>
        <div className="text-right">
          {/* <span>Hover bars for details</span> */}
        </div>
      </div>
    </div>
  );
};

export default DiseaseClassFrequencyChart;
