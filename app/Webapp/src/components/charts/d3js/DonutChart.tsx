// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";
// import { useTheme } from "next-themes";

// const chartStyles = {
//   title: {
//     fontSize: "20px",
//     fontWeight: "bold",
//   },
//   label: {
//     fontSize: "18px",
//   },
//   tooltip: {
//     fontSize: "18px",
//     padding: "10px",
//     borderRadius: "5px",
//     border: "1px solid #ddd",
//   },
// };

// export const DonutChart = ({
//   data,
//   // title = "Donut Chart",
//   title = "",
//   id = "donut-chart",
//   width = 400,
//   height = 400,
// }: {
//   data: { category: string; count: number; percentage: number }[];
//   title?: string;
//   id?: string;
//   width?: number;
//   height?: number;
// }) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const { theme } = useTheme();

//   useEffect(() => {
//     if (!chartRef.current || !data.length) return;

//     const chartColors = theme === "dark" ? d3.schemeDark2 : d3.schemeCategory10;
//     const axisColor = theme === "dark" ? "#ffffff" : "#000000";

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 40, right: 30, bottom: 40, left: 30 };
//     const radius = Math.min(width, height) / 3;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .append("g")
//       .attr("transform", `translate(${width / 2}, ${height / 2})`);

//     const color = d3
//       .scaleOrdinal<string>()
//       .domain(data.map((d) => d.category))
//       .range(chartColors);

//     const arcGenerator = d3
//       .arc<
//         d3.PieArcDatum<{ category: string; count: number; percentage: number }>
//       >()
//       .innerRadius(radius * 0.5)
//       .outerRadius(radius * 0.8);

//     const arcHover = d3
//       .arc<
//         d3.PieArcDatum<{ category: string; count: number; percentage: number }>
//       >()
//       .innerRadius(radius * 0.45)
//       .outerRadius(radius * 0.85);

//     const pie = d3
//       .pie<{ category: string; count: number; percentage: number }>()
//       .sort(null)
//       .value((d) => d.count);

//     const tooltip = d3
//       .select("body")
//       .append("div")
//       .attr("class", "tooltip")
//       .style("position", "absolute")
//       .style("opacity", 0)
//       .style("font-size", chartStyles.tooltip.fontSize)
//       .style("padding", chartStyles.tooltip.padding)
//       .style("border-radius", chartStyles.tooltip.borderRadius)
//       .style("border", chartStyles.tooltip.border)
//       .style("pointer-events", "none")
//       .style("background-color", theme === "dark" ? "#1f2937" : "#ffffff")
//       .style("color", theme === "dark" ? "#ffffff" : "#000000")
//       .style("z-index", "9999") // 높은 z-index 추가
//       .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)") // 선택적: 시각적 구분을 위한 그림자 추가
//       .style("backdrop-filter", "blur(8px)"); // 선택적: 배경 블러 효과 추가

//     const total = d3.sum(data, (d) => d.count);

//     const arcs = svg
//       .selectAll<
//         SVGGElement,
//         d3.PieArcDatum<{ category: string; count: number; percentage: number }>
//       >(".arc")
//       .data(pie(data))
//       .enter()
//       .append("g")
//       .attr("class", "arc");

//     // Smooth entry animation
//     arcs
//       .append("path")
//       .attr("fill", (d) => color(d.data.category))
//       .attr("d", arcGenerator)
//       .transition()
//       .duration(1000)
//       .attrTween("d", function (d) {
//         const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
//         return function (t) {
//           return arcGenerator(interpolate(t))!;
//         };
//       });

//     arcs
//       .select("path")
//       .on("mouseover", function (event, d) {
//         const percentage = ((d.data.count / total) * 100).toFixed(1);

//         d3.select(this).transition().duration(200).attr("d", arcHover);

//         tooltip
//           .style("opacity", 1)
//           .html(
//             `<strong>${d.data.category}</strong><br/>
//              Count: ${d.data.count.toLocaleString()}<br/>
//              Percentage: ${percentage}%`
//           )
//           .style("left", `${event.pageX + 10}px`)
//           .style("top", `${event.pageY - 25}px`);
//       })
//       .on("mousemove", function (event) {
//         tooltip
//           .transition()
//           .duration(100)
//           .style("left", `${event.pageX + 10}px`)
//           .style("top", `${event.pageY - 25}px`);
//       })
//       .on("mouseout", function () {
//         d3.select(this).transition().duration(200).attr("d", arcGenerator);

