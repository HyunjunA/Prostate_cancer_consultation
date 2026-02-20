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
//   selectedDateOnXaxis: DataPoint | null;
//   setSelectedDateOnXaxis: (date: DataPoint | null) => void;
//   moveCircleInStore: (direction: "left" | "right", length: number) => void;
//   index: number;
//   setIndex: (index: number) => void;
//   useCircleIndexStore: any;
//   isDarkMode: boolean;
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

// export const FluVELineChartXaxisSelector = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   id,
//   selectedDateOnXaxis,
//   setSelectedDateOnXaxis,
//   moveCircleInStore,
//   index,
//   setIndex,
//   useCircleIndexStore,
//   isDarkMode,
// }: LineChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const containerRef = useRef<HTMLDivElement>(null);

//   const [isMobile, setIsMobile] = useState(false);

//   // console.log("LineChartXaxisSelector");
//   useEffect(() => {
//     const checkScreenSize = () => {
//       setIsMobile(window.innerWidth < 768);
//     };

//     checkScreenSize();
//     window.addEventListener("resize", checkScreenSize);
//     return () => window.removeEventListener("resize", checkScreenSize);
//   }, []);

//   const margin = { top: 80, right: 120, bottom: 30, left: 80 };
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
//       .padding(0.5);

//     interactionGroup.selectAll(".selector-circle").remove();

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

//   // if there is not local storage named localIndex, set it to -1
//   useEffect(() => {
//     // if there is not local storage named localIndex, set it to -1
//     if (localStorage.getItem("localIndex") === null) {
//       localStorage.setItem("localIndex", "-1");
//     }
//   }, []);

//   const moveCircleWithzustand = (direction: "left" | "right") => {
//     moveCircleInStore(direction, data.length);
//     const newIndex = useCircleIndexStore.getState().index;

//     if (newIndex !== index) {
//       setSelectedDateOnXaxis(data[newIndex]);
//     }
//   };

//   useEffect(() => {
//     const handleKeyDown = (event: KeyboardEvent) => {
//       if (!isMobile) {
//         switch (event.key) {
//           case "ArrowLeft":
//             // moveCircle("left");
//             moveCircleWithzustand("left");
//             break;
//           case "ArrowRight":
//             // moveCircle("right");
//             moveCircleWithzustand("right");
//             break;
//         }
//       }
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     return () => window.removeEventListener("keydown", handleKeyDown);
//   }, [data, isMobile]);

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
//       const foundIndex = data.findIndex((item) => item.week_ending === d);

//       setIndex(foundIndex);
//       setSelectedDateOnXaxis(data[foundIndex]);
//     };

//     const xAxis = g
//       .append("g")
//       .attr("class", "x-axis")
//       .attr("transform", `translate(0,0)`);

//     g.append("text")
//       .attr("class", "x-axis-label")
//       .attr("text-anchor", "middle")
//       .attr("x", innerWidth / 2)
//       .attr("y", -margin.top + 15)
//       // .style("font-size", isMobile ? "14px" : chartStyles.axisLabel.fontSize)
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .style("font-family", "Arial, sans-serif")
//       .text("Week");

//     const numVisibleLabels = isMobile ? 5 : 10;
//     const visibleIndices = new Set(
//       data
//         .map((_, i) => i)
//         .filter((i) => i % Math.ceil(data.length / numVisibleLabels) === 0)
//     );

//     xAxis.call(
//       d3
//         .axisTop(xScale)
//         .tickValues(data.map((d) => d.week_ending))
//         .tickFormat((d, i) =>
//           visibleIndices.has(i) ? formatDate(d.toString()) : ""
//         )
//     );

//     xAxis
//       .select(".domain")
//       .style("stroke-width", "5")
//       .style("stroke-opacity", "0.3");

//     xAxis
//       .selectAll(".tick line")
//       .style("stroke-width", "3")
//       .style("stroke-opacity", "0.3")
//       .attr("y2", -10); // 이 부분을 추가 (음수값은 위로, 양수값은 아래로)

