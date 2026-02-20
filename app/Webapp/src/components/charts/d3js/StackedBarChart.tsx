// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   age_group: string;
//   Married: number;
//   Single: number;
//   Widowed: number;
//   [key: string]: any;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
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
//     border: "1px solid #ddd",
//     backgroundColor: "white",
//     color: "#333",
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     position: "fixed",
//     pointerEvents: "none",
//     zIndex: 9999,
//   },
//   axisLabel: {
//     fontSize: "14px",
//     fontWeight: "bold",
//     color: "#666",
//   },
// };

// const calculateTooltipPosition = (
//   elementRect: DOMRect,
//   tooltipElement: HTMLElement,
//   scrollLeft: number,
//   scrollTop: number
// ) => {
//   const viewportWidth = window.innerWidth;
//   const viewportHeight = window.innerHeight;
//   const tooltipWidth = tooltipElement.offsetWidth;
//   const tooltipHeight = tooltipElement.offsetHeight;

//   let tooltipX = elementRect.left + elementRect.width / 2;
//   let tooltipY = elementRect.top - 10;
//   let transform = "translate(-50%, -100%)";

//   // Check if tooltip would go above viewport
//   if (tooltipY - tooltipHeight < 0) {
//     tooltipY = elementRect.bottom + 10;
//     transform = "translate(-50%, 0)";
//   }

//   // Check left and right boundaries
//   const tooltipLeft = tooltipX - tooltipWidth / 2;
//   const tooltipRight = tooltipX + tooltipWidth / 2;

//   if (tooltipLeft < 0) {
//     tooltipX = tooltipWidth / 2;
//   } else if (tooltipRight > viewportWidth) {
//     tooltipX = viewportWidth - tooltipWidth / 2;
//   }

//   return {
//     left: `${tooltipX + scrollLeft}px`,
//     top: `${tooltipY + scrollTop}px`,
//     transform,
//   };
// };

// export const StackedBarChart = ({
//   data,
//   width = 600,
//   height = 400,
//   title,
//   id,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     // Create tooltip div if it doesn't exist
//     if (!tooltipRef.current) {
//       tooltipRef.current = document.createElement("div");
//       tooltipRef.current.className = "tooltip";
//       Object.assign(tooltipRef.current.style, {
//         ...chartStyles.tooltip,
//         visibility: "hidden",
//       } as CSSStyleDeclaration);
//       document.body.appendChild(tooltipRef.current);
//     }

//     // Margins and dimensions
//     const margin = { top: 50, right: 100, bottom: 60, left: 70 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     // Animation duration
//     const animationDuration = 800;
//     const animationDelay = 100;

//     // Clear previous chart
//     d3.select(chartRef.current).selectAll("*").remove();

//     // Set up SVG container
//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     // Process data keys for stacking
//     const keys = Object.keys(data[0]).filter((key) => key !== "age_group");

//     // Set up color scale
//     const color = d3
//       .scaleOrdinal<string>()
//       .domain(keys)
//       .range(d3.schemeTableau10);

//     // Set up X scale
//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d.age_group))
//       .range([0, innerWidth])
//       .padding(0.2);

//     // Set up Y scale
//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) => keys.reduce((sum, key) => sum + d[key], 0))!,
//       ])
//       .range([innerHeight, 0]);

//     // Stack data
//     const stackedData = d3.stack().keys(keys)(data);

//     // Add X axis with animation
//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .style("text-anchor", "middle")
//       .style("font-size", chartStyles.axisLabel.fontSize);

//     // Add Y axis with animation
//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale).ticks(5))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .style("font-size", chartStyles.axisLabel.fontSize);

//     // Add X axis label with animation
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", innerHeight + 40)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .style("font-weight", chartStyles.axisLabel.fontWeight)
//       .style("opacity", 0)
//       .text("Age Groups")
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add Y axis label with animation
//     svg
//       .append("text")
//       .attr("x", -innerHeight / 2)
//       .attr("y", -50)
//       .attr("transform", "rotate(-90)")
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .style("font-weight", chartStyles.axisLabel.fontWeight)
//       .style("opacity", 0)
//       .text("Count of Individuals")
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Create the bars with animation
//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("fill", (d) => color(d.key))
//       .attr("class", "layer");

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data.age_group)!)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight)
//       .attr("height", 0)
//       .style("cursor", "pointer")
//       .transition()
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     // Add hover effects after animation
//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const count = d[1] - d[0];

//         d3.select(this).transition().duration(200).style("opacity", 0.7);

//         if (tooltipRef.current) {
//           tooltipRef.current.innerHTML = `
//             <div style="font-weight: bold">${category}</div>
//             <div>Count: ${count}</div>
//           `;

//           const elementRect = this.getBoundingClientRect();
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;

//           const position = calculateTooltipPosition(
//             elementRect,
//             tooltipRef.current,
//             scrollLeft,
//             scrollTop
//           );

//           Object.assign(tooltipRef.current.style, {
//             visibility: "visible",
//             left: position.left,
//             top: position.top,
//             transform: position.transform,
//           });
//         }
//       })
//       .on("mousemove", function (event) {
//         if (tooltipRef.current) {
//           const elementRect = this.getBoundingClientRect();
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;

//           const position = calculateTooltipPosition(
//             elementRect,
//             tooltipRef.current,
//             scrollLeft,
//             scrollTop
//           );

//           Object.assign(tooltipRef.current.style, {
//             left: position.left,
//             top: position.top,
//             transform: position.transform,
//           });
//         }
//       })
//       .on("mouseout", function () {
//         d3.select(this).transition().duration(200).style("opacity", 1);
//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "hidden";
//         }
//       });

//     // Add title with animation
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add legend with animation
//     const legend = svg
//       .append("g")
//       .attr("transform", `translate(${innerWidth + 20}, 0)`)
//       .style("opacity", 0);

//     keys.forEach((key, i) => {
//       legend
//         .append("rect")
//         .attr("x", 0)
//         .attr("y", i * 20)
//         .attr("width", 15)
//         .attr("height", 15)
//         .attr("fill", color(key));

//       legend
//         .append("text")
//         .attr("x", 20)
//         .attr("y", i * 20 + 12)
//         .text(key)
//         .style("font-size", chartStyles.axisLabel.fontSize)
//         .style("alignment-baseline", "middle");
//     });

//     // Animate legend
//     legend
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);

//     // Cleanup on unmount
//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//         tooltipRef.current = null;
//       }
//     };
//   }, [data, width, height, title]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
//   categoryField?: string;
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
//     border: "1px solid #ddd",
//     backgroundColor: "white",
//     color: "#333",
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     position: "fixed",
//     pointerEvents: "none",
//     zIndex: 9999,
//   },
//   axisLabel: {
//     fontSize: "14px",
//     fontWeight: "bold",
//     color: "#666",
//   },
// };

// const calculateTooltipPosition = (
//   elementRect: DOMRect,
//   tooltipElement: HTMLElement,
//   scrollLeft: number,
//   scrollTop: number
// ) => {
//   const viewportWidth = window.innerWidth;
//   const viewportHeight = window.innerHeight;
//   const tooltipWidth = tooltipElement.offsetWidth;
//   const tooltipHeight = tooltipElement.offsetHeight;

//   let tooltipX = elementRect.left + elementRect.width / 2;
//   let tooltipY = elementRect.top - 10;
//   let transform = "translate(-50%, -100%)";

//   if (tooltipY - tooltipHeight < 0) {
//     tooltipY = elementRect.bottom + 10;
//     transform = "translate(-50%, 0)";
//   }

//   const tooltipLeft = tooltipX - tooltipWidth / 2;
//   const tooltipRight = tooltipX + tooltipWidth / 2;

//   if (tooltipLeft < 0) {
//     tooltipX = tooltipWidth / 2;
//   } else if (tooltipRight > viewportWidth) {
//     tooltipX = viewportWidth - tooltipWidth / 2;
//   }

//   return {
//     left: `${tooltipX + scrollLeft}px`,
//     top: `${tooltipY + scrollTop}px`,
//     transform,
//   };
// };

// export const StackedBarChart = ({
//   data,
//   width = 600,
//   height = 400,
//   title,
//   id,
//   categoryField = "age_group", // Default to age_group for backward compatibility
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     if (!tooltipRef.current) {
//       tooltipRef.current = document.createElement("div");
//       tooltipRef.current.className = "tooltip";
//       Object.assign(tooltipRef.current.style, {
//         ...chartStyles.tooltip,
//         visibility: "hidden",
//       } as CSSStyleDeclaration);
//       document.body.appendChild(tooltipRef.current);
//     }

//     const margin = { top: 50, right: 100, bottom: 60, left: 70 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     const animationDuration = 800;
//     const animationDelay = 100;

//     d3.select(chartRef.current).selectAll("*").remove();

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const color = d3
//       .scaleOrdinal<string>()
//       .domain(keys)
//       .range(d3.schemeTableau10);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.2);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         )!,
//       ])
//       .range([innerHeight, 0]);

//     const stackedData = d3.stack<any>().keys(keys)(data);

//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .style("text-anchor", "middle")
//       .style("font-size", chartStyles.axisLabel.fontSize);

//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale).ticks(5))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .style("font-size", chartStyles.axisLabel.fontSize);

//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", innerHeight + 40)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .style("font-weight", chartStyles.axisLabel.fontWeight)
//       .style("opacity", 0)
//       .text(
//         `${categoryField
//           .replace(/_/g, " ")
//           .replace(/\b\w/g, (l) => l.toUpperCase())}`
//       )
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     svg
//       .append("text")
//       .attr("x", -innerHeight / 2)
//       .attr("y", -50)
//       .attr("transform", "rotate(-90)")
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .style("font-weight", chartStyles.axisLabel.fontWeight)
//       .style("opacity", 0)
//       .text("Count")
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("fill", (d) => color(d.key))
//       .attr("class", "layer");

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField])!)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight)
//       .attr("height", 0)
//       .style("cursor", "pointer")
//       .transition()
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const count = d[1] - d[0];