//         tooltip.transition().duration(200).style("opacity", 0);
//       });

//     svg
//       .append("text")
//       .attr("x", 0)
//       .attr("y", -height / 2 + 20)
//       .attr("text-anchor", "middle")
//       .attr("fill", axisColor)
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .text(title);

//     // Cleanup tooltip on unmount
//     return () => {
//       tooltip.remove();
//     };
//   }, [data, theme, title, width, height]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//     </div>
//   );
// };

// export default DonutChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";
// import { useTheme } from "next-themes";

// const chartStyles = {
//   title: {
//     fontSize: "20px",
//     fontWeight: "bold",
//   },
//   label: {
//     fontSize: "18px",
//   },
//   tooltip: {
//     fontSize: "18px",
//     padding: "10px",
//     borderRadius: "5px",
//     border: "1px solid #ddd",
//   },
//   legend: {
//     fontSize: "14px",
//     itemSpacing: 40,
//     symbolSize: 15,
//     symbolPadding: 10,
//     percentageFontSize: "12px",
//   },
// };

// export const DonutChart = ({
//   data,
//   title = "",
//   id = "donut-chart",
//   width = 400,
//   height = 400,
// }: {
//   data: { category: string; count: number; percentage: number }[];
//   title?: string;
//   id?: string;
//   width?: number;
//   height?: number;
// }) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const { theme } = useTheme();

//   useEffect(() => {
//     if (!chartRef.current || !data.length) return;

//     // Theme-dependent colors
//     const chartColors =
//       theme === "dark" ? d3.schemePastel1 : d3.schemeCategory10;
//     const axisColor = theme === "dark" ? "#E5E7EB" : "#1F2937";
//     const backgroundColor = theme === "dark" ? "#1F2937" : "#FFFFFF";
//     const tooltipBackgroundColor = theme === "dark" ? "#374151" : "#FFFFFF";
//     const tooltipTextColor = theme === "dark" ? "#E5E7EB" : "#1F2937";
//     const tooltipBorderColor = theme === "dark" ? "#4B5563" : "#E5E7EB";
//     const legendSecondaryColor = theme === "dark" ? "#9CA3AF" : "#6B7280";
//     const strokeColor = theme === "dark" ? "#FFFFFF" : "#E5E7EB";

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 40, right: 180, bottom: 40, left: 40 };
//     const radius = Math.min(width - margin.left - margin.right, height) / 2.2;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet");

//     const g = svg
//       .append("g")
//       .attr(
//         "transform",
//         `translate(${(width - margin.right) / 2}, ${height / 2})`
//       );

//     const color = d3
//       .scaleOrdinal<string>()
//       .domain(data.map((d) => d.category))
//       .range(chartColors);

//     const arcGenerator = d3
//       .arc<
//         d3.PieArcDatum<{ category: string; count: number; percentage: number }>
//       >()
//       .innerRadius(radius * 0.6)
//       .outerRadius(radius * 0.9);

//     const arcHover = d3
//       .arc<
//         d3.PieArcDatum<{ category: string; count: number; percentage: number }>
//       >()
//       .innerRadius(radius * 0.6)
//       .outerRadius(radius * 0.95); // Slightly larger for hover effect

//     const pie = d3
//       .pie<{ category: string; count: number; percentage: number }>()
//       .sort(null)
//       .value((d) => d.count);

//     const tooltip = d3
//       .select("body")
//       .append("div")
//       .attr("class", "tooltip")
//       .style("position", "absolute")
//       .style("opacity", 0)
//       .style("font-size", chartStyles.tooltip.fontSize)
//       .style("padding", chartStyles.tooltip.padding)
//       .style("border-radius", chartStyles.tooltip.borderRadius)
//       .style("border", `1px solid ${tooltipBorderColor}`)
//       .style("pointer-events", "none")
//       .style("background-color", tooltipBackgroundColor)
//       .style("color", tooltipTextColor)
//       .style("z-index", "9999")
//       .style(
//         "box-shadow",
//         theme === "dark"
//           ? "0 2px 4px rgba(0,0,0,0.3)"
//           : "0 2px 4px rgba(0,0,0,0.1)"
//       )
//       .style("backdrop-filter", "blur(8px)");

