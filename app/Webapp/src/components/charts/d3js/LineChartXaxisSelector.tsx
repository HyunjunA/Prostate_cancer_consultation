// // import { useEffect, useRef, useState } from "react";
// // import * as d3 from "d3";

// // interface DataPoint {
// //   week_ending: string;
// // }

// // interface LineChartProps {
// //   data: DataPoint[];
// //   width?: number;
// //   height?: number;
// //   title: string;
// //   id: string;
// // }

// // const chartStyles = {
// //   title: {
// //     fontSize: "18px",
// //     fontWeight: "bold",
// //   },
// //   axisLabel: {
// //     fontSize: "17px",
// //   },
// //   axisText: {
// //     fontSize: "15px",
// //   },
// // };

// // export const LineChartXaxisSelector = ({
// //   data,
// //   width = 800,
// //   height = 400,
// //   title,
// //   id,
// // }: LineChartProps) => {
// //   const chartRef = useRef<SVGSVGElement | null>(null);
// //   const [selectedData, setSelectedData] = useState<DataPoint | null>(null);

// //   useEffect(() => {
// //     if (!chartRef.current) return;

// //     const margin = { top: 30, right: 120, bottom: 100, left: 80 };
// //     const innerWidth = width - margin.left - margin.right;
// //     const innerHeight = height - margin.top - margin.bottom;

// //     // Clear previous chart
// //     d3.select(chartRef.current).selectAll("*").remove();

// //     const svg = d3
// //       .select(chartRef.current)
// //       .attr("viewBox", `0 0 ${width} ${height}`)
// //       .attr("preserveAspectRatio", "xMidYMid meet")
// //       .style("background-color", "white");

// //     const g = svg
// //       .append("g")
// //       .attr("transform", `translate(${margin.left},${margin.top})`);

// //     // Create X scale
// //     const xScale = d3
// //       .scalePoint()
// //       .domain(data.map((d) => d.week_ending))
// //       .range([0, innerWidth])
// //       .padding(0.5);

// //     // Function to format date
// //     const formatDate = (dateStr: string) => {
// //       const date = new Date(dateStr);
// //       return date.toLocaleDateString("en-US", {
// //         year: "numeric",
// //         month: "numeric",
// //         day: "numeric",
// //       });
// //     };

// //     // Handler function for click events
// //     const handleClick = (d: string) => {
// //       const clickedData = data.find((item) => item.week_ending === d);
// //       if (clickedData) {
// //         setSelectedData(clickedData);

// //         // Remove any existing circles
// //         interactionGroup.selectAll(".selector-circle").remove();

// //         // Add new circle with animation
// //         interactionGroup
// //           .append("circle")
// //           .attr("class", "selector-circle")
// //           .attr("cx", xScale(d))
// //           .attr("cy", innerHeight)
// //           .attr("r", 0)
// //           .attr("fill", "#4169E1")
// //           .attr("stroke", "white")
// //           .attr("stroke-width", 2)
// //           .transition()
// //           .duration(300)
// //           .ease(d3.easeBounceOut)
// //           .attr("r", 10);
// //       }
// //     };

// //     // Create selection group for interactive elements
// //     const interactionGroup = g.append("g").attr("class", "interaction-group");

// //     // Add X axis with clickable labels
// //     const xAxis = g
// //       .append("g")
// //       .attr("class", "x-axis")
// //       .attr("transform", `translate(0,${innerHeight})`);

// //     xAxis.call(
// //       d3.axisBottom(xScale).tickFormat((d) => formatDate(d.toString()))
// //     );

// //     // Add click event to tick labels
// //     xAxis
// //       .selectAll("text")
// //       .style("text-anchor", "end")
// //       .attr("dx", "-.8em")
// //       .attr("dy", ".15em")
// //       .attr("transform", "rotate(-45)")
// //       .style("font-size", chartStyles.axisText.fontSize)
// //       .style("font-family", "Arial, sans-serif")
// //       .style("cursor", "pointer")
// //       .on("click", (event, d) => {
// //         event.stopPropagation();
// //         handleClick(d.toString());
// //       });

// //     // Add invisible rectangles for better click targets
// //     data.forEach((d) => {
// //       interactionGroup
// //         .append("rect")
// //         .attr("x", (xScale(d.week_ending) || 0) - 15)
// //         .attr("y", innerHeight - 10)
// //         .attr("width", 30)
// //         .attr("height", 20)
// //         .attr("fill", "transparent")
// //         .style("cursor", "pointer")
// //         .on("click", (event) => {
// //           event.stopPropagation();
// //           handleClick(d.week_ending);
// //         });
// //     });

// //     // Add x-axis label
// //     g.append("text")
// //       .attr("class", "x-axis-label")
// //       .attr("text-anchor", "middle")
// //       .attr("x", innerWidth / 2)
// //       .attr("y", innerHeight + margin.bottom - 15)
// //       .style("font-size", chartStyles.axisLabel.fontSize)
// //       .text("Week Ending Date");

// //     // Add title
// //     svg
// //       .append("text")
// //       .attr("x", width / 2)
// //       .attr("y", margin.top / 2)
// //       .attr("text-anchor", "middle")
// //       .style("font-size", chartStyles.title.fontSize)
// //       .style("font-weight", chartStyles.title.fontWeight)
// //       .text(title);
// //   }, [data, width, height, title, id]);

// //   return (
// //     <div className="w-full h-full">
// //       <svg ref={chartRef} id={id} className="w-full h-full" />
// //     </div>
// //   );
// // };

// // export default LineChartXaxisSelector;

// import { useEffect, useRef, useState } from "react";
// import * as d3 from "d3";

// interface DataPoint {
//   week_ending: string;
// }

// interface LineChartProps {
//   data: DataPoint[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
// }

// const chartStyles = {
//   title: {
//     fontSize: "18px",
//     fontWeight: "bold",
//   },
//   axisLabel: {
//     fontSize: "17px",
//   },
//   axisText: {
//     fontSize: "15px",
//   },
// };

// export const LineChartXaxisSelector = ({
//   data,
//   width = 800,
//   height = 400,
//   title,
//   id,
// }: LineChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const [selectedData, setSelectedData] = useState<DataPoint | null>(null);
//   const [currentIndex, setCurrentIndex] = useState<number>(-1);

