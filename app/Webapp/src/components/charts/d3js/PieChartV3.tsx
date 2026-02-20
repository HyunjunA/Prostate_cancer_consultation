// // import { useEffect, useRef } from "react";
// // import * as d3 from "d3";

// // interface ChartData {
// //   category: string;
// //   count: number;
// //   percentage: number;
// // }

// // interface PieChartProps {
// //   data: ChartData[];
// //   width?: number;
// //   height?: number;
// //   title: string;
// //   id: string;
// // }

// // const chartStyles = {
// //   title: {
// //     fontSize: "20px",
// //     fontWeight: "bold",
// //   },
// //   tooltip: {
// //     fontSize: "14px",
// //     padding: "8px",
// //     borderRadius: "4px",
// //     border: "1px solid #ddd",
// //     backgroundColor: "white",
// //     color: "#333",
// //     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
// //   },
// // };

// // export const PieChartV3 = ({
// //   data,
// //   width = 400,
// //   height = 400,
// //   title,
// //   id,
// // }: PieChartProps) => {
// //   const chartRef = useRef<SVGSVGElement | null>(null);

// //   useEffect(() => {
// //     if (!chartRef.current) return;

// //     const margin = { top: 30, right: 30, bottom: 30, left: 30 };
// //     const radius = Math.min(width, height) / 3;

// //     const svg = d3
// //       .select(chartRef.current)
// //       .attr("viewBox", `0 0 ${width} ${height}`)
// //       .attr("preserveAspectRatio", "xMidYMid meet");

// //     // Clear existing content
// //     svg.selectAll("*").remove();

// //     const g = svg
// //       .append("g")
// //       .attr("transform", `translate(${width / 2}, ${height / 2})`);

// //     const color = d3
// //       .scaleOrdinal<string>()
// //       .domain(data.map((d) => d.category))
// //       .range(d3.schemeCategory10);

// //     const arc = d3
// //       .arc<d3.PieArcDatum<ChartData>>()
// //       .innerRadius(0)
// //       .outerRadius(radius * 0.8);

// //     const arcHover = d3
// //       .arc<d3.PieArcDatum<ChartData>>()
// //       .innerRadius(0)
// //       .outerRadius(radius * 0.85);

// //     const pie = d3
// //       .pie<ChartData>()
// //       .value((d) => d.count)
// //       .sort(null);

// //     const pieData = pie(data);
// //     const total = d3.sum(data, (d) => d.count);

// //     // Create tooltip
// //     const tooltip = d3
// //       .select("body")
// //       .append("div")
// //       .attr("class", "tooltip")
// //       .style("position", "absolute")
// //       .style("visibility", "hidden")
// //       .style("background", chartStyles.tooltip.backgroundColor)
// //       .style("padding", chartStyles.tooltip.padding)
// //       .style("border", chartStyles.tooltip.border)
// //       .style("border-radius", chartStyles.tooltip.borderRadius)
// //       .style("box-shadow", chartStyles.tooltip.boxShadow)
// //       .style("font-size", chartStyles.tooltip.fontSize)
// //       .style("color", chartStyles.tooltip.color)
// //       .style("pointer-events", "none")
// //       .style("z-index", "1000");

// //     // Create and update slices with animation
// //     const slices = g
// //       .selectAll(".arc")
// //       .data(pieData)
// //       .join(
// //         (enter) =>
// //           enter
// //             .append("g")
// //             .attr("class", "arc")
// //             .call((enter) =>
// //               enter
// //                 .append("path")
// //                 .attr("fill", (d) => color(d.data.category))
// //                 .attr("stroke", "white")
// //                 .style("stroke-width", "2px")
// //                 .style("cursor", "pointer")
// //                 .style("opacity", 0)
// //                 .transition()
// //                 .duration(750)
// //                 .style("opacity", 1)
// //                 .attrTween("d", function (d) {
// //                   const interpolate = d3.interpolate(
// //                     { startAngle: 0, endAngle: 0 },
// //                     d
// //                   );
// //                   return function (t) {
// //                     return arc(interpolate(t));
// //                   };
// //                 })
// //             ),
// //         (update) =>
// //           update.call((update) =>
// //             update
// //               .select("path")
// //               .transition()
// //               .duration(750)
// //               .attrTween("d", function (d) {
// //                 const current = this._current || { startAngle: 0, endAngle: 0 };
// //                 const interpolate = d3.interpolate(current, d);
// //                 this._current = interpolate(0);
// //                 return function (t) {
// //                   return arc(interpolate(t));
// //                 };
// //               })
// //           ),
// //         (exit) =>
// //           exit.call((exit) =>
// //             exit
// //               .select("path")
// //               .transition()
// //               .duration(750)
// //               .style("opacity", 0)
// //               .remove()
// //           )
// //       );

// //     // Store the current angles for smooth transitions
// //     slices.select("path").each(function (d) {
// //       this._current = d;
// //     });

// //     // Add hover interactions
// //     slices
// //       .on("mouseover", function (event, d) {
// //         const percentage = ((d.data.count / total) * 100).toFixed(1);

// //         d3.select(this)
// //           .select("path")
// //           .transition()
// //           .duration(200)
// //           .attr("d", arcHover);

// //         tooltip
// //           .style("visibility", "visible")
// //           .html(
// //             `<div style="font-weight: bold">${d.data.category}</div>
// //              <div>Count: ${d.data.count.toLocaleString()}</div>
// //              <div>Percentage: ${percentage}%</div>`
// //           )
// //           .style("left", `${event.pageX + 10}px`)
// //           .style("top", `${event.pageY - 25}px`);
// //       })
// //       .on("mousemove", function (event) {
// //         tooltip
// //           .style("left", `${event.pageX + 10}px`)
// //           .style("top", `${event.pageY - 25}px`);
// //       })
// //       .on("mouseout", function () {
// //         d3.select(this)
// //           .select("path")
// //           .transition()
// //           .duration(200)
// //           .attr("d", arc);

