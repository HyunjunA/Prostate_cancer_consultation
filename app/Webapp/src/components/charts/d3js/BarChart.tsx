// import { useEffect, useRef } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   category: string;
//   count: number;
//   percentage: number;
// }

// interface BarChartProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
//   maxLabelLength?: number;
//   isDarkMode?: boolean;
// }

// const chartStyles = {
//   title: {
//     fontSize: "20px",
//     fontWeight: "bold",
//   },
//   axisLabel: {
//     fontSize: "18px",
//   },
//   axisText: {
//     fontSize: "18px",
//   },
//   legend: {
//     fontSize: "16px",
//   },
//   tooltip: {
//     fontSize: "14px",
//     padding: "8px",
//     borderRadius: "4px",
//     border: "1px solid #ddd",
//     backgroundColor: "white",
//     color: "#333",
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//   },
//   value: {
//     fontSize: "16px",
//   },
// };

// export const BarChart = ({
//   data,
//   width = 400,
//   height = 400,
//   title,
//   id,
//   maxLabelLength = 15,
//   isDarkMode = false,
// }: BarChartProps) => {
//   const chartRef = useRef<SVGSVGElement | null>(null);

//   const calculateAxisRange = (data: ChartData[]) => {
//     const maxValue = d3.max(data, (d) => d.count) || 0;
//     const minValue = d3.min(data, (d) => d.count) || 0;
//     return maxValue === minValue
//       ? { min: 0, max: maxValue * 1.5 }
//       : { min: 0, max: maxValue };
//   };

//   const calculateSmartLabelPosition = (
//     d: ChartData,
//     xScale: d3.ScaleBand<string>,
//     yScale: d3.ScaleLinear<number, number>,
//     innerWidth: number,
//     innerHeight: number
//   ) => {
//     const barX = xScale(d.category) || 0;
//     const barY = yScale(d.count);
//     const barWidth = xScale.bandwidth();
//     const barHeight = innerHeight - yScale(d.count);
//     const labelText = `${d.count.toLocaleString()} (${d.percentage.toFixed(
//       1
//     )}%)`;

//     const labelWidth = labelText.length * 8;
//     const labelHeight = 20;
//     const padding = 10;

//     const spaceAbove = barY;
//     const spaceBelow = innerHeight - (barY + barHeight);
//     const spaceRight = innerWidth - (barX + barWidth);
//     const spaceLeft = barX;

//     let labelX: number;
//     let labelY: number;
//     let anchor: string;
//     let baseline: string;

//     if (spaceAbove >= labelHeight + padding) {
//       labelX = barX + barWidth / 2;
//       labelY = barY - padding;
//       anchor = "middle";
//       baseline = "bottom";
//     } else if (spaceRight >= labelWidth + padding) {
//       labelX = barX + barWidth + padding;
//       labelY = barY + barHeight / 2;
//       anchor = "start";
//       baseline = "middle";
//     } else if (spaceLeft >= labelWidth + padding) {
//       labelX = barX - padding;
//       labelY = barY + barHeight / 2;
//       anchor = "end";
//       baseline = "middle";
//     } else {
//       labelX = barX + barWidth / 2;
//       labelY = barY - 2;
//       anchor = "middle";
//       baseline = "bottom";
//     }

//     return {
//       x: labelX,
//       y: labelY,
//       anchor,
//       baseline,
//       connectorStart: {
//         x: barX + barWidth / 2,
//         y: barY + barHeight / 2,
//       },
//       connectorEnd: { x: labelX, y: labelY },
//     };
//   };

//   useEffect(() => {
//     if (!chartRef.current) return;

//     // 최대 레이블 길이 계산
//     const maxLabelChars = Math.max(...data.map((d) => d.category.length));

//     // 동적으로 bottom margin 계산
//     const dynamicBottomMargin = Math.max(70, maxLabelChars * 6 + 20);

//     const margin = {
//       top: 30,
//       right: 150,
//       bottom: dynamicBottomMargin,
//       left: 80,
//     };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     d3.select(chartRef.current).selectAll("*").remove();

//     const svg = d3
//       .select(chartRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .attr("class", "w-full h-full");

//     const g = svg
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const x = d3
//       .scaleBand()
//       .domain(data.map((d) => d.category))
//       .range([0, innerWidth])
//       .padding(0.1);