//         d3.select(this).transition().duration(200).style("opacity", 0.7);

//         if (tooltipRef.current) {
//           tooltipRef.current.innerHTML = `
//             <div style="font-weight: bold">${category}</div>
//             <div>Count: ${count}</div>
//           `;

//           const elementRect = this.getBoundingClientRect();
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;

//           const position = calculateTooltipPosition(
//             elementRect,
//             tooltipRef.current,
//             scrollLeft,
//             scrollTop
//           );

//           Object.assign(tooltipRef.current.style, {
//             visibility: "visible",
//             left: position.left,
//             top: position.top,
//             transform: position.transform,
//           });
//         }
//       })
//       .on("mousemove", function (event) {
//         if (tooltipRef.current) {
//           const elementRect = this.getBoundingClientRect();
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;

//           const position = calculateTooltipPosition(
//             elementRect,
//             tooltipRef.current,
//             scrollLeft,
//             scrollTop
//           );

//           Object.assign(tooltipRef.current.style, {
//             left: position.left,
//             top: position.top,
//             transform: position.transform,
//           });
//         }
//       })
//       .on("mouseout", function () {
//         d3.select(this).transition().duration(200).style("opacity", 1);
//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "hidden";
//         }
//       });

//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const legend = svg
//       .append("g")
//       .attr("transform", `translate(${innerWidth + 20}, 0)`)
//       .style("opacity", 0);

//     keys.forEach((key, i) => {
//       legend
//         .append("rect")
//         .attr("x", 0)
//         .attr("y", i * 20)
//         .attr("width", 15)
//         .attr("height", 15)
//         .attr("fill", color(key));

//       legend
//         .append("text")
//         .attr("x", 20)
//         .attr("y", i * 20 + 12)
//         .text(key)
//         .style("font-size", chartStyles.axisLabel.fontSize)
//         .style("alignment-baseline", "middle");
//     });

//     legend
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);

//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//         tooltipRef.current = null;
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// const chartStyles = {
//   tooltip: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "8px",
//     border: "1px solid #ccc",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//   },
// };

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     // Create tooltip if not exists
//     if (!tooltipRef.current) {
//       const tooltip = document.createElement("div");
//       Object.assign(tooltip.style, chartStyles.tooltip);
//       document.body.appendChild(tooltip);
//       tooltipRef.current = tooltip;
//     }

//     // Clear previous chart
//     d3.select(chartRef.current).selectAll("*").remove();

//     // Chart dimensions
//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     // Create SVG
//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     // Get keys for stacking
//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     // Create scales
//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     // Create and draw stack
//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     // Create layers
//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     // Create bars with tooltips
//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]))
//       .attr("width", xScale.bandwidth())
//       .style("cursor", "pointer")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];

//         d3.select(this).transition().duration(200).style("opacity", 0.7);

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "visible";
//           tooltipRef.current.innerHTML = `
//             <div style="font-weight: bold">${category}</div>
//             <div>Count: ${value}</div>
//           `;
//         }
//       })
//       .on("mousemove", (event) => {
//         if (tooltipRef.current) {
//           tooltipRef.current.style.top = event.pageY - 10 + "px";
//           tooltipRef.current.style.left = event.pageX + 10 + "px";
//         }
//       })
//       .on("mouseout", function () {
//         d3.select(this).transition().duration(200).style("opacity", 1);
//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "hidden";
//         }
//       });

//     // Add axes
//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .call(d3.axisBottom(xScale));

//     xAxis
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     svg.append("g").call(d3.axisLeft(yScale));

//     // Add title
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .text(title);

//     // Add legend
//     const legend = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legend
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale);

//     legend
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     // Cleanup
//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// const chartStyles = {
//   tooltip: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "12px",
//     border: "1px solid #ccc",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "14px",
//   },
// };

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     if (!tooltipRef.current) {
//       const tooltip = document.createElement("div");
//       Object.assign(tooltip.style, chartStyles.tooltip);
//       document.body.appendChild(tooltip);
//       tooltipRef.current = tooltip;
//     }

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]))
//       .attr("width", xScale.bandwidth())
//       .style("cursor", "pointer")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];
//         const mainCategory = d.data[categoryField];

//         // Highlight current bar
//         d3.select(this).style("stroke", "#000").style("stroke-width", "2px");

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "visible";
//           tooltipRef.current.innerHTML = `
//             <div style="margin-bottom: 8px">
//               <strong>${mainCategory}</strong>
//             </div>
//             <div style="color: ${colorScale(category)}">
//               <strong>${category}:</strong> ${value}
//             </div>
//             <div style="font-size: 12px; color: #666; margin-top: 4px">
//               Total in group: ${keys.reduce(
//                 (sum, key) => sum + Number(d.data[key]),
//                 0
//               )}
//             </div>
//           `;
//         }
//       })
//       .on("mousemove", (event) => {
//         if (tooltipRef.current) {
//           tooltipRef.current.style.top = event.pageY - 10 + "px";
//           tooltipRef.current.style.left = event.pageX + 10 + "px";
//         }
//       })
//       .on("mouseout", function () {
//         // Remove highlight
//         d3.select(this).style("stroke", "none").style("stroke-width", "0");

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "hidden";
//         }
//       });

//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .call(d3.axisBottom(xScale));

//     xAxis
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     svg.append("g").call(d3.axisLeft(yScale));

//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .text(title);

//     const legend = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legend
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale);

//     legend
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// const chartStyles = {
//   tooltip: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "12px",
//     border: "1px solid #ccc",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "14px",
//     minWidth: "200px",
//   },
// };

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     if (!tooltipRef.current) {
//       const tooltip = document.createElement("div");
//       Object.assign(tooltip.style, chartStyles.tooltip);
//       document.body.appendChild(tooltip);
//       tooltipRef.current = tooltip;
//     }

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]))
//       .attr("width", xScale.bandwidth())
//       .style("cursor", "pointer")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];
//         const mainCategory = d.data[categoryField];
//         const totalValue = keys.reduce(
//           (sum, key) => sum + Number(d.data[key]),
//           0
//         );
//         const percentage = ((value / totalValue) * 100).toFixed(1);

//         // Get all values for this category
//         const categoryValues = keys.map((key) => ({
//           key,
//           value: Number(d.data[key]),
//           color: colorScale(key),
//         }));

//         // Highlight current bar
//         d3.select(this).style("stroke", "#000").style("stroke-width", "2px");

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "visible";
//           tooltipRef.current.innerHTML = `
//             <div style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px">
//               <strong style="font-size: 16px">${mainCategory}</strong>
//             </div>
//             <div style="background: ${colorScale(
//               category
//             )}20; padding: 8px; margin: -4px; margin-bottom: 8px">
//               <strong style="color: ${colorScale(
//                 category
//               )}">${category}</strong>
//               <div style="margin-top: 4px">
//                 Value: ${value.toLocaleString()}
//                 <br>
//                 Share: ${percentage}%
//               </div>
//             </div>
//             <div style="font-size: 12px; color: #666">
//               <strong>Stack Breakdown:</strong>
//               ${categoryValues
//                 .map(
//                   (item) => `
//                   <div style="display: flex; justify-content: space-between; margin-top: 4px">
//                     <span style="color: ${item.color}">${item.key}</span>
//                     <span>${item.value.toLocaleString()}</span>
//                   </div>
//                 `
//                 )
//                 .join("")}
//               <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee">
//                 Total: ${totalValue.toLocaleString()}
//               </div>
//             </div>
//           `;
//         }
//       })
//       .on("mousemove", (event) => {
//         if (tooltipRef.current) {
//           const tooltipWidth = tooltipRef.current.offsetWidth;
//           const tooltipHeight = tooltipRef.current.offsetHeight;
//           const padding = 10;

//           // Calculate position to keep tooltip within viewport
//           let left = event.pageX + padding;
//           let top = event.pageY - tooltipHeight - padding;

//           // Adjust if tooltip would go off the right edge
//           if (left + tooltipWidth > window.innerWidth) {
//             left = event.pageX - tooltipWidth - padding;
//           }

//           // Adjust if tooltip would go off the top edge
//           if (top < 0) {
//             top = event.pageY + padding;
//           }