//   const moveCircle = (direction: "left" | "right") => {
//     const newIndex =
//       currentIndex === -1
//         ? direction === "right"
//           ? 0
//           : data.length - 1
//         : direction === "right"
//         ? Math.min(currentIndex + 1, data.length - 1)
//         : Math.max(0, currentIndex - 1);

//     if (newIndex !== currentIndex) {
//       setCurrentIndex(newIndex);
//       setSelectedData(data[newIndex]);

//       const interactionGroup = d3
//         .select(chartRef.current)
//         .select(".interaction-group");
//       const xScale = d3
//         .scalePoint()
//         .domain(data.map((d) => d.week_ending))
//         .range([0, width - margin.left - margin.right])
//         .padding(0.5);

//       // Remove existing circle
//       interactionGroup.selectAll(".selector-circle").remove();

//       // Add new circle with animation
//       interactionGroup
//         .append("circle")
//         .attr("class", "selector-circle")
//         .attr("cx", xScale(data[newIndex].week_ending))
//         .attr("cy", height - margin.bottom)
//         .attr("r", 0)
//         .attr("fill", "#4169E1")
//         .attr("stroke", "white")
//         .attr("stroke-width", 2)
//         .transition()
//         .duration(300)
//         .ease(d3.easeBounceOut)
//         .attr("r", 10);
//     }
//   };

//   useEffect(() => {
//     const handleKeyDown = (event: KeyboardEvent) => {
//       switch (event.key) {
//         case "ArrowLeft":
//           moveCircle("left");
//           break;
//         case "ArrowRight":
//           moveCircle("right");
//           break;
//       }
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     return () => window.removeEventListener("keydown", handleKeyDown);
//   }, [currentIndex, data]);

//   const margin = { top: 30, right: 120, bottom: 100, left: 80 };

//   useEffect(() => {
//     if (!chartRef.current) return;

//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     // Clear previous chart
//     d3.select(chartRef.current).selectAll("*").remove();

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .style("background-color", "white");

//     const g = svg
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     // Create selection group for interactive elements
//     const interactionGroup = g.append("g").attr("class", "interaction-group");

//     // Create X scale
//     const xScale = d3
//       .scalePoint()
//       .domain(data.map((d) => d.week_ending))
//       .range([0, innerWidth])
//       .padding(0.5);

//     // Function to format date
//     const formatDate = (dateStr: string) => {
//       const date = new Date(dateStr);
//       return date.toLocaleDateString("en-US", {
//         year: "numeric",
//         month: "numeric",
//         day: "numeric",
//       });
//     };

//     // Handler function for click events
//     const handleClick = (d: string) => {
//       const index = data.findIndex((item) => item.week_ending === d);
//       setCurrentIndex(index);
//       setSelectedData(data[index]);

//       // Remove existing circles
//       interactionGroup.selectAll(".selector-circle").remove();

//       // Add new circle with animation
//       interactionGroup
//         .append("circle")
//         .attr("class", "selector-circle")
//         .attr("cx", xScale(d))
//         .attr("cy", innerHeight)
//         .attr("r", 0)
//         .attr("fill", "#4169E1")
//         .attr("stroke", "white")
//         .attr("stroke-width", 2)
//         .transition()
//         .duration(300)
//         .ease(d3.easeBounceOut)
//         .attr("r", 10);
//     };

//     // Add X axis
//     const xAxis = g
//       .append("g")
//       .attr("class", "x-axis")
//       .attr("transform", `translate(0,${innerHeight})`);

//     xAxis.call(
//       d3.axisBottom(xScale).tickFormat((d) => formatDate(d.toString()))
//     );

//     // Add click event to tick labels
//     xAxis
//       .selectAll("text")
//       .style("text-anchor", "end")
//       .attr("dx", "-.8em")
//       .attr("dy", ".15em")
//       .attr("transform", "rotate(-45)")
//       .style("font-size", chartStyles.axisText.fontSize)
//       .style("font-family", "Arial, sans-serif")
//       .style("cursor", "pointer")
//       .on("click", (event, d) => {
//         event.stopPropagation();
//         handleClick(d.toString());
//       });

//     // Add invisible rectangles for better click targets
//     data.forEach((d) => {
//       interactionGroup
//         .append("rect")
//         .attr("x", (xScale(d.week_ending) || 0) - 15)
//         .attr("y", innerHeight - 10)
//         .attr("width", 30)
//         .attr("height", 20)
//         .attr("fill", "transparent")
//         .style("cursor", "pointer")
//         .on("click", (event) => {
//           event.stopPropagation();
//           handleClick(d.week_ending);
//         });
//     });

//     // Add x-axis label
//     g.append("text")
//       .attr("class", "x-axis-label")
//       .attr("text-anchor", "middle")
//       .attr("x", innerWidth / 2)
//       .attr("y", innerHeight + margin.bottom - 15)
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .text("Week Ending Date");

//     // Add title
//     svg
//       .append("text")
//       .attr("x", width / 2)
//       .attr("y", margin.top / 2)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .text(title);
//   }, [data, width, height, title, id]);

//   return (
//     <div className="w-full h-full" tabIndex={0}>
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//     </div>
//   );
// };

// export default LineChartXaxisSelector;

// import { useEffect, useRef, useState } from "react";
// import * as d3 from "d3";

// interface DataPoint {
//   week_ending: string;
// }

// interface LineChartProps {
//   data: DataPoint[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
// }

// const chartStyles = {
//   title: {
//     fontSize: "18px",
//     fontWeight: "bold",
//   },
//   axisLabel: {
//     fontSize: "17px",
//   },
//   axisText: {
//     fontSize: "15px",
//   },
// };

// export const LineChartXaxisSelector = ({
//   data,
//   width = 800,
//   height = 400,
//   title,
//   id,
// }: LineChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const [selectedData, setSelectedData] = useState<DataPoint | null>(null);
//   const [currentIndex, setCurrentIndex] = useState<number>(-1);

//   const margin = { top: 30, right: 120, bottom: 100, left: 80 };
//   const innerWidth = width - margin.left - margin.right;
//   const innerHeight = height - margin.top - margin.bottom;

//   const moveCircle = (direction: "left" | "right") => {
//     const newIndex =
//       currentIndex === -1
//         ? direction === "right"
//           ? 0
//           : data.length - 1
//         : direction === "right"
//         ? Math.min(currentIndex + 1, data.length - 1)
//         : Math.max(0, currentIndex - 1);