//     xAxis
//       .selectAll("text")
//       .style("text-anchor", "start")
//       .attr("dx", ".2em")
//       .attr("dy", "-0.5em")
//       .attr("transform", "rotate(-35)")
//       .style("font-size", isMobile ? "10px" : chartStyles.axisText.fontSize)
//       .style("font-family", "Arial, sans-serif")
//       .style("cursor", "pointer")
//       .on("click", (event, d) => {
//         event.stopPropagation();
//         handleClick(d.toString());
//       });

//     // 왼쪽 버튼 그룹
//     const leftButtonGroup = g
//       .append("g")
//       .attr("class", "left-button")
//       .attr("transform", `translate(-50, 0)`) // x축 시작점 바로 앞에 위치
//       .style("cursor", "pointer");

//     // 왼쪽 버튼 배경
//     leftButtonGroup
//       .append("rect")
//       .attr("width", 40)
//       .attr("height", 36)
//       .attr("y", -18) // 중앙 정렬을 위해 height의 절반만큼 위로
//       .attr("rx", 4) // 모서리 둥글게
//       .attr("fill", "#F8FAFC") // slate-50에 해당하는 색상
//       .attr("stroke", "#E2E8F0") // slate-200에 해당하는 색상
//       .attr("stroke-width", 1);

//     // 왼쪽 화살표
//     leftButtonGroup
//       .append("path")
//       .attr("d", "M25 0 L15 0 M15 0 L20 -5 M15 0 L20 5") // 화살표 모양
//       .attr("stroke", "#475569") // slate-600에 해당하는 색상
//       .attr("stroke-width", 2)
//       .attr("fill", "none");

//     // 오른쪽 버튼 그룹
//     const rightButtonGroup = g
//       .append("g")
//       .attr("class", "right-button")
//       .attr("transform", `translate(${innerWidth + 50}, 0)`) // x축 끝점 바로 뒤에 위치
//       .style("cursor", "pointer");

//     // 오른쪽 버튼 배경
//     rightButtonGroup
//       .append("rect")
//       .attr("width", 40)
//       .attr("height", 36)
//       .attr("x", -40) // 오른쪽 정렬을 위해 width만큼 왼쪽으로
//       .attr("y", -18) // 중앙 정렬을 위해 height의 절반만큼 위로
//       .attr("rx", 4) // 모서리 둥글게
//       .attr("fill", "#F8FAFC")
//       .attr("stroke", "#E2E8F0")
//       .attr("stroke-width", 1);

//     // 오른쪽 화살표
//     rightButtonGroup
//       .append("path")
//       .attr("d", "M-25 0 L-15 0 M-15 0 L-20 -5 M-15 0 L-20 5") // 화살표 모양
//       .attr("stroke", "#475569")
//       .attr("stroke-width", 2)
//       .attr("fill", "none");

//     // hover 효과
//     leftButtonGroup
//       .on("mouseenter", function () {
//         d3.select(this).select("rect").attr("fill", "#F1F5F9"); // slate-100
//       })
//       .on("mouseleave", function () {
//         d3.select(this).select("rect").attr("fill", "#F8FAFC"); // slate-50
//       });

//     rightButtonGroup
//       .on("mouseenter", function () {
//         d3.select(this).select("rect").attr("fill", "#F1F5F9");
//       })
//       .on("mouseleave", function () {
//         d3.select(this).select("rect").attr("fill", "#F8FAFC");
//       });

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

//     svg
//       .append("text")
//       .attr("x", width / 2)
//       .attr("y", margin.top / 2)
//       .attr("text-anchor", "middle")
//       .style("font-size", isMobile ? "16px" : chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .text(title);

//     // 업데이트된 클릭 핸들러
//     const handleLeftClick = (event: Event) => {
//       event.stopPropagation();
//       // moveCircle("left");
//       // testPlusOrMinus("left");
//       // moveCircleWithLocalStorage("left");
//       moveCircleWithzustand("left");
//     };