//           tooltipRef.current.style.top = `${top}px`;
//           tooltipRef.current.style.left = `${left}px`;
//         }
//       })
//       .on("mouseout", function () {
//         // Remove highlight
//         d3.select(this).style("stroke", "none").style("stroke-width", "0");

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "hidden";
//         }
//       });

//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .call(d3.axisBottom(xScale));

//     xAxis
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     svg.append("g").call(d3.axisLeft(yScale));

//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .text(title);

//     const legend = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legend
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale);

//     legend
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// const chartStyles = {
//   tooltip: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "12px",
//     border: "1px solid #ccc",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "14px",
//     minWidth: "200px",
//   },
// };

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     if (!tooltipRef.current) {
//       const tooltip = document.createElement("div");
//       Object.assign(tooltip.style, chartStyles.tooltip);
//       document.body.appendChild(tooltip);
//       tooltipRef.current = tooltip;
//     }

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     // Animation duration
//     const animationDuration = 800;
//     const animationDelay = 100;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     // Add X axis with animation
//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     // Add Y axis with animation
//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight) // Start from bottom
//       .attr("height", 0) // Initial height of 0
//       .style("cursor", "pointer")
//       .transition() // Add animation
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     // Add hover effects after animation
//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];
//         const mainCategory = d.data[categoryField];
//         const totalValue = keys.reduce(
//           (sum, key) => sum + Number(d.data[key]),
//           0
//         );
//         const percentage = ((value / totalValue) * 100).toFixed(1);

//         // Get all values for this category
//         const categoryValues = keys.map((key) => ({
//           key,
//           value: Number(d.data[key]),
//           color: colorScale(key),
//         }));

//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("opacity", 0.7)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "visible";
//           tooltipRef.current.innerHTML = `
//             <div style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px">
//               <strong style="font-size: 16px">${mainCategory}</strong>
//             </div>
//             <div style="background: ${colorScale(
//               category
//             )}20; padding: 8px; margin: -4px; margin-bottom: 8px">
//               <strong style="color: ${colorScale(
//                 category
//               )}">${category}</strong>
//               <div style="margin-top: 4px">
//                 Count: ${value.toLocaleString()}
//                 <br>
//                 Share: ${percentage}%
//               </div>
//             </div>
//             <div style="font-size: 12px; color: #666">
//               <strong>Stack Breakdown:</strong>
//               ${categoryValues
//                 .map(
//                   (item) => `
//                   <div style="display: flex; justify-content: space-between; margin-top: 4px">
//                     <span style="color: ${item.color}">${item.key}</span>
//                     <span>${item.value.toLocaleString()}</span>
//                   </div>
//                 `
//                 )
//                 .join("")}
//               <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee">
//                 Total: ${totalValue.toLocaleString()}
//               </div>
//             </div>
//           `;
//         }
//       })
//       .on("mousemove", (event) => {
//         if (tooltipRef.current) {
//           const tooltipWidth = tooltipRef.current.offsetWidth;
//           const tooltipHeight = tooltipRef.current.offsetHeight;
//           const padding = 10;

//           let left = event.pageX + padding;
//           let top = event.pageY - tooltipHeight - padding;

//           if (left + tooltipWidth > window.innerWidth) {
//             left = event.pageX - tooltipWidth - padding;
//           }

//           if (top < 0) {
//             top = event.pageY + padding;
//           }

//           tooltipRef.current.style.top = `${top}px`;
//           tooltipRef.current.style.left = `${left}px`;
//         }
//       })
//       .on("mouseout", function () {
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("opacity", 1)
//           .style("stroke", "none");

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "hidden";
//         }
//       });

//     // Add title with animation
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add legend with animation
//     const legendGroup = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .style("opacity", 0);

//     const legendItems = legendGroup
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legendItems
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale);

//     legendItems
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     legendGroup
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);

//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// const chartStyles = {
//   tooltip: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "12px",
//     border: "1px solid #ccc",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "14px",
//     minWidth: "200px",
//   },
//   popupInfo: {
//     position: "absolute",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "8px 12px",
//     border: "1px solid #ddd",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "12px",
//   },
// };

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);
//   const popupRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     if (!tooltipRef.current) {
//       const tooltip = document.createElement("div");
//       Object.assign(tooltip.style, chartStyles.tooltip);
//       document.body.appendChild(tooltip);
//       tooltipRef.current = tooltip;
//     }

//     if (!popupRef.current) {
//       const popup = document.createElement("div");
//       Object.assign(popup.style, chartStyles.popupInfo);
//       document.body.appendChild(popup);
//       popupRef.current = popup;
//     }

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     // Animation duration
//     const animationDuration = 800;
//     const animationDelay = 100;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     // Add X axis with animation
//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     // Add Y axis with animation
//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight)
//       .attr("height", 0)
//       .style("cursor", "pointer")
//       .transition()
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     // Add hover effects after animation
//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];
//         const mainCategory = d.data[categoryField];
//         const totalValue = keys.reduce(
//           (sum, key) => sum + Number(d.data[key]),
//           0
//         );
//         const percentage = ((value / totalValue) * 100).toFixed(1);

//         // Get all values for this category
//         const categoryValues = keys.map((key) => ({
//           key,
//           value: Number(d.data[key]),
//           color: colorScale(key),
//         }));

//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("opacity", 0.7)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");

//         if (popupRef.current) {
//           popupRef.current.style.visibility = "visible";
//           popupRef.current.innerHTML = `
//             <div style="margin-bottom: 4px">
//               <strong>${category}</strong>
//             </div>
//             <div>Count: ${value.toLocaleString()}</div>
//           `;

//           const bbox = this.getBoundingClientRect();
//           const popupHeight = popupRef.current.offsetHeight;
//           const popupWidth = popupRef.current.offsetWidth;
//           const chartBox = chartRef.current!.getBoundingClientRect();

//           let top = bbox.top - popupHeight - 5;
//           let left = bbox.left + (bbox.width - popupWidth) / 2;

//           // Adjust if popup would go off the top
//           if (top < chartBox.top) {
//             top = bbox.bottom + 5;
//           }

//           // Adjust if popup would go off the sides
//           if (left < chartBox.left) {
//             left = chartBox.left + 5;
//           } else if (left + popupWidth > chartBox.right) {
//             left = chartBox.right - popupWidth - 5;
//           }

//           popupRef.current.style.top = `${top}px`;
//           popupRef.current.style.left = `${left}px`;
//         }

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "visible";
//           tooltipRef.current.innerHTML = `
//             <div style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px">
//               <strong style="font-size: 16px">${mainCategory}</strong>
//             </div>
//             <div style="background: ${colorScale(
//               category
//             )}20; padding: 8px; margin: -4px; margin-bottom: 8px">
//               <strong style="color: ${colorScale(
//                 category
//               )}">${category}</strong>
//               <div style="margin-top: 4px">
//                 Count: ${value.toLocaleString()}
//                 <br>
//                 Share: ${percentage}%
//               </div>
//             </div>
//             <div style="font-size: 12px; color: #666">
//               <strong>Stack Breakdown:</strong>
//               ${categoryValues
//                 .map(
//                   (item) => `
//                   <div style="display: flex; justify-content: space-between; margin-top: 4px">
//                     <span style="color: ${item.color}">${item.key}</span>
//                     <span>${item.value.toLocaleString()}</span>
//                   </div>
//                 `
//                 )
//                 .join("")}
//               <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee">
//                 Total: ${totalValue.toLocaleString()}
//               </div>
//             </div>
//           `;

//           const tooltipWidth = tooltipRef.current.offsetWidth;
//           const tooltipHeight = tooltipRef.current.offsetHeight;
//           const padding = 10;

//           let tooltipLeft = event.pageX + padding;
//           let tooltipTop = event.pageY - tooltipHeight - padding;

//           if (tooltipLeft + tooltipWidth > window.innerWidth) {
//             tooltipLeft = event.pageX - tooltipWidth - padding;
//           }

//           if (tooltipTop < 0) {
//             tooltipTop = event.pageY + padding;
//           }

//           tooltipRef.current.style.top = `${tooltipTop}px`;
//           tooltipRef.current.style.left = `${tooltipLeft}px`;
//         }
//       })
//       .on("mousemove", (event) => {
//         if (tooltipRef.current) {
//           const tooltipWidth = tooltipRef.current.offsetWidth;
//           const tooltipHeight = tooltipRef.current.offsetHeight;
//           const padding = 10;

//           let left = event.pageX + padding;
//           let top = event.pageY - tooltipHeight - padding;

//           if (left + tooltipWidth > window.innerWidth) {
//             left = event.pageX - tooltipWidth - padding;
//           }

//           if (top < 0) {
//             top = event.pageY + padding;
//           }

//           tooltipRef.current.style.top = `${top}px`;
//           tooltipRef.current.style.left = `${left}px`;
//         }
//       })
//       .on("mouseout", function () {
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("opacity", 1)
//           .style("stroke", "none");

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "hidden";
//         }
//         if (popupRef.current) {
//           popupRef.current.style.visibility = "hidden";
//         }
//       });

//     // Add title with animation
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add legend with animation
//     const legendGroup = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .style("opacity", 0);

//     const legendItems = legendGroup
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legendItems
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale);

//     legendItems
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     legendGroup
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);