// //         tooltip.style("visibility", "hidden");
// //       });

// //     // Add title
// //     g.append("text")
// //       .attr("x", 0)
// //       .attr("y", -radius - 20)
// //       .attr("text-anchor", "middle")
// //       .style("font-size", chartStyles.title.fontSize)
// //       .style("font-weight", chartStyles.title.fontWeight)
// //       .text(title);

// //     return () => {
// //       tooltip.remove();
// //     };
// //   }, [data, width, height, title]);

// //   return (
// //     <div className="w-full h-full">
// //       <svg ref={chartRef} id={id} className="w-full h-full" />
// //     </div>
// //   );
// // };

// // export default PieChartV3;

// // import { useEffect, useRef } from "react";
// // import * as d3 from "d3";

// // interface ChartData {
// //   category: string;
// //   count: number;
// //   percentage: number;
// // }

// // interface PieChartProps {
// //   data: ChartData[];
// //   width?: number;
// //   height?: number;
// //   title: string;
// //   id: string;
// // }

// // const chartStyles = {
// //   title: {
// //     fontSize: "20px",
// //     fontWeight: "bold",
// //   },
// //   tooltip: {
// //     fontSize: "14px",
// //     padding: "8px",
// //     borderRadius: "4px",
// //     border: "1px solid #ddd",
// //     backgroundColor: "white",
// //     color: "#333",
// //     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
// //   },
// //   legend: {
// //     fontSize: "14px",
// //     itemSpacing: 25,
// //     symbolSize: 15,
// //     symbolPadding: 10,
// //   },
// // };

// // export const PieChartV3 = ({
// //   data,
// //   width = 400,
// //   height = 400,
// //   title,
// //   id,
// // }: PieChartProps) => {
// //   const chartRef = useRef<SVGSVGElement | null>(null);

// //   useEffect(() => {
// //     if (!chartRef.current) return;

// //     // Increase right margin for legend
// //     const margin = { top: 30, right: 150, bottom: 30, left: 30 };

// //     // Adjust the radius to account for the legend space
// //     const chartWidth = width - margin.left - margin.right;
// //     const radius =
// //       Math.min(chartWidth, height - margin.top - margin.bottom) / 2.5;

// //     const svg = d3
// //       .select(chartRef.current)
// //       .attr("viewBox", `0 0 ${width} ${height}`)
// //       .attr("preserveAspectRatio", "xMidYMid meet");

// //     // Clear existing content
// //     svg.selectAll("*").remove();

// //     // Adjust the center point of the pie chart to make room for the legend
// //     const g = svg
// //       .append("g")
// //       .attr(
// //         "transform",
// //         `translate(${(width - margin.right) / 2}, ${height / 2})`
// //       );

// //     const color = d3
// //       .scaleOrdinal<string>()
// //       .domain(data.map((d) => d.category))
// //       .range(d3.schemeCategory10);

// //     const arc = d3
// //       .arc<d3.PieArcDatum<ChartData>>()
// //       .innerRadius(0)
// //       .outerRadius(radius);

// //     const arcHover = d3
// //       .arc<d3.PieArcDatum<ChartData>>()
// //       .innerRadius(0)
// //       .outerRadius(radius * 1.1);

// //     const pie = d3
// //       .pie<ChartData>()
// //       .value((d) => d.count)
// //       .sort(null);

// //     const pieData = pie(data);
// //     const total = d3.sum(data, (d) => d.count);

// //     // Create tooltip
// //     const tooltip = d3
// //       .select("body")
// //       .append("div")
// //       .attr("class", "tooltip")
// //       .style("position", "absolute")
// //       .style("visibility", "hidden")
// //       .style("background", chartStyles.tooltip.backgroundColor)
// //       .style("padding", chartStyles.tooltip.padding)
// //       .style("border", chartStyles.tooltip.border)
// //       .style("border-radius", chartStyles.tooltip.borderRadius)
// //       .style("box-shadow", chartStyles.tooltip.boxShadow)
// //       .style("font-size", chartStyles.tooltip.fontSize)
// //       .style("color", chartStyles.tooltip.color)
// //       .style("pointer-events", "none")
// //       .style("z-index", "1000");

// //     // Create and update slices with animation
// //     const slices = g
// //       .selectAll(".arc")
// //       .data(pieData)
// //       .join(
// //         (enter) =>
// //           enter
// //             .append("g")
// //             .attr("class", "arc")
// //             .call((enter) =>
// //               enter
// //                 .append("path")
// //                 .attr("fill", (d) => color(d.data.category))
// //                 .attr("stroke", "white")
// //                 .style("stroke-width", "2px")
// //                 .style("cursor", "pointer")
// //                 .style("opacity", 0)
// //                 .transition()
// //                 .duration(750)
// //                 .style("opacity", 1)
// //                 .attrTween("d", function (d) {
// //                   const interpolate = d3.interpolate(
// //                     { startAngle: 0, endAngle: 0 },
// //                     d
// //                   );
// //                   return function (t) {
// //                     return arc(interpolate(t));
// //                   };
// //                 })
// //             ),
// //         (update) =>
// //           update.call((update) =>
// //             update
// //               .select("path")
// //               .transition()
// //               .duration(750)
// //               .attrTween("d", function (d) {
// //                 const current = this._current || { startAngle: 0, endAngle: 0 };
// //                 const interpolate = d3.interpolate(current, d);
// //                 this._current = interpolate(0);
// //                 return function (t) {
// //                   return arc(interpolate(t));
// //                 };
// //               })
// //           ),
// //         (exit) =>
// //           exit.call((exit) =>
// //             exit
// //               .select("path")
// //               .transition()
// //               .duration(750)
// //               .style("opacity", 0)
// //               .remove()
// //           )
// //       );

