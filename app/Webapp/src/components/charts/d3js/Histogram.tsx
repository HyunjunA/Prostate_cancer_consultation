// import { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface HistogramProps {
//   data: number[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
//   bins?: number;
//   colorScheme?: string[];
// }

// const chartStyles = {
//   title: {
//     fontSize: "24px",
//     fontWeight: "bold",
//     fontFamily: "'Helvetica Neue', sans-serif",
//   },
//   axisLabel: {
//     fontSize: "16px",
//     fontFamily: "'Helvetica Neue', sans-serif",
//   },
//   axisText: {
//     fontSize: "14px",
//     fontFamily: "'Helvetica Neue', sans-serif",
//   },
//   tooltip: {
//     fontSize: "14px",
//     padding: "12px",
//     borderRadius: "8px",
//     border: "1px solid rgba(0,0,0,0.1)",
//     backgroundColor: "rgba(255,255,255,0.95)",
//     color: "#333",
//     boxShadow: "0 4px 6px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)",
//   },
//   value: {
//     fontSize: "16px",
//     fontWeight: "bold",
//   },
// };

// export const Histogram = ({
//   data,
//   width = 800,
//   height = 400,
//   title,
//   id,
//   bins = 30,
//   colorScheme = ["#4682B4", "#FF7F50", "#2E8B57", "#9370DB"],
// }: HistogramProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     const margin = { top: 40, right: 30, bottom: 50, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     d3.select(chartRef.current).selectAll("*").remove();

//     // Create gradient
//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet");

//     // Add gradient definition
//     const gradient = svg
//       .append("defs")
//       .append("linearGradient")
//       .attr("id", `bar-gradient-${id}`)
//       .attr("x1", "0%")
//       .attr("y1", "0%")
//       .attr("x2", "0%")
//       .attr("y2", "100%");

//     gradient
//       .append("stop")
//       .attr("offset", "0%")
//       .attr("stop-color", colorScheme[0]);

//     gradient
//       .append("stop")
//       .attr("offset", "100%")
//       .attr("stop-color", colorScheme[1]);

//     const g = svg
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     // Add subtle grid background
//     const gridOpacity = 0.1;
//     g.append("rect")
//       .attr("width", innerWidth)
//       .attr("height", innerHeight)
//       .attr("fill", "#f8f9fa")
//       .attr("rx", 8);

//     const histogram = d3
//       .histogram()
//       .domain([1, d3.max(data) as number])
//       .thresholds(bins);

//     const bins_data = histogram(data);

//     const x = d3
//       .scaleLinear()
//       .domain([1, d3.max(data) || 100])
//       .range([0, innerWidth]);

//     const y = d3
//       .scaleLinear()
//       .domain([0, d3.max(bins_data, (d) => d.length) || 0])
//       .range([innerHeight, 0]);

//     // Add grid lines
//     g.append("g")
//       .attr("class", "grid")
//       .attr("opacity", gridOpacity)
//       .call(
//         d3
//           .axisLeft(y)
//           .tickSize(-innerWidth)
//           .tickFormat(() => "")
//       );

//     g.append("g")
//       .attr("class", "grid")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .attr("opacity", gridOpacity)
//       .call(
//         d3
//           .axisBottom(x)
//           .tickSize(-innerHeight)
//           .tickFormat(() => "")
//       );