//     const axisRange = calculateAxisRange(data);
//     const y = d3
//       .scaleLinear()
//       .domain([axisRange.min, axisRange.max])
//       .range([innerHeight, 0]);

//     const colorScale = d3
//       .scaleSequential()
//       .domain([0, axisRange.max])
//       .interpolator(d3.interpolateBlues);

//     // x축 설정
//     const xAxisGroup = g
//       .append("g")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .call(d3.axisBottom(x));

//     // 동적 폰트 크기 계산
//     const barWidth = x.bandwidth();
//     const avgLabelWidth = maxLabelChars * 10; // 예상 평균 픽셀 너비
//     const needsRotation = avgLabelWidth > barWidth * 0.9;

//     // 동적 폰트 크기 설정
//     const fontSize = Math.min(
//       parseInt(chartStyles.axisText.fontSize),
//       Math.max(10, (barWidth / maxLabelChars) * 2)
//     );

//     // x축 레이블 스타일링
//     const xAxisLabels = xAxisGroup.selectAll("text");

//     if (needsRotation) {
//       // 레이블이 길면 회전
//       xAxisLabels
//         .attr("transform", "rotate(-45)")
//         .style("text-anchor", "end")
//         .style("font-size", `${fontSize}px`)
//         .attr("dx", "-0.8em")
//         .attr("dy", "0.15em");
//     } else {
//       // 레이블이 짧으면 수평
//       xAxisLabels
//         .style("text-anchor", "middle")
//         .style("font-size", `${fontSize}px`);
//     }

//     // 레이블이 너무 길면 줄바꿈 적용
//     if (maxLabelChars > 15 && !needsRotation) {
//       xAxisLabels.each(function (d: any) {
//         const text = d3.select(this);
//         const words = d.split(/\s+/);
//         const lineHeight = 1.1;
//         const y = text.attr("y");
//         const dy = parseFloat(text.attr("dy") || "0");

//         text.text(null);

//         let line: string[] = [];
//         let lineNumber = 0;
//         let tspan = text
//           .append("tspan")
//           .attr("x", 0)
//           .attr("y", y)
//           .attr("dy", `${dy}em`);

//         words.forEach((word: string) => {
//           line.push(word);
//           tspan.text(line.join(" "));
//           if (
//             (tspan.node() as SVGTSpanElement).getComputedTextLength() > barWidth
//           ) {
//             line.pop();
//             tspan.text(line.join(" "));
//             line = [word];
//             tspan = text
//               .append("tspan")
//               .attr("x", 0)
//               .attr("y", y)
//               .attr("dy", `${++lineNumber * lineHeight + dy}em`)
//               .text(word);
//           }
//         });
//       });
//     }

//     // 툴팁 추가 (전체 텍스트 표시)
//     xAxisLabels.append("title").text((d: any) => d);

//     const yAxis = g
//       .append("g")
//       .call(d3.axisLeft(y))
//       .selectAll("text")
//       .style("font-size", chartStyles.axisText.fontSize);

//     svg
//       .append("text")
//       .attr("x", width / 2)
//       .attr("y", margin.top / 2)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", "bold")
//       .style("fill", isDarkMode ? "#fff" : "#000")
//       .text(title);

//     const labelContainer = g.append("g").attr("class", "label-container");

//     // 세로 방향 legend 설정
//     const legendWidth = 20;
//     const legendHeight = 200;
//     const legendX = width - margin.right + 40;
//     const legendY = margin.top + 10;

//     const legend = svg
//       .append("g")
//       .attr("transform", `translate(${legendX},${legendY})`);

//     const markerContainer = legend
//       .append("g")
//       .attr("class", "marker-container");

//     const legendScale = d3
//       .scaleLinear()
//       .domain([axisRange.max, 0])
//       .range([0, legendHeight]);

//     const legendGradient = svg
//       .append("defs")
//       .append("linearGradient")
//       .attr("id", `color-gradient-${id}`)
//       .attr("x1", "0%")
//       .attr("y1", "0%")
//       .attr("x2", "0%")
//       .attr("y2", "100%");

//     legendGradient
//       .selectAll("stop")
//       .data(d3.range(0, 1.1, 0.1))
//       .enter()
//       .append("stop")
//       .attr("offset", (d) => `${d * 100}%`)
//       .attr("stop-color", (d) => colorScale(axisRange.max * (1 - d)));