//     if (newIndex !== currentIndex) {
//       setCurrentIndex(newIndex);
//       setSelectedData(data[newIndex]);

//       const g = d3.select(chartRef.current).select("g");
//       const interactionGroup = g.select(".interaction-group");
//       const xScale = d3
//         .scalePoint()
//         .domain(data.map((d) => d.week_ending))
//         .range([0, innerWidth])
//         .padding(0.5);

//       // Remove existing circle
//       interactionGroup.selectAll(".selector-circle").remove();

//       // Add new circle with animation
//       interactionGroup
//         .append("circle")
//         .attr("class", "selector-circle")
//         .attr("cx", xScale(data[newIndex].week_ending))
//         .attr("cy", innerHeight)
//         .attr("r", 0)
//         .attr("fill", "#4169E1")
//         .attr("stroke", "white")
//         .attr("stroke-width", 2)
//         .transition()
//         .duration(300)
//         .ease(d3.easeBounceOut)
//         .attr("r", 10);
//     }
//   };

//   useEffect(() => {
//     const handleKeyDown = (event: KeyboardEvent) => {
//       switch (event.key) {
//         case "ArrowLeft":
//           moveCircle("left");
//           break;
//         case "ArrowRight":
//           moveCircle("right");
//           break;
//       }
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     return () => window.removeEventListener("keydown", handleKeyDown);
//   }, [currentIndex, data]);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     // Clear previous chart
//     d3.select(chartRef.current).selectAll("*").remove();

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .style("background-color", "white");

//     const g = svg
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     // Create selection group for interactive elements
//     const interactionGroup = g.append("g").attr("class", "interaction-group");

//     // Create X scale
//     const xScale = d3
//       .scalePoint()
//       .domain(data.map((d) => d.week_ending))
//       .range([0, innerWidth])
//       .padding(0.5);

//     // Function to format date
//     const formatDate = (dateStr: string) => {
//       const date = new Date(dateStr);
//       return date.toLocaleDateString("en-US", {
//         year: "numeric",
//         month: "numeric",
//         day: "numeric",
//       });
//     };

//     // Handler function for click events
//     const handleClick = (d: string) => {
//       const index = data.findIndex((item) => item.week_ending === d);
//       setCurrentIndex(index);
//       setSelectedData(data[index]);

//       // Remove existing circles
//       interactionGroup.selectAll(".selector-circle").remove();

//       // Add new circle with animation
//       interactionGroup
//         .append("circle")
//         .attr("class", "selector-circle")
//         .attr("cx", xScale(d))
//         .attr("cy", innerHeight)
//         .attr("r", 0)
//         .attr("fill", "#4169E1")
//         .attr("stroke", "white")
//         .attr("stroke-width", 2)
//         .transition()
//         .duration(300)
//         .ease(d3.easeBounceOut)
//         .attr("r", 10);
//     };

//     // Add X axis
//     const xAxis = g
//       .append("g")
//       .attr("class", "x-axis")
//       .attr("transform", `translate(0,${innerHeight})`);

//     xAxis.call(
//       d3.axisBottom(xScale).tickFormat((d) => formatDate(d.toString()))
//     );

//     // Add click event to tick labels
//     xAxis
//       .selectAll("text")
//       .style("text-anchor", "end")
//       .attr("dx", "-.8em")
//       .attr("dy", ".15em")
//       .attr("transform", "rotate(-45)")
//       .style("font-size", chartStyles.axisText.fontSize)
//       .style("font-family", "Arial, sans-serif")
//       .style("cursor", "pointer")
//       .on("click", (event, d) => {
//         event.stopPropagation();
//         handleClick(d.toString());
//       });

//     // Add invisible rectangles for better click targets
//     data.forEach((d) => {
//       interactionGroup
//         .append("rect")
//         .attr("x", (xScale(d.week_ending) || 0) - 15)
//         .attr("y", innerHeight - 10)
//         .attr("width", 30)
//         .attr("height", 20)
//         .attr("fill", "transparent")
//         .style("cursor", "pointer")
//         .on("click", (event) => {
//           event.stopPropagation();
//           handleClick(d.week_ending);
//         });
//     });

//     // Add x-axis label
//     g.append("text")
//       .attr("class", "x-axis-label")
//       .attr("text-anchor", "middle")
//       .attr("x", innerWidth / 2)
//       .attr("y", innerHeight + margin.bottom - 15)
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .text("Week Ending Date");

//     // Add title
//     svg
//       .append("text")
//       .attr("x", width / 2)
//       .attr("y", margin.top / 2)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .text(title);
//   }, [data, width, height, title, id]);

//   return (
//     <div className="w-full h-full" tabIndex={0}>
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//     </div>
//   );
// };

// export default LineChartXaxisSelector;

// import { useEffect, useRef, useState } from "react";
// import * as d3 from "d3";
// import { ChevronLeft, ChevronRight } from "lucide-react";

// interface DataPoint {
//   week_ending: string;
// }

// interface LineChartProps {
//   data: DataPoint[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
// }

// const chartStyles = {
//   title: {
//     fontSize: "18px",
//     fontWeight: "bold",
//   },
//   axisLabel: {
//     fontSize: "17px",
//   },
//   axisText: {
//     fontSize: "15px",
//   },
// };

// export const LineChartXaxisSelector = ({
//   data,
//   width = 800,
//   height = 400,
//   title,
//   id,
// }: LineChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const [selectedData, setSelectedData] = useState<DataPoint | null>(null);
//   const [currentIndex, setCurrentIndex] = useState<number>(-1);

//   const margin = { top: 30, right: 120, bottom: 100, left: 80 };
//   const innerWidth = width - margin.left - margin.right;
//   const innerHeight = height - margin.top - margin.bottom;

//   const moveCircle = (direction: "left" | "right") => {
//     const newIndex =
//       currentIndex === -1
//         ? direction === "right"
//           ? 0
//           : data.length - 1
//         : direction === "right"
//         ? Math.min(currentIndex + 1, data.length - 1)
//         : Math.max(0, currentIndex - 1);

//     if (newIndex !== currentIndex) {
//       setCurrentIndex(newIndex);
//       setSelectedData(data[newIndex]);

//       const g = d3.select(chartRef.current).select("g");
//       const interactionGroup = g.select(".interaction-group");
//       const xScale = d3
//         .scalePoint()
//         .domain(data.map((d) => d.week_ending))
//         .range([0, innerWidth])
//         .padding(0.5);