// //     // Store the current angles for smooth transitions
// //     slices.select("path").each(function (d) {
// //       this._current = d;
// //     });

// //     // Add hover interactions
// //     slices
// //       .on("mouseover", function (event, d) {
// //         const percentage = ((d.data.count / total) * 100).toFixed(1);

// //         d3.select(this)
// //           .select("path")
// //           .transition()
// //           .duration(200)
// //           .attr("d", arcHover);

// //         tooltip
// //           .style("visibility", "visible")
// //           .html(
// //             `<div style="font-weight: bold">${d.data.category}</div>
// //              <div>Count: ${d.data.count.toLocaleString()}</div>
// //              <div>Percentage: ${percentage}%</div>`
// //           )
// //           .style("left", `${event.pageX + 10}px`)
// //           .style("top", `${event.pageY - 25}px`);
// //       })
// //       .on("mousemove", function (event) {
// //         tooltip
// //           .style("left", `${event.pageX + 10}px`)
// //           .style("top", `${event.pageY - 25}px`);
// //       })
// //       .on("mouseout", function () {
// //         d3.select(this)
// //           .select("path")
// //           .transition()
// //           .duration(200)
// //           .attr("d", arc);

// //         tooltip.style("visibility", "hidden");
// //       });

// //     // Add title
// //     g.append("text")
// //       .attr("x", 0)
// //       .attr("y", -radius - 20)
// //       .attr("text-anchor", "middle")
// //       .style("font-size", chartStyles.title.fontSize)
// //       .style("font-weight", chartStyles.title.fontWeight)
// //       .text(title);

// //     // Create legend
// //     const legendGroup = svg
// //       .append("g")
// //       .attr("class", "legend")
// //       .attr(
// //         "transform",
// //         `translate(${width - margin.right + 20}, ${
// //           height / 2 - (data.length * chartStyles.legend.itemSpacing) / 2
// //         })`
// //       );

// //     // Add legend items
// //     const legendItems = legendGroup
// //       .selectAll(".legend-item")
// //       .data(data)
// //       .join("g")
// //       .attr("class", "legend-item")
// //       .attr(
// //         "transform",
// //         (d, i) => `translate(0, ${i * chartStyles.legend.itemSpacing})`
// //       );

// //     // Add colored rectangles
// //     legendItems
// //       .append("rect")
// //       .attr("width", chartStyles.legend.symbolSize)
// //       .attr("height", chartStyles.legend.symbolSize)
// //       .attr("fill", (d) => color(d.category))
// //       .style("stroke", "white")
// //       .style("stroke-width", "1px");

// //     // Add percentage calculation
// //     const percentages = data.map((d) => ({
// //       ...d,
// //       percentage: ((d.count / total) * 100).toFixed(1),
// //     }));

// //     // Add text labels with percentages
// //     legendItems
// //       .append("text")
// //       .attr(
// //         "x",
// //         chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
// //       )
// //       .attr("y", chartStyles.legend.symbolSize - 2)
// //       .style("font-size", chartStyles.legend.fontSize)
// //       .text((d) => {
// //         const percentage = percentages.find(
// //           (p) => p.category === d.category
// //         )?.percentage;
// //         return `${d.category} (${percentage}%)`;
// //       });

// //     return () => {
// //       tooltip.remove();
// //     };
// //   }, [data, width, height, title]);

// //   return (
// //     <div className="w-full h-full">
// //       <svg ref={chartRef} id={id} className="w-full h-full" />
// //     </div>
// //   );
// // };

// // export default PieChartV3;

// // import { useEffect, useRef } from "react";
// // import * as d3 from "d3";
// // import { useTheme } from "next-themes";

// // interface ChartData {
// //   category: string;
// //   count: number;
// //   percentage: number;
// // }

// // interface PieChartProps {
// //   data: ChartData[];
// //   width?: number;
// //   height?: number;
// //   title: string;
// //   id: string;
// // }

// // const chartStyles = {
// //   title: {
// //     fontSize: "20px",
// //     fontWeight: "bold",
// //   },
// //   tooltip: {
// //     fontSize: "14px",
// //     padding: "8px",
// //     borderRadius: "4px",
// //     border: "1px solid #ddd",
// //     backgroundColor: "white",
// //     color: "#333",
// //     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
// //   },
// //   legend: {
// //     fontSize: "14px",
// //     itemSpacing: 40, // Increased spacing for two-line layout
// //     symbolSize: 15,
// //     symbolPadding: 10,
// //     percentageFontSize: "12px", // Smaller font size for percentage
// //   },
// // };

// // export const PieChartV3 = ({
// //   data,
// //   width = 400,
// //   height = 400,
// //   title,
// //   id,
// // }: PieChartProps) => {
// //   const chartRef = useRef<SVGSVGElement | null>(null);

// //   useEffect(() => {
// //     if (!chartRef.current) return;

// //     // Increase right margin for legend
// //     const margin = { top: 30, right: 150, bottom: 30, left: 30 };

// //     // Adjust the radius to account for the legend space
// //     const chartWidth = width - margin.left - margin.right;
// //     const radius =
// //       Math.min(chartWidth, height - margin.top - margin.bottom) / 2.5;