//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//       }
//       if (popupRef.current && popupRef.current.parentNode) {
//         popupRef.current.parentNode.removeChild(popupRef.current);
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// const chartStyles = {
//   tooltip: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "12px",
//     border: "1px solid #ccc",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "14px",
//     minWidth: "200px",
//   },
//   popupInfo: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "rgba(255, 255, 255, 0.9)",
//     padding: "8px 12px",
//     border: "1px solid #ddd",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "12px",
//     fontWeight: "bold",
//     transform: "translate(-50%, -100%)",
//   },
// };

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);
//   const popupRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     if (!tooltipRef.current) {
//       const tooltip = document.createElement("div");
//       Object.assign(tooltip.style, chartStyles.tooltip);
//       document.body.appendChild(tooltip);
//       tooltipRef.current = tooltip;
//     }

//     if (!popupRef.current) {
//       const popup = document.createElement("div");
//       Object.assign(popup.style, chartStyles.popupInfo);
//       document.body.appendChild(popup);
//       popupRef.current = popup;
//     }

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     // Animation duration
//     const animationDuration = 800;
//     const animationDelay = 100;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     // Add X axis with animation
//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     // Add Y axis with animation
//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight)
//       .attr("height", 0)
//       .style("cursor", "pointer")
//       .transition()
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     // Add hover effects after animation
//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];
//         const mainCategory = d.data[categoryField];
//         const totalValue = keys.reduce(
//           (sum, key) => sum + Number(d.data[key]),
//           0
//         );
//         const percentage = ((value / totalValue) * 100).toFixed(1);

//         // Get all values for this category
//         const categoryValues = keys.map((key) => ({
//           key,
//           value: Number(d.data[key]),
//           color: colorScale(key),
//         }));

//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("opacity", 0.7)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");

//         if (popupRef.current) {
//           const rect = this.getBoundingClientRect();
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;

//           const absoluteTop = rect.top + scrollTop;
//           const absoluteLeft = rect.left + scrollLeft;

//           popupRef.current.style.visibility = "visible";
//           popupRef.current.innerHTML = `
//             <div style="margin-bottom: 4px">
//               <strong>${category}</strong>
//             </div>
//             <div>Count: ${value.toLocaleString()}</div>
//           `;

//           popupRef.current.style.top = `${absoluteTop - 10}px`;
//           popupRef.current.style.left = `${absoluteLeft + rect.width / 2}px`;
//         }

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "visible";
//           tooltipRef.current.innerHTML = `
//             <div style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px">
//               <strong style="font-size: 16px">${mainCategory}</strong>
//             </div>
//             <div style="background: ${colorScale(
//               category
//             )}20; padding: 8px; margin: -4px; margin-bottom: 8px">
//               <strong style="color: ${colorScale(
//                 category
//               )}">${category}</strong>
//               <div style="margin-top: 4px">
//                 Count: ${value.toLocaleString()}
//                 <br>
//                 Share: ${percentage}%
//               </div>
//             </div>
//             <div style="font-size: 12px; color: #666">
//               <strong>Stack Breakdown:</strong>
//               ${categoryValues
//                 .map(
//                   (item) => `
//                   <div style="display: flex; justify-content: space-between; margin-top: 4px">
//                     <span style="color: ${item.color}">${item.key}</span>
//                     <span>${item.value.toLocaleString()}</span>
//                   </div>
//                 `
//                 )
//                 .join("")}
//               <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee">
//                 Total: ${totalValue.toLocaleString()}
//               </div>
//             </div>
//           `;

//           const tooltipWidth = tooltipRef.current.offsetWidth;
//           const tooltipHeight = tooltipRef.current.offsetHeight;
//           const padding = 10;

//           let tooltipLeft = event.pageX + padding;
//           let tooltipTop = event.pageY - tooltipHeight - padding;

//           if (tooltipLeft + tooltipWidth > window.innerWidth) {
//             tooltipLeft = event.pageX - tooltipWidth - padding;
//           }

//           if (tooltipTop < 0) {
//             tooltipTop = event.pageY + padding;
//           }

//           tooltipRef.current.style.top = `${tooltipTop}px`;
//           tooltipRef.current.style.left = `${tooltipLeft}px`;
//         }
//       })
//       .on("mousemove", (event) => {
//         if (tooltipRef.current) {
//           const tooltipWidth = tooltipRef.current.offsetWidth;
//           const tooltipHeight = tooltipRef.current.offsetHeight;
//           const padding = 10;

//           let left = event.pageX + padding;
//           let top = event.pageY - tooltipHeight - padding;

//           if (left + tooltipWidth > window.innerWidth) {
//             left = event.pageX - tooltipWidth - padding;
//           }

//           if (top < 0) {
//             top = event.pageY + padding;
//           }

//           tooltipRef.current.style.top = `${top}px`;
//           tooltipRef.current.style.left = `${left}px`;
//         }
//       })
//       .on("mouseout", function () {
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("opacity", 1)
//           .style("stroke", "none");

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "hidden";
//         }
//         if (popupRef.current) {
//           popupRef.current.style.visibility = "hidden";
//         }
//       });

//     // Add title with animation
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add legend with animation
//     const legendGroup = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .style("opacity", 0);

//     const legendItems = legendGroup
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legendItems
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale);

//     legendItems
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     legendGroup
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);

//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//       }
//       if (popupRef.current && popupRef.current.parentNode) {
//         popupRef.current.parentNode.removeChild(popupRef.current);
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// const chartStyles = {
//   tooltip: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "12px",
//     border: "1px solid #ccc",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "14px",
//     minWidth: "200px",
//   },
//   popupInfo: {
//     position: "absolute",
//     visibility: "hidden",
//     backgroundColor: "rgba(255, 255, 255, 0.95)",
//     padding: "8px 12px",
//     border: "1px solid #ddd",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "12px",
//     fontWeight: "bold",
//     transform: "translate(-50%, -100%)",
//     minWidth: "100px",
//     textAlign: "center",
//   },
// };

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);
//   const popupRef = useRef<HTMLDivElement | null>(null);
//   const containerRef = useRef<HTMLDivElement>(null);

//   useEffect(() => {
//     if (!chartRef.current || !containerRef.current) return;

//     if (!tooltipRef.current) {
//       const tooltip = document.createElement("div");
//       Object.assign(tooltip.style, chartStyles.tooltip);
//       document.body.appendChild(tooltip);
//       tooltipRef.current = tooltip;
//     }

//     if (!popupRef.current) {
//       const popup = document.createElement("div");
//       Object.assign(popup.style, chartStyles.popupInfo);
//       containerRef.current.appendChild(popup);
//       popupRef.current = popup;
//     }

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     // Animation duration
//     const animationDuration = 800;
//     const animationDelay = 100;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     // Add X axis with animation
//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     // Add Y axis with animation
//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight)
//       .attr("height", 0)
//       .style("cursor", "pointer")
//       .transition()
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     // Add hover effects after animation
//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];
//         const mainCategory = d.data[categoryField];
//         const totalValue = keys.reduce(
//           (sum, key) => sum + Number(d.data[key]),
//           0
//         );
//         const percentage = ((value / totalValue) * 100).toFixed(1);

//         // Get all values for this category
//         const categoryValues = keys.map((key) => ({
//           key,
//           value: Number(d.data[key]),
//           color: colorScale(key),
//         }));

//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("opacity", 0.7)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");

//         if (popupRef.current) {
//           const rect = this.getBoundingClientRect();
//           const svgRect = chartRef.current!.getBoundingClientRect();

//           popupRef.current.style.visibility = "visible";
//           popupRef.current.innerHTML = `
//             <div style="color: ${colorScale(category)}">
//               ${category}<br>
//               ${value.toLocaleString()}
//             </div>
//           `;

//           const xPos = rect.left - svgRect.left + rect.width / 2;
//           const yPos = rect.top - svgRect.top;

//           popupRef.current.style.left = `${xPos}px`;
//           popupRef.current.style.top = `${yPos - 10}px`;
//         }

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "visible";
//           tooltipRef.current.innerHTML = `
//             <div style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px">
//               <strong style="font-size: 16px">${mainCategory}</strong>
//             </div>
//             <div style="background: ${colorScale(
//               category
//             )}20; padding: 8px; margin: -4px; margin-bottom: 8px">
//               <strong style="color: ${colorScale(
//                 category
//               )}">${category}</strong>
//               <div style="margin-top: 4px">
//                 Count: ${value.toLocaleString()}
//                 <br>
//                 Share: ${percentage}%
//               </div>
//             </div>
//             <div style="font-size: 12px; color: #666">
//               <strong>Stack Breakdown:</strong>
//               ${categoryValues
//                 .map(
//                   (item) => `
//                   <div style="display: flex; justify-content: space-between; margin-top: 4px">
//                     <span style="color: ${item.color}">${item.key}</span>
//                     <span>${item.value.toLocaleString()}</span>
//                   </div>
//                 `
//                 )
//                 .join("")}
//               <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee">
//                 Total: ${totalValue.toLocaleString()}
//               </div>
//             </div>
//           `;