//       // Remove existing circle
//       interactionGroup.selectAll(".selector-circle").remove();

//       // Add new circle with animation
//       interactionGroup
//         .append("circle")
//         .attr("class", "selector-circle")
//         .attr("cx", xScale(data[newIndex].week_ending))
//         .attr("cy", innerHeight)
//         .attr("r", 0)
//         .attr("fill", "#4169E1")
//         .attr("stroke", "white")
//         .attr("stroke-width", 2)
//         .transition()
//         .duration(300)
//         .ease(d3.easeBounceOut)
//         .attr("r", 10);
//     }
//   };

//   useEffect(() => {
//     const handleKeyDown = (event: KeyboardEvent) => {
//       switch (event.key) {
//         case "ArrowLeft":
//           moveCircle("left");
//           break;
//         case "ArrowRight":
//           moveCircle("right");
//           break;
//       }
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     return () => window.removeEventListener("keydown", handleKeyDown);
//   }, [currentIndex, data]);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     // Clear previous chart
//     d3.select(chartRef.current).selectAll("*").remove();

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .style("background-color", "white");

//     const g = svg
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     // Create selection group for interactive elements
//     const interactionGroup = g.append("g").attr("class", "interaction-group");

//     // Create X scale
//     const xScale = d3
//       .scalePoint()
//       .domain(data.map((d) => d.week_ending))
//       .range([0, innerWidth])
//       .padding(0.5);

//     // Function to format date
//     const formatDate = (dateStr: string) => {
//       const date = new Date(dateStr);
//       return date.toLocaleDateString("en-US", {
//         year: "numeric",
//         month: "numeric",
//         day: "numeric",
//       });
//     };

//     // Handler function for click events
//     const handleClick = (d: string) => {
//       const index = data.findIndex((item) => item.week_ending === d);
//       setCurrentIndex(index);
//       setSelectedData(data[index]);

//       // Remove existing circles
//       interactionGroup.selectAll(".selector-circle").remove();

//       // Add new circle with animation
//       interactionGroup
//         .append("circle")
//         .attr("class", "selector-circle")
//         .attr("cx", xScale(d))
//         .attr("cy", innerHeight)
//         .attr("r", 0)
//         .attr("fill", "#4169E1")
//         .attr("stroke", "white")
//         .attr("stroke-width", 2)
//         .transition()
//         .duration(300)
//         .ease(d3.easeBounceOut)
//         .attr("r", 10);
//     };

//     // Add X axis
//     const xAxis = g
//       .append("g")
//       .attr("class", "x-axis")
//       .attr("transform", `translate(0,${innerHeight})`);

//     xAxis.call(
//       d3.axisBottom(xScale).tickFormat((d) => formatDate(d.toString()))
//     );

//     // Add click event to tick labels
//     xAxis
//       .selectAll("text")
//       .style("text-anchor", "end")
//       .attr("dx", "-.8em")
//       .attr("dy", ".15em")
//       .attr("transform", "rotate(-45)")
//       .style("font-size", chartStyles.axisText.fontSize)
//       .style("font-family", "Arial, sans-serif")
//       .style("cursor", "pointer")
//       .on("click", (event, d) => {
//         event.stopPropagation();
//         handleClick(d.toString());
//       });

//     // Add invisible rectangles for better click targets
//     data.forEach((d) => {
//       interactionGroup
//         .append("rect")
//         .attr("x", (xScale(d.week_ending) || 0) - 15)
//         .attr("y", innerHeight - 10)
//         .attr("width", 30)
//         .attr("height", 20)
//         .attr("fill", "transparent")
//         .style("cursor", "pointer")
//         .on("click", (event) => {
//           event.stopPropagation();
//           handleClick(d.week_ending);
//         });
//     });

//     // Add x-axis label
//     g.append("text")
//       .attr("class", "x-axis-label")
//       .attr("text-anchor", "middle")
//       .attr("x", innerWidth / 2)
//       .attr("y", innerHeight + margin.bottom - 15)
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .text("Week Ending Date");

//     // Add title
//     svg
//       .append("text")
//       .attr("x", width / 2)
//       .attr("y", margin.top / 2)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .text(title);
//   }, [data, width, height, title, id]);

//   return (
//     <div className="w-full h-full relative" tabIndex={0}>
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//       <button
//         onClick={() => moveCircle("left")}
//         className="absolute left-5 bottom-20 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
//         aria-label="Previous date"
//       >
//         <ChevronLeft size={24} />
//       </button>
//       <button
//         onClick={() => moveCircle("right")}
//         className="absolute right-12 bottom-20 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
//         aria-label="Next date"
//       >
//         <ChevronRight size={24} />
//       </button>
//     </div>
//   );
// };

// export default LineChartXaxisSelector;

// import { useEffect, useRef, useState } from "react";
// import * as d3 from "d3";
// import { ChevronLeft, ChevronRight } from "lucide-react";

// interface DataPoint {
//   week_ending: string;
// }

// interface LineChartProps {
//   data: DataPoint[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
// }

// const chartStyles = {
//   title: {
//     fontSize: "18px",
//     fontWeight: "bold",
//   },
//   axisLabel: {
//     fontSize: "17px",
//   },
//   axisText: {
//     fontSize: "15px",
//   },
// };

// export const LineChartXaxisSelector = ({
//   data,
//   width = 800,
//   height = 400,
//   title,
//   id,
// }: LineChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const containerRef = useRef<HTMLDivElement>(null);
//   const [selectedData, setSelectedData] = useState<DataPoint | null>(null);
//   const [currentIndex, setCurrentIndex] = useState<number>(-1);
//   const [isMobile, setIsMobile] = useState(false);

//   useEffect(() => {
//     const checkScreenSize = () => {
//       setIsMobile(window.innerWidth < 768); // md breakpoint
//     };

//     checkScreenSize();
//     window.addEventListener("resize", checkScreenSize);
//     return () => window.removeEventListener("resize", checkScreenSize);
//   }, []);

//   const margin = { top: 30, right: isMobile ? 60 : 120, bottom: 100, left: 80 };
//   const innerWidth = width - margin.left - margin.right;
//   const innerHeight = height - margin.top - margin.bottom;