//     const handleRightClick = (event: Event) => {
//       event.stopPropagation();
//       // moveCircle("right");
//       // testPlusOrMinus("right");
//       // moveCircleWithLocalStorage("right");
//       moveCircleWithzustand("right");
//     };

//     leftButtonGroup.selectAll("rect, path").on("click", handleLeftClick);
//     rightButtonGroup.selectAll("rect, path").on("click", handleRightClick);

//     updateSelectionCircle();
//   }, [data, width, height, title, id, isMobile]);

//   return (
//     <div className="w-full h-full relative" ref={containerRef}>
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//       {/* {!isMobile && (
//         <>
//           <button
//             onClick={() => moveCircle("left")}
//             // // testPlusOrMinus
//             // onClick={() => testPlusOrMinus("left")}
//             className="absolute left-5 top-1/2 -translate-x-[70%] -translate-y-1/2 p-2 bg-slate-50 text-slate-600 rounded-full hover:bg-slate-100 transition-all shadow-lg hover:shadow-xl border border-slate-200"
//             aria-label="Previous date"
//           >
//             <ChevronLeft className="w-6 h-6" />
//           </button>
//           <button
//             onClick={() => moveCircle("right")}
//             // // testPlusOrMinus
//             // onClick={() => testPlusOrMinus("right")}
//             className="absolute right-12 top-1/2 translate-x-[70%] -translate-y-1/2 p-2 bg-slate-50 text-slate-600 rounded-full hover:bg-slate-100 transition-all shadow-lg hover:shadow-xl border border-slate-200"
//             aria-label="Next date"
//           >
//             <ChevronRight className="w-6 h-6" />
//           </button>
//         </>
//       )} */}
//     </div>
//   );
// };

// export default FluVELineChartXaxisSelector;

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
//   selectedDateOnXaxis: DataPoint | null;
//   setSelectedDateOnXaxis: (date: DataPoint | null) => void;
//   moveCircleInStore: (direction: "left" | "right", length: number) => void;
//   index: number;
//   setIndex: (index: number) => void;
//   useCircleIndexStore: any;
//   isDarkMode: boolean;
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

// export const FluVELineChartXaxisSelector = ({
//   data,
//   width = 800,
//   height = 500,
//   title,
//   id,
//   selectedDateOnXaxis,
//   setSelectedDateOnXaxis,
//   moveCircleInStore,
//   index,
//   setIndex,
//   useCircleIndexStore,
//   isDarkMode,
// }: LineChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const containerRef = useRef<HTMLDivElement>(null);

//   const [isMobile, setIsMobile] = useState(false);

//   useEffect(() => {
//     const checkScreenSize = () => {
//       setIsMobile(window.innerWidth < 768);
//     };

//     checkScreenSize();
//     window.addEventListener("resize", checkScreenSize);
//     return () => window.removeEventListener("resize", checkScreenSize);
//   }, []);

//   const margin = { top: 80, right: 120, bottom: 30, left: 80 };
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
//       .padding(0.5);

//     interactionGroup.selectAll(".selector-circle").remove();

//     interactionGroup
//       .append("circle")
//       .attr("class", "selector-circle")
//       .attr("cx", xScale(selectedDateOnXaxis.week_ending))
//       .attr("cy", 0)
//       .attr("r", isMobile ? 8 : 10)
//       .attr("fill", isDarkMode ? "#60A5FA" : "#2563EB")
//       .attr("stroke", isDarkMode ? "#F3F4F6" : "white")
//       .attr("stroke-width", 2);
//   };

//   useEffect(() => {
//     updateSelectionCircle();
//   }, [selectedDateOnXaxis, data, isDarkMode]);

//   useEffect(() => {
//     if (localStorage.getItem("localIndex") === null) {
//       localStorage.setItem("localIndex", "-1");
//     }
//   }, []);

//   const moveCircleWithzustand = (direction: "left" | "right") => {
//     moveCircleInStore(direction, data.length);
//     const newIndex = useCircleIndexStore.getState().index;