//     // Enhanced axes
//     const xAxis = g
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .call(
//         d3
//           .axisBottom(x)
//           .tickFormat((d) => `${d}`)
//           .tickPadding(8)
//       )
//       .style("font-size", chartStyles.axisText.fontSize)
//       .style("font-family", chartStyles.axisText.fontFamily);

//     xAxis
//       .append("text")
//       .attr("fill", "#666")
//       .attr("x", innerWidth / 2)
//       .attr("y", margin.bottom - 10)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .text("Age");

//     const yAxis = g
//       .append("g")
//       .call(d3.axisLeft(y).tickPadding(8))
//       .style("font-size", chartStyles.axisText.fontSize)
//       .style("font-family", chartStyles.axisText.fontFamily);

//     yAxis
//       .append("text")
//       .attr("fill", "#666")
//       .attr("transform", "rotate(-90)")
//       .attr("x", -innerHeight / 2)
//       .attr("y", -margin.left + 15)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .text("Frequency");

//     const tooltip = d3
//       .select("body")
//       .append("div")
//       .attr("class", "tooltip")
//       .style("position", "absolute")
//       .style("visibility", "hidden")
//       .style("background", chartStyles.tooltip.backgroundColor)
//       .style("padding", chartStyles.tooltip.padding)
//       .style("border", chartStyles.tooltip.border)
//       .style("border-radius", chartStyles.tooltip.borderRadius)
//       .style("box-shadow", chartStyles.tooltip.boxShadow)
//       .style("font-size", chartStyles.tooltip.fontSize)
//       .style("font-family", chartStyles.tooltip.fontFamily)
//       .style("color", chartStyles.tooltip.color)
//       .style("pointer-events", "none")
//       .style("z-index", "1000");

//     // Original animated bars
//     const initialY = innerHeight;
//     const barTransition = d3.transition().duration(1500).ease(d3.easeCubicOut);

//     const bars = g
//       .selectAll("rect")
//       .data(bins_data)
//       .enter()
//       .append("rect")
//       .attr("x", (d) => x(d.x0 || 1))
//       .attr("y", initialY)
//       .attr("width", (d) => Math.max(0, x(d.x1 || 0) - x(d.x0 || 1) - 1))
//       .attr("height", 0)
//       .attr("fill", `url(#bar-gradient-${id})`)
//       .attr("rx", 4)
//       .style("transition", "all 0.3s ease");

//     // Original bar animation
//     bars
//       .transition(barTransition)
//       .attr("y", (d) => y(d.length))
//       .attr("height", (d) => innerHeight - y(d.length));

//     // Original interactivity
//     bars
//       .on("mouseover", function (event, d) {
//         d3.select(this).transition().duration(300).attr("fill", colorScheme[2]);

//         tooltip.style("visibility", "visible").html(
//           `<div style="font-weight: bold; margin-bottom: 4px;">Age Percentage: ${Math.round(
//             d.x0 || 0
//           )}-${Math.round(d.x1 || 0)}</div>
//              <div>Count: <span style="color: ${colorScheme[2]}">${
//             d.length
//           }</span></div>`
//         );
//       })
//       .on("mousemove", function (event) {
//         tooltip
//           .style("top", event.pageY - 10 + "px")
//           .style("left", event.pageX + 10 + "px");
//       })
//       .on("mouseout", function () {
//         d3.select(this)
//           .transition()
//           .duration(300)
//           .attr("fill", `url(#bar-gradient-${id})`);
//         tooltip.style("visibility", "hidden");
//       });

//     // Enhanced title with animation
//     const titleElement = svg
//       .append("text")
//       .attr("class", "title")
//       .attr("x", width / 2)
//       .attr("y", margin.top / 2)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .style("font-family", chartStyles.title.fontFamily)
//       .style("opacity", 0)
//       .text(title);

//     titleElement
//       .transition()
//       .duration(1000)
//       .style("opacity", 1)
//       .style("text-shadow", "2px 2px 4px rgba(0,0,0,0.1)");

//     return () => {
//       tooltip.remove();
//     };
//   }, [data, width, height, title, bins, id, colorScheme]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//     </div>
//   );
// };

// export default Histogram;

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface HistogramProps {
  data: number[];
  width?: number;
  height?: number;
  title: string;
  id: string;
  bins?: number;
  colorScheme?: string[];
  isDarkMode?: boolean;
}

const chartStyles = {
  title: {
    fontSize: "24px",
    fontWeight: "bold",
    fontFamily: "'Helvetica Neue', sans-serif",
  },
  axisLabel: {
    fontSize: "16px",
    fontFamily: "'Helvetica Neue', sans-serif",
  },
  axisText: {
    fontSize: "14px",
    fontFamily: "'Helvetica Neue', sans-serif",
  },
  tooltip: {
    fontSize: "14px",
    padding: "12px",
    borderRadius: "8px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)",
  },
  value: {
    fontSize: "16px",
    fontWeight: "bold",
  },
};

export const Histogram = ({
  data,
  width = 800,
  height = 400,
  title,
  id,
  bins = 30,
  colorScheme = ["#60A5FA", "#3B82F6", "#1D4ED8", "#2563EB"],
  isDarkMode = false,
}: HistogramProps) => {
  const chartRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Theme-dependent colors
    const backgroundColor = isDarkMode ? "#1F2937" : "#F8FAFC";
    const textColor = isDarkMode ? "#E5E7EB" : "#1F2937"; // Changed from #FFFFFF to #E5E7EB for better visibility
    const secondaryTextColor = isDarkMode ? "#D1D5DB" : "#64748B"; // Changed from #FFFFFF to #D1D5DB
    const gridColor = isDarkMode ? "#374151" : "#E2E8F0";
    const tooltipBackgroundColor = isDarkMode
      ? "#374151"
      : "rgba(255,255,255,0.98)";
    const tooltipTextColor = isDarkMode ? "#E5E7EB" : "#1F2937";
    const tooltipBorderColor = isDarkMode ? "#4B5563" : "rgba(0,0,0,0.1)";

    const margin = { top: 40, right: 30, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    d3.select(chartRef.current).selectAll("*").remove();

    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    // Add gradient definition with improved colors
    const gradient = svg
      .append("defs")
      .append("linearGradient")
      .attr("id", `bar-gradient-${id}`)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", colorScheme[0])
      .attr("stop-opacity", isDarkMode ? 0.9 : 0.8);

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", colorScheme[1])
      .attr("stop-opacity", isDarkMode ? 0.7 : 0.6);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Enhanced background with rounded corners
    g.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", backgroundColor)
      .attr("rx", 12)
      .style("opacity", isDarkMode ? 0.4 : 0.6);

    const histogram = d3
      .histogram()
      .domain([d3.min(data) || 0, d3.max(data) as number])
      .thresholds(bins);

    const bins_data = histogram(data);

    const x = d3
      .scaleLinear()
      .domain([d3.min(data) || 0, d3.max(data) || 100])
      .range([0, innerWidth]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins_data, (d) => d.length) || 0])
      .range([innerHeight, 0])
      .nice();

    // Improved grid lines
    const gridOpacity = isDarkMode ? 0.15 : 0.1;
    g.append("g")
      .attr("class", "grid")
      .attr("opacity", gridOpacity)
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => "")
      )
      .style("stroke", gridColor);

    g.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${innerHeight})`)
      .attr("opacity", gridOpacity)
      .call(
        d3
          .axisBottom(x)
          .ticks(10)
          .tickSize(-innerHeight)
          .tickFormat(() => "")
      )
      .style("stroke", gridColor);

    // Enhanced axes with theme-aware colors
    // Create and style x-axis
    const xAxis = g
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(10).tickPadding(8))
      .style("font-size", chartStyles.axisText.fontSize)
      .style("font-family", chartStyles.axisText.fontFamily);

    // Style x-axis elements for dark mode
    xAxis.select(".domain").style("stroke", textColor); // Axis line
    xAxis.selectAll(".tick line").style("stroke", textColor); // Tick lines
    xAxis.selectAll(".tick text").style("fill", textColor); // Tick text

    // Add x-axis label with enhanced visibility
    const xAxisLabel = g
      .append("text")
      .attr("class", "x-axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + margin.bottom - 5) // Adjusted position
      .attr("text-anchor", "middle")
      .attr("fill", textColor) // Changed from hardcoded color to textColor
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("font-family", chartStyles.axisLabel.fontFamily)
      .style("font-weight", "bold")
      .text("Age");

    // Create and style y-axis
    const yAxis = g
      .append("g")
      .call(d3.axisLeft(y).ticks(5).tickPadding(8))
      .style("font-size", chartStyles.axisText.fontSize)
      .style("font-family", chartStyles.axisText.fontFamily);

    // Style y-axis elements for dark mode
    yAxis.select(".domain").style("stroke", textColor); // Axis line
    yAxis.selectAll(".tick line").style("stroke", textColor); // Tick lines
    yAxis.selectAll(".tick text").style("fill", textColor); // Tick text

    // Add y-axis label with enhanced visibility
    const yAxisLabel = g
      .append("text")
      .attr("class", "y-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -margin.left + 20) // Adjusted position
      .attr("text-anchor", "middle")
      .attr("fill", textColor) // Changed from hardcoded color to textColor
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("font-family", chartStyles.axisLabel.fontFamily)
      .style("font-weight", "bold")
      .text("Frequency");

    // Enhanced tooltip with theme awareness
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", tooltipBackgroundColor)
      .style("padding", chartStyles.tooltip.padding)
      .style("border", `1px solid ${tooltipBorderColor}`)
      .style("border-radius", chartStyles.tooltip.borderRadius)
      .style("box-shadow", chartStyles.tooltip.boxShadow)
      .style("font-size", chartStyles.tooltip.fontSize)
      .style("font-family", chartStyles.axisText.fontFamily)
      .style("color", tooltipTextColor)
      .style("pointer-events", "none")
      .style("z-index", "1000")
      .style("backdrop-filter", "blur(8px)");

    // Enhanced animated bars with improved visual design
    const bars = g
      .selectAll("rect.bar")
      .data(bins_data)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", (d) => x(d.x0 || 0))
      .attr("y", innerHeight)
      .attr("width", (d) => Math.max(0, x(d.x1 || 0) - x(d.x0 || 0) - 1))
      .attr("height", 0)
      .attr("fill", `url(#bar-gradient-${id})`)
      .attr("rx", 4)
      .style("transition", "all 0.3s ease")
      .style("filter", "drop-shadow(0 2px 3px rgba(0,0,0,0.1))");

    // Improved bar animation with sequential delay
    bars
      .transition()
      .duration(1000)
      .delay((_, i) => i * 20)
      .ease(d3.easeCubicOut)
      .attr("y", (d) => y(d.length))
      .attr("height", (d) => innerHeight - y(d.length));

    // Enhanced interactivity
    bars
      .on("mouseover", function (event, d) {
        d3.select(this)
          .transition()
          .duration(300)
          .attr("fill", colorScheme[2])
          .style("filter", "drop-shadow(0 4px 6px rgba(0,0,0,0.2))");

        tooltip.style("visibility", "visible").html(
          `<div style="font-weight: bold; margin-bottom: 4px; color: ${tooltipTextColor}">
              Age Percentage: ${Math.round(d.x0 || 0)}-${Math.round(d.x1 || 0)}
             </div>
             <div style="color: ${tooltipTextColor}">
              Count: <span style="color: ${colorScheme[2]}">${d.length}</span>
             </div>`
        );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("top", `${event.pageY - 10}px`)
          .style("left", `${event.pageX + 10}px`);
      })
      .on("mouseout", function () {
        d3.select(this)
          .transition()
          .duration(300)
          .attr("fill", `url(#bar-gradient-${id})`)
          .style("filter", "drop-shadow(0 2px 3px rgba(0,0,0,0.1))");
        tooltip.style("visibility", "hidden");
      });

    // Enhanced title with animation and theme-aware colors
    const titleElement = svg
      .append("text")
      .attr("class", "title")
      .attr("x", width / 2)
      .attr("y", margin.top / 2)
      .attr("text-anchor", "middle")
      .style("font-size", chartStyles.title.fontSize)
      .style("font-weight", chartStyles.title.fontWeight)
      .style("font-family", chartStyles.title.fontFamily)
      .style("fill", textColor)
      .style("opacity", 0)
      .text(title);

    titleElement.transition().duration(1000).style("opacity", 1);

    return () => {
      tooltip.remove();
    };
  }, [data, width, height, title, bins, id, colorScheme, isDarkMode]);

  return (
    <div className="w-full h-full">
      <svg ref={chartRef} id={id} className="w-full h-full" />
    </div>
  );
};

export default Histogram;
