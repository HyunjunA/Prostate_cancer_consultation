import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface ChartData {
  category: string;
  count: number;
  percentage: number;
}

interface RadialBarChartProps {
  data: ChartData[];
  width?: number;
  height?: number;
  title: string;
  id: string;
  isDarkMode?: boolean;
}

const chartStyles = {
  title: {
    fontSize: "20px",
    fontWeight: "bold",
  },
  axisLabel: {
    fontSize: "18px",
  },
  axisText: {
    fontSize: "14px",
  },
  legend: {
    fontSize: "16px",
  },
  value: {
    fontSize: "16px",
  },
};

export const RadialBarChart = ({
  data,
  width = 700,
  height = 700,
  title,
  id,
  isDarkMode = false,
}: RadialBarChartProps) => {
  const chartRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Modern theme colors
    const primaryColor = isDarkMode ? "#6366F1" : "#3B82F6";
    const secondaryColor = isDarkMode ? "#8B5CF6" : "#60A5FA";
    const textColor = isDarkMode ? "#E5E7EB" : "#374151";
    const axisColor = isDarkMode ? "#4B5563" : "#D1D5DB";

    // Chart dimensions and radial settings
    const margin = { top: 80, right: 80, bottom: 80, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const innerRadius = 90;
    const outerRadius = Math.min(innerWidth, innerHeight) / 2 - 20;

    // Clear previous content
    d3.select(chartRef.current).selectAll("*").remove();

    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("class", "w-full h-full");

    // Create defs for gradients
    const defs = svg.append("defs");

    // Modern radial gradient for bars
    const barGradient = defs
      .append("linearGradient")
      .attr("id", `radial-bar-gradient-${id}`)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%");

    barGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", primaryColor)
      .attr("stop-opacity", 0.8);

    barGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", secondaryColor)
      .attr("stop-opacity", 1);

    // Main chart group - center the radial chart
    const g = svg
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    // Scales setup
    const x = d3
      .scaleBand()
      .range([0, 2 * Math.PI])
      .align(0)
      .domain(data.map((d) => d.category));

    const maxValue = d3.max(data, (d) => d.count) || 0;
    const y = d3
      .scaleRadial()
      .range([innerRadius, outerRadius])
      .domain([0, maxValue]);

    // Container for hover labels
    const hoverContainer = g.append("g").attr("class", "hover-container");

    // Title
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .style("font-size", chartStyles.title.fontSize)
      .style("font-weight", "bold")
      .style("fill", textColor)
      .text(title);

    // Radial grid lines
    const yTicks = y.ticks(4).slice(1);
    g.selectAll(".grid-circle")
      .data(yTicks)
      .enter()
      .append("circle")
      .attr("class", "grid-circle")
      .attr("r", (d) => y(d))
      .style("fill", "none")
      .style("stroke", axisColor)
      .style("stroke-opacity", 0.15)
      .style("stroke-width", 1)
      .style("stroke-dasharray", "3,3");

    // Function to truncate text smartly
    const truncateText = (text: string, maxLength: number = 15) => {
      if (text.length <= maxLength) return text;

      const words = text.split(" ");
      let truncated = "";
      for (const word of words) {
        if ((truncated + word).length <= maxLength - 3) {
          truncated += (truncated ? " " : "") + word;
        } else {
          break;
        }
      }
      return truncated
        ? truncated + "..."
        : text.substring(0, maxLength - 3) + "...";
    };

    // Smart label positioning
    const labelRadius = outerRadius + 35;
    const labelData = data.map((d) => {
      const angle = (x(d.category) || 0) + x.bandwidth() / 2;

      return {
        ...d,
        angle: angle,
        x: Math.sin(angle) * labelRadius,
        y: -Math.cos(angle) * labelRadius,
        textAnchor:
          (angle + Math.PI) % (2 * Math.PI) < Math.PI ? "end" : "start",
        truncatedCategory: truncateText(d.category),
      };
    });

    // Draw radial bars
    const bars = g
      .selectAll(".bar")
      .data(data)
      .enter()
      .append("path")
      .attr("class", "bar")
      .attr("fill", `url(#radial-bar-gradient-${id})`)
      .style("opacity", 0.85)
      .style("cursor", "default")
      .attr("transform", "scale(0)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius)
          .outerRadius((d) => y(d.count))
          .startAngle((d) => x(d.category) || 0)
          .endAngle((d) => (x(d.category) || 0) + x.bandwidth())
          .padAngle(0.01)
          .padRadius(innerRadius)
      );

    // Animation
    bars
      .transition()
      .duration(800)
      .delay((_, i) => i * 40)
      .ease(d3.easeBackOut.overshoot(0.3))
      .attr("transform", "scale(1)");

    // Add category labels
    const labels = g
      .selectAll(".label-group")
      .data(labelData)
      .enter()
      .append("g")
      .attr("class", "label-group")
      .style("cursor", "pointer");

    // Label text
    labels
      .append("text")
      .attr("class", "category-label")
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y)
      .attr("text-anchor", (d) => d.textAnchor)
      .attr("alignment-baseline", "middle")
      .style("font-size", "13px")
      .style("fill", textColor)
      .style("font-weight", "500")
      .text((d) => d.truncatedCategory);

    // Label hover effects
    labels
      .on("mouseover", function (event, d) {
        // Highlight corresponding bar
        bars
          .filter((barData) => barData.category === d.category)
          .transition()
          .duration(200)
          .style("opacity", 1)
          .attr("stroke", primaryColor)
          .attr("stroke-width", 3);

        // Update center display with hovered item info
        centerGroup.selectAll("text").remove();

        // Category name (with smart text wrapping for long names)
        const categoryName = d.category;
        if (categoryName.length > 25) {
          // Split long names into two lines
          const words = categoryName.split(" ");
          const midPoint = Math.ceil(words.length / 2);
          const firstLine = words.slice(0, midPoint).join(" ");
          const secondLine = words.slice(midPoint).join(" ");

          centerGroup
            .append("text")
            .attr("text-anchor", "middle")
            .attr("y", -20)
            .style("font-size", "14px")
            .style("font-weight", "600")
            .style("fill", textColor)
            .text(firstLine);

          centerGroup
            .append("text")
            .attr("text-anchor", "middle")
            .attr("y", -5)
            .style("font-size", "14px")
            .style("font-weight", "600")
            .style("fill", textColor)
            .text(secondLine);
        } else {
          centerGroup
            .append("text")
            .attr("text-anchor", "middle")
            .attr("y", -15)
            .style("font-size", "16px")
            .style("font-weight", "600")
            .style("fill", textColor)
            .text(categoryName);
        }

        // Count
        centerGroup
          .append("text")
          .attr("text-anchor", "middle")
          .attr("y", 15)
          .style("font-size", "24px")
          .style("font-weight", "bold")
          .style("fill", primaryColor)
          .text(d.count.toLocaleString());

        // Percentage
        centerGroup
          .append("text")
          .attr("text-anchor", "middle")
          .attr("y", 35)
          .style("font-size", "14px")
          .style("font-weight", "600")
          .style("fill", secondaryColor)
          .text(`${d.percentage.toFixed(1)}%`);
      })
      .on("mouseout", function (event, d) {
        // Remove bar highlighting
        bars
          .filter((barData) => barData.category === d.category)
          .transition()
          .duration(200)
          .style("opacity", 0.85)
          .attr("stroke", "none");

        // Restore original center display
        centerGroup.selectAll("text").remove();

        centerGroup
          .append("text")
          .attr("text-anchor", "middle")
          .attr("y", -15)
          .style("font-size", "18px")
          .style("font-weight", "600")
          .style("fill", textColor)
          .text("Total");

        const totalCount = d3.sum(data, (d) => d.count);
        centerGroup
          .append("text")
          .attr("text-anchor", "middle")
          .attr("y", 10)
          .style("font-size", "24px")
          .style("font-weight", "bold")
          .style("fill", primaryColor)
          .text(totalCount.toLocaleString());

        // centerGroup
        //   .append("text")
        //   .attr("text-anchor", "middle")
        //   .attr("y", 30)
        //   .style("font-size", "12px")
        //   .style("font-weight", "400")
        //   .style("fill", textColor)
        //   .style("opacity", 0.7)
        //   .text("Repositories");
      });

    // Add center info
    const centerGroup = g.append("g").attr("class", "center-info");

    centerGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", -15)
      .style("font-size", "18px")
      .style("font-weight", "600")
      .style("fill", textColor)
      .text("Total");

    const totalCount = d3.sum(data, (d) => d.count);
    centerGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", 10)
      .style("font-size", "24px")
      .style("font-weight", "bold")
      .style("fill", primaryColor)
      .text(totalCount.toLocaleString());

    centerGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", 30)
      .style("font-size", "12px")
      .style("font-weight", "400")
      .style("fill", textColor)
      .style("opacity", 0.7)
      .text("Repositories");
  }, [data, width, height, title, id, isDarkMode]);

  return (
    <div className="w-full h-full">
      <svg ref={chartRef} id={id} className="w-full h-full" />
    </div>
  );
};

export default RadialBarChart;