// //     const svg = d3
// //       .select(chartRef.current)
// //       .attr("viewBox", `0 0 ${width} ${height}`)
// //       .attr("preserveAspectRatio", "xMidYMid meet");

// //     // Clear existing content
// //     svg.selectAll("*").remove();

// //     // Adjust the center point of the pie chart to make room for the legend
// //     const g = svg
// //       .append("g")
// //       .attr(
// //         "transform",
// //         `translate(${(width - margin.right) / 2}, ${height / 2})`
// //       );

// //     const color = d3
// //       .scaleOrdinal<string>()
// //       .domain(data.map((d) => d.category))
// //       .range(d3.schemeCategory10);

// //     const arc = d3
// //       .arc<d3.PieArcDatum<ChartData>>()
// //       .innerRadius(0)
// //       .outerRadius(radius);

// //     const arcHover = d3
// //       .arc<d3.PieArcDatum<ChartData>>()
// //       .innerRadius(0)
// //       .outerRadius(radius * 1.1);

// //     const pie = d3
// //       .pie<ChartData>()
// //       .value((d) => d.count)
// //       .sort(null);

// //     const pieData = pie(data);
// //     const total = d3.sum(data, (d) => d.count);

// //     // Create tooltip
// //     const tooltip = d3
// //       .select("body")
// //       .append("div")
// //       .attr("class", "tooltip")
// //       .style("position", "absolute")
// //       .style("visibility", "hidden")
// //       .style("background", chartStyles.tooltip.backgroundColor)
// //       .style("padding", chartStyles.tooltip.padding)
// //       .style("border", chartStyles.tooltip.border)
// //       .style("border-radius", chartStyles.tooltip.borderRadius)
// //       .style("box-shadow", chartStyles.tooltip.boxShadow)
// //       .style("font-size", chartStyles.tooltip.fontSize)
// //       .style("color", chartStyles.tooltip.color)
// //       .style("pointer-events", "none")
// //       .style("z-index", "1000");

// //     // Create and update slices with animation
// //     const slices = g
// //       .selectAll(".arc")
// //       .data(pieData)
// //       .join(
// //         (enter) =>
// //           enter
// //             .append("g")
// //             .attr("class", "arc")
// //             .call((enter) =>
// //               enter
// //                 .append("path")
// //                 .attr("fill", (d) => color(d.data.category))
// //                 .attr("stroke", "white")
// //                 .style("stroke-width", "2px")
// //                 .style("cursor", "pointer")
// //                 .style("opacity", 0)
// //                 .transition()
// //                 .duration(750)
// //                 .style("opacity", 1)
// //                 .attrTween("d", function (d) {
// //                   const interpolate = d3.interpolate(
// //                     { startAngle: 0, endAngle: 0 },
// //                     d
// //                   );
// //                   return function (t) {
// //                     return arc(interpolate(t));
// //                   };
// //                 })
// //             ),
// //         (update) =>
// //           update.call((update) =>
// //             update
// //               .select("path")
// //               .transition()
// //               .duration(750)
// //               .attrTween("d", function (d) {
// //                 const current = this._current || { startAngle: 0, endAngle: 0 };
// //                 const interpolate = d3.interpolate(current, d);
// //                 this._current = interpolate(0);
// //                 return function (t) {
// //                   return arc(interpolate(t));
// //                 };
// //               })
// //           ),
// //         (exit) =>
// //           exit.call((exit) =>
// //             exit
// //               .select("path")
// //               .transition()
// //               .duration(750)
// //               .style("opacity", 0)
// //               .remove()
// //           )
// //       );

// //     // Store the current angles for smooth transitions
// //     slices.select("path").each(function (d) {
// //       this._current = d;
// //     });

// //     // Create percentage labels container
// //     const percentageLabels = g
// //       .append("g")
// //       .attr("class", "percentage-labels")
// //       .style("opacity", 0);

// //     // Add percentage labels
// //     percentageLabels
// //       .selectAll("text")
// //       .data(pieData)
// //       .join("text")
// //       .attr("transform", (d) => {
// //         const pos = arc.centroid(d);
// //         return `translate(${pos[0]}, ${pos[1]})`;
// //       })
// //       .attr("text-anchor", "middle")
// //       .attr("dy", ".35em")
// //       .style("font-size", "16px")
// //       .style("font-weight", "bold")
// //       .style("fill", "white")
// //       .text((d) => `${((d.data.count / total) * 100).toFixed(1)}%`);

// //     // Add hover interactions
// //     slices
// //       .on("mouseover", function (event, d) {
// //         const percentage = ((d.data.count / total) * 100).toFixed(1);

// //         // Highlight the pie slice
// //         d3.select(this)
// //           .select("path")
// //           .transition()
// //           .duration(200)
// //           .attr("d", arcHover);

// //         // Show tooltip
// //         tooltip
// //           .style("visibility", "visible")
// //           .html(
// //             `<div style="font-weight: bold">${d.data.category}</div>
// //              <div>Count: ${d.data.count.toLocaleString()}</div>
// //              <div>Percentage: ${percentage}%</div>`
// //           )
// //           .style("left", `${event.pageX + 10}px`)
// //           .style("top", `${event.pageY - 25}px`);

// //         // Show percentage label for this slice
// //         percentageLabels
// //           .style("opacity", 1)
// //           .selectAll("text")
// //           .style("opacity", (labelData) =>
// //             labelData.data.category === d.data.category ? 1 : 0
// //           );