//   const moveCircle = (direction: "left" | "right") => {
//     const newIndex =
//       currentIndex === -1
//         ? direction === "right"
//           ? 0
//           : data.length - 1
//         : direction === "right"
//         ? Math.min(currentIndex + 1, data.length - 1)
//         : Math.max(0, currentIndex - 1);

//     if (newIndex !== currentIndex) {
//       setCurrentIndex(newIndex);
//       setSelectedData(data[newIndex]);

//       const g = d3.select(chartRef.current).select("g");
//       const interactionGroup = g.select(".interaction-group");
//       const xScale = d3
//         .scalePoint()
//         .domain(data.map((d) => d.week_ending))
//         .range([0, innerWidth])
//         .padding(0.5);

//       interactionGroup.selectAll(".selector-circle").remove();

//       interactionGroup
//         .append("circle")
//         .attr("class", "selector-circle")
//         .attr("cx", xScale(data[newIndex].week_ending))
//         .attr("cy", innerHeight)
//         .attr("r", 0)
//         .attr("fill", "#4169E1")
//         .attr("stroke", "white")
//         .attr("stroke-width", 2)
//         .transition()
//         .duration(300)
//         .ease(d3.easeBounceOut)
//         .attr("r", 10);
//     }
//   };

//   useEffect(() => {
//     const handleKeyDown = (event: KeyboardEvent) => {
//       if (!isMobile) {
//         switch (event.key) {
//           case "ArrowLeft":
//             moveCircle("left");
//             break;
//           case "ArrowRight":
//             moveCircle("right");
//             break;
//         }
//       }
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     return () => window.removeEventListener("keydown", handleKeyDown);
//   }, [currentIndex, data, isMobile]);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     d3.select(chartRef.current).selectAll("*").remove();

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .style("background-color", "white");

//     const g = svg
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const interactionGroup = g.append("g").attr("class", "interaction-group");

//     const xScale = d3
//       .scalePoint()
//       .domain(data.map((d) => d.week_ending))
//       .range([0, innerWidth])
//       .padding(0.5);

//     const formatDate = (dateStr: string) => {
//       const date = new Date(dateStr);
//       return isMobile
//         ? date.toLocaleDateString("en-US", {
//             month: "numeric",
//             day: "numeric",
//           })
//         : date.toLocaleDateString("en-US", {
//             year: "numeric",
//             month: "numeric",
//             day: "numeric",
//           });
//     };

//     const handleClick = (d: string) => {
//       if (!isMobile) {
//         const index = data.findIndex((item) => item.week_ending === d);
//         setCurrentIndex(index);
//         setSelectedData(data[index]);

//         interactionGroup.selectAll(".selector-circle").remove();

//         interactionGroup
//           .append("circle")
//           .attr("class", "selector-circle")
//           .attr("cx", xScale(d))
//           .attr("cy", innerHeight)
//           .attr("r", 0)
//           .attr("fill", "#4169E1")
//           .attr("stroke", "white")
//           .attr("stroke-width", 2)
//           .transition()
//           .duration(300)
//           .ease(d3.easeBounceOut)
//           .attr("r", 10);
//       }
//     };

//     const xAxis = g
//       .append("g")
//       .attr("class", "x-axis")
//       .attr("transform", `translate(0,${innerHeight})`);

//     xAxis.call(
//       d3.axisBottom(xScale).tickFormat((d) => formatDate(d.toString()))
//     );

//     xAxis
//       .selectAll("text")
//       .style("text-anchor", "end")
//       .attr("dx", "-.8em")
//       .attr("dy", ".15em")
//       .attr("transform", "rotate(-45)")
//       .style("font-size", isMobile ? "12px" : chartStyles.axisText.fontSize)
//       .style("font-family", "Arial, sans-serif")
//       .style("cursor", isMobile ? "default" : "pointer")
//       .on("click", (event, d) => {
//         event.stopPropagation();
//         handleClick(d.toString());
//       });

//     if (!isMobile) {
//       data.forEach((d) => {
//         interactionGroup
//           .append("rect")
//           .attr("x", (xScale(d.week_ending) || 0) - 15)
//           .attr("y", innerHeight - 10)
//           .attr("width", 30)
//           .attr("height", 20)
//           .attr("fill", "transparent")
//           .style("cursor", "pointer")
//           .on("click", (event) => {
//             event.stopPropagation();
//             handleClick(d.week_ending);
//           });
//       });
//     }

//     g.append("text")
//       .attr("class", "x-axis-label")
//       .attr("text-anchor", "middle")
//       .attr("x", innerWidth / 2)
//       .attr("y", innerHeight + margin.bottom - 15)
//       .style("font-size", isMobile ? "14px" : chartStyles.axisLabel.fontSize)
//       .text("Week Ending Date");

//     svg
//       .append("text")
//       .attr("x", width / 2)
//       .attr("y", margin.top / 2)
//       .attr("text-anchor", "middle")
//       .style("font-size", isMobile ? "16px" : chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .text(title);
//   }, [data, width, height, title, id, isMobile]);

//   return (
//     <div className="w-full h-full relative" ref={containerRef}>
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//       {!isMobile && (
//         <>
//           <button
//             onClick={() => moveCircle("left")}
//             className="absolute left-5 bottom-20 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
//             aria-label="Previous date"
//           >
//             <ChevronLeft size={24} />
//           </button>
//           <button
//             onClick={() => moveCircle("right")}
//             className="absolute right-12 bottom-20 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
//             aria-label="Next date"
//           >
//             <ChevronRight size={24} />
//           </button>
//         </>
//       )}
//     </div>
//   );
// };

// export default LineChartXaxisSelector;

// import { useEffect, useRef, useState } from "react";
// import * as d3 from "d3";
// import { ChevronLeft, ChevronRight } from "lucide-react";

// interface DataPoint {
//   week_ending: string;
// }

// interface LineChartProps {
//   data: DataPoint[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
// }

// const chartStyles = {
//   title: {
//     fontSize: "18px",
//     fontWeight: "bold",
//   },
//   axisLabel: {
//     fontSize: "17px",
//   },
//   axisText: {
//     fontSize: "15px",
//   },
// };

// export const LineChartXaxisSelector = ({
//   data,
//   width = 800,
//   height = 400,
//   title,
//   id,
//   selectedDateOnXaxis,
//   setSelectedDateOnXaxis,
// }: LineChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const containerRef = useRef<HTMLDivElement>(null);
//   // const [selectedData, setSelectedData] = useState<DataPoint | null>(null);
//   const [currentIndex, setCurrentIndex] = useState<number>(-1);
//   const [isMobile, setIsMobile] = useState(false);