//     const total = d3.sum(data, (d) => d.count);

//     const centerLabel = g
//       .append("text")
//       .attr("class", "center-label")
//       .attr("text-anchor", "middle")
//       .attr("dy", "0.35em")
//       .style("font-size", "28px")
//       .style("font-weight", "bold")
//       .style("fill", axisColor)
//       .style("opacity", 0);

//     const arcs = g
//       .selectAll<
//         SVGGElement,
//         d3.PieArcDatum<{ category: string; count: number; percentage: number }>
//       >(".arc")
//       .data(pie(data))
//       .enter()
//       .append("g")
//       .attr("class", "arc");

//     const legendGroup = svg
//       .append("g")
//       .attr("class", "legend")
//       .attr(
//         "transform",
//         `translate(${width - margin.right + 20}, ${
//           height / 2 - (data.length * chartStyles.legend.itemSpacing) / 2
//         })`
//       );

//     const legendItems = legendGroup
//       .selectAll(".legend-item")
//       .data(data)
//       .join("g")
//       .attr("class", "legend-item")
//       .attr(
//         "transform",
//         (d, i) => `translate(0, ${i * chartStyles.legend.itemSpacing})`
//       );

//     legendItems
//       .append("rect")
//       .attr("width", chartStyles.legend.symbolSize)
//       .attr("height", chartStyles.legend.symbolSize)
//       .attr("fill", (d) => color(d.category))
//       .style("stroke", strokeColor)
//       .style("stroke-width", "1px");

//     const percentages = data.map((d) => ({
//       ...d,
//       percentage: ((d.count / total) * 100).toFixed(1),
//     }));

//     legendItems
//       .append("text")
//       .attr(
//         "x",
//         chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
//       )
//       .attr("y", chartStyles.legend.symbolSize - 2)
//       .style("font-size", chartStyles.legend.fontSize)
//       .style("fill", axisColor)
//       .text((d) => d.category);

//     legendItems
//       .append("text")
//       .attr(
//         "x",
//         chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
//       )
//       .attr("y", chartStyles.legend.symbolSize + 12)
//       .style("font-size", chartStyles.legend.percentageFontSize)
//       .style("fill", legendSecondaryColor)
//       .text((d) => {
//         const percentage = percentages.find(
//           (p) => p.category === d.category
//         )?.percentage;
//         return `${percentage}%`;
//       });

//     arcs
//       .append("path")
//       .attr("fill", (d) => color(d.data.category))
//       .attr("d", arcGenerator)
//       .transition()
//       .duration(1000)
//       .attrTween("d", function (d) {
//         const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
//         return function (t) {
//           return arcGenerator(interpolate(t))!;
//         };
//       });

//     arcs
//       .select("path")
//       .on("mouseover", function (event, d) {
//         const percentage = ((d.data.count / total) * 100).toFixed(1);

//         d3.select(this).transition().duration(200).attr("d", arcHover);

//         tooltip
//           .style("opacity", 1)
//           .html(
//             `<strong style="color: ${tooltipTextColor}">${
//               d.data.category
//             }</strong><br/>
//              <span style="color: ${tooltipTextColor}">Count: ${d.data.count.toLocaleString()}<br/>
//              Percentage: ${percentage}%</span>`
//           )
//           .style("left", `${event.pageX + 10}px`)
//           .style("top", `${event.pageY - 25}px`);

//         centerLabel
//           .text(`${percentage}%`)
//           .transition()
//           .duration(200)
//           .style("opacity", 1);

//         legendGroup
//           .selectAll(".legend-item text")
//           .filter(function () {
//             const parentData = d3.select(this.parentNode).datum();
//             return parentData.category === d.data.category;
//           })
//           .style("font-weight", "bold");

//         legendGroup
//           .selectAll(".legend-item text")
//           .filter(function () {
//             const parentData = d3.select(this.parentNode).datum();
//             return parentData.category !== d.data.category;
//           })
//           .style("opacity", 0.5);
//       })
//       .on("mousemove", function (event) {
//         tooltip
//           .style("left", `${event.pageX + 10}px`)
//           .style("top", `${event.pageY - 25}px`);
//       })
//       .on("mouseout", function () {
//         d3.select(this).transition().duration(200).attr("d", arcGenerator);