// //         // Bold both category and percentage texts for the hovered item
// //         legendGroup
// //           .selectAll(".legend-item text")
// //           .filter(function () {
// //             const parentData = d3.select(this.parentNode).datum();
// //             return parentData.category === d.data.category;
// //           })
// //           .style("font-weight", "bold");

// //         // Dim other legend items (both category and percentage)
// //         legendGroup
// //           .selectAll(".legend-item text")
// //           .filter(function () {
// //             const parentData = d3.select(this.parentNode).datum();
// //             return parentData.category !== d.data.category;
// //           })
// //           .style("opacity", 0.5);
// //       })
// //       .on("mousemove", function (event) {
// //         tooltip
// //           .style("left", `${event.pageX + 10}px`)
// //           .style("top", `${event.pageY - 25}px`);
// //       })
// //       .on("mouseout", function (event, d) {
// //         // Reset pie slice
// //         d3.select(this)
// //           .select("path")
// //           .transition()
// //           .duration(200)
// //           .attr("d", arc);

// //         // Hide tooltip
// //         tooltip.style("visibility", "hidden");

// //         // Hide percentage labels
// //         percentageLabels.style("opacity", 0);

// //         // Reset all legend text styles
// //         legendGroup
// //           .selectAll(".legend-item text")
// //           .style("font-weight", "normal")
// //           .style("opacity", 1);
// //       });

// //     // Add title
// //     g.append("text")
// //       .attr("x", 0)
// //       .attr("y", -radius - 20)
// //       .attr("text-anchor", "middle")
// //       .style("font-size", chartStyles.title.fontSize)
// //       .style("font-weight", chartStyles.title.fontWeight)
// //       .text(title);

// //     // Create legend
// //     const legendGroup = svg
// //       .append("g")
// //       .attr("class", "legend")
// //       .attr(
// //         "transform",
// //         `translate(${width - margin.right + 20}, ${
// //           height / 2 - (data.length * chartStyles.legend.itemSpacing) / 2
// //         })`
// //       );

// //     // Add legend items
// //     const legendItems = legendGroup
// //       .selectAll(".legend-item")
// //       .data(data)
// //       .join("g")
// //       .attr("class", "legend-item")
// //       .attr(
// //         "transform",
// //         (d, i) => `translate(0, ${i * chartStyles.legend.itemSpacing})`
// //       );

// //     // Add colored rectangles
// //     legendItems
// //       .append("rect")
// //       .attr("width", chartStyles.legend.symbolSize)
// //       .attr("height", chartStyles.legend.symbolSize)
// //       .attr("fill", (d) => color(d.category))
// //       .style("stroke", "white")
// //       .style("stroke-width", "1px");

// //     // Add percentage calculation
// //     const percentages = data.map((d) => ({
// //       ...d,
// //       percentage: ((d.count / total) * 100).toFixed(1),
// //     }));

// //     // Add category text labels
// //     legendItems
// //       .append("text")
// //       .attr(
// //         "x",
// //         chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
// //       )
// //       .attr("y", chartStyles.legend.symbolSize - 2)
// //       .style("font-size", chartStyles.legend.fontSize)
// //       .text((d) => d.category);

// //     // Add percentage labels below category
// //     legendItems
// //       .append("text")
// //       .attr(
// //         "x",
// //         chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
// //       )
// //       .attr("y", chartStyles.legend.symbolSize + 12) // Position below category text
// //       .style("font-size", chartStyles.legend.percentageFontSize)
// //       .style("fill", "#666") // Slightly dimmer color for percentage
// //       .text((d) => {
// //         const percentage = percentages.find(
// //           (p) => p.category === d.category
// //         )?.percentage;
// //         return `${percentage}%`;
// //       });

// //     return () => {
// //       tooltip.remove();
// //     };
// //   }, [data, width, height, title]);

// //   return (
// //     <div className="w-full h-full">
// //       <svg ref={chartRef} id={id} className="w-full h-full" />
// //     </div>
// //   );
// // };

// // export default PieChartV3;

// import { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   category: string;
//   count: number;
//   percentage: number;
// }

// interface PieChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
//   isDarkMode?: boolean;
// }

// const chartStyles = {
//   title: {
//     fontSize: "20px",
//     fontWeight: "bold",
//   },
//   tooltip: {
//     fontSize: "14px",
//     padding: "8px",
//     borderRadius: "4px",
//   },
//   legend: {
//     fontSize: "14px",
//     itemSpacing: 40,
//     symbolSize: 15,
//     symbolPadding: 10,
//     percentageFontSize: "12px",
//   },
// };

// export const PieChartV3 = ({
//   data,
//   width = 400,
//   height = 400,
//   title,
//   id,
//   isDarkMode = false,
// }: PieChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     // Theme-dependent colors
//     const backgroundColor = isDarkMode ? "#1F2937" : "#FFFFFF";
//     const textColor = isDarkMode ? "#FFFFFF" : "#1F2937";
//     const secondaryTextColor = isDarkMode ? "#E5E7EB" : "#6B7280";
//     const borderColor = isDarkMode ? "#4B5563" : "#E5E7EB";
//     const tooltipBackgroundColor = isDarkMode ? "#374151" : "#FFFFFF";
//     const tooltipTextColor = isDarkMode ? "#E5E7EB" : "#1F2937";
//     const tooltipBorderColor = isDarkMode ? "#4B5563" : "#E5E7EB";

//     const margin = { top: 30, right: 150, bottom: 30, left: 30 };
//     const chartWidth = width - margin.left - margin.right;
//     const radius =
//       Math.min(chartWidth, height - margin.top - margin.bottom) / 2.5;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet");