//     if (newIndex !== index) {
//       setSelectedDateOnXaxis(data[newIndex]);
//     }
//   };

//   useEffect(() => {
//     const handleKeyDown = (event: KeyboardEvent) => {
//       if (!isMobile) {
//         switch (event.key) {
//           case "ArrowLeft":
//             moveCircleWithzustand("left");
//             break;
//           case "ArrowRight":
//             moveCircleWithzustand("right");
//             break;
//         }
//       }
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     return () => window.removeEventListener("keydown", handleKeyDown);
//   }, [data, isMobile]);

//   useEffect(() => {
//     if (!chartRef.current) return;

//     d3.select(chartRef.current).selectAll("*").remove();

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .style("background-color", "transparent");

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
//       const foundIndex = data.findIndex((item) => item.week_ending === d);
//       setIndex(foundIndex);
//       setSelectedDateOnXaxis(data[foundIndex]);
//     };

//     const xAxis = g
//       .append("g")
//       .attr("class", "x-axis")
//       .attr("transform", `translate(0,0)`);

//     g.append("text")
//       .attr("class", "x-axis-label")
//       .attr("text-anchor", "middle")
//       .attr("x", innerWidth / 2)
//       .attr("y", -margin.top + 15)
//       .style("font-size", chartStyles.axisLabel.fontSize)
//       .style("font-family", "Arial, sans-serif")
//       .style("fill", isDarkMode ? "#F9FAFB" : "#111827")
//       .text("Week");

//     const numVisibleLabels = isMobile ? 5 : 10;
//     const visibleIndices = new Set(
//       data
//         .map((_, i) => i)
//         .filter((i) => i % Math.ceil(data.length / numVisibleLabels) === 0)
//     );

//     xAxis.call(
//       d3
//         .axisTop(xScale)
//         .tickValues(data.map((d) => d.week_ending))
//         .tickFormat((d, i) =>
//           visibleIndices.has(i) ? formatDate(d.toString()) : ""
//         )
//     );

//     xAxis
//       .select(".domain")
//       .style("stroke-width", "5")
//       .style("stroke-opacity", "0.3")
//       .style("stroke", isDarkMode ? "#9CA3AF" : "#6B7280");

//     xAxis
//       .selectAll(".tick line")
//       .style("stroke-width", "3")
//       .style("stroke-opacity", "0.3")
//       .style("stroke", isDarkMode ? "#9CA3AF" : "#6B7280")
//       .attr("y2", -10);

//     xAxis
//       .selectAll("text")
//       .style("text-anchor", "start")
//       .attr("dx", ".2em")
//       .attr("dy", "-0.5em")
//       .attr("transform", "rotate(-35)")
//       .style("font-size", isMobile ? "10px" : chartStyles.axisText.fontSize)
//       .style("font-family", "Arial, sans-serif")
//       .style("fill", isDarkMode ? "#F3F4F6" : "#111827")
//       .style("cursor", "pointer")
//       .on("click", (event, d) => {
//         event.stopPropagation();
//         handleClick(d.toString());
//       });

//     const leftButtonGroup = g
//       .append("g")
//       .attr("class", "left-button")
//       .attr("transform", `translate(-50, 0)`)
//       .style("cursor", "pointer");

//     leftButtonGroup
//       .append("rect")
//       .attr("width", 40)
//       .attr("height", 36)
//       .attr("y", -18)
//       .attr("rx", 4)
//       .attr("fill", isDarkMode ? "#374151" : "#F8FAFC")
//       .attr("stroke", isDarkMode ? "#60A5FA" : "#E2E8F0")
//       .attr("stroke-width", 1);

//     leftButtonGroup
//       .append("path")
//       .attr("d", "M25 0 L15 0 M15 0 L20 -5 M15 0 L20 5")
//       .attr("stroke", isDarkMode ? "#F3F4F6" : "#475569")
//       .attr("stroke-width", 2)
//       .attr("fill", "none");