//   useEffect(() => {
//     const checkScreenSize = () => {
//       setIsMobile(window.innerWidth < 768); // md breakpoint
//     };

//     checkScreenSize();
//     window.addEventListener("resize", checkScreenSize);
//     return () => window.removeEventListener("resize", checkScreenSize);
//   }, []);

//   const margin = { top: 30, right: isMobile ? 60 : 120, bottom: 100, left: 80 };
//   const innerWidth = width - margin.left - margin.right;
//   const innerHeight = height - margin.top - margin.bottom;

//   const moveCircle = (direction: "left" | "right") => {
//     const newIndex =
//       currentIndex === -1
//         ? direction === "right"
//           ? 0
//           : data.length - 1
//         : direction === "right"
//         ? Math.min(currentIndex + 1, data.length - 1)
//         : Math.max(0, currentIndex - 1);

//     if (newIndex !== currentIndex) {
//       setCurrentIndex(newIndex);
//       setSelectedDateOnXaxis(data[newIndex]);

//       const g = d3.select(chartRef.current).select("g");
//       const interactionGroup = g.select(".interaction-group");
//       const xScale = d3
//         .scalePoint()
//         .domain(data.map((d) => d.week_ending))
//         .range([0, innerWidth])
//         .padding(0.5);

//       interactionGroup.selectAll(".selector-circle").remove();

//       interactionGroup
//         .append("circle")
//         .attr("class", "selector-circle")
//         .attr("cx", xScale(data[newIndex].week_ending))
//         .attr("cy", innerHeight)
//         .attr("r", 0)
//         .attr("fill", "#4169E1")
//         .attr("stroke", "white")
//         .attr("stroke-width", 2)
//         .transition()
//         .duration(300)
//         .ease(d3.easeBounceOut)
//         .attr("r", 10);
//     }
//   };

//   useEffect(() => {
//     const handleKeyDown = (event: KeyboardEvent) => {
//       if (!isMobile) {
//         switch (event.key) {
//           case "ArrowLeft":
//             moveCircle("left");
//             break;
//           case "ArrowRight":
//             moveCircle("right");
//             break;
//         }
//       }
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     return () => window.removeEventListener("keydown", handleKeyDown);
//   }, [currentIndex, data, isMobile]);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     d3.select(chartRef.current).selectAll("*").remove();

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .style("background-color", "white");

//     const g = svg
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const interactionGroup = g.append("g").attr("class", "interaction-group");

//     const xScale = d3
//       .scalePoint()
//       .domain(data.map((d) => d.week_ending))
//       .range([0, innerWidth])
//       .padding(0.5);

//     const formatDate = (dateStr: string) => {
//       const date = new Date(dateStr);
//       return isMobile
//         ? date.toLocaleDateString("en-US", {
//             month: "numeric",
//             day: "numeric",
//           })
//         : date.toLocaleDateString("en-US", {
//             year: "numeric",
//             month: "numeric",
//             day: "numeric",
//           });
//     };

//     const handleClick = (d: string) => {
//       const index = data.findIndex((item) => item.week_ending === d);
//       setCurrentIndex(index);
//       setSelectedDateOnXaxis(data[index]);

//       interactionGroup.selectAll(".selector-circle").remove();

//       interactionGroup
//         .append("circle")
//         .attr("class", "selector-circle")
//         .attr("cx", xScale(d))
//         .attr("cy", innerHeight)
//         .attr("r", 0)
//         .attr("fill", "#4169E1")
//         .attr("stroke", "white")
//         .attr("stroke-width", 2)
//         .transition()
//         .duration(300)
//         .ease(d3.easeBounceOut)
//         .attr("r", isMobile ? 8 : 10);
//     };

//     const xAxis = g
//       .append("g")
//       .attr("class", "x-axis")
//       .attr("transform", `translate(0,${innerHeight})`);

//     xAxis.call(
//       d3.axisBottom(xScale).tickFormat((d) => formatDate(d.toString()))
//     );

//     xAxis
//       .selectAll("text")
//       .style("text-anchor", "end")
//       .attr("dx", "-.8em")
//       .attr("dy", ".15em")
//       .attr("transform", "rotate(-45)")
//       .style("font-size", isMobile ? "12px" : chartStyles.axisText.fontSize)
//       .style("font-family", "Arial, sans-serif")
//       .style("cursor", "pointer")
//       .on("click", (event, d) => {
//         event.stopPropagation();
//         handleClick(d.toString());
//       });

//     // Add invisible rectangles for better click targets
//     data.forEach((d) => {
//       interactionGroup
//         .append("rect")
//         .attr("x", (xScale(d.week_ending) || 0) - 15)
//         .attr("y", innerHeight - 10)
//         .attr("width", 30)
//         .attr("height", 20)
//         .attr("fill", "transparent")
//         .style("cursor", "pointer")
//         .on("click", (event) => {
//           event.stopPropagation();
//           handleClick(d.week_ending);
//         });
//     });

//     g.append("text")
//       .attr("class", "x-axis-label")
//       .attr("text-anchor", "middle")
//       .attr("x", innerWidth / 2)
//       .attr("y", innerHeight + margin.bottom - 15)
//       .style("font-size", isMobile ? "14px" : chartStyles.axisLabel.fontSize);
//     // .text("Week Ending Date");

//     svg
//       .append("text")
//       .attr("x", width / 2)
//       .attr("y", margin.top / 2)
//       .attr("text-anchor", "middle")
//       .style("font-size", isMobile ? "16px" : chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .text(title);
//   }, [data, width, height, title, id, isMobile]);

//   return (
//     <div className="w-full h-full relative" ref={containerRef}>
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//       {!isMobile && (
//         <>
//           <button
//             onClick={() => moveCircle("left")}
//             className="absolute left-5 bottom-20 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
//             aria-label="Previous date"
//           >
//             <ChevronLeft size={24} />
//           </button>
//           <button
//             onClick={() => moveCircle("right")}
//             className="absolute right-12 bottom-20 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
//             aria-label="Next date"
//           >
//             <ChevronRight size={24} />
//           </button>
//         </>
//       )}
//     </div>
//   );
// };