//     svg.selectAll("*").remove();

//     const g = svg
//       .append("g")
//       .attr(
//         "transform",
//         `translate(${(width - margin.right) / 2}, ${height / 2})`
//       );

//     const color = d3
//       .scaleOrdinal<string>()
//       .domain(data.map((d) => d.category))
//       .range(d3.schemeCategory10);

//     const arc = d3
//       .arc<d3.PieArcDatum<ChartData>>()
//       .innerRadius(0)
//       .outerRadius(radius);

//     const arcHover = d3
//       .arc<d3.PieArcDatum<ChartData>>()
//       .innerRadius(0)
//       .outerRadius(radius * 1.1);

//     const pie = d3
//       .pie<ChartData>()
//       .value((d) => d.count)
//       .sort(null);

//     const pieData = pie(data);
//     const total = d3.sum(data, (d) => d.count);

//     // Create tooltip with theme-aware styles
//     const tooltip = d3
//       .select("body")
//       .append("div")
//       .attr("class", "tooltip")
//       .style("position", "absolute")
//       .style("visibility", "hidden")
//       .style("background", tooltipBackgroundColor)
//       .style("padding", chartStyles.tooltip.padding)
//       .style("border", `1px solid ${tooltipBorderColor}`)
//       .style("border-radius", chartStyles.tooltip.borderRadius)
//       .style(
//         "box-shadow",
//         isDarkMode ? "0 2px 4px rgba(0,0,0,0.3)" : "0 2px 4px rgba(0,0,0,0.1)"
//       )
//       .style("font-size", chartStyles.tooltip.fontSize)
//       .style("color", tooltipTextColor)
//       .style("pointer-events", "none")
//       .style("z-index", "1000");

//     // Create and update slices with animation
//     const slices = g
//       .selectAll(".arc")
//       .data(pieData)
//       .join(
//         (enter) =>
//           enter
//             .append("g")
//             .attr("class", "arc")
//             .call((enter) =>
//               enter
//                 .append("path")
//                 .attr("fill", (d) => color(d.data.category))
//                 .attr("stroke", "#FFFFFF")
//                 .style("stroke-width", "2px")
//                 .style("cursor", "pointer")
//                 .style("opacity", 0)
//                 .transition()
//                 .duration(750)
//                 .style("opacity", 1)
//                 .attrTween("d", function (d) {
//                   const interpolate = d3.interpolate(
//                     { startAngle: 0, endAngle: 0 },
//                     d
//                   );
//                   return function (t) {
//                     return arc(interpolate(t));
//                   };
//                 })
//             ),
//         (update) =>
//           update.call((update) =>
//             update
//               .select("path")
//               .transition()
//               .duration(750)
//               .attrTween("d", function (d) {
//                 const current = this._current || { startAngle: 0, endAngle: 0 };
//                 const interpolate = d3.interpolate(current, d);
//                 this._current = interpolate(0);
//                 return function (t) {
//                   return arc(interpolate(t));
//                 };
//               })
//           ),
//         (exit) =>
//           exit.call((exit) =>
//             exit
//               .select("path")
//               .transition()
//               .duration(750)
//               .style("opacity", 0)
//               .remove()
//           )
//       );

//     slices.select("path").each(function (d) {
//       this._current = d;
//     });

//     const percentageLabels = g
//       .append("g")
//       .attr("class", "percentage-labels")
//       .style("opacity", 0);

//     percentageLabels
//       .selectAll("text")
//       .data(pieData)
//       .join("text")
//       .attr("transform", (d) => {
//         const pos = arc.centroid(d);
//         return `translate(${pos[0]}, ${pos[1]})`;
//       })
//       .attr("text-anchor", "middle")
//       .attr("dy", ".35em")
//       .style("font-size", "16px")
//       .style("font-weight", "bold")
//       .style("fill", "white")
//       .text((d) => `${((d.data.count / total) * 100).toFixed(1)}%`);

//     // Add hover interactions
//     slices
//       .on("mouseover", function (event, d) {
//         const percentage = ((d.data.count / total) * 100).toFixed(1);

//         d3.select(this)
//           .select("path")
//           .transition()
//           .duration(200)
//           .attr("d", arcHover);

//         tooltip
//           .style("visibility", "visible")
//           .html(
//             `<div style="font-weight: bold; color: ${tooltipTextColor}">${
//               d.data.category
//             }</div>
//              <div style="color: ${tooltipTextColor}">Count: ${d.data.count.toLocaleString()}</div>
//              <div style="color: ${tooltipTextColor}">Percentage: ${percentage}%</div>`
//           )
//           .style("left", `${event.pageX + 10}px`)
//           .style("top", `${event.pageY - 25}px`);

//         percentageLabels
//           .style("opacity", 1)
//           .selectAll("text")
//           .style("opacity", (labelData) =>
//             labelData.data.category === d.data.category ? 1 : 0
//           );

//         // Bold both category and percentage texts for the hovered item
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
//         d3.select(this)
//           .select("path")
//           .transition()
//           .duration(200)
//           .attr("d", arc);

//         tooltip.style("visibility", "hidden");
//         percentageLabels.style("opacity", 0);

//         legendGroup
//           .selectAll(".legend-item text")
//           .style("font-weight", "normal")
//           .style("opacity", 1);
//       });

//     // Add title with theme-aware color
//     g.append("text")
//       .attr("x", 0)
//       .attr("y", -radius - 20)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .style("fill", textColor)
//       .text(title);

//     // Create legend with theme-aware colors
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
//       .style("stroke", "#FFFFFF")
//       .style("stroke-width", "1px");