//           const tooltipWidth = tooltipRef.current.offsetWidth;
//           const tooltipHeight = tooltipRef.current.offsetHeight;
//           const padding = 10;

//           let tooltipLeft = event.pageX + padding;
//           let tooltipTop = event.pageY - tooltipHeight - padding;

//           if (tooltipLeft + tooltipWidth > window.innerWidth) {
//             tooltipLeft = event.pageX - tooltipWidth - padding;
//           }

//           if (tooltipTop < 0) {
//             tooltipTop = event.pageY + padding;
//           }

//           tooltipRef.current.style.top = `${tooltipTop}px`;
//           tooltipRef.current.style.left = `${tooltipLeft}px`;
//         }
//       })
//       .on("mousemove", (event) => {
//         if (tooltipRef.current) {
//           const tooltipWidth = tooltipRef.current.offsetWidth;
//           const tooltipHeight = tooltipRef.current.offsetHeight;
//           const padding = 10;

//           let left = event.pageX + padding;
//           let top = event.pageY - tooltipHeight - padding;

//           if (left + tooltipWidth > window.innerWidth) {
//             left = event.pageX - tooltipWidth - padding;
//           }

//           if (top < 0) {
//             top = event.pageY + padding;
//           }

//           tooltipRef.current.style.top = `${top}px`;
//           tooltipRef.current.style.left = `${left}px`;
//         }
//       })
//       .on("mouseout", function () {
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("opacity", 1)
//           .style("stroke", "none");

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "hidden";
//         }
//         if (popupRef.current) {
//           popupRef.current.style.visibility = "hidden";
//         }
//       });

//     // Add title with animation
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add legend with animation
//     const legendGroup = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .style("opacity", 0);

//     const legendItems = legendGroup
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legendItems
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale);

//     legendItems
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     legendGroup
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);

//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//       }
//       if (popupRef.current && popupRef.current.parentNode) {
//         popupRef.current.parentNode.removeChild(popupRef.current);
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div ref={containerRef} className="w-full h-full relative">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// const chartStyles = {
//   tooltip: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "8px 12px",
//     border: "1px solid #ddd",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 1000,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "14px",
//     minWidth: "100px",
//     textAlign: "center",
//   },
// };

// const calculateTooltipPosition = (
//   elementRect: DOMRect,
//   tooltipElement: HTMLElement,
//   scrollLeft: number,
//   scrollTop: number
// ) => {
//   const viewportWidth = window.innerWidth;
//   const viewportHeight = window.innerHeight;
//   const tooltipWidth = tooltipElement.offsetWidth;
//   const tooltipHeight = tooltipElement.offsetHeight;

//   let tooltipX = elementRect.left + elementRect.width / 2;
//   let tooltipY = elementRect.top - 10;
//   let transform = "translate(-50%, -100%)";

//   if (tooltipY - tooltipHeight < 0) {
//     tooltipY = elementRect.bottom + 10;
//     transform = "translate(-50%, 0)";
//   }

//   const tooltipLeft = tooltipX - tooltipWidth / 2;
//   const tooltipRight = tooltipX + tooltipWidth / 2;

//   if (tooltipLeft < 0) {
//     tooltipX = tooltipWidth / 2;
//   } else if (tooltipRight > viewportWidth) {
//     tooltipX = viewportWidth - tooltipWidth / 2;
//   }

//   return {
//     left: `${tooltipX + scrollLeft}px`,
//     top: `${tooltipY + scrollTop}px`,
//     transform,
//   };
// };

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     if (!tooltipRef.current) {
//       const tooltip = document.createElement("div");
//       Object.assign(tooltip.style, chartStyles.tooltip);
//       document.body.appendChild(tooltip);
//       tooltipRef.current = tooltip;
//     }

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     // Animation duration
//     const animationDuration = 800;
//     const animationDelay = 100;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     // Add X axis with animation
//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     // Add Y axis with animation
//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight)
//       .attr("height", 0)
//       .style("cursor", "pointer")
//       .transition()
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     // Add hover effects after animation
//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const count = d[1] - d[0];

//         d3.select(this).transition().duration(200).style("opacity", 0.7);

//         if (tooltipRef.current) {
//           tooltipRef.current.innerHTML = `
//             <div style="font-weight: bold">${category}</div>
//             <div>Count: ${count}</div>
//           `;

//           const elementRect = this.getBoundingClientRect();
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;

//           const position = calculateTooltipPosition(
//             elementRect,
//             tooltipRef.current,
//             scrollLeft,
//             scrollTop
//           );

//           Object.assign(tooltipRef.current.style, {
//             visibility: "visible",
//             left: position.left,
//             top: position.top,
//             transform: position.transform,
//           });
//         }
//       })
//       .on("mousemove", function (event) {
//         if (tooltipRef.current) {
//           const elementRect = this.getBoundingClientRect();
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;

//           const position = calculateTooltipPosition(
//             elementRect,
//             tooltipRef.current,
//             scrollLeft,
//             scrollTop
//           );

//           Object.assign(tooltipRef.current.style, {
//             left: position.left,
//             top: position.top,
//             transform: position.transform,
//           });
//         }
//       })
//       .on("mouseout", function () {
//         d3.select(this).transition().duration(200).style("opacity", 1);

//         if (tooltipRef.current) {
//           tooltipRef.current.style.visibility = "hidden";
//         }
//       });

//     // Add title with animation
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add legend with animation
//     const legendGroup = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .style("opacity", 0);

//     const legendItems = legendGroup
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legendItems
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale);

//     legendItems
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     legendGroup
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);

//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// const chartStyles = {
//   tooltip: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "8px 12px",
//     border: "1px solid #ddd",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 9999,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "14px",
//     minWidth: "120px",
//     textAlign: "left",
//     color: "#333",
//     lineHeight: "1.5",
//   },
// };

// const calculateTooltipPosition = (
//   elementRect: DOMRect,
//   tooltipElement: HTMLElement,
//   scrollLeft: number,
//   scrollTop: number
// ) => {
//   const viewportWidth = window.innerWidth;
//   const viewportHeight = window.innerHeight;
//   const tooltipWidth = tooltipElement.offsetWidth;
//   const tooltipHeight = tooltipElement.offsetHeight;

//   let tooltipX = elementRect.left + elementRect.width / 2;
//   let tooltipY = elementRect.top - 10;
//   let transform = "translate(-50%, -100%)";

//   if (tooltipY - tooltipHeight < 0) {
//     tooltipY = elementRect.bottom + 10;
//     transform = "translate(-50%, 0)";
//   }

//   const tooltipLeft = tooltipX - tooltipWidth / 2;
//   const tooltipRight = tooltipX + tooltipWidth / 2;

//   if (tooltipLeft < 0) {
//     tooltipX = tooltipWidth / 2;
//   } else if (tooltipRight > viewportWidth) {
//     tooltipX = viewportWidth - tooltipWidth / 2;
//   }

//   return {
//     left: `${tooltipX + scrollLeft}px`,
//     top: `${tooltipY + scrollTop}px`,
//     transform,
//   };
// };

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     if (!tooltipRef.current) {
//       const tooltip = document.createElement("div");
//       Object.assign(tooltip.style, chartStyles.tooltip);
//       document.body.appendChild(tooltip);
//       tooltipRef.current = tooltip;
//     }

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     const animationDuration = 800;
//     const animationDelay = 100;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     // Add category groups for hover effects
//     const categoryGroups = svg
//       .selectAll("g.category-group")
//       .data(data)
//       .join("g")
//       .attr("class", "category-group")
//       .attr(
//         "transform",
//         (d) => `translate(${xScale(d[categoryField] as string)},0)`
//       );

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight)
//       .attr("height", 0)
//       .style("cursor", "pointer")
//       .style("stroke", "none")
//       .style("stroke-width", "0")
//       .attr("data-category", (d) => d.data[categoryField])
//       .transition()
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     // Modified hover effects
//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];
//         const regionCategory = d.data[categoryField];

//         // Calculate total and percentage
//         const total = keys.reduce((sum, key) => sum + Number(d.data[key]), 0);
//         const percentage = ((value / total) * 100).toFixed(1);

//         // Add border effect to the bar
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");

//         // Highlight legend
//         legendGroup
//           .selectAll("g")
//           .filter((legendKey) => legendKey === category)
//           .select("rect")
//           .transition()
//           .duration(200)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");

//         if (tooltipRef.current) {
//           console.log(
//             "tooltipRef.current.innerHTML",
//             tooltipRef.current.innerHTML
//           );
//           tooltipRef.current.innerHTML = `
//             <div style="font-weight: bold; margin-bottom: 4px; color: #000;">
//               ${category}
//             </div>
//             <div style="margin-bottom: 4px; color: #666;">
//               ${regionCategory}
//             </div>
//             <div style="color: #333;">
//               Value: ${value.toLocaleString()}
//             </div>
//             <div style="color: #333;">
//               Percentage: ${percentage}%
//             </div>
//           `;

//           const elementRect = this.getBoundingClientRect();
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;

//           const position = calculateTooltipPosition(
//             elementRect,
//             tooltipRef.current,
//             scrollLeft,
//             scrollTop
//           );

