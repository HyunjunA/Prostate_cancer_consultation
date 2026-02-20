import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface DiagnosisEvent {
  redcap_event_name: string;
  diagnosis_date: string;
  diagnosis_disease_class: number | null;
}

interface PatientData {
  [patientId: string]: DiagnosisEvent[];
}

interface TimelineChartProps {
  data: PatientData;
  isDarkMode?: boolean;
}

const TimelineChart: React.FC<TimelineChartProps> = ({
  data,
  isDarkMode = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredEvent, setHoveredEvent] = useState<any>(null);
  const [dimensions, setDimensions] = useState({ width: 1000, height: 600 });

  // Handle responsive dimensions
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const newWidth = Math.max(600, Math.min(containerWidth - 32, 1400));
        const patientCount = Object.keys(data).length;
        const newHeight = Math.max(400, 60 + patientCount * 40 + 160); // Dynamic height based on patient count
        setDimensions({ width: newWidth, height: newHeight });
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [data]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dimensions;
    const margin = { top: 60, right: 40, bottom: 80, left: 120 };

    // Color scheme based on dark mode
    const textColor = isDarkMode ? "#e2e8f0" : "#2d3748";
    const axisColor = isDarkMode ? "#94a3b8" : "#4a5568";

    const patients = Object.keys(data);
    const allEvents = patients.flatMap((patientId) =>
      data[patientId]
        .filter(
          (event) =>
            event.diagnosis_date &&
            !isNaN(new Date(event.diagnosis_date).getTime())
        )
        .map((event) => ({
          patientId,
          date: new Date(event.diagnosis_date),
          class:
            event.diagnosis_disease_class === null
              ? "Unknown"
              : String(event.diagnosis_disease_class),
          eventName: event.redcap_event_name,
        }))
    );

    if (allEvents.length === 0) return;

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(allEvents, (d) => d.date) as [Date, Date])
      .range([margin.left, width - margin.right]);

    const yScale = d3
      .scaleBand()
      .domain(patients)
      .range([margin.top, height - margin.bottom])
      .padding(0.2); // Reduced padding for better space utilization

    // Enhanced color scale with better colors
    const colorScale = d3
      .scaleOrdinal()
      .domain([...new Set(allEvents.map((d) => d.class))])
      .range([
        "#667eea",
        "#764ba2",
        "#f093fb",
        "#f5576c",
        "#4facfe",
        "#00f2fe",
        "#43e97b",
        "#38f9d7",
        "#ffecd2",
        "#fcb69f",
        "#a8edea",
        "#fed6e3",
        "#c3cfe2",
        "#c3cfe2", // Additional colors for Unknown
      ]);

    // Create gradients and patterns
    const defs = svg.append("defs");

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
      .attr("stop-color", "rgba(102, 126, 234, 0.05)");

    bgGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "rgba(118, 75, 162, 0.05)");

    // Grid pattern
    const gridPattern = defs
      .append("pattern")
      .attr("id", "gridPattern")
      .attr("width", 40)
      .attr("height", 40)
      .attr("patternUnits", "userSpaceOnUse");

    gridPattern
      .append("path")
      .attr("d", "M 40 0 L 0 0 0 40")
      .attr("fill", "none")
      .attr("stroke", "rgba(102, 126, 234, 0.1)")
      .attr("stroke-width", 1);

    // Background
    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#bgGradient)");

    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#gridPattern)")
      .attr("opacity", 0.3);

    // Patient lane backgrounds
    patients.forEach((patientId, i) => {
      svg
        .append("rect")
        .attr("x", margin.left)
        .attr("y", yScale(patientId) || 0)
        .attr("width", width - margin.left - margin.right)
        .attr("height", yScale.bandwidth())
        .attr(
          "fill",
          i % 2 === 0 ? "rgba(255,255,255,0.3)" : "rgba(102,126,234,0.1)"
        )
        .attr("rx", 8);
    });

    // Timeline lines for each patient
    patients.forEach((patientId) => {
      const patientEvents = allEvents.filter((e) => e.patientId === patientId);
      if (patientEvents.length > 1) {
        const line = d3
          .line<any>()
          .x((d) => xScale(d.date))
          .y((d) => (yScale(d.patientId) || 0) + yScale.bandwidth() / 2)
          .curve(d3.curveCardinal);

        svg
          .append("path")
          .datum(
            patientEvents.sort((a, b) => a.date.getTime() - b.date.getTime())
          )
          .attr("fill", "none")
          .attr("stroke", "rgba(102, 126, 234, 0.4)")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "5,5")
          .attr("d", line);
      }
    });

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
      .style("stroke-dasharray", "2,2")
      .style("opacity", 0.2);

    // Event circles with enhanced styling
    const circles = svg
      .selectAll(".event-circle")
      .data(allEvents)
      .enter()
      .append("g")
      .attr("class", "event-circle");

    // Shadow circles
    circles
      .append("circle")
      .attr("cx", (d) => xScale(d.date))
      .attr("cy", (d) => (yScale(d.patientId) ?? 0) + yScale.bandwidth() / 2)
      .attr("r", 0)
      .attr("fill", "rgba(0,0,0,0.2)")
      .attr("transform", "translate(2,2)")
      .transition()
      .duration(800)
      .delay((d, i) => i * 50)
      .attr("r", 10);

    // Main circles
    circles
      .append("circle")
      .attr("cx", (d) => xScale(d.date))
      .attr("cy", (d) => (yScale(d.patientId) ?? 0) + yScale.bandwidth() / 2)
      .attr("r", 0)
      .attr("fill", (d) => colorScale(d.class))
      .attr("stroke", "white")
      .attr("stroke-width", 3)
      .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.1))")
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("r", 14)
          .attr("stroke-width", 4)
          .style("filter", "drop-shadow(0 8px 16px rgba(0,0,0,0.2))");

        setHoveredEvent({
          ...d,
          x: event.pageX,
          y: event.pageY,
        });
      })
      .on("mouseout", function () {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("r", 10)
          .attr("stroke-width", 3)
          .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.1))");

        setHoveredEvent(null);
      })
      .on("mousemove", function (event) {
        if (hoveredEvent) {
          setHoveredEvent((prev) =>
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
      .duration(800)
      .delay((d, i) => i * 50)
      .attr("r", 10);

    // Inner glow circles
    circles
      .append("circle")
      .attr("cx", (d) => xScale(d.date))
      .attr("cy", (d) => (yScale(d.patientId) ?? 0) + yScale.bandwidth() / 2)
      .attr("r", 0)
      .attr("fill", (d) => colorScale(d.class))
      .attr("opacity", 0.3)
      .transition()
      .duration(800)
      .delay((d, i) => i * 50)
      .attr("r", 6);

    // Axes with enhanced styling
    const xAxis = svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickFormat(d3.timeFormat("%b %Y"))
          .tickSizeOuter(0)
      );

    xAxis
      .selectAll("text")
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("fill", textColor)
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");

    const yAxis = svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).tickSizeOuter(0));

    yAxis
      .selectAll("text")
      .style("font-size", "12px")
      .style("font-weight", "600")
      .style("fill", textColor);

    // Axis lines
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
      .text("Timeline");

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 20)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "600")
      .attr("fill", textColor)
      .text("Patients");
  }, [data, dimensions, isDarkMode]);

  const totalPatients = Object.keys(data).length;
  const totalEvents = Object.values(data).flatMap((events) => events).length;
  const dateRange = Object.values(data).flatMap((events) =>
    events.map((e) => new Date(e.diagnosis_date))
  );
  const minDate =
    dateRange.length > 0
      ? new Date(Math.min(...dateRange.map((d) => d.getTime())))
      : null;
  const maxDate =
    dateRange.length > 0
      ? new Date(Math.max(...dateRange.map((d) => d.getTime())))
      : null;

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
        <div className="text-center mb-6">
          <h3 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
            {/* Patient Diagnosis Timeline */}
          </h3>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap justify-center gap-4 text-sm">
          <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
            <span className="text-gray-600 dark:text-gray-400">
              Total Patients:
            </span>
            <span className="ml-2 font-bold text-blue-600 dark:text-blue-400">
              {totalPatients}
            </span>
          </div>
          <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
            <span className="text-gray-600 dark:text-gray-400">
              Total Events:
            </span>
            <span className="ml-2 font-bold text-green-600 dark:text-green-400">
              {totalEvents}
            </span>
          </div>
          {minDate && maxDate && (
            <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
              <span className="text-gray-600 dark:text-gray-400">
                Date Range:
              </span>
              <span className="ml-2 font-bold text-purple-600 dark:text-purple-400">
                {minDate.toLocaleDateString()} - {maxDate.toLocaleDateString()}
              </span>
            </div>
          )}
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
      {hoveredEvent && (
        <div
          className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{
            left: hoveredEvent.x,
            top: hoveredEvent.y - 10,
          }}
        >
          <div className="bg-gradient-to-r from-gray-900 to-blue-900 text-white px-4 py-3 rounded-lg shadow-xl border border-white/20 backdrop-blur-sm max-w-xs">
            <div className="text-sm font-semibold text-blue-200">
              Patient {hoveredEvent.patientId}
            </div>
            <div className="text-xs opacity-90 mt-1">
              Event: {hoveredEvent.eventName}
            </div>
            <div className="text-xs opacity-90">
              Date: {hoveredEvent.date.toLocaleDateString()}
            </div>
            <div className="text-xs opacity-90">
              Class: {hoveredEvent.class}
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center"></div>
    </div>
  );
};

export default TimelineChart;