//         tooltip.transition().duration(200).style("opacity", 0);

//         centerLabel.transition().duration(200).style("opacity", 0);

//         legendGroup
//           .selectAll(".legend-item text")
//           .style("font-weight", "normal")
//           .style("opacity", 1);
//       });

//     g.append("text")
//       .attr("x", 0)
//       .attr("y", -height / 2 + 20)
//       .attr("text-anchor", "middle")
//       .attr("fill", axisColor)
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .text(title);

//     return () => {
//       tooltip.remove();
//     };
//   }, [data, theme, title, width, height]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//     </div>
//   );
// };

// export default DonutChart;

import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

const chartStyles = {
  title: {
    fontSize: "20px",
    fontWeight: "bold",
  },
  label: {
    fontSize: "18px",
  },
  tooltip: {
    fontSize: "18px",
    padding: "10px",
    borderRadius: "5px",
    border: "1px solid #ddd",
  },
  legend: {
    fontSize: "14px",
    itemSpacing: 40,
    symbolSize: 15,
    symbolPadding: 10,
    percentageFontSize: "12px",
  },
};

export const DonutChart = ({
  data,
  title = "",
  id = "donut-chart",
  width = 400,
  height = 400,
  isDarkMode = false,
}: {
  data: { category: string; count: number; percentage: number }[];
  title?: string;
  id?: string;
  width?: number;
  height?: number;
  isDarkMode?: boolean;
}) => {
  const chartRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!chartRef.current || !data.length) return;

    // Theme-dependent colors
    const chartColors = isDarkMode ? d3.schemeCategory10 : d3.schemeCategory10;
    const axisColor = isDarkMode ? "#E5E7EB" : "#1F2937";
    const backgroundColor = isDarkMode ? "#1F2937" : "#FFFFFF";
    const tooltipBackgroundColor = isDarkMode ? "#374151" : "#FFFFFF";
    const tooltipTextColor = isDarkMode ? "#E5E7EB" : "#1F2937";
    const tooltipBorderColor = isDarkMode ? "#4B5563" : "#E5E7EB";
    const legendTextColor = isDarkMode ? "#E5E7EB" : "#1F2937";
    const legendSecondaryColor = isDarkMode ? "#9CA3AF" : "#6B7280";

    d3.select(chartRef.current).selectAll("*").remove();

    const margin = { top: 40, right: 180, bottom: 40, left: 40 };
    const radius = Math.min(width - margin.left - margin.right, height) / 2.2;

    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg
      .append("g")
      .attr(
        "transform",
        `translate(${(width - margin.right) / 2}, ${height / 2})`
      );

    const color = d3
      .scaleOrdinal<string>()
      .domain(data.map((d) => d.category))
      .range(chartColors);

    const arcGenerator = d3
      .arc<
        d3.PieArcDatum<{ category: string; count: number; percentage: number }>
      >()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.9);

    const arcHover = d3
      .arc<
        d3.PieArcDatum<{ category: string; count: number; percentage: number }>
      >()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.95);

    const pie = d3
      .pie<{ category: string; count: number; percentage: number }>()
      .sort(null)
      .value((d) => d.count);

    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("opacity", 0)
      .style("font-size", chartStyles.tooltip.fontSize)
      .style("padding", chartStyles.tooltip.padding)
      .style("border-radius", chartStyles.tooltip.borderRadius)
      .style("border", `1px solid ${tooltipBorderColor}`)
      .style("pointer-events", "none")
      .style("background-color", tooltipBackgroundColor)
      .style("color", tooltipTextColor)
      .style("z-index", "9999")
      .style(
        "box-shadow",
        isDarkMode ? "0 2px 4px rgba(0,0,0,0.3)" : "0 2px 4px rgba(0,0,0,0.1)"
      )
      .style("backdrop-filter", "blur(8px)");

    const total = d3.sum(data, (d) => d.count);

    const centerLabel = g
      .append("text")
      .attr("class", "center-label")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .style("font-size", "28px")
      .style("font-weight", "bold")
      .style("fill", axisColor)
      .style("opacity", 0);

    const arcs = g
      .selectAll<
        SVGGElement,
        d3.PieArcDatum<{ category: string; count: number; percentage: number }>
      >(".arc")
      .data(pie(data))
      .enter()
      .append("g")
      .attr("class", "arc");

    const legendGroup = svg
      .append("g")
      .attr("class", "legend")
      .attr(
        "transform",
        `translate(${width - margin.right + 20}, ${
          height / 2 - (data.length * chartStyles.legend.itemSpacing) / 2
        })`
      );

    const legendItems = legendGroup
      .selectAll(".legend-item")
      .data(data)
      .join("g")
      .attr("class", "legend-item")
      .attr(
        "transform",
        (d, i) => `translate(0, ${i * chartStyles.legend.itemSpacing})`
      );

    legendItems
      .append("rect")
      .attr("width", chartStyles.legend.symbolSize)
      .attr("height", chartStyles.legend.symbolSize)
      .attr("fill", (d) => color(d.category))
      .style("stroke", isDarkMode ? "#FFFFFF" : "#E5E7EB")
      .style("stroke-width", "1px");

    const percentages = data.map((d) => ({
      ...d,
      percentage: ((d.count / total) * 100).toFixed(1),
    }));

    legendItems
      .append("text")
      .attr(
        "x",
        chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
      )
      .attr("y", chartStyles.legend.symbolSize - 2)
      .style("font-size", chartStyles.legend.fontSize)
      .style("fill", legendTextColor)
      .text((d) => d.category);

    legendItems
      .append("text")
      .attr(
        "x",
        chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
      )
      .attr("y", chartStyles.legend.symbolSize + 12)
      .style("font-size", chartStyles.legend.percentageFontSize)
      .style("fill", legendSecondaryColor)
      .text((d) => {
        const percentage = percentages.find(
          (p) => p.category === d.category
        )?.percentage;
        return `${percentage}%`;
      });

    arcs
      .append("path")
      .attr("fill", (d) => color(d.data.category))
      .attr("d", arcGenerator)
      .transition()
      .duration(1000)
      .attrTween("d", function (d) {
        const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return function (t) {
          return arcGenerator(interpolate(t))!;
        };
      });

    arcs
      .select("path")
      .on("mouseover", function (event, d) {
        const percentage = ((d.data.count / total) * 100).toFixed(1);

        d3.select(this).transition().duration(200).attr("d", arcHover);

        tooltip
          .style("opacity", 1)
          .html(
            `<strong style="color: ${tooltipTextColor}">${
              d.data.category
            }</strong><br/>
             <span style="color: ${tooltipTextColor}">Count: ${d.data.count.toLocaleString()}<br/>
             Percentage: ${percentage}%</span>`
          )
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 25}px`);

        centerLabel
          .text(`${percentage}%`)
          .transition()
          .duration(200)
          .style("opacity", 1);

        legendGroup
          .selectAll(".legend-item text")
          .filter(function () {
            const parentData = d3.select(this.parentNode).datum();
            return parentData.category === d.data.category;
          })
          .style("font-weight", "bold");

        legendGroup
          .selectAll(".legend-item text")
          .filter(function () {
            const parentData = d3.select(this.parentNode).datum();
            return parentData.category !== d.data.category;
          })
          .style("opacity", 0.5);
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 25}px`);
      })
      .on("mouseout", function () {
        d3.select(this).transition().duration(200).attr("d", arcGenerator);

        tooltip.transition().duration(200).style("opacity", 0);

        centerLabel.transition().duration(200).style("opacity", 0);

        legendGroup
          .selectAll(".legend-item text")
          .style("font-weight", "normal")
          .style("opacity", 1);
      });

    g.append("text")
      .attr("x", 0)
      .attr("y", -height / 2 + 20)
      .attr("text-anchor", "middle")
      .attr("fill", axisColor)
      .style("font-size", chartStyles.title.fontSize)
      .style("font-weight", chartStyles.title.fontWeight)
      .text(title);

    return () => {
      tooltip.remove();
    };
  }, [data, isDarkMode, title, width, height]);

  return (
    <div className="w-full h-full">
      <svg ref={chartRef} id={id} className="w-full h-full" />
    </div>
  );
};

export default DonutChart;