//           Object.assign(tooltipRef.current.style, {
//             visibility: "visible",
//             left: position.left,
//             top: position.top,
//             transform: position.transform,
//             opacity: "1",
//             transition: "opacity 0.2s",
//           });
//         }
//       })
//       .on("mouseout", function (event, d) {
//         // Remove border effect
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("stroke", "none")
//           .style("stroke-width", "0");

//         // Remove legend highlight
//         legendGroup
//           .selectAll("g")
//           .select("rect")
//           .transition()
//           .duration(200)
//           .style("stroke", "none")
//           .style("stroke-width", "0");

//         // Hide tooltip with fade effect
//         if (tooltipRef.current) {
//           tooltipRef.current.style.opacity = "0";
//           setTimeout(() => {
//             if (tooltipRef.current) {
//               tooltipRef.current.style.visibility = "hidden";
//             }
//           }, 200);
//         }
//       })
//       .on("mousemove", function (event) {
//         if (tooltipRef.current) {
//           const elementRect = this.getBoundingClientRect();
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;

//           const position = calculateTooltipPosition(
//             elementRect,
//             tooltipRef.current,
//             scrollLeft,
//             scrollTop
//           );

//           Object.assign(tooltipRef.current.style, {
//             left: position.left,
//             top: position.top,
//             transform: position.transform,
//           });
//         }
//       });

//     // Add title
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add legend
//     const legendGroup = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .style("opacity", 0);

//     const legendItems = legendGroup
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legendItems
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale)
//       .style("stroke", "none")
//       .style("stroke-width", "0");

//     legendItems
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     legendGroup
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);

//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// const chartStyles = {
//   tooltip: {
//     position: "fixed",
//     visibility: "hidden",
//     backgroundColor: "white",
//     padding: "8px 12px",
//     border: "1px solid #ddd",
//     borderRadius: "4px",
//     pointerEvents: "none",
//     zIndex: 9999,
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//     fontSize: "14px",
//     minWidth: "120px",
//     textAlign: "left",
//     color: "#333",
//     lineHeight: "1.5",
//   },
// };

// const calculateTooltipPosition = (
//   elementRect: DOMRect,
//   tooltipElement: HTMLElement,
//   scrollLeft: number,
//   scrollTop: number
// ) => {
//   const viewportWidth = window.innerWidth;
//   const viewportHeight = window.innerHeight;
//   const tooltipWidth = tooltipElement.offsetWidth;
//   const tooltipHeight = tooltipElement.offsetHeight;

//   let tooltipX = elementRect.left + elementRect.width / 2;
//   let tooltipY = elementRect.top - 10;
//   let transform = "translate(-50%, -100%)";

//   if (tooltipY - tooltipHeight < 0) {
//     tooltipY = elementRect.bottom + 10;
//     transform = "translate(-50%, 0)";
//   }

//   const tooltipLeft = tooltipX - tooltipWidth / 2;
//   const tooltipRight = tooltipX + tooltipWidth / 2;

//   if (tooltipLeft < 0) {
//     tooltipX = tooltipWidth / 2;
//   } else if (tooltipRight > viewportWidth) {
//     tooltipX = viewportWidth - tooltipWidth / 2;
//   }

//   return {
//     left: `${tooltipX + scrollLeft}px`,
//     top: `${tooltipY + scrollTop}px`,
//     transform,
//   };
// };

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     if (!tooltipRef.current) {
//       const tooltip = document.createElement("div");
//       Object.assign(tooltip.style, chartStyles.tooltip);
//       document.body.appendChild(tooltip);
//       tooltipRef.current = tooltip;
//     }

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     const animationDuration = 800;
//     const animationDelay = 100;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     const categoryGroups = svg
//       .selectAll("g.category-group")
//       .data(data)
//       .join("g")
//       .attr("class", "category-group")
//       .attr(
//         "transform",
//         (d) => `translate(${xScale(d[categoryField] as string)},0)`
//       );

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight)
//       .attr("height", 0)
//       .style("cursor", "pointer")
//       .style("stroke", "none")
//       .style("stroke-width", "0")
//       .attr("data-category", (d) => d.data[categoryField])
//       .transition()
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];
//         const regionCategory = d.data[categoryField];

//         // Calculate total and percentage
//         const total = keys.reduce((sum, key) => sum + Number(d.data[key]), 0);
//         const percentage = ((value / total) * 100).toFixed(1);

//         // Console logging
//         console.group("Bar Hover Information");
//         console.log("Category:", category);
//         console.log("Region/Category:", regionCategory);
//         console.log("Value:", value.toLocaleString());
//         console.log("Total:", total.toLocaleString());
//         console.log("Percentage:", `${percentage}%`);
//         console.log("Raw Data:", d.data);
//         console.log("Y0:", d[0]);
//         console.log("Y1:", d[1]);
//         console.log("Stack Position:", d3.select(this.parentNode).datum());
//         console.groupEnd();

//         // please make the above console log information shown in the rect bar

//         // Add border effect to the bar
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");

//         // Highlight legend
//         legendGroup
//           .selectAll("g")
//           .filter((legendKey) => legendKey === category)
//           .select("rect")
//           .transition()
//           .duration(200)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");

//         if (tooltipRef.current) {
//           tooltipRef.current.innerHTML = `
//             <div style="font-weight: bold; margin-bottom: 4px; color: #000;">
//               ${category}
//             </div>
//             <div style="margin-bottom: 4px; color: #666;">
//               ${regionCategory}
//             </div>
//             <div style="color: #333;">
//               Value: ${value.toLocaleString()}
//             </div>
//             <div style="color: #333;">
//               Percentage: ${percentage}%
//             </div>
//           `;

//           const elementRect = this.getBoundingClientRect();
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;

//           const position = calculateTooltipPosition(
//             elementRect,
//             tooltipRef.current,
//             scrollLeft,
//             scrollTop
//           );

//           Object.assign(tooltipRef.current.style, {
//             visibility: "visible",
//             left: position.left,
//             top: position.top,
//             transform: position.transform,
//             opacity: "1",
//             transition: "opacity 0.2s",
//           });
//         }
//       })
//       .on("mouseout", function (event, d) {
//         // Remove border effect
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("stroke", "none")
//           .style("stroke-width", "0");

//         // Remove legend highlight
//         legendGroup
//           .selectAll("g")
//           .select("rect")
//           .transition()
//           .duration(200)
//           .style("stroke", "none")
//           .style("stroke-width", "0");

//         // Hide tooltip with fade effect
//         if (tooltipRef.current) {
//           tooltipRef.current.style.opacity = "0";
//           setTimeout(() => {
//             if (tooltipRef.current) {
//               tooltipRef.current.style.visibility = "hidden";
//             }
//           }, 200);
//         }

//         // Log mouseout event
//         console.log("Mouse out from bar");
//       })
//       .on("mousemove", function (event) {
//         if (tooltipRef.current) {
//           const elementRect = this.getBoundingClientRect();
//           const scrollLeft =
//             window.pageXOffset || document.documentElement.scrollLeft;
//           const scrollTop =
//             window.pageYOffset || document.documentElement.scrollTop;

//           const position = calculateTooltipPosition(
//             elementRect,
//             tooltipRef.current,
//             scrollLeft,
//             scrollTop
//           );

//           Object.assign(tooltipRef.current.style, {
//             left: position.left,
//             top: position.top,
//             transform: position.transform,
//           });
//         }
//       });

//     // Add title
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add legend
//     const legendGroup = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .style("opacity", 0);

//     const legendItems = legendGroup
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legendItems
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale)
//       .style("stroke", "none")
//       .style("stroke-width", "0");

//     legendItems
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     legendGroup
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);

//     return () => {
//       if (tooltipRef.current && tooltipRef.current.parentNode) {
//         tooltipRef.current.parentNode.removeChild(tooltipRef.current);
//       }
//     };
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     const animationDuration = 800;
//     const animationDelay = 100;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     // Add a group for the hover info
//     const hoverInfo = svg
//       .append("g")
//       .attr("class", "hover-info")
//       .style("opacity", 0)
//       .style("pointer-events", "none");

//     // Add background rect for hover info
//     hoverInfo
//       .append("rect")
//       .attr("class", "info-background")
//       .attr("rx", 4)
//       .attr("ry", 4)
//       .attr("fill", "white")
//       .attr("stroke", "#ddd")
//       .attr("stroke-width", 1);

//     // Add text elements for hover info
//     const hoverTexts = hoverInfo
//       .append("g")
//       .attr("class", "info-texts")
//       .attr("fill", "#333");

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     const categoryGroups = svg
//       .selectAll("g.category-group")
//       .data(data)
//       .join("g")
//       .attr("class", "category-group")
//       .attr(
//         "transform",
//         (d) => `translate(${xScale(d[categoryField] as string)},0)`
//       );

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight)
//       .attr("height", 0)
//       .style("cursor", "pointer")
//       .style("stroke", "none")
//       .style("stroke-width", "0")
//       .attr("data-category", (d) => d.data[categoryField])
//       .transition()
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];
//         const regionCategory = d.data[categoryField];
//         const total = keys.reduce((sum, key) => sum + Number(d.data[key]), 0);
//         const percentage = ((value / total) * 100).toFixed(1);