//     const rightButtonGroup = g
//       .append("g")
//       .attr("class", "right-button")
//       .attr("transform", `translate(${innerWidth + 50}, 0)`)
//       .style("cursor", "pointer");

//     rightButtonGroup
//       .append("rect")
//       .attr("width", 40)
//       .attr("height", 36)
//       .attr("x", -40)
//       .attr("y", -18)
//       .attr("rx", 4)
//       .attr("fill", isDarkMode ? "#374151" : "#F8FAFC")
//       .attr("stroke", isDarkMode ? "#60A5FA" : "#E2E8F0")
//       .attr("stroke-width", 1);

//     rightButtonGroup
//       .append("path")
//       .attr("d", "M-25 0 L-15 0 M-15 0 L-20 -5 M-15 0 L-20 5")
//       .attr("stroke", isDarkMode ? "#F3F4F6" : "#475569")
//       .attr("stroke-width", 2)
//       .attr("fill", "none");

//     leftButtonGroup
//       .on("mouseenter", function () {
//         d3.select(this)
//           .select("rect")
//           .attr("fill", isDarkMode ? "#4B5563" : "#F1F5F9");
//       })
//       .on("mouseleave", function () {
//         d3.select(this)
//           .select("rect")
//           .attr("fill", isDarkMode ? "#374151" : "#F8FAFC");
//       });

//     rightButtonGroup
//       .on("mouseenter", function () {
//         d3.select(this)
//           .select("rect")
//           .attr("fill", isDarkMode ? "#4B5563" : "#F1F5F9");
//       })
//       .on("mouseleave", function () {
//         d3.select(this)
//           .select("rect")
//           .attr("fill", isDarkMode ? "#374151" : "#F8FAFC");
//       });

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

//     svg
//       .append("text")
//       .attr("x", width / 2)
//       .attr("y", margin.top / 2)
//       .attr("text-anchor", "middle")
//       .style("font-size", isMobile ? "16px" : chartStyles.title.fontSize)
//       .style("font-weight", chartStyles.title.fontWeight)
//       .style("fill", isDarkMode ? "#F9FAFB" : "#111827")
//       .text(title);

//     const handleLeftClick = (event: Event) => {
//       event.stopPropagation();
//       moveCircleWithzustand("left");
//     };

//     const handleRightClick = (event: Event) => {
//       event.stopPropagation();
//       moveCircleWithzustand("right");
//     };

//     leftButtonGroup.selectAll("rect, path").on("click", handleLeftClick);
//     rightButtonGroup.selectAll("rect, path").on("click", handleRightClick);

//     updateSelectionCircle();
//   }, [data, width, height, title, id, isMobile, isDarkMode]);

//   return (
//     <div
//       className={`w-full h-full relative ${
//         isDarkMode ? "bg-gray-900" : "bg-white"
//       }`}
//       ref={containerRef}
//     >
//       <svg
//         ref={chartRef}
//         id={id}
//         className={`w-full h-full ${isDarkMode ? "bg-gray-900" : "bg-white"}`}
//       />
//     </div>
//   );
// };

// export default FluVELineChartXaxisSelector;

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

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
  moveCircleInStore: (direction: "left" | "right", length: number) => void;
  index: number;
  setIndex: (index: number) => void;
  useCircleIndexStore: any;
  isDarkMode: boolean;
}

const getColors = (isDarkMode: boolean) => ({
  background: isDarkMode ? "#1F2937" : "white",
  text: isDarkMode ? "#E5E7EB" : "#111827",
  axis: isDarkMode ? "#9CA3AF" : "#6B7280",
  grid: isDarkMode ? "#4B5563" : "#E5E7EB",
  tooltip: {
    background: isDarkMode ? "#374151" : "white",
    border: isDarkMode ? "#4B5563" : "#ccc",
    text: isDarkMode ? "#E5E7EB" : "#111827",
  },
  lines: {
    negative: "#ff6b6b",
    positive: "#4ecdc4",
  },
});

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