// export default LineChartXaxisSelector;
// import { useEffect, useRef, useState } from "react";
// import * as d3 from "d3";
// import { ChevronLeft, ChevronRight } from "lucide-react";

// interface DataPoint {
//   week_ending: string;
// }

// interface LineChartProps {
//   data: DataPoint[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
//   selectedDateOnXaxis: DataPoint | null;
//   setSelectedDateOnXaxis: (date: DataPoint | null) => void;
// }

// const chartStyles = {
//   title: {
//     fontSize: "18px",
//     fontWeight: "bold",
//   },
//   axisLabel: {
//     fontSize: "17px",
//   },
//   axisText: {
//     fontSize: "15px",
//   },
// };

// export const LineChartXaxisSelector = ({
//   data,
//   width = 800,
//   height = 400,
//   title,
//   id,
//   selectedDateOnXaxis,
//   setSelectedDateOnXaxis,
// }: LineChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const containerRef = useRef<HTMLDivElement>(null);
//   const [currentIndex, setCurrentIndex] = useState<number>(-1);
//   const [isMobile, setIsMobile] = useState(false);

//   useEffect(() => {
//     const checkScreenSize = () => {
//       setIsMobile(window.innerWidth < 768);
//     };

//     checkScreenSize();
//     window.addEventListener("resize", checkScreenSize);
//     return () => window.removeEventListener("resize", checkScreenSize);
//   }, []);

//   // 버튼의 크기와 패딩을 고려한 마진 설정
//   const buttonSize = 40;
//   const margin = {
//     top: 80,
//     right: buttonSize / 2,
//     bottom: 30,
//     left: buttonSize / 2,
//   };
//   const innerWidth = width - margin.left - margin.right;
//   const innerHeight = height - margin.top - margin.bottom;

//   const updateSelectionCircle = () => {
//     if (!chartRef.current || !selectedDateOnXaxis) return;

//     const g = d3.select(chartRef.current).select("g");
//     const interactionGroup = g.select(".interaction-group");
//     const xScale = d3
//       .scalePoint()
//       .domain(data.map((d) => d.week_ending))
//       .range([0, innerWidth])
//       .padding(0);

//     // 기존 circle 제거
//     interactionGroup.selectAll(".selector-circle").remove();

//     // 새로운 circle 추가
//     interactionGroup
//       .append("circle")
//       .attr("class", "selector-circle")
//       .attr("cx", xScale(selectedDateOnXaxis.week_ending))
//       .attr("cy", 0)
//       .attr("r", isMobile ? 8 : 10)
//       .attr("fill", "#4169E1")
//       .attr("stroke", "white")
//       .attr("stroke-width", 2);
//   };

//   useEffect(() => {
//     updateSelectionCircle();
//   }, [selectedDateOnXaxis, data]);

//   const moveCircle = (direction: "left" | "right") => {
//     const newIndex =
//       currentIndex === -1
//         ? direction === "right"
//           ? 0
//           : data.length - 1
//         : direction === "right"
//         ? Math.min(currentIndex + 1, data.length - 1)
//         : Math.max(0, currentIndex - 1);

//     if (newIndex !== currentIndex) {
//       setCurrentIndex(newIndex);
//       setSelectedDateOnXaxis(data[newIndex]);
//     }
//   };

//   useEffect(() => {
//     const handleKeyDown = (event: KeyboardEvent) => {
//       if (!isMobile) {
//         switch (event.key) {
//           case "ArrowLeft":
//             moveCircle("left");
//             break;
//           case "ArrowRight":
//             moveCircle("right");
//             break;
//         }
//       }
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     return () => window.removeEventListener("keydown", handleKeyDown);
//   }, [currentIndex, data, isMobile]);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     d3.select(chartRef.current).selectAll("*").remove();

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .style("background-color", "white");

//     const g = svg
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const interactionGroup = g.append("g").attr("class", "interaction-group");

//     const xScale = d3
//       .scalePoint()
//       .domain(data.map((d) => d.week_ending))
//       .range([0, innerWidth])
//       .padding(0);

//     const formatDate = (dateStr: string) => {
//       const date = new Date(dateStr);
//       return isMobile
//         ? date.toLocaleDateString("en-US", {
//             month: "numeric",
//             day: "numeric",
//           })
//         : date.toLocaleDateString("en-US", {
//             year: "numeric",
//             month: "numeric",
//             day: "numeric",
//           });
//     };

//     const handleClick = (d: string) => {
//       const index = data.findIndex((item) => item.week_ending === d);
//       setCurrentIndex(index);
//       setSelectedDateOnXaxis(data[index]);
//     };

//     // x축 생성
//     const xAxis = g
//       .append("g")
//       .attr("class", "x-axis")
//       .attr("transform", `translate(0,0)`);

//     // X축 라벨 추가
//     g.append("text")
//       .attr("class", "x-axis-label")
//       .attr("text-anchor", "middle")
//       .attr("x", innerWidth / 2)
//       .attr("y", -margin.top + 15)
//       .style("font-size", isMobile ? "14px" : chartStyles.axisLabel.fontSize)
//       .style("font-family", "Arial, sans-serif")
//       .text("Week");

//     const numTicks = isMobile ? 5 : 10;
//     const tickValues = data
//       .filter((_, i) => i % Math.ceil(data.length / numTicks) === 0)
//       .map((d) => d.week_ending);

//     xAxis.call(
//       d3
//         .axisTop(xScale)
//         .tickValues(tickValues)
//         .tickFormat((d) => formatDate(d.toString()))
//     );

//     xAxis
//       .selectAll("text")
//       .style("text-anchor", "start")
//       .attr("dx", ".2em")
//       .attr("dy", "-0.5em")
//       .attr("transform", "rotate(-45)")
//       .style("font-size", isMobile ? "10px" : "12px")
//       .style("font-family", "Arial, sans-serif")
//       .style("cursor", "pointer")
//       .on("click", (event, d) => {
//         event.stopPropagation();
//         handleClick(d.toString());
//       });

//     // 클릭 영역
//     data.forEach((d) => {
//       interactionGroup
//         .append("rect")
//         .attr("x", (xScale(d.week_ending) || 0) - 15)
//         .attr("y", -10)
//         .attr("width", 30)
//         .attr("height", 20)
//         .attr("fill", "transparent")
//         .style("cursor", "pointer")
//         .on("click", (event) => {
//           event.stopPropagation();
//           handleClick(d.week_ending);
//         });
//     });