//         // Get position of current rect
//         const rectX = parseFloat(d3.select(this).attr("x"));
//         const rectY = parseFloat(d3.select(this).attr("y"));

//         // Clear previous text
//         hoverTexts.selectAll("*").remove();

//         // Add new text elements
//         const texts = [
//           `Category: ${category}`,
//           `Region: ${regionCategory}`,
//           `Value: ${value.toLocaleString()}`,
//           `Total: ${total.toLocaleString()}`,
//           `Percentage: ${percentage}%`,
//           // `Y-Range: ${d[0].toFixed(1)} - ${d[1].toFixed(1)}`,
//         ];

//         texts.forEach((text, i) => {
//           hoverTexts
//             .append("text")
//             .attr("x", 10)
//             .attr("y", 20 + i * 20)
//             .text(text)
//             .attr("font-size", "12px")
//             .attr("font-family", "Arial");
//         });

//         // Get bounds of text group
//         const textBounds = hoverTexts.node()?.getBBox();
//         if (textBounds) {
//           // Update background rect size and position
//           hoverInfo
//             .select(".info-background")
//             .attr("width", textBounds.width + 20)
//             .attr("height", textBounds.height + 20);

//           // Position hover info near the rect but not overlapping
//           let infoX = rectX;
//           let infoY = rectY - (textBounds.height + 30);

//           // Adjust if would go off screen
//           if (infoY < 0) {
//             infoY = rectY + 30; // Show below instead
//           }
//           if (infoX + textBounds.width > innerWidth) {
//             infoX = innerWidth - textBounds.width - 20;
//           }

//           hoverInfo
//             .attr("transform", `translate(${infoX},${infoY})`)
//             .transition()
//             .duration(200)
//             .style("opacity", 1);
//         }

//         // Highlight the bar
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");

//         // Highlight legend
//         legendGroup
//           .selectAll("g")
//           .filter((legendKey) => legendKey === category)
//           .select("rect")
//           .transition()
//           .duration(200)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");
//       })
//       .on("mouseout", function () {
//         // Hide hover info
//         hoverInfo.transition().duration(200).style("opacity", 0);

//         // Remove bar highlight
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("stroke", "none")
//           .style("stroke-width", "0");

//         // Remove legend highlight
//         legendGroup
//           .selectAll("g")
//           .select("rect")
//           .transition()
//           .duration(200)
//           .style("stroke", "none")
//           .style("stroke-width", "0");
//       });

//     // Add title
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add legend
//     const legendGroup = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .style("opacity", 0);

//     const legendItems = legendGroup
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legendItems
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale)
//       .style("stroke", "none")
//       .style("stroke-width", "0");

//     legendItems
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     legendGroup
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   [key: string]: string | number;
// }

// interface StackedBarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   categoryField: string;
// }

// export const StackedBarChart = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   categoryField,
// }: StackedBarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     d3.select(chartRef.current).selectAll("*").remove();

//     const margin = { top: 60, right: 230, bottom: 100, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     const animationDuration = 800;
//     const animationDelay = 100;

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     // Add a group for the hover info
//     const hoverInfo = svg
//       .append("g")
//       .attr("class", "hover-info")
//       .style("opacity", 0)
//       .style("pointer-events", "none");

//     // Add background rect for hover info
//     hoverInfo
//       .append("rect")
//       .attr("class", "info-background")
//       .attr("rx", 4)
//       .attr("ry", 4)
//       .attr("fill", "white")
//       .attr("stroke", "#ddd")
//       .attr("stroke-width", 1);

//     // Add text elements for hover info
//     const hoverTexts = hoverInfo
//       .append("g")
//       .attr("class", "info-texts")
//       .attr("fill", "#333");

//     const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

//     const xScale = d3
//       .scaleBand()
//       .domain(data.map((d) => d[categoryField] as string))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const yScale = d3
//       .scaleLinear()
//       .domain([
//         0,
//         d3.max(data, (d) =>
//           keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
//         ) || 0,
//       ])
//       .range([innerHeight, 0]);

//     const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

//     const stackGenerator = d3.stack<any>().keys(keys);
//     const stackedData = stackGenerator(data);

//     const xAxis = svg
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .style("opacity", 0);

//     xAxis
//       .call(d3.axisBottom(xScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1)
//       .selectAll("text")
//       .attr("transform", "rotate(-45)")
//       .style("text-anchor", "end");

//     const yAxis = svg.append("g").style("opacity", 0);

//     yAxis
//       .call(d3.axisLeft(yScale))
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     const layers = svg
//       .selectAll("g.layer")
//       .data(stackedData)
//       .join("g")
//       .attr("class", "layer")
//       .attr("fill", (d) => colorScale(d.key));

//     layers
//       .selectAll("rect")
//       .data((d) => d)
//       .join("rect")
//       .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
//       .attr("width", xScale.bandwidth())
//       .attr("y", innerHeight)
//       .attr("height", 0)
//       .style("cursor", "pointer")
//       .style("stroke", "none")
//       .style("stroke-width", "0")
//       .attr("data-category", (d) => d.data[categoryField])
//       .transition()
//       .duration(animationDuration)
//       .delay((_, i) => i * animationDelay)
//       .ease(d3.easeCubicOut)
//       .attr("y", (d) => yScale(d[1]))
//       .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

//     layers
//       .selectAll("rect")
//       .on("mouseover", function (event, d) {
//         const category = d3.select(this.parentNode).datum().key;
//         const value = d[1] - d[0];
//         const regionCategory = d.data[categoryField];
//         const total = keys.reduce((sum, key) => sum + Number(d.data[key]), 0);
//         const percentage = ((value / total) * 100).toFixed(1);

//         // Get position of current rect
//         const rectX = parseFloat(d3.select(this).attr("x"));
//         const rectWidth = parseFloat(d3.select(this).attr("width"));
//         const rectY = parseFloat(d3.select(this).attr("y"));

//         // Clear previous text
//         hoverTexts.selectAll("*").remove();

//         // Add new text elements
//         const texts = [
//           `Category: ${category}`,
//           `Region: ${regionCategory}`,
//           `Value: ${value.toLocaleString()}`,
//           `Total: ${total.toLocaleString()}`,
//           `Percentage: ${percentage}%`,
//           `Y-Range: ${d[0].toFixed(1)} - ${d[1].toFixed(1)}`,
//         ];

//         texts.forEach((text, i) => {
//           hoverTexts
//             .append("text")
//             .attr("x", 10)
//             .attr("y", 20 + i * 20)
//             .text(text)
//             .attr("font-size", "12px")
//             .attr("font-family", "Arial");
//         });

//         // Get bounds of text group
//         const textBounds = hoverTexts.node()?.getBBox();
//         if (textBounds) {
//           // Update background rect size and position
//           hoverInfo
//             .select(".info-background")
//             .attr("width", textBounds.width + 20)
//             .attr("height", textBounds.height + 20);

//           // Calculate positions
//           const centerX = rectX + rectWidth / 2;
//           const availableSpaceRight = innerWidth - (rectX + rectWidth);
//           const availableSpaceLeft = rectX;
//           const textWidth = textBounds.width + 20;

//           let infoX, infoY;

//           // Determine X position
//           if (availableSpaceRight >= textWidth) {
//             // If there's enough space on the right
//             infoX = rectX + rectWidth + 10;
//           } else if (availableSpaceLeft >= textWidth) {
//             // If there's enough space on the left
//             infoX = rectX - textWidth - 10;
//           } else {
//             // Center above or below if no space on sides
//             infoX = centerX - textWidth / 2;
//           }

//           // Ensure infoX doesn't go off screen
//           infoX = Math.max(0, Math.min(infoX, innerWidth - textWidth));

//           // Determine Y position
//           const textHeight = textBounds.height + 20;
//           if (rectY > textHeight + 20) {
//             // If there's space above
//             infoY = rectY - textHeight - 10;
//           } else {
//             // Position below if no space above
//             infoY = rectY + 30;
//           }

//           // Apply the calculated position
//           hoverInfo
//             .attr("transform", `translate(${infoX},${infoY})`)
//             .transition()
//             .duration(200)
//             .style("opacity", 1);
//         }

//         // Highlight the bar
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");

//         // Highlight legend
//         legendGroup
//           .selectAll("g")
//           .filter((legendKey) => legendKey === category)
//           .select("rect")
//           .transition()
//           .duration(200)
//           .style("stroke", "#000")
//           .style("stroke-width", "2px");
//       })
//       .on("mouseout", function () {
//         // Hide hover info
//         hoverInfo.transition().duration(200).style("opacity", 0);

//         // Remove bar highlight
//         d3.select(this)
//           .transition()
//           .duration(200)
//           .style("stroke", "none")
//           .style("stroke-width", "0");

//         // Remove legend highlight
//         legendGroup
//           .selectAll("g")
//           .select("rect")
//           .transition()
//           .duration(200)
//           .style("stroke", "none")
//           .style("stroke-width", "0");
//       });