export const FluVELineChartXaxisSelector = ({
  data,
  width = 800,
  height = 500,
  title,
  id,
  selectedDateOnXaxis,
  setSelectedDateOnXaxis,
  moveCircleInStore,
  index,
  setIndex,
  useCircleIndexStore,
  isDarkMode,
}: LineChartProps) => {
  const chartRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const colors = getColors(isDarkMode);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const margin = { top: 80, right: 175, bottom: 30, left: 80 };
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
      .padding(0.5);

    interactionGroup.selectAll(".selector-circle").remove();

    interactionGroup
      .append("circle")
      .attr("class", "selector-circle")
      .attr("cx", xScale(selectedDateOnXaxis.week_ending))
      .attr("cy", 0)
      .attr("r", isMobile ? 8 : 10)
      .attr("fill", isDarkMode ? "#60A5FA" : "#2563EB")
      .attr("stroke", isDarkMode ? "#F3F4F6" : "white")
      .attr("stroke-width", 2);
  };

  useEffect(() => {
    updateSelectionCircle();
  }, [selectedDateOnXaxis, data, isDarkMode]);

  useEffect(() => {
    if (localStorage.getItem("localIndex") === null) {
      localStorage.setItem("localIndex", "-1");
    }
  }, []);

  const moveCircleWithzustand = (direction: "left" | "right") => {
    moveCircleInStore(direction, data.length);
    const newIndex = useCircleIndexStore.getState().index;

    if (newIndex !== index) {
      setSelectedDateOnXaxis(data[newIndex]);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isMobile) {
        switch (event.key) {
          case "ArrowLeft":
            moveCircleWithzustand("left");
            break;
          case "ArrowRight":
            moveCircleWithzustand("right");
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [data, isMobile]);

  useEffect(() => {
    if (!chartRef.current) return;

    d3.select(chartRef.current).selectAll("*").remove();

    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("background-color", colors.background);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const interactionGroup = g.append("g").attr("class", "interaction-group");

    const xScale = d3
      .scalePoint()
      .domain(data.map((d) => d.week_ending))
      .range([0, innerWidth])
      .padding(0.5);

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

    function getISOWeek(date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
      const week1 = new Date(d.getFullYear(), 0, 4);
      return (
        1 +
        Math.round(
          ((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
        )
      );
    }

    function formatDateWithWeekNumber(dateStr) {
      const date = new Date(dateStr);
      const month = date.toLocaleString("en", { month: "short" });
      const day = date.getDate().toString().padStart(2, "0");
      const year = date.getFullYear();
      const weekNum = getISOWeek(date);
      return [`(${weekNum})`, `${month}-${day}-${year}`];
    }

    const handleClick = (d: string) => {
      const foundIndex = data.findIndex((item) => item.week_ending === d);
      setIndex(foundIndex);
      setSelectedDateOnXaxis(data[foundIndex]);
    };

    const xAxis = g
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,0)`);

    g.append("text")
      .attr("class", "x-axis-label")
      .attr("text-anchor", "middle")
      .attr("x", innerWidth / 2)
      .attr("y", -margin.top + 15)
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("font-family", "Arial, sans-serif")
      .style("fill", colors.text)
      .text("Week");

    const tickInterval = 3;

    const numVisibleLabels = isMobile ? 5 : 10;
    const visibleIndices = new Set(
      data.map((_, i) => i).filter((i) => i % tickInterval === 0) //
    );

    xAxis.call(
      d3
        .axisTop(xScale)
        .tickValues(data.map((d) => d.week_ending))
        .tickFormat((d, i) =>
          visibleIndices.has(i) ? formatDateWithWeekNumber(d.toString()) : ""
        )
    );

    xAxis
      .select(".domain")
      .style("stroke-width", "5")
      .style("stroke-opacity", "0.3")
      .style("stroke", colors.axis);

    xAxis
      .selectAll(".tick line")
      .style("stroke-width", "3")
      .style("stroke-opacity", "0.3")
      .style("stroke", colors.axis)
      .attr("y2", -10);

    xAxis
      .selectAll("text")
      .style("text-anchor", "middle")
      .each(function (d, i) {
        if (visibleIndices.has(i)) {
          const [weekNum, dateStr] = formatDateWithWeekNumber(d.toString());
          const text = d3.select(this);
          text.text(""); // 기존 텍스트 삭제

          // 주차 추가 (첫째 줄)
          text.append("tspan").attr("x", 0).attr("dy", "-2.5em").text(weekNum);

          // 날짜 추가 (둘째 줄)
          text.append("tspan").attr("x", 0).attr("dy", "1.5em").text(dateStr);
        }
      })
      .style("font-size", isMobile ? "10px" : chartStyles.axisText.fontSize)
      .style("font-family", "Arial, sans-serif")
      .style("fill", colors.text)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        handleClick(d.toString());
      });

    const leftButtonGroup = g
      .append("g")
      .attr("class", "left-button")
      .attr("transform", `translate(-50, 0)`)
      .style("cursor", "pointer");

    leftButtonGroup
      .append("rect")
      .attr("width", 40)
      .attr("height", 36)
      .attr("y", -18)
      .attr("rx", 4)
      .attr("fill", colors.tooltip.background)
      .attr("stroke", colors.tooltip.border)
      .attr("stroke-width", 1);

    leftButtonGroup
      .append("path")
      .attr("d", "M25 0 L15 0 M15 0 L20 -5 M15 0 L20 5")
      .attr("stroke", colors.text)
      .attr("stroke-width", 2)
      .attr("fill", "none");

    const rightButtonGroup = g
      .append("g")
      .attr("class", "right-button")
      .attr("transform", `translate(${innerWidth + 50}, 0)`)
      .style("cursor", "pointer");

    rightButtonGroup
      .append("rect")
      .attr("width", 40)
      .attr("height", 36)
      .attr("x", -40)
      .attr("y", -18)
      .attr("rx", 4)
      .attr("fill", colors.tooltip.background)
      .attr("stroke", colors.tooltip.border)
      .attr("stroke-width", 1);

    rightButtonGroup
      .append("path")
      .attr("d", "M-25 0 L-15 0 M-15 0 L-20 -5 M-15 0 L-20 5")
      .attr("stroke", colors.text)
      .attr("stroke-width", 2)
      .attr("fill", "none");

    leftButtonGroup
      .on("mouseenter", function () {
        d3.select(this).select("rect").attr("fill", colors.grid);
      })
      .on("mouseleave", function () {
        d3.select(this).select("rect").attr("fill", colors.tooltip.background);
      });

    rightButtonGroup
      .on("mouseenter", function () {
        d3.select(this).select("rect").attr("fill", colors.grid);
      })
      .on("mouseleave", function () {
        d3.select(this).select("rect").attr("fill", colors.tooltip.background);
      });

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

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", margin.top / 2)
      .attr("text-anchor", "middle")
      .style("font-size", isMobile ? "16px" : chartStyles.title.fontSize)
      .style("font-weight", chartStyles.title.fontWeight)
      .style("fill", colors.text)
      .text(title);

    const handleLeftClick = (event: Event) => {
      event.stopPropagation();
      moveCircleWithzustand("left");
    };

    const handleRightClick = (event: Event) => {
      event.stopPropagation();
      moveCircleWithzustand("right");
    };

    leftButtonGroup.selectAll("rect, path").on("click", handleLeftClick);
    rightButtonGroup.selectAll("rect, path").on("click", handleRightClick);

    updateSelectionCircle();
  }, [data, width, height, title, id, isMobile, isDarkMode]);

  return (
    <div
      className="w-full h-full relative"
      style={{ backgroundColor: colors.background }}
      ref={containerRef}
    >
      <svg
        ref={chartRef}
        id={id}
        className="w-full h-full"
        style={{ backgroundColor: colors.background }}
      />
    </div>
  );
};

export default FluVELineChartXaxisSelector;