//     // 타이틀
//     svg
//       .append("text")
//       .attr("x", width / 2)
//       .attr("y", margin.top / 2)
//       .attr("text-anchor", "middle")
//       .style("font-size", isMobile ? "16px" : chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .text(title);

//     // 초기 circle 그리기
//     updateSelectionCircle();
//   }, [data, width, height, title, id, isMobile]);

//   return (
//     <div className="w-full h-full relative" ref={containerRef}>
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//       {!isMobile && (
//         <>
//           <button
//             onClick={() => moveCircle("left")}
//             className="absolute left-0 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
//             aria-label="Previous date"
//           >
//             <ChevronLeft size={24} />
//           </button>
//           <button
//             onClick={() => moveCircle("right")}
//             className="absolute right-0 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
//             aria-label="Next date"
//           >
//             <ChevronRight size={24} />
//           </button>
//         </>
//       )}
//     </div>
//   );
// };

// export default LineChartXaxisSelector;

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DataPoint {
  week_ending: string;
}

interface LineChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  title: string;
  id: string;
  selectedDateOnXaxis: DataPoint | null;
  setSelectedDateOnXaxis: (date: DataPoint | null) => void;
}

const chartStyles = {
  title: {
    fontSize: "18px",
    fontWeight: "bold",
  },
  axisLabel: {
    fontSize: "17px",
  },
  axisText: {
    fontSize: "15px",
  },
};

export const LineChartXaxisSelector = ({
  data,
  width = 800,
  height = 400,
  title,
  id,
  selectedDateOnXaxis,
  setSelectedDateOnXaxis,
}: LineChartProps) => {
  const chartRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // 원래 마진 설정 복원
  const margin = { top: 80, right: isMobile ? 60 : 120, bottom: 30, left: 80 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const updateSelectionCircle = () => {
    if (!chartRef.current || !selectedDateOnXaxis) return;

    const g = d3.select(chartRef.current).select("g");
    const interactionGroup = g.select(".interaction-group");
    const xScale = d3
      .scalePoint()
      .domain(data.map((d) => d.week_ending))
      .range([0, innerWidth])
      .padding(0.5); // 원래 padding 값으로 복원

    // 기존 circle 제거
    interactionGroup.selectAll(".selector-circle").remove();

    // 새로운 circle 추가
    interactionGroup
      .append("circle")
      .attr("class", "selector-circle")
      .attr("cx", xScale(selectedDateOnXaxis.week_ending))
      .attr("cy", 0)
      .attr("r", isMobile ? 8 : 10)
      .attr("fill", "#4169E1")
      .attr("stroke", "white")
      .attr("stroke-width", 2);
  };

  // selectedDateOnXaxis 변경 감지
  useEffect(() => {
    updateSelectionCircle();
  }, [selectedDateOnXaxis, data]);

  const moveCircle = (direction: "left" | "right") => {
    const newIndex =
      currentIndex === -1
        ? direction === "right"
          ? 0
          : data.length - 1
        : direction === "right"
        ? Math.min(currentIndex + 1, data.length - 1)
        : Math.max(0, currentIndex - 1);

    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
      setSelectedDateOnXaxis(data[newIndex]);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isMobile) {
        switch (event.key) {
          case "ArrowLeft":
            moveCircle("left");
            break;
          case "ArrowRight":
            moveCircle("right");
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, data, isMobile]);

  useEffect(() => {
    if (!chartRef.current) return;

    d3.select(chartRef.current).selectAll("*").remove();

    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("background-color", "white");

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const interactionGroup = g.append("g").attr("class", "interaction-group");

    const xScale = d3
      .scalePoint()
      .domain(data.map((d) => d.week_ending))
      .range([0, innerWidth])
      .padding(0.5); // 원래 padding 값으로 복원

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return isMobile
        ? date.toLocaleDateString("en-US", {
            month: "numeric",
            day: "numeric",
          })
        : date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "numeric",
            day: "numeric",
          });
    };

    const handleClick = (d: string) => {
      const index = data.findIndex((item) => item.week_ending === d);
      setCurrentIndex(index);
      setSelectedDateOnXaxis(data[index]);
    };

    // x축 생성
    const xAxis = g
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,0)`);

    // X축 라벨 추가
    g.append("text")
      .attr("class", "x-axis-label")
      .attr("text-anchor", "middle")
      .attr("x", innerWidth / 2)
      .attr("y", -margin.top + 15)
      .style("font-size", isMobile ? "14px" : chartStyles.axisLabel.fontSize)
      .style("font-family", "Arial, sans-serif")
      .text("Week");

    // 표시할 틱의 개수를 제한
    const numTicks = isMobile ? 5 : 10;
    const tickValues = data
      .filter((_, i) => i % Math.ceil(data.length / numTicks) === 0)
      .map((d) => d.week_ending);

    xAxis.call(
      d3
        .axisTop(xScale)
        .tickValues(tickValues)
        .tickFormat((d) => formatDate(d.toString()))
    );

    xAxis
      .selectAll("text")
      .style("text-anchor", "start")
      .attr("dx", ".2em")
      .attr("dy", "-0.5em")
      .attr("transform", "rotate(-45)")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("font-family", "Arial, sans-serif")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        handleClick(d.toString());
      });

    // 클릭 영역
    data.forEach((d) => {
      interactionGroup
        .append("rect")
        .attr("x", (xScale(d.week_ending) || 0) - 15)
        .attr("y", -10)
        .attr("width", 30)
        .attr("height", 20)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", (event) => {
          event.stopPropagation();
          handleClick(d.week_ending);
        });
    });

    // 타이틀
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", margin.top / 2)
      .attr("text-anchor", "middle")
      .style("font-size", isMobile ? "16px" : chartStyles.title.fontSize)
      .style("font-weight", chartStyles.title.fontWeight)
      .text(title);

    // 초기 circle 그리기
    updateSelectionCircle();
  }, [data, width, height, title, id, isMobile]);

  return (
    <div className="w-full h-full relative" ref={containerRef}>
      <svg ref={chartRef} id={id} className="w-full h-full" />
      {!isMobile && (
        <>
          <button
            onClick={() => moveCircle("left")}
            className="absolute left-5 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
            aria-label="Previous date"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={() => moveCircle("right")}
            className="absolute right-12 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
            aria-label="Next date"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>
  );
};

export default LineChartXaxisSelector;