//     const percentages = data.map((d) => ({
//       ...d,
//       percentage: ((d.count / total) * 100).toFixed(1),
//     }));

//     // Add category text labels with theme-aware colors
//     const legendText = legendItems
//       .append("text")
//       .attr(
//         "x",
//         chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
//       )
//       .attr("y", chartStyles.legend.symbolSize - 2)
//       .style("font-size", chartStyles.legend.fontSize)
//       .style("fill", textColor)
//       .text((d) => d.category);

//     // Add percentage labels with theme-aware colors
//     const percentageText = legendItems
//       .append("text")
//       .attr(
//         "x",
//         chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
//       )
//       .attr("y", chartStyles.legend.symbolSize + 12)
//       .style("font-size", chartStyles.legend.percentageFontSize)
//       .style("fill", secondaryTextColor)
//       .text((d) => {
//         const percentage = percentages.find(
//           (p) => p.category === d.category
//         )?.percentage;
//         return `${percentage}%`;
//       });

//     return () => {
//       tooltip.remove();
//     };
//   }, [data, width, height, title, isDarkMode]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//     </div>
//   );
// };

// export default PieChartV3;

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface ChartData {
  category: string;
  count: number;
  percentage: number;
}

interface PieChartProps {
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
  tooltip: {
    fontSize: "14px",
    padding: "8px",
    borderRadius: "4px",
  },
  legend: {
    fontSize: "14px",
    itemSpacing: 40,
    symbolSize: 15,
    symbolPadding: 10,
    percentageFontSize: "12px",
  },
};