//     legend
//       .append("rect")
//       .attr("width", legendWidth)
//       .attr("height", legendHeight)
//       .style("fill", `url(#color-gradient-${id})`);

//     legend
//       .append("g")
//       .attr("transform", `translate(${legendWidth},0)`)
//       .call(d3.axisRight(legendScale).ticks(5));

//     const bars = g
//       .selectAll(".bar-group")
//       .data(data)
//       .enter()
//       .append("g")
//       .attr("class", "bar-group");

//     bars
//       .append("rect")
//       .attr("x", (d) => x(d.category) || 0)
//       .attr("y", innerHeight)
//       .attr("width", x.bandwidth())
//       .attr("height", 0)
//       .attr("fill", (d) => colorScale(d.count))
//       .transition()
//       .duration(1000)
//       .delay((_, i) => i * 100)
//       .attr("y", (d) => y(d.count))
//       .attr("height", (d) => innerHeight - y(d.count));

//     bars
//       .on("mouseover", function (event, d) {
//         const bar = d3.select(this).select("rect");

//         bar
//           .transition()
//           .duration(200)
//           .attr("filter", "brightness(110%)")
//           .attr("stroke", "#333")
//           .attr("stroke-width", 2);

//         labelContainer.selectAll("*").remove();
//         markerContainer.selectAll("*").remove();

//         const position = calculateSmartLabelPosition(
//           d,
//           x,
//           y,
//           innerWidth,
//           innerHeight
//         );
//         const barColor = colorScale(d.count);
//         const labelText = `${d.count.toLocaleString()} (${d.percentage.toFixed(
//           1
//         )}%)`;

//         const labelGroup = labelContainer.append("g");

//         labelGroup
//           .append("rect")
//           .attr(
//             "x",
//             position.x -
//               (position.anchor === "middle"
//                 ? 50
//                 : position.anchor === "end"
//                 ? 100
//                 : 0)
//           )
//           .attr("y", position.y - (position.baseline === "middle" ? 10 : 20))
//           .attr("width", 100)
//           .attr("height", 20)
//           .attr("fill", "white")
//           .attr("rx", 4)
//           .attr("opacity", 0);

//         // labelGroup
//         //   .append("text")
//         //   .attr("x", position.x)
//         //   .attr("y", position.y)
//         //   .attr("text-anchor", position.anchor)
//         //   .attr("dominant-baseline", position.baseline)
//         //   .style("fill", "#333")
//         //   .style("font-size", chartStyles.value.fontSize)
//         //   .style("font-weight", "bold")
//         //   .text(labelText);

//         labelContainer
//           .append("text")
//           .attr("x", (x(d.category) || 0) + x.bandwidth() / 2)
//           .attr("y", y(d.count) - 5)
//           .attr("text-anchor", "middle")
//           .style("fill", isDarkMode ? "#f3f4f6" : "#1f2937")
//           .style("font-size", "14px")
//           .style("font-weight", "bold")
//           .text(d.count.toLocaleString());

//         // 화살표 마커 추가
//         const markerY = legendScale(d.count);
//         const arrowSize = 6;

//         markerContainer
//           .append("path")
//           .attr(
//             "d",
//             `M-10,${markerY} L0,${markerY} L-5,${
//               markerY - arrowSize
//             } M0,${markerY} L-5,${markerY + arrowSize}`
//           )
//           .style("stroke", isDarkMode ? "#f3f4f6" : "#1f2937")
//           .style("stroke-width", 2)
//           .style("fill", "none");
//       })
//       .on("mouseout", function () {
//         const bar = d3.select(this).select("rect");

//         bar
//           .transition()
//           .duration(200)
//           .attr("filter", null)
//           .attr("stroke", "none");

//         labelContainer.selectAll("*").remove();
//         markerContainer.selectAll("*").remove();
//       });
//   }, [data, width, height, title, id, maxLabelLength, isDarkMode]);

//   return (
//     <div className="w-full h-full">
//       <svg ref={chartRef} id={id} className="w-full h-full" />
//     </div>
//   );
// };

// export default BarChart;

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface ChartData {
  category: string;
  count: number;
  percentage: number;
}