//     // Add title
//     svg
//       .append("text")
//       .attr("x", innerWidth / 2)
//       .attr("y", -20)
//       .attr("text-anchor", "middle")
//       .attr("font-size", "16px")
//       .style("opacity", 0)
//       .text(title)
//       .transition()
//       .duration(animationDuration)
//       .style("opacity", 1);

//     // Add legend
//     const legendGroup = svg
//       .append("g")
//       .attr("font-size", "12px")
//       .attr("text-anchor", "start")
//       .style("opacity", 0);

//     const legendItems = legendGroup
//       .selectAll("g")
//       .data(keys)
//       .join("g")
//       .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

//     legendItems
//       .append("rect")
//       .attr("x", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", colorScale)
//       .style("stroke", "none")
//       .style("stroke-width", "0");

//     legendItems
//       .append("text")
//       .attr("x", 20)
//       .attr("y", 7.5)
//       .attr("dy", "0.35em")
//       .text((d) => d);

//     legendGroup
//       .transition()
//       .duration(animationDuration)
//       .delay(animationDuration / 2)
//       .style("opacity", 1);
//   }, [data, width, height, title, categoryField]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} className="w-full h-full" />
//     </div>
//   );
// };

// export default StackedBarChart;

import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

interface ChartData {
  [key: string]: string | number;
}

interface StackedBarChartProps {
  data: ChartData[];
  width?: number;
  height?: number;
  title: string;
  categoryField: string;
}

export const StackedBarChart = ({
  data,
  width = 800,
  height = 500,
  title,
  categoryField,
}: StackedBarChartProps) => {
  const chartRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    d3.select(chartRef.current).selectAll("*").remove();

    const margin = { top: 60, right: 230, bottom: 100, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const animationDuration = 800;
    const animationDelay = 100;

    // Create main SVG group
    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create a separate group for chart elements
    const chartGroup = svg.append("g").attr("class", "chart-group");

    const keys = Object.keys(data[0]).filter((key) => key !== categoryField);

    const xScale = d3
      .scaleBand()
      .domain(data.map((d) => d[categoryField] as string))
      .range([0, innerWidth])
      .padding(0.1);

    const yScale = d3
      .scaleLinear()
      .domain([
        0,
        d3.max(data, (d) =>
          keys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0)
        ) || 0,
      ])
      .range([innerHeight, 0]);

    const colorScale = d3.scaleOrdinal().domain(keys).range(d3.schemeTableau10);

    const stackGenerator = d3.stack<any>().keys(keys);
    const stackedData = stackGenerator(data);

    // Add axes
    const xAxis = chartGroup
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .style("opacity", 0);

    xAxis
      .call(d3.axisBottom(xScale))
      .transition()
      .duration(animationDuration)
      .style("opacity", 1)
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");

    const yAxis = chartGroup.append("g").style("opacity", 0);

    yAxis
      .call(d3.axisLeft(yScale))
      .transition()
      .duration(animationDuration)
      .style("opacity", 1);

    // Add layers
    const layers = chartGroup
      .selectAll("g.layer")
      .data(stackedData)
      .join("g")
      .attr("class", "layer")
      .attr("fill", (d) => colorScale(d.key));

    layers
      .selectAll("rect")
      .data((d) => d)
      .join("rect")
      .attr("x", (d) => xScale(d.data[categoryField] as string) || 0)
      .attr("width", xScale.bandwidth())
      .attr("y", innerHeight)
      .attr("height", 0)
      .style("cursor", "pointer")
      .style("stroke", "none")
      .style("stroke-width", "0")
      .attr("data-category", (d) => d.data[categoryField])
      .transition()
      .duration(animationDuration)
      .delay((_, i) => i * animationDelay)
      .ease(d3.easeCubicOut)
      .attr("y", (d) => yScale(d[1]))
      .attr("height", (d) => yScale(d[0]) - yScale(d[1]));

    // Add title
    chartGroup
      .append("text")
      .attr("x", innerWidth / 2)
      .attr("y", -20)
      .attr("text-anchor", "middle")
      .attr("font-size", "16px")
      .style("opacity", 0)
      .text(title)
      .transition()
      .duration(animationDuration)
      .style("opacity", 1);

    // Add legend
    const legendGroup = chartGroup
      .append("g")
      .attr("font-size", "12px")
      .attr("text-anchor", "start")
      .style("opacity", 0);

    const legendItems = legendGroup
      .selectAll("g")
      .data(keys)
      .join("g")
      .attr("transform", (d, i) => `translate(${innerWidth + 10},${i * 20})`);

    legendItems
      .append("rect")
      .attr("x", 0)
      .attr("width", 15)
      .attr("height", 15)
      .attr("fill", colorScale)
      .style("stroke", "none")
      .style("stroke-width", "0");

    legendItems
      .append("text")
      .attr("x", 20)
      .attr("y", 7.5)
      .attr("dy", "0.35em")
      .text((d) => d);

    legendGroup
      .transition()
      .duration(animationDuration)
      .delay(animationDuration / 2)
      .style("opacity", 1);

    // Create hover info group last (will be on top)
    const hoverInfo = svg
      .append("g")
      .attr("class", "hover-info")
      .style("opacity", 0)
      .style("pointer-events", "none");

    // Add background rect for hover info
    hoverInfo
      .append("rect")
      .attr("class", "info-background")
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", "white")
      .attr("stroke", "#ddd")
      .attr("stroke-width", 1);

    // Add text elements for hover info
    const hoverTexts = hoverInfo
      .append("g")
      .attr("class", "info-texts")
      .attr("fill", "#333");

    // Add interactions
    layers
      .selectAll("rect")
      .on("mouseover", function (event, d) {
        const category = d3.select(this.parentNode).datum().key;
        const value = d[1] - d[0];
        const regionCategory = d.data[categoryField];
        const total = keys.reduce((sum, key) => sum + Number(d.data[key]), 0);
        const percentage = ((value / total) * 100).toFixed(1);

        // Get position of current rect
        const rectX = parseFloat(d3.select(this).attr("x"));
        const rectWidth = parseFloat(d3.select(this).attr("width"));
        const rectY = parseFloat(d3.select(this).attr("y"));

        // Clear previous text
        hoverTexts.selectAll("*").remove();

        // Add new text elements
        const texts = [
          `Category: ${category}`,
          `Region: ${regionCategory}`,
          `Value: ${value.toLocaleString()}`,
          `Total: ${total.toLocaleString()}`,
          `Percentage: ${percentage}%`,
          // `Y-Range: ${d[0].toFixed(1)} - ${d[1].toFixed(1)}`,
        ];

        texts.forEach((text, i) => {
          hoverTexts
            .append("text")
            .attr("x", 10)
            .attr("y", 20 + i * 20)
            .text(text)
            .attr("font-size", "12px")
            .attr("font-family", "Arial");
        });

        // Get bounds of text group
        const textBounds = hoverTexts.node()?.getBBox();
        if (textBounds) {
          // Update background rect size and position
          hoverInfo
            .select(".info-background")
            .attr("width", textBounds.width + 20)
            .attr("height", textBounds.height + 20);

          // Calculate positions
          const centerX = rectX + rectWidth / 2;
          const availableSpaceRight = innerWidth - (rectX + rectWidth);
          const availableSpaceLeft = rectX;
          const textWidth = textBounds.width + 20;

          let infoX, infoY;

          // Determine X position
          if (availableSpaceRight >= textWidth) {
            // If there's enough space on the right
            infoX = rectX + rectWidth + 10;
          } else if (availableSpaceLeft >= textWidth) {
            // If there's enough space on the left
            infoX = rectX - textWidth - 10;
          } else {
            // Center above or below if no space on sides
            infoX = centerX - textWidth / 2;
          }

          // Ensure infoX doesn't go off screen
          infoX = Math.max(0, Math.min(infoX, innerWidth - textWidth));

          // Determine Y position
          const textHeight = textBounds.height + 20;
          if (rectY > textHeight + 20) {
            // If there's space above
            infoY = rectY - textHeight - 10;
          } else {
            // Position below if no space above
            infoY = rectY + 30;
          }

          // Apply the calculated position
          hoverInfo
            .attr("transform", `translate(${infoX},${infoY})`)
            .transition()
            .duration(200)
            .style("opacity", 1);
        }

        // Highlight the bar
        d3.select(this)
          .transition()
          .duration(200)
          .style("stroke", "#000")
          .style("stroke-width", "2px");

        // Highlight legend
        legendGroup
          .selectAll("g")
          .filter((legendKey) => legendKey === category)
          .select("rect")
          .transition()
          .duration(200)
          .style("stroke", "#000")
          .style("stroke-width", "2px");
      })
      .on("mouseout", function () {
        // Hide hover info
        hoverInfo.transition().duration(200).style("opacity", 0);

        // Remove bar highlight
        d3.select(this)
          .transition()
          .duration(200)
          .style("stroke", "none")
          .style("stroke-width", "0");

        // Remove legend highlight
        legendGroup
          .selectAll("g")
          .select("rect")
          .transition()
          .duration(200)
          .style("stroke", "none")
          .style("stroke-width", "0");
      });
  }, [data, width, height, title, categoryField]);

  return (
    <div className="w-full h-full">
      <svg ref={chartRef} className="w-full h-full" />
    </div>
  );
};

export default StackedBarChart;