export const PieChartV3 = ({
  data,
  width = 400,
  height = 400,
  title,
  id,
  isDarkMode = false,
}: PieChartProps) => {
  const chartRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Theme-dependent colors with fancy color scheme
    const backgroundColor = isDarkMode ? "#0F0F23" : "#FAFBFF";
    const textColor = isDarkMode ? "#E0E7FF" : "#1E293B";
    const secondaryTextColor = isDarkMode ? "#A5B4FC" : "#64748B";
    const borderColor = isDarkMode ? "#312E81" : "#E0E7FF";
    const tooltipBackgroundColor = isDarkMode ? "#1E1B4B" : "#FFFFFF";
    const tooltipTextColor = isDarkMode ? "#E0E7FF" : "#1E293B";
    const tooltipBorderColor = isDarkMode ? "#4C1D95" : "#C7D2FE";

    const margin = { top: 30, right: 150, bottom: 30, left: 30 };
    const chartWidth = width - margin.left - margin.right;
    const radius =
      Math.min(chartWidth, height - margin.top - margin.bottom) / 2.5;

    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    svg.selectAll("*").remove();

    // Create definitions for gradients
    const defs = svg.append("defs");

    // Fancy color palette with gradients
    const fancyColors = [
      { start: "#667eea", end: "#764ba2" }, // Purple gradient
      { start: "#f093fb", end: "#f5576c" }, // Pink gradient
      { start: "#4facfe", end: "#00f2fe" }, // Blue gradient
      { start: "#43e97b", end: "#38f9d7" }, // Green gradient
      { start: "#fa709a", end: "#fee140" }, // Warm gradient
      { start: "#30cfd0", end: "#330867" }, // Ocean gradient
      { start: "#a8edea", end: "#fed6e3" }, // Soft gradient
      { start: "#ff9a9e", end: "#fecfef" }, // Rose gradient
      { start: "#fbc2eb", end: "#a6c1ee" }, // Lavender gradient
      { start: "#fdcbf1", end: "#e6dee9" }, // Light pink gradient
    ];

    // Create gradients
    fancyColors.forEach((color, i) => {
      const gradient = defs
        .append("linearGradient")
        .attr("id", `gradient-${id}-${i}`)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "100%");

      gradient
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", color.start)
        .attr("stop-opacity", 1);

      gradient
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", color.end)
        .attr("stop-opacity", 1);
    });

    // Create drop shadow filter
    const filter = defs
      .append("filter")
      .attr("id", `drop-shadow-${id}`)
      .attr("height", "130%");

    filter
      .append("feGaussianBlur")
      .attr("in", "SourceAlpha")
      .attr("stdDeviation", 3);

    filter
      .append("feOffset")
      .attr("dx", 0)
      .attr("dy", 2)
      .attr("result", "offsetblur");

    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const g = svg
      .append("g")
      .attr(
        "transform",
        `translate(${(width - margin.right) / 2}, ${height / 2})`
      );

    const color = d3
      .scaleOrdinal<string>()
      .domain(data.map((d) => d.category))
      .range(
        data.map((_, i) => `url(#gradient-${id}-${i % fancyColors.length})`)
      );

    const arc = d3
      .arc<d3.PieArcDatum<ChartData>>()
      .innerRadius(0)
      .outerRadius(radius);

    const arcHover = d3
      .arc<d3.PieArcDatum<ChartData>>()
      .innerRadius(0)
      .outerRadius(radius * 1.1);

    const pie = d3
      .pie<ChartData>()
      .value((d) => d.count)
      .sort(null);

    const pieData = pie(data);
    const total = d3.sum(data, (d) => d.count);

    // Create tooltip with theme-aware styles
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
      .style(
        "box-shadow",
        isDarkMode
          ? "0 4px 20px rgba(139, 92, 246, 0.3)"
          : "0 4px 20px rgba(99, 102, 241, 0.15)"
      )
      .style("font-size", chartStyles.tooltip.fontSize)
      .style("color", tooltipTextColor)
      .style("pointer-events", "none")
      .style("z-index", "1000");

    // Create and update slices with animation
    const slices = g
      .selectAll(".arc")
      .data(pieData)
      .join(
        (enter) =>
          enter
            .append("g")
            .attr("class", "arc")
            .call((enter) =>
              enter
                .append("path")
                .attr("fill", (d) => color(d.data.category))
                .attr("stroke", isDarkMode ? "#1E1B4B" : "#FFFFFF")
                .style("stroke-width", "2px")
                .style("cursor", "pointer")
                .style("filter", `url(#drop-shadow-${id})`)
                .style("opacity", 0)
                .transition()
                .duration(750)
                .style("opacity", 0.9)
                .attrTween("d", function (d) {
                  const interpolate = d3.interpolate(
                    { startAngle: 0, endAngle: 0 },
                    d
                  );
                  return function (t) {
                    return arc(interpolate(t));
                  };
                })
            ),
        (update) =>
          update.call((update) =>
            update
              .select("path")
              .transition()
              .duration(750)
              .attrTween("d", function (d) {
                const current = this._current || { startAngle: 0, endAngle: 0 };
                const interpolate = d3.interpolate(current, d);
                this._current = interpolate(0);
                return function (t) {
                  return arc(interpolate(t));
                };
              })
          ),
        (exit) =>
          exit.call((exit) =>
            exit
              .select("path")
              .transition()
              .duration(750)
              .style("opacity", 0)
              .remove()
          )
      );

    slices.select("path").each(function (d) {
      this._current = d;
    });

    const percentageLabels = g
      .append("g")
      .attr("class", "percentage-labels")
      .style("opacity", 0);

    percentageLabels
      .selectAll("text")
      .data(pieData)
      .join("text")
      .attr("transform", (d) => {
        const pos = arc.centroid(d);
        return `translate(${pos[0]}, ${pos[1]})`;
      })
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .style("fill", "white")
      .style("text-shadow", "0 2px 4px rgba(0,0,0,0.5)")
      .text((d) => `${((d.data.count / total) * 100).toFixed(1)}%`);

    // Add hover interactions
    slices
      .on("mouseover", function (event, d) {
        const percentage = ((d.data.count / total) * 100).toFixed(1);

        d3.select(this)
          .select("path")
          .transition()
          .duration(200)
          .attr("d", arcHover)
          .style("opacity", 1)
          .style("filter", `url(#drop-shadow-${id}) brightness(1.1)`);

        tooltip
          .style("visibility", "visible")
          .html(
            `<div style="font-weight: bold; color: ${tooltipTextColor}">${
              d.data.category
            }</div>
             <div style="color: ${tooltipTextColor}">Count: ${d.data.count.toLocaleString()}</div>
             <div style="color: ${tooltipTextColor}">Percentage: ${percentage}%</div>`
          )
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 25}px`);

        percentageLabels
          .style("opacity", 1)
          .selectAll("text")
          .style("opacity", (labelData) =>
            labelData.data.category === d.data.category ? 1 : 0
          );

        // Bold both category and percentage texts for the hovered item
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
        d3.select(this)
          .select("path")
          .transition()
          .duration(200)
          .attr("d", arc)
          .style("opacity", 0.9)
          .style("filter", `url(#drop-shadow-${id})`);

        tooltip.style("visibility", "hidden");
        percentageLabels.style("opacity", 0);

        legendGroup
          .selectAll(".legend-item text")
          .style("font-weight", "normal")
          .style("opacity", 1);
      });

    // Add title with theme-aware color
    g.append("text")
      .attr("x", 0)
      .attr("y", -radius - 20)
      .attr("text-anchor", "middle")
      .style("font-size", chartStyles.title.fontSize)
      .style("font-weight", chartStyles.title.fontWeight)
      .style("fill", textColor)
      .text(title);

    // Create legend with theme-aware colors
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

    // Use solid colors for legend (extracting from gradients)
    const solidColors = fancyColors.map((c) => c.start);

    legendItems
      .append("rect")
      .attr("width", chartStyles.legend.symbolSize)
      .attr("height", chartStyles.legend.symbolSize)
      .attr("fill", (d, i) => solidColors[i % solidColors.length])
      .style("stroke", isDarkMode ? "#1E1B4B" : "#FFFFFF")
      .style("stroke-width", "1px")
      .style("filter", `url(#drop-shadow-${id})`)
      .attr("rx", 3)
      .attr("ry", 3);

    const percentages = data.map((d) => ({
      ...d,
      percentage: ((d.count / total) * 100).toFixed(1),
    }));

    // Add category text labels with theme-aware colors
    const legendText = legendItems
      .append("text")
      .attr(
        "x",
        chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
      )
      .attr("y", chartStyles.legend.symbolSize - 2)
      .style("font-size", chartStyles.legend.fontSize)
      .style("fill", textColor)
      .text((d) => d.category);

    // Add percentage labels with theme-aware colors
    const percentageText = legendItems
      .append("text")
      .attr(
        "x",
        chartStyles.legend.symbolSize + chartStyles.legend.symbolPadding
      )
      .attr("y", chartStyles.legend.symbolSize + 12)
      .style("font-size", chartStyles.legend.percentageFontSize)
      .style("fill", secondaryTextColor)
      .text((d) => {
        const percentage = percentages.find(
          (p) => p.category === d.category
        )?.percentage;
        return `${percentage}%`;
      });

    return () => {
      tooltip.remove();
    };
  }, [data, width, height, title, isDarkMode]);

  return (
    <div className="w-full h-full">
      <svg ref={chartRef} id={id} className="w-full h-full" />
    </div>
  );
};

export default PieChartV3;