interface BarChartProps {
  data: ChartData[];
  width?: number;
  height?: number;
  title: string;
  id: string;
  maxLabelLength?: number;
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
    fontSize: "18px",
  },
  legend: {
    fontSize: "16px",
  },
  tooltip: {
    fontSize: "14px",
    padding: "8px",
    borderRadius: "4px",
    border: "1px solid #ddd",
    backgroundColor: "white",
    color: "#333",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  value: {
    fontSize: "16px",
  },
};

export const BarChart = ({
  data,
  width = 400,
  height = 400,
  title,
  id,
  maxLabelLength = 15,
  isDarkMode = false,
}: BarChartProps) => {
  const chartRef = useRef<SVGSVGElement | null>(null);

  const calculateAxisRange = (data: ChartData[]) => {
    const maxValue = d3.max(data, (d) => d.count) || 0;
    const minValue = d3.min(data, (d) => d.count) || 0;
    return maxValue === minValue
      ? { min: 0, max: maxValue * 1.5 }
      : { min: 0, max: maxValue };
  };

  const calculateSmartLabelPosition = (
    d: ChartData,
    xScale: d3.ScaleBand<string>,
    yScale: d3.ScaleLinear<number, number>,
    innerWidth: number,
    innerHeight: number
  ) => {
    const barX = xScale(d.category) || 0;
    const barY = yScale(d.count);
    const barWidth = xScale.bandwidth();
    const barHeight = innerHeight - yScale(d.count);
    const labelText = `${d.count.toLocaleString()} (${d.percentage.toFixed(
      1
    )}%)`;

    const labelWidth = labelText.length * 8;
    const labelHeight = 20;
    const padding = 10;

    const spaceAbove = barY;
    const spaceBelow = innerHeight - (barY + barHeight);
    const spaceRight = innerWidth - (barX + barWidth);
    const spaceLeft = barX;

    let labelX: number;
    let labelY: number;
    let anchor: string;
    let baseline: string;

    if (spaceAbove >= labelHeight + padding) {
      labelX = barX + barWidth / 2;
      labelY = barY - padding;
      anchor = "middle";
      baseline = "bottom";
    } else if (spaceRight >= labelWidth + padding) {
      labelX = barX + barWidth + padding;
      labelY = barY + barHeight / 2;
      anchor = "start";
      baseline = "middle";
    } else if (spaceLeft >= labelWidth + padding) {
      labelX = barX - padding;
      labelY = barY + barHeight / 2;
      anchor = "end";
      baseline = "middle";
    } else {
      labelX = barX + barWidth / 2;
      labelY = barY - 2;
      anchor = "middle";
      baseline = "bottom";
    }

    return {
      x: labelX,
      y: labelY,
      anchor,
      baseline,
      connectorStart: {
        x: barX + barWidth / 2,
        y: barY + barHeight / 2,
      },
      connectorEnd: { x: labelX, y: labelY },
    };
  };

  useEffect(() => {
    if (!chartRef.current) return;

    // Modern theme colors
    const primaryColor = isDarkMode ? "#6366F1" : "#3B82F6"; // Indigo/Blue
    const secondaryColor = isDarkMode ? "#8B5CF6" : "#60A5FA"; // Purple/Light Blue
    const textColor = isDarkMode ? "#E5E7EB" : "#374151";
    const axisColor = isDarkMode ? "#4B5563" : "#D1D5DB";
    const backgroundColor = isDarkMode ? "#111827" : "#FFFFFF";

    // 최대 레이블 길이 계산
    const maxLabelChars = Math.max(...data.map((d) => d.category.length));

    // 동적으로 bottom margin 계산
    const dynamicBottomMargin = Math.max(70, maxLabelChars * 6 + 20);

    const margin = {
      top: 30,
      right: 150,
      bottom: dynamicBottomMargin,
      left: 80,
    };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    d3.select(chartRef.current).selectAll("*").remove();

    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("class", "w-full h-full");

    // Create defs for gradient
    const defs = svg.append("defs");

    // Modern gradient for bars
    const barGradient = defs
      .append("linearGradient")
      .attr("id", `bar-gradient-${id}`)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    barGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", secondaryColor)
      .attr("stop-opacity", 1);

    barGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", primaryColor)
      .attr("stop-opacity", 1);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.category))
      .range([0, innerWidth])
      .padding(0.1);

    const axisRange = calculateAxisRange(data);
    const y = d3
      .scaleLinear()
      .domain([axisRange.min, axisRange.max])
      .range([innerHeight, 0]);

    // Modern color scale - single gradient for all bars
    const colorScale = () => `url(#bar-gradient-${id})`;

    // x축 설정
    const xAxisGroup = g
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickSizeOuter(0));

    // Style x-axis
    xAxisGroup.select(".domain").attr("stroke", axisColor);
    xAxisGroup.selectAll(".tick line").attr("stroke", axisColor);

    // 동적 폰트 크기 계산
    const barWidth = x.bandwidth();
    const avgLabelWidth = maxLabelChars * 10; // 예상 평균 픽셀 너비
    const needsRotation = avgLabelWidth > barWidth * 0.9;

    // 동적 폰트 크기 설정
    const fontSize = Math.min(
      parseInt(chartStyles.axisText.fontSize),
      Math.max(10, (barWidth / maxLabelChars) * 2)
    );

    // x축 레이블 스타일링
    const xAxisLabels = xAxisGroup.selectAll("text");

    if (needsRotation) {
      // 레이블이 길면 회전
      xAxisLabels
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end")
        .style("font-size", `${fontSize}px`)
        .style("fill", textColor)
        .attr("dx", "-0.8em")
        .attr("dy", "0.15em");
    } else {
      // 레이블이 짧으면 수평
      xAxisLabels
        .style("text-anchor", "middle")
        .style("font-size", `${fontSize}px`)
        .style("fill", textColor);
    }

    // 레이블이 너무 길면 줄바꿈 적용
    if (maxLabelChars > 15 && !needsRotation) {
      xAxisLabels.each(function (d: any) {
        const text = d3.select(this);
        const words = d.split(/\s+/);
        const lineHeight = 1.1;
        const y = text.attr("y");
        const dy = parseFloat(text.attr("dy") || "0");

        text.text(null);

        let line: string[] = [];
        let lineNumber = 0;
        let tspan = text
          .append("tspan")
          .attr("x", 0)
          .attr("y", y)
          .attr("dy", `${dy}em`);

        words.forEach((word: string) => {
          line.push(word);
          tspan.text(line.join(" "));
          if (
            (tspan.node() as SVGTSpanElement).getComputedTextLength() > barWidth
          ) {
            line.pop();
            tspan.text(line.join(" "));
            line = [word];
            tspan = text
              .append("tspan")
              .attr("x", 0)
              .attr("y", y)
              .attr("dy", `${++lineNumber * lineHeight + dy}em`)
              .text(word);
          }
        });
      });
    }

    // 툴팁 추가 (전체 텍스트 표시)
    xAxisLabels.append("title").text((d: any) => d);

    // const yAxisGroup = g.append("g").call(d3.axisLeft(y).tickSizeOuter(0));

    // Y축에 표시할 tick 값들을 스마트하게 계산
    const yAxisTickValues = (() => {
      const max = Math.ceil(axisRange.max);
      if (max <= 10) {
        // 10 이하: 모든 정수
        return d3.range(0, max + 1);
      } else if (max <= 20) {
        // 20 이하: 2의 배수
        return d3.range(0, max + 1, 2);
      } else if (max <= 50) {
        // 50 이하: 5의 배수
        return d3.range(0, max + 1, 5);
      } else if (max <= 100) {
        // 100 이하: 10의 배수
        return d3.range(0, max + 1, 10);
      } else {
        // 100 초과: 자동으로 적절한 간격 계산
        const step = Math.ceil(max / 10);
        const roundedStep = Math.ceil(step / 10) * 10;
        return d3.range(0, max + 1, roundedStep);
      }
    })();

    const yAxisGroup = g.append("g").call(
      d3
        .axisLeft(y)
        .tickSizeOuter(0)
        .tickValues(yAxisTickValues)
        .tickFormat(d3.format("d")) // 정수로만 표시
    );

    // Style y-axis
    yAxisGroup.select(".domain").attr("stroke", axisColor);
    yAxisGroup.selectAll(".tick line").attr("stroke", axisColor);
    yAxisGroup
      .selectAll("text")
      .style("font-size", chartStyles.axisText.fontSize)
      .style("fill", textColor);

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", margin.top / 2)
      .attr("text-anchor", "middle")
      .style("font-size", chartStyles.title.fontSize)
      .style("font-weight", "bold")
      .style("fill", textColor)
      .text(title);

    const labelContainer = g.append("g").attr("class", "label-container");

    // Modern legend
    const legendWidth = 20;
    const legendHeight = 200;
    const legendX = width - margin.right + 40;
    const legendY = margin.top + 10;

    const legend = svg
      .append("g")
      .attr("transform", `translate(${legendX},${legendY})`);

    const markerContainer = legend
      .append("g")
      .attr("class", "marker-container");

    const legendScale = d3
      .scaleLinear()
      .domain([axisRange.max, 0])
      .range([0, legendHeight]);

    // Modern legend gradient
    const legendGradient = svg
      .append("defs")
      .append("linearGradient")
      .attr("id", `legend-gradient-${id}`)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    legendGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", secondaryColor)
      .attr("stop-opacity", 1);

    legendGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", primaryColor)
      .attr("stop-opacity", 0.3);

    legend
      .append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("rx", 4)
      .attr("ry", 4)
      .style("fill", `url(#legend-gradient-${id})`);

    const legendAxisGroup = legend
      .append("g")
      .attr("transform", `translate(${legendWidth},0)`)
      .call(d3.axisRight(legendScale).ticks(5).tickSizeOuter(0));

    legendAxisGroup.select(".domain").attr("stroke", axisColor);
    legendAxisGroup.selectAll(".tick line").attr("stroke", axisColor);
    legendAxisGroup.selectAll("text").style("fill", textColor);

    const bars = g
      .selectAll(".bar-group")
      .data(data)
      .enter()
      .append("g")
      .attr("class", "bar-group");

    bars
      .append("rect")
      .attr("x", (d) => x(d.category) || 0)
      .attr("y", innerHeight)
      .attr("width", x.bandwidth())
      .attr("height", 0)
      .attr("fill", colorScale())
      .attr("rx", 4)
      .attr("ry", 4)
      .style("opacity", 0.9)
      .transition()
      .duration(1000)
      .delay((_, i) => i * 100)
      .attr("y", (d) => y(d.count))
      .attr("height", (d) => innerHeight - y(d.count));

    bars
      .on("mouseover", function (event, d) {
        const bar = d3.select(this).select("rect");

        bar
          .transition()
          .duration(200)
          .style("opacity", 1)
          .attr("stroke", primaryColor)
          .attr("stroke-width", 2);

        labelContainer.selectAll("*").remove();
        markerContainer.selectAll("*").remove();

        const position = calculateSmartLabelPosition(
          d,
          x,
          y,
          innerWidth,
          innerHeight
        );
        const labelText = `${d.count.toLocaleString()} (${d.percentage.toFixed(
          1
        )}%)`;

        const labelGroup = labelContainer.append("g");

        labelGroup
          .append("rect")
          .attr(
            "x",
            position.x -
              (position.anchor === "middle"
                ? 50
                : position.anchor === "end"
                ? 100
                : 0)
          )
          .attr("y", position.y - (position.baseline === "middle" ? 10 : 20))
          .attr("width", 100)
          .attr("height", 20)
          .attr("fill", "white")
          .attr("rx", 4)
          .attr("opacity", 0);

        labelContainer
          .append("text")
          .attr("x", (x(d.category) || 0) + x.bandwidth() / 2)
          .attr("y", y(d.count) - 5)
          .attr("text-anchor", "middle")
          .style("fill", textColor)
          .style("font-size", "14px")
          .style("font-weight", "600")
          .text(d.count.toLocaleString());

        // 화살표 마커 추가
        const markerY = legendScale(d.count);
        const arrowSize = 6;

        markerContainer
          .append("path")
          .attr(
            "d",
            `M-10,${markerY} L0,${markerY} L-5,${
              markerY - arrowSize
            } M0,${markerY} L-5,${markerY + arrowSize}`
          )
          .style("stroke", isDarkMode ? "#E5E7EB" : "#374151")
          .style("stroke-width", 2)
          .style("fill", "none");
      })
      .on("mouseout", function () {
        const bar = d3.select(this).select("rect");

        bar
          .transition()
          .duration(200)
          .style("opacity", 0.9)
          .attr("stroke", "none");

        labelContainer.selectAll("*").remove();
        markerContainer.selectAll("*").remove();
      });
  }, [data, width, height, title, id, maxLabelLength, isDarkMode]);

  return (
    <div className="w-full h-full">
      <svg ref={chartRef} id={id} className="w-full h-full" />
    </div>
  );
};

export default BarChart;
